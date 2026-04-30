import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const DEPARTMENTS = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT'] as const;

// Shared extended attribute fields (all optional/nullable FK IDs)
const extendedSkuFields = {
  cost: z.number().nonnegative().multipleOf(0.01).optional().nullable(),
  vendorSku: z.string().max(100).optional().nullable(),
  comment: z.string().max(1000).optional().nullable(),
  keywords: z.string().max(500).optional().nullable(),
  season: z.string().max(100).optional().nullable(),
  manufacturer: z.string().max(200).optional().nullable(),
  pictureUrl: z.string().max(500).optional().nullable(),
  brandId: z.number().int().positive().optional().nullable(),
  colorId: z.number().int().positive().optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  heelMaterialId: z.number().int().positive().optional().nullable(),
  shoeTypeId: z.number().int().positive().optional().nullable(),
  heelShapeId: z.number().int().positive().optional().nullable(),
  heelHeightId: z.number().int().positive().optional().nullable(),
  toeShapeId: z.number().int().positive().optional().nullable(),
  closureTypeId: z.number().int().positive().optional().nullable(),
  upperMaterialId: z.number().int().positive().optional().nullable(),
  outsoleMaterialId: z.number().int().positive().optional().nullable(),
  finishId: z.number().int().positive().optional().nullable(),
  widthTypeId: z.number().int().positive().optional().nullable(),
  patternId: z.number().int().positive().optional().nullable(),
  occasionId: z.number().int().positive().optional().nullable(),
  targetAudienceId: z.number().int().positive().optional().nullable(),
  accessoryId: z.number().int().positive().optional().nullable(),
  seasonId: z.number().int().positive().optional().nullable(),
  sizeTypeId: z.number().int().positive().optional().nullable(),
  labelTypeId: z.number().int().positive().optional().nullable(),
};

export const createSkuSchema = z.object({
  style: z.string().min(1).max(100),
  price: z.number().positive().multipleOf(0.01),
  department: z.enum(DEPARTMENTS),
  vendorId: z.string().uuid(),
  skuCode: z.string().max(100).optional().nullable(),
  barcode: z.string().optional().nullable(),
  ricsDescription: z.string().max(500).optional().nullable(),
  webDescription: z.string().max(1000).optional().nullable(),
  heelType: z.string().max(100).optional().nullable(),
  heelTypeCode: z.string().max(40).optional().nullable(),
  material: z.string().max(100).optional().nullable(),
  heelMaterialTypeCode: z.string().max(40).optional().nullable(),
  active: z.boolean().optional().default(true),
  sizes: z.array(z.string().min(1)).optional(),
  ...extendedSkuFields,
  // Override: categoryId is NOT NULL in the database, so it must be required on creation
  categoryId: z.number().int().positive({ message: 'categoryId is required' }),
});

export const updateSkuSchema = z.object({
  skuCode: z.undefined({ message: 'skuCode is auto-generated and cannot be modified' }),
  style: z.string().min(1).max(100).optional(),
  price: z.number().positive().multipleOf(0.01).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  vendorId: z.string().uuid().optional(),
  barcode: z.string().optional().nullable(),
  ricsDescription: z.string().max(500).optional().nullable(),
  webDescription: z.string().max(1000).optional().nullable(),
  heelType: z.string().max(100).optional().nullable(),
  heelTypeCode: z.string().max(40).optional().nullable(),
  material: z.string().max(100).optional().nullable(),
  heelMaterialTypeCode: z.string().max(40).optional().nullable(),
  active: z.boolean().optional(),
  sizes: z.array(z.string().min(1)).optional(),
  ...extendedSkuFields,
});

export const skuListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['style', 'price', 'createdAt']).default('style'),
  order: z.enum(['asc', 'desc']).default('asc'),
  brandId: z.coerce.number().int().positive().optional(),
  department: z.enum(DEPARTMENTS).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  vendorId: z.string().uuid().optional(),
  active: z.preprocess((v) => {
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  }, z.boolean().optional()),
  q: z.string().optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
});

