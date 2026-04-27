export interface PosStoreSummary {
  id: number
  code: string
  name: string
  active: boolean
}

export interface PosRegisterSummary {
  id: string
  code: string
  label: string
  active: boolean
}

export interface PosEmployeeSummary {
  id: string
  displayName: string
  salespersonCode: string | null
}

export interface PosTenderType {
  id: string
  code: string
  label: string
  kind: string
  requiresAccount: boolean
  openDrawer: boolean
}

export interface PosPayoutCategory {
  id: string
  code: string
  label: string
}

export interface PosPromotion {
  code: string
  description: string
}

export interface PosReturnCode {
  code: number
  description: string
  trackable: boolean
}

export interface PosShift {
  id: string
  storeId: number
  registerId: string
  registerCode: string
  businessDate: string
  status: string
  openedByUserId: string
  openedByName: string
  openingCashFloat: number
  expectedCashTotal: number | null
  actualCashTotal: number | null
  overShortAmount: number | null
  openedAt: string
  closedAt: string | null
  lastTicketNumber: number
}

export interface PosTicketLine {
  id: string
  lineNumber: number
  skuId: string | null
  skuCode: string | null
  description: string
  upc: string | null
  sizeTypeCode: number | null
  columnLabel: string
  rowLabel: string
  quantity: number
  unitPrice: number
  priceMode: string
  discountPct: number | null
  discountAmount: number
  taxable: boolean
  taxRate: number
  secondaryTaxRate: number
  salespersonUserId: string | null
  salespersonCode: string | null
  salespersonName: string | null
  familyMemberId: string | null
  returnCode: number | null
  comment: string | null
  lineSubtotal: number
  lineTax: number
  lineSecondaryTax: number
  lineTotal: number
}

export interface PosTicketTender {
  id: string
  sequence: number
  tenderTypeId: string
  tenderCode: string
  tenderLabel: string
  tenderKind: string
  amount: number
  accountNumber: string | null
  reference: string | null
}

export interface PosTicket {
  id: string
  shiftId: string
  storeId: number
  registerId: string
  ticketNumber: number
  status: string
  transactionType: string
  cashierUserId: string
  cashierName: string
  customerId: string | null
  customerAccountNumber: string | null
  customerName: string | null
  headerDiscountPct: number | null
  promotionCode: string | null
  shipToState: string | null
  subtotal: number
  taxTotal: number
  secondaryTaxTotal: number
  otherCharges: number
  grandTotal: number
  totalTendered: number
  changeGiven: number
  comment: string | null
  completedAt: string | null
  voidedAt: string | null
  receiptPrintCount: number
  lines: PosTicketLine[]
  tenders: PosTicketTender[]
}

export interface PosBootstrap {
  currentUser: {
    id: string
    displayName: string
    salespersonCode: string | null
    permissions: string[]
  }
  selectedStoreId: number
  selectedRegisterCode: string
  otherChargeLabel: string
  stores: PosStoreSummary[]
  registers: PosRegisterSummary[]
  employees: PosEmployeeSummary[]
  tenderTypes: PosTenderType[]
  payoutCategories: PosPayoutCategory[]
  promotions: PosPromotion[]
  returnCodes: PosReturnCode[]
  shift: PosShift | null
  activeTicket: PosTicket | null
}

export interface PosProductLookup {
  code: string
  skuId: string | null
  description: string
  upc: string | null
  sizeTypeCode: number | null
  sizeTypeDescription: string | null
  columns: string[]
  rows: string[]
  defaultColumnLabel: string
  defaultRowLabel: string
  coupon: boolean
  defaultQuantity: number
  priceSlots: Array<{
    code: 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2' | 'LIST'
    label: string
    amount: number
  }>
  defaultPriceMode: 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2' | 'LIST'
  defaultUnitPrice: number
  taxable: boolean
  perks: number
}

export interface PosCatalogSearchRow {
  skuCode: string
  description: string | null
  styleColor: string | null
  vendorCode: string | null
  vendorName: string | null
  categoryNumber: number | null
  categoryName: string | null
  currentPriceSlot: number
  currentPrice: number
  listPrice: number | null
  retailPrice: number | null
  markDown1: number | null
  markDown2: number | null
  currentCost: number | null
  perks: number | null
  coupon: boolean
  overSizeColumn: string | null
  overSizeAmount: number | null
  pictureFileName: string | null
  status: string | null
}

export interface PosTicketListItem {
  id: string
  ticketNumber: number
  status: string
  cashierName: string
  customerName: string | null
  grandTotal: number
  completedAt: string | null
  voidedAt: string | null
}

export interface PosReceipt {
  title: string
  storeName: string
  storeId: number
  registerCode: string
  ticketNumber: number
  businessDate: string
  cashierName: string
  customerName: string | null
  customerAccountNumber: string | null
  transactionType: string
  promotionCode: string | null
  comment: string | null
  lines: Array<{
    description: string
    skuCode: string | null
    size: string
    quantity: number
    unitPrice: number
    total: number
  }>
  tenders: Array<{ label: string; amount: number }>
  totals: {
    subtotal: number
    tax: number
    secondaryTax: number
    otherCharges: number
    grandTotal: number
    totalTendered: number
    change: number
  }
}

export interface PosClosePreview {
  shift: PosShift
  expectedCashTotal: number
  openingCashFloat: number
  payoutsTotal: number
  tenderTotals: Array<{
    tenderTypeId: string
    code: string
    label: string
    kind: string
    amount: number
  }>
}

export interface CustomerSearchResult {
  id: string
  accountNumber: string
  displayName: string
  email: string | null
  phoneE164: string | null
  source?: string
}
