import { randomUUID } from 'node:crypto';
import { getPosDb } from '../db/posDatabase';
import { Payout, PayoutRow, rowToPayout } from '../models/salesPos';

export interface CreatePayoutInput {
  shiftId: string;
  cashierUserId: string;
  categoryId: string;
  amount: number;
  note?: string;
}

export function createPayout(input: CreatePayoutInput): Payout {
  const db = getPosDb();
  const shift = db.prepare('SELECT store_id, status FROM pos_shifts WHERE id = ?').get(input.shiftId) as { store_id: number; status: string } | undefined;
  if (!shift) throw new Error('SHIFT_NOT_FOUND');
  if (shift.status !== 'OPEN') throw new Error('SHIFT_NOT_OPEN');

  const cat = db.prepare(
    'SELECT id, label, store_id FROM pos_payout_categories WHERE id = ?'
  ).get(input.categoryId) as { id: string; label: string; store_id: number } | undefined;
  if (!cat) throw new Error('PAYOUT_CATEGORY_NOT_FOUND');
  if (cat.store_id !== shift.store_id) throw new Error('PAYOUT_CATEGORY_STORE_MISMATCH');

  if (input.amount <= 0) throw new Error('PAYOUT_AMOUNT_INVALID');

  const id = randomUUID();
  db.prepare(
    `INSERT INTO pos_payouts (id, shift_id, cashier_user_id, category_id, category_label, amount, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.shiftId, input.cashierUserId, input.categoryId, cat.label, input.amount, input.note ?? null);

  const row = db.prepare('SELECT * FROM pos_payouts WHERE id = ?').get(id) as unknown as PayoutRow;
  return rowToPayout(row);
}

export function listPayoutsForShift(shiftId: string): Payout[] {
  const db = getPosDb();
  const rows = db.prepare(
    'SELECT * FROM pos_payouts WHERE shift_id = ? ORDER BY created_at ASC'
  ).all(shiftId) as unknown as PayoutRow[];
  return rows.map(rowToPayout);
}
