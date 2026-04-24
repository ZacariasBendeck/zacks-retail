import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../db/prisma';
import { Prisma } from '../../prismaClient';
import {
  CustomerCsvRow,
  MailListNamesCsvRow,
  deriveHonduranIdCandidate,
  isValidEmail,
  mapImportedStatus,
  normalizeEmail,
  normalizeImportText,
  parseCustomerCsv,
  parseImportedBoolean,
  parseImportedDate,
  parseImportedDecimal,
  parseImportedInteger,
  parseMailListNamesCsv,
} from './customerImportCsv';

type Tx = Prisma.TransactionClient;

type ImportedCustomer = Prisma.CustomerIntelligenceCustomerGetPayload<{
  include: {
    identities: true;
    contacts: true;
    addresses: true;
    legacyProfile: true;
    financialProfile: true;
    salesSummaryLegacy: true;
  };
}>;

interface RowRef<T> {
  row: T;
  rowNumber: number;
}

interface CandidateProfileData {
  customerExtra01: string | null;
  customerExtra02: string | null;
  customerExtra03: string | null;
  customerExtra04: string | null;
  customerExtra05: string | null;
  customerExtra06: string | null;
  mailExtra01: string | null;
  mailExtra02: string | null;
  mailExtra03: string | null;
  mailExtra04: string | null;
  mailExtra05: string | null;
  mailExtra06: string | null;
  customerComment: string | null;
  mailComment: string | null;
  changeTo: string | null;
}

interface CandidateFinancialData {
  creditLimit: string | null;
  currentBalance: string | null;
  creditSlipBalance: string | null;
  nonTaxable: boolean | null;
  planNum: number | null;
  planCount: number | null;
  planDollars: string | null;
  planLastCreditAt: Date | null;
  planCreditBalance: string | null;
}

interface CandidateSalesSummaryData {
  dateLastPurchase: Date | null;
  qtySales01: number | null;
  qtySales02: number | null;
  qtySales03: number | null;
  qtySales04: number | null;
  dollarSales01: string | null;
  dollarSales02: string | null;
  dollarSales03: string | null;
  dollarSales04: string | null;
}

interface CustomerImportCandidate {
  sourceFile: string;
  rowNumber: number;
  rawRow: Record<string, unknown>;
  customerRow: CustomerCsvRow | null;
  mailRow: MailListNamesCsvRow | null;
  account: string | null;
  code: string | null;
  fullName: string | null;
  gender: string | null;
  birthDate: Date | null;
  statusRaw: string | null;
  status: string;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  ricsDateAdded: Date | null;
  ricsDateLastChanged: Date | null;
  honduranIdRaw: string | null;
  honduranIdNormalized: string | null;
  honduranIdConflict: boolean;
  emailRaw: string | null;
  emailNormalized: string | null;
  address: {
    addr1: string | null;
    addr2: string | null;
    city: string | null;
    state: string | null;
    county: string | null;
    zip: string | null;
  };
  legacyProfile: CandidateProfileData;
  financialProfile: CandidateFinancialData;
  salesSummaryLegacy: CandidateSalesSummaryData;
}

export interface ImportCustomerCsvInput {
  customerCsvText: string;
  mailListNamesCsvText: string;
  customerFileName?: string;
  mailListNamesFileName?: string;
  source?: string;
}

export interface ImportCustomerCsvFilesInput {
  customerCsvPath: string;
  mailListNamesCsvPath: string;
  source?: string;
}

export interface CustomerImportSummary {
  batchId: string;
  source: string;
  fileName: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  rejectedCount: number;
}

export async function importCustomerCsvFiles(
  input: ImportCustomerCsvFilesInput,
): Promise<CustomerImportSummary> {
  const [customerCsvText, mailListNamesCsvText] = await Promise.all([
    fs.readFile(input.customerCsvPath, 'utf8'),
    fs.readFile(input.mailListNamesCsvPath, 'utf8'),
  ]);

  return importCustomerCsv({
    customerCsvText,
    mailListNamesCsvText,
    customerFileName: path.basename(input.customerCsvPath),
    mailListNamesFileName: path.basename(input.mailListNamesCsvPath),
    source: input.source,
  });
}

