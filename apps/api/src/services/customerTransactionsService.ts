import { randomUUID } from 'node:crypto';
import { getDb } from '../db/database';
import {
  GiftCertificate,
  GiftCertificateRow,
  GiftCertificateTransaction,
  GiftCertificateTransactionRow,
  HouseChargeKind,
  HouseChargeTransaction,
  HouseChargeTransactionRow,
  Layaway,
  LayawayRow,
  LayawayLineRow,
  LayawayPaymentRow,
  LayawayWithChildren,
  SpecialOrder,
  SpecialOrderRow,
  SpecialOrderLineRow,
  SpecialOrderDepositRow,
  SpecialOrderWithChildren,
  rowToGiftCertificate,
  rowToGiftCertificateTransaction,
  rowToHouseChargeTransaction,
  rowToLayaway,
  rowToLayawayLine,
  rowToLayawayPayment,
  rowToSpecialOrder,
  rowToSpecialOrderDeposit,
  rowToSpecialOrderLine,
} from '../models/customerTransactions';

// ---------------------------------------------------------------------------
// Special Orders (RICS pp. 36-37)
// Inventory does NOT deduct at deposit — only at pickup.
// ---------------------------------------------------------------------------

export interface CreateSpecialOrderInput {
  customerId: string;
  storeId: number;
  depositTicketId: string;
  depositAmount: number;
  lines: Array<{
    skuId?: string;
    draftSkuCode?: string;
    draftDescription?: string;
    columnLabel?: string | null;
    rowLabel?: string | null;
    quantity: number;
    price: number;
  }>;
  notes?: string;
  createdBy: string;
}

