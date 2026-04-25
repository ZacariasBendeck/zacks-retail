import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  CustomerCsvRow,
  MailListNamesCsvRow,
  deriveHonduranIdCandidate,
  isValidEmail,
  mapImportedStatus,
  normalizeEmail,
  normalizeImportText,
  parseCsvFileRecords,
  parseImportedBoolean,
  parseImportedDate,
  parseImportedDecimal,
  parseImportedInteger,
} from '../../src/services/customers/customerImportCsv';

interface Args {
  customerCsvPath: string;
  mailListNamesCsvPath: string;
  source: string;
  batchSize: number;
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

interface PendingCustomerRow {
  id: string;
  honduran_id_raw: string | null;
  honduran_id_normalized: string | null;
  full_name: string | null;
  gender: string | null;
  birth_date: string | null;
  status: string;
  source: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  imported_from_batch_id: string;
  rics_account: string | null;
  rics_code: string | null;
  rics_date_added: string | null;
  rics_date_last_changed: string | null;
  updated_at: string;
}

interface PendingIdentityRow {
  id: string;
  customer_id: string;
  identity_type: string;
  identity_value: string;
  normalized_value: string;
  source: string;
  is_primary: boolean;
}

interface PendingContactRow {
  id: string;
  customer_id: string;
  contact_type: string;
  value: string;
  normalized_value: string | null;
  is_primary: boolean;
  is_verified: boolean;
  accepts_marketing: boolean;
  source: string;
}

interface PendingAddressRow {
  id: string;
  customer_id: string;
  addr1: string | null;
  addr2: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  zip: string | null;
  country: string;
  source: string;
}

interface PendingLegacyRow {
  id: string;
  customer_id: string;
  customer_extra_01: string | null;
  customer_extra_02: string | null;
  customer_extra_03: string | null;
  customer_extra_04: string | null;
  customer_extra_05: string | null;
  customer_extra_06: string | null;
  mail_extra_01: string | null;
  mail_extra_02: string | null;
  mail_extra_03: string | null;
  mail_extra_04: string | null;
  mail_extra_05: string | null;
  mail_extra_06: string | null;
  customer_comment: string | null;
  mail_comment: string | null;
  change_to: string | null;
}

interface PendingFinancialRow {
  id: string;
  customer_id: string;
  credit_limit: string | null;
  current_balance: string | null;
  credit_slip_balance: string | null;
  non_taxable: boolean;
  plan_num: number | null;
  plan_count: number | null;
  plan_dollars: string | null;
  plan_last_credit_at: string | null;
  plan_credit_balance: string | null;
}

interface PendingSalesRow {
  id: string;
  customer_id: string;
  date_last_purchase: string | null;
  qty_sales_01: number | null;
  qty_sales_02: number | null;
  qty_sales_03: number | null;
  qty_sales_04: number | null;
  dollar_sales_01: string | null;
  dollar_sales_02: string | null;
  dollar_sales_03: string | null;
  dollar_sales_04: string | null;
}

interface PendingCustomerBundle {
  customer: PendingCustomerRow;
  identities: Map<string, PendingIdentityRow>;
  contacts: Map<string, PendingContactRow>;
  addresses: Map<string, PendingAddressRow>;
  legacyProfile: PendingLegacyRow | null;
  financialProfile: PendingFinancialRow | null;
  salesSummaryLegacy: PendingSalesRow | null;
}

interface PendingRejectRow {
  id: string;
  batch_id: string;
  source_file: string;
  row_number: number;
  account: string | null;
  code: string | null;
  name: string | null;
  honduran_id_raw: string | null;
  honduran_id_normalized: string | null;
  email: string | null;
  reject_reason: string;
  raw_row: Record<string, unknown>;
}

interface ImportStats {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  rejectedCount: number;
}

const EMPTY_TABLES = [
  'app.customer',
  'app.customer_identity',
  'app.customer_contact',
  'app.customer_address',
  'app.customer_legacy_profile',
  'app.customer_financial_profile',
  'app.customer_sales_summary_legacy',
  'app.customer_import_batch',
  'app.customer_import_reject',
] as const;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    customerCsvPath: path.resolve('../.tmp/customer-import-extract/Customer.csv'),
    mailListNamesCsvPath: path.resolve('../.tmp/customer-import-extract/MailListNames.csv'),
    source: 'rics_csv_bulk',
    batchSize: 5000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--customer':
      case '-c':
        args.customerCsvPath = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--mail':
      case '-m':
        args.mailListNamesCsvPath = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--source':
        args.source = String(argv[++i] ?? 'rics_csv_bulk') || 'rics_csv_bulk';
        break;
      case '--batch-size':
        args.batchSize = Math.max(100, Number(argv[++i] ?? '5000') || 5000);
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  return args;
}