export async function importCustomerCsv(
  input: ImportCustomerCsvInput,
): Promise<CustomerImportSummary> {
  const customerRows = parseCustomerCsv(input.customerCsvText);
  const mailRows = parseMailListNamesCsv(input.mailListNamesCsvText);
  const customerFileName = input.customerFileName ?? 'Customer.csv';
  const mailFileName = input.mailListNamesFileName ?? 'MailListNames.csv';
  const source = input.source ?? 'rics_csv';
  const candidates = buildImportCandidates({
    customerRows,
    mailRows,
    customerFileName,
    mailFileName,
  });
  const fileName = `${customerFileName} + ${mailFileName}`;

  return prisma.$transaction(async (tx) => {
    const batch = await tx.customerImportBatch.create({
      data: {
        source,
        fileName,
      },
    });

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let rejectedCount = 0;

    for (const candidate of candidates) {
      const rejectReason = validateCandidate(candidate);
      if (rejectReason) {
        await insertReject(tx, batch.id, candidate, rejectReason);
        rejectedCount += 1;
        continue;
      }

      const existing = await matchExistingCustomer(tx, candidate);
      const conflict = await detectIdentityConflict(tx, candidate, existing);
      if (conflict) {
        await insertReject(tx, batch.id, candidate, conflict);
        rejectedCount += 1;
        continue;
      }

      const outcome = existing
        ? await updateImportedCustomer(tx, existing, candidate, batch.id, source)
        : await createImportedCustomer(tx, candidate, batch.id, source);

      if (outcome === 'created') createdCount += 1;
      else if (outcome === 'updated') updatedCount += 1;
      else skippedCount += 1;
    }

    await tx.customerImportBatch.update({
      where: { id: batch.id },
      data: {
        finishedAt: new Date(),
        totalRows: candidates.length,
        createdCount,
        updatedCount,
        skippedCount,
        rejectedCount,
      },
    });

    return {
      batchId: batch.id,
      source,
      fileName,
      totalRows: candidates.length,
      createdCount,
      updatedCount,
      skippedCount,
      rejectedCount,
    };
  });
}

function buildImportCandidates(input: {
  customerRows: CustomerCsvRow[];
  mailRows: MailListNamesCsvRow[];
  customerFileName: string;
  mailFileName: string;
}): CustomerImportCandidate[] {
  const mailByAccount = new Map<string, RowRef<MailListNamesCsvRow>[]>();
  const consumedMailRows = new Set<number>();

  input.mailRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const account = normalizeImportText(row.Account);
    if (!account) return;
    const bucket = mailByAccount.get(account) ?? [];
    bucket.push({ row, rowNumber });
    mailByAccount.set(account, bucket);
  });

  const candidates: CustomerImportCandidate[] = [];

  input.customerRows.forEach((customerRow, index) => {
    const account = normalizeImportText(customerRow.Account);
    const bucket = account ? mailByAccount.get(account) : null;
    const mailRef = bucket && bucket.length > 0 ? bucket.shift() ?? null : null;
    if (mailRef) consumedMailRows.add(mailRef.rowNumber);
    candidates.push(
      makeCandidate({
        customerRow,
        customerRowNumber: index + 2,
        customerFileName: input.customerFileName,
        mailRow: mailRef?.row ?? null,
        mailRowNumber: mailRef?.rowNumber ?? null,
      }),
    );
  });

  input.mailRows.forEach((mailRow, index) => {
    const rowNumber = index + 2;
    if (consumedMailRows.has(rowNumber)) return;
    candidates.push(
      makeCandidate({
        customerRow: null,
        customerRowNumber: null,
        customerFileName: input.customerFileName,
        mailRow,
        mailRowNumber: rowNumber,
        mailFileName: input.mailFileName,
      }),
    );
  });

  return candidates;
}

