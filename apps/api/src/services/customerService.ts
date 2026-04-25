import { Prisma } from '../prismaClient';
import { prisma } from '../db/prisma';
import { getDb } from '../db/database';
import {
  Customer,
  CustomerWithFamily,
  FamilyMember,
  FamilyMemberGender,
  composeDisplayName,
} from '../models/customer';
import { PaginationEnvelope } from '../models/sku';

// --- Inputs ----------------------------------------------------------------

export interface CreateCustomerInput {
  accountNumber?: string;
  phoneE164?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  country?: string | null;
  creditLimit?: number | null;
  alertFlag?: boolean;
  alertMessage?: string | null;
  comments?: string | null;
  extraFields?: Record<string, unknown> | null;
  marketingOptIn?: boolean;
}

export interface UpdateCustomerInput {
  accountNumber?: string;
  phoneE164?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  country?: string | null;
  creditLimit?: number | null;
  alertFlag?: boolean;
  alertMessage?: string | null;
  comments?: string | null;
  extraFields?: Record<string, unknown> | null;
  marketingOptIn?: boolean;
  active?: boolean;
}

export interface CustomerListParams {
  page: number;
  pageSize: number;
  sort?: 'displayName' | 'accountNumber' | 'dateAdded' | 'dateOfLastPurchase' | 'ytdSalesCents';
  order?: 'asc' | 'desc';
  active?: boolean;
  q?: string;
}

export interface CreateFamilyMemberInput {
  code: string;
  firstName?: string | null;
  lastName?: string | null;
  gender?: FamilyMemberGender | null;
  birthday?: string | null;
  comments?: string | null;
  alertFlag?: boolean;
  alertMessage?: string | null;
  extraFields?: Record<string, unknown> | null;
}

export type UpdateFamilyMemberInput = Partial<CreateFamilyMemberInput>;

// --- Row → DTO mappers -----------------------------------------------------
//
// Prisma returns native types (Decimal, Date, Boolean) — route responses want
// the same string/number/boolean shape the SQLite-era service produced so the
// frontend contract stays unchanged. These two adapters sit between Prisma
// rows and the public Customer / FamilyMember DTOs.

type PrismaCustomerRow = Prisma.CustomerGetPayload<Record<string, never>>;
type PrismaFamilyMemberRow = Prisma.FamilyMemberGetPayload<Record<string, never>>;
type ImportedNumeric = Prisma.Decimal | number | string | bigint | null;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IMPORTED_CUSTOMER_ARGS = Prisma.validator<Prisma.CustomerIntelligenceCustomerDefaultArgs>()({
  include: {
    contacts: {
      where: { contactType: 'email' },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      take: 1,
    },
    addresses: {
      orderBy: { createdAt: 'asc' },
      take: 1,
    },
    legacyProfile: true,
    financialProfile: true,
    salesSummaryLegacy: true,
  },
});

type ImportedCustomerRow = Prisma.CustomerIntelligenceCustomerGetPayload<typeof IMPORTED_CUSTOMER_ARGS>;

function importedCustomerOrderBy(
  params: CustomerListParams,
): Prisma.CustomerIntelligenceCustomerOrderByWithRelationInput[] {
  const direction: Prisma.SortOrder = params.order === 'desc' ? 'desc' : 'asc';

  switch (params.sort) {
    case 'accountNumber':
      return [{ ricsAccount: direction }, { ricsCode: direction }, { id: 'asc' }];
    case 'dateAdded':
      return [{ ricsDateAdded: direction }, { firstSeenAt: direction }, { createdAt: direction }];
    case 'dateOfLastPurchase':
      return [{ salesSummaryLegacy: { dateLastPurchase: direction } }, { fullName: 'asc' }];
    case 'ytdSalesCents':
      return [{ salesSummaryLegacy: { dollarSales02: direction } }, { fullName: 'asc' }];
    case 'displayName':
    default:
      return [{ fullName: direction }, { ricsAccount: 'asc' }, { id: 'asc' }];
  }
}

function buildImportedCustomerWhere(
  q?: string,
  active?: boolean,
): Prisma.CustomerIntelligenceCustomerWhereInput {
  const trimmed = q?.trim() ?? '';
  const hasQuery = trimmed.length > 0;
  const normalizedQuery = trimmed.toLowerCase();
  const where: Prisma.CustomerIntelligenceCustomerWhereInput = {};

  if (active === true) {
    where.status = 'active';
  } else if (active === false) {
    where.status = { not: 'active' };
  }

  if (hasQuery) {
    where.OR = [
      { ricsAccount: { contains: trimmed, mode: 'insensitive' } },
      { ricsCode: { contains: trimmed, mode: 'insensitive' } },
      { fullName: { contains: trimmed, mode: 'insensitive' } },
      { honduranIdNormalized: { contains: trimmed } },
      {
        contacts: {
          some: {
            contactType: 'email',
            OR: [
              { value: { contains: trimmed, mode: 'insensitive' } },
              { normalizedValue: { contains: normalizedQuery } },
            ],
          },
        },
      },
    ];
  }

  return where;
}

