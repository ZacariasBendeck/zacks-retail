import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import {
  PurchaseOrder,
  PurchaseOrderRow,
  PoLineItemRow,
  PoStatus,
  PoStatusHistoryRow,
  PoReceipt,
  PoReceiptLineRow,
  PoReceiptRow,
  TransferOrder,
  TransferOrderLineRow,
  TransferOrderRow,
  TransferOrderStatus,
  rowToPurchaseOrder,
  rowToPoReceipt,
  rowToPoStatusHistory,
  rowToTransferOrder,
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

interface EnrichedPoLineItemRow extends PoLineItemRow {
  sku_code?: string;
  style?: string;
}

function loadLineItems(poId: string): EnrichedPoLineItemRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT pol.*, s.sku_code, s.style
    FROM purchase_order_lines pol
    LEFT JOIN skus s ON s.id = pol.sku_id
    WHERE pol.po_id = ?
    ORDER BY pol.created_at ASC
  `).all(poId) as unknown as EnrichedPoLineItemRow[];
}

function loadPoWithVendor(poId: string): (PurchaseOrderRow & { vendor_name?: string }) | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT po.*, v.name as vendor_name
    FROM purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE po.id = ?
  `).get(poId) as unknown as (PurchaseOrderRow & { vendor_name?: string }) | undefined;
}

function loadPoReceiptLines(receiptId: string): PoReceiptLineRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      prl.*,
      s.sku_code,
      s.style
    FROM po_receipt_lines prl
    LEFT JOIN skus s ON s.id = prl.sku_id
    WHERE prl.receipt_id = ?
    ORDER BY prl.created_at ASC
  `).all(receiptId) as unknown as PoReceiptLineRow[];
}

function loadPoReceipts(poId: string): PoReceipt[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      pr.*,
      l.name AS location_name
    FROM po_receipts pr
    LEFT JOIN inventory_locations l ON l.id = pr.location_id
    WHERE pr.po_id = ?
    ORDER BY pr.received_at DESC
  `).all(poId) as unknown as PoReceiptRow[];

  return rows.map((row) => rowToPoReceipt(row, loadPoReceiptLines(row.id)));
}

