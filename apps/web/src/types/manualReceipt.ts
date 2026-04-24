import type { PaginationEnvelope } from './sku'

export interface ManualReceiptStoreOption {
  storeId: number
  storeLabel: string
}

export interface ManualReceiptContextQuery {
  storeId: number
  skuCode?: string
  upc?: string
}

export interface ManualReceiptContextCell {
  columnLabel: string
  rowLabel: string
  quantityOnHand: number
}

export interface ManualReceiptCasePack {
  id: string
  code: string
  description: string
  multiplierDefault: number
  cells: Array<{
    columnLabel: string
    rowLabel: string
    quantityPerPack: number
  }>
}

export interface ManualReceiptContext {
  storeId: number
  storeLabel: string
  skuId: string
  skuCode: string
  description: string | null
  categoryNumber: number | null
  vendorCode: string | null
  vendorName: string | null
  vendorSku: string | null
  styleColor: string | null
  sizeTypeCode: number | null
  sizeGrid: {
    columns: string[]
    rows: string[]
  }
  defaultUnitCost: number | null
  defaultRetailPrice: number | null
  lastReceivedAt: string | null
  currentOnHandByCell: ManualReceiptContextCell[]
  availableCasePacks: ManualReceiptCasePack[]
  scannedUpcTarget?: {
    columnLabel: string
    rowLabel: string
  }
}

export interface CreateManualReceiptLineInput {
  columnLabel?: string
  rowLabel?: string
  quantity: number
}

export interface CreateManualReceiptPayload {
  storeId: number
  skuId: string
  referenceNumber?: string | null
  storeLabelsOnReceive?: boolean
  movementAt?: string | null
  unitCostOverride?: number | null
  retailPriceOverride?: number | null
  casePackId?: string | null
  casePackMultiplier?: number | null
  note?: string | null
  idempotencyKey?: string | null
  lines: CreateManualReceiptLineInput[]
}

export interface ManualReceiptLineRecord {
  id: string
  columnLabel: string
  rowLabel: string
  quantity: number
  unitCost: number
  retailPrice: number
  movementId: string
}

export interface ManualReceiptRecord {
  id: string
  storeId: number
  storeLabel: string
  skuId: string
  skuCode: string
  description: string | null
  categoryNumber: number | null
  vendorCode: string | null
  vendorName: string | null
  vendorSku: string | null
  styleColor: string | null
  referenceNumber: string | null
  storeLabelsOnReceive: boolean
  movementAt: string
  unitCostApplied: number | null
  retailPriceApplied: number | null
  casePackId: string | null
  casePackMultiplier: number | null
  note: string | null
  totalUnits: number
  createdAt: string
  performedBy: string
  lines: ManualReceiptLineRecord[]
}

export interface ManualReceiptListParams {
  page?: number
  pageSize?: number
  sort?: 'movementAt' | 'createdAt'
  order?: 'asc' | 'desc'
  storeId?: number
  skuId?: string
  fromDate?: string
  toDate?: string
}

export interface ManualReceiptListItem {
  id: string
  storeId: number
  storeLabel: string
  skuId: string
  skuCode: string
  description: string | null
  totalUnits: number
  movementAt: string
  createdAt: string
  performedBy: string
  referenceNumber: string | null
}

export type ManualReceiptListEnvelope = PaginationEnvelope<ManualReceiptListItem>
