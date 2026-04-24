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
type MirrorNumeric = Prisma.Decimal | number | string | bigint | null;

interface MirrorCustomerRow {
  account: string | null;
  name: string | null;
  addr1: string | null;
  addr2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  credit_limit: MirrorNumeric;
  curr_bal: MirrorNumeric;
  cred_slip: MirrorNumeric;
  status: string | null;
  date_added: Date | string | null;
  date_lst_purch: Date | string | null;
  e_mail: string | null;
  extra_01: string | null;
  extra_02: string | null;
  extra_03: string | null;
  extra_04: string | null;
  extra_05: string | null;
  extra_06: string | null;
  qty_sales_01: number | null;
  qty_sales_02: number | null;
  qty_sales_03: number | null;
  qty_sales_04: number | null;
  dollar_sales_01: MirrorNumeric;
  dollar_sales_02: MirrorNumeric;
  dollar_sales_03: MirrorNumeric;
  dollar_sales_04: MirrorNumeric;
  comment: string | null;
  date_last_changed: Date | string | null;
}

interface MirrorFamilyMemberRow {
  account: string | null;
  code: string | null;
  name: string | null;
  gender: string | null;
  date_added: Date | string | null;
  birthday: Date | string | null;
  extra_01: string | null;
  extra_02: string | null;
  extra_03: string | null;
  extra_04: string | null;
  extra_05: string | null;
  extra_06: string | null;
  comment: string | null;
  date_last_changed: Date | string | null;
}

const MIRROR_CUSTOMER_SELECT = `
  SELECT
    account,
    name,
    addr1,
    addr2,
    city,
    state,
    zip,
    credit_limit::double precision AS credit_limit,
    curr_bal::double precision AS curr_bal,
    cred_slip::double precision AS cred_slip,
    status,
    date_added,
    date_lst_purch,
    e_mail,
    extra_01,
    extra_02,
    extra_03,
    extra_04,
    extra_05,
    extra_06,
    qty_sales_01::integer AS qty_sales_01,
    qty_sales_02::integer AS qty_sales_02,
    qty_sales_03::integer AS qty_sales_03,
    qty_sales_04::integer AS qty_sales_04,
    dollar_sales_01::double precision AS dollar_sales_01,
    dollar_sales_02::double precision AS dollar_sales_02,
    dollar_sales_03::double precision AS dollar_sales_03,
    dollar_sales_04::double precision AS dollar_sales_04,
    comment,
    date_last_changed
  FROM rics_mirror.mail_list_names
`;

const MIRROR_FAMILY_SELECT = `
  SELECT
    account,
    code,
    name,
    gender,
    date_added,
    birthday,
    extra_01,
    extra_02,
    extra_03,
    extra_04,
    extra_05,
    extra_06,
    comment,
    date_last_changed
  FROM rics_mirror.mail_list_family
`;

const MIRROR_SORT_MAP: Record<NonNullable<CustomerListParams['sort']>, string> = {
  displayName: 'LOWER(COALESCE(name, \'\'))',
  accountNumber: 'LOWER(COALESCE(account, \'\'))',
  dateAdded: 'date_added',
  dateOfLastPurchase: 'date_lst_purch',
  // RICS stores four sales buckets; field order + the manual's PTD/YTD/TTD/Last Year
  // terminology map cleanly to 01/02/03/04.
  ytdSalesCents: 'dollar_sales_02',
};

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