export function createSpecialOrder(input: CreateSpecialOrderInput): SpecialOrderWithChildren {
  const db = getDb();
  if (input.lines.length === 0) throw new Error('AT_LEAST_ONE_LINE_REQUIRED');
  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(input.customerId);
  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

  const id = randomUUID();
  const totalOrdered = input.lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const balanceDue = totalOrdered - input.depositAmount;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO special_orders (
        id, customer_id, store_id, deposit_ticket_id,
        total_ordered, deposit_paid, balance_due, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.customerId,
      input.storeId,
      input.depositTicketId,
      totalOrdered,
      input.depositAmount,
      balanceDue,
      input.notes ?? null,
      input.createdBy,
    );

    for (const line of input.lines) {
      if (!line.skuId && !line.draftSkuCode && !line.draftDescription) {
        throw new Error('LINE_SKU_OR_DESCRIPTION_REQUIRED');
      }
      db.prepare(
        `INSERT INTO special_order_lines (
          id, special_order_id, sku_id, draft_sku_code, draft_description,
          column_label, row_label, quantity, price_at_deposit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        id,
        line.skuId ?? null,
        line.draftSkuCode ?? null,
        line.draftDescription ?? null,
        line.columnLabel ?? null,
        line.rowLabel ?? null,
        line.quantity,
        line.price,
      );
    }

    db.prepare(
      `INSERT INTO special_order_deposits (id, special_order_id, ticket_id, amount)
       VALUES (?, ?, ?, ?)`
    ).run(randomUUID(), id, input.depositTicketId, input.depositAmount);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getSpecialOrder(id)!;
}

export function getSpecialOrder(id: string): SpecialOrderWithChildren | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM special_orders WHERE id = ?').get(id) as SpecialOrderRow | undefined;
  if (!row) return null;
  const lines = db.prepare('SELECT * FROM special_order_lines WHERE special_order_id = ?').all(id) as SpecialOrderLineRow[];
  const deposits = db.prepare('SELECT * FROM special_order_deposits WHERE special_order_id = ? ORDER BY taken_at').all(id) as SpecialOrderDepositRow[];
  return { ...rowToSpecialOrder(row), lines: lines.map(rowToSpecialOrderLine), deposits: deposits.map(rowToSpecialOrderDeposit) };
}

export function listSpecialOrdersForCustomer(customerId: string): SpecialOrder[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM special_orders WHERE customer_id = ? ORDER BY opened_at DESC'
  ).all(customerId) as SpecialOrderRow[];
  return rows.map(rowToSpecialOrder);
}

export function pickupSpecialOrder(id: string, pickupTicketId: string): SpecialOrderWithChildren {
  const db = getDb();
  const so = db.prepare('SELECT * FROM special_orders WHERE id = ?').get(id) as SpecialOrderRow | undefined;
  if (!so) throw new Error('SPECIAL_ORDER_NOT_FOUND');
  if (so.status !== 'OPEN_DEPOSITED') throw new Error('SPECIAL_ORDER_NOT_PICKUP_READY');

  // p. 37: SKU must be valid at pickup — block if any line is still a draft.
  const drafts = db.prepare(
    `SELECT COUNT(*) AS cnt FROM special_order_lines
     WHERE special_order_id = ? AND resolved_sku_id IS NULL AND sku_id IS NULL`
  ).get(id) as { cnt: number };
  if (drafts.cnt > 0) throw new Error('SPECIAL_ORDER_HAS_UNRESOLVED_DRAFT_SKUS');

  db.prepare(
    `UPDATE special_orders
       SET status = 'PICKED_UP', picked_up_at = datetime('now'),
           pickup_ticket_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(pickupTicketId, id);
  return getSpecialOrder(id)!;
}

export function refundSpecialOrder(id: string, refundTicketId: string): SpecialOrderWithChildren {
  const db = getDb();
  const so = db.prepare('SELECT * FROM special_orders WHERE id = ?').get(id) as SpecialOrderRow | undefined;
  if (!so) throw new Error('SPECIAL_ORDER_NOT_FOUND');
  if (so.status !== 'OPEN_DEPOSITED') throw new Error('SPECIAL_ORDER_NOT_REFUNDABLE');

  db.prepare(
    `UPDATE special_orders
       SET status = 'REFUNDED', refunded_at = datetime('now'),
           refund_ticket_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(refundTicketId, id);
  return getSpecialOrder(id)!;
}

export function resolveSpecialOrderDraftSku(lineId: string, skuId: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE special_order_lines
       SET resolved_sku_id = ?, resolved_at = datetime('now')
     WHERE id = ?`
  ).run(skuId, lineId);
}

// ---------------------------------------------------------------------------
// Layaways (RICS pp. 38-39)
// Inventory DEDUCTS at sale — different from Special Order.
// ---------------------------------------------------------------------------

export interface CreateLayawayInput {
  customerId: string;
  storeId: number;
  originalTicketId: string;
  initialPayment: number;
  lines: Array<{
    skuId: string;
    columnLabel?: string | null;
    rowLabel?: string | null;
    quantity: number;
    price: number;
  }>;
  layawayFee?: number;
  nextPaymentDueAt?: string;
  createdBy: string;
}

export function createLayaway(input: CreateLayawayInput): LayawayWithChildren {
  const db = getDb();
  if (input.lines.length === 0) throw new Error('AT_LEAST_ONE_LINE_REQUIRED');
  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(input.customerId);
  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

  const settings = getSettings();
  if (settings.minLayawayDepositPercent != null) {
    const totalDue = input.lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const minDeposit = (totalDue * settings.minLayawayDepositPercent) / 100;
    if (input.initialPayment < minDeposit) throw new Error('MIN_LAYAWAY_DEPOSIT_NOT_MET');
  }

  const id = randomUUID();
  const totalDue = input.lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const balance = totalDue - input.initialPayment;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO layaways (
        id, customer_id, store_id, original_ticket_id,
        total_originally_due, total_paid, balance, layaway_fee,
        next_payment_due_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.customerId,
      input.storeId,
      input.originalTicketId,
      totalDue,
      input.initialPayment,
      balance,
      input.layawayFee ?? settings.layawayDefaultFee,
      input.nextPaymentDueAt ?? null,
      input.createdBy,
    );

    for (const line of input.lines) {
      db.prepare(
        `INSERT INTO layaway_lines (
          id, layaway_id, sku_id, column_label, row_label, quantity, price_at_sale
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        id,
        line.skuId,
        line.columnLabel ?? null,
        line.rowLabel ?? null,
        line.quantity,
        line.price,
      );
    }

    // Record the initial payment.
    if (input.initialPayment > 0) {
      db.prepare(
        `INSERT INTO layaway_payments (id, layaway_id, ticket_id, amount, is_pickup)
         VALUES (?, ?, ?, ?, ?)`
      ).run(randomUUID(), id, input.originalTicketId, input.initialPayment, balance === 0 ? 1 : 0);
      if (balance === 0) {
        db.prepare(
          `UPDATE layaways SET status = 'PICKED_UP', picked_up_at = datetime('now') WHERE id = ?`
        ).run(id);
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getLayaway(id)!;
}

export function getLayaway(id: string): LayawayWithChildren | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM layaways WHERE id = ?').get(id) as LayawayRow | undefined;
  if (!row) return null;
  const lines = db.prepare('SELECT * FROM layaway_lines WHERE layaway_id = ?').all(id) as LayawayLineRow[];
  const payments = db.prepare('SELECT * FROM layaway_payments WHERE layaway_id = ? ORDER BY paid_at').all(id) as LayawayPaymentRow[];
  return { ...rowToLayaway(row), lines: lines.map(rowToLayawayLine), payments: payments.map(rowToLayawayPayment) };
}

export function listLayawaysForCustomer(customerId: string): Layaway[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM layaways WHERE customer_id = ? ORDER BY opened_at DESC').all(customerId) as LayawayRow[];
  return rows.map(rowToLayaway);
}

export function recordLayawayPayment(
  layawayId: string,
  payment: { ticketId: string; amount: number },
): LayawayWithChildren {
  const db = getDb();
  const layaway = db.prepare('SELECT * FROM layaways WHERE id = ?').get(layawayId) as LayawayRow | undefined;
  if (!layaway) throw new Error('LAYAWAY_NOT_FOUND');
  if (layaway.status !== 'ACTIVE') throw new Error('LAYAWAY_NOT_ACTIVE');
  if (payment.amount <= 0) throw new Error('PAYMENT_AMOUNT_INVALID');
  if (payment.amount > layaway.balance) throw new Error('PAYMENT_OVERPAYMENT');

  const newPaid = layaway.total_paid + payment.amount;
  const newBalance = layaway.balance - payment.amount;
  const isPickup = newBalance === 0;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO layaway_payments (id, layaway_id, ticket_id, amount, is_pickup)
       VALUES (?, ?, ?, ?, ?)`
    ).run(randomUUID(), layawayId, payment.ticketId, payment.amount, isPickup ? 1 : 0);

    db.prepare(
      `UPDATE layaways
         SET total_paid = ?, balance = ?, last_payment_at = datetime('now'),
             ${isPickup ? "status = 'PICKED_UP', picked_up_at = datetime('now')," : ''}
             updated_at = datetime('now')
       WHERE id = ?`
    ).run(newPaid, newBalance, layawayId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getLayaway(layawayId)!;
}

export function refundLayaway(id: string, refundTicketId: string): LayawayWithChildren {
  const db = getDb();
  const layaway = db.prepare('SELECT * FROM layaways WHERE id = ?').get(id) as LayawayRow | undefined;
  if (!layaway) throw new Error('LAYAWAY_NOT_FOUND');
  if (layaway.status !== 'ACTIVE') throw new Error('LAYAWAY_NOT_REFUNDABLE');
  db.prepare(
    `UPDATE layaways SET status = 'REFUNDED', refunded_at = datetime('now'),
       updated_at = datetime('now') WHERE id = ?`
  ).run(id);
  void refundTicketId; // recorded on the originating sales ticket; no column here
  return getLayaway(id)!;
}

// ---------------------------------------------------------------------------
// Gift Certificates (RICS pp. 40, 131-132)
// ---------------------------------------------------------------------------

export interface IssueGiftCertificateInput {
  certificateNo?: string;
  sequence?: string;
  amount: number;
  purchaserCustomerId?: string;
  forAccountCustomerId?: string;
  purchaseTicketId: string;
  purchaseStoreId: number;
}

export function issueGiftCertificate(input: IssueGiftCertificateInput): GiftCertificate {
  const db = getDb();
  if (input.amount <= 0) throw new Error('AMOUNT_MUST_BE_POSITIVE');
  const settings = getSettings();
  const certNo = input.certificateNo ?? (settings.autoNumberGiftCertificates ? generateCertNumber() : '');
  if (!certNo) throw new Error('CERTIFICATE_NUMBER_REQUIRED');

  const id = randomUUID();
  db.prepare(
    `INSERT INTO gift_certificates (
      id, certificate_no, sequence, purchaser_customer_id, for_account_customer_id,
      original_amount, redeemed_amount, balance, status, origin,
      purchase_ticket_id, purchase_store_id, purchase_date
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'ACTIVE', 'POS_SALE', ?, ?, datetime('now'))`
  ).run(
    id,
    certNo,
    input.sequence ?? '',
    input.purchaserCustomerId ?? null,
    input.forAccountCustomerId ?? null,
    input.amount,
    input.amount,
    input.purchaseTicketId,
    input.purchaseStoreId,
  );
  return getGiftCertificate(id)!;
}

export function backfillGiftCertificate(input: {
  certificateNo: string;
  sequence?: string;
  amount: number;
  redeemed?: number;
  forAccountCustomerId?: string;
}): GiftCertificate {
  const db = getDb();
  const id = randomUUID();
  const balance = input.amount - (input.redeemed ?? 0);
  db.prepare(
    `INSERT INTO gift_certificates (
      id, certificate_no, sequence, for_account_customer_id,
      original_amount, redeemed_amount, balance, status, origin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MAINTENANCE_BACKFILL')`
  ).run(
    id,
    input.certificateNo,
    input.sequence ?? '',
    input.forAccountCustomerId ?? null,
    input.amount,
    input.redeemed ?? 0,
    balance,
    balance === 0 ? 'FULLY_REDEEMED' : 'ACTIVE',
  );
  return getGiftCertificate(id)!;
}

export function getGiftCertificate(id: string): GiftCertificate | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM gift_certificates WHERE id = ?').get(id) as GiftCertificateRow | undefined;
  return row ? rowToGiftCertificate(row) : null;
}

export function findGiftCertificate(certificateNo: string, sequence = ''): GiftCertificate | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM gift_certificates WHERE certificate_no = ? AND sequence = ?'
  ).get(certificateNo, sequence) as GiftCertificateRow | undefined;
  return row ? rowToGiftCertificate(row) : null;
}

export function redeemGiftCertificate(input: {
  certId: string;
  amount: number;
  ticketId: string;
  storeId: number;
  customerId?: string;
  enteredBy: string;
}): GiftCertificate {
  const db = getDb();
  const row = db.prepare('SELECT * FROM gift_certificates WHERE id = ?').get(input.certId) as GiftCertificateRow | undefined;
  if (!row) throw new Error('GIFT_CERT_NOT_FOUND');
  if (row.status !== 'ACTIVE') throw new Error('GIFT_CERT_NOT_ACTIVE');
  if (input.amount <= 0) throw new Error('AMOUNT_MUST_BE_POSITIVE');
  if (input.amount > row.balance) throw new Error('GIFT_CERT_INSUFFICIENT_BALANCE');

  const newRedeemed = row.redeemed_amount + input.amount;
  const newBalance = row.balance - input.amount;
  const newStatus = newBalance === 0 ? 'FULLY_REDEEMED' : 'ACTIVE';

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO gift_certificate_transactions (
        id, cert_id, kind, ticket_id, store_id, customer_id, amount, entered_by
      ) VALUES (?, ?, 'REDEMPTION', ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      input.certId,
      input.ticketId,
      input.storeId,
      input.customerId ?? null,
      input.amount,
      input.enteredBy,
    );
    db.prepare(
      `UPDATE gift_certificates
         SET redeemed_amount = ?, balance = ?, status = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(newRedeemed, newBalance, newStatus, input.certId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getGiftCertificate(input.certId)!;
}

export function listGiftCertificateTransactions(certId: string): GiftCertificateTransaction[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM gift_certificate_transactions WHERE cert_id = ? ORDER BY occurred_at'
  ).all(certId) as GiftCertificateTransactionRow[];
  return rows.map(rowToGiftCertificateTransaction);
}

// ---------------------------------------------------------------------------
// House Charges (RICS pp. 40-41)
// ---------------------------------------------------------------------------

export interface RecordHouseChargeInput {
  customerId: string;
  storeId: number;
  ticketId: string;
  kind: HouseChargeKind;
  amount: number;
  tenderType?: string;
}

export function recordHouseCharge(input: RecordHouseChargeInput): HouseChargeTransaction {
  const db = getDb();
  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(input.customerId);
  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
  if (input.amount <= 0) throw new Error('AMOUNT_MUST_BE_POSITIVE');
  const id = randomUUID();
  db.prepare(
    `INSERT INTO house_charge_transactions (
      id, customer_id, store_id, ticket_id, kind, amount, tender_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.customerId, input.storeId, input.ticketId, input.kind, input.amount, input.tenderType ?? null);
  const row = db.prepare('SELECT * FROM house_charge_transactions WHERE id = ?').get(id) as HouseChargeTransactionRow;
  return rowToHouseChargeTransaction(row);
}

export function getHouseChargeBalance(customerId: string): { charges: number; payments: number; balance: number } {
  const db = getDb();
  const row = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'CHARGE' THEN amount ELSE 0 END), 0) AS charges,
       COALESCE(SUM(CASE WHEN kind = 'PAYMENT' THEN amount ELSE 0 END), 0) AS payments
     FROM house_charge_transactions WHERE customer_id = ?`
  ).get(customerId) as { charges: number; payments: number };
  return { charges: row.charges, payments: row.payments, balance: row.charges - row.payments };
}

export function listHouseChargeTransactions(customerId: string): HouseChargeTransaction[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM house_charge_transactions WHERE customer_id = ? ORDER BY occurred_at DESC'
  ).all(customerId) as HouseChargeTransactionRow[];
  return rows.map(rowToHouseChargeTransaction);
}

// ---------------------------------------------------------------------------
// Settings + helpers
// ---------------------------------------------------------------------------

export interface CustomerTransactionSettings {
  requireAccountOnSpecialOrders: boolean;
  requireAccountOnLayaways: boolean;
  requireAccountOnGiftCerts: boolean;
  requireAccountOnHouseCharges: boolean;
  trackGiftCertificates: boolean;
  autoNumberGiftCertificates: boolean;
  requireCertNumberOnRedeem: boolean;
  autoReprintLayawaySale: boolean;
  autoReprintLayawayPayment: boolean;
  autoReprintSpecialOrderDeposit: boolean;
  minLayawayDepositPercent: number | null;
  layawayPaymentCadenceDays: number | null;
  layawayForfeitStaleDays: number | null;
  layawayDefaultFee: number;
  enforceCustomerCreditLimit: 'OFF' | 'WARN' | 'BLOCK';
}

export function getSettings(): CustomerTransactionSettings {
  const db = getDb();
  const row = db.prepare('SELECT * FROM customer_transaction_settings WHERE id = 1').get() as {
    require_account_on_special_orders: number;
    require_account_on_layaways: number;
    require_account_on_gift_certs: number;
    require_account_on_house_charges: number;
    track_gift_certificates: number;
    auto_number_gift_certificates: number;
    require_cert_number_on_redeem: number;
    auto_reprint_layaway_sale: number;
    auto_reprint_layaway_payment: number;
    auto_reprint_special_order_deposit: number;
    min_layaway_deposit_percent: number | null;
    layaway_payment_cadence_days: number | null;
    layaway_forfeit_stale_days: number | null;
    layaway_default_fee: number;
    enforce_customer_credit_limit: 'OFF' | 'WARN' | 'BLOCK';
  };
  return {
    requireAccountOnSpecialOrders: row.require_account_on_special_orders === 1,
    requireAccountOnLayaways: row.require_account_on_layaways === 1,
    requireAccountOnGiftCerts: row.require_account_on_gift_certs === 1,
    requireAccountOnHouseCharges: row.require_account_on_house_charges === 1,
    trackGiftCertificates: row.track_gift_certificates === 1,
    autoNumberGiftCertificates: row.auto_number_gift_certificates === 1,
    requireCertNumberOnRedeem: row.require_cert_number_on_redeem === 1,
    autoReprintLayawaySale: row.auto_reprint_layaway_sale === 1,
    autoReprintLayawayPayment: row.auto_reprint_layaway_payment === 1,
    autoReprintSpecialOrderDeposit: row.auto_reprint_special_order_deposit === 1,
    minLayawayDepositPercent: row.min_layaway_deposit_percent,
    layawayPaymentCadenceDays: row.layaway_payment_cadence_days,
    layawayForfeitStaleDays: row.layaway_forfeit_stale_days,
    layawayDefaultFee: row.layaway_default_fee,
    enforceCustomerCreditLimit: row.enforce_customer_credit_limit,
  };
}

function generateCertNumber(): string {
  const db = getDb();
  const row = db.prepare(
    `SELECT MAX(CAST(certificate_no AS INTEGER)) AS n FROM gift_certificates
     WHERE certificate_no GLOB '[0-9]*'`
  ).get() as { n: number | null };
  return String((row.n ?? 0) + 1).padStart(6, '0');
}
