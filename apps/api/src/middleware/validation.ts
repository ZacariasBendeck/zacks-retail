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
  material: z.string().max(100).optional().nullable(),
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
  material: z.string().max(100).optional().nullable(),
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
});

const PAYMENT_TERMS = ['NET_30', 'NET_60', 'NET_90'] as const;

export const createVendorSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  paymentTerms: z.enum(PAYMENT_TERMS).optional().nullable(),
  leadTimeDays: z.number().int().min(0).optional().nullable(),
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

const lineItemSchema = z.object({
  skuId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitCost: z.number().positive(),
});

export const createPurchaseOrderSchema = z.object({
  vendorId: z.string().uuid(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  notes: z.string().max(1000).optional().nullable(),
});

export const updatePurchaseOrderSchema = z.object({
  notes: z.string().max(1000).optional().nullable(),
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
      quantityReceived: z.number().int().positive(),
    })
  ).min(1, 'At least one line is required'),
});

export const poSubmitSchema = z.object({
  force: z.boolean().optional().default(false),
  changedBy: z.string().max(100).optional(),
});

export const poCancelSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

export const poListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(PO_STATUSES).optional(),
  vendorId: z.string().uuid().optional(),
  q: z.string().optional(),
});

export const vendorListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
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
  plannedBudget: z.number().nonnegative(),
  notes: z.string().max(1000).optional().nullable(),
  createdBy: z.string().max(100).optional(),
});

export const updateOtbBudgetSchema = z.object({
  plannedBudget: z.number().nonnegative().optional(),
  notes: z.string().max(1000).optional().nullable(),
  changedBy: z.string().max(100).optional(),
});

export const otbBudgetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  department: z.enum(DEPARTMENTS).optional(),
  year: z.coerce.number().int().min(2020).max(2099).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const otbSummaryQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2099),
  month: z.coerce.number().int().min(1).max(12).optional(),
  department: z.enum(DEPARTMENTS).optional(),
});

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
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