function toCustomer(r: PrismaCustomerRow): Customer {
  return {
    id: r.id,
    source: 'app',
    accountNumber: r.accountNumber,
    phoneE164: r.phoneE164,
    firstName: r.firstName,
    lastName: r.lastName,
    displayName: r.displayName,
    email: r.email,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.city,
    stateRegion: r.stateRegion,
    postalCode: r.postalCode,
    country: r.country,
    creditLimit: r.creditLimit === null ? null : Number(r.creditLimit),
    alertFlag: r.alertFlag,
    alertMessage: r.alertMessage,
    comments: r.comments,
    ptdQty: r.ptdQty,
    ptdSalesCents: r.ptdSalesCents,
    ytdQty: r.ytdQty,
    ytdSalesCents: r.ytdSalesCents,
    ttdQty: r.ttdQty,
    ttdSalesCents: r.ttdSalesCents,
    lastYearSalesCents: r.lastYearSalesCents,
    dateAdded: r.dateAdded.toISOString(),
    dateOfLastPurchase: r.dateOfLastPurchase ? r.dateOfLastPurchase.toISOString() : null,
    lastKnownArBalanceCents: r.lastKnownArBalanceCents,
    arBalanceAsOf: r.arBalanceAsOf ? r.arBalanceAsOf.toISOString() : null,
    lastKnownStoreCreditCents: r.lastKnownStoreCreditCents,
    storeCreditAsOf: r.storeCreditAsOf ? r.storeCreditAsOf.toISOString() : null,
    extraFields: (r.extraFieldsJson as Record<string, unknown> | null) ?? null,
    marketingOptIn: r.marketingOptIn,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toFamilyMember(r: PrismaFamilyMemberRow): FamilyMember {
  return {
    id: r.id,
    customerId: r.customerId,
    code: r.code,
    firstName: r.firstName,
    lastName: r.lastName,
    // The column is open-text in Postgres; we narrow to the historical enum
    // at the edge so callers keep the same union type they had on SQLite.
    gender: (r.gender as FamilyMemberGender | null) ?? null,
    birthday: r.birthday,
    comments: r.comments,
    alertFlag: r.alertFlag,
    alertMessage: r.alertMessage,
    extraFields: (r.extraFieldsJson as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function normalizeLegacyText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumberOrNull(value: ImportedNumeric): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return null;
}

function toInteger(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toCurrencyCents(value: ImportedNumeric): number {
  const amount = toNumberOrNull(value);
  return amount == null ? 0 : Math.round(amount * 100);
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseLegacyName(
  name: string | null,
  accountNumber: string,
): Pick<Customer, 'firstName' | 'lastName' | 'displayName'> {
  const normalized = normalizeLegacyText(name);
  if (!normalized) {
    return {
      firstName: null,
      lastName: null,
      displayName: accountNumber,
    };
  }

  const commaIndex = normalized.indexOf(',');
  if (commaIndex >= 0) {
    const lastName = normalizeLegacyText(normalized.slice(0, commaIndex));
    const firstName = normalizeLegacyText(normalized.slice(commaIndex + 1));
    return {
      firstName,
      lastName,
      displayName: normalized,
    };
  }

  return {
    firstName: normalized,
    lastName: null,
    displayName: normalized,
  };
}

function parseAlertComments(...comments: Array<string | null | undefined>): {
  alertFlag: boolean;
  alertMessage: string | null;
  comments: string | null;
} {
  const normalizedComments = comments
    .map((value) => normalizeLegacyText(value))
    .filter((value): value is string => value != null);

  if (normalizedComments.length === 0) {
    return {
      alertFlag: false,
      alertMessage: null,
      comments: null,
    };
  }

  const alertComment = normalizedComments.find((value) => /^\[ALERT\]/i.test(value)) ?? null;
  if (!alertComment) {
    return {
      alertFlag: false,
      alertMessage: null,
      comments: normalizedComments.join('\n\n'),
    };
  }

  const message = normalizeLegacyText(alertComment.replace(/^\[ALERT\]\s*/i, '')) ?? alertComment;
  const remainingComments = normalizedComments.filter((value) => value !== alertComment);
  return {
    alertFlag: true,
    alertMessage: message,
    comments: remainingComments.length > 0 ? remainingComments.join('\n\n') : null,
  };
}

function buildImportedExtraFields(row: ImportedCustomerRow): Record<string, unknown> | null {
  const entries = Object.entries({
    customer_extra_01: normalizeLegacyText(row.legacyProfile?.customerExtra01),
    customer_extra_02: normalizeLegacyText(row.legacyProfile?.customerExtra02),
    customer_extra_03: normalizeLegacyText(row.legacyProfile?.customerExtra03),
    customer_extra_04: normalizeLegacyText(row.legacyProfile?.customerExtra04),
    customer_extra_05: normalizeLegacyText(row.legacyProfile?.customerExtra05),
    customer_extra_06: normalizeLegacyText(row.legacyProfile?.customerExtra06),
    mail_extra_01: normalizeLegacyText(row.legacyProfile?.mailExtra01),
    mail_extra_02: normalizeLegacyText(row.legacyProfile?.mailExtra02),
    mail_extra_03: normalizeLegacyText(row.legacyProfile?.mailExtra03),
    mail_extra_04: normalizeLegacyText(row.legacyProfile?.mailExtra04),
    mail_extra_05: normalizeLegacyText(row.legacyProfile?.mailExtra05),
    mail_extra_06: normalizeLegacyText(row.legacyProfile?.mailExtra06),
    change_to: normalizeLegacyText(row.legacyProfile?.changeTo),
  }).filter(([, value]) => value != null);

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function importedCustomerAccountNumber(row: ImportedCustomerRow): string {
  return (
    normalizeLegacyText(row.ricsAccount) ??
    normalizeLegacyText(row.ricsCode) ??
    normalizeLegacyText(row.honduranIdNormalized) ??
    row.id
  );
}

function toImportedCustomer(row: ImportedCustomerRow): Customer {
  const accountNumber = importedCustomerAccountNumber(row);
  const primaryEmail = row.contacts[0] ?? null;
  const primaryAddress = row.addresses[0] ?? null;
  const { firstName, lastName, displayName } = parseLegacyName(row.fullName, accountNumber);
  const { alertFlag, alertMessage, comments } = parseAlertComments(
    row.legacyProfile?.customerComment,
    row.legacyProfile?.mailComment,
  );
  const dateAdded =
    toIsoString(row.ricsDateAdded) ?? toIsoString(row.firstSeenAt) ?? row.createdAt.toISOString();
  const lastChanged =
    toIsoString(row.ricsDateLastChanged) ??
    toIsoString(row.lastSeenAt) ??
    row.updatedAt.toISOString();

  return {
    id: row.id,
    source: row.source.startsWith('app') ? 'app' : 'imported',
    accountNumber,
    phoneE164: null,
    firstName,
    lastName,
    displayName,
    email: normalizeLegacyText(primaryEmail?.value ?? null),
    addressLine1: normalizeLegacyText(primaryAddress?.addr1 ?? null),
    addressLine2: normalizeLegacyText(primaryAddress?.addr2 ?? null),
    city: normalizeLegacyText(primaryAddress?.city ?? null),
    stateRegion: normalizeLegacyText(primaryAddress?.state ?? null),
    postalCode: normalizeLegacyText(primaryAddress?.zip ?? null),
    country: normalizeLegacyText(primaryAddress?.country ?? null),
    creditLimit: toNumberOrNull(row.financialProfile?.creditLimit ?? null),
    alertFlag,
    alertMessage,
    comments,
    ptdQty: toInteger(row.salesSummaryLegacy?.qtySales01),
    ptdSalesCents: toCurrencyCents(row.salesSummaryLegacy?.dollarSales01 ?? null),
    ytdQty: toInteger(row.salesSummaryLegacy?.qtySales02),
    ytdSalesCents: toCurrencyCents(row.salesSummaryLegacy?.dollarSales02 ?? null),
    ttdQty: toInteger(row.salesSummaryLegacy?.qtySales03),
    ttdSalesCents: toCurrencyCents(row.salesSummaryLegacy?.dollarSales03 ?? null),
    lastYearSalesCents: toCurrencyCents(row.salesSummaryLegacy?.dollarSales04 ?? null),
    dateAdded,
    dateOfLastPurchase: toIsoString(row.salesSummaryLegacy?.dateLastPurchase ?? null),
    lastKnownArBalanceCents: toCurrencyCents(row.financialProfile?.currentBalance ?? null),
    arBalanceAsOf: lastChanged,
    lastKnownStoreCreditCents: toCurrencyCents(row.financialProfile?.creditSlipBalance ?? null),
    storeCreditAsOf: lastChanged,
    extraFields: buildImportedExtraFields(row),
    marketingOptIn: false,
    active: row.status === 'active',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface CustomerProjectionState {
  id: string;
  accountNumber: string;
  phoneE164: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  country: string | null;
  creditLimit: number | null;
  ptdQty: number;
  ptdSalesCents: number;
  ytdQty: number;
  ytdSalesCents: number;
  ttdQty: number;
  ttdSalesCents: number;
  lastYearSalesCents: number;
  dateAdded: Date;
  dateOfLastPurchase: Date | null;
  lastKnownArBalanceCents: number;
  lastKnownStoreCreditCents: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = normalizeLegacyText(value);
  return normalized?.toLowerCase() ?? null;
}

function normalizePhone(value: string | null | undefined): string | null {
  const normalized = normalizeLegacyText(value);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, '');
  return digits.length > 0 ? digits : normalized;
}

function centsToAmount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value / 100 : 0;
}

function buildProjectionIdentities(
  state: CustomerProjectionState,
): Prisma.CustomerIdentityCreateWithoutCustomerInput[] {
  void state;
  return [];
}

function buildProjectionContacts(
  state: CustomerProjectionState,
): Prisma.CustomerContactCreateWithoutCustomerInput[] {
  const rows: Prisma.CustomerContactCreateWithoutCustomerInput[] = [];

  const normalizedEmail = normalizeEmail(state.email);
  if (normalizedEmail && state.email) {
    rows.push({
      contactType: 'email',
      value: state.email,
      normalizedValue: normalizedEmail,
      isPrimary: true,
      source: 'app_manual',
      acceptsMarketing: false,
    });
  }

  const normalizedPhone = normalizePhone(state.phoneE164);
  if (normalizedPhone && state.phoneE164) {
    rows.push({
      contactType: 'phone',
      value: state.phoneE164,
      normalizedValue: normalizedPhone,
      isPrimary: rows.length === 0,
      source: 'app_manual',
      acceptsMarketing: false,
    });
  }

  return rows;
}

function buildProjectionAddresses(
  state: CustomerProjectionState,
): Prisma.CustomerAddressCreateWithoutCustomerInput[] {
  if (
    !state.addressLine1 &&
    !state.addressLine2 &&
    !state.city &&
    !state.stateRegion &&
    !state.postalCode &&
    !state.country
  ) {
    return [];
  }

  return [
    {
      addr1: state.addressLine1,
      addr2: state.addressLine2,
      city: state.city,
      state: state.stateRegion,
      zip: state.postalCode,
      country: state.country ?? 'HN',
      source: 'app_manual',
    },
  ];
}

function buildProjectionStateFromCustomerRow(row: PrismaCustomerRow): CustomerProjectionState {
  return {
    id: row.id,
    accountNumber: row.accountNumber,
    phoneE164: row.phoneE164,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    email: row.email,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    stateRegion: row.stateRegion,
    postalCode: row.postalCode,
    country: row.country,
    creditLimit: row.creditLimit == null ? null : Number(row.creditLimit),
    ptdQty: row.ptdQty,
    ptdSalesCents: row.ptdSalesCents,
    ytdQty: row.ytdQty,
    ytdSalesCents: row.ytdSalesCents,
    ttdQty: row.ttdQty,
    ttdSalesCents: row.ttdSalesCents,
    lastYearSalesCents: row.lastYearSalesCents,
    dateAdded: row.dateAdded,
    dateOfLastPurchase: row.dateOfLastPurchase,
    lastKnownArBalanceCents: row.lastKnownArBalanceCents,
    lastKnownStoreCreditCents: row.lastKnownStoreCreditCents,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildProjectionStateFromInput(
  id: string,
  input: CreateCustomerInput,
  accountNumber: string,
  displayName: string,
  createdAt: Date,
): CustomerProjectionState {
  return {
    id,
    accountNumber,
    phoneE164: input.phoneE164 ?? null,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    displayName,
    email: input.email ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    stateRegion: input.stateRegion ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? null,
    creditLimit: input.creditLimit ?? null,
    ptdQty: 0,
    ptdSalesCents: 0,
    ytdQty: 0,
    ytdSalesCents: 0,
    ttdQty: 0,
    ttdSalesCents: 0,
    lastYearSalesCents: 0,
    dateAdded: createdAt,
    dateOfLastPurchase: null,
    lastKnownArBalanceCents: 0,
    lastKnownStoreCreditCents: 0,
    active: true,
    createdAt,
    updatedAt: createdAt,
  };
}

async function syncCustomerProjection(
  tx: Prisma.TransactionClient,
  state: CustomerProjectionState,
): Promise<void> {
  const identities = buildProjectionIdentities(state);
  const contacts = buildProjectionContacts(state);
  const addresses = buildProjectionAddresses(state);

  await tx.customerIntelligenceCustomer.upsert({
    where: { id: state.id },
    create: {
      id: state.id,
      fullName: state.displayName,
      status: state.active ? 'active' : 'inactive',
      source: 'app_manual',
      firstSeenAt: state.createdAt,
      lastSeenAt: state.updatedAt,
      ricsAccount: null,
      ricsCode: state.accountNumber,
      ricsDateAdded: state.dateAdded,
      ricsDateLastChanged: state.updatedAt,
      identities: identities.length > 0 ? { create: identities } : undefined,
      contacts: contacts.length > 0 ? { create: contacts } : undefined,
      addresses: addresses.length > 0 ? { create: addresses } : undefined,
      financialProfile: {
        create: {
          creditLimit: state.creditLimit,
          currentBalance: centsToAmount(state.lastKnownArBalanceCents),
          creditSlipBalance: centsToAmount(state.lastKnownStoreCreditCents),
        },
      },
      salesSummaryLegacy: {
        create: {
          dateLastPurchase: state.dateOfLastPurchase,
          qtySales01: state.ptdQty,
          qtySales02: state.ytdQty,
          qtySales03: state.ttdQty,
          dollarSales01: centsToAmount(state.ptdSalesCents),
          dollarSales02: centsToAmount(state.ytdSalesCents),
          dollarSales03: centsToAmount(state.ttdSalesCents),
          dollarSales04: centsToAmount(state.lastYearSalesCents),
        },
      },
    },
    update: {
      fullName: state.displayName,
      status: state.active ? 'active' : 'inactive',
      source: 'app_manual',
      lastSeenAt: state.updatedAt,
      ricsAccount: null,
      ricsCode: state.accountNumber,
      ricsDateAdded: state.dateAdded,
      ricsDateLastChanged: state.updatedAt,
      identities: {
        deleteMany: {},
        ...(identities.length > 0 ? { create: identities } : {}),
      },
      contacts: {
        deleteMany: {},
        ...(contacts.length > 0 ? { create: contacts } : {}),
      },
      addresses: {
        deleteMany: {},
        ...(addresses.length > 0 ? { create: addresses } : {}),
      },
      financialProfile: {
        upsert: {
          create: {
            creditLimit: state.creditLimit,
            currentBalance: centsToAmount(state.lastKnownArBalanceCents),
            creditSlipBalance: centsToAmount(state.lastKnownStoreCreditCents),
          },
          update: {
            creditLimit: state.creditLimit,
            currentBalance: centsToAmount(state.lastKnownArBalanceCents),
            creditSlipBalance: centsToAmount(state.lastKnownStoreCreditCents),
          },
        },
      },
      salesSummaryLegacy: {
        upsert: {
          create: {
            dateLastPurchase: state.dateOfLastPurchase,
            qtySales01: state.ptdQty,
            qtySales02: state.ytdQty,
            qtySales03: state.ttdQty,
            dollarSales01: centsToAmount(state.ptdSalesCents),
            dollarSales02: centsToAmount(state.ytdSalesCents),
            dollarSales03: centsToAmount(state.ttdSalesCents),
            dollarSales04: centsToAmount(state.lastYearSalesCents),
          },
          update: {
            dateLastPurchase: state.dateOfLastPurchase,
            qtySales01: state.ptdQty,
            qtySales02: state.ytdQty,
            qtySales03: state.ttdQty,
            dollarSales01: centsToAmount(state.ptdSalesCents),
            dollarSales02: centsToAmount(state.ytdSalesCents),
            dollarSales03: centsToAmount(state.ttdSalesCents),
            dollarSales04: centsToAmount(state.lastYearSalesCents),
          },
        },
      },
    },
  });
}

async function getImportedCustomerRowById(id: string): Promise<ImportedCustomerRow | null> {
  if (!UUID_RE.test(id)) return null;
  return prisma.customerIntelligenceCustomer.findUnique({
    where: { id },
    ...IMPORTED_CUSTOMER_ARGS,
  });
}

async function getImportedCustomerRowByAccountNumber(
  accountNumber: string,
): Promise<ImportedCustomerRow | null> {
  return (
    (await prisma.customerIntelligenceCustomer.findFirst({
      where: {
        OR: [
          { ricsAccount: accountNumber },
          { ricsCode: accountNumber },
          { honduranIdNormalized: accountNumber },
        ],
      },
      ...IMPORTED_CUSTOMER_ARGS,
    })) ?? null
  );
}

async function getImportedCustomerById(id: string): Promise<Customer | null> {
  const row = await getImportedCustomerRowById(id);
  return row ? toImportedCustomer(row) : null;
}

async function getImportedCustomerByAccountNumber(accountNumber: string): Promise<Customer | null> {
  const row = await getImportedCustomerRowByAccountNumber(accountNumber);
  return row ? toImportedCustomer(row) : null;
}

async function getImportedCustomerWithFamily(idOrAccountNumber: string): Promise<CustomerWithFamily | null> {
  const row =
    (await getImportedCustomerRowById(idOrAccountNumber)) ??
    (await getImportedCustomerRowByAccountNumber(idOrAccountNumber));
  if (!row) return null;

  return {
    ...toImportedCustomer(row),
    familyMembers: [],
  };
}

// --- Customer CRUD ---------------------------------------------------------

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  // RICS p. 117 recommends the phone as the account number when not supplied.
  // Falls back to a short uuid-derived tag only when both are missing — rare
  // but we'd rather create the customer than reject on missing identity.
  const accountNumber = input.accountNumber ?? normalizePhoneForAccount(input.phoneE164) ?? cryptoShortId();
  const displayName =
    input.displayName ??
    composeDisplayName(input.firstName ?? null, input.lastName ?? null, accountNumber);
  const id = cryptoUuid();
  const now = new Date();
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        id,
        accountNumber,
        phoneE164: input.phoneE164 ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        displayName,
        email: input.email ?? null,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        stateRegion: input.stateRegion ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? null,
        creditLimit: input.creditLimit ?? null,
        alertFlag: input.alertFlag ?? false,
        alertMessage: input.alertMessage ?? null,
        comments: input.comments ?? null,
        extraFieldsJson: jsonFieldForCreate(input.extraFields),
        marketingOptIn: input.marketingOptIn ?? false,
        dateAdded: now,
      },
    });

    await syncCustomerProjection(
      tx,
      buildProjectionStateFromInput(id, input, accountNumber, displayName, now),
    );

    return created;
  });
  return toCustomer(row);
}

// Prisma distinguishes "JSON null" from "SQL NULL" on nullable JSON columns.
// For extra_fields_json we always want SQL NULL when the caller passes null
// (never the JSON token `null`) — `Prisma.DbNull` is the correct sentinel.
// Undefined on create would skip the column entirely, but we want an explicit
// NULL so the row's column value is deterministic; for update we return
// undefined to skip the field so a patch without `extraFields` leaves the row
// untouched.
function jsonFieldForCreate(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value == null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}
function jsonFieldForUpdate(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const row = await prisma.customer.findUnique({ where: { id } });
  if (row) return toCustomer(row);
  return (await getImportedCustomerById(id)) ?? getImportedCustomerByAccountNumber(id);
}

export async function getCustomerByAccountNumber(accountNumber: string): Promise<Customer | null> {
  const row = await prisma.customer.findUnique({ where: { accountNumber } });
  if (row) return toCustomer(row);
  return getImportedCustomerByAccountNumber(accountNumber);
}

export async function getCustomerWithFamily(id: string): Promise<CustomerWithFamily | null> {
  const row = await prisma.customer.findUnique({
    where: { id },
    include: { familyMembers: { orderBy: { code: 'asc' } } },
  });
  if (row) {
    const { familyMembers, ...customerRow } = row;
    return {
      ...toCustomer(customerRow),
      familyMembers: familyMembers.map(toFamilyMember),
    };
  }

  return getImportedCustomerWithFamily(id);
}

export async function updateCustomer(id: string, input: UpdateCustomerInput): Promise<Customer | null> {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) return null;

  const data: Prisma.CustomerUpdateInput = {};
  if (input.accountNumber !== undefined) data.accountNumber = input.accountNumber;
  if (input.phoneE164 !== undefined) data.phoneE164 = input.phoneE164;
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.email !== undefined) data.email = input.email;
  if (input.addressLine1 !== undefined) data.addressLine1 = input.addressLine1;
  if (input.addressLine2 !== undefined) data.addressLine2 = input.addressLine2;
  if (input.city !== undefined) data.city = input.city;
  if (input.stateRegion !== undefined) data.stateRegion = input.stateRegion;
  if (input.postalCode !== undefined) data.postalCode = input.postalCode;
  if (input.country !== undefined) data.country = input.country;
  if (input.creditLimit !== undefined) data.creditLimit = input.creditLimit;
  if (input.alertFlag !== undefined) data.alertFlag = input.alertFlag;
  if (input.alertMessage !== undefined) data.alertMessage = input.alertMessage;
  if (input.comments !== undefined) data.comments = input.comments;
  if (input.extraFields !== undefined) {
    data.extraFieldsJson = jsonFieldForUpdate(input.extraFields);
  }
  if (input.marketingOptIn !== undefined) data.marketingOptIn = input.marketingOptIn;
  if (input.active !== undefined) data.active = input.active;

  // Recompute display_name when names change unless explicitly overridden.
  const mergedFirst = input.firstName !== undefined ? input.firstName : existing.firstName;
  const mergedLast = input.lastName !== undefined ? input.lastName : existing.lastName;
  const mergedAccount =
    input.accountNumber !== undefined ? input.accountNumber : existing.accountNumber;
  if (input.displayName !== undefined) {
    data.displayName =
      input.displayName ?? composeDisplayName(mergedFirst, mergedLast, mergedAccount);
  } else if (
    input.firstName !== undefined ||
    input.lastName !== undefined ||
    input.accountNumber !== undefined
  ) {
    data.displayName = composeDisplayName(mergedFirst, mergedLast, mergedAccount);
  }

  // No-op update? Return the unchanged row. Matches the SQLite-era behavior
  // (which skipped the UPDATE when `sets.length === 0`).
  if (Object.keys(data).length === 0) return toCustomer(existing);

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.customer.update({ where: { id }, data });
    await syncCustomerProjection(tx, buildProjectionStateFromCustomerRow(updated));
    return updated;
  });
  return toCustomer(row);
}

