import { randomUUID } from 'node:crypto';
import { getDb } from '../db/database';
import {
  Customer,
  CustomerRow,
  CustomerWithFamily,
  FamilyMember,
  FamilyMemberRow,
  FamilyMemberGender,
  composeDisplayName,
  rowToCustomer,
  rowToFamilyMember,
} from '../models/customer';
import { PaginationEnvelope } from '../models/sku';

type DbValue = null | number | bigint | string;

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

// --- Customer CRUD ---------------------------------------------------------

export function createCustomer(input: CreateCustomerInput): Customer {
  const db = getDb();
  const id = randomUUID();
  // RICS p. 117 recommends the phone as the account number when not supplied.
  const accountNumber = input.accountNumber ?? normalizePhoneForAccount(input.phoneE164) ?? id.slice(0, 15);
  const displayName = input.displayName ?? composeDisplayName(input.firstName ?? null, input.lastName ?? null, accountNumber);

  db.prepare(
    `INSERT INTO customers (
      id, account_number, phone_e164, first_name, last_name, display_name, email,
      address_line1, address_line2, city, state_region, postal_code, country,
      credit_limit, alert_flag, alert_message, comments,
      extra_fields_json, marketing_opt_in
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    accountNumber,
    input.phoneE164 ?? null,
    input.firstName ?? null,
    input.lastName ?? null,
    displayName,
    input.email ?? null,
    input.addressLine1 ?? null,
    input.addressLine2 ?? null,
    input.city ?? null,
    input.stateRegion ?? null,
    input.postalCode ?? null,
    input.country ?? null,
    input.creditLimit ?? null,
    input.alertFlag ? 1 : 0,
    input.alertMessage ?? null,
    input.comments ?? null,
    input.extraFields ? JSON.stringify(input.extraFields) : null,
    input.marketingOptIn ? 1 : 0,
  );

  return getCustomerById(id)!;
}

export function getCustomerById(id: string): Customer | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow | undefined;
  return row ? rowToCustomer(row) : null;
}

export function getCustomerByAccountNumber(accountNumber: string): Customer | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM customers WHERE account_number = ?').get(accountNumber) as CustomerRow | undefined;
  return row ? rowToCustomer(row) : null;
}

export function getCustomerWithFamily(id: string): CustomerWithFamily | null {
  const customer = getCustomerById(id);
  if (!customer) return null;
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM customer_family_members WHERE customer_id = ? ORDER BY code'
  ).all(id) as FamilyMemberRow[];
  return { ...customer, familyMembers: rows.map(rowToFamilyMember) };
}

export function updateCustomer(id: string, input: UpdateCustomerInput): Customer | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow | undefined;
  if (!existing) return null;

  const sets: string[] = [];
  const values: DbValue[] = [];

  const assign = (col: string, value: DbValue) => {
    sets.push(`${col} = ?`);
    values.push(value);
  };

  if (input.accountNumber !== undefined) assign('account_number', input.accountNumber);
  if (input.phoneE164 !== undefined) assign('phone_e164', input.phoneE164);
  if (input.firstName !== undefined) assign('first_name', input.firstName);
  if (input.lastName !== undefined) assign('last_name', input.lastName);
  if (input.email !== undefined) assign('email', input.email);
  if (input.addressLine1 !== undefined) assign('address_line1', input.addressLine1);
  if (input.addressLine2 !== undefined) assign('address_line2', input.addressLine2);
  if (input.city !== undefined) assign('city', input.city);
  if (input.stateRegion !== undefined) assign('state_region', input.stateRegion);
  if (input.postalCode !== undefined) assign('postal_code', input.postalCode);
  if (input.country !== undefined) assign('country', input.country);
  if (input.creditLimit !== undefined) assign('credit_limit', input.creditLimit);
  if (input.alertFlag !== undefined) assign('alert_flag', input.alertFlag ? 1 : 0);
  if (input.alertMessage !== undefined) assign('alert_message', input.alertMessage);
  if (input.comments !== undefined) assign('comments', input.comments);
  if (input.extraFields !== undefined) assign('extra_fields_json', input.extraFields ? JSON.stringify(input.extraFields) : null);
  if (input.marketingOptIn !== undefined) assign('marketing_opt_in', input.marketingOptIn ? 1 : 0);
  if (input.active !== undefined) assign('active', input.active ? 1 : 0);

  // Recompute display_name when names change unless explicitly overridden.
  const mergedFirst = input.firstName !== undefined ? input.firstName : existing.first_name;
  const mergedLast = input.lastName !== undefined ? input.lastName : existing.last_name;
  const mergedAccount = input.accountNumber !== undefined ? input.accountNumber : existing.account_number;
  if (input.displayName !== undefined) {
    assign('display_name', input.displayName ?? composeDisplayName(mergedFirst, mergedLast, mergedAccount));
  } else if (input.firstName !== undefined || input.lastName !== undefined || input.accountNumber !== undefined) {
    assign('display_name', composeDisplayName(mergedFirst, mergedLast, mergedAccount));
  }

  if (sets.length === 0) return rowToCustomer(existing);

  sets.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getCustomerById(id);
}

export function deleteCustomer(id: string): { deleted: boolean; blocked?: boolean } {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id) as { id: string } | undefined;
  if (!existing) return { deleted: false };

  // Block delete if the customer is referenced by an open sales ticket. Catches the RICS
  // guard at p. 127: never delete a customer with a live A/R or recent-statement balance.
  const ticketRef = db.prepare(
    'SELECT COUNT(*) AS cnt FROM pos_sales_tickets WHERE customer_account_id = ?'
  ).get(id) as { cnt: number } | undefined;
  if (ticketRef && ticketRef.cnt > 0) return { deleted: false, blocked: true };

  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  return { deleted: true };
}

// --- Customer list + search ------------------------------------------------

const SORT_MAP: Record<string, string> = {
  displayName: 'display_name',
  accountNumber: 'account_number',
  dateAdded: 'date_added',
  dateOfLastPurchase: 'date_of_last_purchase',
  ytdSalesCents: 'ytd_sales_cents',
};

export function listCustomers(params: CustomerListParams): PaginationEnvelope<Customer> {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.active !== undefined) {
    conditions.push('active = ?');
    values.push(params.active ? 1 : 0);
  }

  if (params.q) {
    const pattern = `%${params.q}%`;
    conditions.push(
      '(account_number LIKE ? OR display_name LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR phone_e164 LIKE ? OR email LIKE ?)'
    );
    values.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM customers ${whereClause}`).get(...values) as { cnt: number };
  const totalItems = countRow.cnt;

  const sortCol = SORT_MAP[params.sort ?? 'displayName'] ?? 'display_name';
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';
  const offset = (params.page - 1) * params.pageSize;

  const rows = db.prepare(
    `SELECT * FROM customers ${whereClause} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`
  ).all(...values, params.pageSize, offset) as CustomerRow[];

  return {
    data: rows.map(rowToCustomer),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages: Math.max(Math.ceil(totalItems / params.pageSize), 1),
    },
  };
}