export const stockAdjustmentSchema = z.object({
  adjustment: z.number().int().refine((v) => v !== 0, { message: 'Adjustment cannot be zero' }),
  reason: z.string().min(1).max(500),
  performedBy: z.string().max(100).optional(),
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['createdAt', 'adjustment']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const SOURCE_DOCUMENT_REF_TYPES = [
  'PURCHASE_ORDER_RECEIPT', 'TRANSFER_ORDER', 'STOCK_ADJUSTMENT',
  'INITIAL_IMPORT', 'SYSTEM_RECONCILIATION',
] as const;

/** Base mutation schema — idempotencyKey is optional (used by adjust). */
const inventoryMutationBaseSchema = z.object({
  skuId: z.string().uuid(),
  quantityDelta: z.number().int().refine((v) => v !== 0, { message: 'quantityDelta cannot be zero' }),
  reasonCode: z.string().min(1).max(200),
  categoryCode: z.number().int(),
  sourceDocumentRef: z.object({
    type: z.enum(SOURCE_DOCUMENT_REF_TYPES),
    id: z.string().min(1),
  }),
  actorId: z.string().uuid(),
  occurredAt: z.string().optional(),
  idempotencyKey: z.string().max(255).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

/** Adjust endpoint — idempotencyKey optional. */
export const inventoryMutationSchema = inventoryMutationBaseSchema;

/** Receive/Transfer endpoints — idempotencyKey required per CTO policy (ZAI-168). */
export const inventoryMutationRequireIdempotencySchema = inventoryMutationBaseSchema.extend({
  idempotencyKey: z.string().min(1).max(255),
});

export const onHandSkuQuerySchema = z.object({
  brandId: z.coerce.number().int().positive().optional(),
  style: z.string().min(1).max(100).optional(),
  colorId: z.coerce.number().int().positive().optional(),
  sizeId: z.coerce.number().int().positive().optional(),
});

const PAYMENT_TERMS = ['NET_30', 'NET_60', 'NET_90'] as const;

export const createVendorSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email(),
  phone: z.string().max(50).optional().nullable(),
  paymentTerms: z.enum(PAYMENT_TERMS),
  leadTimeDays: z.number().int().min(0),
});

export const updateVendorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contactEmail: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  paymentTerms: z.enum(PAYMENT_TERMS).optional().nullable(),
  leadTimeDays: z.number().int().min(0).optional().nullable(),
  active: z.boolean().optional(),
});

// ── Purchase Order schemas ──────────────────────────────────────────

const PO_STATUSES = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'] as const;
const PO_SOURCE_CURRENCIES = ['CNY', 'USD', 'HNL'] as const;
const PO_COST_BASES = ['LANDED_LEGACY_HNL', 'HNL_DOMESTIC', 'VENDOR_CURRENCY_ESTIMATED_LANDED'] as const;
const PO_INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'] as const;

/** Reusable cent-precision refinement for currency fields (max 2 decimal places). */
function centPrecision(val: number): boolean {
  const parts = val.toString().split('.');
  return !parts[1] || parts[1].length <= 2;
}
const CENT_PRECISION_MSG = 'INVALID_CURRENCY_PRECISION: Value must have at most 2 decimal places';

const lineItemSchema = z.object({
  skuId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitCost: z.number().positive().refine(centPrecision, { message: CENT_PRECISION_MSG }),
  sourceUnitCost: z.number().nonnegative().optional().nullable(),
  commercialUnitCostHnl: z.number().nonnegative().optional().nullable(),
  estimatedLandedUnitCostHnl: z.number().nonnegative().optional().nullable(),
  casePackId: z.string().trim().max(6).optional().nullable(),
  casePackMultiplier: z.number().int().positive().optional().nullable(),
  sizeCells: z.array(z.object({
    columnLabel: z.string().max(40).optional().default(''),
    rowLabel: z.string().max(40).optional().default(''),
    quantity: z.number().int().positive(),
  })).optional(),
});