export async function deleteCustomer(id: string): Promise<{ deleted: boolean; blocked?: boolean }> {
  const existing = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { deleted: false };

  // Block delete if the customer is referenced by an open sales ticket — RICS
  // guard at p. 127: never delete a customer with a live A/R or recent-statement
  // balance.
  //
  // TODO(sales-pos migration): `pos_sales_tickets` still lives in the legacy
  // SQLite admin DB. When that table moves to Postgres, swap this read for a
  // Prisma `posSalesTicket.count({ where: { customerAccountId: id } })`.
  const db = getDb();
  const ticketRef = db
    .prepare('SELECT COUNT(*) AS cnt FROM pos_sales_tickets WHERE customer_account_id = ?')
    .get(id) as { cnt: number } | undefined;
  if (ticketRef && ticketRef.cnt > 0) return { deleted: false, blocked: true };

  await prisma.$transaction(async (tx) => {
    await tx.customer.delete({ where: { id } });
    await tx.customerIntelligenceCustomer.deleteMany({
      where: { id, source: 'app_manual' },
    });
  });
  return { deleted: true };
}

// --- Customer list + search ------------------------------------------------

export async function listCustomers(
  params: CustomerListParams,
): Promise<PaginationEnvelope<Customer>> {
  const where = buildImportedCustomerWhere(params.q, params.active);
  const offset = (params.page - 1) * params.pageSize;

  const [totalItems, rows] = await Promise.all([
    prisma.customerIntelligenceCustomer.count({ where }),
    prisma.customerIntelligenceCustomer.findMany({
      where,
      ...IMPORTED_CUSTOMER_ARGS,
      orderBy: importedCustomerOrderBy(params),
      take: params.pageSize,
      skip: offset,
    }),
  ]);

  return {
    data: rows.map(toImportedCustomer),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages: Math.max(Math.ceil(totalItems / params.pageSize), 1),
    },
  };
}

