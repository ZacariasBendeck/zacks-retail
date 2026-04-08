export type PoStatus = 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';

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
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  lineTotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName?: string;
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

export function rowToPoLineItem(row: PoLineItemRow & { sku_code?: string; style?: string }): PoLineItem {
  return {
    id: row.id,
    poId: row.po_id,
    skuId: row.sku_id,
    skuCode: row.sku_code,
    brand: row.style,
    quantityOrdered: row.quantity_ordered,
    quantityReceived: row.quantity_received,
    unitCost: row.unit_cost,
    lineTotal: row.quantity_ordered * row.unit_cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToPurchaseOrder(
  row: PurchaseOrderRow & { vendor_name?: string },
  lineItemRows: (PoLineItemRow & { sku_code?: string; style?: string })[]
): PurchaseOrder {
  const lineItems = lineItemRows.map(rowToPoLineItem);
  return {
    id: row.id,
    poNumber: row.po_number,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
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
