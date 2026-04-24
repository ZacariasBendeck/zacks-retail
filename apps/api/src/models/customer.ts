// crm module — Customer + FamilyMember public DTO types.
// Slim Stage 1 subset per docs/modules/crm.md (pp. 117–118).
//
// SQLite row types + row-to-DTO mappers lived here when the service was on
// better-sqlite3. Customers moved to Postgres on 2026-04-23 and the service
// layer now derives its Prisma row types via `Prisma.CustomerGetPayload<…>`
// directly. Only the public-facing DTOs + the display-name helper remain.

// --- Customer --------------------------------------------------------------

export interface Customer {
  id: string;
  source: 'app' | 'mirror';
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

// --- FamilyMember ----------------------------------------------------------

export type FamilyMemberGender = 'M' | 'F' | 'C';

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

// --- Compose customer with family ------------------------------------------

export interface CustomerWithFamily extends Customer {
  familyMembers: FamilyMember[];
}

// --- Computed helpers ------------------------------------------------------

// RICS convention: display "LAST, FIRST" when both present; else use whichever
// is present; else fall back to account number.
export function composeDisplayName(
  firstName: string | null,
  lastName: string | null,
  accountNumber: string,
): string {
  if (lastName && firstName) return `${lastName.toUpperCase()}, ${firstName}`;
  if (lastName) return lastName.toUpperCase();
  if (firstName) return firstName;
  return accountNumber;
}