// Lightweight typeahead for the POS header. Matches on account number, name,
// phone, email. Returns a small, deliberately unpaginated list.
//
// Exact-match priority (account_number === q, then phone_e164 === q, then
// anything else) is preserved from the SQLite version. Prisma's `orderBy`
// does not take a raw CASE expression, so we fetch `limit * 3` candidates via
// the broad LIKE match and re-rank in memory before trimming to `limit`. For
// typeahead-sized N (10–50) this is trivial work.
export async function searchCustomers(q: string, limit = 10): Promise<Customer[]> {
  const contains = { contains: q, mode: 'insensitive' as const };
  const [appRows, importedRows] = await Promise.all([
    prisma.customer.findMany({
      where: {
        active: true,
        OR: [
          { accountNumber: contains },
          { displayName: contains },
          { firstName: contains },
          { lastName: contains },
          { phoneE164: contains },
          { email: contains },
        ],
      },
      orderBy: { displayName: 'asc' },
      take: limit * 3,
    }),
    prisma.customerIntelligenceCustomer.findMany({
      where: buildImportedCustomerWhere(q, true),
      ...IMPORTED_CUSTOMER_ARGS,
      orderBy: importedCustomerOrderBy({
        page: 1,
        pageSize: limit,
        sort: 'displayName',
        order: 'asc',
        q,
        active: true,
      }),
      take: limit * 3,
    }),
  ]);

  const deduped = new Map<string, Customer>();
  for (const customer of [...appRows.map(toCustomer), ...importedRows.map(toImportedCustomer)]) {
    const key = customer.accountNumber || customer.id;
    if (!deduped.has(key)) deduped.set(key, customer);
  }

  return [...deduped.values()]
    .map((customer) => ({
      customer,
      rank:
        customer.accountNumber === q
          ? 0
          : customer.phoneE164 === q || customer.email === q
            ? 1
            : 2,
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.customer.displayName.localeCompare(b.customer.displayName) ||
        a.customer.accountNumber.localeCompare(b.customer.accountNumber),
    )
    .slice(0, limit)
    .map(({ customer }) => customer);
}

// --- Balance projections ---------------------------------------------------

// Placeholders until accounts-receivable / customer-transactions land their
// real sources. Stage 1.5 will wire these to real calculations.
export async function getCustomerBalances(id: string): Promise<{
  arBalanceCents: number;
  arBalanceAsOf: string | null;
  storeCreditCents: number;
  storeCreditAsOf: string | null;
} | null> {
  const customer = await getCustomerById(id);
  if (!customer) return null;
  return {
    arBalanceCents: customer.lastKnownArBalanceCents,
    arBalanceAsOf: customer.arBalanceAsOf,
    storeCreditCents: customer.lastKnownStoreCreditCents,
    storeCreditAsOf: customer.storeCreditAsOf,
  };
}

// --- Family members --------------------------------------------------------

export async function listFamilyMembers(customerId: string): Promise<FamilyMember[]> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (customer) {
    const rows = await prisma.familyMember.findMany({
      where: { customerId },
      orderBy: { code: 'asc' },
    });
    return rows.map(toFamilyMember);
  }

  const importedCustomer =
    (await getImportedCustomerById(customerId)) ?? (await getImportedCustomerByAccountNumber(customerId));
  if (importedCustomer) return [];

  return [];
}

export async function getFamilyMember(id: string): Promise<FamilyMember | null> {
  const row = await prisma.familyMember.findUnique({ where: { id } });
  return row ? toFamilyMember(row) : null;
}

export async function createFamilyMember(
  customerId: string,
  input: CreateFamilyMemberInput,
): Promise<FamilyMember> {
  // Validate parent customer before the insert. A Prisma P2003 FK failure
  // would also bubble up, but the explicit check lets us throw the historical
  // `CUSTOMER_NOT_FOUND` string the route handler already maps to 404.
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

  const row = await prisma.familyMember.create({
    data: {
      customerId,
      code: input.code,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      gender: input.gender ?? null,
      birthday: input.birthday ?? null,
      comments: input.comments ?? null,
      alertFlag: input.alertFlag ?? false,
      alertMessage: input.alertMessage ?? null,
      extraFieldsJson: jsonFieldForCreate(input.extraFields),
    },
  });
  return toFamilyMember(row);
}

export async function updateFamilyMember(
  id: string,
  input: UpdateFamilyMemberInput,
): Promise<FamilyMember | null> {
  const existing = await prisma.familyMember.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;

  const data: Prisma.FamilyMemberUpdateInput = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.gender !== undefined) data.gender = input.gender;
  if (input.birthday !== undefined) data.birthday = input.birthday;
  if (input.comments !== undefined) data.comments = input.comments;
  if (input.alertFlag !== undefined) data.alertFlag = input.alertFlag;
  if (input.alertMessage !== undefined) data.alertMessage = input.alertMessage;
  if (input.extraFields !== undefined) {
    data.extraFieldsJson = jsonFieldForUpdate(input.extraFields);
  }

  if (Object.keys(data).length === 0) return getFamilyMember(id);

  const row = await prisma.familyMember.update({ where: { id }, data });
  return toFamilyMember(row);
}

