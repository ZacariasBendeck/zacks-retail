// customer-transactions module models.
// Covers: Special Orders (pp. 36-37), Layaways (pp. 38-39),
// Gift Certificates (pp. 40, 131-132), House Charges (pp. 40-41).

// --- Special Orders --------------------------------------------------------

export type SpecialOrderStatus = 'OPEN_DEPOSITED' | 'PICKED_UP' | 'REFUNDED' | 'CANCELLED';

export interface SpecialOrderRow {
  id: string;
  customer_id: string;
  store_id: number;
  status: SpecialOrderStatus;
  opened_at: string;
  picked_up_at: string | null;
  refunded_at: string | null;
  deposit_ticket_id: string;
  pickup_ticket_id: string | null;
  refund_ticket_id: string | null;
  total_ordered: number;
  deposit_paid: number;
  balance_due: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SpecialOrder {
  id: string;
  customerId: string;
  storeId: number;
  status: SpecialOrderStatus;
  openedAt: string;
  pickedUpAt: string | null;
  refundedAt: string | null;
  depositTicketId: string;
  pickupTicketId: string | null;
  refundTicketId: string | null;
  totalOrdered: number;
  depositPaid: number;
  balanceDue: number;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function rowToSpecialOrder(r: SpecialOrderRow): SpecialOrder {
  return {
    id: r.id,
    customerId: r.customer_id,
    storeId: r.store_id,
    status: r.status,
    openedAt: r.opened_at,
    pickedUpAt: r.picked_up_at,
    refundedAt: r.refunded_at,
    depositTicketId: r.deposit_ticket_id,
    pickupTicketId: r.pickup_ticket_id,
    refundTicketId: r.refund_ticket_id,
    totalOrdered: r.total_ordered,
    depositPaid: r.deposit_paid,
    balanceDue: r.balance_due,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface SpecialOrderLineRow {
  id: string;
  special_order_id: string;
  sku_id: string | null;
  draft_sku_code: string | null;
  draft_description: string | null;
  column_label: string | null;
  row_label: string | null;
  quantity: number;
  price_at_deposit: number;
  resolved_sku_id: string | null;
  resolved_at: string | null;
}
export interface SpecialOrderLine {
  id: string;
  specialOrderId: string;
  skuId: string | null;
  draftSkuCode: string | null;
  draftDescription: string | null;
  columnLabel: string | null;
  rowLabel: string | null;
  quantity: number;
  priceAtDeposit: number;
  resolvedSkuId: string | null;
  resolvedAt: string | null;
}
export function rowToSpecialOrderLine(r: SpecialOrderLineRow): SpecialOrderLine {
  return {
    id: r.id,
    specialOrderId: r.special_order_id,
    skuId: r.sku_id,
    draftSkuCode: r.draft_sku_code,
    draftDescription: r.draft_description,
    columnLabel: r.column_label,
    rowLabel: r.row_label,
    quantity: r.quantity,
    priceAtDeposit: r.price_at_deposit,
    resolvedSkuId: r.resolved_sku_id,
    resolvedAt: r.resolved_at,
  };
}

export interface SpecialOrderDepositRow {
  id: string;
  special_order_id: string;
  ticket_id: string;
  amount: number;
  taken_at: string;
}
export interface SpecialOrderDeposit {
  id: string;
  specialOrderId: string;
  ticketId: string;
  amount: number;
  takenAt: string;
}
export function rowToSpecialOrderDeposit(r: SpecialOrderDepositRow): SpecialOrderDeposit {
  return { id: r.id, specialOrderId: r.special_order_id, ticketId: r.ticket_id, amount: r.amount, takenAt: r.taken_at };
}

export interface SpecialOrderWithChildren extends SpecialOrder {
  lines: SpecialOrderLine[];
  deposits: SpecialOrderDeposit[];
}

// --- Layaways --------------------------------------------------------------

export type LayawayStatus = 'ACTIVE' | 'PICKED_UP' | 'REFUNDED' | 'FORFEITED' | 'CANCELLED';

export interface LayawayRow {
  id: string;
  customer_id: string;
  store_id: number;
  status: LayawayStatus;
  original_ticket_id: string;
  opened_at: string;
  picked_up_at: string | null;
  refunded_at: string | null;
  forfeited_at: string | null;
  total_originally_due: number;
  total_paid: number;
  balance: number;
  layaway_fee: number;
  next_payment_due_at: string | null;
  last_payment_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface Layaway {
  id: string;
  customerId: string;
  storeId: number;
  status: LayawayStatus;
  originalTicketId: string;
  openedAt: string;
  pickedUpAt: string | null;
  refundedAt: string | null;
  forfeitedAt: string | null;
  totalOriginallyDue: number;
  totalPaid: number;
  balance: number;
  layawayFee: number;
  nextPaymentDueAt: string | null;
  lastPaymentAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export function rowToLayaway(r: LayawayRow): Layaway {
  return {
    id: r.id,
    customerId: r.customer_id,
    storeId: r.store_id,
    status: r.status,
    originalTicketId: r.original_ticket_id,
    openedAt: r.opened_at,
    pickedUpAt: r.picked_up_at,
    refundedAt: r.refunded_at,
    forfeitedAt: r.forfeited_at,
    totalOriginallyDue: r.total_originally_due,
    totalPaid: r.total_paid,
    balance: r.balance,
    layawayFee: r.layaway_fee,
    nextPaymentDueAt: r.next_payment_due_at,
    lastPaymentAt: r.last_payment_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface LayawayLineRow {
  id: string;
  layaway_id: string;
  sku_id: string;
  column_label: string | null;
  row_label: string | null;
  quantity: number;
  price_at_sale: number;
}
export interface LayawayLine {
  id: string;
  layawayId: string;
  skuId: string;
  columnLabel: string | null;
  rowLabel: string | null;
  quantity: number;
  priceAtSale: number;
}
export function rowToLayawayLine(r: LayawayLineRow): LayawayLine {
  return {
    id: r.id,
    layawayId: r.layaway_id,
    skuId: r.sku_id,
    columnLabel: r.column_label,
    rowLabel: r.row_label,
    quantity: r.quantity,
    priceAtSale: r.price_at_sale,
  };
}

export interface LayawayPaymentRow {
  id: string;
  layaway_id: string;
  ticket_id: string;
  amount: number;
  paid_at: string;
  is_pickup: number;
}
export interface LayawayPayment {
  id: string;
  layawayId: string;
  ticketId: string;
  amount: number;
  paidAt: string;
  isPickup: boolean;
}
export function rowToLayawayPayment(r: LayawayPaymentRow): LayawayPayment {
  return {
    id: r.id,
    layawayId: r.layaway_id,
    ticketId: r.ticket_id,
    amount: r.amount,
    paidAt: r.paid_at,
    isPickup: r.is_pickup === 1,
  };
}

export interface LayawayWithChildren extends Layaway {
  lines: LayawayLine[];
  payments: LayawayPayment[];
}

// --- Gift Certificates -----------------------------------------------------

export type GiftCertificateStatus = 'ACTIVE' | 'FULLY_REDEEMED' | 'VOIDED';
export type GiftCertificateOrigin = 'POS_SALE' | 'MAINTENANCE_BACKFILL';
export type GiftCertTxnKind = 'REDEMPTION' | 'MANUAL_ADJUSTMENT';

export interface GiftCertificateRow {
  id: string;
  certificate_no: string;
  sequence: string;
  purchaser_customer_id: string | null;
  for_account_customer_id: string | null;
  original_amount: number;
  redeemed_amount: number;
  balance: number;
  status: GiftCertificateStatus;
  origin: GiftCertificateOrigin;
  purchase_ticket_id: string | null;
  purchase_store_id: number | null;
  purchase_date: string | null;
  created_at: string;
  updated_at: string;
}
export interface GiftCertificate {
  id: string;
  certificateNo: string;
  sequence: string;
  purchaserCustomerId: string | null;
  forAccountCustomerId: string | null;
  originalAmount: number;
  redeemedAmount: number;
  balance: number;
  status: GiftCertificateStatus;
  origin: GiftCertificateOrigin;
  purchaseTicketId: string | null;
  purchaseStoreId: number | null;
  purchaseDate: string | null;
  createdAt: string;
  updatedAt: string;
}
export function rowToGiftCertificate(r: GiftCertificateRow): GiftCertificate {
  return {
    id: r.id,
    certificateNo: r.certificate_no,
    sequence: r.sequence,
    purchaserCustomerId: r.purchaser_customer_id,
    forAccountCustomerId: r.for_account_customer_id,
    originalAmount: r.original_amount,
    redeemedAmount: r.redeemed_amount,
    balance: r.balance,
    status: r.status,
    origin: r.origin,
    purchaseTicketId: r.purchase_ticket_id,
    purchaseStoreId: r.purchase_store_id,
    purchaseDate: r.purchase_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface GiftCertificateTransactionRow {
  id: string;
  cert_id: string;
  kind: GiftCertTxnKind;
  ticket_id: string | null;
  store_id: number | null;
  customer_id: string | null;
  amount: number;
  occurred_at: string;
  entered_by: string;
  note: string | null;
}
export interface GiftCertificateTransaction {
  id: string;
  certId: string;
  kind: GiftCertTxnKind;
  ticketId: string | null;
  storeId: number | null;
  customerId: string | null;
  amount: number;
  occurredAt: string;
  enteredBy: string;
  note: string | null;
}
export function rowToGiftCertificateTransaction(r: GiftCertificateTransactionRow): GiftCertificateTransaction {
  return {
    id: r.id,
    certId: r.cert_id,
    kind: r.kind,
    ticketId: r.ticket_id,
    storeId: r.store_id,
    customerId: r.customer_id,
    amount: r.amount,
    occurredAt: r.occurred_at,
    enteredBy: r.entered_by,
    note: r.note,
  };
}

// --- House Charges ---------------------------------------------------------

export type HouseChargeKind = 'CHARGE' | 'PAYMENT';

export interface HouseChargeTransactionRow {
  id: string;
  customer_id: string;
  store_id: number;
  ticket_id: string;
  kind: HouseChargeKind;
  amount: number;
  tender_type: string | null;
  occurred_at: string;
  posted_to_ar_at: string | null;
  created_at: string;
}
export interface HouseChargeTransaction {
  id: string;
  customerId: string;
  storeId: number;
  ticketId: string;
  kind: HouseChargeKind;
  amount: number;
  tenderType: string | null;
  occurredAt: string;
  postedToArAt: string | null;
  createdAt: string;
}
export function rowToHouseChargeTransaction(r: HouseChargeTransactionRow): HouseChargeTransaction {
  return {
    id: r.id,
    customerId: r.customer_id,
    storeId: r.store_id,
    ticketId: r.ticket_id,
    kind: r.kind,
    amount: r.amount,
    tenderType: r.tender_type,
    occurredAt: r.occurred_at,
    postedToArAt: r.posted_to_ar_at,
    createdAt: r.created_at,
  };
}
