import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import {
  Adjustment,
  AdjustmentRow,
  AdjustmentLineRow,
  AdjustmentLineItem,
  AdjustmentListParams,
  CreateAdjustmentInput,
  Location,
  LocationRow,
} from '../models/adjustment';
import { PaginationEnvelope } from '../models/sku';

// ── Locations ───────────────────────────────────────────────────────

export function listLocations(): Location[] {
  const db = getDb();
  const rows = db.prepare('SELECT id, name FROM inventory_locations WHERE active = 1 ORDER BY name ASC').all() as unknown as LocationRow[];
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

// ── Adjustments ─────────────────────────────────────────────────────

function enrichLineItems(adjustmentId: string): AdjustmentLineItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT al.sku_id, al.quantity, s.sku_code, s.style
    FROM inventory_adjustment_lines al
    JOIN skus s ON s.id = al.sku_id
    WHERE al.adjustment_id = ?
    ORDER BY al.created_at ASC
  `).all(adjustmentId) as unknown as { sku_id: string; quantity: number; sku_code: string; style: string }[];

  return rows.map((r) => ({
    skuId: r.sku_id,
    skuCode: r.sku_code,
    brand: r.style,
    quantity: r.quantity,
  }));
}

function rowToAdjustment(row: AdjustmentRow, lineItems: AdjustmentLineItem[]): Adjustment {
  const db = getDb();
  let fromLocationName: string | null = null;
  let toLocationName: string | null = null;

  if (row.from_location_id) {
    const loc = db.prepare('SELECT name FROM inventory_locations WHERE id = ?').get(row.from_location_id) as unknown as { name: string } | undefined;
    fromLocationName = loc?.name ?? null;
  }
  if (row.to_location_id) {
    const loc = db.prepare('SELECT name FROM inventory_locations WHERE id = ?').get(row.to_location_id) as unknown as { name: string } | undefined;
    toLocationName = loc?.name ?? null;
  }

  return {
    id: row.id,
    type: row.type,
    fromLocationId: row.from_location_id,
    fromLocationName,
    toLocationId: row.to_location_id,
    toLocationName,
    reason: row.reason,
    lineItems,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const ADJUSTMENT_SORT_MAP: Record<string, string> = {
  type: 'a.type',
  createdAt: 'a.created_at',
};

export function listAdjustments(params: AdjustmentListParams): PaginationEnvelope<Adjustment> {
  const db = getDb();

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (params.type) {
    conditions.push('a.type = ?');
    values.push(params.type);
  }
  if (params.fromDate) {
    conditions.push('a.created_at >= ?');
    values.push(params.fromDate);
  }
  if (params.toDate) {
    conditions.push('a.created_at <= ?');
    values.push(params.toDate);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM inventory_adjustments a ${where}`).get(...values) as unknown as { total: number };
  const totalItems = countRow.total;
  const totalPages = Math.ceil(totalItems / params.pageSize) || 1;
  const offset = (params.page - 1) * params.pageSize;

  const sortCol = ADJUSTMENT_SORT_MAP[params.sort ?? 'createdAt'] || 'a.created_at';
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';

  const rows = db.prepare(
    `SELECT * FROM inventory_adjustments a ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`
  ).all(...values, params.pageSize, offset) as unknown as AdjustmentRow[];

  const data = rows.map((row) => {
    const lineItems = enrichLineItems(row.id);
    return rowToAdjustment(row, lineItems);
  });

  return {
    data,
    pagination: { page: params.page, pageSize: params.pageSize, totalItems, totalPages },
  };
}

export function getAdjustmentById(id: string): Adjustment | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM inventory_adjustments WHERE id = ?').get(id) as unknown as AdjustmentRow | undefined;
  if (!row) return null;

  const lineItems = enrichLineItems(row.id);
  return rowToAdjustment(row, lineItems);
}

export function createAdjustment(input: CreateAdjustmentInput): Adjustment | { error: string; code: string; status: number } {
  const db = getDb();

  // Validate locations exist
  if (input.fromLocationId) {
    const loc = db.prepare('SELECT id FROM inventory_locations WHERE id = ?').get(input.fromLocationId);
    if (!loc) return { error: 'From location not found', code: 'LOCATION_NOT_FOUND', status: 404 };
  }
  if (input.toLocationId) {
    const loc = db.prepare('SELECT id FROM inventory_locations WHERE id = ?').get(input.toLocationId);
    if (!loc) return { error: 'To location not found', code: 'LOCATION_NOT_FOUND', status: 404 };
  }

  // Validate all SKUs exist
  for (const li of input.lineItems) {
    const sku = db.prepare('SELECT id FROM skus WHERE id = ?').get(li.skuId);
    if (!sku) return { error: `SKU not found: ${li.skuId}`, code: 'SKU_NOT_FOUND', status: 404 };
  }

  // For negative adjustments (DAMAGE, SHRINKAGE), check stock availability
  const negativeTxTypes: string[] = ['DAMAGE', 'SHRINKAGE'];
  if (negativeTxTypes.includes(input.type)) {
    for (const li of input.lineItems) {
      const inv = db.prepare('SELECT quantity_on_hand FROM inventory WHERE sku_id = ?').get(li.skuId) as unknown as { quantity_on_hand: number } | undefined;
      const onHand = inv?.quantity_on_hand ?? 0;
      const absQty = Math.abs(li.quantity);
      if (absQty > onHand) {
        return { error: `Stock would go below zero for SKU ${li.skuId}`, code: 'INSUFFICIENT_STOCK', status: 409 };
      }
    }
  }

  const adjustmentId = uuidv4();
  const createdBy = input.createdBy ?? 'system';

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      'INSERT INTO inventory_adjustments (id, type, from_location_id, to_location_id, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(adjustmentId, input.type, input.fromLocationId ?? null, input.toLocationId ?? null, input.reason ?? null, createdBy);

    const lineStmt = db.prepare(
      'INSERT INTO inventory_adjustment_lines (id, adjustment_id, sku_id, quantity) VALUES (?, ?, ?, ?)'
    );

    for (const li of input.lineItems) {
      lineStmt.run(uuidv4(), adjustmentId, li.skuId, li.quantity);

      // Apply the stock change to inventory
      const inv = db.prepare('SELECT id FROM inventory WHERE sku_id = ?').get(li.skuId) as unknown as { id: string } | undefined;
      if (inv) {
        db.prepare("UPDATE inventory SET quantity_on_hand = quantity_on_hand + ?, updated_at = datetime('now') WHERE sku_id = ?").run(li.quantity, li.skuId);
      }

      // Also write to the existing audit log for traceability
      db.prepare(
        'INSERT INTO inventory_audit_log (id, sku_id, adjustment, reason, resulting_balance, performed_by) VALUES (?, ?, ?, ?, (SELECT quantity_on_hand FROM inventory WHERE sku_id = ?), ?)'
      ).run(uuidv4(), li.skuId, li.quantity, `[${input.type}] ${input.reason ?? ''}`.trim(), li.skuId, createdBy);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getAdjustmentById(adjustmentId)!;
}
