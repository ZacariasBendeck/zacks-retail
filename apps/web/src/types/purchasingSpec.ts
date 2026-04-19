// Spec-driven types for the PO Entry preview page.
// Mirrors docs/modules/purchasing.md and the RICS SizeTypes table
// (RISIZE.MDB — columns, rows, ColumnDesc, RowDesc). Separate from
// types/purchaseOrder.ts (which tracks the current API shape).

export type OrderType = 'RO' | 'RE' | 'SA'
export type POClassification = 'AT_ONCE' | 'FUTURE'

export type PoStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CLOSED'
  | 'CANCELLED'

// Mirrors RISIZE.MDB `SizeTypes`: each type has a ColumnDesc / RowDesc
// (what the axes represent — e.g. "Size" × "Width", or "Size" × "Color"),
// plus up to 54 column labels and up to 27 row labels. A 1-D type is
// represented with a single empty-string row.
export interface SizeType {
  id: string
  code: number // RICS `Code`
  name: string // RICS `Desc`
  columnDesc: string // RICS `ColumnDesc` — e.g. "Size"
  rowDesc: string // RICS `RowDesc`   — e.g. "Width" / "Color" / ""
  columns: string[] // RICS `Columns_01..54` (non-empty)
  rows: string[] // RICS `Rows_01..27` (non-empty; ['']= 1-D)
}

export interface MockVendor {
  id: string
  code: string
  name: string
  defaultTerms: string
  defaultShipVia: string
  defaultAccountNumber: string
  defaultStoreLabelsOnReceive: boolean
}

export interface MockStore {
  id: number
  code: string
  name: string
}

export interface MockSku {
  id: string
  skuCode: string
  brand: string
  description: string
  vendorId: string
  sizeTypeId: string
  defaultUnitCost: number
  defaultRetailPrice: number
}

// Cell key format: `${columnLabel}|${rowLabel}` (row is '' for 1-D types)
export interface MockCasePack {
  id: string
  name: string
  skuId: string
  cellsPerPack: Record<string, number>
}

export interface PoLineDraft {
  key: string
  skuId: string
  casePackId: string | null
  casePackMultiplier: number
  retailPrice: number
  unitCost: number
  sizeQuantities: Record<string, number>
  writeBackToMaster: boolean
}

export interface PoHeaderDraft {
  poNumber: string
  billToStoreId: number | null
  shipToStoreId: number | null
  vendorId: string | null
  orderType: OrderType
  storeLabelsOnReceive: boolean
  confirmationNumber: string
  accountNumber: string
  terms: string
  shipVia: string
  backorderAllowed: boolean
  splitShipment: boolean
  programCode: string
  comments: string
  orderDate: string
  shipDate: string
  cancelDate: string
  paymentDate: string
}

export type OtbCheckStatus = 'OK' | 'WARN' | 'BLOCK'

export interface OtbCheckResult {
  status: OtbCheckStatus
  totalCost: number
  message: string
}

// --- Receive PO (spec preview) ----------------------------------------------

export type OpenPoStatus = 'CONFIRMED' | 'PARTIALLY_RECEIVED'

export interface MockOpenPoLine {
  id: string
  skuId: string
  unitCost: number
  retailPrice: number
  orderedCells: Record<string, number>
  receivedCells: Record<string, number>
}

export interface MockOpenPo {
  id: string
  poNumber: string
  vendorId: string
  billToStoreId: number
  shipToStoreId: number
  status: OpenPoStatus
  orderDate: string
  shipDate: string
  comments: string
  lines: MockOpenPoLine[]
}

export type ReceiveMode = 'MANUAL' | 'FULL' | 'SCAN'

export type UnderReceiveAction = 'CANCEL_REMAINDER' | 'BACKORDER'

export interface ReceiptLineDraft {
  lineId: string
  receivingNow: Record<string, number>
  discountPercent: number
  freightEach: number
  underReceiveAction: UnderReceiveAction | null
}

export interface ReceiptDraft {
  poId: string
  receivedAtStoreId: number | null
  referenceNumber: string
  mode: ReceiveMode
  linesById: Record<string, ReceiptLineDraft>
}
