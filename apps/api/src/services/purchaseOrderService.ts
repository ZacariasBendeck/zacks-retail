import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import {
  PurchaseOrder,
  PurchaseOrderRow,
  PoLineItemRow,
  PoStatus,
  PoStatusHistoryRow,
  rowToPurchaseOrder,
  rowToPoStatusHistory,
  PoStatusHistory,
} from '../models/purchaseOrder';
import { PaginationEnvelope } from '../models/sku';

type DbValue = null | number | bigint | string;

function generatePoNumber(): string {
  const db = getDb();
  const prefix = 'PO';
  db.prepare(
    'INSERT INTO sku_code_seq (prefix, next_val) VALUES (?, 1) ON CONFLICT(prefix) DO UPDATE SET next_val = next_val + 1'
  ).run(prefix);
  const row = db.prepare('SELECT next_val FROM sku_code_seq WHERE prefix = ?').get(prefix) as unknown as { next_val: number };
  return `${prefix}-${String(row.next_val).padStart(6, '0')}`;
}

function loadLineItems(poId: string): PoLineItemRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM purchase_order_lines WHERE po_id = ? ORDER BY created_at ASC').all(poId) as unknown as PoLineItemRow[];
}

function insertStatusHistory(poId: string, fromStatus: string | null, toStatus: string, changedBy: string, reason?: string | null): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO po_status_history (id, po_id, from_status, to_status, changed_by, reason) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuidv4(), poId, fromStatus, toStatus, changedBy, reason ?? null);
}

export function createPurchaseOrder(data: {
  vendorId: string;
  lineItems: { skuId: string; quantity: number; unitCost: number }[];
  notes?: string | null;
  createdBy?: string;
}): PurchaseOrder | { error: string } {
  const db = getDb();

  // Validate vendor exists
  const vendor = db.prepare('SELECT id FROM vendors WHERE id = ?').get(data.vendorId);
  if (!vendor) return { error: 'VENDOR_NOT_FOUND' };

  // Validate all SKUs exist
  for (const item of data.lineItems) {
    const sku = db.prepare('SELECT id FROM skus WHERE id = ?').get(item.skuId);
    if (!sku) return { error: `SKU_NOT_FOUND:${item.skuId}` };
  }

  const poId = uuidv4();
  const poNumber = generatePoNumber();
  const createdBy = data.createdBy ?? 'system';

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      'INSERT INTO purchase_orders (id, po_number, vendor_id, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(poId, poNumber, data.vendorId, 'DRAFT', data.notes ?? null, createdBy);

    for (const item of data.lineItems) {
      db.prepare(
        'INSERT INTO purchase_order_lines (id, po_id, sku_id, quantity_ordered, unit_cost) VALUES (?, ?, ?, ?, ?)'
      ).run(uuidv4(), poId, item.skuId, item.quantity, item.unitCost);
    }

    insertStatusHistory(poId, null, 'DRAFT', createdBy);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const row = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId) as unknown as PurchaseOrderRow;
  return rowToPurchaseOrder(row, loadLineItems(poId));
}

export function getPurchaseOrderById(id: string): PurchaseOrder | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) as unknown as PurchaseOrderRow | undefined;
  if (!row) return null;
  return rowToPurchaseOrder(row, loadLineItems(id));
}

export function updatePurchaseOrder(
  id: string,
  data: {
    notes?: string | null;
    lineItems?: { skuId: string; quantity: number; unitCost: number }[];
  }
): PurchaseOrder | null | { error: string } {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) as unknown as PurchaseOrderRow | undefined;
  if (!existing) return null;

  if (existing.status !== 'DRAFT') {
    return { error: 'ONLY_DRAFT_EDITABLE' };
  }

  // Validate SKUs if line items are being replaced
  if (data.lineItems) {
    for (const item of data.lineItems) {
      const sku = db.prepare('SELECT id FROM skus WHERE id = ?').get(item.skuId);
      if (!sku) return { error: `SKU_NOT_FOUND:${item.skuId}` };
    }
  }

  db.exec('BEGIN TRANSACTION');
  try {
    if (data.notes !== undefined) {
      db.prepare("UPDATE purchase_orders SET notes = ?, updated_at = datetime('now') WHERE id = ?").run(data.notes, id);
    }

    if (data.lineItems) {
      db.prepare('DELETE FROM purchase_order_lines WHERE po_id = ?').run(id);
      for (const item of data.lineItems) {
        db.prepare(
          'INSERT INTO purchase_order_lines (id, po_id, sku_id, quantity_ordered, unit_cost) VALUES (?, ?, ?, ?, ?)'
        ).run(uuidv4(), id, item.skuId, item.quantity, item.unitCost);
      }
      db.prepare("UPDATE purchase_orders SET updated_at = datetime('now') WHERE id = ?").run(id);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getPurchaseOrderById(id);
}

const VALID_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['PARTIALLY_RECEIVED', 'RECEIVED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function transitionStatus(
  id: string,
  newStatus: PoStatus,
  options?: { changedBy?: string; reason?: string }
): PurchaseOrder | null | { error: string } {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) as unknown as PurchaseOrderRow | undefined;
  if (!existing) return null;

  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed.includes(newStatus)) {
    return { error: `INVALID_TRANSITION:${existing.status}→${newStatus}` };
  }

  const changedBy = options?.changedBy ?? 'system';

  db.exec('BEGIN TRANSACTION');
  try {
    if (newStatus === 'CANCELLED' && options?.reason) {
      db.prepare("UPDATE purchase_orders SET status = ?, cancellation_reason = ?, updated_at = datetime('now') WHERE id = ?")
        .run(newStatus, options.reason, id);
    } else {
      db.prepare("UPDATE purchase_orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .run(newStatus, id);
    }

    insertStatusHistory(id, existing.status, newStatus, changedBy, options?.reason);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getPurchaseOrderById(id);
}

export function getStatusHistory(poId: string): PoStatusHistory[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM po_status_history WHERE po_id = ? ORDER BY created_at ASC'
  ).all(poId) as unknown as PoStatusHistoryRow[];
  return rows.map(rowToPoStatusHistory);
}

export function listPurchaseOrders(params: {
  page: number;
  pageSize: number;
  status?: PoStatus;
  vendorId?: string;
  q?: string;
}): PaginationEnvelope<PurchaseOrder> {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.status) {
    conditions.push('po.status = ?');
    values.push(params.status);
  }

  if (params.vendorId) {
    conditions.push('po.vendor_id = ?');
    values.push(params.vendorId);
  }

  if (params.q) {
    const pattern = `%${params.q}%`;
    conditions.push('(po.po_number LIKE ? OR po.notes LIKE ?)');
    values.push(pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(
    `SELECT COUNT(*) as total FROM purchase_orders po ${whereClause}`
  ).get(...values) as unknown as { total: number };

  const totalItems = countRow.total;
  const totalPages = Math.ceil(totalItems / params.pageSize);
  const offset = (params.page - 1) * params.pageSize;

  const rows = db.prepare(
    `SELECT po.* FROM purchase_orders po ${whereClause} ORDER BY po.created_at DESC LIMIT ? OFFSET ?`
  ).all(...values, params.pageSize, offset) as unknown as PurchaseOrderRow[];

  const data = rows.map((row) => rowToPurchaseOrder(row, loadLineItems(row.id)));

  return {
    data,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages,
    },
  };
}