function makeCandidate(input: {
  customerRow: CustomerCsvRow | null;
  customerRowNumber: number | null;
  customerFileName: string;
  mailRow: MailListNamesCsvRow | null;
  mailRowNumber: number | null;
  mailFileName?: string;
}): CustomerImportCandidate {
  const customerRow = input.customerRow;
  const mailRow = input.mailRow;
  const account = normalizeImportText(customerRow?.Account ?? mailRow?.Account ?? null);
  const code = normalizeImportText(customerRow?.Code ?? null);
  const fullName = normalizeImportText(customerRow?.Name ?? mailRow?.Name ?? null);
  const statusRaw = normalizeImportText(customerRow?.Status ?? mailRow?.Status ?? null);
  const ricsDateAdded = parseImportedDate(customerRow?.DateAdded ?? mailRow?.DateAdded ?? null);
  const ricsDateLastChanged = parseImportedDate(
    customerRow?.DateLastChanged ?? mailRow?.DateLastChanged ?? null,
  );
  const honduranId = deriveHonduranIdCandidate(account, code);
  const emailRaw = normalizeImportText(mailRow?.EMail ?? null);
  const emailNormalized = normalizeEmail(mailRow?.EMail ?? null);
  const sourceFile = customerRow ? input.customerFileName : input.mailFileName ?? 'MailListNames.csv';
  const rowNumber = customerRow ? input.customerRowNumber ?? 0 : input.mailRowNumber ?? 0;

  return {
    sourceFile,
    rowNumber,
    rawRow: {
      customer: customerRow,
      mailListNames: mailRow,
    },
    customerRow,
    mailRow,
    account,
    code,
    fullName,
    gender: normalizeImportText(customerRow?.Gender ?? null),
    birthDate: parseImportedDate(customerRow?.Birthday ?? null),
    statusRaw,
    status: mapImportedStatus(statusRaw),
    firstSeenAt: ricsDateAdded,
    lastSeenAt: ricsDateLastChanged ?? ricsDateAdded,
    ricsDateAdded,
    ricsDateLastChanged,
    honduranIdRaw: honduranId.raw,
    honduranIdNormalized: honduranId.normalized,
    honduranIdConflict: honduranId.conflict,
    emailRaw,
    emailNormalized,
    address: {
      addr1: normalizeImportText(mailRow?.Addr1 ?? null),
      addr2: normalizeImportText(mailRow?.Addr2 ?? null),
      city: normalizeImportText(mailRow?.City ?? null),
      state: normalizeImportText(mailRow?.State ?? null),
      county: normalizeImportText(mailRow?.County ?? null),
      zip: normalizeImportText(mailRow?.Zip ?? null),
    },
    legacyProfile: {
      customerExtra01: normalizeImportText(customerRow?.Extra_01 ?? null),
      customerExtra02: normalizeImportText(customerRow?.Extra_02 ?? null),
      customerExtra03: normalizeImportText(customerRow?.Extra_03 ?? null),
      customerExtra04: normalizeImportText(customerRow?.Extra_04 ?? null),
      customerExtra05: normalizeImportText(customerRow?.Extra_05 ?? null),
      customerExtra06: normalizeImportText(customerRow?.Extra_06 ?? null),
      mailExtra01: normalizeImportText(mailRow?.Extra_01 ?? null),
      mailExtra02: normalizeImportText(mailRow?.Extra_02 ?? null),
      mailExtra03: normalizeImportText(mailRow?.Extra_03 ?? null),
      mailExtra04: normalizeImportText(mailRow?.Extra_04 ?? null),
      mailExtra05: normalizeImportText(mailRow?.Extra_05 ?? null),
      mailExtra06: normalizeImportText(mailRow?.Extra_06 ?? null),
      customerComment: normalizeImportText(customerRow?.Comment ?? null),
      mailComment: normalizeImportText(mailRow?.Comment ?? null),
      changeTo: normalizeImportText(mailRow?.ChangeTo ?? null),
    },
    financialProfile: {
      creditLimit: parseImportedDecimal(mailRow?.CreditLimit ?? null),
      currentBalance: parseImportedDecimal(mailRow?.CurrBal ?? null),
      creditSlipBalance: parseImportedDecimal(mailRow?.CredSlip ?? null),
      nonTaxable: parseImportedBoolean(mailRow?.NonTaxable ?? null),
      planNum: parseImportedInteger(mailRow?.PlanNum ?? null),
      planCount: parseImportedInteger(mailRow?.PlanCount ?? null),
      planDollars: parseImportedDecimal(mailRow?.PlanDollars ?? null),
      planLastCreditAt: parseImportedDate(mailRow?.PlanLastCred ?? null),
      planCreditBalance: parseImportedDecimal(mailRow?.PlanCredBal ?? null),
    },
    salesSummaryLegacy: {
      dateLastPurchase: parseImportedDate(mailRow?.DateLstPurch ?? null),
      qtySales01: parseImportedInteger(mailRow?.QtySales_01 ?? null),
      qtySales02: parseImportedInteger(mailRow?.QtySales_02 ?? null),
      qtySales03: parseImportedInteger(mailRow?.QtySales_03 ?? null),
      qtySales04: parseImportedInteger(mailRow?.QtySales_04 ?? null),
      dollarSales01: parseImportedDecimal(mailRow?.DollarSales_01 ?? null),
      dollarSales02: parseImportedDecimal(mailRow?.DollarSales_02 ?? null),
      dollarSales03: parseImportedDecimal(mailRow?.DollarSales_03 ?? null),
      dollarSales04: parseImportedDecimal(mailRow?.DollarSales_04 ?? null),
    },
  };
}

function validateCandidate(candidate: CustomerImportCandidate): string | null {
  if (candidate.honduranIdConflict) return 'conflicting_honduran_id';

  if (isBlankCandidate(candidate)) return 'blank_row';

  if (candidate.emailRaw && !isValidEmail(candidate.emailRaw)) {
    return 'invalid_email';
  }

  if (!hasUsableIdentifier(candidate)) return 'missing_identifier';

  return null;
}

function isBlankCandidate(candidate: CustomerImportCandidate): boolean {
  return !Object.values(candidate.rawRow).some((row) => hasMeaningfulValues(row));
}

function hasMeaningfulValues(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== 'object') return normalizeImportText(String(value)) !== null;
  return Object.values(value as Record<string, unknown>).some((entry) => {
    if (entry == null) return false;
    return normalizeImportText(String(entry)) !== null;
  });
}

function hasUsableIdentifier(candidate: CustomerImportCandidate): boolean {
  return Boolean(
    candidate.account ||
      candidate.code ||
      candidate.honduranIdNormalized ||
      candidate.emailNormalized,
  );
}