export const createPurchaseOrderSchema = z.object({
  poNumber: z.string().trim().min(1).max(32).optional().nullable(),
  billToStoreId: z.number().int().positive().optional().nullable(),
  shipToStoreId: z.number().int().positive().optional().nullable(),
  vendorId: z.string().trim().min(1).max(4),
  buyer: z.string().trim().min(1).max(120).optional().nullable(),
  sourceCurrency: z.enum(PO_SOURCE_CURRENCIES).optional(),
  fxRate: z.number().positive().optional(),
  fxDate: z.string().optional().nullable(),
  incotermCode: z.enum(PO_INCOTERMS).optional().nullable(),
  incotermPlace: z.string().trim().max(200).optional().nullable(),
  costBasis: z.enum(PO_COST_BASES).optional(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  notes: z.string().max(1000).optional().nullable(),
  orderType: z.enum(['RO', 'RE', 'SA']).optional(),
  classification: z.enum(['AT_ONCE', 'FUTURE']).optional(),
  confirmationNumber: z.string().max(120).optional().nullable(),
  accountNumber: z.string().max(120).optional().nullable(),
  terms: z.string().max(120).optional().nullable(),
  shipVia: z.string().max(120).optional().nullable(),
  backorderAllowed: z.boolean().optional(),
  splitShipment: z.boolean().optional(),
  programCode: z.string().max(120).optional().nullable(),
  storeLabelsOnReceive: z.boolean().optional(),
  orderDate: z.string().datetime().optional().nullable(),
  shipDate: z.string().datetime().optional().nullable(),
  plannedReceiptDate: z.string().datetime().optional().nullable(),
  cancelDate: z.string().datetime().optional().nullable(),
  paymentDate: z.string().datetime().optional().nullable(),
});

export const updatePurchaseOrderSchema = z.object({
  poNumber: z.string().trim().min(1).max(32).optional().nullable(),
  vendorId: z.string().trim().min(1).max(4).optional(),
  buyer: z.string().trim().min(1).max(120).optional().nullable(),
  sourceCurrency: z.enum(PO_SOURCE_CURRENCIES).optional(),
  fxRate: z.number().positive().optional(),
  fxDate: z.string().optional().nullable(),
  incotermCode: z.enum(PO_INCOTERMS).optional().nullable(),
  incotermPlace: z.string().trim().max(200).optional().nullable(),
  costBasis: z.enum(PO_COST_BASES).optional(),
  notes: z.string().max(1000).optional().nullable(),
  billToStoreId: z.number().int().positive().optional().nullable(),
  shipToStoreId: z.number().int().positive().optional().nullable(),
  orderType: z.enum(['RO', 'RE', 'SA']).optional(),
  classification: z.enum(['AT_ONCE', 'FUTURE']).optional(),
  confirmationNumber: z.string().max(120).optional().nullable(),
  accountNumber: z.string().max(120).optional().nullable(),
  terms: z.string().max(120).optional().nullable(),
  shipVia: z.string().max(120).optional().nullable(),
  backorderAllowed: z.boolean().optional(),
  splitShipment: z.boolean().optional(),
  programCode: z.string().max(120).optional().nullable(),
  storeLabelsOnReceive: z.boolean().optional(),
  orderDate: z.string().datetime().optional().nullable(),
  shipDate: z.string().datetime().optional().nullable(),
  plannedReceiptDate: z.string().datetime().optional().nullable(),
  cancelDate: z.string().datetime().optional().nullable(),
  paymentDate: z.string().datetime().optional().nullable(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required').optional(),
});

export const poStatusTransitionSchema = z.object({
  status: z.enum(['SUBMITTED', 'CONFIRMED', 'CLOSED', 'CANCELLED']),
  reason: z.string().max(500).optional(),
});

export const poReceiveSchema = z.object({
  lines: z.array(
    z.object({
      lineId: z.string().uuid(),
      quantityReceived: z.number().int().refine((value) => value !== 0, { message: 'Quantity cannot be zero' }),
      discrepancyReason: z.string().min(1).max(500).optional().nullable(),
      auditReference: z.string().min(1).max(255).optional().nullable(),
    })
  ).min(1, 'At least one line is required'),
  locationId: z.string().max(100).optional(),
  receivedBy: z.string().max(100).optional(),
  referenceNumber: z.string().max(120).optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  freightEach: z.coerce.number().nonnegative().refine(centPrecision, { message: CENT_PRECISION_MSG }).optional().default(0),
  idempotencyKey: z.string().min(1).max(255).optional(),
  reason: z.string().max(500).optional(),
});

export const duplicatePurchaseOrderSchema = z.object({
  poNumber: z.string().trim().min(1).max(32).optional(),
  billToStoreId: z.number().int().positive().optional().nullable(),
  shipToStoreId: z.number().int().positive().optional().nullable(),
  orderDate: z.string().datetime().optional().nullable(),
  shipDate: z.string().datetime().optional().nullable(),
  plannedReceiptDate: z.string().datetime().optional().nullable(),
  cancelDate: z.string().datetime().optional().nullable(),
  paymentDate: z.string().datetime().optional().nullable(),
  storeLabelsOnReceive: z.boolean().optional(),
  changedBy: z.string().max(100).optional(),
});

export const replicatePurchaseOrderSchema = z.object({
  prefix: z.string().trim().min(1).max(5),
  shipToStoreIds: z.array(z.number().int().positive()).min(1).max(200),
  changedBy: z.string().max(100).optional(),
});

export const combinePurchaseOrdersSchema = z.object({
  sourcePoId: z.string().uuid().optional(),
  sourcePoIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  intoPoId: z.string().uuid(),
  changedBy: z.string().max(100).optional(),
}).refine((value) => value.sourcePoId || (value.sourcePoIds && value.sourcePoIds.length > 0), {
  message: 'sourcePoId or sourcePoIds is required',
  path: ['sourcePoIds'],
});

export const poReceiveFullSchema = z.object({
  locationId: z.string().max(100).optional(),
  receivedBy: z.string().max(100).optional(),
  referenceNumber: z.string().max(120).optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  freightEach: z.coerce.number().nonnegative().refine(centPrecision, { message: CENT_PRECISION_MSG }).optional().default(0),
  idempotencyKey: z.string().min(1).max(255).optional(),
  changedBy: z.string().max(100).optional(),
});

export const poSubmitSchema = z.object({
  force: z.boolean().optional().default(false),
  changedBy: z.string().max(100).optional(),
  overrideReasonCode: z.string().max(120).optional(),
  approverIds: z.array(z.string().max(120)).max(20).optional(),
  ceoExceptionApprovalId: z.string().max(120).optional(),
  policySource: z.enum(['default', 'configured']).optional(),
  warningThresholdPct: z.number().min(0).max(200).optional(),
  hardStopThresholdPct: z.number().min(0).max(200).optional(),
  traceId: z.string().max(120).optional(),
});

export const poCancelSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

export const poListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['poNumber', 'status', 'createdAt', 'updatedAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  status: z.enum(PO_STATUSES).optional(),
  vendorId: z.string().trim().min(1).max(4).optional(),
  buyer: z.string().trim().min(1).max(120).optional(),
  q: z.string().optional(),
});

export const vendorListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['name', 'createdAt', 'leadTimeDays']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  active: z.preprocess((v) => {
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  }, z.boolean().optional()),
  q: z.string().optional(),
});

