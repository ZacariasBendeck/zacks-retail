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
  sizeType: number | null
  casePackId: string | null
  casePackMultiplier: number | null
  sizeCells: Array<{ columnLabel: string; rowLabel: string; quantity: number }>
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
  billToStoreId: number | null
  shipToStoreId: number | null
  vendorId: string
  vendorName?: string
  orderType: 'RO' | 'RE' | 'SA' | string
  classification: 'AT_ONCE' | 'FUTURE' | string
  origin: string
  originSourcePoId: string | null
  confirmationNumber: string | null
  accountNumber: string | null
  terms: string | null
  shipVia: string | null
  backorderAllowed: boolean
  splitShipment: boolean
  programCode: string | null
  storeLabelsOnReceive: boolean
  buyer: string | null
  orderDate: string
  shipDate: string | null
  cancelDate: string | null
  paymentDate: string | null
  status: PoStatus
  notes: string | null
  cancellationReason: string | null
  createdBy: string
  lineItems: PoLineItem[]
  subtotal: number
  createdAt: string
  updatedAt: string
}

export interface LegacyPurchaseOrderLine {
  skuCode: string
  rowLabel: string
  segment: number
  orderedQty: number
  receivedQty: number
  openQty: number
  cost: number | null
  vendorCode: string | null
  casePackCode: string | null
  caseMultiplier: number | null
  dateLastChanged: string | null
}

export interface LegacyPurchaseOrderDetail {
  poNumber: string
  billStore: number | null
  shipStore: number | null
  vendorCode: string | null
  confirmation: string | null
  account: string | null
  terms: string | null
  shipVia: string | null
  backOrder: boolean
  splitShipment: boolean
  orderDate: string | null
  dueDate: string | null
  cancelDate: string | null
  paymentDate: string | null
  lastReceivedAt: string | null
  comment: string | null
  orderType: string | null
  department: string | null
  buyer: string | null
  current: boolean | null
  legacyStatus: string | null
  dateLastChanged: string | null
  totals: {
    orderedQty: number
    receivedQty: number
    openQty: number
    lineCount: number
  }
  lines: LegacyPurchaseOrderLine[]
}

export interface PoListParams {
  page?: number
  pageSize?: number
  sort?: 'poNumber' | 'status' | 'createdAt' | 'updatedAt'
  order?: 'asc' | 'desc'
  status?: PoStatus
  vendorId?: string
  buyer?: string
  q?: string
}

export interface PurchaseOrderLineInput {
  skuId: string
  quantity: number
  unitCost: number
  casePackId?: string | null
  casePackMultiplier?: number | null
  sizeCells?: Array<{ columnLabel?: string | null; rowLabel?: string | null; quantity: number }>
}

export interface PurchaseOrderVendorOption {
  id: string
  name: string
}

export interface PurchaseOrderBuyerOption {
  id: string
  label: string
  count: number
}

export interface PurchaseOrderSkuOption {
  id: string
  skuCode: string
  description: string | null
  styleColor: string | null
  vendorId: string | null
  category: number | null
  sizeType: number | null
  unitCost: number | null
}

export interface CreatePurchaseOrderPayload {
  poNumber?: string | null
  billToStoreId?: number | null
  shipToStoreId?: number | null
  vendorId: string
  buyer?: string | null
  lineItems: PurchaseOrderLineInput[]
  notes?: string | null
  orderType?: 'RO' | 'RE' | 'SA'
  classification?: 'AT_ONCE' | 'FUTURE'
  confirmationNumber?: string | null
  accountNumber?: string | null
  terms?: string | null
  shipVia?: string | null
  backorderAllowed?: boolean
  splitShipment?: boolean
  programCode?: string | null
  storeLabelsOnReceive?: boolean
  orderDate?: string | null
  shipDate?: string | null
  cancelDate?: string | null
  paymentDate?: string | null
}

export interface UpdatePurchaseOrderPayload {
  poNumber?: string | null
  vendorId?: string
  buyer?: string | null
  notes?: string | null
  billToStoreId?: number | null
  shipToStoreId?: number | null
  orderType?: 'RO' | 'RE' | 'SA'
  classification?: 'AT_ONCE' | 'FUTURE'
  confirmationNumber?: string | null
  accountNumber?: string | null
  terms?: string | null
  shipVia?: string | null
  backorderAllowed?: boolean
  splitShipment?: boolean
  programCode?: string | null
  storeLabelsOnReceive?: boolean
  orderDate?: string | null
  shipDate?: string | null
  cancelDate?: string | null
  paymentDate?: string | null
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
  discrepancyReason?: string | null
  auditReference?: string | null
}

export interface ReceivePurchaseOrderPayload {
  lines: ReceiveLinePayload[]
  locationId?: string
  receivedBy?: string
  referenceNumber?: string | null
  discountPercent?: number
  freightEach?: number
  idempotencyKey?: string
  reason?: string
}

export interface DuplicatePurchaseOrderPayload {
  poNumber?: string | null
  billToStoreId?: number | null
  shipToStoreId?: number | null
  orderDate?: string | null
  shipDate?: string | null
  cancelDate?: string | null
  paymentDate?: string | null
  storeLabelsOnReceive?: boolean
  changedBy?: string
}

export interface ReplicatePurchaseOrderPayload {
  prefix: string
  shipToStoreIds: number[]
  changedBy?: string
}

export interface ReplicatePurchaseOrderResult {
  created: PurchaseOrder[]
  skipped: Array<{ shipToStoreId: number; poNumber: string; reason: string }>
}

export interface CombinePurchaseOrdersPayload {
  sourcePoId: string
  intoPoId: string
  changedBy?: string
}

export interface ReceivePurchaseOrderFullPayload {
  locationId?: string
  receivedBy?: string
  referenceNumber?: string | null
  discountPercent?: number
  freightEach?: number
  idempotencyKey?: string
  changedBy?: string
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
  discrepancyReason: string | null
  auditReference: string | null
  createdAt: string
}

export interface PoReceipt {
  id: string
  poId: string
  locationId: string
  locationName: string | null
  receivedBy: string
  referenceNumber: string | null
  discountPercent: number
  freightEach: number
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
