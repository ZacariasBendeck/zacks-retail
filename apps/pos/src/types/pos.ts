// Types mirror apps/api/src/models/salesPos.ts — camelCase over the wire.

export type TransactionType =
  | 'REGULAR'
  | 'USER_DEFINED'
  | 'SPECIAL_ORDER_PICKUP'
  | 'LAYAWAY_SALE'
  | 'GIFT_CERT_SALE'
  | 'HOUSE_CHARGE_PAYMENT'
  | 'SPECIAL_ORDER_DEPOSIT'
  | 'LAYAWAY_PAYMENT'

export type LineKind = 'MERCHANDISE' | 'COUPON' | 'COMMENT_ONLY'

export type TenderKind =
  | 'CASH'
  | 'CHECK'
  | 'CARD'
  | 'GIFT_CERT'
  | 'STORE_CREDIT'
  | 'HOUSE_CHARGE'
  | 'CONTINUATION'
  | 'FOREIGN_CURRENCY'
  | 'OTHER'

export type PostingMode = 'REALTIME' | 'BATCH'
export type PostingStatus =
  | 'DRAFT'
  | 'REALTIME_POSTED'
  | 'PENDING_POST'
  | 'BATCH_POSTED'
  | 'VOIDED_UNPOSTED'

export type ShiftStatus = 'OPEN' | 'CLOSING' | 'CLOSED' | 'VOIDED'
export type DrawerKind = 'NONE' | 'OPOS' | 'WEBUSB' | 'PRINTER_TRIGGERED'

export interface Store {
  id: number
  code: string
  name: string
  taxRate: number
  taxCode: string
  otherChargeLabel: string
  returnCodeTracking: boolean
  currencyEnabled: boolean
  active: boolean
}

export interface Register {
  id: string
  storeId: number
  code: string
  label: string
  drawerKind: DrawerKind
  active: boolean
}

export interface TenderType {
  id: string
  storeId: number
  code: string
  label: string
  tenderKind: TenderKind
  isConsideredCash: boolean
  opensDrawer: boolean
  requireAccountNumber: boolean
  active: boolean
  sortOrder: number
}

export interface PayoutCategory {
  id: string
  storeId: number
  code: string
  label: string
  active: boolean
}

export interface Shift {
  id: string
  storeId: number
  registerId: string
  openedAt: string
  openedByUserId: string
  openingCashFloat: number
  closedAt: string | null
  closedByUserId: string | null
  closingCashCount: number | null
  closingDepositCount: number | null
  expectedCashAtClose: number | null
  overShortAmount: number | null
  overShortApprovedBy: string | null
  status: ShiftStatus
  postingMode: PostingMode
  postedAt: string | null
  lastTicketNumberUsed: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface SalesTicketLine {
  id: string
  ticketId: string
  lineNumber: number
  lineKind: LineKind
  skuId: string | null
  skuSizeId: string | null
  skuCodeSnapshot: string | null
  quantity: number
  unitPrice: number
  priceSlotUsed: string | null
  lineDiscountPct: number | null
  lineDiscountAmount: number | null
  perksAmount: number
  salespersonUserId: string | null
  familyMemberId: string | null
  returnCodeId: number | null
  taxable: boolean
  comment: string | null
  extendedNet: number
  extendedTax: number
  createdAt: string
}

export interface SalesTicketTender {
  id: string
  ticketId: string
  sequence: number
  tenderTypeId: string
  tenderKind: TenderKind
  amount: number
  foreignCurrencyAmount: number | null
  accountNumber: string | null
  giftCertNumber: string | null
  authReference: string | null
  isContinuation: boolean
  createdAt: string
}

export interface SalesTicketTax {
  id: string
  ticketId: string
  taxCode: string
  taxRate: number
  taxableBase: number
  taxAmount: number
}

export interface SalesTicket {
  id: string
  ticketNumber: number
  storeId: number
  registerId: string
  shiftId: string
  businessDate: string
  transactionType: TransactionType
  cashierUserId: string
  customerAccountId: string | null
  headerDiscountPct: number | null
  promotionCode: string | null
  familyMemberId: string | null
  subtotal: number
  taxTotal: number
  taxOverrideReason: string | null
  otherCharges: number
  otherChargesLabel: string | null
  grandTotal: number
  changeGiven: number
  comment: string | null
  parentTicketId: string | null
  continuationHeadId: string | null
  voidedAt: string | null
  voidedByUserId: string | null
  voidPasswordUsed: boolean
  reclaimedFromTicketId: string | null
  postingStatus: PostingStatus
  postedAt: string | null
  receiptPrintCount: number
  endedAt: string | null
  lines: SalesTicketLine[]
  tenders: SalesTicketTender[]
  taxes: SalesTicketTax[]
}

export interface CashTotals {
  shiftId: string
  salesRecap: {
    grossSales: number
    returns: number
    netSales: number
    taxTotal: number
    otherCharges: number
    grandTotal: number
    ticketCount: number
    voidedTicketCount: number
  }
  cashDrawerRecap: {
    openingCashFloat: number
    cashTenders: number
    payouts: number
    expectedCashInDrawer: number
  }
  tenderBreakdown: Array<{
    tenderTypeId: string
    tenderKind: TenderKind
    label: string
    amount: number
    count: number
  }>
  voidSummary: { voidedTicketCount: number; voidedAmount: number }
}

export interface Payout {
  id: string
  shiftId: string
  cashierUserId: string
  categoryId: string
  categoryLabel: string
  amount: number
  note: string | null
  createdAt: string
}