// Lightweight typeahead for the POS header. Matches on account number, name, phone, email.
// Returns a small, deliberately unpaginated list.
export function searchCustomers(q: string, limit = 10): Customer[] {
  const db = getDb();
  const pattern = `%${q}%`;
  const rows = db.prepare(
    `SELECT * FROM customers
     WHERE active = 1
       AND (account_number LIKE ? OR display_name LIKE ? OR first_name LIKE ?
            OR last_name LIKE ? OR phone_e164 LIKE ? OR email LIKE ?)
     ORDER BY
       CASE WHEN account_number = ? THEN 0
            WHEN phone_e164 = ? THEN 1
            ELSE 2 END,
       display_name ASC
     LIMIT ?`
  ).all(pattern, pattern, pattern, pattern, pattern, pattern, q, q, limit) as CustomerRow[];
  return rows.map(rowToCustomer);
}

// --- Balance projections ---------------------------------------------------

// Placeholders until accounts-receivable / customer-transactions land their real sources.
// Stage 1.5 will wire these to real calculations.
export function getCustomerBalances(id: string): {
  arBalanceCents: number;
  arBalanceAsOf: string | null;
  storeCreditCents: number;
  storeCreditAsOf: string | null;
} | null {
  const customer = getCustomerById(id);
  if (!customer) return null;
  return {
    arBalanceCents: customer.lastKnownArBalanceCents,
    arBalanceAsOf: customer.arBalanceAsOf,
    storeCreditCents: customer.lastKnownStoreCreditCents,
    storeCreditAsOf: customer.storeCreditAsOf,
  };
}

// --- Family members --------------------------------------------------------

export function listFamilyMembers(customerId: string): FamilyMember[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM customer_family_members WHERE customer_id = ? ORDER BY code'
  ).all(customerId) as FamilyMemberRow[];
  return rows.map(rowToFamilyMember);
}

export function getFamilyMember(id: string): FamilyMember | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM customer_family_members WHERE id = ?').get(id) as FamilyMemberRow | undefined;
  return row ? rowToFamilyMember(row) : null;
}

export function createFamilyMember(customerId: string, input: CreateFamilyMemberInput): FamilyMember {
  const db = getDb();
  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
  const id = randomUUID();
  db.prepare(
    `INSERT INTO customer_family_members (
      id, customer_id, code, first_name, last_name, gender, birthday, comments,
      alert_flag, alert_message, extra_fields_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    customerId,
    input.code,
    input.firstName ?? null,
    input.lastName ?? null,
    input.gender ?? null,
    input.birthday ?? null,
    input.comments ?? null,
    input.alertFlag ? 1 : 0,
    input.alertMessage ?? null,
    input.extraFields ? JSON.stringify(input.extraFields) : null,
  );
  return getFamilyMember(id)!;
}

export function updateFamilyMember(id: string, input: UpdateFamilyMemberInput): FamilyMember | null {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM customer_family_members WHERE id = ?').get(id);
  if (!existing) return null;

  const sets: string[] = [];
  const values: DbValue[] = [];
  const assign = (col: string, value: DbValue) => { sets.push(`${col} = ?`); values.push(value); };

  if (input.code !== undefined) assign('code', input.code);
  if (input.firstName !== undefined) assign('first_name', input.firstName);
  if (input.lastName !== undefined) assign('last_name', input.lastName);
  if (input.gender !== undefined) assign('gender', input.gender);
  if (input.birthday !== undefined) assign('birthday', input.birthday);
  if (input.comments !== undefined) assign('comments', input.comments);
  if (input.alertFlag !== undefined) assign('alert_flag', input.alertFlag ? 1 : 0);
  if (input.alertMessage !== undefined) assign('alert_message', input.alertMessage);
  if (input.extraFields !== undefined) assign('extra_fields_json', input.extraFields ? JSON.stringify(input.extraFields) : null);

  if (sets.length === 0) return getFamilyMember(id);

  sets.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE customer_family_members SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getFamilyMember(id);
}

export function deleteFamilyMember(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM customer_family_members WHERE id = ?').run(id);
  return (result.changes ?? 0) > 0;
}

// --- Helpers ---------------------------------------------------------------

function normalizePhoneForAccount(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // RICS convention (p. 117): phone with no parens or dashes. Strip everything non-digit, then
  // truncate to 15 chars to fit the legacy field width.
  const stripped = phone.replace(/\D/g, '');
  return stripped.slice(0, 15) || null;
}
