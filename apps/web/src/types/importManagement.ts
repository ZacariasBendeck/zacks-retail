import type { PaginationEnvelope } from './sku'

export type ImportShipmentStatus =
  | 'DRAFT'
  | 'REVIEWING_COSTS'
  | 'APPROVED_ESTIMATE'
  | 'IN_TRANSIT'
  | 'RECEIVING_ESTIMATED'
  | 'FINAL_LIQUIDATION'
  | 'RECEIVED_FINAL'
  | 'CLOSED'
  | 'CANCELLED'

export type ImportSourceCurrency = 'CNY' | 'USD' | 'HNL'
export type ImportInvoiceGroup = 'TAXABLE' | 'NON_TAXABLE' | 'MIXED'
export type ImportInvoiceKind = 'MERCHANDISE' | 'FABRIC' | 'CMT' | 'ACCESSORY' | 'OTHER'
export type ImportChargeType =
  | 'FREIGHT'
  | 'INSURANCE'
  | 'DUTY'
  | 'TAX'
  | 'CUSTOMS_AGENCY'
  | 'LOCAL_FREIGHT'
  | 'OTHER'
export type ImportAllocationBasis = 'PRODUCT_COST_SHARE'
export type ImportChargeCostTreatment = 'ALLOCATE_TO_LANDED' | 'INCLUDED_IN_COMMERCIAL_PRICE' | 'EXCLUDE_FROM_LANDED'
export type ImportContainerType = 'CONTAINER' | 'LOOSE_CARGO' | 'CARTON_GROUP'
export type ImportContainerStatus = 'PLANNED' | 'LOADED' | 'IN_TRANSIT' | 'ARRIVED' | 'RECEIVED' | 'CANCELLED'
export type GoodsInTransitStatus =
  | 'PENDING'
  | 'OWNED'
  | 'IN_TRANSIT'
  | 'RECEIVING_ESTIMATED'
  | 'RECEIVED_FINAL'
  | 'CLOSED'
  | 'CANCELLED'
export type ImportSuggestedPriceApprovalStatus = 'SUGGESTED' | 'APPROVED' | 'REJECTED' | 'POSTED'
export type ImportVerificationCheckStatus = 'PENDING' | 'PASS' | 'WARN' | 'FAIL'
export type ImportPayableSourceType = 'SUPPLIER_INVOICE' | 'LANDED_COST_CHARGE'
export type ImportPayableHandoffStatus = 'NOT_STAGED' | 'READY' | 'SENT_TO_AP' | 'PAID' | 'VOIDED'
export type ImportCommitmentBasis = 'ESTIMATED' | 'FINAL'
export type ImportReceivingCostBasis = 'ESTIMATED' | 'FINAL'
export type ImportPoUnitCostSource = 'BASE' | 'LANDED'
export type ImportShipmentLineStatus = 'EXPECTED' | 'MATCHED' | 'CANCELLED'
export type ImportInvoiceMatchReviewStatus = 'UNMATCHED' | 'MATCHED' | 'MATCH_WARNING' | 'APPROVED_MISMATCH'

export interface ImportShipmentSummary {
  id: string
  shipmentNumber: string
  displayName: string
  status: ImportShipmentStatus
  buyer: string | null
  expectedArrivalAt: string | null
  sourceWorkbookName: string | null
  invoiceHnlTotal: number
  chargeHnlTotal: number
  landedHnlTotal: number
  invoiceCount: number
  lineCount: number
  chargeCount: number
  createdAt: string
  updatedAt: string
}

export interface ImportShipmentListParams {
  page: number
  pageSize: number
  status?: ImportShipmentStatus
  q?: string
}

export type ImportShipmentListEnvelope = PaginationEnvelope<ImportShipmentSummary>

export interface ImportShipmentAuditUserRef {
  id: string
  email: string
  displayName: string
  active: boolean
}

export interface ImportShipmentAuditEvent {
  id: string
  eventType: string
  action: string
  resourceType: string
  resourceId: string | null
  resourceLabel: string | null
  actorUserId: string | null
  actorUser: ImportShipmentAuditUserRef | null
  actorSessionId: string | null
  outcome: string
  reason: string | null
  ipAddress: string | null
  userAgent: string | null
  beforeJson: unknown
  afterJson: unknown
  metadataJson: unknown
  createdAt: string
}