function toNumberOrNull(value: MirrorNumeric): number | null {
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

function toCurrencyCents(value: MirrorNumeric): number {
  const amount = toNumberOrNull(value);
  return amount == null ? 0 : Math.round(amount * 100);
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateOnly(value: Date | string | null | undefined): string | null {
  const iso = toIsoString(value);
  return iso ? iso.slice(0, 10) : null;
}

function parseMirrorName(
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

function parseMirrorAlert(comment: string | null): {
  alertFlag: boolean;
  alertMessage: string | null;
  comments: string | null;
} {
  const normalized = normalizeLegacyText(comment);
  if (!normalized) {
    return {
      alertFlag: false,
      alertMessage: null,
      comments: null,
    };
  }

  const match = normalized.match(/^\[ALERT\]\s*(.*)$/is);
  if (!match) {
    return {
      alertFlag: false,
      alertMessage: null,
      comments: normalized,
    };
  }

  const message = normalizeLegacyText(match[1]) ?? normalized;
  return {
    alertFlag: true,
    alertMessage: message,
    comments: null,
  };
}

function buildMirrorExtraFields(row: {
  extra_01: string | null;
  extra_02: string | null;
  extra_03: string | null;
  extra_04: string | null;
  extra_05: string | null;
  extra_06: string | null;
}): Record<string, unknown> | null {
  const entries = Object.entries({
    extra_01: normalizeLegacyText(row.extra_01),
    extra_02: normalizeLegacyText(row.extra_02),
    extra_03: normalizeLegacyText(row.extra_03),
    extra_04: normalizeLegacyText(row.extra_04),
    extra_05: normalizeLegacyText(row.extra_05),
    extra_06: normalizeLegacyText(row.extra_06),
  }).filter(([, value]) => value != null);

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function mirrorCustomerId(row: MirrorCustomerRow): string {
  const accountNumber = normalizeLegacyText(row.account);
  if (accountNumber) return accountNumber;

  const parts = [
    normalizeLegacyText(row.name),
    normalizeLegacyText(row.city),
    normalizeLegacyText(row.state),
    toDateOnly(row.date_added),
  ].filter(Boolean);

  return `mirror:${parts.join('|') || 'missing-account'}`;
}

function toMirrorCustomer(row: MirrorCustomerRow): Customer {
  const accountNumber = normalizeLegacyText(row.account) ?? '';
  const { firstName, lastName, displayName } = parseMirrorName(row.name, accountNumber);
  const { alertFlag, alertMessage, comments } = parseMirrorAlert(row.comment);
  const dateAdded = toIsoString(row.date_added);
  const dateLastChanged = toIsoString(row.date_last_changed);

  return {
    id: mirrorCustomerId(row),
    source: 'mirror',
    accountNumber,
    phoneE164: null,
    firstName,
    lastName,
    displayName,
    email: normalizeLegacyText(row.e_mail),
    addressLine1: normalizeLegacyText(row.addr1),
    addressLine2: normalizeLegacyText(row.addr2),
    city: normalizeLegacyText(row.city),
    stateRegion: normalizeLegacyText(row.state),
    postalCode: normalizeLegacyText(row.zip),
    country: null,
    creditLimit: toNumberOrNull(row.credit_limit),
    alertFlag,
    alertMessage,
    comments,
    ptdQty: toInteger(row.qty_sales_01),
    ptdSalesCents: toCurrencyCents(row.dollar_sales_01),
    ytdQty: toInteger(row.qty_sales_02),
    ytdSalesCents: toCurrencyCents(row.dollar_sales_02),
    ttdQty: toInteger(row.qty_sales_03),
    ttdSalesCents: toCurrencyCents(row.dollar_sales_03),
    lastYearSalesCents: toCurrencyCents(row.dollar_sales_04),
    dateAdded: dateAdded ?? new Date(0).toISOString(),
    dateOfLastPurchase: toIsoString(row.date_lst_purch),
    lastKnownArBalanceCents: toCurrencyCents(row.curr_bal),
    arBalanceAsOf: toIsoString(row.date_last_changed),
    lastKnownStoreCreditCents: toCurrencyCents(row.cred_slip),
    storeCreditAsOf: toIsoString(row.date_last_changed),
    extraFields: buildMirrorExtraFields(row),
    marketingOptIn: false,
    active: true,
    createdAt: dateAdded ?? dateLastChanged ?? new Date(0).toISOString(),
    updatedAt: dateLastChanged ?? dateAdded ?? new Date(0).toISOString(),
  };
}

function toMirrorFamilyMember(row: MirrorFamilyMemberRow): FamilyMember {
  const accountNumber = normalizeLegacyText(row.account) ?? '';
  const normalizedCode = normalizeLegacyText(row.code) ?? '';
  const birthday = toDateOnly(row.birthday);
  const dateAdded = toIsoString(row.date_added);
  const dateLastChanged = toIsoString(row.date_last_changed);
  const { alertFlag, alertMessage, comments } = parseMirrorAlert(row.comment);
  const parsedName = parseMirrorName(row.name, normalizedCode || accountNumber);

  return {
    id: `${accountNumber}:${normalizedCode || parsedName.displayName}`,
    customerId: accountNumber,
    code: normalizedCode,
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
    gender: (normalizeLegacyText(row.gender) as FamilyMemberGender | null) ?? null,
    birthday,
    comments,
    alertFlag,
    alertMessage,
    extraFields: buildMirrorExtraFields(row),
    createdAt: dateAdded ?? dateLastChanged ?? new Date(0).toISOString(),
    updatedAt: dateLastChanged ?? dateAdded ?? new Date(0).toISOString(),
  };
}

async function getMirrorCustomerByAccountNumber(accountNumber: string): Promise<Customer | null> {
  const rows = await prisma.$queryRawUnsafe<MirrorCustomerRow[]>(
    `${MIRROR_CUSTOMER_SELECT}
     WHERE account = $1
     LIMIT 1`,
    accountNumber,
  );
  return rows.length > 0 ? toMirrorCustomer(rows[0]) : null;
}

async function getMirrorCustomerWithFamily(accountNumber: string): Promise<CustomerWithFamily | null> {
  const [customer, familyRows] = await Promise.all([
    getMirrorCustomerByAccountNumber(accountNumber),
    prisma.$queryRawUnsafe<MirrorFamilyMemberRow[]>(
      `${MIRROR_FAMILY_SELECT}
       WHERE account = $1
       ORDER BY code ASC NULLS LAST, name ASC NULLS LAST`,
      accountNumber,
    ),
  ]);

  if (!customer) return null;

  return {
    ...customer,
    familyMembers: familyRows.map(toMirrorFamilyMember),
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

  const row = await prisma.customer.create({
    data: {
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
    },
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
  return getMirrorCustomerByAccountNumber(id);
}

export async function getCustomerByAccountNumber(accountNumber: string): Promise<Customer | null> {
  const row = await prisma.customer.findUnique({ where: { accountNumber } });
  if (row) return toCustomer(row);
  return getMirrorCustomerByAccountNumber(accountNumber);
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

  return getMirrorCustomerWithFamily(id);
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

  const row = await prisma.customer.update({ where: { id }, data });
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

  await prisma.customer.delete({ where: { id } });
  return { deleted: true };
}

// --- Customer list + search ------------------------------------------------

export async function listCustomers(
  params: CustomerListParams,
): Promise<PaginationEnvelope<Customer>> {
  if (params.active === false) {
    return {
      data: [],
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        totalItems: 0,
        totalPages: 1,
      },
    };
  }

  const values: unknown[] = [];
  const where: string[] = [];

  if (params.q && params.q.trim().length > 0) {
    values.push(`%${params.q.trim()}%`);
    const i = values.length;
    where.push(
      `(COALESCE(account, '') ILIKE $${i} OR ` +
        `COALESCE(name, '') ILIKE $${i} OR ` +
        `COALESCE(e_mail, '') ILIKE $${i} OR ` +
        `COALESCE(city, '') ILIKE $${i} OR ` +
        `COALESCE(state, '') ILIKE $${i} OR ` +
        `COALESCE(zip, '') ILIKE $${i})`,
    );
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const sortKey = MIRROR_SORT_MAP[params.sort ?? 'displayName'];
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';
  const offset = (params.page - 1) * params.pageSize;

  const [totalItems, rows] = await Promise.all([
    prisma.$queryRawUnsafe<{ total: bigint }[]>(
      `SELECT COUNT(*)::bigint AS total
       FROM rics_mirror.mail_list_names
       ${whereClause}`,
      ...values,
    ),
    prisma.$queryRawUnsafe<MirrorCustomerRow[]>(
      `${MIRROR_CUSTOMER_SELECT}
       ${whereClause}
       ORDER BY ${sortKey} ${sortDir} NULLS LAST, account ASC NULLS LAST
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      ...values,
      params.pageSize,
      offset,
    ),
  ]);
  const totalCount = Number(totalItems[0]?.total ?? 0n);

  return {
    data: rows.map(toMirrorCustomer),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems: totalCount,
      totalPages: Math.max(Math.ceil(totalCount / params.pageSize), 1),
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
  const [appRows, mirrorRows] = await Promise.all([
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
    prisma.$queryRawUnsafe<MirrorCustomerRow[]>(
      `${MIRROR_CUSTOMER_SELECT}
       WHERE COALESCE(account, '') ILIKE $1
          OR COALESCE(name, '') ILIKE $1
          OR COALESCE(e_mail, '') ILIKE $1
          OR COALESCE(city, '') ILIKE $1
          OR COALESCE(state, '') ILIKE $1
       ORDER BY
         CASE
           WHEN account = $2 THEN 0
           WHEN LOWER(COALESCE(name, '')) = LOWER($2) THEN 1
           ELSE 2
         END,
         LOWER(COALESCE(name, '')) ASC,
         account ASC NULLS LAST
       LIMIT $3`,
      `%${q}%`,
      q,
      limit * 3,
    ),
  ]);

  const deduped = new Map<string, Customer>();
  for (const customer of [...appRows.map(toCustomer), ...mirrorRows.map(toMirrorCustomer)]) {
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

  const rows = await prisma.$queryRawUnsafe<MirrorFamilyMemberRow[]>(
    `${MIRROR_FAMILY_SELECT}
     WHERE account = $1
     ORDER BY code ASC NULLS LAST, name ASC NULLS LAST`,
    customerId,
  );
  return rows.map(toMirrorFamilyMember);
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