// ── OTB Budget schemas ─────────────────────────────────────────────

export const createOtbBudgetSchema = z.object({
  department: z.enum(DEPARTMENTS),
  year: z.number().int().min(2020).max(2099),
  month: z.number().int().min(1).max(12),
  plannedBudget: z.number().nonnegative().refine(centPrecision, { message: CENT_PRECISION_MSG }),
  notes: z.string().max(1000).optional().nullable(),
  createdBy: z.string().max(100).optional(),
});

export const updateOtbBudgetSchema = z.object({
  plannedBudget: z.number().nonnegative().refine(centPrecision, { message: CENT_PRECISION_MSG }).optional(),
  notes: z.string().max(1000).optional().nullable(),
  changedBy: z.string().max(100).optional(),
});

export const otbBudgetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['department', 'year', 'month', 'plannedBudget', 'createdAt']).default('year'),
  order: z.enum(['asc', 'desc']).default('desc'),
  department: z.enum(DEPARTMENTS).optional(),
  year: z.coerce.number().int().min(2020).max(2099).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const otbSummaryQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2099),
  month: z.coerce.number().int().min(1).max(12).optional(),
  department: z.enum(DEPARTMENTS).optional(),
});

// ── OTB Plan Row schemas (Ch. 11 p. 158) ──────────────────────────

const monthlyArraySchema = z.array(z.number().nullable()).length(12, {
  message: 'Monthly arrays must have exactly 12 entries (Jan–Dec of fiscal year).',
});