async function matchExistingCustomer(
  tx: Tx,
  candidate: CustomerImportCandidate,
): Promise<ImportedCustomer | null> {
  if (candidate.honduranIdNormalized) {
    const byHonduranId = await tx.customerIntelligenceCustomer.findUnique({
      where: { honduranIdNormalized: candidate.honduranIdNormalized },
      include: importedCustomerInclude(),
    });
    if (byHonduranId) return byHonduranId;
  }

  if (candidate.account) {
    const byAccount = await tx.customerIntelligenceCustomer.findUnique({
      where: { ricsAccount: candidate.account },
      include: importedCustomerInclude(),
    });
    if (byAccount) return byAccount;
  }

  if (candidate.code) {
    const byCode = await tx.customerIntelligenceCustomer.findUnique({
      where: { ricsCode: candidate.code },
      include: importedCustomerInclude(),
    });
    if (byCode) return byCode;
  }

  if (candidate.emailNormalized) {
    const identity = await tx.customerIdentity.findUnique({
      where: {
        identityType_normalizedValue: {
          identityType: 'email',
          normalizedValue: candidate.emailNormalized,
        },
      },
      select: { customerId: true },
    });
    if (identity) {
      return tx.customerIntelligenceCustomer.findUnique({
        where: { id: identity.customerId },
        include: importedCustomerInclude(),
      });
    }
  }

  return null;
}

async function detectIdentityConflict(
  tx: Tx,
  candidate: CustomerImportCandidate,
  existing: ImportedCustomer | null,
): Promise<string | null> {
  if (candidate.honduranIdNormalized) {
    if (existing?.honduranIdNormalized && existing.honduranIdNormalized !== candidate.honduranIdNormalized) {
      return 'conflicting_honduran_id';
    }

    const honduranOwner = await tx.customerIntelligenceCustomer.findUnique({
      where: { honduranIdNormalized: candidate.honduranIdNormalized },
      select: { id: true },
    });
    if (honduranOwner && existing && honduranOwner.id !== existing.id) {
      return 'conflicting_honduran_id';
    }
  }

  const owners = await Promise.all([
    candidate.account
      ? resolveIdentityOwner(tx, 'rics_account', candidate.account)
      : Promise.resolve(null),
    candidate.code ? resolveIdentityOwner(tx, 'rics_code', candidate.code) : Promise.resolve(null),
    candidate.emailNormalized
      ? resolveIdentityOwner(tx, 'email', candidate.emailNormalized)
      : Promise.resolve(null),
  ]);

  const conflictOwner = owners.find((owner) => owner && owner.id !== existing?.id) ?? null;
  if (!conflictOwner) return null;

  if (
    candidate.honduranIdNormalized &&
    conflictOwner.honduranIdNormalized &&
    conflictOwner.honduranIdNormalized !== candidate.honduranIdNormalized
  ) {
    return 'duplicate_identity_conflict';
  }

  if (
    existing?.honduranIdNormalized &&
    conflictOwner.honduranIdNormalized &&
    conflictOwner.honduranIdNormalized !== existing.honduranIdNormalized
  ) {
    return 'duplicate_identity_conflict';
  }

  return 'duplicate_identity_conflict';
}

async function resolveIdentityOwner(
  tx: Tx,
  identityType: 'rics_account' | 'rics_code' | 'email',
  normalizedValue: string,
): Promise<{ id: string; honduranIdNormalized: string | null } | null> {
  if (identityType === 'rics_account') {
    return tx.customerIntelligenceCustomer.findUnique({
      where: { ricsAccount: normalizedValue },
      select: { id: true, honduranIdNormalized: true },
    });
  }

  if (identityType === 'rics_code') {
    return tx.customerIntelligenceCustomer.findUnique({
      where: { ricsCode: normalizedValue },
      select: { id: true, honduranIdNormalized: true },
    });
  }

  const identity = await tx.customerIdentity.findUnique({
    where: {
      identityType_normalizedValue: {
        identityType,
        normalizedValue,
      },
    },
    select: {
      customer: {
        select: {
          id: true,
          honduranIdNormalized: true,
        },
      },
    },
  });
  return identity?.customer ?? null;
}

async function createImportedCustomer(
  tx: Tx,
  candidate: CustomerImportCandidate,
  batchId: string,
  source: string,
): Promise<'created'> {
  const customer = await tx.customerIntelligenceCustomer.create({
    data: {
      honduranIdRaw: candidate.honduranIdRaw,
      honduranIdNormalized: candidate.honduranIdNormalized,
      fullName: candidate.fullName,
      gender: candidate.gender,
      birthDate: candidate.birthDate,
      status: candidate.status,
      source,
      firstSeenAt: candidate.firstSeenAt,
      lastSeenAt: candidate.lastSeenAt,
      importedFromBatchId: batchId,
      ricsAccount: candidate.account,
      ricsCode: candidate.code,
      ricsDateAdded: candidate.ricsDateAdded,
      ricsDateLastChanged: candidate.ricsDateLastChanged,
    },
    include: importedCustomerInclude(),
  });

  await ensureRelatedRows(tx, customer, candidate, source);
  return 'created';
}

