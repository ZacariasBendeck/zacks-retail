import { buildRicsImageUrl } from '../services/ricsImageUrl';

export type PoStatus = 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';
export type PoSourceCurrency = 'CNY' | 'USD' | 'HNL';
export type PoCostBasis = 'LANDED_LEGACY_HNL' | 'HNL_DOMESTIC' | 'VENDOR_CURRENCY_ESTIMATED_LANDED';

export interface PurchaseOrderRow {
  id: string;
  po_number: string;
  vendor_id: string;
  status: PoStatus;
  notes: string | null;
  cancellation_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PoLineItemRow {
  id: string;
  po_id: string;
  sku_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  source_unit_cost?: number | null;
  commercial_unit_cost_hnl?: number | null;
  estimated_landed_unit_cost_hnl?: number | null;
  created_at: string;
  updated_at: string;
}

export interface PoStatusHistoryRow {
  id: string;
  po_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  reason: string | null;
  created_at: string;
}

export interface PoLineItem {
  id: string;
  poId: string;
  skuId: string;
  skuCode?: string;
  brand?: string;
  pictureUrl?: string | null;
  sizeType: number | null;
  casePackId: string | null;
  casePackMultiplier: number | null;
  sizeCells: Array<{ columnLabel: string; rowLabel: string; quantity: number }>;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  sourceUnitCost: number | null;
  commercialUnitCostHnl: number | null;
  estimatedLandedUnitCostHnl: number | null;
  lineTotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  billToStoreId: number | null;
  shipToStoreId: number | null;
  vendorId: string;
  vendorName?: string;
  orderType: string;
  classification: string;
  origin: string;
  originSourcePoId: string | null;
  confirmationNumber: string | null;
  accountNumber: string | null;
  terms: string | null;
  shipVia: string | null;
  backorderAllowed: boolean;
  splitShipment: boolean;
  programCode: string | null;
  storeLabelsOnReceive: boolean;
  buyer: string | null;
  sourceCurrency: PoSourceCurrency;
  fxRate: number;
  fxDate: string;
  incotermCode: string | null;
  incotermPlace: string | null;
  costBasis: PoCostBasis;
  orderDate: string;
  shipDate: string | null;
  plannedReceiptDate: string | null;
  cancelDate: string | null;
  paymentDate: string | null;
  status: PoStatus;
  notes: string | null;
  cancellationReason: string | null;
  createdBy: string;
  lineItems: PoLineItem[];
  subtotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface PoStatusHistory {
  id: string;
  poId: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string;
  reason: string | null;
  createdAt: string;
}

export interface PoReceiptRow {
  id: string;
  po_id: string;
  location_id: string;
  received_by: string;
  reference_number: string | null;
  discount_percent?: number | null;
  freight_each?: number | null;
  received_at: string;
  created_at: string;
  location_name?: string;
}

export interface PoReceiptLineRow {
  id: string;
  receipt_id: string;
  po_line_id: string | null;
  sku_id: string;
  sku_size_id: string | null;
  quantity_received: number;
  unit_cost: number | null;
  discrepancy_reason: string | null;
  audit_reference: string | null;
  created_at: string;
  sku_code?: string;
  style?: string;
}

export interface PoReceiptLine {
  id: string;
  receiptId: string;
  poLineId: string | null;
  skuId: string;
  skuCode?: string;
  style?: string;
  skuSizeId: string | null;
  quantityReceived: number;
  unitCost: number | null;
  discrepancyReason: string | null;
  auditReference: string | null;
  createdAt: string;
}

export interface PoReceipt {
  id: string;
  poId: string;
  locationId: string;
  locationName: string | null;
  receivedBy: string;
  referenceNumber: string | null;
  discountPercent: number;
  freightEach: number;
  receivedAt: string;
  createdAt: string;
  lines: PoReceiptLine[];
}

export type TransferOrderStatus = 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface TransferOrderRow {
  id: string;
  from_location_id: string;
  to_location_id: string;
  status: TransferOrderStatus;
  requested_by: string;
  shipped_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
  from_location_name?: string;
  to_location_name?: string;
}

export interface TransferOrderLineRow {
  id: string;
  transfer_order_id: string;
  sku_id: string;
  sku_size_id: string | null;
  quantity: number;
  created_at: string;
  sku_code?: string;
  style?: string;
}

export interface TransferOrderLine {
  id: string;
  transferOrderId: string;
  skuId: string;
  skuCode?: string;
  style?: string;
  skuSizeId: string | null;
  quantity: number;
  createdAt: string;
}

export interface TransferOrder {
  id: string;
  fromLocationId: string;
  fromLocationName: string | null;
  toLocationId: string;
  toLocationName: string | null;
  status: TransferOrderStatus;
  requestedBy: string;
  shippedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: TransferOrderLine[];
}

export function rowToPoLineItem(
  row: PoLineItemRow & { sku_code?: string; style?: string; picture_file_name?: string | null }
): PoLineItem {
  return {
    id: row.id,
    poId: row.po_id,
    skuId: row.sku_id,
    skuCode: row.sku_code,
    brand: row.style,
    pictureUrl: buildRicsImageUrl(row.picture_file_name),
    sizeType: null,
    casePackId: null,
    casePackMultiplier: null,
    sizeCells: [],
    quantityOrdered: row.quantity_ordered,
    quantityReceived: row.quantity_received,
    unitCost: row.unit_cost,
    sourceUnitCost: row.source_unit_cost ?? row.unit_cost,
    commercialUnitCostHnl: row.commercial_unit_cost_hnl ?? row.unit_cost,
    estimatedLandedUnitCostHnl: row.estimated_landed_unit_cost_hnl ?? row.unit_cost,
    lineTotal: row.quantity_ordered * row.unit_cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToPurchaseOrder(
  row: PurchaseOrderRow & {
    vendor_name?: string;
    bill_to_store_id?: number | null;
    ship_to_store_id?: number | null;
    order_type?: string;
    classification?: string;
    origin?: string;
    origin_source_po_id?: string | null;
    confirmation_number?: string | null;
    account_number?: string | null;
    terms?: string | null;
    ship_via?: string | null;
    backorder_allowed?: boolean;
    split_shipment?: boolean;
    program_code?: string | null;
    store_labels_on_receive?: boolean;
    buyer?: string | null;
    source_currency?: PoSourceCurrency;
    fx_rate?: number | string;
    fx_date?: string;
    incoterm_code?: string | null;
    incoterm_place?: string | null;
    cost_basis?: PoCostBasis;
    order_date?: string;
    ship_date?: string | null;
    planned_receipt_date?: string | null;
    cancel_date?: string | null;
    payment_date?: string | null;
  },
  lineItemRows: (PoLineItemRow & { sku_code?: string; style?: string; picture_file_name?: string | null })[]
): PurchaseOrder {
  const lineItems = lineItemRows.map(rowToPoLineItem);
  return {
    id: row.id,
    poNumber: row.po_number,
    billToStoreId: row.bill_to_store_id ?? null,
    shipToStoreId: row.ship_to_store_id ?? null,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    orderType: row.order_type ?? 'RO',
    classification: row.classification ?? 'AT_ONCE',
    origin: row.origin ?? 'MANUAL',
    originSourcePoId: row.origin_source_po_id ?? null,
    confirmationNumber: row.confirmation_number ?? null,
    accountNumber: row.account_number ?? null,
    terms: row.terms ?? null,
    shipVia: row.ship_via ?? null,
    backorderAllowed: row.backorder_allowed ?? false,
    splitShipment: row.split_shipment ?? false,
    programCode: row.program_code ?? null,
    storeLabelsOnReceive: row.store_labels_on_receive ?? false,
    buyer: row.buyer ?? null,
    sourceCurrency: row.source_currency ?? 'HNL',
    fxRate: Number(row.fx_rate ?? 1),
    fxDate: row.fx_date ?? row.created_at,
    incotermCode: row.incoterm_code ?? null,
    incotermPlace: row.incoterm_place ?? null,
    costBasis: row.cost_basis ?? 'LANDED_LEGACY_HNL',
    orderDate: row.order_date ?? row.created_at,
    shipDate: row.ship_date ?? null,
    plannedReceiptDate: row.planned_receipt_date ?? null,
    cancelDate: row.cancel_date ?? null,
    paymentDate: row.payment_date ?? null,
    status: row.status,
    notes: row.notes,
    cancellationReason: row.cancellation_reason,
    createdBy: row.created_by,
    lineItems,
    subtotal: lineItems.reduce((sum, li) => sum + li.lineTotal, 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToPoStatusHistory(row: PoStatusHistoryRow): PoStatusHistory {
  return {
    id: row.id,
    poId: row.po_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export function rowToPoReceiptLine(row: PoReceiptLineRow): PoReceiptLine {
  return {
    id: row.id,
    receiptId: row.receipt_id,
    poLineId: row.po_line_id,
    skuId: row.sku_id,
    skuCode: row.sku_code,
    style: row.style,
    skuSizeId: row.sku_size_id,
    quantityReceived: row.quantity_received,
    unitCost: row.unit_cost,
    discrepancyReason: row.discrepancy_reason,
    auditReference: row.audit_reference,
    createdAt: row.created_at,
  };
}

export function rowToPoReceipt(row: PoReceiptRow, lineRows: PoReceiptLineRow[]): PoReceipt {
  return {
    id: row.id,
    poId: row.po_id,
    locationId: row.location_id,
    locationName: row.location_name ?? null,
    receivedBy: row.received_by,
    referenceNumber: row.reference_number,
    discountPercent: row.discount_percent ?? 0,
    freightEach: row.freight_each ?? 0,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    lines: lineRows.map(rowToPoReceiptLine),
  };
}

export function rowToTransferOrderLine(row: TransferOrderLineRow): TransferOrderLine {
  return {
    id: row.id,
    transferOrderId: row.transfer_order_id,
    skuId: row.sku_id,
    skuCode: row.sku_code,
    style: row.style,
    skuSizeId: row.sku_size_id,
    quantity: row.quantity,
    createdAt: row.created_at,
  };
}

export function rowToTransferOrder(row: TransferOrderRow, lineRows: TransferOrderLineRow[]): TransferOrder {
  return {
    id: row.id,
    fromLocationId: row.from_location_id,
    fromLocationName: row.from_location_name ?? null,
    toLocationId: row.to_location_id,
    toLocationName: row.to_location_name ?? null,
    status: row.status,
    requestedBy: row.requested_by,
    shippedAt: row.shipped_at,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lines: lineRows.map(rowToTransferOrderLine),
  };
}
