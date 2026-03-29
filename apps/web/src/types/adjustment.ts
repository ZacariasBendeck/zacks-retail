export type AdjustmentType =
  | 'RECEIPT'
  | 'TRANSFER'
  | 'MANUAL_ADJUST'
  | 'RETURN'
  | 'DAMAGE'
  | 'SHRINKAGE'

export interface AdjustmentLineItem {
  skuId: string
  skuCode?: string
  brand?: string
  quantity: number
}

export interface Adjustment {
  id: string
  type: AdjustmentType
  fromLocationId: string | null
  fromLocationName?: string | null
  toLocationId: string | null
  toLocationName?: string | null
  reason: string | null
  lineItems: AdjustmentLineItem[]
  createdBy: string
  createdAt: string
}

export interface CreateAdjustmentPayload {
  type: AdjustmentType
  fromLocationId?: string | null
  toLocationId?: string | null
  reason?: string | null
  lineItems: { skuId: string; quantity: number }[]
}

export interface AdjustmentListParams {
  page?: number
  pageSize?: number
  type?: AdjustmentType
  fromDate?: string
  toDate?: string
}

export interface Location {
  id: string
  name: string
}
