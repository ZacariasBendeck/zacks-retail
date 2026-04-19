// sales-pos models — row interfaces (snake_case DB) + TS objects (camelCase) + mappers.
// Pattern follows apps/api/src/models/inventory.ts and sku.ts.

// --- Enums ------------------------------------------------------------------

export type TransactionType =
  | 'REGULAR'
  | 'USER_DEFINED'
  | 'SPECIAL_ORDER_PICKUP'
  | 'LAYAWAY_SALE'
  | 'GIFT_CERT_SALE'
  | 'HOUSE_CHARGE_PAYMENT'
  | 'SPECIAL_ORDER_DEPOSIT'
  | 'LAYAWAY_PAYMENT';

export type LineKind = 'MERCHANDISE' | 'COUPON' | 'COMMENT_ONLY';

export type TenderKind =
  | 'CASH'
  | 'CHECK'
  | 'CARD'
  | 'GIFT_CERT'
  | 'STORE_CREDIT'
  | 'HOUSE_CHARGE'
  | 'CONTINUATION'
  | 'FOREIGN_CURRENCY'
  | 'OTHER';

export type PostingMode = 'REALTIME' | 'BATCH';

export type PostingStatus =
  | 'DRAFT'
  | 'REALTIME_POSTED'
  | 'PENDING_POST'
  | 'BATCH_POSTED'
  | 'VOIDED_UNPOSTED';

export type ShiftStatus = 'OPEN' | 'CLOSING' | 'CLOSED' | 'VOIDED';

export type DrawerKind = 'NONE' | 'OPOS' | 'WEBUSB' | 'PRINTER_TRIGGERED';

export type TicketEventType =
  | 'VOID_MID'
  | 'VOID_POST_END'
  | 'RECLAIM'
  | 'TAX_OVERRIDE'
  | 'PRICE_OVERRIDE'
  | 'PASSWORD_CHALLENGE'
  | 'COMMENT_EDIT'
  | 'END_SALE'
  | 'REPRINT';

export type SalesPasswordKind = 'MANAGER' | 'TICKET';

// --- Stores -----------------------------------------------------------------

