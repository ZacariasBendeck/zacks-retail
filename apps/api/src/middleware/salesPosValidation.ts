import { z } from 'zod';

// Re-export shared middleware so routes can import everything from one place.
export { validate, validateQuery } from './validation';

const TX_TYPES = [
  'REGULAR',
  'USER_DEFINED',
  'SPECIAL_ORDER_PICKUP',
  'LAYAWAY_SALE',
  'GIFT_CERT_SALE',
  'HOUSE_CHARGE_PAYMENT',
  'SPECIAL_ORDER_DEPOSIT',
  'LAYAWAY_PAYMENT',
] as const;

const LINE_KINDS = ['MERCHANDISE', 'COUPON', 'COMMENT_ONLY'] as const;

const DRAWER_KINDS = ['NONE', 'OPOS', 'WEBUSB', 'PRINTER_TRIGGERED'] as const;

const POSTING_MODES = ['REALTIME', 'BATCH'] as const;

const POSTED_FILTER = ['POSTED', 'UNPOSTED', 'BOTH'] as const;

const money = z.number().multipleOf(0.01);

// --- Shift ------------------------------------------------------------------

export const openShiftSchema = z.object({
  storeId: z.number().int().positive().default(1),
  registerId: z.string().min(1),
  openedByUserId: z.string().min(1),
  openingCashFloat: z.number().nonnegative().multipleOf(0.01).default(0),
  postingMode: z.enum(POSTING_MODES).optional(),
  notes: z.string().max(500).optional(),
});

export const closeShiftSchema = z.object({
  closingCashCount: money,
  closingDepositCount: money,
  closedByUserId: z.string().min(1),
  managerPassword: z.string().optional(),
  overShortApprovedBy: z.string().optional(),
});

export const countMoneySchema = z.object({
  counts: z.array(z.object({
    tenderTypeId: z.string().min(1),
    countedAmount: money,
    detail: z.record(z.any()).optional(),
  })).min(1),
});

export const postShiftSchema = z.object({
  postedByUserId: z.string().min(1),
});

// --- Ticket -----------------------------------------------------------------

export const createTicketSchema = z.object({
  shiftId: z.string().uuid(),
  cashierUserId: z.string().min(1),
  transactionType: z.enum(TX_TYPES).optional(),
  customerAccountId: z.string().optional(),
  headerDiscountPct: z.number().min(0).max(100).optional(),
  promotionCode: z.string().max(20).optional(),
  familyMemberId: z.string().optional(),
  parentTicketId: z.string().uuid().optional(),
});

export const updateTicketHeaderSchema = z.object({
  customerAccountId: z.string().nullable().optional(),
  headerDiscountPct: z.number().min(0).max(100).nullable().optional(),
  promotionCode: z.string().max(20).nullable().optional(),
  familyMemberId: z.string().nullable().optional(),
  comment: z.string().max(500).nullable().optional(),
});

export const addLineSchema = z.object({
  lineKind: z.enum(LINE_KINDS).optional(),
  skuId: z.string().optional(),
  skuSizeId: z.string().optional(),
  quantity: z.number().int(),
  unitPrice: money.optional(),
  priceSlotUsed: z.enum(['RETAIL', 'MARKDOWN1', 'MARKDOWN2', 'NEXT_PRICE_OVERRIDE', 'MANUAL']).optional(),
  lineDiscountPct: z.number().min(0).max(100).optional(),
  lineDiscountAmount: money.optional(),
  perksAmount: money.optional(),
  salespersonUserId: z.string().optional(),
  familyMemberId: z.string().optional(),
  returnCodeId: z.number().int().optional(),
  taxable: z.boolean().optional(),
  comment: z.string().max(500).optional(),
});

export const addTenderSchema = z.object({
  tenderTypeId: z.string().min(1),
  amount: z.number().multipleOf(0.01),
  accountNumber: z.string().max(50).optional(),
  giftCertNumber: z.string().max(50).optional(),
  authReference: z.string().max(100).optional(),
  foreignCurrencyAmount: money.optional(),
});

export const endTicketSchema = z.object({
  printReceipt: z.boolean().optional(),
  openDrawer: z.boolean().optional(),
});

export const voidTicketSchema = z.object({
  actorUserId: z.string().min(1),
  reason: z.string().max(500).optional(),
  password: z.string().optional(),
});

export const reclaimTicketSchema = z.object({
  actorUserId: z.string().min(1),
});

export const continueTicketSchema = z.object({
  cashierUserId: z.string().min(1),
  continuationAmount: money,
});

export const taxOverrideSchema = z.object({
  newTaxTotal: money,
  reason: z.string().min(1).max(500),
  actorUserId: z.string().min(1),
});

export const reprintSchema = z.object({
  actorUserId: z.string().min(1),
  giftReceipt: z.boolean().optional(),
  channel: z.enum(['PRINT', 'PDF', 'EMAIL']).optional(),
});

// --- Payout -----------------------------------------------------------------

export const createPayoutSchema = z.object({
  shiftId: z.string().uuid(),
  cashierUserId: z.string().min(1),
  categoryId: z.string().min(1),
  amount: z.number().positive().multipleOf(0.01),
  note: z.string().max(500).optional(),
});

// --- Register ---------------------------------------------------------------

export const createRegisterSchema = z.object({
  storeId: z.number().int().positive(),
  code: z.string().min(1).max(20),
  label: z.string().min(1).max(100),
  drawerKind: z.enum(DRAWER_KINDS).optional(),
  drawerConfig: z.record(z.any()).optional(),
});

export const updateRegisterSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  drawerKind: z.enum(DRAWER_KINDS).optional(),
  drawerConfig: z.record(z.any()).nullable().optional(),
  active: z.boolean().optional(),
});

// --- Sales Password --------------------------------------------------------

export const setPasswordSchema = z.object({
  plain: z.string().min(4).max(100),
  updatedByUserId: z.string().min(1),
});

export const verifyPasswordSchema = z.object({
  plain: z.string().min(1).max(100),
});

// --- Report query schemas ---------------------------------------------------

export const dateRangeQuerySchema = z.object({
  storeId: z.coerce.number().int().positive().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  posted: z.enum(POSTED_FILTER).optional(),
});

export const salesTaxRecapQuerySchema = dateRangeQuerySchema.extend({
  source: z.enum(['TOTALS', 'LINES']).optional(),
});

export const salesByDayQuerySchema = dateRangeQuerySchema.extend({
  compareMode: z.enum(['52W', 'NDAYS', 'NWEEKS', 'NONE']).optional(),
  compareValue: z.coerce.number().int().optional(),
});

export const returnedSalesQuerySchema = dateRangeQuerySchema.extend({
  sort: z.enum(['SKU', 'CASHIER', 'SALESPERSON', 'RETURN_CODE']).optional(),
  trackableOnly: z.coerce.boolean().optional(),
});

export const reprintPostedSalesQuerySchema = dateRangeQuerySchema.extend({
  specialOnly: z.coerce.boolean().optional(),
});