export interface ImportOtbCommitmentsParams {
  buyer?: string
  monthFrom?: string
  monthTo?: string
  departmentNumber?: number
  categoryNumber?: number
}

export interface ImportOtbCommitmentRecord {
  shipmentId: string
  shipmentNumber: string
  displayName: string
  buyer: string | null
  status: ImportShipmentStatus
  expectedArrivalAt: string | null
  actualArrivalAt: string | null
  commitmentMonth: string | null
  commitmentBasis: ImportCommitmentBasis
  departmentNumber: number | null
  departmentName: string | null
  categoryNumber: number | null
  invoiceHnlTotal: number
  allocatedChargeHnlTotal: number
  landedHnlTotal: number
  lineCount: number
  chargeCount: number
}

export interface ImportOtbCommitmentSummary {
  month: string | null
  buyer: string | null
  commitmentBasis: ImportCommitmentBasis
  departmentNumber: number | null
  departmentName: string | null
  categoryNumber: number | null
  shipmentCount: number
  lineCount: number
  landedHnlTotal: number
}

export interface ImportOtbCommitmentsEnvelope {
  commitments: ImportOtbCommitmentRecord[]
  summary: ImportOtbCommitmentSummary[]
  totalEstimatedHnl: number
  totalFinalHnl: number
  totalHnl: number
}

export interface CreateImportShipmentPayload {
  shipmentNumber: string
  displayName: string
  buyer?: string | null
  originPort?: string | null
  destinationPort?: string | null
  carrier?: string | null
  freightForwarder?: string | null
  customsPolicyNumber?: string | null
  blNumber?: string | null
  expectedDepartureAt?: string | null
  expectedArrivalAt?: string | null
  actualArrivalAt?: string | null
  sourceWorkbookName?: string | null
  notes?: string | null
}

export interface ImportMoneyPayload {
  sourceAmount: number
  sourceCurrency: ImportSourceCurrency
  fxRate: number
  fxDate: string
  hnlAmount?: number
}

export interface CreateImportSupplierInvoicePayload extends ImportMoneyPayload {
  invoiceNumber: string
  supplierCode?: string | null
  supplierName: string
  invoiceDate?: string | null
  invoiceGroup?: ImportInvoiceGroup
  invoiceKind?: ImportInvoiceKind
  notes?: string | null
}

export type UpdateImportSupplierInvoicePayload = CreateImportSupplierInvoicePayload

export interface CreateImportInvoiceLinePayload {
  skuId?: string | null
  purchaseOrderLineId?: string | null
  lineNumber?: number | null
  itemCode?: string | null
  styleCode?: string | null
  description?: string | null
  materialMeters?: number | null
  cartonCount?: number | null
  weightKg?: number | null
  volumeCbm?: number | null
  quantity: number
  unitOfMeasure?: string | null
  sourceUnitCost?: number | null
  sourceAmount?: number
  sourceCurrency?: ImportSourceCurrency
  fxRate?: number
  fxDate?: string
  hnlAmount?: number
  taxable?: boolean
}

export type UpdateImportInvoiceLinePayload = CreateImportInvoiceLinePayload

export interface CreateImportChargePayload extends ImportMoneyPayload {
  chargeType: ImportChargeType
  counterparty?: string | null
  documentNumber?: string | null
  allocationBasis?: ImportAllocationBasis
  costTreatment?: ImportChargeCostTreatment
  taxable?: boolean
  estimated?: boolean
  final?: boolean
  notes?: string | null
}

export type UpdateImportChargePayload = CreateImportChargePayload

export interface CreateImportContainerPayload {
  containerNumber?: string | null
  containerType?: ImportContainerType
  sealNumber?: string | null
  cargoGroup?: string | null
  status?: ImportContainerStatus
  expectedArrivalAt?: string | null
  actualArrivalAt?: string | null
  notes?: string | null
}

export type UpdateImportContainerPayload = Partial<CreateImportContainerPayload>

export interface CreateGoodsInTransitRecordPayload {
  containerId?: string | null
  invoiceLineId?: string | null
  shipmentLineId?: string | null
  status?: GoodsInTransitStatus
  ownershipTransferAt?: string | null
  expectedReceiptAt?: string | null
  receivedAt?: string | null
  quantityInTransit?: number | null
  auditReason?: string | null
}

