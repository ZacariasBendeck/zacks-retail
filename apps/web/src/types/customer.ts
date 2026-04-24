export type FamilyMemberGender = 'M' | 'F' | 'C'

export interface Customer {
  id: string
  source: 'app' | 'mirror'
  accountNumber: string
  phoneE164: string | null
  firstName: string | null
  lastName: string | null
  displayName: string
  email: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  stateRegion: string | null
  postalCode: string | null
  country: string | null
  creditLimit: number | null
  alertFlag: boolean
  alertMessage: string | null
  comments: string | null
  ptdQty: number
  ptdSalesCents: number
  ytdQty: number
  ytdSalesCents: number
  ttdQty: number
  ttdSalesCents: number
  lastYearSalesCents: number
  dateAdded: string
  dateOfLastPurchase: string | null
  lastKnownArBalanceCents: number
  arBalanceAsOf: string | null
  lastKnownStoreCreditCents: number
  storeCreditAsOf: string | null
  extraFields: Record<string, unknown> | null
  marketingOptIn: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface FamilyMember {
  id: string
  customerId: string
  code: string
  firstName: string | null
  lastName: string | null
  gender: FamilyMemberGender | null
  birthday: string | null
  comments: string | null
  alertFlag: boolean
  alertMessage: string | null
  extraFields: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CustomerWithFamily extends Customer {
  familyMembers: FamilyMember[]
}

export interface CustomerListParams {
  page?: number
  pageSize?: number
  sort?: 'displayName' | 'accountNumber' | 'dateAdded' | 'dateOfLastPurchase' | 'ytdSalesCents'
  order?: 'asc' | 'desc'
  active?: boolean
  q?: string
}

export interface CustomerCreatePayload {
  accountNumber?: string
  phoneE164?: string | null
  firstName?: string | null
  lastName?: string | null
  displayName?: string | null
  email?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  stateRegion?: string | null
  postalCode?: string | null
  country?: string | null
  creditLimit?: number | null
  alertFlag?: boolean
  alertMessage?: string | null
  comments?: string | null
  marketingOptIn?: boolean
}

export type CustomerUpdatePayload = CustomerCreatePayload & { active?: boolean }

export interface FamilyMemberCreatePayload {
  code: string
  firstName?: string | null
  lastName?: string | null
  gender?: FamilyMemberGender | null
  birthday?: string | null
  comments?: string | null
  alertFlag?: boolean
  alertMessage?: string | null
}

export type FamilyMemberUpdatePayload = Partial<FamilyMemberCreatePayload>

export interface CustomerBalances {
  arBalanceCents: number
  arBalanceAsOf: string | null
  storeCreditCents: number
  storeCreditAsOf: string | null
}
