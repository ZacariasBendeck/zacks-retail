// crm module — Customer + FamilyMember row/object mappers.
// Slim Stage 1 subset per docs/modules/crm.md (pp. 117–118).

// --- Customer --------------------------------------------------------------

export interface CustomerRow {
  id: string;
  account_number: string;
  phone_e164: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country: string | null;
  credit_limit: number | null;
  alert_flag: number;
  alert_message: string | null;
  comments: string | null;
  ptd_qty: number;
  ptd_sales_cents: number;
  ytd_qty: number;
  ytd_sales_cents: number;
  ttd_qty: number;
  ttd_sales_cents: number;
  last_year_sales_cents: number;
  date_added: string;
  date_of_last_purchase: string | null;
  last_known_ar_balance_cents: number;
  ar_balance_as_of: string | null;
  last_known_store_credit_cents: number;
  store_credit_as_of: string | null;
  extra_fields_json: string | null;
  marketing_opt_in: number;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Customer {
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
  alertFlag: boolean;
  alertMessage: string | null;
  comments: string | null;
  ptdQty: number;
  ptdSalesCents: number;
  ytdQty: number;
  ytdSalesCents: number;
  ttdQty: number;
  ttdSalesCents: number;
  lastYearSalesCents: number;
  dateAdded: string;
  dateOfLastPurchase: string | null;
  lastKnownArBalanceCents: number;
  arBalanceAsOf: string | null;
  lastKnownStoreCreditCents: number;
  storeCreditAsOf: string | null;
  extraFields: Record<string, unknown> | null;
  marketingOptIn: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToCustomer(r: CustomerRow): Customer {
  return {
    id: r.id,
    accountNumber: r.account_number,
    phoneE164: r.phone_e164,
    firstName: r.first_name,
    lastName: r.last_name,
    displayName: r.display_name,
    email: r.email,
    addressLine1: r.address_line1,
    addressLine2: r.address_line2,
    city: r.city,
    stateRegion: r.state_region,
    postalCode: r.postal_code,
    country: r.country,
    creditLimit: r.credit_limit,
    alertFlag: r.alert_flag === 1,
    alertMessage: r.alert_message,
    comments: r.comments,
    ptdQty: r.ptd_qty,
    ptdSalesCents: r.ptd_sales_cents,
    ytdQty: r.ytd_qty,
    ytdSalesCents: r.ytd_sales_cents,
    ttdQty: r.ttd_qty,
    ttdSalesCents: r.ttd_sales_cents,
    lastYearSalesCents: r.last_year_sales_cents,
    dateAdded: r.date_added,
    dateOfLastPurchase: r.date_of_last_purchase,
    lastKnownArBalanceCents: r.last_known_ar_balance_cents,
    arBalanceAsOf: r.ar_balance_as_of,
    lastKnownStoreCreditCents: r.last_known_store_credit_cents,
    storeCreditAsOf: r.store_credit_as_of,
    extraFields: r.extra_fields_json ? JSON.parse(r.extra_fields_json) : null,
    marketingOptIn: r.marketing_opt_in === 1,
    active: r.active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// --- FamilyMember ----------------------------------------------------------

export type FamilyMemberGender = 'M' | 'F' | 'C';

export interface FamilyMemberRow {
  id: string;
  customer_id: string;
  code: string;
  first_name: string | null;
  last_name: string | null;
  gender: FamilyMemberGender | null;
  birthday: string | null;
  comments: string | null;
  alert_flag: number;
  alert_message: string | null;
  extra_fields_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface FamilyMember {
  id: string;
  customerId: string;
  code: string;
  firstName: string | null;
  lastName: string | null;
  gender: FamilyMemberGender | null;
  birthday: string | null;
  comments: string | null;
  alertFlag: boolean;
  alertMessage: string | null;
  extraFields: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export function rowToFamilyMember(r: FamilyMemberRow): FamilyMember {
  return {
    id: r.id,
    customerId: r.customer_id,
    code: r.code,
    firstName: r.first_name,
    lastName: r.last_name,
    gender: r.gender,
    birthday: r.birthday,
    comments: r.comments,
    alertFlag: r.alert_flag === 1,
    alertMessage: r.alert_message,
    extraFields: r.extra_fields_json ? JSON.parse(r.extra_fields_json) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// --- Compose customer with family ------------------------------------------

export interface CustomerWithFamily extends Customer {
  familyMembers: FamilyMember[];
}

// --- Computed helpers ------------------------------------------------------

// RICS convention: display "LAST, FIRST" when both present; else use whichever is present;
// else fall back to account number.
export function composeDisplayName(firstName: string | null, lastName: string | null, accountNumber: string): string {
  if (lastName && firstName) return `${lastName.toUpperCase()}, ${firstName}`;
  if (lastName) return lastName.toUpperCase();
  if (firstName) return firstName;
  return accountNumber;
}