export interface CreateGoodsInTransitForShipmentPayload {
  containerId?: string | null
  status?: GoodsInTransitStatus
  ownershipTransferAt?: string | null
  expectedReceiptAt?: string | null
  auditReason?: string | null
}

export type UpdateGoodsInTransitRecordPayload = Partial<Omit<CreateGoodsInTransitRecordPayload, 'invoiceLineId'>>

export interface ImportShipmentLineCandidate {
  purchaseOrderId: string
  purchaseOrderNumber: string
  purchaseOrderStatus: string
  purchaseOrderLineId: string
  vendorCode: string
  vendorName: string | null
  buyer: string | null
  sourceCurrency: ImportSourceCurrency
  fxRate: number
  fxDate: string
  incotermCode: string | null
  incotermPlace: string | null
  costBasis: string
  skuId: string
  skuCode: string | null
  description: string | null
  quantityOrdered: number
  quantityReceived: number
  quantityOpen: number
  quantityAlreadyPlanned: number
  plannedShipments: string | null
  quantityAvailable: number
  sourceUnitCost: number | null
  commercialUnitCostHnl: number
  estimatedLandedUnitCostHnl: number
}

export interface ImportShipmentLineRecord {
  id: string
  shipmentId: string
  purchaseOrderId: string
  purchaseOrderNumber: string
  purchaseOrderStatus: string
  purchaseOrderLineId: string
  vendorCode: string
  vendorName: string | null
  buyer: string | null
  containerId: string | null
  containerLabel: string | null
  invoiceLineId: string | null
  invoiceNumber: string | null
  invoiceMatchReviewStatus: ImportInvoiceMatchReviewStatus
  invoiceMatchWarnings: string[]
  invoiceMatchApprovedAt: string | null
  invoiceMatchApprovedBy: string | null
  invoiceMatchApprovalReason: string | null
  skuId: string
  skuCode: string | null
  description: string | null
  expectedQuantity: number
  sourceUnitCost: number | null
  sourceCurrency: ImportSourceCurrency
  fxRate: number
  fxDate: string
  incotermCode: string | null
  incotermPlace: string | null
  commercialUnitCostHnl: number
  estimatedLandedUnitCostHnl: number
  allocatedLandedCostHnl: number
  landedUnitCostHnl: number | null
  status: ImportShipmentLineStatus
  notes: string | null
}

export interface AddImportShipmentLinePayload {
  purchaseOrderLineId: string
  containerId?: string | null
  expectedQuantity?: number | null
  estimatedLandedUnitCostHnl?: number | null
  notes?: string | null
}

export interface UpdateImportShipmentLinePayload {
  containerId?: string | null
  expectedQuantity?: number | null
  estimatedLandedUnitCostHnl?: number | null
  status?: ImportShipmentLineStatus
  notes?: string | null
}

export interface MatchImportShipmentLineInvoicePayload {
  invoiceLineId?: string | null
}

export interface ApproveImportShipmentLineInvoiceMatchPayload {
  approved: boolean
  approvedBy?: string | null
  reason?: string | null
}

export interface ApplyImportInvoiceMatchSuggestionsPayload {
  minScore?: number | null
  allowWarnings?: boolean
  shipmentLineIds?: string[] | null
}

export interface ImportInvoiceMatchSuggestion {
  shipmentLineId: string
  purchaseOrderLineId: string
  purchaseOrderNumber: string
  expectedSkuCode: string | null
  expectedDescription: string | null
  expectedQuantity: number
  expectedSourceCurrency: ImportSourceCurrency
  expectedHnlAmount: number
  invoiceLineId: string
  invoiceNumber: string
  invoiceSkuCode: string | null
  invoiceItemCode: string | null
  invoiceDescription: string | null
  invoiceQuantity: number
  invoiceSourceCurrency: ImportSourceCurrency
  invoiceHnlAmount: number
  score: number
  reasons: string[]
  warnings: string[]
}

export interface ImportInvoiceMatchApplySkip {
  shipmentLineId: string
  invoiceLineId: string
  purchaseOrderNumber: string
  invoiceNumber: string
  score: number
  warnings: string[]
  reason: string
}

export interface ApplyImportInvoiceMatchSuggestionsResult {
  shipment: ImportShipmentDetail
  appliedCount: number
  skippedCount: number
  applied: ImportInvoiceMatchSuggestion[]
  skipped: ImportInvoiceMatchApplySkip[]
}