const pctSchema = z.number().finite().optional().nullable();

export const createOtbPlanRowSchema = z.object({
  storeId: z.string().min(1).max(100),
  categoryId: z.string().min(1).max(100),
  fiscalYear: z.number().int().min(2020).max(2099),
  pctChangeLyToCy: pctSchema,
  pctChangeCyToNy: pctSchema,
  plannedTurnover1h: z.number().finite().optional().nullable(),
  plannedTurnover2h: z.number().finite().optional().nullable(),
  plannedGpPct: z.number().min(-100).max(100).optional().nullable(),
  lySales: monthlyArraySchema.optional(),
  plannedSales: monthlyArraySchema.optional(),
  markdownPct: monthlyArraySchema.optional(),
  createdBy: z.string().max(100).optional(),
});

export const updateOtbPlanRowSchema = z.object({
  pctChangeLyToCy: pctSchema,
  pctChangeCyToNy: pctSchema,
  plannedTurnover1h: z.number().finite().optional().nullable(),
  plannedTurnover2h: z.number().finite().optional().nullable(),
  plannedGpPct: z.number().min(-100).max(100).optional().nullable(),
  lySales: monthlyArraySchema.optional(),
  plannedSales: monthlyArraySchema.optional(),
  markdownPct: monthlyArraySchema.optional(),
  changedBy: z.string().max(100).optional(),
});

export const otbPlanRowListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  storeId: z.string().max(100).optional(),
  categoryId: z.string().max(100).optional(),
  fiscalYear: z.coerce.number().int().min(2020).max(2099).optional(),
});

export const otbPlanRowCopySchema = z.object({
  targetStoreId: z.string().min(1).max(100),
  targetCategoryId: z.string().min(1).max(100),
  changedBy: z.string().max(100).optional(),
});

export const otbPlanRowRecalcSchema = z.object({
  changedBy: z.string().max(100).optional(),
});

// ── Company Settings schemas ──────────────────────────────────────

export const otbEntryMethodSchema = z.object({
  value: z.enum(['CHANGE_OVER_LAST_YEAR', 'FIXED_MONTHLY_MIX']),
  changedBy: z.string().max(100).optional(),
});

// ── Inventory Manual Receipt schemas ──────────────────────────────────────────

export const manualReceiptContextQuerySchema = z.object({
  storeId: z.coerce.number().int().min(0),
  skuCode: z.string().trim().min(1).optional(),
  upc: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.skuCode && !value.upc) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['skuCode'],
      message: 'Exactly one of skuCode or upc is required',
    });
  }
  if (value.skuCode && value.upc) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['skuCode'],
      message: 'Provide either skuCode or upc, not both',
    });
  }
});

const manualReceiptLineSchema = z.object({
  columnLabel: z.string().max(32).optional().default(''),
  rowLabel: z.string().max(32).optional().default(''),
  quantity: z.number().int().positive(),
});

export const createManualReceiptSchema = z.object({
  storeId: z.number().int().min(0),
  skuId: z.string().uuid(),
  referenceNumber: z.string().max(120).optional().nullable(),
  storeLabelsOnReceive: z.boolean().optional().default(false),
  movementAt: z.string().optional().nullable(),
  performedBy: z.string().max(100).optional().nullable(),
  unitCostOverride: z.coerce.number().nonnegative().refine(centPrecision, { message: CENT_PRECISION_MSG }).optional().nullable(),
  retailPriceOverride: z.coerce.number().nonnegative().refine(centPrecision, { message: CENT_PRECISION_MSG }).optional().nullable(),
  casePackId: z.string().max(120).optional().nullable(),
  casePackMultiplier: z.coerce.number().int().min(1).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  idempotencyKey: z.string().min(1).max(255).optional().nullable(),
  lines: z.array(manualReceiptLineSchema).min(1, 'At least one line is required'),
});

