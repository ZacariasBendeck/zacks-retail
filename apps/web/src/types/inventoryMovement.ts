import type { PaginationEnvelope, Department } from './sku'

export type MovementType = 'sale' | 'po_receipt' | 'transfer_in' | 'transfer_out' | 'adjustment'

export type SourceDocumentType = 'sale' | 'po_receipt' | 'transfer' | 'adjustment'

export interface SourceDocumentRef {
  sourceDocumentType: SourceDocumentType
  sourceDocumentId: string
  sourceDocumentNumber?: string | null
}

export interface MovementTimelineRow extends Partial<SourceDocumentRef> {
  id: string
  skuId: string
  skuCode: string
  locationId: string
  locationCode?: string | null
  locationName?: string | null
  movementType: MovementType
  quantityDelta: number
  unitCostSnapshot?: number | null
  movementAt: string
  macroDepartment?: Department | null
  category?: number | null
}

export interface MovementReconciliationRow extends Partial<SourceDocumentRef> {
  id: string
  skuId: string
  skuCode: string
  locationId: string
  locationCode?: string | null
  locationName?: string | null
  expectedStockDelta: number
  movementRowCount: number
  firstMovementAt: string | null
  lastMovementAt: string | null
  macroDepartment?: Department | null
  category?: number | null
}

export interface MovementTimelineParams {
  page?: number
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  startDate?: string
  endDate?: string
  skuCode?: string
  locationId?: string
  movementTypes?: MovementType[]
  macroDepartments?: Department[]
  categoryMin?: number
  categoryMax?: number
}

export interface MovementReconciliationParams {
  page?: number
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  startDate?: string
  endDate?: string
  skuCode?: string
  locationId?: string
  macroDepartments?: Department[]
  categoryMin?: number
  categoryMax?: number
}

export type MovementTimelineResponse = PaginationEnvelope<MovementTimelineRow>
export type MovementReconciliationResponse = PaginationEnvelope<MovementReconciliationRow>