export interface UpdateImportShipmentStatusPayload {
  status: ImportShipmentStatus
  auditReason?: string | null
}

export interface AllocateImportLandedCostPayload {
  markupFactor?: number | null
}

export interface UpdateImportSuggestedPriceStatusPayload {
  approvalStatus: ImportSuggestedPriceApprovalStatus
  changedBy?: string | null
}

export interface RecordImportVerificationCheckPayload {
  checkCode: string
  status: ImportVerificationCheckStatus
  expectedHnlAmount?: number | null
  actualHnlAmount?: number | null
  varianceHnlAmount?: number | null
  message?: string | null
}

export interface MarkImportPayablesSentPayload {
  apReference?: string | null
  changedBy?: string | null
}

export interface MarkImportPayablePaidPayload {
  paymentReference?: string | null
  paidAt?: string | null
  changedBy?: string | null
}

export interface VoidImportPayablePayload {
  reason: string
  changedBy?: string | null
}

export interface ReceiveImportShipmentPayload {
  locationId?: string | null
  receivedAt?: string | null
  auditReason?: string | null
  changedBy?: string | null
  containerId?: string | null
  shipmentLineIds?: string[] | null
  goodsInTransitRecordIds?: string[] | null
}

export interface LinkImportInvoiceLineToPoPayload {
  purchaseOrderLineId?: string | null
}

export interface LinkImportInvoiceLineToSkuPayload {
  skuId?: string | null
  skuCode?: string | null
}

export interface CreateImportPurchaseOrderDraftPayload {
  vendorCode: string
  supplierInvoiceId?: string | null
  poNumber?: string | null
  billToStoreId?: number | null
  shipToStoreId?: number | null
  buyer?: string | null
  notes?: string | null
  unitCostSource?: ImportPoUnitCostSource
  createdBy?: string | null
}

export type ImportWorkbookKind = 'SUIT_PROFORMA' | 'PANAMA_LIQUIDATION' | 'UNKNOWN'

export interface ImportWorkbookOptionsPayload {
  defaultFxRate?: number | null
  defaultFxDate?: string | null
  shipmentNumber?: string | null
  displayName?: string | null
  sourceCurrency?: ImportSourceCurrency | null
  markupFactor?: number | null
}

export interface ImportInvoiceLineRecord {
  id: string
  invoiceId: string
  skuId: string | null
  skuCode: string | null
  purchaseOrderLineId: string | null
  lineNumber: number
  itemCode: string | null
  styleCode: string | null
  description: string | null
  materialMeters: number | null
  cartonCount: number | null
  weightKg: number | null
  volumeCbm: number | null
  quantity: number
  unitOfMeasure: string
  sourceUnitCost: number | null
  sourceAmount: number
  sourceCurrency: ImportSourceCurrency
  fxRate: number
  fxDate: string
  hnlAmount: number
  baseUnitCostHnl: number
  allocatedLandedCostHnl: number
  landedUnitCostHnl: number | null
  taxable: boolean
}

export interface ImportSupplierInvoiceRecord {
  id: string
  shipmentId: string
  invoiceNumber: string
  supplierCode: string | null
  supplierName: string
  invoiceDate: string | null
  invoiceGroup: ImportInvoiceGroup
  invoiceKind: ImportInvoiceKind
  sourceAmount: number
  sourceCurrency: ImportSourceCurrency
  fxRate: number
  fxDate: string
  hnlAmount: number
  notes: string | null
  lines: ImportInvoiceLineRecord[]
}

export interface ImportChargeRecord {
  id: string
  shipmentId: string
  chargeType: ImportChargeType
  counterparty: string | null
  documentNumber: string | null
  sourceAmount: number
  sourceCurrency: ImportSourceCurrency
  fxRate: number
  fxDate: string
  hnlAmount: number
  allocationBasis: ImportAllocationBasis
  costTreatment: ImportChargeCostTreatment
  taxable: boolean
  estimated: boolean
  final: boolean
  notes: string | null
}

export interface ImportLandedCostAllocationRecord {
  id: string
  shipmentId: string
  chargeId: string
  invoiceLineId: string | null
  shipmentLineId: string | null
  allocationBasis: ImportAllocationBasis
  allocatedHnlAmount: number
}

