import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import {
  Inventory,
  InventoryRow,
  AuditLogEntry,
  AuditLogRow,
  StockAdjustmentInput,
  rowToInventory,
  rowToAuditLog,
} from '../models/inventory';
import { PaginationEnvelope } from '../models/sku';

export function getInventoryBySkuId(skuId: string): Inventory | null {
  const db = getDb();

  const skuExists = db.prepare('SELECT id FROM skus WHERE id = ?').get(skuId);
  if (!skuExists) return null;

  const row = db.prepare('SELECT * FROM inventory WHERE sku_id = ?').get(skuId) as unknown as InventoryRow | undefined;
  if (!row) return null;

  return rowToInventory(row);
}

export function adjustStock(skuId: string, input: StockAdjustmentInput): { inventory: Inventory; auditEntry: AuditLogEntry } {
  const db = getDb();

  const skuExists = db.prepare('SELECT id FROM skus WHERE id = ?').get(skuId);
  if (!skuExists) {
    throw new Error('SKU_NOT_FOUND');
  }

  const invRow = db.prepare('SELECT * FROM inventory WHERE sku_id = ?').get(skuId) as unknown as InventoryRow | undefined;
  if (!invRow) {
    throw new Error('SKU_NOT_FOUND');
  }

  const newBalance = invRow.quantity_on_hand + input.adjustment;
  if (newBalance < 0) {
    throw new Error('INSUFFICIENT_STOCK');
  }

  const txn = db.prepare('SELECT 1');
  // Use a transaction pattern: node:sqlite doesn't have transaction(), so we use exec
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      "UPDATE inventory SET quantity_on_hand = ?, updated_at = datetime('now') WHERE sku_id = ?"
    ).run(newBalance, skuId);

    const auditId = uuidv4();
    db.prepare(
      'INSERT INTO inventory_audit_log (id, sku_id, adjustment, reason, resulting_balance, performed_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(auditId, skuId, input.adjustment, input.reason, newBalance, input.performedBy ?? 'system');

    db.exec('COMMIT');

    const updatedRow = db.prepare('SELECT * FROM inventory WHERE sku_id = ?').get(skuId) as unknown as InventoryRow;
    const auditRow = db.prepare('SELECT * FROM inventory_audit_log WHERE id = ?').get(auditId) as unknown as AuditLogRow;

    return {
      inventory: rowToInventory(updatedRow),
      auditEntry: rowToAuditLog(auditRow),
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getAuditLog(
  skuId: string,
  params: { page: number; pageSize: number }
): PaginationEnvelope<AuditLogEntry> | null {
  const db = getDb();

  const skuExists = db.prepare('SELECT id FROM skus WHERE id = ?').get(skuId);
  if (!skuExists) return null;

  const countRow = db.prepare(
    'SELECT COUNT(*) as total FROM inventory_audit_log WHERE sku_id = ?'
  ).get(skuId) as unknown as { total: number };

  const totalItems = countRow.total;
  const totalPages = Math.ceil(totalItems / params.pageSize);
  const offset = (params.page - 1) * params.pageSize;

  const rows = db.prepare(
    'SELECT * FROM inventory_audit_log WHERE sku_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?'
  ).all(skuId, params.pageSize, offset) as unknown as AuditLogRow[];

  return {
    data: rows.map(rowToAuditLog),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages,
    },
  };
}
