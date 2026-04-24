import { Prisma } from '@prisma/client';
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

function toCustomer(r: PrismaCustomerRow): Customer {
  return {
    id: r.id,
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
  return row ? toCustomer(row) : null;
}

export async function getCustomerByAccountNumber(accountNumber: string): Promise<Customer | null> {
  const row = await prisma.customer.findUnique({ where: { accountNumber } });
  return row ? toCustomer(row) : null;
}

export async function getCustomerWithFamily(id: string): Promise<CustomerWithFamily | null> {
  const row = await prisma.customer.findUnique({
    where: { id },
    include: { familyMembers: { orderBy: { code: 'asc' } } },
  });
  if (!row) return null;
  const { familyMembers, ...customerRow } = row;
  return {
    ...toCustomer(customerRow),
    familyMembers: familyMembers.map(toFamilyMember),
  };
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

const SORT_MAP: Record<
  NonNullable<CustomerListParams['sort']>,
  keyof Prisma.CustomerOrderByWithRelationInput
> = {
  displayName: 'displayName',
  accountNumber: 'accountNumber',
  dateAdded: 'dateAdded',
  dateOfLastPurchase: 'dateOfLastPurchase',
  ytdSalesCents: 'ytdSalesCents',
};

export async function listCustomers(
  params: CustomerListParams,
): Promise<PaginationEnvelope<Customer>> {
  const where: Prisma.CustomerWhereInput = {};

  if (params.active !== undefined) where.active = params.active;

  if (params.q) {
    // Case-insensitive contains — matches SQLite's default LIKE (which is
    // case-insensitive for ASCII). Six-column OR mirrors the pre-Prisma query.
    const contains = { contains: params.q, mode: 'insensitive' as const };
    where.OR = [
      { accountNumber: contains },
      { displayName: contains },
      { firstName: contains },
      { lastName: contains },
      { phoneE164: contains },
      { email: contains },
    ];
  }

  const sortKey = SORT_MAP[params.sort ?? 'displayName'];
  const sortDir = params.order === 'desc' ? 'desc' : 'asc';
  const offset = (params.page - 1) * params.pageSize;

  const [totalItems, rows] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { [sortKey]: sortDir },
      take: params.pageSize,
      skip: offset,
    }),
  ]);

  return {
    data: rows.map(toCustomer),
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
  const rows = await prisma.customer.findMany({
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
  });

  const ranked = rows
    .map((r) => ({
      row: r,
      rank: r.accountNumber === q ? 0 : r.phoneE164 === q ? 1 : 2,
    }))
    .sort((a, b) => a.rank - b.rank || a.row.displayName.localeCompare(b.row.displayName));

  return ranked.slice(0, limit).map(({ row }) => toCustomer(row));
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
  const rows = await prisma.familyMember.findMany({
    where: { customerId },
    orderBy: { code: 'asc' },
  });
  return rows.map(toFamilyMember);
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