async function updateImportedCustomer(
  tx: Tx,
  existing: ImportedCustomer,
  candidate: CustomerImportCandidate,
  batchId: string,
  source: string,
): Promise<'updated' | 'skipped'> {
  let changed = false;
  const customerPatch: Prisma.CustomerIntelligenceCustomerUpdateInput = {};

  assignIfMissing(customerPatch, 'honduranIdRaw', existing.honduranIdRaw, candidate.honduranIdRaw);
  assignIfMissing(
    customerPatch,
    'honduranIdNormalized',
    existing.honduranIdNormalized,
    candidate.honduranIdNormalized,
  );
  assignIfMissing(customerPatch, 'fullName', existing.fullName, candidate.fullName);
  assignIfMissing(customerPatch, 'gender', existing.gender, candidate.gender);
  if (!existing.birthDate && candidate.birthDate) customerPatch.birthDate = candidate.birthDate;
  assignIfMissing(customerPatch, 'ricsAccount', existing.ricsAccount, candidate.account);
  assignIfMissing(customerPatch, 'ricsCode', existing.ricsCode, candidate.code);
  if (!existing.importedFromBatchId) {
    customerPatch.importedFromBatch = { connect: { id: batchId } };
  }

  if (candidate.statusRaw && existing.status !== candidate.status) {
    customerPatch.status = candidate.status;
  }

  const firstSeenAt = minDate(existing.firstSeenAt, candidate.firstSeenAt);
  if (dateChanged(existing.firstSeenAt, firstSeenAt)) customerPatch.firstSeenAt = firstSeenAt;

  const lastSeenAt = maxDate(existing.lastSeenAt, candidate.lastSeenAt);
  if (dateChanged(existing.lastSeenAt, lastSeenAt)) customerPatch.lastSeenAt = lastSeenAt;

  const ricsDateAdded = minDate(existing.ricsDateAdded, candidate.ricsDateAdded);
  if (dateChanged(existing.ricsDateAdded, ricsDateAdded)) customerPatch.ricsDateAdded = ricsDateAdded;

  const ricsDateLastChanged = maxDate(
    existing.ricsDateLastChanged,
    candidate.ricsDateLastChanged,
  );
  if (dateChanged(existing.ricsDateLastChanged, ricsDateLastChanged)) {
    customerPatch.ricsDateLastChanged = ricsDateLastChanged;
  }

  if (Object.keys(customerPatch).length > 0) {
    await tx.customerIntelligenceCustomer.update({
      where: { id: existing.id },
      data: customerPatch,
    });
    changed = true;
  }

  const refreshed = changed
    ? await tx.customerIntelligenceCustomer.findUniqueOrThrow({
        where: { id: existing.id },
        include: importedCustomerInclude(),
      })
    : existing;

  if (await ensureRelatedRows(tx, refreshed, candidate, source)) {
    changed = true;
  }

  return changed ? 'updated' : 'skipped';
}

function assignIfMissing<T extends Record<string, unknown>, K extends keyof T>(
  target: T,
  key: K,
  existing: unknown,
  next: unknown,
): void {
  if (existing == null && next != null) {
    target[key] = next as T[K];
  }
}

async function ensureRelatedRows(
  tx: Tx,
  customer: ImportedCustomer,
  candidate: CustomerImportCandidate,
  source: string,
): Promise<boolean> {
  let changed = false;

  if (
    await ensureIdentityRow(
      tx,
      customer.id,
      'honduran_id',
      candidate.honduranIdRaw,
      candidate.honduranIdNormalized,
      true,
      source,
    )
  ) {
    changed = true;
  }

  if (
    await ensureIdentityRow(
      tx,
      customer.id,
      'rics_account',
      candidate.account,
      candidate.account,
      false,
      source,
    )
  ) {
    changed = true;
  }

  if (
    await ensureIdentityRow(tx, customer.id, 'rics_code', candidate.code, candidate.code, false, source)
  ) {
    changed = true;
  }

  if (
    await ensureIdentityRow(
      tx,
      customer.id,
      'email',
      candidate.emailRaw,
      candidate.emailNormalized,
      false,
      source,
    )
  ) {
    changed = true;
  }

  if (await ensureEmailContact(tx, customer.id, candidate, source)) {
    changed = true;
  }

  if (await ensureAddress(tx, customer.id, candidate, source)) {
    changed = true;
  }

  if (await ensureLegacyProfile(tx, customer.id, candidate)) {
    changed = true;
  }

  if (await ensureFinancialProfile(tx, customer.id, candidate)) {
    changed = true;
  }

  if (await ensureSalesSummaryLegacy(tx, customer.id, candidate)) {
    changed = true;
  }

  return changed;
}