export const manualReceiptListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(['movementAt', 'createdAt']).default('movementAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  storeId: z.coerce.number().int().min(0).optional(),
  skuId: z.string().uuid().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

// ── Inventory Adjustment schemas ──────────────────────────────────

const replenishmentTargetCellSchema = z.object({
  columnLabel: z.string().max(32).optional().default(''),
  rowLabel: z.string().max(32).optional().default(''),
  modelQty: z.coerce.number().int().min(0).optional().nullable(),
  maxQty: z.coerce.number().int().min(0).optional().nullable(),
  reorderQty: z.coerce.number().int().min(0).optional().nullable(),
});

export const updateReplenishmentTargetSchema = z.object({
  cells: z.array(replenishmentTargetCellSchema).min(1, 'At least one cell is required'),
  additionalStoreIds: z.array(z.coerce.number().int().min(0)).optional(),
  updatedBy: z.string().max(100).optional().nullable(),
});

const ADJUSTMENT_TYPES = ['RECEIPT', 'TRANSFER', 'MANUAL_ADJUST', 'RETURN', 'DAMAGE', 'SHRINKAGE'] as const;

export const createAdjustmentSchema = z.object({
  type: z.enum(ADJUSTMENT_TYPES),
  fromLocationId: z.string().optional().nullable(),
  toLocationId: z.string().optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
  lineItems: z.array(
    z.object({
      skuId: z.string().uuid(),
      quantity: z.number().int().refine((v) => v !== 0, { message: 'Quantity cannot be zero' }),
    })
  ).min(1, 'At least one line item is required'),
  createdBy: z.string().max(100).optional(),
});

export const adjustmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(['type', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  type: z.enum(ADJUSTMENT_TYPES).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

// ── Inventory list (cursor pagination) schemas ───────────────────

const INVENTORY_LIST_SORT_FIELDS = ['quantityOnHand', 'updatedAt', 'skuCode', 'department'] as const;

export const inventoryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  sort: z.enum(INVENTORY_LIST_SORT_FIELDS).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  department: z.enum(DEPARTMENTS).optional(),
  brandId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  active: z.preprocess((v) => {
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  }, z.boolean().optional()),
  q: z.string().optional(),
});

// ── Movement timeline / reconciliation schemas (ZAI-357) ─────────

const MOVEMENT_TYPES = ['sale', 'po_receipt', 'transfer_in', 'transfer_out', 'adjustment'] as const;

export const movementTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  sort: z.enum(['movementAt', 'quantityDelta']).default('movementAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  skuId: z.string().uuid().optional(),
  locationId: z.string().optional(),
  movementType: z.enum(MOVEMENT_TYPES).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const movementReconciliationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  sort: z.enum(['expectedQuantityDelta', 'lastMovementAt', 'movementRowCount']).default('lastMovementAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  skuId: z.string().uuid().optional(),
  locationId: z.string().optional(),
});

// ── Dashboard schemas ─────────────────────────────────────────────

export const lowStockQuerySchema = z.object({
  threshold: z.coerce.number().int().min(0).default(10),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(['currentStock', 'skuCode', 'department', 'style']).default('currentStock'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// ── Customer (crm) schemas ─────────────────────────────────────────

const FAMILY_GENDERS = ['M', 'F', 'C'] as const;

export const createCustomerSchema = z.object({
  accountNumber: z.string().min(1).max(15).optional(),
  phoneE164: z.string().max(20).optional().nullable(),
  firstName: z.string().max(50).optional().nullable(),
  lastName: z.string().max(50).optional().nullable(),
  displayName: z.string().max(100).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  stateRegion: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  creditLimit: z.number().nonnegative().optional().nullable(),
  alertFlag: z.boolean().optional(),
  alertMessage: z.string().max(500).optional().nullable(),
  comments: z.string().max(2000).optional().nullable(),
  extraFields: z.record(z.unknown()).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
});

export const updateCustomerSchema = z.object({
  accountNumber: z.string().min(1).max(15).optional(),
  phoneE164: z.string().max(20).optional().nullable(),
  firstName: z.string().max(50).optional().nullable(),
  lastName: z.string().max(50).optional().nullable(),
  displayName: z.string().max(100).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  stateRegion: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  creditLimit: z.number().nonnegative().optional().nullable(),
  alertFlag: z.boolean().optional(),
  alertMessage: z.string().max(500).optional().nullable(),
  comments: z.string().max(2000).optional().nullable(),
  extraFields: z.record(z.unknown()).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['displayName', 'accountNumber', 'dateAdded', 'dateOfLastPurchase', 'ytdSalesCents']).default('displayName'),
  order: z.enum(['asc', 'desc']).default('asc'),
  active: z.preprocess((v) => {
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  }, z.boolean().optional()),
  q: z.string().optional(),
});

export const customerSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const customerMetricsBulkRecomputeSchema = z.object({
  batch_size: z.coerce.number().int().min(1).max(5000).default(1000),
});

export const createFamilyMemberSchema = z.object({
  code: z.string().min(1).max(2),
  firstName: z.string().max(50).optional().nullable(),
  lastName: z.string().max(50).optional().nullable(),
  gender: z.enum(FAMILY_GENDERS).optional().nullable(),
  birthday: z.string().optional().nullable(),
  comments: z.string().max(2000).optional().nullable(),
  alertFlag: z.boolean().optional(),
  alertMessage: z.string().max(500).optional().nullable(),
  extraFields: z.record(z.unknown()).optional().nullable(),
});

export const updateFamilyMemberSchema = createFamilyMemberSchema.partial();

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const hasCurrencyPrecisionError = result.error.errors.some(
        (e) => e.message.startsWith('INVALID_CURRENCY_PRECISION')
      );
      if (hasCurrencyPrecisionError) {
        res.status(400).json({
          error: {
            code: 'INVALID_CURRENCY_PRECISION',
            message: 'Currency values must have at most 2 decimal places (cent precision).',
            fields: result.error.errors
              .filter((e) => e.message.startsWith('INVALID_CURRENCY_PRECISION'))
              .map((e) => e.path.join('.')),
          },
        });
        return;
      }
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        },
      });
      return;
    }
    (req as any).validatedQuery = result.data;
    next();
  };
}