function printUsage(): void {
  console.log(
    'Usage: pnpm --filter @benlow-rics/api import:customers:bulk -- --customer <Customer.csv> --mail <MailListNames.csv> [--source rics_csv_bulk] [--batch-size 5000]',
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await assertEmptyTargetTables(client);

    const batchId = randomUUID();
    await client.query(
      `INSERT INTO app.customer_import_batch (id, source, file_name)
       VALUES ($1::uuid, $2, $3)`,
      [batchId, args.source, `${path.basename(args.customerCsvPath)} + ${path.basename(args.mailListNamesCsvPath)}`],
    );

    const customerRows = await loadCustomerRows(args.customerCsvPath);
    const stats: ImportStats = {
      totalRows: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      rejectedCount: 0,
    };

    const pendingBundles = new Map<string, PendingCustomerBundle>();
    const pendingRejects: PendingRejectRow[] = [];
    const identityOwnerByKey = new Map<string, string>();
    const customerHonduranById = new Map<string, string | null>();
    const flushedCustomerIds = new Set<string>();
    const consumedCustomerAccounts = new Set<string>();

    let mailRowNumber = 1;
    for await (const record of parseCsvFileRecords(args.mailListNamesCsvPath)) {
      mailRowNumber += 1;
      stats.totalRows += 1;
      const mailRow = record as unknown as MailListNamesCsvRow;
      const account = normalizeImportText(mailRow.Account);
      const customerRef = account ? customerRows.byAccount.get(account) ?? null : null;
      if (customerRef) consumedCustomerAccounts.add(account!);

      const candidate = makeCandidate({
        customerRow: customerRef?.row ?? null,
        customerRowNumber: customerRef?.rowNumber ?? null,
        customerFileName: path.basename(args.customerCsvPath),
        mailRow,
        mailRowNumber,
        mailFileName: path.basename(args.mailListNamesCsvPath),
      });

      const rejectReason = validateCandidate(candidate);
      if (rejectReason) {
        pendingRejects.push(buildRejectRow(batchId, candidate, rejectReason));
        stats.rejectedCount += 1;
        if (pendingRejects.length >= args.batchSize) {
          await flushRejects(client, pendingRejects);
        }
        continue;
      }

      const matchId = findMatchId(candidate, identityOwnerByKey);
      const conflictReason = detectConflictReason(
        candidate,
        matchId,
        identityOwnerByKey,
        customerHonduranById,
      );
      if (conflictReason) {
        pendingRejects.push(buildRejectRow(batchId, candidate, conflictReason));
        stats.rejectedCount += 1;
        if (pendingRejects.length >= args.batchSize) {
          await flushRejects(client, pendingRejects);
        }
        continue;
      }

      if (!matchId) {
        const bundle = createPendingBundle(candidate, batchId, args.source);
        pendingBundles.set(bundle.customer.id, bundle);
        registerBundleIdentities(bundle, identityOwnerByKey);
        customerHonduranById.set(bundle.customer.id, bundle.customer.honduran_id_normalized);
        stats.createdCount += 1;
      } else if (pendingBundles.has(matchId)) {
        mergeCandidateIntoPendingBundle(
          pendingBundles.get(matchId)!,
          candidate,
          args.source,
          identityOwnerByKey,
          customerHonduranById,
        );
        stats.updatedCount += 1;
      } else if (flushedCustomerIds.has(matchId)) {
        await applyCandidateToPersistedCustomer(
          client,
          matchId,
          candidate,
          batchId,
          args.source,
          identityOwnerByKey,
          customerHonduranById,
        );
        stats.updatedCount += 1;
      } else {
        pendingRejects.push(buildRejectRow(batchId, candidate, 'unsafe_match'));
        stats.rejectedCount += 1;
      }

      if (pendingBundles.size >= args.batchSize) {
        await flushPendingBundles(client, pendingBundles, flushedCustomerIds);
      }
      if (pendingRejects.length >= args.batchSize) {
        await flushRejects(client, pendingRejects);
      }
      if (stats.totalRows % 50000 === 0) {
        console.log(
          `[bulk-import] processed ${stats.totalRows.toLocaleString()} mail rows; created=${stats.createdCount.toLocaleString()} updated=${stats.updatedCount.toLocaleString()} rejected=${stats.rejectedCount.toLocaleString()}`,
        );
      }
    }

    for (const leftover of customerRows.unmatched) {
      if (leftover.account && consumedCustomerAccounts.has(leftover.account)) continue;
      stats.totalRows += 1;
      const candidate = makeCandidate({
        customerRow: leftover.row,
        customerRowNumber: leftover.rowNumber,
        customerFileName: path.basename(args.customerCsvPath),
        mailRow: null,
        mailRowNumber: null,
        mailFileName: path.basename(args.mailListNamesCsvPath),
      });

      const rejectReason = validateCandidate(candidate);
      if (rejectReason) {
        pendingRejects.push(buildRejectRow(batchId, candidate, rejectReason));
        stats.rejectedCount += 1;
        continue;
      }

      const matchId = findMatchId(candidate, identityOwnerByKey);
      const conflictReason = detectConflictReason(
        candidate,
        matchId,
        identityOwnerByKey,
        customerHonduranById,
      );
      if (conflictReason) {
        pendingRejects.push(buildRejectRow(batchId, candidate, conflictReason));
        stats.rejectedCount += 1;
        continue;
      }

      if (!matchId) {
        const bundle = createPendingBundle(candidate, batchId, args.source);
        pendingBundles.set(bundle.customer.id, bundle);
        registerBundleIdentities(bundle, identityOwnerByKey);
        customerHonduranById.set(bundle.customer.id, bundle.customer.honduran_id_normalized);
        stats.createdCount += 1;
      } else if (pendingBundles.has(matchId)) {
        mergeCandidateIntoPendingBundle(
          pendingBundles.get(matchId)!,
          candidate,
          args.source,
          identityOwnerByKey,
          customerHonduranById,
        );
        stats.updatedCount += 1;
      } else if (flushedCustomerIds.has(matchId)) {
        await applyCandidateToPersistedCustomer(
          client,
          matchId,
          candidate,
          batchId,
          args.source,
          identityOwnerByKey,
          customerHonduranById,
        );
        stats.updatedCount += 1;
      }
    }

    await flushPendingBundles(client, pendingBundles, flushedCustomerIds);
    await flushRejects(client, pendingRejects);

    await client.query(
      `UPDATE app.customer_import_batch
       SET finished_at = now(),
           total_rows = $2,
           created_count = $3,
           updated_count = $4,
           skipped_count = $5,
           rejected_count = $6
       WHERE id = $1::uuid`,
      [
        batchId,
        stats.totalRows,
        stats.createdCount,
        stats.updatedCount,
        stats.skippedCount,
        stats.rejectedCount,
      ],
    );

    console.log(
      JSON.stringify(
        {
          batchId,
          source: args.source,
          totalRows: stats.totalRows,
          createdCount: stats.createdCount,
          updatedCount: stats.updatedCount,
          skippedCount: stats.skippedCount,
          rejectedCount: stats.rejectedCount,
          customerCsvPath: args.customerCsvPath,
          mailListNamesCsvPath: args.mailListNamesCsvPath,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

async function assertEmptyTargetTables(client: Client): Promise<void> {
  for (const table of EMPTY_TABLES) {
    const result = await client.query<{ n: string }>(`SELECT count(*)::bigint AS n FROM ${table}`);
    if (Number(result.rows[0]?.n ?? 0) > 0) {
      throw new Error(`Bulk importer requires empty customer-import tables; ${table} is not empty.`);
    }
  }
}

async function loadCustomerRows(filePath: string): Promise<{
  byAccount: Map<string, { row: CustomerCsvRow; rowNumber: number }>;
  unmatched: Array<{ row: CustomerCsvRow; rowNumber: number; account: string | null }>;
}> {
  const byAccount = new Map<string, { row: CustomerCsvRow; rowNumber: number }>();
  const unmatched: Array<{ row: CustomerCsvRow; rowNumber: number; account: string | null }> = [];
  let rowNumber = 1;

  for await (const record of parseCsvFileRecords(filePath)) {
    rowNumber += 1;
    const row = record as unknown as CustomerCsvRow;
    const account = normalizeImportText(row.Account);
    unmatched.push({ row, rowNumber, account });
    if (account && !byAccount.has(account)) {
      byAccount.set(account, { row, rowNumber });
    }
  }

  return { byAccount, unmatched };
}

function makeCandidate(input: {
  customerRow: CustomerCsvRow | null;
  customerRowNumber: number | null;
  customerFileName: string;
  mailRow: MailListNamesCsvRow | null;
  mailRowNumber: number | null;
  mailFileName: string;
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
  const sourceFile = customerRow ? input.customerFileName : input.mailFileName;
  const rowNumber = customerRow ? input.customerRowNumber ?? 0 : input.mailRowNumber ?? 0;

  return {
    sourceFile,
    rowNumber,
    rawRow: {
      customer: customerRow,
      mailListNames: mailRow,
    },
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
  if (candidate.emailRaw && !isValidEmail(candidate.emailRaw)) return 'invalid_email';
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

function identityKey(type: string, value: string | null): string | null {
  return value ? `${type}:${value}` : null;
}

function findMatchId(
  candidate: CustomerImportCandidate,
  identityOwnerByKey: Map<string, string>,
): string | null {
  const orderedKeys = [
    identityKey('honduran_id', candidate.honduranIdNormalized),
    identityKey('rics_account', candidate.account),
    identityKey('rics_code', candidate.code),
    identityKey('email', candidate.emailNormalized),
  ];
  for (const key of orderedKeys) {
    if (!key) continue;
    const owner = identityOwnerByKey.get(key);
    if (owner) return owner;
  }
  return null;
}

function detectConflictReason(
  candidate: CustomerImportCandidate,
  matchId: string | null,
  identityOwnerByKey: Map<string, string>,
  customerHonduranById: Map<string, string | null>,
): string | null {
  if (candidate.honduranIdConflict) return 'conflicting_honduran_id';

  const owners = new Set<string>();
  for (const key of [
    identityKey('honduran_id', candidate.honduranIdNormalized),
    identityKey('rics_account', candidate.account),
    identityKey('rics_code', candidate.code),
    identityKey('email', candidate.emailNormalized),
  ]) {
    if (!key) continue;
    const owner = identityOwnerByKey.get(key);
    if (owner) owners.add(owner);
  }

  const chosenId = matchId ?? [...owners][0] ?? null;
  if (chosenId && candidate.honduranIdNormalized) {
    const existingHid = customerHonduranById.get(chosenId);
    if (existingHid && existingHid !== candidate.honduranIdNormalized) {
      return 'conflicting_honduran_id';
    }
  }

  for (const owner of owners) {
    if (chosenId && owner !== chosenId) {
      const otherHid = customerHonduranById.get(owner);
      if (
        candidate.honduranIdNormalized &&
        otherHid &&
        otherHid !== candidate.honduranIdNormalized
      ) {
        return 'conflicting_honduran_id';
      }
      return 'duplicate_identity_conflict';
    }
  }

  return null;
}

function createPendingBundle(
  candidate: CustomerImportCandidate,
  batchId: string,
  source: string,
): PendingCustomerBundle {
  const id = randomUUID();
  const now = new Date().toISOString();
  const bundle: PendingCustomerBundle = {
    customer: {
      id,
      honduran_id_raw: candidate.honduranIdRaw,
      honduran_id_normalized: candidate.honduranIdNormalized,
      full_name: candidate.fullName,
      gender: candidate.gender,
      birth_date: toDateOnly(candidate.birthDate),
      status: candidate.status,
      source,
      first_seen_at: toIsoString(candidate.firstSeenAt),
      last_seen_at: toIsoString(candidate.lastSeenAt),
      imported_from_batch_id: batchId,
      rics_account: candidate.account,
      rics_code: candidate.code,
      rics_date_added: toIsoString(candidate.ricsDateAdded),
      rics_date_last_changed: toIsoString(candidate.ricsDateLastChanged),
      updated_at: now,
    },
    identities: new Map<string, PendingIdentityRow>(),
    contacts: new Map<string, PendingContactRow>(),
    addresses: new Map<string, PendingAddressRow>(),
    legacyProfile: null,
    financialProfile: null,
    salesSummaryLegacy: null,
  };
  mergeCandidateIntoPendingBundle(bundle, candidate, source, new Map(), new Map([[id, candidate.honduranIdNormalized]]));
  return bundle;
}

function mergeCandidateIntoPendingBundle(
  bundle: PendingCustomerBundle,
  candidate: CustomerImportCandidate,
  source: string,
  identityOwnerByKey: Map<string, string>,
  customerHonduranById: Map<string, string | null>,
): void {
  bundle.customer.honduran_id_raw = bundle.customer.honduran_id_raw ?? candidate.honduranIdRaw;
  bundle.customer.honduran_id_normalized =
    bundle.customer.honduran_id_normalized ?? candidate.honduranIdNormalized;
  bundle.customer.full_name = bundle.customer.full_name ?? candidate.fullName;
  bundle.customer.gender = bundle.customer.gender ?? candidate.gender;
  bundle.customer.birth_date = bundle.customer.birth_date ?? toDateOnly(candidate.birthDate);
  bundle.customer.rics_account = bundle.customer.rics_account ?? candidate.account;
  bundle.customer.rics_code = bundle.customer.rics_code ?? candidate.code;
  if (candidate.statusRaw) bundle.customer.status = candidate.status;
  bundle.customer.first_seen_at = minIso(bundle.customer.first_seen_at, candidate.firstSeenAt);
  bundle.customer.last_seen_at = maxIso(bundle.customer.last_seen_at, candidate.lastSeenAt);
  bundle.customer.rics_date_added = minIso(bundle.customer.rics_date_added, candidate.ricsDateAdded);
  bundle.customer.rics_date_last_changed = maxIso(
    bundle.customer.rics_date_last_changed,
    candidate.ricsDateLastChanged,
  );
  customerHonduranById.set(bundle.customer.id, bundle.customer.honduran_id_normalized);

  addIdentity(bundle, 'honduran_id', candidate.honduranIdRaw, candidate.honduranIdNormalized, true, source);
  addIdentity(bundle, 'rics_account', candidate.account, candidate.account, false, source);
  addIdentity(bundle, 'rics_code', candidate.code, candidate.code, false, source);
  addIdentity(bundle, 'email', candidate.emailRaw, candidate.emailNormalized, false, source);
  if (identityOwnerByKey.size > 0) registerBundleIdentities(bundle, identityOwnerByKey);

  if (candidate.emailRaw && candidate.emailNormalized) {
    const key = `email:${candidate.emailNormalized}`;
    if (!bundle.contacts.has(key)) {
      bundle.contacts.set(key, {
        id: randomUUID(),
        customer_id: bundle.customer.id,
        contact_type: 'email',
        value: candidate.emailRaw,
        normalized_value: candidate.emailNormalized,
        is_primary: bundle.contacts.size === 0,
        is_verified: false,
        accepts_marketing: false,
        source,
      });
    }
  }

  if (hasAddress(candidate)) {
    const key = [
      candidate.address.addr1 ?? '',
      candidate.address.addr2 ?? '',
      candidate.address.city ?? '',
      candidate.address.state ?? '',
      candidate.address.county ?? '',
      candidate.address.zip ?? '',
    ].join('|');
    if (!bundle.addresses.has(key)) {
      bundle.addresses.set(key, {
        id: randomUUID(),
        customer_id: bundle.customer.id,
        addr1: candidate.address.addr1,
        addr2: candidate.address.addr2,
        city: candidate.address.city,
        state: candidate.address.state,
        county: candidate.address.county,
        zip: candidate.address.zip,
        country: 'HN',
        source,
      });
    }
  }

  if (hasLegacyProfile(candidate.legacyProfile)) {
    bundle.legacyProfile = mergeLegacyRow(bundle.legacyProfile, bundle.customer.id, candidate.legacyProfile);
  }

  if (hasFinancialProfile(candidate.financialProfile)) {
    bundle.financialProfile = mergeFinancialRow(
      bundle.financialProfile,
      bundle.customer.id,
      candidate.financialProfile,
    );
  }

  if (hasSalesSummary(candidate.salesSummaryLegacy)) {
    bundle.salesSummaryLegacy = mergeSalesRow(
      bundle.salesSummaryLegacy,
      bundle.customer.id,
      candidate.salesSummaryLegacy,
    );
  }
}

function addIdentity(
  bundle: PendingCustomerBundle,
  identityType: string,
  identityValue: string | null,
  normalizedValue: string | null,
  isPrimary: boolean,
  source: string,
): void {
  if (!identityValue || !normalizedValue) return;
  const key = `${identityType}:${normalizedValue}`;
  if (bundle.identities.has(key)) return;
  bundle.identities.set(key, {
    id: randomUUID(),
    customer_id: bundle.customer.id,
    identity_type: identityType,
    identity_value: identityValue,
    normalized_value: normalizedValue,
    source,
    is_primary: isPrimary,
  });
}

function registerBundleIdentities(
  bundle: PendingCustomerBundle,
  identityOwnerByKey: Map<string, string>,
): void {
  for (const [key] of bundle.identities) {
    identityOwnerByKey.set(key, bundle.customer.id);
  }
}

function mergeLegacyRow(
  current: PendingLegacyRow | null,
  customerId: string,
  incoming: CandidateProfileData,
): PendingLegacyRow {
  return {
    id: current?.id ?? randomUUID(),
    customer_id: customerId,
    customer_extra_01: current?.customer_extra_01 ?? incoming.customerExtra01,
    customer_extra_02: current?.customer_extra_02 ?? incoming.customerExtra02,
    customer_extra_03: current?.customer_extra_03 ?? incoming.customerExtra03,
    customer_extra_04: current?.customer_extra_04 ?? incoming.customerExtra04,
    customer_extra_05: current?.customer_extra_05 ?? incoming.customerExtra05,
    customer_extra_06: current?.customer_extra_06 ?? incoming.customerExtra06,
    mail_extra_01: current?.mail_extra_01 ?? incoming.mailExtra01,
    mail_extra_02: current?.mail_extra_02 ?? incoming.mailExtra02,
    mail_extra_03: current?.mail_extra_03 ?? incoming.mailExtra03,
    mail_extra_04: current?.mail_extra_04 ?? incoming.mailExtra04,
    mail_extra_05: current?.mail_extra_05 ?? incoming.mailExtra05,
    mail_extra_06: current?.mail_extra_06 ?? incoming.mailExtra06,
    customer_comment: current?.customer_comment ?? incoming.customerComment,
    mail_comment: current?.mail_comment ?? incoming.mailComment,
    change_to: current?.change_to ?? incoming.changeTo,
  };
}

function mergeFinancialRow(
  current: PendingFinancialRow | null,
  customerId: string,
  incoming: CandidateFinancialData,
): PendingFinancialRow {
  return {
    id: current?.id ?? randomUUID(),
    customer_id: customerId,
    credit_limit: current?.credit_limit ?? incoming.creditLimit,
    current_balance: current?.current_balance ?? incoming.currentBalance,
    credit_slip_balance: current?.credit_slip_balance ?? incoming.creditSlipBalance,
    non_taxable: current?.non_taxable ?? incoming.nonTaxable ?? false,
    plan_num: current?.plan_num ?? incoming.planNum,
    plan_count: current?.plan_count ?? incoming.planCount,
    plan_dollars: current?.plan_dollars ?? incoming.planDollars,
    plan_last_credit_at: current?.plan_last_credit_at ?? toIsoString(incoming.planLastCreditAt),
    plan_credit_balance: current?.plan_credit_balance ?? incoming.planCreditBalance,
  };
}

function mergeSalesRow(
  current: PendingSalesRow | null,
  customerId: string,
  incoming: CandidateSalesSummaryData,
): PendingSalesRow {
  return {
    id: current?.id ?? randomUUID(),
    customer_id: customerId,
    date_last_purchase: maxIso(current?.date_last_purchase ?? null, incoming.dateLastPurchase),
    qty_sales_01: current?.qty_sales_01 ?? incoming.qtySales01,
    qty_sales_02: current?.qty_sales_02 ?? incoming.qtySales02,
    qty_sales_03: current?.qty_sales_03 ?? incoming.qtySales03,
    qty_sales_04: current?.qty_sales_04 ?? incoming.qtySales04,
    dollar_sales_01: current?.dollar_sales_01 ?? incoming.dollarSales01,
    dollar_sales_02: current?.dollar_sales_02 ?? incoming.dollarSales02,
    dollar_sales_03: current?.dollar_sales_03 ?? incoming.dollarSales03,
    dollar_sales_04: current?.dollar_sales_04 ?? incoming.dollarSales04,
  };
}

function buildRejectRow(
  batchId: string,
  candidate: CustomerImportCandidate,
  rejectReason: string,
): PendingRejectRow {
  return {
    id: randomUUID(),
    batch_id: batchId,
    source_file: candidate.sourceFile,
    row_number: candidate.rowNumber,
    account: candidate.account,
    code: candidate.code,
    name: candidate.fullName,
    honduran_id_raw: candidate.honduranIdRaw,
    honduran_id_normalized: candidate.honduranIdNormalized,
    email: candidate.emailRaw,
    reject_reason: rejectReason,
    raw_row: candidate.rawRow,
  };
}

async function flushPendingBundles(
  client: Client,
  pendingBundles: Map<string, PendingCustomerBundle>,
  flushedCustomerIds: Set<string>,
): Promise<void> {
  if (pendingBundles.size === 0) return;

  const bundles = [...pendingBundles.values()];
  const customers = bundles.map((bundle) => bundle.customer);
  const identities = bundles.flatMap((bundle) => [...bundle.identities.values()]);
  const contacts = bundles.flatMap((bundle) => [...bundle.contacts.values()]);
  const addresses = bundles.flatMap((bundle) => [...bundle.addresses.values()]);
  const legacyRows = bundles.flatMap((bundle) => (bundle.legacyProfile ? [bundle.legacyProfile] : []));
  const financialRows = bundles.flatMap((bundle) =>
    bundle.financialProfile ? [bundle.financialProfile] : [],
  );
  const salesRows = bundles.flatMap((bundle) =>
    bundle.salesSummaryLegacy ? [bundle.salesSummaryLegacy] : [],
  );

  await client.query('BEGIN');
  try {
    await insertJsonRows(
      client,
      `INSERT INTO app.customer (
         id, honduran_id_raw, honduran_id_normalized, full_name, gender, birth_date, status, source,
         first_seen_at, last_seen_at, imported_from_batch_id, rics_account, rics_code,
         rics_date_added, rics_date_last_changed, updated_at
       )
       SELECT
         id::uuid, honduran_id_raw, honduran_id_normalized, full_name, gender,
         birth_date::date, status, source,
         first_seen_at::timestamptz, last_seen_at::timestamptz, imported_from_batch_id::uuid,
         rics_account, rics_code, rics_date_added::timestamptz, rics_date_last_changed::timestamptz,
         updated_at::timestamptz
       FROM json_to_recordset($1::json) AS x(
         id text, honduran_id_raw text, honduran_id_normalized text, full_name text, gender text,
         birth_date text, status text, source text, first_seen_at text, last_seen_at text,
         imported_from_batch_id text, rics_account text, rics_code text,
         rics_date_added text, rics_date_last_changed text, updated_at text
       )`,
      customers,
    );

    await insertJsonRows(
      client,
      `INSERT INTO app.customer_identity (
         id, customer_id, identity_type, identity_value, normalized_value, source, is_primary
       )
       SELECT
         id::uuid, customer_id::uuid, identity_type, identity_value, normalized_value, source, is_primary
       FROM json_to_recordset($1::json) AS x(
         id text, customer_id text, identity_type text, identity_value text,
         normalized_value text, source text, is_primary boolean
       )
       ON CONFLICT (identity_type, normalized_value) DO NOTHING`,
      identities,
    );

    await insertJsonRows(
      client,
      `INSERT INTO app.customer_contact (
         id, customer_id, contact_type, value, normalized_value, is_primary, is_verified, accepts_marketing, source
       )
       SELECT
         id::uuid, customer_id::uuid, contact_type, value, normalized_value, is_primary, is_verified, accepts_marketing, source
       FROM json_to_recordset($1::json) AS x(
         id text, customer_id text, contact_type text, value text, normalized_value text,
         is_primary boolean, is_verified boolean, accepts_marketing boolean, source text
       )`,
      contacts,
    );

    await insertJsonRows(
      client,
      `INSERT INTO app.customer_address (
         id, customer_id, addr1, addr2, city, state, county, zip, country, source
       )
       SELECT
         id::uuid, customer_id::uuid, addr1, addr2, city, state, county, zip, country, source
       FROM json_to_recordset($1::json) AS x(
         id text, customer_id text, addr1 text, addr2 text, city text, state text,
         county text, zip text, country text, source text
       )`,
      addresses,
    );

    await insertJsonRows(
      client,
      `INSERT INTO app.customer_legacy_profile (
         id, customer_id, customer_extra_01, customer_extra_02, customer_extra_03, customer_extra_04,
         customer_extra_05, customer_extra_06, mail_extra_01, mail_extra_02, mail_extra_03,
         mail_extra_04, mail_extra_05, mail_extra_06, customer_comment, mail_comment, change_to
       )
       SELECT
         id::uuid, customer_id::uuid, customer_extra_01, customer_extra_02, customer_extra_03, customer_extra_04,
         customer_extra_05, customer_extra_06, mail_extra_01, mail_extra_02, mail_extra_03,
         mail_extra_04, mail_extra_05, mail_extra_06, customer_comment, mail_comment, change_to
       FROM json_to_recordset($1::json) AS x(
         id text, customer_id text, customer_extra_01 text, customer_extra_02 text, customer_extra_03 text,
         customer_extra_04 text, customer_extra_05 text, customer_extra_06 text, mail_extra_01 text,
         mail_extra_02 text, mail_extra_03 text, mail_extra_04 text, mail_extra_05 text, mail_extra_06 text,
         customer_comment text, mail_comment text, change_to text
       )`,
      legacyRows,
    );

    await insertJsonRows(
      client,
      `INSERT INTO app.customer_financial_profile (
         id, customer_id, credit_limit, current_balance, credit_slip_balance, non_taxable,
         plan_num, plan_count, plan_dollars, plan_last_credit_at, plan_credit_balance
       )
       SELECT
         id::uuid, customer_id::uuid, credit_limit::numeric, current_balance::numeric,
         credit_slip_balance::numeric, non_taxable, plan_num::smallint, plan_count::smallint,
         plan_dollars::numeric, plan_last_credit_at::timestamptz, plan_credit_balance::numeric
       FROM json_to_recordset($1::json) AS x(
         id text, customer_id text, credit_limit text, current_balance text, credit_slip_balance text,
         non_taxable boolean, plan_num integer, plan_count integer, plan_dollars text,
         plan_last_credit_at text, plan_credit_balance text
       )`,
      financialRows,
    );

    await insertJsonRows(
      client,
      `INSERT INTO app.customer_sales_summary_legacy (
         id, customer_id, date_last_purchase, qty_sales_01, qty_sales_02, qty_sales_03, qty_sales_04,
         dollar_sales_01, dollar_sales_02, dollar_sales_03, dollar_sales_04
       )
       SELECT
         id::uuid, customer_id::uuid, date_last_purchase::timestamptz,
         qty_sales_01, qty_sales_02, qty_sales_03, qty_sales_04,
         dollar_sales_01::numeric, dollar_sales_02::numeric, dollar_sales_03::numeric, dollar_sales_04::numeric
       FROM json_to_recordset($1::json) AS x(
         id text, customer_id text, date_last_purchase text, qty_sales_01 integer, qty_sales_02 integer,
         qty_sales_03 integer, qty_sales_04 integer, dollar_sales_01 text, dollar_sales_02 text,
         dollar_sales_03 text, dollar_sales_04 text
       )`,
      salesRows,
    );

    await client.query('COMMIT');
    for (const bundle of bundles) {
      flushedCustomerIds.add(bundle.customer.id);
      pendingBundles.delete(bundle.customer.id);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function flushRejects(client: Client, pendingRejects: PendingRejectRow[]): Promise<void> {
  if (pendingRejects.length === 0) return;
  await insertJsonRows(
    client,
    `INSERT INTO app.customer_import_reject (
       id, batch_id, source_file, row_number, account, code, name,
       honduran_id_raw, honduran_id_normalized, email, reject_reason, raw_row
     )
     SELECT
       id::uuid, batch_id::uuid, source_file, row_number, account, code, name,
       honduran_id_raw, honduran_id_normalized, email, reject_reason, raw_row::jsonb
     FROM json_to_recordset($1::json) AS x(
       id text, batch_id text, source_file text, row_number integer, account text, code text, name text,
       honduran_id_raw text, honduran_id_normalized text, email text, reject_reason text, raw_row text
     )`,
    pendingRejects.map((row) => ({ ...row, raw_row: JSON.stringify(row.raw_row) })),
  );
  pendingRejects.length = 0;
}

async function insertJsonRows(client: Client, sql: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  await client.query(sql, [JSON.stringify(rows)]);
}

async function applyCandidateToPersistedCustomer(
  client: Client,
  customerId: string,
  candidate: CustomerImportCandidate,
  batchId: string,
  source: string,
  identityOwnerByKey: Map<string, string>,
  customerHonduranById: Map<string, string | null>,
): Promise<void> {
  await client.query(
    `UPDATE app.customer
     SET honduran_id_raw = COALESCE(honduran_id_raw, $2),
         honduran_id_normalized = COALESCE(honduran_id_normalized, $3),
         full_name = COALESCE(full_name, $4),
         gender = COALESCE(gender, $5),
         birth_date = COALESCE(birth_date, $6::date),
         status = COALESCE($7::text, status),
         first_seen_at = CASE
           WHEN first_seen_at IS NULL THEN $8::timestamptz
           WHEN $8::timestamptz IS NULL THEN first_seen_at
           ELSE LEAST(first_seen_at, $8::timestamptz)
         END,
         last_seen_at = CASE
           WHEN last_seen_at IS NULL THEN $9::timestamptz
           WHEN $9::timestamptz IS NULL THEN last_seen_at
           ELSE GREATEST(last_seen_at, $9::timestamptz)
         END,
         imported_from_batch_id = COALESCE(imported_from_batch_id, $10::uuid),
         rics_account = COALESCE(rics_account, $11),
         rics_code = COALESCE(rics_code, $12),
         rics_date_added = CASE
           WHEN rics_date_added IS NULL THEN $13::timestamptz
           WHEN $13::timestamptz IS NULL THEN rics_date_added
           ELSE LEAST(rics_date_added, $13::timestamptz)
         END,
         rics_date_last_changed = CASE
           WHEN rics_date_last_changed IS NULL THEN $14::timestamptz
           WHEN $14::timestamptz IS NULL THEN rics_date_last_changed
           ELSE GREATEST(rics_date_last_changed, $14::timestamptz)
         END,
         updated_at = now()
     WHERE id = $1::uuid`,
    [
      customerId,
      candidate.honduranIdRaw,
      candidate.honduranIdNormalized,
      candidate.fullName,
      candidate.gender,
      toDateOnly(candidate.birthDate),
      candidate.statusRaw ? candidate.status : null,
      toIsoString(candidate.firstSeenAt),
      toIsoString(candidate.lastSeenAt),
      batchId,
      candidate.account,
      candidate.code,
      toIsoString(candidate.ricsDateAdded),
      toIsoString(candidate.ricsDateLastChanged),
    ],
  );

  for (const [type, value, normalized, primary] of [
    ['honduran_id', candidate.honduranIdRaw, candidate.honduranIdNormalized, true],
    ['rics_account', candidate.account, candidate.account, false],
    ['rics_code', candidate.code, candidate.code, false],
    ['email', candidate.emailRaw, candidate.emailNormalized, false],
  ] as const) {
    if (!value || !normalized) continue;
    await client.query(
      `INSERT INTO app.customer_identity (
         id, customer_id, identity_type, identity_value, normalized_value, source, is_primary
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
       ON CONFLICT (identity_type, normalized_value) DO NOTHING`,
      [randomUUID(), customerId, type, value, normalized, source, primary],
    );
    identityOwnerByKey.set(`${type}:${normalized}`, customerId);
  }

  if (candidate.honduranIdNormalized) {
    customerHonduranById.set(customerId, candidate.honduranIdNormalized);
  }

  if (candidate.emailRaw && candidate.emailNormalized) {
    await client.query(
      `INSERT INTO app.customer_contact (
         id, customer_id, contact_type, value, normalized_value, is_primary, is_verified, accepts_marketing, source
       )
       SELECT $1::uuid, $2::uuid, 'email', $3, $4, false, false, false, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM app.customer_contact
         WHERE customer_id = $2::uuid
           AND contact_type = 'email'
           AND normalized_value = $4
       )`,
      [randomUUID(), customerId, candidate.emailRaw, candidate.emailNormalized, source],
    );
  }

  if (hasAddress(candidate)) {
    await client.query(
      `INSERT INTO app.customer_address (
         id, customer_id, addr1, addr2, city, state, county, zip, country, source
       )
       SELECT $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, 'HN', $9
       WHERE NOT EXISTS (
         SELECT 1 FROM app.customer_address
         WHERE customer_id = $2::uuid
           AND COALESCE(addr1, '') = COALESCE($3, '')
           AND COALESCE(addr2, '') = COALESCE($4, '')
           AND COALESCE(city, '') = COALESCE($5, '')
           AND COALESCE(state, '') = COALESCE($6, '')
           AND COALESCE(county, '') = COALESCE($7, '')
           AND COALESCE(zip, '') = COALESCE($8, '')
       )`,
      [
        randomUUID(),
        customerId,
        candidate.address.addr1,
        candidate.address.addr2,
        candidate.address.city,
        candidate.address.state,
        candidate.address.county,
        candidate.address.zip,
        source,
      ],
    );
  }

  if (hasLegacyProfile(candidate.legacyProfile)) {
    await client.query(
      `INSERT INTO app.customer_legacy_profile (
         id, customer_id, customer_extra_01, customer_extra_02, customer_extra_03, customer_extra_04,
         customer_extra_05, customer_extra_06, mail_extra_01, mail_extra_02, mail_extra_03, mail_extra_04,
         mail_extra_05, mail_extra_06, customer_comment, mail_comment, change_to
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
       )
       ON CONFLICT (customer_id) DO UPDATE SET
         customer_extra_01 = COALESCE(app.customer_legacy_profile.customer_extra_01, EXCLUDED.customer_extra_01),
         customer_extra_02 = COALESCE(app.customer_legacy_profile.customer_extra_02, EXCLUDED.customer_extra_02),
         customer_extra_03 = COALESCE(app.customer_legacy_profile.customer_extra_03, EXCLUDED.customer_extra_03),
         customer_extra_04 = COALESCE(app.customer_legacy_profile.customer_extra_04, EXCLUDED.customer_extra_04),
         customer_extra_05 = COALESCE(app.customer_legacy_profile.customer_extra_05, EXCLUDED.customer_extra_05),
         customer_extra_06 = COALESCE(app.customer_legacy_profile.customer_extra_06, EXCLUDED.customer_extra_06),
         mail_extra_01 = COALESCE(app.customer_legacy_profile.mail_extra_01, EXCLUDED.mail_extra_01),
         mail_extra_02 = COALESCE(app.customer_legacy_profile.mail_extra_02, EXCLUDED.mail_extra_02),
         mail_extra_03 = COALESCE(app.customer_legacy_profile.mail_extra_03, EXCLUDED.mail_extra_03),
         mail_extra_04 = COALESCE(app.customer_legacy_profile.mail_extra_04, EXCLUDED.mail_extra_04),
         mail_extra_05 = COALESCE(app.customer_legacy_profile.mail_extra_05, EXCLUDED.mail_extra_05),
         mail_extra_06 = COALESCE(app.customer_legacy_profile.mail_extra_06, EXCLUDED.mail_extra_06),
         customer_comment = COALESCE(app.customer_legacy_profile.customer_comment, EXCLUDED.customer_comment),
         mail_comment = COALESCE(app.customer_legacy_profile.mail_comment, EXCLUDED.mail_comment),
         change_to = COALESCE(app.customer_legacy_profile.change_to, EXCLUDED.change_to)`,
      [
        randomUUID(),
        customerId,
        candidate.legacyProfile.customerExtra01,
        candidate.legacyProfile.customerExtra02,
        candidate.legacyProfile.customerExtra03,
        candidate.legacyProfile.customerExtra04,
        candidate.legacyProfile.customerExtra05,
        candidate.legacyProfile.customerExtra06,
        candidate.legacyProfile.mailExtra01,
        candidate.legacyProfile.mailExtra02,
        candidate.legacyProfile.mailExtra03,
        candidate.legacyProfile.mailExtra04,
        candidate.legacyProfile.mailExtra05,
        candidate.legacyProfile.mailExtra06,
        candidate.legacyProfile.customerComment,
        candidate.legacyProfile.mailComment,
        candidate.legacyProfile.changeTo,
      ],
    );
  }

  if (hasFinancialProfile(candidate.financialProfile)) {
    await client.query(
      `INSERT INTO app.customer_financial_profile (
         id, customer_id, credit_limit, current_balance, credit_slip_balance, non_taxable,
         plan_num, plan_count, plan_dollars, plan_last_credit_at, plan_credit_balance
       ) VALUES (
         $1::uuid, $2::uuid, $3::numeric, $4::numeric, $5::numeric, COALESCE($6, false),
         $7::smallint, $8::smallint, $9::numeric, $10::timestamptz, $11::numeric
       )
       ON CONFLICT (customer_id) DO UPDATE SET
         credit_limit = COALESCE(app.customer_financial_profile.credit_limit, EXCLUDED.credit_limit),
         current_balance = COALESCE(app.customer_financial_profile.current_balance, EXCLUDED.current_balance),
         credit_slip_balance = COALESCE(app.customer_financial_profile.credit_slip_balance, EXCLUDED.credit_slip_balance),
         non_taxable = app.customer_financial_profile.non_taxable OR EXCLUDED.non_taxable,
         plan_num = COALESCE(app.customer_financial_profile.plan_num, EXCLUDED.plan_num),
         plan_count = COALESCE(app.customer_financial_profile.plan_count, EXCLUDED.plan_count),
         plan_dollars = COALESCE(app.customer_financial_profile.plan_dollars, EXCLUDED.plan_dollars),
         plan_last_credit_at = COALESCE(app.customer_financial_profile.plan_last_credit_at, EXCLUDED.plan_last_credit_at),
         plan_credit_balance = COALESCE(app.customer_financial_profile.plan_credit_balance, EXCLUDED.plan_credit_balance)`,
      [
        randomUUID(),
        customerId,
        candidate.financialProfile.creditLimit,
        candidate.financialProfile.currentBalance,
        candidate.financialProfile.creditSlipBalance,
        candidate.financialProfile.nonTaxable,
        candidate.financialProfile.planNum,
        candidate.financialProfile.planCount,
        candidate.financialProfile.planDollars,
        toIsoString(candidate.financialProfile.planLastCreditAt),
        candidate.financialProfile.planCreditBalance,
      ],
    );
  }

  if (hasSalesSummary(candidate.salesSummaryLegacy)) {
    await client.query(
      `INSERT INTO app.customer_sales_summary_legacy (
         id, customer_id, date_last_purchase, qty_sales_01, qty_sales_02, qty_sales_03, qty_sales_04,
         dollar_sales_01, dollar_sales_02, dollar_sales_03, dollar_sales_04
       ) VALUES (
         $1::uuid, $2::uuid, $3::timestamptz, $4, $5, $6, $7, $8::numeric, $9::numeric, $10::numeric, $11::numeric
       )
       ON CONFLICT (customer_id) DO UPDATE SET
         date_last_purchase = COALESCE(app.customer_sales_summary_legacy.date_last_purchase, EXCLUDED.date_last_purchase),
         qty_sales_01 = COALESCE(app.customer_sales_summary_legacy.qty_sales_01, EXCLUDED.qty_sales_01),
         qty_sales_02 = COALESCE(app.customer_sales_summary_legacy.qty_sales_02, EXCLUDED.qty_sales_02),
         qty_sales_03 = COALESCE(app.customer_sales_summary_legacy.qty_sales_03, EXCLUDED.qty_sales_03),
         qty_sales_04 = COALESCE(app.customer_sales_summary_legacy.qty_sales_04, EXCLUDED.qty_sales_04),
         dollar_sales_01 = COALESCE(app.customer_sales_summary_legacy.dollar_sales_01, EXCLUDED.dollar_sales_01),
         dollar_sales_02 = COALESCE(app.customer_sales_summary_legacy.dollar_sales_02, EXCLUDED.dollar_sales_02),
         dollar_sales_03 = COALESCE(app.customer_sales_summary_legacy.dollar_sales_03, EXCLUDED.dollar_sales_03),
         dollar_sales_04 = COALESCE(app.customer_sales_summary_legacy.dollar_sales_04, EXCLUDED.dollar_sales_04)`,
      [
        randomUUID(),
        customerId,
        toIsoString(candidate.salesSummaryLegacy.dateLastPurchase),
        candidate.salesSummaryLegacy.qtySales01,
        candidate.salesSummaryLegacy.qtySales02,
        candidate.salesSummaryLegacy.qtySales03,
        candidate.salesSummaryLegacy.qtySales04,
        candidate.salesSummaryLegacy.dollarSales01,
        candidate.salesSummaryLegacy.dollarSales02,
        candidate.salesSummaryLegacy.dollarSales03,
        candidate.salesSummaryLegacy.dollarSales04,
      ],
    );
  }
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

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function minIso(currentIso: string | null, next: Date | null): string | null {
  const nextIso = toIsoString(next);
  if (!currentIso) return nextIso;
  if (!nextIso) return currentIso;
  return currentIso <= nextIso ? currentIso : nextIso;
}

function maxIso(currentIso: string | null, next: Date | null): string | null {
  const nextIso = toIsoString(next);
  if (!currentIso) return nextIso;
  if (!nextIso) return currentIso;
  return currentIso >= nextIso ? currentIso : nextIso;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