export interface ImportContainerRecord {
  id: string
  shipmentId: string
  containerNumber: string | null
  containerType: ImportContainerType
  sealNumber: string | null
  cargoGroup: string | null
  status: ImportContainerStatus
  expectedArrivalAt: string | null
  actualArrivalAt: string | null
  notes: string | null
}

export interface GoodsInTransitRecordDto {
  id: string
  shipmentId: string
  containerId: string | null
  invoiceLineId: string | null
  shipmentLineId: string | null
  status: GoodsInTransitStatus
  ownershipTransferAt: string | null
  expectedReceiptAt: string | null
  receivedAt: string | null
  quantityInTransit: number | null
  auditReason: string | null
}

export interface ImportVerificationCheckRecord {
  id: string
  shipmentId: string
  checkCode: string
  status: ImportVerificationCheckStatus
  expectedHnlAmount: number | null
  actualHnlAmount: number | null
  varianceHnlAmount: number | null
  message: string | null
}

export interface ImportSuggestedPriceRecord {
  id: string
  shipmentId: string
  invoiceLineId: string
  skuId: string | null
  landedUnitCostHnl: number
  markupFactor: number
  suggestedRetailHnl: number
  approvalStatus: ImportSuggestedPriceApprovalStatus
  approvedBy: string | null
  approvedAt: string | null
}

export interface ImportShipmentDetail extends ImportShipmentSummary {
  originPort: string | null
  destinationPort: string | null
  carrier: string | null
  freightForwarder: string | null
  customsPolicyNumber: string | null
  blNumber: string | null
  expectedDepartureAt: string | null
  actualArrivalAt: string | null
  baseCurrency: 'HNL'
  notes: string | null
  approvedEstimateAt: string | null
  approvedEstimateBy: string | null
  finalLiquidationAt: string | null
  closedAt: string | null
  createdBy: string
  containers: ImportContainerRecord[]
  shipmentLines: ImportShipmentLineRecord[]
  supplierInvoices: ImportSupplierInvoiceRecord[]
  charges: ImportChargeRecord[]
  allocations: ImportLandedCostAllocationRecord[]
  goodsInTransit: GoodsInTransitRecordDto[]
  verificationChecks: ImportVerificationCheckRecord[]
  suggestedPrices: ImportSuggestedPriceRecord[]
}

export interface ImportAllocationResult {
  shipmentId: string
  invoiceHnlTotal: number
  chargeHnlTotal: number
  landedHnlTotal: number
  allocationCount: number
  suggestedPriceCount: number
}

export interface ImportLiquidationReadinessCheck {
  checkCode: string
  status: 'PASS' | 'WARN' | 'FAIL'
  blocking: boolean
  message: string
}

export interface ImportLiquidationReadiness {
  shipmentId: string
  canFinalize: boolean
  invoiceLineCount: number
  chargeCount: number
  finalChargeCount: number
  estimatedChargeCount: number
  unallocatedLineCount: number
  failedVerificationCount: number
  warningVerificationCount: number
  checks: ImportLiquidationReadinessCheck[]
}

export interface ImportPayableRecord {
  handoffId: string | null
  shipmentId: string
  sourceType: ImportPayableSourceType
  sourceId: string
  counterparty: string
  documentNumber: string | null
  payableKind: string
  sourceAmount: number
  sourceCurrency: ImportSourceCurrency
  fxRate: number
  fxDate: string
  hnlAmount: number
  final: boolean
  readyForAp: boolean
  handoffStatus: ImportPayableHandoffStatus
  apReference: string | null
  sentToApBy: string | null
  sentToApAt: string | null
  paymentReference: string | null
  paidBy: string | null
  paidAt: string | null
  voidedBy: string | null
  voidedAt: string | null
  voidReason: string | null
  notes: string | null
}

export interface ImportPayablesEnvelope {
  shipmentId: string
  payables: ImportPayableRecord[]
  totalHnlAmount: number
  readyHnlAmount: number
  stagedCount: number
  sentCount: number
  paidCount: number
  voidedCount: number
  blockedCount: number
}

export interface StageImportPayablesResult extends ImportPayablesEnvelope {
  stagedReadyCount: number
  blockedEstimatedChargeCount: number
}