function loadTransferOrderLines(transferOrderId: string): TransferOrderLineRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      tol.*,
      s.sku_code,
      s.style
    FROM transfer_order_lines tol
    LEFT JOIN skus s ON s.id = tol.sku_id
    WHERE tol.transfer_order_id = ?
    ORDER BY tol.created_at ASC
  `).all(transferOrderId) as unknown as TransferOrderLineRow[];
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

  const row = loadPoWithVendor(poId)!;
  return rowToPurchaseOrder(row, loadLineItems(poId));
}

export function getPurchaseOrderById(id: string): PurchaseOrder | null {
  const row = loadPoWithVendor(id);
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

export function submitPurchaseOrder(
  id: string,
  options?: { changedBy?: string }
): PurchaseOrder | null | { error: string } {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) as unknown as PurchaseOrderRow | undefined;
  if (!existing) return null;

  if (existing.status !== 'DRAFT') {
    return { error: `INVALID_TRANSITION:${existing.status}→SUBMITTED` };
  }

  // Validate at least one line item exists
  const lines = loadLineItems(id);
  if (lines.length === 0) {
    return { error: 'NO_LINE_ITEMS' };
  }

  // Validate all SKUs are active
  for (const line of lines) {
    const sku = db.prepare('SELECT id, active FROM skus WHERE id = ?').get(line.sku_id) as unknown as { id: string; active: number } | undefined;
    if (!sku || !sku.active) {
      return { error: `INACTIVE_SKU:${line.sku_id}` };
    }
  }

  return transitionStatus(id, 'SUBMITTED', options);
}

export function cancelPurchaseOrder(
  id: string,
  options?: { changedBy?: string; reason?: string }
): PurchaseOrder | null | { error: string } {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) as unknown as PurchaseOrderRow | undefined;
  if (!existing) return null;

  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed.includes('CANCELLED')) {
    return { error: `INVALID_TRANSITION:${existing.status}→CANCELLED` };
  }

  // Require reason for SUBMITTED or CONFIRMED cancellations
  if ((existing.status === 'SUBMITTED' || existing.status === 'CONFIRMED') && !options?.reason) {
    return { error: 'REASON_REQUIRED' };
  }

  return transitionStatus(id, 'CANCELLED', options);
}

export function receivePurchaseOrder(
  id: string,
  data: {
    lines: { lineId: string; quantityReceived: number; discrepancyReason?: string | null; auditReference?: string | null }[];
    locationId?: string;
    receivedBy?: string;
    referenceNumber?: string;
    idempotencyKey?: string;
    reason?: string;
  },
  options?: { changedBy?: string }
): PurchaseOrder | null | { error: string } {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) as unknown as PurchaseOrderRow | undefined;
  if (!existing) return null;

  // Idempotency check: if key was already used, return the current PO state
  if (data.idempotencyKey) {
    const existingReceipt = db.prepare(
      'SELECT id FROM po_receipts WHERE idempotency_key = ?'
    ).get(data.idempotencyKey) as { id: string } | undefined;
    if (existingReceipt) {
      return getPurchaseOrderById(id)!;
    }
  }

  if (existing.status !== 'CONFIRMED' && existing.status !== 'PARTIALLY_RECEIVED') {
    return { error: `INVALID_TRANSITION:${existing.status}→RECEIVED` };
  }

  // Validate all lineIds belong to this PO
  const poLines = loadLineItems(id);
  const poLineMap = new Map(poLines.map(l => [l.id, l]));
  for (const line of data.lines) {
    if (!poLineMap.has(line.lineId)) {
      return { error: `LINE_NOT_FOUND:${line.lineId}` };
    }
  }

  // Conditional validation: discrepancyReason required when receiving less than remaining ordered
  for (const line of data.lines) {
    const poLine = poLineMap.get(line.lineId)!;
    const remainingToReceive = poLine.quantity_ordered - poLine.quantity_received;
    if (line.quantityReceived < remainingToReceive && !line.discrepancyReason) {
      return { error: `DISCREPANCY_REASON_REQUIRED:${line.lineId}` };
    }
  }

  const changedBy = options?.changedBy ?? 'system';
  const receiptLocationId = data.locationId ?? 'loc-01';
  const receiptLocation = db.prepare('SELECT id FROM inventory_locations WHERE id = ?').get(receiptLocationId);
  if (!receiptLocation) {
    return { error: `LOCATION_NOT_FOUND:${receiptLocationId}` };
  }

  db.exec('BEGIN TRANSACTION');
  try {
    const receiptId = uuidv4();
    const receiptCreatedBy = data.receivedBy ?? changedBy;
    db.prepare(`
      INSERT INTO po_receipts (
        id,
        po_id,
        location_id,
        received_by,
        reference_number,
        idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      receiptId,
      id,
      receiptLocationId,
      receiptCreatedBy,
      data.referenceNumber ?? null,
      data.idempotencyKey ?? null,
    );

    // Update each line's quantity_received and inventory
    for (const line of data.lines) {
      const poLine = poLineMap.get(line.lineId)!;
      const newQtyReceived = poLine.quantity_received + line.quantityReceived;

      if (newQtyReceived > poLine.quantity_ordered) {
        db.exec('ROLLBACK');
        return { error: `QUANTITY_EXCEEDS_ORDERED:${line.lineId}` };
      }

      db.prepare(
        "UPDATE purchase_order_lines SET quantity_received = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newQtyReceived, line.lineId);

      // Update inventory on-hand
      const invRow = db.prepare('SELECT * FROM inventory WHERE sku_id = ?').get(poLine.sku_id) as unknown as { quantity_on_hand: number } | undefined;
      if (invRow) {
        const newBalance = invRow.quantity_on_hand + line.quantityReceived;
        db.prepare(
          "UPDATE inventory SET quantity_on_hand = ?, updated_at = datetime('now') WHERE sku_id = ?"
        ).run(newBalance, poLine.sku_id);

        // Insert audit log
        db.prepare(
          'INSERT INTO inventory_audit_log (id, sku_id, adjustment, reason, resulting_balance, performed_by) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(uuidv4(), poLine.sku_id, line.quantityReceived, `PO receive: ${existing.po_number}`, newBalance, changedBy);
      } else {
        // Create inventory record if it doesn't exist
        const newBalance = line.quantityReceived;
        db.prepare(
          'INSERT INTO inventory (id, sku_id, quantity_on_hand) VALUES (?, ?, ?)'
        ).run(uuidv4(), poLine.sku_id, newBalance);

        db.prepare(
          'INSERT INTO inventory_audit_log (id, sku_id, adjustment, reason, resulting_balance, performed_by) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(uuidv4(), poLine.sku_id, line.quantityReceived, `PO receive: ${existing.po_number}`, newBalance, changedBy);
      }

      db.prepare(`
        INSERT INTO po_receipt_lines (
          id,
          receipt_id,
          po_line_id,
          sku_id,
          sku_size_id,
          quantity_received,
          unit_cost,
          discrepancy_reason,
          audit_reference
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        receiptId,
        poLine.id,
        poLine.sku_id,
        line.quantityReceived,
        poLine.unit_cost,
        line.discrepancyReason ?? null,
        line.auditReference ?? null,
      );
    }

    // Reload lines to determine new status
    const updatedLines = loadLineItems(id);
    const allFullyReceived = updatedLines.every(l => l.quantity_received >= l.quantity_ordered);
    const newStatus: PoStatus = allFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

    db.prepare("UPDATE purchase_orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newStatus, id);

    insertStatusHistory(id, existing.status, newStatus, changedBy, data.reason ?? null);

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

const PO_SORT_MAP: Record<string, string> = {
  poNumber: 'po.po_number',
  status: 'po.status',
  createdAt: 'po.created_at',
  updatedAt: 'po.updated_at',
};

export function listPurchaseOrders(params: {
  page: number;
  pageSize: number;
  sort?: string;
  order?: 'asc' | 'desc';
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

  const sortCol = PO_SORT_MAP[params.sort ?? 'createdAt'] || 'po.created_at';
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';

  const rows = db.prepare(
    `SELECT po.*, v.name as vendor_name FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id ${whereClause} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`
  ).all(...values, params.pageSize, offset) as unknown as (PurchaseOrderRow & { vendor_name?: string })[];

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

export interface OverduePoException {
  poId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  status: PoStatus;
  leadTimeDays: number;
  submittedAt: string;
  expectedDeliveryDate: string;
  daysOverdue: number;
}

export function listOverdueExceptions(): OverduePoException[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      po.id AS po_id,
      po.po_number,
      po.vendor_id,
      v.name AS vendor_name,
      po.status,
      v.lead_time_days,
      sh.created_at AS submitted_at
    FROM purchase_orders po
    JOIN vendors v ON v.id = po.vendor_id
    JOIN po_status_history sh ON sh.po_id = po.id AND sh.to_status = 'SUBMITTED'
    WHERE po.status IN ('SUBMITTED', 'CONFIRMED')
      AND v.lead_time_days IS NOT NULL
      AND date(sh.created_at, '+' || v.lead_time_days || ' days') < date('now')
    ORDER BY date(sh.created_at, '+' || v.lead_time_days || ' days') ASC
  `).all() as unknown as {
    po_id: string;
    po_number: string;
    vendor_id: string;
    vendor_name: string;
    status: PoStatus;
    lead_time_days: number;
    submitted_at: string;
  }[];

  return rows.map((row) => {
    const expectedDate = new Date(row.submitted_at);
    expectedDate.setDate(expectedDate.getDate() + row.lead_time_days);
    const now = new Date();
    const daysOverdue = Math.floor((now.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      poId: row.po_id,
      poNumber: row.po_number,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      status: row.status,
      leadTimeDays: row.lead_time_days,
      submittedAt: row.submitted_at,
      expectedDeliveryDate: expectedDate.toISOString().split('T')[0],
      daysOverdue,
    };
  });
}

export function listPoReceiptsByPurchaseOrder(poId: string): PoReceipt[] | null {
  const db = getDb();
  const po = db.prepare('SELECT id FROM purchase_orders WHERE id = ?').get(poId);
  if (!po) return null;
  return loadPoReceipts(poId);
}

export function listTransferOrders(params: {
  page: number;
  pageSize: number;
  status?: TransferOrderStatus;
  fromLocationId?: string;
  toLocationId?: string;
}): PaginationEnvelope<TransferOrder> {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.status) {
    conditions.push('t.status = ?');
    values.push(params.status);
  }
  if (params.fromLocationId) {
    conditions.push('t.from_location_id = ?');
    values.push(params.fromLocationId);
  }
  if (params.toLocationId) {
    conditions.push('t.to_location_id = ?');
    values.push(params.toLocationId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM transfer_orders t ${whereClause}`)
    .get(...values) as { total: number };

  const totalItems = countRow.total;
  const totalPages = Math.ceil(totalItems / params.pageSize) || 1;
  const offset = (params.page - 1) * params.pageSize;

  const rows = db.prepare(`
    SELECT
      t.*,
      lf.name AS from_location_name,
      lt.name AS to_location_name
    FROM transfer_orders t
    LEFT JOIN inventory_locations lf ON lf.id = t.from_location_id
    LEFT JOIN inventory_locations lt ON lt.id = t.to_location_id
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...values, params.pageSize, offset) as unknown as TransferOrderRow[];

  const data = rows.map((row) => rowToTransferOrder(row, loadTransferOrderLines(row.id)));
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

export function getTransferOrderById(transferOrderId: string): TransferOrder | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      t.*,
      lf.name AS from_location_name,
      lt.name AS to_location_name
    FROM transfer_orders t
    LEFT JOIN inventory_locations lf ON lf.id = t.from_location_id
    LEFT JOIN inventory_locations lt ON lt.id = t.to_location_id
    WHERE t.id = ?
  `).get(transferOrderId) as TransferOrderRow | undefined;
  if (!row) return null;
  return rowToTransferOrder(row, loadTransferOrderLines(transferOrderId));
}