async function ensureIdentityRow(
  tx: Tx,
  customerId: string,
  identityType: string,
  identityValue: string | null,
  normalizedValue: string | null,
  isPrimary: boolean,
  source: string,
): Promise<boolean> {
  if (!identityValue || !normalizedValue) return false;

  const existing = await tx.customerIdentity.findUnique({
    where: {
      identityType_normalizedValue: {
        identityType,
        normalizedValue,
      },
    },
  });

  if (!existing) {
    await tx.customerIdentity.create({
      data: {
        customerId,
        identityType,
        identityValue,
        normalizedValue,
        source,
        isPrimary,
      },
    });
    return true;
  }

  if (existing.customerId !== customerId) {
    throw new Error(`Identity ${identityType}:${normalizedValue} already belongs to another customer.`);
  }

  if (existing.identityValue !== identityValue || existing.isPrimary !== isPrimary) {
    await tx.customerIdentity.update({
      where: { id: existing.id },
      data: {
        identityValue,
        isPrimary,
      },
    });
    return true;
  }

  return false;
}

async function ensureEmailContact(
  tx: Tx,
  customerId: string,
  candidate: CustomerImportCandidate,
  source: string,
): Promise<boolean> {
  if (!candidate.emailRaw || !candidate.emailNormalized) return false;

  const existing = await tx.customerContact.findFirst({
    where: {
      customerId,
      contactType: 'email',
      normalizedValue: candidate.emailNormalized,
    },
  });
  const primaryExists = await tx.customerContact.findFirst({
    where: {
      customerId,
      contactType: 'email',
      isPrimary: true,
    },
    select: { id: true },
  });
  const shouldBePrimary = !primaryExists;

  if (!existing) {
    await tx.customerContact.create({
      data: {
        customerId,
        contactType: 'email',
        value: candidate.emailRaw,
        normalizedValue: candidate.emailNormalized,
        isPrimary: shouldBePrimary,
        isVerified: false,
        acceptsMarketing: false,
        source,
      },
    });
    return true;
  }

  if (existing.value !== candidate.emailRaw || existing.isPrimary !== shouldBePrimary) {
    await tx.customerContact.update({
      where: { id: existing.id },
      data: {
        value: candidate.emailRaw,
        isPrimary: shouldBePrimary,
      },
    });
    return true;
  }

  return false;
}

async function ensureAddress(
  tx: Tx,
  customerId: string,
  candidate: CustomerImportCandidate,
  source: string,
): Promise<boolean> {
  if (!hasAddress(candidate)) return false;

  const existing = await tx.customerAddress.findFirst({
    where: { customerId, source },
    orderBy: { createdAt: 'asc' },
  });
  const patch = {
    addr1: candidate.address.addr1,
    addr2: candidate.address.addr2,
    city: candidate.address.city,
    state: candidate.address.state,
    county: candidate.address.county,
    zip: candidate.address.zip,
    country: 'HN',
    source,
  };

  if (!existing) {
    await tx.customerAddress.create({
      data: {
        customerId,
        ...patch,
      },
    });
    return true;
  }

  const changed =
    existing.addr1 !== patch.addr1 ||
    existing.addr2 !== patch.addr2 ||
    existing.city !== patch.city ||
    existing.state !== patch.state ||
    existing.county !== patch.county ||
    existing.zip !== patch.zip ||
    existing.country !== patch.country;

  if (!changed) return false;

  await tx.customerAddress.update({
    where: { id: existing.id },
    data: patch,
  });
  return true;
}

async function ensureLegacyProfile(
  tx: Tx,
  customerId: string,
  candidate: CustomerImportCandidate,
): Promise<boolean> {
  if (!hasLegacyProfile(candidate.legacyProfile)) return false;

  const existing = await tx.customerLegacyProfile.findUnique({
    where: { customerId },
  });

  if (!existing) {
    await tx.customerLegacyProfile.create({
      data: {
        customerId,
        ...candidate.legacyProfile,
      },
    });
    return true;
  }

  const patch: Prisma.CustomerLegacyProfileUpdateInput = {};
  mergeTextField(patch, 'customerExtra01', existing.customerExtra01, candidate.legacyProfile.customerExtra01);
  mergeTextField(patch, 'customerExtra02', existing.customerExtra02, candidate.legacyProfile.customerExtra02);
  mergeTextField(patch, 'customerExtra03', existing.customerExtra03, candidate.legacyProfile.customerExtra03);
  mergeTextField(patch, 'customerExtra04', existing.customerExtra04, candidate.legacyProfile.customerExtra04);
  mergeTextField(patch, 'customerExtra05', existing.customerExtra05, candidate.legacyProfile.customerExtra05);
  mergeTextField(patch, 'customerExtra06', existing.customerExtra06, candidate.legacyProfile.customerExtra06);
  mergeTextField(patch, 'mailExtra01', existing.mailExtra01, candidate.legacyProfile.mailExtra01);
  mergeTextField(patch, 'mailExtra02', existing.mailExtra02, candidate.legacyProfile.mailExtra02);
  mergeTextField(patch, 'mailExtra03', existing.mailExtra03, candidate.legacyProfile.mailExtra03);
  mergeTextField(patch, 'mailExtra04', existing.mailExtra04, candidate.legacyProfile.mailExtra04);
  mergeTextField(patch, 'mailExtra05', existing.mailExtra05, candidate.legacyProfile.mailExtra05);
  mergeTextField(patch, 'mailExtra06', existing.mailExtra06, candidate.legacyProfile.mailExtra06);
  mergeTextField(
    patch,
    'customerComment',
    existing.customerComment,
    candidate.legacyProfile.customerComment,
  );
  mergeTextField(patch, 'mailComment', existing.mailComment, candidate.legacyProfile.mailComment);
  mergeTextField(patch, 'changeTo', existing.changeTo, candidate.legacyProfile.changeTo);

  if (Object.keys(patch).length === 0) return false;

  await tx.customerLegacyProfile.update({
    where: { customerId },
    data: patch,
  });
  return true;
}