export const manualReturnContextQuerySchema = z.object({
  storeId: z.coerce.number().int().min(0),
  skuCode: z.string().trim().min(1).optional(),
  upc: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.skuCode && !value.upc) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['skuCode'],
      message: 'Exactly one of skuCode or upc is required',
    });
  }
  if (value.skuCode && value.upc) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['skuCode'],
      message: 'Provide either skuCode or upc, not both',
    });
  }
});

const manualReturnLineSchema = z.object({
  columnLabel: z.string().max(32).optional().default(''),
  rowLabel: z.string().max(32).optional().default(''),
  quantity: z.number().int().positive(),
});

export const createManualReturnSchema = z.object({
  storeId: z.number().int().min(0),
  skuId: z.string().uuid(),
  returnReasonCode: z.string().max(120).optional().nullable(),
  rmaNumber: z.string().max(120).optional().nullable(),
  movementAt: z.string().optional().nullable(),
  performedBy: z.string().max(100).optional().nullable(),
  unitCostOverride: z.coerce.number().nonnegative().refine(centPrecision, { message: CENT_PRECISION_MSG }).optional().nullable(),
  casePackId: z.string().max(120).optional().nullable(),
  casePackMultiplier: z.coerce.number().int().min(1).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  idempotencyKey: z.string().min(1).max(255).optional().nullable(),
  lines: z.array(manualReturnLineSchema).min(1, 'At least one line is required'),
});

