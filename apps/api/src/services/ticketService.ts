import { randomUUID } from 'node:crypto';
import { getDb } from '../db/database';
import { getPosDb } from '../db/posDatabase';
import {
  SalesTicket,
  SalesTicketRow,
  SalesTicketLine,
  SalesTicketLineRow,
  SalesTicketTender,
  SalesTicketTenderRow,
  SalesTicketTax,
  SalesTicketTaxRow,
  SalesTicketWithChildren,
  TransactionType,
  LineKind,
  TenderKind,
  rowToSalesTicket,
  rowToSalesTicketLine,
  rowToSalesTicketTender,
  rowToSalesTicketTax,
} from '../models/salesPos';
import { applyLedgerDepletion } from './shiftService';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateTicketInput {
  shiftId: string;
  cashierUserId: string;
  transactionType?: TransactionType;
  customerAccountId?: string;
  headerDiscountPct?: number;
  promotionCode?: string;
  familyMemberId?: string;
  parentTicketId?: string;
  /**
   * Browser-generated UUID used for offline-outbox idempotency (Stage 1.3).
   * If the same clientTicketId POSTs twice (e.g. after a network glitch) the
   * existing ticket is returned unchanged.
   */
  clientTicketId?: string;
}

export interface AddLineInput {
  lineKind?: LineKind;
  /** Admin-DB SKU id (UUID). Mutually-exclusive with skuCode. */
  skuId?: string;
  /** Legacy RICS SKU code (from ricsProductAdapter). Preferred for Phase 1 POS. */
  skuCode?: string;
  skuSizeId?: string;
  quantity: number;
  unitPrice?: number;
  priceSlotUsed?: string;
  lineDiscountPct?: number;
  lineDiscountAmount?: number;
  perksAmount?: number;
  salespersonUserId?: string;
  familyMemberId?: string;
  returnCodeId?: number;
  taxable?: boolean;
  comment?: string;
}

export interface AddTenderInput {
  tenderTypeId: string;
  amount: number;
  accountNumber?: string;
  giftCertNumber?: string;
  authReference?: string;
  foreignCurrencyAmount?: number;
}

export interface EndTicketInput {
  printReceipt?: boolean;
  openDrawer?: boolean;
}