async function ensureFinancialProfile(
  tx: Tx,
  customerId: string,
  candidate: CustomerImportCandidate,
): Promise<boolean> {
  if (!hasFinancialProfile(candidate.financialProfile)) return false;

  const existing = await tx.customerFinancialProfile.findUnique({
    where: { customerId },
  });

  if (!existing) {
    await tx.customerFinancialProfile.create({
      data: {
        customerId,
        creditLimit: candidate.financialProfile.creditLimit,
        currentBalance: candidate.financialProfile.currentBalance,
        creditSlipBalance: candidate.financialProfile.creditSlipBalance,
        nonTaxable: candidate.financialProfile.nonTaxable ?? false,
        planNum: candidate.financialProfile.planNum,
        planCount: candidate.financialProfile.planCount,
        planDollars: candidate.financialProfile.planDollars,
        planLastCreditAt: candidate.financialProfile.planLastCreditAt,
        planCreditBalance: candidate.financialProfile.planCreditBalance,
      },
    });
    return true;
  }

  const patch: Prisma.CustomerFinancialProfileUpdateInput = {};
  mergeDecimalField(patch, 'creditLimit', existing.creditLimit, candidate.financialProfile.creditLimit);
  mergeDecimalField(
    patch,
    'currentBalance',
    existing.currentBalance,
    candidate.financialProfile.currentBalance,
  );
  mergeDecimalField(
    patch,
    'creditSlipBalance',
    existing.creditSlipBalance,
    candidate.financialProfile.creditSlipBalance,
  );
  mergeBooleanField(
    patch,
    'nonTaxable',
    existing.nonTaxable,
    candidate.financialProfile.nonTaxable,
  );
  mergeNumberField(patch, 'planNum', existing.planNum, candidate.financialProfile.planNum);
  mergeNumberField(patch, 'planCount', existing.planCount, candidate.financialProfile.planCount);
  mergeDecimalField(
    patch,
    'planDollars',
    existing.planDollars,
    candidate.financialProfile.planDollars,
  );
  mergeDateField(
    patch,
    'planLastCreditAt',
    existing.planLastCreditAt,
    candidate.financialProfile.planLastCreditAt,
  );
  mergeDecimalField(
    patch,
    'planCreditBalance',
    existing.planCreditBalance,
    candidate.financialProfile.planCreditBalance,
  );

  if (Object.keys(patch).length === 0) return false;

  await tx.customerFinancialProfile.update({
    where: { customerId },
    data: patch,
  });
  return true;
}

async function ensureSalesSummaryLegacy(
  tx: Tx,
  customerId: string,
  candidate: CustomerImportCandidate,
): Promise<boolean> {
  if (!hasSalesSummary(candidate.salesSummaryLegacy)) return false;

  const existing = await tx.customerSalesSummaryLegacy.findUnique({
    where: { customerId },
  });

  if (!existing) {
    await tx.customerSalesSummaryLegacy.create({
      data: {
        customerId,
        dateLastPurchase: candidate.salesSummaryLegacy.dateLastPurchase,
        qtySales01: candidate.salesSummaryLegacy.qtySales01,
        qtySales02: candidate.salesSummaryLegacy.qtySales02,
        qtySales03: candidate.salesSummaryLegacy.qtySales03,
        qtySales04: candidate.salesSummaryLegacy.qtySales04,
        dollarSales01: candidate.salesSummaryLegacy.dollarSales01,
        dollarSales02: candidate.salesSummaryLegacy.dollarSales02,
        dollarSales03: candidate.salesSummaryLegacy.dollarSales03,
        dollarSales04: candidate.salesSummaryLegacy.dollarSales04,
      },
    });
    return true;
  }

  const patch: Prisma.CustomerSalesSummaryLegacyUpdateInput = {};
  mergeDateField(
    patch,
    'dateLastPurchase',
    existing.dateLastPurchase,
    candidate.salesSummaryLegacy.dateLastPurchase,
  );
  mergeNumberField(patch, 'qtySales01', existing.qtySales01, candidate.salesSummaryLegacy.qtySales01);
  mergeNumberField(patch, 'qtySales02', existing.qtySales02, candidate.salesSummaryLegacy.qtySales02);
  mergeNumberField(patch, 'qtySales03', existing.qtySales03, candidate.salesSummaryLegacy.qtySales03);
  mergeNumberField(patch, 'qtySales04', existing.qtySales04, candidate.salesSummaryLegacy.qtySales04);
  mergeDecimalField(
    patch,
    'dollarSales01',
    existing.dollarSales01,
    candidate.salesSummaryLegacy.dollarSales01,
  );
  mergeDecimalField(
    patch,
    'dollarSales02',
    existing.dollarSales02,
    candidate.salesSummaryLegacy.dollarSales02,
  );
  mergeDecimalField(
    patch,
    'dollarSales03',
    existing.dollarSales03,
    candidate.salesSummaryLegacy.dollarSales03,
  );
  mergeDecimalField(
    patch,
    'dollarSales04',
    existing.dollarSales04,
    candidate.salesSummaryLegacy.dollarSales04,
  );

  if (Object.keys(patch).length === 0) return false;

  await tx.customerSalesSummaryLegacy.update({
    where: { customerId },
    data: patch,
  });
  return true;
}