export const manualReturnListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.enum(['movementAt', 'createdAt']).default('movementAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  storeId: z.coerce.number().int().min(0).optional(),
  skuId: z.string().uuid().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

const transferCriteriaSchema = z.object({
  vendorCodes: z.array(z.string().trim().min(1)).optional().default([]),
  categoryMin: z.coerce.number().int().min(0).optional().nullable(),
  categoryMax: z.coerce.number().int().min(0).optional().nullable(),
  seasons: z.array(z.string().trim().min(1)).optional().default([]),
  groupCodes: z.array(z.string().trim().min(1)).optional().default([]),
  keywords: z.array(z.string().trim().min(1)).optional().default([]),
  skuCodes: z.array(z.string().trim().min(1)).optional().default([]),
  limit: z.coerce.number().int().min(1).optional(),
});

export const createAutoTransferRunSchema = z.object({
  warehouseStoreId: z.coerce.number().int().min(0),
  targetStoreIds: z.array(z.coerce.number().int().min(0)).min(1, 'At least one target store is required'),
  sortOrder: z.enum(['SKU', 'VENDOR', 'CATEGORY', 'LOCATION']).default('SKU'),
  inTransitPos: z.boolean().optional().default(false),
  criteria: transferCriteriaSchema.optional().default({}),
});

export const createBalancingTransferRunSchema = z.object({
  algorithmMode: z.enum(['APP_LEGACY', 'RICS_MIMIC']).optional().default('APP_LEGACY'),
  balancingMethod: z.enum(['OVER_UNDER_MODELS', 'WITHOUT_MODELS', 'WITHOUT_CONSIDERING_MODELS']),
  performanceMetric: z.enum(['ROI', 'TURNS', 'SELL_THRU']),
  salesPeriod: z.enum(['MONTH', 'SEASON', 'YEAR']),
  sortOrder: z.enum(['SKU', 'VENDOR', 'CATEGORY']).optional().default('SKU'),
  tieBreakKind: z.enum(['ABSOLUTE', 'PERCENT']),
  tieBreakValue: z.coerce.number().nonnegative(),
  transferDoublesToLowerPriority: z.boolean().optional().default(false),
  stripStoresBelowSizeCount: z.coerce.number().int().min(1).optional().nullable(),
  inTransitPos: z.boolean().optional().default(false),
  criteria: transferCriteriaSchema.extend({
    storeIds: z.array(z.coerce.number().int().min(0)).optional().default([]),
    ricsStoreSelection: z.string().trim().max(500).optional().nullable(),
    ricsCategorySelection: z.string().trim().max(500).optional().nullable(),
    ricsSeasonSelection: z.string().trim().max(500).optional().nullable(),
    ricsKeywordExclusions: z.string().trim().max(500).optional().nullable(),
    styleColors: z.array(z.string().trim().min(1)).optional().default([]),
    includeOriginalRetailOnly: z.boolean().optional().default(false),
    includeMarkdownOnly: z.boolean().optional().default(false),
    includePerksOnly: z.boolean().optional().default(false),
  }).optional().default({}),
}).superRefine((value, ctx) => {
  if (value.criteria.includeOriginalRetailOnly && value.criteria.includeMarkdownOnly) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['criteria', 'includeOriginalRetailOnly'],
      message: 'Select either original retail only or markdown only, not both',
    });
  }
});

export const createBalancingTransferRunV2Schema = z.object({
  goalPreset: z.enum(['DAILY_RESCUE', 'WEEKLY_BALANCE', 'SEASONAL_CONSOLIDATION']).optional().default('WEEKLY_BALANCE'),
  balancingMethod: z.enum(['OVER_UNDER_MODELS', 'WITHOUT_MODELS', 'WITHOUT_CONSIDERING_MODELS']),
  performanceMetric: z.enum(['ROI', 'TURNS', 'SELL_THRU']),
  salesPeriod: z.enum(['MONTH', 'SEASON', 'YEAR']),
  sortOrder: z.enum(['SKU', 'VENDOR', 'CATEGORY']).optional().default('SKU'),
  tieBreakKind: z.enum(['ABSOLUTE', 'PERCENT']),
  tieBreakValue: z.coerce.number().nonnegative(),
  transferDoublesToLowerPriority: z.boolean().optional().default(false),
  stripStoresBelowSizeCount: z.coerce.number().int().min(1).optional().nullable(),
  inTransitPos: z.boolean().optional().default(false),
  allowLowConfidenceMoves: z.boolean().optional().default(false),
  cooldownDays: z.coerce.number().int().min(0).optional().default(14),
  protectDaysOverride: z.coerce.number().int().min(1).optional().nullable(),
  criteria: transferCriteriaSchema.extend({
    storeIds: z.array(z.coerce.number().int().min(0)).optional().default([]),
    styleColors: z.array(z.string().trim().min(1)).optional().default([]),
    includeOriginalRetailOnly: z.boolean().optional().default(false),
    includeMarkdownOnly: z.boolean().optional().default(false),
    includePerksOnly: z.boolean().optional().default(false),
  }).optional().default({}),
}).superRefine((value, ctx) => {
  if (value.criteria.includeOriginalRetailOnly && value.criteria.includeMarkdownOnly) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['criteria', 'includeOriginalRetailOnly'],
      message: 'Select either original retail only or markdown only, not both',
    });
  }
});