export async function deleteFamilyMember(id: string): Promise<boolean> {
  try {
    await prisma.familyMember.delete({ where: { id } });
    return true;
  } catch (err) {
    // Prisma throws P2025 ("Record to delete does not exist") when the id is
    // unknown. Service contract preserves the SQLite `.changes > 0` boolean
    // return so the route layer can 404 cleanly.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return false;
    }
    throw err;
  }
}

// --- Helpers ---------------------------------------------------------------

function normalizePhoneForAccount(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // RICS convention (p. 117): phone with no parens or dashes. Strip everything
  // non-digit, then truncate to 15 chars to fit the legacy field width.
  const stripped = phone.replace(/\D/g, '');
  return stripped.slice(0, 15) || null;
}

// Used only when BOTH an explicit accountNumber and a phone are missing on
// createCustomer — previously the code reached for `randomUUID().slice(0, 15)`,
// which pulled in `node:crypto`. Prisma gives us a UUID via `@default(uuid())`
// on the id column, so we only need this fallback for the account_number field.
function cryptoShortId(): string {
  // 15 hex chars is enough entropy for a collision-resistant short id at the
  // sizes this branch fires (operator enters a customer with no phone AND no
  // account number — edge case, mostly tests).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return randomUUID().slice(0, 15);
}

function cryptoUuid(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return randomUUID();
}