async function insertReject(
  tx: Tx,
  batchId: string,
  candidate: CustomerImportCandidate,
  rejectReason: string,
): Promise<void> {
  await tx.customerImportReject.create({
    data: {
      batchId,
      sourceFile: candidate.sourceFile,
      rowNumber: candidate.rowNumber,
      account: candidate.account,
      code: candidate.code,
      name: candidate.fullName,
      honduranIdRaw: candidate.honduranIdRaw,
      honduranIdNormalized: candidate.honduranIdNormalized,
      email: candidate.emailRaw,
      rejectReason,
      rawRow: candidate.rawRow as Prisma.InputJsonValue,
    },
  });
}

function importedCustomerInclude() {
  return {
    identities: true,
    contacts: true,
    addresses: true,
    legacyProfile: true,
    financialProfile: true,
    salesSummaryLegacy: true,
  } satisfies Prisma.CustomerIntelligenceCustomerInclude;
}

function hasAddress(candidate: CustomerImportCandidate): boolean {
  return Boolean(
    candidate.address.addr1 ||
      candidate.address.addr2 ||
      candidate.address.city ||
      candidate.address.state ||
      candidate.address.county ||
      candidate.address.zip,
  );
}

function hasLegacyProfile(profile: CandidateProfileData): boolean {
  return Object.values(profile).some((value) => value != null);
}

function hasFinancialProfile(profile: CandidateFinancialData): boolean {
  return Boolean(
    profile.creditLimit != null ||
      profile.currentBalance != null ||
      profile.creditSlipBalance != null ||
      profile.nonTaxable === true ||
      profile.planNum != null ||
      profile.planCount != null ||
      profile.planDollars != null ||
      profile.planLastCreditAt != null ||
      profile.planCreditBalance != null,
  );
}

function hasSalesSummary(summary: CandidateSalesSummaryData): boolean {
  return Boolean(
    summary.dateLastPurchase != null ||
      summary.qtySales01 != null ||
      summary.qtySales02 != null ||
      summary.qtySales03 != null ||
      summary.qtySales04 != null ||
      summary.dollarSales01 != null ||
      summary.dollarSales02 != null ||
      summary.dollarSales03 != null ||
      summary.dollarSales04 != null,
  );
}

function mergeTextField<T extends Record<string, unknown>, K extends keyof T>(
  patch: T,
  key: K,
  current: string | null,
  next: string | null,
): void {
  if (next != null && current !== next) {
    patch[key] = next as T[K];
  }
}

function mergeNumberField<T extends Record<string, unknown>, K extends keyof T>(
  patch: T,
  key: K,
  current: number | null,
  next: number | null,
): void {
  if (next != null && current !== next) {
    patch[key] = next as T[K];
  }
}

function mergeBooleanField<T extends Record<string, unknown>, K extends keyof T>(
  patch: T,
  key: K,
  current: boolean,
  next: boolean | null,
): void {
  if (next != null && current !== next) {
    patch[key] = next as T[K];
  }
}

function mergeDateField<T extends Record<string, unknown>, K extends keyof T>(
  patch: T,
  key: K,
  current: Date | null,
  next: Date | null,
): void {
  if (next && dateChanged(current, next)) {
    patch[key] = next as T[K];
  }
}

function mergeDecimalField<T extends Record<string, unknown>, K extends keyof T>(
  patch: T,
  key: K,
  current: Prisma.Decimal | null,
  next: string | null,
): void {
  if (next == null) return;
  if (current == null || current.toString() !== next) {
    patch[key] = next as T[K];
  }
}

function minDate(current: Date | null, incoming: Date | null): Date | null {
  if (!current) return incoming;
  if (!incoming) return current;
  return current <= incoming ? current : incoming;
}

function maxDate(current: Date | null, incoming: Date | null): Date | null {
  if (!current) return incoming;
  if (!incoming) return current;
  return current >= incoming ? current : incoming;
}

function dateChanged(current: Date | null, next: Date | null): boolean {
  if (current == null && next == null) return false;
  if (current == null || next == null) return true;
  return current.getTime() !== next.getTime();
}
