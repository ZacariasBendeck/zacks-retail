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

export function rowToPoLineItem(row: PoLineItemRow): PoLineItem {
  return {
    id: row.id,
    poId: row.po_id,
    skuId: row.sku_id,
    quantityOrdered: row.quantity_ordered,
    quantityReceived: row.quantity_received,
    unitCost: row.unit_cost,
    lineTotal: row.quantity_ordered * row.unit_cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToPurchaseOrder(row: PurchaseOrderRow, lineItemRows: PoLineItemRow[]): PurchaseOrder {
  const lineItems = lineItemRows.map(rowToPoLineItem);
  return {
    id: row.id,
    poNumber: row.po_number,
    vendorId: row.vendor_id,
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