export interface ImportReceivingHandoffLine {
  shipmentId: string
  invoiceLineId: string
  shipmentLineId: string | null
  purchaseOrderId: string | null
  purchaseOrderLineId: string | null
  purchaseOrderNumber: string | null
  purchaseOrderStatus: string | null
  skuId: string | null
  itemCode: string | null
  styleCode: string | null
  description: string | null
  quantity: number
  unitOfMeasure: string
  baseUnitCostHnl: number
  allocatedLandedCostHnl: number
  landedUnitCostHnl: number | null
  receivingUnitCostHnl: number | null
  receivingLineCostHnl: number | null
  receivingCostBasis: ImportReceivingCostBasis | null
  goodsInTransitRecordId: string | null
  containerId: string | null
  containerLabel: string | null
  transitStatus: GoodsInTransitStatus | null
  quantityInTransit: number | null
  expectedReceiptAt: string | null
  receivedAt: string | null
  canReceive: boolean
  requiresAuditReason: boolean
  needsFinalTrueUp: boolean
  blockingReason: string | null
}

export interface ImportReceivingHandoffEnvelope {
  shipmentId: string
  shipmentNumber: string
  displayName: string
  status: ImportShipmentStatus
  receivingCostBasis: ImportReceivingCostBasis | null
  canReceive: boolean
  requiresAuditReason: boolean
  lineCount: number
  readyLineCount: number
  blockedLineCount: number
  trueUpLineCount: number
  totalQuantity: number
  totalLandedHnl: number
  readyLandedHnl: number
  lines: ImportReceivingHandoffLine[]
  audit: ImportReceivingAuditSummary
}

export interface ImportPostedPurchaseOrderReceipt {
  purchaseOrderId: string
  purchaseOrderNumber: string
  receiptId: string
  postedLineCount: number
  postedQuantity: number
  postedHnlAmount: number
}

export interface ImportPostedInventoryReceipt {
  receiptId: string
  invoiceLineId: string
  stockMovementId: string
  skuId: string
  storeId: number
  receiptBasis: ImportReceivingCostBasis
  quantity: number
  unitCostHnl: number
  hnlAmount: number
}

export interface ImportPostedInventoryTrueUp {
  trueUpId: string
  invoiceLineId: string
  importInventoryReceiptId: string | null
  purchaseOrderId: string | null
  purchaseOrderLineId: string | null
  purchaseOrderNumber: string | null
  stockMovementId: string
  skuId: string
  storeId: number
  quantity: number
  estimatedUnitCostHnl: number
  finalUnitCostHnl: number
  deltaUnitCostHnl: number
  deltaHnlAmount: number
}

export interface ImportReceivingPurchaseOrderReceiptAuditRecord extends ImportPostedPurchaseOrderReceipt {
  receiptBasis: ImportReceivingCostBasis | null
  storeId: number | null
  referenceNumber: string | null
  postedBy: string
  postedAt: string
}

export interface ImportReceivingInventoryReceiptAuditRecord extends ImportPostedInventoryReceipt {
  itemCode: string | null
  description: string | null
  postedBy: string
  auditReason: string | null
  postedAt: string
}

export interface ImportReceivingInventoryTrueUpAuditRecord extends ImportPostedInventoryTrueUp {
  itemCode: string | null
  description: string | null
  postedBy: string
  auditReason: string | null
  postedAt: string
}

export interface ImportReceivingAuditSummary {
  purchaseOrderReceiptCount: number
  purchaseOrderReceiptLineCount: number
  purchaseOrderReceiptQuantity: number
  purchaseOrderReceiptHnl: number
  inventoryReceiptCount: number
  inventoryReceiptQuantity: number
  inventoryReceiptHnl: number
  inventoryTrueUpCount: number
  inventoryTrueUpQuantity: number
  inventoryTrueUpHnl: number
  purchaseOrderReceipts: ImportReceivingPurchaseOrderReceiptAuditRecord[]
  inventoryReceipts: ImportReceivingInventoryReceiptAuditRecord[]
  inventoryTrueUps: ImportReceivingInventoryTrueUpAuditRecord[]
}

