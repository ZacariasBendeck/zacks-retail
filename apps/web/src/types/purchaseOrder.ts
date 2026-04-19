export type PoStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CLOSED'
  | 'CANCELLED'

export interface PoLineItem {
  id: string
  poId: string
  skuId: string
  skuCode?: string
  brand?: string
  quantityOrdered: number
  quantityReceived: number
  unitCost: number
  lineTotal: number
  createdAt: string
  updatedAt: string
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  vendorId: string
  vendorName?: string
  status: PoStatus
  notes: string | null
  cancellationReason: string | null
  createdBy: string
  lineItems: PoLineItem[]
  subtotal: number
  createdAt: string
  updatedAt: string
}

export interface PoListParams {
  page?: number
  pageSize?: number
  sort?: 'poNumber' | 'status' | 'createdAt' | 'updatedAt'
  order?: 'asc' | 'desc'
  status?: PoStatus
  vendorId?: string
  q?: string
}

export interface PurchaseOrderLineInput {
  skuId: string
  quantity: number
  unitCost: number
}

export interface CreatePurchaseOrderPayload {
  vendorId: string
  lineItems: PurchaseOrderLineInput[]
  notes?: string | null
}

export interface UpdatePurchaseOrderPayload {
  notes?: string | null
  lineItems?: PurchaseOrderLineInput[]
}

export interface SubmitPurchaseOrderPayload {
  force?: boolean
  changedBy?: string
  overrideReasonCode?: string
  approverIds?: string[]
  ceoExceptionApprovalId?: string
  policySource?: 'default' | 'configured'
  warningThresholdPct?: number
  hardStopThresholdPct?: number
  traceId?: string
}

export interface ReceiveLinePayload {
  lineId: string
  quantityReceived: number
}

export interface ReceivePurchaseOrderPayload {
  lines: ReceiveLinePayload[]
  locationId?: string
  receivedBy?: string
  referenceNumber?: string | null
  idempotencyKey?: string
  reason?: string
}

export interface PoReceiptLine {
  id: string
  receiptId: string
  poLineId: string | null
  skuId: string
  skuCode?: string
  style?: string
  skuSizeId: string | null
  quantityReceived: number
  unitCost: number | null
  createdAt: string
}

export interface PoReceipt {
  id: string
  poId: string
  locationId: string
  locationName: string | null
  receivedBy: string
  referenceNumber: string | null
  receivedAt: string
  createdAt: string
  lines: PoReceiptLine[]
}

export interface PoStatusHistory {
  id: string
  poId: string
  fromStatus: string | null
  toStatus: string
  changedBy: string
  reason: string | null
  createdAt: string
}

export interface OverduePoException {
  poId: string
  poNumber: string
  vendorId: string
  vendorName: string
  status: PoStatus
  leadTimeDays: number
  submittedAt: string
  expectedDeliveryDate: string
  daysOverdue: number
}

export type TransferOrderStatus = 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED'

export interface TransferOrderLine {
  id: string
  transferOrderId: string
  skuId: string
  skuCode?: string
  style?: string
  skuSizeId: string | null
  quantity: number
  createdAt: string
}

export interface TransferOrder {
  id: string
  fromLocationId: string
  fromLocationName: string | null
  toLocationId: string
  toLocationName: string | null
  status: TransferOrderStatus
  requestedBy: string
  shippedAt: string | null
  receivedAt: string | null
  createdAt: string
  updatedAt: string
  lines: TransferOrderLine[]
}

export interface TransferOrderListParams {
  page?: number
  pageSize?: number
  status?: TransferOrderStatus
  fromLocationId?: string
  toLocationId?: string
}