export interface VoidTicketInput {
  reason?: string;
  password?: string;
  actorUserId: string;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function getTicket(ticketId: string): SalesTicketWithChildren | null {
  const db = getPosDb();
  const row = db.prepare('SELECT * FROM pos_sales_tickets WHERE id = ?').get(ticketId) as unknown as
    | SalesTicketRow
    | undefined;
  if (!row) return null;
  const ticket = rowToSalesTicket(row);
  const lines = (db.prepare('SELECT * FROM pos_sales_ticket_lines WHERE ticket_id = ? ORDER BY line_number').all(ticketId) as unknown as SalesTicketLineRow[]).map(rowToSalesTicketLine);
  const tenders = (db.prepare('SELECT * FROM pos_sales_ticket_tenders WHERE ticket_id = ? ORDER BY sequence').all(ticketId) as unknown as SalesTicketTenderRow[]).map(rowToSalesTicketTender);
  const taxes = (db.prepare('SELECT * FROM pos_sales_ticket_taxes WHERE ticket_id = ?').all(ticketId) as unknown as SalesTicketTaxRow[]).map(rowToSalesTicketTax);
  return { ...ticket, lines, tenders, taxes };
}

export function listTicketsForShift(shiftId: string): SalesTicket[] {
  const db = getPosDb();
  const rows = db.prepare(
    'SELECT * FROM pos_sales_tickets WHERE shift_id = ? ORDER BY ticket_number ASC'
  ).all(shiftId) as unknown as SalesTicketRow[];
  return rows.map(rowToSalesTicket);
}

// ---------------------------------------------------------------------------
// Create ticket header
// ---------------------------------------------------------------------------

export function createTicket(input: CreateTicketInput): SalesTicketWithChildren {
  const db = getPosDb();

  // Offline-outbox idempotency: if the client has already POSTed this
  // clientTicketId, return the existing ticket untouched.
  if (input.clientTicketId) {
    const existing = db.prepare(
      'SELECT id FROM pos_sales_tickets WHERE client_ticket_id = ?'
    ).get(input.clientTicketId) as { id: string } | undefined;
    if (existing) return getTicket(existing.id)!;
  }

  const shift = db.prepare(
    'SELECT id, store_id, register_id, status, last_ticket_number_used FROM pos_shifts WHERE id = ?'
  ).get(input.shiftId) as
    | { id: string; store_id: number; register_id: string; status: string; last_ticket_number_used: number }
    | undefined;
  if (!shift) throw new Error('SHIFT_NOT_FOUND');
  if (shift.status !== 'OPEN') throw new Error('SHIFT_NOT_OPEN');

  // Per-store monotonic ticket counter — we use max(ticket_number) across the store
  // to match RICS (p. 25) which uses a single `Last ticket #` that continues across days.
  const maxRow = db.prepare(
    'SELECT COALESCE(MAX(ticket_number), 0) AS n FROM pos_sales_tickets WHERE store_id = ?'
  ).get(shift.store_id) as { n: number };
  const ticketNumber = Math.max(maxRow.n, shift.last_ticket_number_used) + 1;

  const businessDate = new Date().toISOString().slice(0, 10);
  const id = randomUUID();

  // Validate parent for continuation chains.
  let continuationHeadId: string | null = null;
  if (input.parentTicketId) {
    const parent = db.prepare(
      'SELECT id, continuation_head_id, voided_at FROM pos_sales_tickets WHERE id = ?'
    ).get(input.parentTicketId) as { id: string; continuation_head_id: string | null; voided_at: string | null } | undefined;
    if (!parent) throw new Error('PARENT_TICKET_NOT_FOUND');
    if (parent.voided_at) throw new Error('PARENT_TICKET_VOIDED');
    continuationHeadId = parent.continuation_head_id ?? parent.id;
  }

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO pos_sales_tickets
         (id, ticket_number, store_id, register_id, shift_id, business_date,
          transaction_type, cashier_user_id, customer_account_id,
          header_discount_pct, promotion_code, family_member_id,
          parent_ticket_id, continuation_head_id, posting_status, client_ticket_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`
    ).run(
      id,
      ticketNumber,
      shift.store_id,
      shift.register_id,
      input.shiftId,
      businessDate,
      input.transactionType ?? 'REGULAR',
      input.cashierUserId,
      input.customerAccountId ?? null,
      input.headerDiscountPct ?? null,
      input.promotionCode ?? null,
      input.familyMemberId ?? null,
      input.parentTicketId ?? null,
      continuationHeadId,
      input.clientTicketId ?? null,
    );

    db.prepare(
      'UPDATE pos_shifts SET last_ticket_number_used = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(ticketNumber, input.shiftId);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return getTicket(id)!;
}

// ---------------------------------------------------------------------------
// Header updates
// ---------------------------------------------------------------------------

export interface UpdateHeaderInput {
  customerAccountId?: string | null;
  headerDiscountPct?: number | null;
  promotionCode?: string | null;
  familyMemberId?: string | null;
  comment?: string | null;
}

export function updateTicketHeader(ticketId: string, input: UpdateHeaderInput): SalesTicketWithChildren {
  const db = getPosDb();
  assertDraftTicket(db, ticketId);

  const fields: string[] = [];
  const values: any[] = [];
  const map: Record<string, string> = {
    customerAccountId: 'customer_account_id',
    headerDiscountPct: 'header_discount_pct',
    promotionCode: 'promotion_code',
    familyMemberId: 'family_member_id',
    comment: 'comment',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((input as any)[k] !== undefined) {
      fields.push(`${col} = ?`);
      values.push((input as any)[k]);
    }
  }
  if (fields.length === 0) return getTicket(ticketId)!;
  fields.push("updated_at = datetime('now')");
  values.push(ticketId);
  db.prepare(`UPDATE pos_sales_tickets SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getTicket(ticketId)!;
}

// ---------------------------------------------------------------------------
// Add / update / remove lines
// ---------------------------------------------------------------------------

export function addLine(ticketId: string, input: AddLineInput): SalesTicketLine {
  const db = getPosDb();
  const warehouseDb = getDb();
  const ticket = assertDraftTicket(db, ticketId);

  const lineKind: LineKind = input.lineKind ?? 'MERCHANDISE';

  // Two SKU sources in Phase 1:
  //   • skuCode — RICS InventoryMaster (legacy; typical for the register)
  //   • skuId   — admin SQLite `skus` table (new admin-entered SKUs)
  // The line stores sku_code_snapshot always; sku_id only for the admin-DB path.
  let unitPrice = input.unitPrice ?? 0;
  let skuCodeSnapshot: string | null = null;
  let resolvedSkuId: string | null = null;
  if (lineKind === 'MERCHANDISE') {
    if (input.skuCode) {
      // RICS path — resolve price from the RICS snapshot at call time.
      // We lazily load it via a synchronous lookup against the POS snapshot
      // if it has been warmed; otherwise just accept the provided unitPrice.
      skuCodeSnapshot = input.skuCode.trim();
      if (input.unitPrice === undefined) {
        // The register is expected to pass unitPrice along with skuCode (it
        // reads price slots from the RICS adapter and lets the cashier pick).
        throw new Error('UNIT_PRICE_REQUIRED_FOR_RICS_SKU');
      }
    } else if (input.skuId) {
      const sku = warehouseDb.prepare('SELECT sku_code, price FROM skus WHERE id = ?').get(input.skuId) as
        | { sku_code: string; price: number }
        | undefined;
      if (!sku) throw new Error('SKU_NOT_FOUND');
      skuCodeSnapshot = sku.sku_code;
      resolvedSkuId = input.skuId;
      if (input.unitPrice === undefined) unitPrice = sku.price;
      if (input.skuSizeId) {
        const size = warehouseDb.prepare('SELECT sku_id FROM sku_sizes WHERE id = ?').get(input.skuSizeId) as { sku_id: string } | undefined;
        if (!size || size.sku_id !== input.skuId) throw new Error('SKU_SIZE_MISMATCH');
      }
    } else {
      throw new Error('SKU_REQUIRED');
    }
  }

  if (input.quantity === 0) throw new Error('QUANTITY_ZERO_NOT_ALLOWED');
  if (input.quantity < 0 && !input.returnCodeId) {
    const store = db.prepare(
      'SELECT return_code_tracking FROM pos_stores WHERE id = ?'
    ).get(ticket.store_id) as { return_code_tracking: number } | undefined;
    if (store?.return_code_tracking === 1) throw new Error('RETURN_CODE_REQUIRED');
  }

  // Compute line totals.
  const gross = unitPrice * input.quantity;
  const discountAmount = input.lineDiscountAmount ?? (input.lineDiscountPct ? (gross * input.lineDiscountPct) / 100 : 0);
  const extendedNet = round2(gross - discountAmount);

  const taxableFlag = input.taxable !== false && lineKind === 'MERCHANDISE';
  const storeTax = db.prepare('SELECT tax_rate FROM pos_stores WHERE id = ?').get(ticket.store_id) as { tax_rate: number } | undefined;
  const taxRate = storeTax?.tax_rate ?? 0;
  const extendedTax = taxableFlag ? round2(extendedNet * taxRate) : 0;

  // Next line number.
  const maxRow = db.prepare(
    'SELECT COALESCE(MAX(line_number), 0) AS n FROM pos_sales_ticket_lines WHERE ticket_id = ?'
  ).get(ticketId) as { n: number };
  const lineNumber = maxRow.n + 1;

  const lineId = randomUUID();

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO pos_sales_ticket_lines
         (id, ticket_id, line_number, line_kind, sku_id, sku_size_id, sku_code_snapshot,
          quantity, unit_price, price_slot_used, line_discount_pct, line_discount_amount,
          perks_amount, salesperson_user_id, family_member_id, return_code_id,
          taxable, comment, extended_net, extended_tax)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      lineId,
      ticketId,
      lineNumber,
      lineKind,
      resolvedSkuId,
      input.skuSizeId ?? null,
      skuCodeSnapshot,
      input.quantity,
      unitPrice,
      input.priceSlotUsed ?? null,
      input.lineDiscountPct ?? null,
      input.lineDiscountAmount ?? null,
      input.perksAmount ?? 0,
      input.salespersonUserId ?? ticket.cashier_user_id,
      input.familyMemberId ?? null,
      input.returnCodeId ?? null,
      taxableFlag ? 1 : 0,
      input.comment ?? null,
      extendedNet,
      extendedTax
    );

    recomputeTotals(db, ticketId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const row = db.prepare('SELECT * FROM pos_sales_ticket_lines WHERE id = ?').get(lineId) as unknown as SalesTicketLineRow;
  return rowToSalesTicketLine(row);
}

export function removeLine(ticketId: string, lineId: string): SalesTicketWithChildren {
  const db = getPosDb();
  assertDraftTicket(db, ticketId);

  db.exec('BEGIN');
  try {
    const res = db.prepare(
      'DELETE FROM pos_sales_ticket_lines WHERE id = ? AND ticket_id = ?'
    ).run(lineId, ticketId);
    if (res.changes === 0) {
      db.exec('ROLLBACK');
      throw new Error('LINE_NOT_FOUND');
    }
    recomputeTotals(db, ticketId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getTicket(ticketId)!;
}

export function reverseLine(ticketId: string, lineId: string): SalesTicketLine {
  const db = getPosDb();
  assertDraftTicket(db, ticketId);

  const line = db.prepare('SELECT * FROM pos_sales_ticket_lines WHERE id = ? AND ticket_id = ?').get(lineId, ticketId) as unknown as SalesTicketLineRow | undefined;
  if (!line) throw new Error('LINE_NOT_FOUND');

  const newQty = -line.quantity;
  const newNet = -line.extended_net;
  const newTax = -line.extended_tax;

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE pos_sales_ticket_lines
         SET quantity = ?, extended_net = ?, extended_tax = ?
       WHERE id = ?`
    ).run(newQty, newNet, newTax, lineId);
    recomputeTotals(db, ticketId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const row = db.prepare('SELECT * FROM pos_sales_ticket_lines WHERE id = ?').get(lineId) as unknown as SalesTicketLineRow;
  return rowToSalesTicketLine(row);
}

// ---------------------------------------------------------------------------
// Tenders
// ---------------------------------------------------------------------------

export function addTender(ticketId: string, input: AddTenderInput): SalesTicketTender {
  const db = getPosDb();
  assertDraftTicket(db, ticketId);

  const tt = db.prepare(
    'SELECT tender_kind, require_account_number FROM pos_tender_types WHERE id = ?'
  ).get(input.tenderTypeId) as { tender_kind: TenderKind; require_account_number: number } | undefined;
  if (!tt) throw new Error('TENDER_TYPE_NOT_FOUND');

  const tenderCountRow = db.prepare(
    'SELECT COUNT(*) AS n FROM pos_sales_ticket_tenders WHERE ticket_id = ? AND is_continuation = 0'
  ).get(ticketId) as { n: number };
  if (tenderCountRow.n >= 4) throw new Error('MAX_SPLIT_TENDERS_EXCEEDED');

  if (tt.require_account_number === 1 && !input.accountNumber) {
    throw new Error('ACCOUNT_NUMBER_REQUIRED');
  }
  if (tt.tender_kind === 'STORE_CREDIT' && !input.accountNumber) {
    throw new Error('ACCOUNT_NUMBER_REQUIRED_FOR_STORE_CREDIT');
  }

  const seqRow = db.prepare(
    'SELECT COALESCE(MAX(sequence), 0) AS s FROM pos_sales_ticket_tenders WHERE ticket_id = ?'
  ).get(ticketId) as { s: number };

  const id = randomUUID();
  db.prepare(
    `INSERT INTO pos_sales_ticket_tenders
       (id, ticket_id, sequence, tender_type_id, tender_kind, amount,
        foreign_currency_amount, account_number, gift_cert_number, auth_reference, is_continuation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(
    id,
    ticketId,
    seqRow.s + 1,
    input.tenderTypeId,
    tt.tender_kind,
    input.amount,
    input.foreignCurrencyAmount ?? null,
    input.accountNumber ?? null,
    input.giftCertNumber ?? null,
    input.authReference ?? null
  );

  const row = db.prepare('SELECT * FROM pos_sales_ticket_tenders WHERE id = ?').get(id) as unknown as SalesTicketTenderRow;
  return rowToSalesTicketTender(row);
}

// ---------------------------------------------------------------------------
// Tax override
// ---------------------------------------------------------------------------

export function overrideTicketTax(ticketId: string, newTaxTotal: number, reason: string, actorUserId: string): SalesTicketWithChildren {
  const db = getPosDb();
  const ticket = assertDraftTicket(db, ticketId);

  db.exec('BEGIN');
  try {
    const before = ticket.tax_total;
    const newGrand = round2(ticket.subtotal + newTaxTotal + ticket.other_charges);
    db.prepare(
      `UPDATE pos_sales_tickets SET tax_total = ?, grand_total = ?, tax_override_reason = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(newTaxTotal, newGrand, reason, ticketId);
    db.prepare(
      `INSERT INTO pos_ticket_audit_events (id, ticket_id, event_type, actor_user_id, payload_json)
       VALUES (?, ?, 'TAX_OVERRIDE', ?, ?)`
    ).run(randomUUID(), ticketId, actorUserId, JSON.stringify({ before, after: newTaxTotal, reason }));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getTicket(ticketId)!;
}

// ---------------------------------------------------------------------------
// End ticket
// ---------------------------------------------------------------------------

export async function endTicket(ticketId: string, input: EndTicketInput = {}): Promise<SalesTicketWithChildren> {
  const db = getPosDb();
  const ticket = assertDraftTicket(db, ticketId);

  const lineCountRow = db.prepare(
    'SELECT COUNT(*) AS n FROM pos_sales_ticket_lines WHERE ticket_id = ?'
  ).get(ticketId) as { n: number };
  if (lineCountRow.n === 0) throw new Error('TICKET_HAS_NO_LINES');

  // Validate tenders cover grand total (unless this ticket continues on another).
  const tenderSumRow = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM pos_sales_ticket_tenders WHERE ticket_id = ? AND is_continuation = 0'
  ).get(ticketId) as { total: number };
  const continuationSumRow = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM pos_sales_ticket_tenders WHERE ticket_id = ? AND is_continuation = 1'
  ).get(ticketId) as { total: number };

  const covered = round2(tenderSumRow.total + continuationSumRow.total);
  const grand = ticket.grand_total;
  if (round2(covered) < round2(grand)) {
    throw new Error('INSUFFICIENT_TENDER');
  }
  const changeGiven = round2(Math.max(0, covered - grand));

  // Determine posting status from the shift's posting mode.
  const shift = db.prepare('SELECT posting_mode FROM pos_shifts WHERE id = ?').get(ticket.shift_id) as { posting_mode: 'REALTIME' | 'BATCH' } | undefined;
  const postingStatus = shift?.posting_mode === 'BATCH' ? 'PENDING_POST' : 'REALTIME_POSTED';

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE pos_sales_tickets
         SET ended_at = datetime('now'),
             change_given = ?,
             posting_status = ?,
             posted_at = CASE WHEN ? = 'REALTIME_POSTED' THEN datetime('now') ELSE posted_at END,
             updated_at = datetime('now')
       WHERE id = ?`
    ).run(changeGiven, postingStatus, postingStatus, ticketId);

    // Write tax breakdown (single store tax).
    const storeTax = db.prepare(
      'SELECT tax_code, tax_rate FROM pos_stores WHERE id = ?'
    ).get(ticket.store_id) as { tax_code: string; tax_rate: number } | undefined;
    const taxableBase = ticket.subtotal;
    if (storeTax && ticket.tax_total > 0) {
      db.prepare(
        `INSERT INTO pos_sales_ticket_taxes (id, ticket_id, tax_code, tax_rate, taxable_base, tax_amount)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), ticketId, storeTax.tax_code, storeTax.tax_rate, taxableBase, ticket.tax_total);
    }

    db.prepare(
      `INSERT INTO pos_ticket_audit_events (id, ticket_id, event_type, actor_user_id, payload_json)
       VALUES (?, ?, 'END_SALE', ?, ?)`
    ).run(randomUUID(), ticketId, ticket.cashier_user_id, JSON.stringify({ grandTotal: grand, changeGiven, postingStatus }));

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  // Realtime inventory post — cross-DB, after posDb commit (Stage 1 sandbox — no 2PC).
  if (postingStatus === 'REALTIME_POSTED') {
    const warehouseDb = getDb();
    const lines = db.prepare(
      `SELECT sku_id, quantity, unit_price FROM pos_sales_ticket_lines
       WHERE ticket_id = ? AND sku_id IS NOT NULL AND line_kind = 'MERCHANDISE'`
    ).all(ticketId) as Array<{ sku_id: string; quantity: number; unit_price: number }>;
    for (const l of lines) {
      await applyLedgerDepletion(warehouseDb, l.sku_id, l.quantity, l.unit_price, `TICKET:${ticketId}`, ticket.cashier_user_id);
    }
  }

  return getTicket(ticketId)!;
}

// ---------------------------------------------------------------------------
// Void (mid-ticket OR post-end) — atomic for continuation chains.
// ---------------------------------------------------------------------------

export async function voidTicket(ticketId: string, input: VoidTicketInput): Promise<SalesTicketWithChildren> {
  const db = getPosDb();
  const ticket = db.prepare('SELECT * FROM pos_sales_tickets WHERE id = ?').get(ticketId) as unknown as SalesTicketRow | undefined;
  if (!ticket) throw new Error('TICKET_NOT_FOUND');
  if (ticket.voided_at) throw new Error('TICKET_ALREADY_VOIDED');

  // Void entire continuation chain atomically (spec Q3 decision).
  const chainHead = ticket.continuation_head_id ?? ticket.id;
  const chain = db.prepare(
    `SELECT id, ended_at, posting_status, cashier_user_id
     FROM pos_sales_tickets
     WHERE id = ? OR continuation_head_id = ?`
  ).all(chainHead, chainHead) as Array<{ id: string; ended_at: string | null; posting_status: string; cashier_user_id: string }>;

  // Verify ticket password if one is set for store.
  const pw = db.prepare(
    "SELECT hash FROM pos_sales_passwords WHERE store_id = ? AND kind = 'TICKET'"
  ).get(ticket.store_id) as { hash: string } | undefined;
  let passwordUsed = 0;
  if (pw) {
    const { verifyPassword } = require('./shiftService');
    if (!input.password) throw new Error('TICKET_PASSWORD_REQUIRED');
    if (!verifyPassword(input.password, pw.hash)) throw new Error('TICKET_PASSWORD_INVALID');
    passwordUsed = 1;
  }

  // Capture tickets that need inventory reversal BEFORE the pos-side void flips
  // their posting_status. Reversal writes go to the warehouse DB, after the
  // pos-side commit (Stage 1 sandbox — cross-DB 2PC not required per plan #6).
  const reversalLines: Array<{ ticketId: string; skuId: string; quantity: number; unitPrice: number }> = [];
  for (const t of chain) {
    if (t.posting_status === 'REALTIME_POSTED' || t.posting_status === 'BATCH_POSTED') {
      const lines = db.prepare(
        `SELECT sku_id, quantity, unit_price FROM pos_sales_ticket_lines
         WHERE ticket_id = ? AND sku_id IS NOT NULL AND line_kind = 'MERCHANDISE'`
      ).all(t.id) as Array<{ sku_id: string; quantity: number; unit_price: number }>;
      for (const l of lines) {
        reversalLines.push({ ticketId: t.id, skuId: l.sku_id, quantity: l.quantity, unitPrice: l.unit_price });
      }
    }
  }

  db.exec('BEGIN');
  try {
    for (const t of chain) {
      const eventType = t.ended_at ? 'VOID_POST_END' : 'VOID_MID';

      db.prepare(
        `UPDATE pos_sales_tickets
           SET voided_at = datetime('now'),
               voided_by_user_id = ?,
               void_password_used = ?,
               posting_status = 'VOIDED_UNPOSTED',
               updated_at = datetime('now')
         WHERE id = ?`
      ).run(input.actorUserId, passwordUsed, t.id);

      db.prepare(
        `INSERT INTO pos_ticket_audit_events (id, ticket_id, event_type, actor_user_id, payload_json)
         VALUES (?, ?, ?, ?, ?)`
      ).run(randomUUID(), t.id, eventType, input.actorUserId, JSON.stringify({ reason: input.reason ?? null, chainHeadId: chainHead }));
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  if (reversalLines.length > 0) {
    const warehouseDb = getDb();
    for (const l of reversalLines) {
      await applyLedgerDepletion(warehouseDb, l.skuId, -l.quantity, l.unitPrice, `VOID:${l.ticketId}`, input.actorUserId);
    }
  }

  return getTicket(ticketId)!;
}

// ---------------------------------------------------------------------------
// Reclaim voided ticket (same shift).
// ---------------------------------------------------------------------------

export function reclaimTicket(ticketId: string, actorUserId: string): SalesTicketWithChildren {
  const db = getPosDb();
  const ticket = db.prepare('SELECT * FROM pos_sales_tickets WHERE id = ?').get(ticketId) as unknown as SalesTicketRow | undefined;
  if (!ticket) throw new Error('TICKET_NOT_FOUND');
  if (!ticket.voided_at) throw new Error('TICKET_NOT_VOIDED');
  if (ticket.ended_at) throw new Error('CANNOT_RECLAIM_ENDED_TICKET');
  if (ticket.continuation_head_id || ticket.parent_ticket_id) throw new Error('CANNOT_RECLAIM_CONTINUATION_CHAIN');

  const shift = db.prepare('SELECT status FROM pos_shifts WHERE id = ?').get(ticket.shift_id) as { status: string } | undefined;
  if (!shift || shift.status !== 'OPEN') throw new Error('SHIFT_NOT_OPEN');

  // Materialize a fresh draft that carries over header + lines.
  const newId = randomUUID();
  const maxRow = db.prepare(
    'SELECT COALESCE(MAX(ticket_number), 0) AS n FROM pos_sales_tickets WHERE store_id = ?'
  ).get(ticket.store_id) as { n: number };
  const newTicketNumber = maxRow.n + 1;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO pos_sales_tickets
         (id, ticket_number, store_id, register_id, shift_id, business_date,
          transaction_type, cashier_user_id, customer_account_id,
          header_discount_pct, promotion_code, family_member_id,
          reclaimed_from_ticket_id, posting_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`
    ).run(
      newId,
      newTicketNumber,
      ticket.store_id,
      ticket.register_id,
      ticket.shift_id,
      ticket.business_date,
      ticket.transaction_type,
      actorUserId,
      ticket.customer_account_id,
      ticket.header_discount_pct,
      ticket.promotion_code,
      ticket.family_member_id,
      ticketId
    );

    // Copy lines.
    const lines = db.prepare('SELECT * FROM pos_sales_ticket_lines WHERE ticket_id = ? ORDER BY line_number').all(ticketId) as unknown as SalesTicketLineRow[];
    for (const l of lines) {
      db.prepare(
        `INSERT INTO pos_sales_ticket_lines
           (id, ticket_id, line_number, line_kind, sku_id, sku_size_id, sku_code_snapshot,
            quantity, unit_price, price_slot_used, line_discount_pct, line_discount_amount,
            perks_amount, salesperson_user_id, family_member_id, return_code_id,
            taxable, comment, extended_net, extended_tax)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        newId,
        l.line_number,
        l.line_kind,
        l.sku_id,
        l.sku_size_id,
        l.sku_code_snapshot,
        l.quantity,
        l.unit_price,
        l.price_slot_used,
        l.line_discount_pct,
        l.line_discount_amount,
        l.perks_amount,
        l.salesperson_user_id,
        l.family_member_id,
        l.return_code_id,
        l.taxable,
        l.comment,
        l.extended_net,
        l.extended_tax
      );
    }

    recomputeTotals(db, newId);

    db.prepare(
      `INSERT INTO pos_ticket_audit_events (id, ticket_id, event_type, actor_user_id, payload_json)
       VALUES (?, ?, 'RECLAIM', ?, ?)`
    ).run(randomUUID(), newId, actorUserId, JSON.stringify({ reclaimedFrom: ticketId }));

    db.prepare(
      `UPDATE pos_shifts SET last_ticket_number_used = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(newTicketNumber, ticket.shift_id);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getTicket(newId)!;
}

// ---------------------------------------------------------------------------
// Continued ticket — creates child linked to parent.
// ---------------------------------------------------------------------------

export interface ContinueInput {
  cashierUserId: string;
  continuationAmount: number;
}

export function continueTicket(parentTicketId: string, input: ContinueInput): SalesTicketWithChildren {
  const db = getPosDb();
  const parent = db.prepare('SELECT * FROM pos_sales_tickets WHERE id = ?').get(parentTicketId) as unknown as SalesTicketRow | undefined;
  if (!parent) throw new Error('PARENT_TICKET_NOT_FOUND');
  if (parent.voided_at) throw new Error('PARENT_TICKET_VOIDED');
  if (parent.ended_at) throw new Error('PARENT_TICKET_ALREADY_ENDED');

  // Create child draft.
  const child = createTicket({
    shiftId: parent.shift_id,
    cashierUserId: input.cashierUserId,
    transactionType: parent.transaction_type,
    customerAccountId: parent.customer_account_id ?? undefined,
    parentTicketId: parent.id,
  });

  // Record the virtual CONTINUATION tender on the PARENT for the carry-forward amount.
  const contTender = db.prepare(
    "SELECT id, tender_kind FROM pos_tender_types WHERE store_id = ? AND tender_kind = 'CONTINUATION'"
  ).get(parent.store_id) as { id: string; tender_kind: TenderKind } | undefined;
  if (!contTender) throw new Error('CONTINUATION_TENDER_NOT_CONFIGURED');

  const seqRow = db.prepare(
    'SELECT COALESCE(MAX(sequence), 0) AS s FROM pos_sales_ticket_tenders WHERE ticket_id = ?'
  ).get(parent.id) as { s: number };

  db.prepare(
    `INSERT INTO pos_sales_ticket_tenders
       (id, ticket_id, sequence, tender_type_id, tender_kind, amount, is_continuation)
     VALUES (?, ?, ?, ?, 'CONTINUATION', ?, 1)`
  ).run(
    randomUUID(),
    parent.id,
    seqRow.s + 1,
    contTender.id,
    input.continuationAmount
  );

  return child;
}

// ---------------------------------------------------------------------------
// Reprint
// ---------------------------------------------------------------------------

export interface ReprintInput {
  giftReceipt?: boolean;
  channel?: 'PRINT' | 'PDF' | 'EMAIL';
  actorUserId: string;
}

export function recordReprint(ticketId: string, input: ReprintInput): SalesTicket {
  const db = getPosDb();
  const ticket = db.prepare('SELECT * FROM pos_sales_tickets WHERE id = ?').get(ticketId) as unknown as SalesTicketRow | undefined;
  if (!ticket) throw new Error('TICKET_NOT_FOUND');
  if (!ticket.ended_at) throw new Error('CANNOT_REPRINT_DRAFT_TICKET');

  db.prepare(
    'UPDATE pos_sales_tickets SET receipt_print_count = receipt_print_count + 1, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(ticketId);

  db.prepare(
    `INSERT INTO pos_ticket_audit_events (id, ticket_id, event_type, actor_user_id, payload_json)
     VALUES (?, ?, 'REPRINT', ?, ?)`
  ).run(randomUUID(), ticketId, input.actorUserId, JSON.stringify({
    giftReceipt: input.giftReceipt ?? false,
    channel: input.channel ?? 'PRINT',
  }));

  const refreshed = db.prepare('SELECT * FROM pos_sales_tickets WHERE id = ?').get(ticketId) as unknown as SalesTicketRow;
  return rowToSalesTicket(refreshed);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertDraftTicket(db: ReturnType<typeof getDb>, ticketId: string): SalesTicketRow {
  const ticket = db.prepare('SELECT * FROM pos_sales_tickets WHERE id = ?').get(ticketId) as unknown as SalesTicketRow | undefined;
  if (!ticket) throw new Error('TICKET_NOT_FOUND');
  if (ticket.voided_at) throw new Error('TICKET_VOIDED');
  if (ticket.ended_at) throw new Error('TICKET_ALREADY_ENDED');
  return ticket;
}

function recomputeTotals(db: ReturnType<typeof getDb>, ticketId: string): void {
  const agg = db.prepare(
    `SELECT COALESCE(SUM(extended_net), 0) AS subtotal,
            COALESCE(SUM(extended_tax), 0) AS tax_total
     FROM pos_sales_ticket_lines WHERE ticket_id = ?`
  ).get(ticketId) as { subtotal: number; tax_total: number };

  const headerRow = db.prepare(
    'SELECT header_discount_pct, other_charges FROM pos_sales_tickets WHERE id = ?'
  ).get(ticketId) as { header_discount_pct: number | null; other_charges: number };

  const headerDiscount = headerRow.header_discount_pct ? (agg.subtotal * headerRow.header_discount_pct) / 100 : 0;
  const subtotal = round2(agg.subtotal - headerDiscount);
  const tax = round2(agg.tax_total);
  const grand = round2(subtotal + tax + headerRow.other_charges);

  db.prepare(
    `UPDATE pos_sales_tickets SET subtotal = ?, tax_total = ?, grand_total = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(subtotal, tax, grand, ticketId);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