export interface ImportReceivingActionResult extends ImportReceivingHandoffEnvelope {
  action: 'RECEIVE_ESTIMATED' | 'RECEIVE_FINAL'
  updatedRecordCount: number
  postedPurchaseOrderReceiptCount: number
  postedPurchaseOrderLineCount: number
  postedPurchaseOrderQuantity: number
  postedPurchaseOrderHnl: number
  postedInventoryReceiptCount: number
  postedInventoryReceiptQuantity: number
  postedInventoryReceiptHnl: number
  postedInventoryTrueUpCount: number
  postedInventoryTrueUpQuantity: number
  postedInventoryTrueUpHnl: number
  skippedFinalTrueUpLineCount: number
  purchaseOrderReceipts: ImportPostedPurchaseOrderReceipt[]
  inventoryReceipts: ImportPostedInventoryReceipt[]
  inventoryTrueUps: ImportPostedInventoryTrueUp[]
}

export interface ImportPurchaseOrderLinkLine {
  shipmentId: string
  invoiceId: string
  invoiceNumber: string
  supplierCode: string | null
  supplierName: string
  invoiceLineId: string
  purchaseOrderLineId: string | null
  purchaseOrderId: string | null
  purchaseOrderNumber: string | null
  purchaseOrderStatus: string | null
  purchaseOrderVendorCode: string | null
  skuId: string | null
  poLineSkuId: string | null
  skuCode: string | null
  itemCode: string | null
  styleCode: string | null
  description: string | null
  quantity: number
  unitOfMeasure: string
  baseUnitCostHnl: number
  landedUnitCostHnl: number | null
  poUnitCostHnl: number | null
  canCreatePurchaseOrderLine: boolean
  blockingReason: string | null
}

export interface ImportPurchaseOrderLinkingEnvelope {
  shipmentId: string
  shipmentNumber: string
  displayName: string
  status: ImportShipmentStatus
  lineCount: number
  linkedLineCount: number
  unlinkedLineCount: number
  creatableLineCount: number
  lines: ImportPurchaseOrderLinkLine[]
}

export interface CreateImportPurchaseOrderDraftResult extends ImportPurchaseOrderLinkingEnvelope {
  purchaseOrderId: string
  purchaseOrderNumber: string
  createdLineCount: number
  unitCostSource: ImportPoUnitCostSource
}

export interface ImportWorkbookMoneyPreview {
  sourceAmount: number
  sourceCurrency: ImportSourceCurrency
  fxRate: number | null
  fxDate: string | null
  hnlAmount: number | null
}

export interface ImportWorkbookLinePreview extends ImportWorkbookMoneyPreview {
  lineNumber: number
  itemCode: string | null
  styleCode: string | null
  description: string | null
  materialMeters: number | null
  quantity: number
  unitOfMeasure: string
  sourceUnitCost: number | null
  taxable: boolean
}

export interface ImportWorkbookSupplierInvoicePreview extends ImportWorkbookMoneyPreview {
  invoiceNumber: string
  supplierCode: string | null
  supplierName: string
  invoiceDate: string | null
  invoiceGroup: ImportInvoiceGroup
  invoiceKind: ImportInvoiceKind
  notes: string | null
  lines: ImportWorkbookLinePreview[]
}

export interface ImportWorkbookChargePreview extends ImportWorkbookMoneyPreview {
  chargeType: ImportChargeType
  counterparty: string | null
  documentNumber: string | null
  taxable: boolean
  estimated: boolean
  final: boolean
  notes: string | null
}

export interface ImportWorkbookVerificationCheckPreview {
  checkCode: string
  status: 'PENDING' | 'PASS' | 'WARN' | 'FAIL'
  expectedHnlAmount: number | null
  actualHnlAmount: number | null
  varianceHnlAmount: number | null
  message: string | null
}

export interface ImportWorkbookPreview {
  kind: ImportWorkbookKind
  fileName: string
  shipment: CreateImportShipmentPayload
  supplierInvoices: ImportWorkbookSupplierInvoicePreview[]
  charges: ImportWorkbookChargePreview[]
  verificationChecks: ImportWorkbookVerificationCheckPreview[]
  totals: {
    invoiceSourceTotal: number
    invoiceHnlTotal: number | null
    chargeHnlTotal: number | null
    invoiceCount: number
    lineCount: number
    chargeCount: number
  }
  warnings: string[]
}

export interface ImportWorkbookImportResult {
  preview: ImportWorkbookPreview
  shipment: ImportShipmentDetail
  allocation: ImportAllocationResult | null
}

export interface CreateGoodsInTransitForShipmentResult {
  shipment: ImportShipmentDetail
  createdCount: number
}
