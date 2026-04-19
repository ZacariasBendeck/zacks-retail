import { randomUUID } from 'node:crypto';
import { getPosDb } from '../db/posDatabase';
import {
  SalesPassword,
  SalesPasswordKind,
  SalesPasswordRow,
  rowToSalesPassword,
} from '../models/salesPos';
import { hashPassword, verifyPassword } from './shiftService';

export function setPassword(storeId: number, kind: SalesPasswordKind, plain: string, updatedByUserId: string): SalesPassword {
  const db = getPosDb();
  const hash = hashPassword(plain);
  const existing = db.prepare(
    'SELECT id FROM pos_sales_passwords WHERE store_id = ? AND kind = ?'
  ).get(storeId, kind) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE pos_sales_passwords SET hash = ?, updated_at = datetime('now'), updated_by_user_id = ? WHERE id = ?`
    ).run(hash, updatedByUserId, existing.id);
  } else {
    db.prepare(
      `INSERT INTO pos_sales_passwords (id, store_id, kind, hash, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(randomUUID(), storeId, kind, hash, updatedByUserId);
  }
  const row = db.prepare(
    'SELECT * FROM pos_sales_passwords WHERE store_id = ? AND kind = ?'
  ).get(storeId, kind) as unknown as SalesPasswordRow;
  return rowToSalesPassword(row);
}

export function verify(storeId: number, kind: SalesPasswordKind, plain: string): boolean {
  const db = getPosDb();
  const row = db.prepare(
    'SELECT hash FROM pos_sales_passwords WHERE store_id = ? AND kind = ?'
  ).get(storeId, kind) as { hash: string } | undefined;
  if (!row) return false;
  return verifyPassword(plain, row.hash);
}

export function getStatus(storeId: number, kind: SalesPasswordKind): { set: boolean; updatedAt: string | null } {
  const db = getPosDb();
  const row = db.prepare(
    'SELECT updated_at FROM pos_sales_passwords WHERE store_id = ? AND kind = ?'
  ).get(storeId, kind) as { updated_at: string } | undefined;
  return { set: !!row, updatedAt: row?.updated_at ?? null };
}
