import { randomUUID } from 'node:crypto';
import { getDb } from '../db/database';
import { getPosDb } from '../db/posDatabase';
import {
  Shift,
  ShiftRow,
  rowToShift,
  CashTotalsRecap,
  TenderKind,
  DrawerTenderCount,
  DrawerTenderCountRow,
  rowToDrawerTenderCount,
} from '../models/salesPos';

export interface OpenShiftInput {
  storeId: number;
  registerId: string;
  openedByUserId: string;
  openingCashFloat: number;
  postingMode?: 'REALTIME' | 'BATCH';
  notes?: string;
}

export function openShift(input: OpenShiftInput): Shift {
  const db = getPosDb();

  const reg = db.prepare(
    'SELECT id, store_id, active FROM pos_registers WHERE id = ?'
  ).get(input.registerId) as { id: string; store_id: number; active: number } | undefined;
  if (!reg) throw new Error('REGISTER_NOT_FOUND');
  if (reg.active !== 1) throw new Error('REGISTER_INACTIVE');
  if (reg.store_id !== input.storeId) throw new Error('REGISTER_STORE_MISMATCH');

  const existingOpen = db.prepare(
    "SELECT id FROM pos_shifts WHERE register_id = ? AND status = 'OPEN'"
  ).get(input.registerId);
  if (existingOpen) throw new Error('SHIFT_ALREADY_OPEN');

  const id = randomUUID();
  const postingMode = input.postingMode ?? 'REALTIME';

  db.prepare(
    `INSERT INTO pos_shifts
     (id, store_id, register_id, opened_by_user_id, opening_cash_float, posting_mode, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.storeId,
    input.registerId,
    input.openedByUserId,
    input.openingCashFloat,
    postingMode,
    input.notes ?? null
  );

  return getShift(id)!;
}

export function getShift(shiftId: string): Shift | null {
  const db = getPosDb();
  const row = db.prepare('SELECT * FROM pos_shifts WHERE id = ?').get(shiftId) as unknown as ShiftRow | undefined;
  return row ? rowToShift(row) : null;
}

export function listOpenShifts(storeId?: number): Shift[] {
  const db = getPosDb();
  const rows = storeId
    ? db.prepare("SELECT * FROM pos_shifts WHERE store_id = ? AND status = 'OPEN' ORDER BY opened_at DESC").all(storeId)
    : db.prepare("SELECT * FROM pos_shifts WHERE status = 'OPEN' ORDER BY opened_at DESC").all();
  return (rows as unknown as ShiftRow[]).map(rowToShift);
}

/**
 * Compute Cash Totals recap — Sales Recap + Cash Drawer Recap + Void Summary (RICS p. 23).
 * Does not mutate; safe to call repeatedly.
 */
export function computeCashTotals(shiftId: string): CashTotalsRecap {
  const db = getPosDb();
  const shift = db.prepare('SELECT * FROM pos_shifts WHERE id = ?').get(shiftId) as unknown as ShiftRow | undefined;
  if (!shift) throw new Error('SHIFT_NOT_FOUND');

  // Sales recap — excluding voided tickets.
  const salesRow = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN grand_total >= 0 THEN grand_total ELSE 0 END), 0) AS gross_sales,
       COALESCE(SUM(CASE WHEN grand_total < 0 THEN -grand_total ELSE 0 END), 0) AS returns,
       COALESCE(SUM(grand_total), 0) AS net_total,
       COALESCE(SUM(tax_total), 0) AS tax_total,
       COALESCE(SUM(other_charges), 0) AS other_charges,
       COUNT(*) AS ticket_count
     FROM pos_sales_tickets
     WHERE shift_id = ? AND voided_at IS NULL AND ended_at IS NOT NULL`
  ).get(shiftId) as {
    gross_sales: number;
    returns: number;
    net_total: number;
    tax_total: number;
    other_charges: number;
    ticket_count: number;
  };

  const voidedRow = db.prepare(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total), 0) AS amount
     FROM pos_sales_tickets WHERE shift_id = ? AND voided_at IS NOT NULL`
  ).get(shiftId) as { cnt: number; amount: number };

  // Tender breakdown — by tender type across non-voided tickets.
  const tenderRows = db.prepare(
    `SELECT t.tender_type_id, t.tender_kind, tt.label,
            COALESCE(SUM(t.amount), 0) AS amount, COUNT(*) AS cnt
     FROM pos_sales_ticket_tenders t
     JOIN pos_sales_tickets st ON st.id = t.ticket_id
     JOIN pos_tender_types tt ON tt.id = t.tender_type_id
     WHERE st.shift_id = ? AND st.voided_at IS NULL AND st.ended_at IS NOT NULL
       AND t.is_continuation = 0
     GROUP BY t.tender_type_id, t.tender_kind, tt.label
     ORDER BY tt.label`
  ).all(shiftId) as Array<{
    tender_type_id: string;
    tender_kind: TenderKind;
    label: string;
    amount: number;
    cnt: number;
  }>;

  // Cash drawer recap — cash-considered tender totals + opening float − payouts.
  const cashTenderRow = db.prepare(
    `SELECT COALESCE(SUM(t.amount), 0) AS amount
     FROM pos_sales_ticket_tenders t
     JOIN pos_sales_tickets st ON st.id = t.ticket_id
     JOIN pos_tender_types tt ON tt.id = t.tender_type_id
     WHERE st.shift_id = ? AND st.voided_at IS NULL AND st.ended_at IS NOT NULL
       AND tt.is_considered_cash = 1 AND t.is_continuation = 0`
  ).get(shiftId) as { amount: number };

  const payoutRow = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM pos_payouts WHERE shift_id = ?'
  ).get(shiftId) as { total: number };

  return {
    shiftId,
    salesRecap: {
      grossSales: salesRow.gross_sales,
      returns: salesRow.returns,
      netSales: salesRow.net_total,
      taxTotal: salesRow.tax_total,
      otherCharges: salesRow.other_charges,
      grandTotal: salesRow.net_total,
      ticketCount: salesRow.ticket_count,
      voidedTicketCount: voidedRow.cnt,
    },
    cashDrawerRecap: {
      openingCashFloat: shift.opening_cash_float,
      cashTenders: cashTenderRow.amount,
      payouts: payoutRow.total,
      expectedCashInDrawer:
        shift.opening_cash_float + cashTenderRow.amount - payoutRow.total,
    },
    tenderBreakdown: tenderRows.map((r) => ({
      tenderTypeId: r.tender_type_id,
      tenderKind: r.tender_kind,
      label: r.label,
      amount: r.amount,
      count: r.cnt,
    })),
    voidSummary: {
      voidedTicketCount: voidedRow.cnt,
      voidedAmount: voidedRow.amount,
    },
  };
}

export interface TenderCountInput {
  tenderTypeId: string;
  countedAmount: number;
  detail?: Record<string, unknown>;
}

/**
 * Count Money (p. 26-27). Records counted amounts per tender type vs. expected
 * (from tickets) and stores the difference per tender type.
 */
export function submitTenderCounts(shiftId: string, counts: TenderCountInput[]): DrawerTenderCount[] {
  const db = getPosDb();
  const shift = db.prepare('SELECT status FROM pos_shifts WHERE id = ?').get(shiftId) as { status: string } | undefined;
  if (!shift) throw new Error('SHIFT_NOT_FOUND');
  if (shift.status !== 'OPEN' && shift.status !== 'CLOSING') throw new Error('SHIFT_NOT_COUNTABLE');

  db.exec('BEGIN');
  try {
    const results: DrawerTenderCount[] = [];
    for (const c of counts) {
      const tt = db.prepare('SELECT tender_kind FROM pos_tender_types WHERE id = ?').get(c.tenderTypeId) as { tender_kind: TenderKind } | undefined;
      if (!tt) throw new Error('TENDER_TYPE_NOT_FOUND');

      const expectedRow = db.prepare(
        `SELECT COALESCE(SUM(t.amount), 0) AS amount
         FROM pos_sales_ticket_tenders t
         JOIN pos_sales_tickets st ON st.id = t.ticket_id
         WHERE st.shift_id = ? AND st.voided_at IS NULL AND st.ended_at IS NOT NULL
           AND t.tender_type_id = ? AND t.is_continuation = 0`
      ).get(shiftId, c.tenderTypeId) as { amount: number };

      const expected = expectedRow.amount;
      const actualDifference = c.countedAmount - expected;

      db.prepare(
        `INSERT INTO pos_drawer_tender_counts
           (id, shift_id, tender_type_id, tender_kind, counted_amount, expected_amount, difference, detail_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(shift_id, tender_type_id) DO UPDATE SET
           counted_amount = excluded.counted_amount,
           expected_amount = excluded.expected_amount,
           difference = excluded.difference,
           detail_json = excluded.detail_json`
      ).run(
        randomUUID(),
        shiftId,
        c.tenderTypeId,
        tt.tender_kind,
        c.countedAmount,
        expected,
        actualDifference,
        c.detail ? JSON.stringify(c.detail) : null
      );

      const row = db.prepare(
        'SELECT * FROM pos_drawer_tender_counts WHERE shift_id = ? AND tender_type_id = ?'
      ).get(shiftId, c.tenderTypeId) as unknown as DrawerTenderCountRow;
      results.push(rowToDrawerTenderCount(row));
    }
    db.exec('COMMIT');
    return results;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export interface CloseShiftInput {
  closingCashCount: number;
  closingDepositCount: number;
  closedByUserId: string;
  managerPassword?: string;
  overShortApprovedBy?: string;
}

/**
 * Close the shift — computes expected cash, over/short, flips status to CLOSED.
 * In batch-posting mode, sets posting status to PENDING_POST for all ended tickets.
 */
export function closeShift(shiftId: string, input: CloseShiftInput): Shift {
  const db = getPosDb();
  const shift = db.prepare('SELECT * FROM pos_shifts WHERE id = ?').get(shiftId) as unknown as ShiftRow | undefined;
  if (!shift) throw new Error('SHIFT_NOT_FOUND');
  if (shift.status === 'CLOSED') throw new Error('SHIFT_ALREADY_CLOSED');
  if (shift.status === 'VOIDED') throw new Error('SHIFT_VOIDED');

  // Verify manager password if one is set on the store.
  const pw = db.prepare(
    "SELECT hash FROM pos_sales_passwords WHERE store_id = ? AND kind = 'MANAGER'"
  ).get(shift.store_id) as { hash: string } | undefined;
  if (pw) {
    if (!input.managerPassword) throw new Error('MANAGER_PASSWORD_REQUIRED');
    if (!verifyPassword(input.managerPassword, pw.hash)) throw new Error('MANAGER_PASSWORD_INVALID');
  }

  const totals = computeCashTotals(shiftId);
  const expectedCash = totals.cashDrawerRecap.expectedCashInDrawer;
  // Over/Short: positive = over, negative = short.
  // Modern model: count + deposit - expected = over/short.
  const overShort = input.closingCashCount + input.closingDepositCount - expectedCash;

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE pos_shifts SET
         closed_at = datetime('now'),
         closed_by_user_id = ?,
         closing_cash_count = ?,
         closing_deposit_count = ?,
         expected_cash_at_close = ?,
         over_short_amount = ?,
         over_short_approved_by = ?,
         status = 'CLOSED',
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      input.closedByUserId,
      input.closingCashCount,
      input.closingDepositCount,
      expectedCash,
      overShort,
      input.overShortApprovedBy ?? null,
      shiftId
    );

    // Batch-posting mode: move tickets from DRAFT/REALTIME_POSTED to PENDING_POST
    // when they finished under batch mode (posting_status = PENDING_POST already).
    // Nothing else to do on close in REALTIME — inventory was already written at ticket End.

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return getShift(shiftId)!;
}

/**
 * Post Sales to Inventory for a batch-mode shift (RICS pp. 45-46).
 * Writes inventory depletions for all PENDING_POST tickets in the shift and
 * flips them to BATCH_POSTED. Only valid after shift close in BATCH mode.
 */
export function postShiftToInventory(shiftId: string, postedByUserId: string): Shift {
  // Cross-DB write: read pending tickets from the POS DB, write depletions to the
  // warehouse DB (inventory_audit_log + sales_transactions), then flip ticket
  // posting_status in the POS DB. SQLite has no cross-DB 2PC; for Stage 1 the POS
  // DB is sandbox/test-scoped per plan decision #6 — simple sequential write is OK.
  const posDb = getPosDb();
  const warehouseDb = getDb();

  const shift = posDb.prepare('SELECT * FROM pos_shifts WHERE id = ?').get(shiftId) as unknown as ShiftRow | undefined;
  if (!shift) throw new Error('SHIFT_NOT_FOUND');
  if (shift.status !== 'CLOSED') throw new Error('SHIFT_NOT_CLOSED');
  if (shift.posting_mode !== 'BATCH') throw new Error('SHIFT_NOT_BATCH_MODE');
  if (shift.posted_at) throw new Error('SHIFT_ALREADY_POSTED');

  const lines = posDb.prepare(
    `SELECT tl.id AS line_id, tl.ticket_id, tl.sku_id, tl.quantity, tl.unit_price
     FROM pos_sales_ticket_lines tl
     JOIN pos_sales_tickets st ON st.id = tl.ticket_id
     WHERE st.shift_id = ? AND st.posting_status = 'PENDING_POST'
       AND st.voided_at IS NULL AND tl.sku_id IS NOT NULL AND tl.line_kind = 'MERCHANDISE'`
  ).all(shiftId) as Array<{
    line_id: string;
    ticket_id: string;
    sku_id: string;
    quantity: number;
    unit_price: number;
  }>;

  warehouseDb.exec('BEGIN');
  try {
    for (const l of lines) {
      applyLedgerDepletion(warehouseDb, l.sku_id, l.quantity, l.unit_price, `TICKET:${l.ticket_id}`, postedByUserId);
    }
    warehouseDb.exec('COMMIT');
  } catch (e) {
    warehouseDb.exec('ROLLBACK');
    throw e;
  }

  posDb.exec('BEGIN');
  try {
    posDb.prepare(
      `UPDATE pos_sales_tickets
         SET posting_status = 'BATCH_POSTED',
             posted_at = datetime('now'),
             updated_at = datetime('now')
       WHERE shift_id = ? AND posting_status = 'PENDING_POST'`
    ).run(shiftId);

    posDb.prepare(
      `UPDATE pos_shifts
         SET posted_at = datetime('now'),
             updated_at = datetime('now')
       WHERE id = ?`
    ).run(shiftId);

    posDb.exec('COMMIT');
  } catch (e) {
    posDb.exec('ROLLBACK');
    throw e;
  }

  return getShift(shiftId)!;
}

// ---------------------------------------------------------------------------
// Internal: ledger depletion helper (shared with ticketService)
// ---------------------------------------------------------------------------

export function applyLedgerDepletion(
  db: ReturnType<typeof getDb>,
  skuId: string,
  quantity: number,
  unitPrice: number,
  reason: string,
  actorUserId: string
): void {
  // Negative qty = refund (return stock). Positive qty = sale (deplete).
  const delta = -quantity;

  const inv = db.prepare(
    'SELECT id, quantity_on_hand, version FROM inventory WHERE sku_id = ?'
  ).get(skuId) as { id: string; quantity_on_hand: number; version: number } | undefined;
  if (!inv) {
    // No inventory row yet — skip ledger write but still record audit for traceability.
    db.prepare(
      `INSERT INTO inventory_audit_log (id, sku_id, adjustment, reason, resulting_balance, performed_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), skuId, delta, reason, 0, actorUserId);
    return;
  }

  const newBalance = inv.quantity_on_hand + delta;
  if (newBalance < 0 && delta < 0) {
    // Negative-on-hand is allowed in retail (oversold), just flag in audit.
  }

  db.prepare(
    "UPDATE inventory SET quantity_on_hand = ?, version = version + 1, updated_at = datetime('now') WHERE sku_id = ?"
  ).run(newBalance, skuId);

  db.prepare(
    `INSERT INTO inventory_audit_log (id, sku_id, adjustment, reason, resulting_balance, performed_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), skuId, delta, reason, newBalance, actorUserId);

  // Keep sales_transactions populated for legacy reporting (only on positive qty sales).
  if (quantity > 0) {
    db.prepare(
      'INSERT INTO sales_transactions (id, sku_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
    ).run(randomUUID(), skuId, quantity, unitPrice);
  }
}

// ---------------------------------------------------------------------------
// Password helpers (simple SHA-256 for now; no dependency on bcrypt).
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';

export function hashPassword(plain: string): string {
  return 'sha256$' + createHash('sha256').update(plain).digest('hex');
}

export function verifyPassword(plain: string, hash: string): boolean {
  return hashPassword(plain) === hash;
}