export interface StoreRow {
  id: number;
  code: string;
  name: string;
  tax_rate: number;
  tax_code: string;
  other_charge_label: string;
  return_code_tracking: number;
  currency_enabled: number;
  currency_rate: number | null;
  currency_decimals: number | null;
  currency_print_on_receipt: number | null;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: number;
  code: string;
  name: string;
  taxRate: number;
  taxCode: string;
  otherChargeLabel: string;
  returnCodeTracking: boolean;
  currencyEnabled: boolean;
  currencyRate: number | null;
  currencyDecimals: number | null;
  currencyPrintOnReceipt: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToStore(r: StoreRow): Store {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    taxRate: r.tax_rate,
    taxCode: r.tax_code,
    otherChargeLabel: r.other_charge_label,
    returnCodeTracking: r.return_code_tracking === 1,
    currencyEnabled: r.currency_enabled === 1,
    currencyRate: r.currency_rate,
    currencyDecimals: r.currency_decimals,
    currencyPrintOnReceipt: (r.currency_print_on_receipt ?? 0) === 1,
    active: r.active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// --- Registers --------------------------------------------------------------

export interface RegisterRow {
  id: string;
  store_id: number;
  code: string;
  label: string;
  drawer_kind: DrawerKind;
  drawer_config_json: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Register {
  id: string;
  storeId: number;
  code: string;
  label: string;
  drawerKind: DrawerKind;
  drawerConfig: Record<string, unknown> | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function rowToRegister(r: RegisterRow): Register {
  return {
    id: r.id,
    storeId: r.store_id,
    code: r.code,
    label: r.label,
    drawerKind: r.drawer_kind,
    drawerConfig: r.drawer_config_json ? JSON.parse(r.drawer_config_json) : null,
    active: r.active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// --- Tender Types + Payout Categories --------------------------------------

export interface TenderTypeRow {
  id: string;
  store_id: number;
  code: string;
  label: string;
  tender_kind: TenderKind;
  is_considered_cash: number;
  opens_drawer: number;
  require_account_number: number;
  active: number;
  sort_order: number;
  created_at: string;
}

export interface TenderType {
  id: string;
  storeId: number;
  code: string;
  label: string;
  tenderKind: TenderKind;
  isConsideredCash: boolean;
  opensDrawer: boolean;
  requireAccountNumber: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export function rowToTenderType(r: TenderTypeRow): TenderType {
  return {
    id: r.id,
    storeId: r.store_id,
    code: r.code,
    label: r.label,
    tenderKind: r.tender_kind,
    isConsideredCash: r.is_considered_cash === 1,
    opensDrawer: r.opens_drawer === 1,
    requireAccountNumber: r.require_account_number === 1,
    active: r.active === 1,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

export interface PayoutCategoryRow {
  id: string;
  store_id: number;
  code: string;
  label: string;
  active: number;
  created_at: string;
}

export interface PayoutCategory {
  id: string;
  storeId: number;
  code: string;
  label: string;
  active: boolean;
  createdAt: string;
}

export function rowToPayoutCategory(r: PayoutCategoryRow): PayoutCategory {
  return {
    id: r.id,
    storeId: r.store_id,
    code: r.code,
    label: r.label,
    active: r.active === 1,
    createdAt: r.created_at,
  };
}

// --- Shifts -----------------------------------------------------------------

export interface ShiftRow {
  id: string;
  store_id: number;
  register_id: string;
  opened_at: string;
  opened_by_user_id: string;
  opening_cash_float: number;
  closed_at: string | null;
  closed_by_user_id: string | null;
  closing_cash_count: number | null;
  closing_deposit_count: number | null;
  expected_cash_at_close: number | null;
  over_short_amount: number | null;
  over_short_approved_by: string | null;
  status: ShiftStatus;
  posting_mode: PostingMode;
  posted_at: string | null;
  last_ticket_number_used: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  storeId: number;
  registerId: string;
  openedAt: string;
  openedByUserId: string;
  openingCashFloat: number;
  closedAt: string | null;
  closedByUserId: string | null;
  closingCashCount: number | null;
  closingDepositCount: number | null;
  expectedCashAtClose: number | null;
  overShortAmount: number | null;
  overShortApprovedBy: string | null;
  status: ShiftStatus;
  postingMode: PostingMode;
  postedAt: string | null;
  lastTicketNumberUsed: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function rowToShift(r: ShiftRow): Shift {
  return {
    id: r.id,
    storeId: r.store_id,
    registerId: r.register_id,
    openedAt: r.opened_at,
    openedByUserId: r.opened_by_user_id,
    openingCashFloat: r.opening_cash_float,
    closedAt: r.closed_at,
    closedByUserId: r.closed_by_user_id,
    closingCashCount: r.closing_cash_count,
    closingDepositCount: r.closing_deposit_count,
    expectedCashAtClose: r.expected_cash_at_close,
    overShortAmount: r.over_short_amount,
    overShortApprovedBy: r.over_short_approved_by,
    status: r.status,
    postingMode: r.posting_mode,
    postedAt: r.posted_at,
    lastTicketNumberUsed: r.last_ticket_number_used,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// --- Sales Tickets ----------------------------------------------------------

export interface SalesTicketRow {
  id: string;
  ticket_number: number;
  store_id: number;
  register_id: string;
  shift_id: string;
  business_date: string;
  transaction_type: TransactionType;
  cashier_user_id: string;
  customer_account_id: string | null;
  header_discount_pct: number | null;
  promotion_code: string | null;
  family_member_id: string | null;
  subtotal: number;
  tax_total: number;
  tax_override_reason: string | null;
  other_charges: number;
  other_charges_label: string | null;
  grand_total: number;
  change_given: number;
  comment: string | null;
  parent_ticket_id: string | null;
  continuation_head_id: string | null;
  voided_at: string | null;
  voided_by_user_id: string | null;
  void_password_used: number;
  reclaimed_from_ticket_id: string | null;
  posting_status: PostingStatus;
  posted_at: string | null;
  receipt_print_count: number;
  ended_at: string | null;
  special_order_ext_id: string | null;
  layaway_ext_id: string | null;
  house_charge_ext_id: string | null;
  gift_cert_sale_ext_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesTicket {
  id: string;
  ticketNumber: number;
  storeId: number;
  registerId: string;
  shiftId: string;
  businessDate: string;
  transactionType: TransactionType;
  cashierUserId: string;
  customerAccountId: string | null;
  headerDiscountPct: number | null;
  promotionCode: string | null;
  familyMemberId: string | null;
  subtotal: number;
  taxTotal: number;
  taxOverrideReason: string | null;
  otherCharges: number;
  otherChargesLabel: string | null;
  grandTotal: number;
  changeGiven: number;
  comment: string | null;
  parentTicketId: string | null;
  continuationHeadId: string | null;
  voidedAt: string | null;
  voidedByUserId: string | null;
  voidPasswordUsed: boolean;
  reclaimedFromTicketId: string | null;
  postingStatus: PostingStatus;
  postedAt: string | null;
  receiptPrintCount: number;
  endedAt: string | null;
  specialOrderExtId: string | null;
  layawayExtId: string | null;
  houseChargeExtId: string | null;
  giftCertSaleExtId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function rowToSalesTicket(r: SalesTicketRow): SalesTicket {
  return {
    id: r.id,
    ticketNumber: r.ticket_number,
    storeId: r.store_id,
    registerId: r.register_id,
    shiftId: r.shift_id,
    businessDate: r.business_date,
    transactionType: r.transaction_type,
    cashierUserId: r.cashier_user_id,
    customerAccountId: r.customer_account_id,
    headerDiscountPct: r.header_discount_pct,
    promotionCode: r.promotion_code,
    familyMemberId: r.family_member_id,
    subtotal: r.subtotal,
    taxTotal: r.tax_total,
    taxOverrideReason: r.tax_override_reason,
    otherCharges: r.other_charges,
    otherChargesLabel: r.other_charges_label,
    grandTotal: r.grand_total,
    changeGiven: r.change_given,
    comment: r.comment,
    parentTicketId: r.parent_ticket_id,
    continuationHeadId: r.continuation_head_id,
    voidedAt: r.voided_at,
    voidedByUserId: r.voided_by_user_id,
    voidPasswordUsed: r.void_password_used === 1,
    reclaimedFromTicketId: r.reclaimed_from_ticket_id,
    postingStatus: r.posting_status,
    postedAt: r.posted_at,
    receiptPrintCount: r.receipt_print_count,
    endedAt: r.ended_at,
    specialOrderExtId: r.special_order_ext_id,
    layawayExtId: r.layaway_ext_id,
    houseChargeExtId: r.house_charge_ext_id,
    giftCertSaleExtId: r.gift_cert_sale_ext_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// --- Ticket Lines -----------------------------------------------------------

export interface SalesTicketLineRow {
  id: string;
  ticket_id: string;
  line_number: number;
  line_kind: LineKind;
  sku_id: string | null;
  sku_size_id: string | null;
  sku_code_snapshot: string | null;
  quantity: number;
  unit_price: number;
  price_slot_used: string | null;
  line_discount_pct: number | null;
  line_discount_amount: number | null;
  perks_amount: number;
  salesperson_user_id: string | null;
  family_member_id: string | null;
  return_code_id: number | null;
  taxable: number;
  comment: string | null;
  extended_net: number;
  extended_tax: number;
  created_at: string;
}

export interface SalesTicketLine {
  id: string;
  ticketId: string;
  lineNumber: number;
  lineKind: LineKind;
  skuId: string | null;
  skuSizeId: string | null;
  skuCodeSnapshot: string | null;
  quantity: number;
  unitPrice: number;
  priceSlotUsed: string | null;
  lineDiscountPct: number | null;
  lineDiscountAmount: number | null;
  perksAmount: number;
  salespersonUserId: string | null;
  familyMemberId: string | null;
  returnCodeId: number | null;
  taxable: boolean;
  comment: string | null;
  extendedNet: number;
  extendedTax: number;
  createdAt: string;
}

export function rowToSalesTicketLine(r: SalesTicketLineRow): SalesTicketLine {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    lineNumber: r.line_number,
    lineKind: r.line_kind,
    skuId: r.sku_id,
    skuSizeId: r.sku_size_id,
    skuCodeSnapshot: r.sku_code_snapshot,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    priceSlotUsed: r.price_slot_used,
    lineDiscountPct: r.line_discount_pct,
    lineDiscountAmount: r.line_discount_amount,
    perksAmount: r.perks_amount,
    salespersonUserId: r.salesperson_user_id,
    familyMemberId: r.family_member_id,
    returnCodeId: r.return_code_id,
    taxable: r.taxable === 1,
    comment: r.comment,
    extendedNet: r.extended_net,
    extendedTax: r.extended_tax,
    createdAt: r.created_at,
  };
}

// --- Ticket Tenders ---------------------------------------------------------

export interface SalesTicketTenderRow {
  id: string;
  ticket_id: string;
  sequence: number;
  tender_type_id: string;
  tender_kind: TenderKind;
  amount: number;
  foreign_currency_amount: number | null;
  account_number: string | null;
  gift_cert_number: string | null;
  auth_reference: string | null;
  is_continuation: number;
  created_at: string;
}

export interface SalesTicketTender {
  id: string;
  ticketId: string;
  sequence: number;
  tenderTypeId: string;
  tenderKind: TenderKind;
  amount: number;
  foreignCurrencyAmount: number | null;
  accountNumber: string | null;
  giftCertNumber: string | null;
  authReference: string | null;
  isContinuation: boolean;
  createdAt: string;
}

export function rowToSalesTicketTender(r: SalesTicketTenderRow): SalesTicketTender {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    sequence: r.sequence,
    tenderTypeId: r.tender_type_id,
    tenderKind: r.tender_kind,
    amount: r.amount,
    foreignCurrencyAmount: r.foreign_currency_amount,
    accountNumber: r.account_number,
    giftCertNumber: r.gift_cert_number,
    authReference: r.auth_reference,
    isContinuation: r.is_continuation === 1,
    createdAt: r.created_at,
  };
}

// --- Ticket Taxes -----------------------------------------------------------

export interface SalesTicketTaxRow {
  id: string;
  ticket_id: string;
  tax_code: string;
  tax_rate: number;
  taxable_base: number;
  tax_amount: number;
}

export interface SalesTicketTax {
  id: string;
  ticketId: string;
  taxCode: string;
  taxRate: number;
  taxableBase: number;
  taxAmount: number;
}

export function rowToSalesTicketTax(r: SalesTicketTaxRow): SalesTicketTax {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    taxCode: r.tax_code,
    taxRate: r.tax_rate,
    taxableBase: r.taxable_base,
    taxAmount: r.tax_amount,
  };
}

// --- Audit Events -----------------------------------------------------------

export interface TicketAuditEventRow {
  id: string;
  ticket_id: string;
  event_type: TicketEventType;
  actor_user_id: string;
  payload_json: string | null;
  created_at: string;
}

export interface TicketAuditEvent {
  id: string;
  ticketId: string;
  eventType: TicketEventType;
  actorUserId: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export function rowToTicketAuditEvent(r: TicketAuditEventRow): TicketAuditEvent {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    eventType: r.event_type,
    actorUserId: r.actor_user_id,
    payload: r.payload_json ? JSON.parse(r.payload_json) : null,
    createdAt: r.created_at,
  };
}

// --- Payouts ----------------------------------------------------------------

export interface PayoutRow {
  id: string;
  shift_id: string;
  cashier_user_id: string;
  category_id: string;
  category_label: string;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface Payout {
  id: string;
  shiftId: string;
  cashierUserId: string;
  categoryId: string;
  categoryLabel: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

export function rowToPayout(r: PayoutRow): Payout {
  return {
    id: r.id,
    shiftId: r.shift_id,
    cashierUserId: r.cashier_user_id,
    categoryId: r.category_id,
    categoryLabel: r.category_label,
    amount: r.amount,
    note: r.note,
    createdAt: r.created_at,
  };
}

// --- Drawer Tender Counts ---------------------------------------------------

export interface DrawerTenderCountRow {
  id: string;
  shift_id: string;
  tender_type_id: string;
  tender_kind: TenderKind;
  counted_amount: number;
  expected_amount: number;
  difference: number;
  detail_json: string | null;
  created_at: string;
}

export interface DrawerTenderCount {
  id: string;
  shiftId: string;
  tenderTypeId: string;
  tenderKind: TenderKind;
  countedAmount: number;
  expectedAmount: number;
  difference: number;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export function rowToDrawerTenderCount(r: DrawerTenderCountRow): DrawerTenderCount {
  return {
    id: r.id,
    shiftId: r.shift_id,
    tenderTypeId: r.tender_type_id,
    tenderKind: r.tender_kind,
    countedAmount: r.counted_amount,
    expectedAmount: r.expected_amount,
    difference: r.difference,
    detail: r.detail_json ? JSON.parse(r.detail_json) : null,
    createdAt: r.created_at,
  };
}

// --- Sales Passwords --------------------------------------------------------

export interface SalesPasswordRow {
  id: string;
  store_id: number;
  kind: SalesPasswordKind;
  hash: string;
  updated_at: string;
  updated_by_user_id: string;
}

export interface SalesPassword {
  id: string;
  storeId: number;
  kind: SalesPasswordKind;
  updatedAt: string;
  updatedByUserId: string;
}

export function rowToSalesPassword(r: SalesPasswordRow): SalesPassword {
  return {
    id: r.id,
    storeId: r.store_id,
    kind: r.kind,
    updatedAt: r.updated_at,
    updatedByUserId: r.updated_by_user_id,
  };
}

// --- Composite read shapes (ticket with children) ---------------------------

export interface SalesTicketWithChildren extends SalesTicket {
  lines: SalesTicketLine[];
  tenders: SalesTicketTender[];
  taxes: SalesTicketTax[];
}

// --- Cash Totals recap (p. 23) ---------------------------------------------

export interface CashTotalsRecap {
  shiftId: string;
  salesRecap: {
    grossSales: number;
    returns: number;
    netSales: number;
    taxTotal: number;
    otherCharges: number;
    grandTotal: number;
    ticketCount: number;
    voidedTicketCount: number;
  };
  cashDrawerRecap: {
    openingCashFloat: number;
    cashTenders: number;
    payouts: number;
    expectedCashInDrawer: number;
  };
  tenderBreakdown: Array<{
    tenderTypeId: string;
    tenderKind: TenderKind;
    label: string;
    amount: number;
    count: number;
  }>;
  voidSummary: {
    voidedTicketCount: number;
    voidedAmount: number;
  };
}
