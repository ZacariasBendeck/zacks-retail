/**
 * Purchase Planning — read-only forecast-driven replenishment plan.
 *
 * Mounted under /api/v1/purchase-planning.
 *
 * Spec: docs/modules/purchase-planning.md
 */

import { Router, Request, Response, NextFunction, IRouter } from 'express';
import { z } from 'zod';
import { computePurchasePlan } from '../services/purchasePlanning/purchasePlanningFacade';
import {
  addPurchasePlanAdjustment,
  archivePurchasePlan,
  comparePurchasePlan,
  createPurchasePlan,
  generateSeasonalPurchaseReport,
  getPurchasePlan,
  isPurchasePlanningServiceError,
  listPurchasePlans,
  recalculatePurchasePlan,
  updatePurchasePlanRow,
  updatePurchasePlanRows,
} from '../services/purchasePlanning/purchasePlanningSavedService';
import {
  archivePurchasePlanV3,
  createPurchasePlanV3,
  generatePurchasePlanV3Report,
  getPurchasePlanV3,
  isPurchasePlanningV3ServiceError,
  listPurchasePlansV3,
} from '../services/purchasePlanning/purchasePlanningV3Service';
import {
  addCarryoverLine,
  addPlannedStyle,
  archiveBuyerWorkbook,
  bulkUpdateStoreCategoryCarrying,
  createModelLineFromCandidate,
  copySeedModel,
  confirmBuyerSalesProjectionWorkbook,
  createBuyerWorkbook,
  deletePlannedStyle,
  ensureBuyerSalesProjectionWorkbook,
  flagCandidateUnavailable,
  flagCarryoverUnavailable,
  getBuyerWorkbook,
  isBuyerWorkbookServiceError,
  linkPurchaseOrder,
  listBuyerChecklistCategories,
  listCarryoverCandidates,
  listBuyerWorkbooks,
  listStoreCategoryCarrying,
  markBuyerChecklistCategoriesNoBudget,
  markBuyerChecklistCategoryNoBudget,
  reopenBuyerChecklistCategoriesBudget,
  reopenBuyerChecklistCategoryBudget,
  unlinkPurchaseOrder,
  updateAttributePlan,
  updateBuyerCategoryCard,
  updateCarryoverCandidate,
  updateCarryoverLine,
  updateNewStyleTargets,
  updatePlannedStyle,
} from '../services/purchasePlanning/buyerWorkbookService';

const router: IRouter = Router();

const savedForecastMethodSchema = z.enum([
  'holtWinters',
  'sameMonthLastYear',
  'trailingAverage',
  'yoyGrowth',
  'blendedMultiYear',
  'constrainedDemand',
]);

const forecastMethodSchema = z.enum([
  'holtWinters',
  'sameMonthLastYear',
  'trailingAverage',
  'yoyGrowth',
  'blendedMultiYear',
  'constrainedDemand',
]);

const forecastSchema = z
  .object({
    method: forecastMethodSchema,
    trailingMonths: z.number().int().min(1).max(24).optional(),
    growthPct: z.number().min(-99).max(500).optional(),
    yearsToBlend: z.union([z.literal(2), z.literal(3)]).optional(),
  })
  .strict();

const savedPlanCreateSchema = z
  .object({
    planningScope: z.enum(['store_group', 'enterprise']).optional(),
    planningDimension: z.enum(['department', 'category']).optional(),
    storeGroupCode: z.string().trim().min(1).max(64).optional(),
    season: z.enum(['spring', 'summer', 'fall', 'winter']),
    seasonYear: z.number().int().min(2020).max(2100),
    departmentNumbers: z.array(z.number().int().min(1).max(99)).max(99).optional(),
    categoryNumbers: z.array(z.number().int().min(1).max(9999)).max(500).optional(),
    label: z.string().trim().min(1).max(200).optional(),
    forecast: z.object({
      method: savedForecastMethodSchema.optional(),
      trailingMonths: z.number().int().min(1).max(24).optional(),
      growthPct: z.number().min(-99).max(500).optional(),
      yearsToBlend: z.union([z.literal(2), z.literal(3)]).optional(),
    }).strict().optional(),
    eohMethod: z.enum(['forward', 'seasonal']).optional(),
    coverMonths: z.number().int().min(1).max(12).optional(),
    discountNormalization: z.boolean().optional(),
    createdBy: z.string().trim().max(120).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const planningDimension = value.planningDimension ?? 'department';
    if ((value.planningScope ?? 'store_group') === 'store_group' && !value.storeGroupCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storeGroupCode'],
        message: 'Select a chain',
      });
    }
    if (planningDimension === 'department' && !(value.departmentNumbers?.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['departmentNumbers'],
        message: 'Select at least one department',
      });
    }
    if (planningDimension === 'category' && !(value.categoryNumbers?.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryNumbers'],
        message: 'Select at least one category',
      });
    }
  });

const savedPlanAdjustmentSchema = z
  .object({
    departmentKey: z.string().trim().min(1).max(32),
    kind: z.enum(['percent_lift', 'absolute_total']),
    value: z.number().min(-100).max(1_000_000),
    reason: z.string().trim().min(1).max(1000),
    appliedBy: z.string().trim().max(120).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === 'absolute_total' && value.value < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Absolute total must be non-negative',
      });
    }
  });

const savedPlanRowUpdateSchema = z
  .object({
    currentProjSales: z.number().int().min(0).max(1_000_000).optional(),
    currentEohTarget: z.number().int().min(0).max(1_000_000).optional(),
    currentBuy: z.number().int().min(0).max(1_000_000).optional(),
    reason: z.string().trim().min(1).max(1000),
    appliedBy: z.string().trim().max(120).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.currentProjSales == null
      && value.currentEohTarget == null
      && value.currentBuy == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentBuy'],
        message: 'Enter at least one monthly value',
      });
    }
  });

const savedPlanRowsUpdateSchema = z
  .object({
    rows: z.array(z.object({
      rowId: z.string().trim().min(1).max(64),
      currentProjSales: z.number().int().min(0).max(1_000_000).optional(),
      currentEohTarget: z.number().int().min(0).max(1_000_000).optional(),
      currentBuy: z.number().int().min(0).max(1_000_000).optional(),
    }).strict()
      .superRefine((value, ctx) => {
        if (
          value.currentProjSales == null
          && value.currentEohTarget == null
          && value.currentBuy == null
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['currentBuy'],
            message: 'Enter at least one monthly value',
          });
        }
      })).min(1).max(500),
    reason: z.string().trim().min(1).max(1000),
    appliedBy: z.string().trim().max(120).optional(),
  })
  .strict();

const actorSchema = z.object({
  actor: z.string().trim().max(120).optional(),
}).strict();

const savedPlanRecalculateSchema = z.object({
  actor: z.string().trim().max(120).optional(),
  forecast: z.object({
    method: savedForecastMethodSchema.optional(),
    trailingMonths: z.number().int().min(1).max(24).optional(),
    growthPct: z.number().min(-99).max(500).optional(),
    yearsToBlend: z.union([z.literal(2), z.literal(3)]).optional(),
  }).strict().optional(),
  mode: z.enum(['overwrite', 'preserve_user']).optional(),
}).strict();

const seasonalReportSchema = z
  .object({
    departmentNumber: z.number().int().min(1).max(99),
    asOfYearMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'asOfYearMonth must be YYYY-MM')
      .optional(),
    forecast: z.object({
      method: savedForecastMethodSchema.optional(),
      trailingMonths: z.number().int().min(1).max(24).optional(),
      growthPct: z.number().min(-99).max(500).optional(),
      yearsToBlend: z.union([z.literal(2), z.literal(3)]).optional(),
    }).strict().optional(),
    eohMethod: z.enum(['forward', 'seasonal']).optional(),
    coverMonths: z.number().int().min(1).max(12).optional(),
    discountNormalization: z.boolean().optional(),
    createdBy: z.string().trim().max(120).optional(),
  })
  .strict();

function sendZodError(res: Response, issues: z.ZodIssue[]): void {
  res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid purchase-planning request',
      issues,
    },
  });
}

function sendServiceError(res: Response, err: unknown): boolean {
  if (!isPurchasePlanningServiceError(err)) return false;
  res.status(err.status).json({ error: { code: err.code, message: err.message } });
  return true;
}

function sendV3ServiceError(res: Response, err: unknown): boolean {
  if (!isPurchasePlanningV3ServiceError(err)) return false;
  res.status(err.status).json({ error: { code: err.code, message: err.message } });
  return true;
}

function sendBuyerWorkbookServiceError(res: Response, err: unknown): boolean {
  if (!isBuyerWorkbookServiceError(err)) return false;
  res.status(err.status).json({ error: { code: err.code, message: err.message } });
  return true;
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

const buyerSeasonSchema = z.enum(['SPRING_SUMMER', 'FALL_WINTER']);
const buyerWorkbookStatusSchema = z.enum(['DRAFT', 'ARCHIVED']);
const buyerCategoryStatusSchema = z.enum([
  'NOT_STARTED',
  'HISTORY_REVIEWED',
  'CARRYOVER_REVIEW',
  'CARRYOVERS',
  'NEW_STYLES',
  'PO_LINKED',
  'COMPLETE',
  'NO_BUDGET',
]);
const plannedStyleStatusSchema = z.enum(['PLANNED', 'SELECTED', 'LINKED', 'CANCELLED']);
const buyerCarryoverDecisionSchema = z.enum(['UNREVIEWED', 'WINNER', 'MAYBE', 'DROP']);
const buyerCarryoverAvailabilitySchema = z.enum(['UNKNOWN', 'AVAILABLE', 'UNAVAILABLE']);

const buyerWorkbookCreateSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  buyingSeason: buyerSeasonSchema,
  seasonYear: z.number().int().min(2020).max(2100),
  seedStoreId: z.number().int().positive(),
  targetStoreIds: z.array(z.number().int().positive()).max(500).optional(),
  categoryNumbers: z.array(z.number().int().positive()).max(500).optional(),
  departmentNumbers: z.array(z.number().int().positive()).max(100).optional(),
  buyer: z.string().trim().max(120).optional(),
  createdBy: z.string().trim().max(120).optional(),
}).strict().superRefine((value, ctx) => {
  if (!(value.categoryNumbers?.length) && !(value.departmentNumbers?.length)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['categoryNumbers'],
      message: 'Select at least one category or department',
    });
  }
});

const buyerCardUpdateSchema = z.object({
  status: buyerCategoryStatusSchema.optional(),
  targetNewSkuCount: z.number().int().min(0).max(10_000).optional(),
  targetCarryoverSkuCount: z.number().int().min(0).max(10_000).optional(),
  salesProjections: z.array(z.object({
    yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
    projectedUnits: z.number().int().min(0).max(10_000_000),
    projectedSales: z.number().min(0).max(1_000_000_000),
  }).strict()).max(36).optional(),
  notes: z.string().max(4000).nullable().optional(),
  actor: z.string().trim().max(120).optional(),
}).strict();

const buyerCarryoverSizeCellSchema = z.object({
  rowLabel: z.string().max(64).nullable().optional(),
  columnLabel: z.string().max(64).nullable().optional(),
  quantity: z.number().int().min(0).max(100_000),
}).strict();

const buyerCarryoverCreateSchema = z.object({
  storeId: z.number().int().positive().nullable().optional(),
  skuCode: z.string().trim().min(1).max(32),
  skuDescription: z.string().trim().max(500).nullable().optional(),
  color: z.string().trim().max(120).nullable().optional(),
  sizeCells: z.array(buyerCarryoverSizeCellSchema).max(500).optional(),
  totalQuantity: z.number().int().min(0).max(1_000_000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  actor: z.string().trim().max(120).optional(),
}).strict();

const buyerCarryoverUpdateSchema = z.object({
  sizeCells: z.array(buyerCarryoverSizeCellSchema.extend({
    sizeLabel: z.string().max(120).nullable().optional(),
    plannedQty: z.number().int().min(0).max(100_000).optional(),
    recommendedQty: z.number().int().min(0).max(100_000).optional(),
    onHand: z.number().int().min(0).max(100_000).optional(),
    currentOnOrder: z.number().int().min(0).max(100_000).optional(),
    futureOnOrder: z.number().int().min(0).max(100_000).optional(),
    modelQty: z.number().int().min(0).max(100_000).optional(),
    modelShort: z.number().int().min(0).max(100_000).optional(),
    skuSalesQty: z.number().int().min(0).max(1_000_000).optional(),
    forecastDemandQty: z.number().int().min(0).max(1_000_000).optional(),
  })).max(500).optional(),
  totalQuantity: z.number().int().min(0).max(1_000_000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  actor: z.string().trim().max(120).optional(),
}).strict();

const buyerCopyModelSchema = z.object({
  targetStoreIds: z.array(z.number().int().positive()).max(500).optional(),
  actor: z.string().trim().max(120).optional(),
}).strict();

const buyerCarryoverUnavailableSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  actor: z.string().trim().max(120).optional(),
}).strict();

const buyerCarryoverCandidateUpdateSchema = z.object({
  decision: buyerCarryoverDecisionSchema.optional(),
  availability: buyerCarryoverAvailabilitySchema.optional(),
  notes: z.string().max(4000).nullable().optional(),
  actor: z.string().trim().max(120).optional(),
}).strict();

const buyerNewStyleTargetsSchema = z.object({
  replacementStyleTargetCount: z.number().int().min(0).max(10_000).optional(),
  additionalNewStyleTargetCount: z.number().int().min(0).max(10_000).optional(),
  totalNewStyleTargetCount: z.number().int().min(0).max(10_000).optional(),
  actor: z.string().trim().max(120).optional(),
}).strict();

const buyerAttributePlanSchema = z.object({
  rows: z.array(z.object({
    dimensionCode: z.string().trim().min(1).max(120),
    dimensionLabel: z.string().trim().min(1).max(200),
    valueCode: z.string().trim().min(1).max(120),
    valueLabel: z.string().trim().min(1).max(200),
    plannedStyleCount: z.number().int().min(0).max(10_000).nullable().optional(),
    plannedUnits: z.number().int().min(0).max(1_000_000).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  }).strict()).min(1).max(1000),
  actor: z.string().trim().max(120).optional(),
}).strict();

const buyerPlannedStyleCreateSchema = z.object({
  replacementForCarryoverLineId: z.string().trim().min(1).nullable().optional(),
  replacementForCarryoverCandidateId: z.string().trim().min(1).nullable().optional(),
  vendorCode: z.string().trim().max(32).nullable().optional(),
  vendorName: z.string().trim().max(200).nullable().optional(),
  workingStyle: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().trim().max(120).nullable().optional(),
  colorFamily: z.string().trim().max(120).nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  quotedUnitCost: z.number().min(0).max(1_000_000).nullable().optional(),
  targetNewSkuCount: z.number().int().min(0).max(10_000).nullable().optional(),
  targetUnits: z.number().int().min(0).max(1_000_000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  actor: z.string().trim().max(120).optional(),
}).strict();

const buyerPlannedStyleUpdateSchema = buyerPlannedStyleCreateSchema
  .omit({ replacementForCarryoverLineId: true })
  .extend({
    status: plannedStyleStatusSchema.optional(),
    linkedSkuId: z.string().trim().min(1).nullable().optional(),
    linkedSkuCode: z.string().trim().max(32).nullable().optional(),
  })
  .strict();

const buyerPoLinkSchema = z.object({
  cardId: z.string().trim().min(1),
  carryoverLineId: z.string().trim().min(1).nullable().optional(),
  plannedStyleId: z.string().trim().min(1).nullable().optional(),
  poId: z.string().trim().min(1),
  poLineId: z.string().trim().min(1).nullable().optional(),
  quantity: z.number().int().min(0).max(1_000_000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  linkedBy: z.string().trim().max(120).optional(),
}).strict();

const buyerStoreCarryingBulkSchema = z.object({
  categoryNumber: z.number().int().positive(),
  storeIds: z.array(z.number().int().positive()).max(500).optional(),
  chainCode: z.string().trim().max(64).nullable().optional(),
  carries: z.boolean(),
  exceptions: z.array(z.object({
    storeId: z.number().int().positive(),
    carries: z.boolean(),
    note: z.string().max(1000).nullable().optional(),
  }).strict()).max(500).optional(),
  note: z.string().max(1000).nullable().optional(),
  updatedBy: z.string().trim().max(120).optional(),
}).strict();

const buyerChecklistNoBudgetSchema = z.object({
  categoryNumber: z.number().int().positive(),
  buyingSeason: buyerSeasonSchema,
  seasonYear: z.number().int().min(2020).max(2100),
  buyer: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  actor: z.string().trim().max(120).optional(),
}).strict();

const buyerChecklistBulkNoBudgetSchema = z.object({
  categoryNumbers: z.array(z.number().int().positive()).min(1).max(500),
  buyingSeason: buyerSeasonSchema,
  seasonYear: z.number().int().min(2020).max(2100),
  buyer: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  actor: z.string().trim().max(120).optional(),
}).strict();

router.get('/store-category-carrying', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryNumber = Number(req.query.categoryNumber);
    if (!Number.isInteger(categoryNumber) || categoryNumber <= 0) {
      sendZodError(res, [{ code: z.ZodIssueCode.custom, path: ['categoryNumber'], message: 'categoryNumber is required' }]);
      return;
    }
    const rows = await listStoreCategoryCarrying(categoryNumber);
    res.json({ rows });
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.put('/store-category-carrying/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerStoreCarryingBulkSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const rows = await bulkUpdateStoreCategoryCarrying(parsed.data);
    res.json({ rows });
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.get('/buyer-checklist/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const buyer = typeof req.query.buyer === 'string' ? req.query.buyer : undefined;
    const buyingSeason = typeof req.query.buyingSeason === 'string' ? req.query.buyingSeason : undefined;
    const seasonYear = typeof req.query.seasonYear === 'string' ? Number(req.query.seasonYear) : undefined;
    const includeNoBudget = req.query.includeNoBudget === 'true' || req.query.includeNoBudget === '1';
    if (buyingSeason && !['SPRING_SUMMER', 'FALL_WINTER'].includes(buyingSeason)) {
      sendZodError(res, [{ code: z.ZodIssueCode.custom, path: ['buyingSeason'], message: 'Invalid buying season' }]);
      return;
    }
    if (seasonYear != null && (!Number.isInteger(seasonYear) || seasonYear < 2020 || seasonYear > 2100)) {
      sendZodError(res, [{ code: z.ZodIssueCode.custom, path: ['seasonYear'], message: 'Invalid season year' }]);
      return;
    }
    const rows = await listBuyerChecklistCategories({
      buyer,
      buyingSeason: buyingSeason as z.infer<typeof buyerSeasonSchema> | undefined,
      seasonYear,
      includeNoBudget,
    });
    res.json({ rows });
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-checklist/categories/no-budget', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerChecklistNoBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const result = await markBuyerChecklistCategoryNoBudget(parsed.data);
    res.json({ result });
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-checklist/categories/no-budget/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerChecklistBulkNoBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const results = await markBuyerChecklistCategoriesNoBudget(parsed.data);
    res.json({ results });
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-checklist/categories/reopen', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerChecklistNoBudgetSchema.omit({ note: true }).safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const result = await reopenBuyerChecklistCategoryBudget(parsed.data);
    res.json({ result });
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-checklist/categories/reopen/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerChecklistBulkNoBudgetSchema.omit({ note: true }).safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const results = await reopenBuyerChecklistCategoriesBudget(parsed.data);
    res.json({ results });
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.get('/buyer-workbooks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !['DRAFT', 'ARCHIVED', 'all'].includes(status)) {
      sendZodError(res, [{ code: z.ZodIssueCode.custom, path: ['status'], message: 'Invalid status' }]);
      return;
    }
    const workbooks = await listBuyerWorkbooks({ status: status as z.infer<typeof buyerWorkbookStatusSchema> | 'all' | undefined });
    res.json({ workbooks });
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-workbooks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerWorkbookCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await createBuyerWorkbook(parsed.data);
    res.status(201).json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.get('/buyer-workbooks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workbook = await getBuyerWorkbook(routeParam(req.params.id));
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-workbooks/:id/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = actorSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await archiveBuyerWorkbook(routeParam(req.params.id), parsed.data.actor ?? 'system');
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.patch('/buyer-workbooks/:id/cards/:cardId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerCardUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await updateBuyerCategoryCard(routeParam(req.params.id), routeParam(req.params.cardId), parsed.data);
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-workbooks/:id/cards/:cardId/sales-projection-workbook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = actorSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await ensureBuyerSalesProjectionWorkbook(
      routeParam(req.params.id),
      routeParam(req.params.cardId),
      parsed.data.actor ?? 'buyer',
    );
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-workbooks/:id/cards/:cardId/sales-projection-workbook/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = actorSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await confirmBuyerSalesProjectionWorkbook(
      routeParam(req.params.id),
      routeParam(req.params.cardId),
      parsed.data.actor ?? 'buyer',
    );
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-workbooks/:id/cards/:cardId/carryovers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerCarryoverCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await addCarryoverLine(routeParam(req.params.id), routeParam(req.params.cardId), parsed.data);
    res.status(201).json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.patch('/buyer-workbooks/:id/carryovers/:lineId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerCarryoverUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await updateCarryoverLine(routeParam(req.params.id), routeParam(req.params.lineId), parsed.data);
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.get('/buyer-workbooks/:id/cards/:cardId/carryover-candidates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const candidates = await listCarryoverCandidates(routeParam(req.params.id), routeParam(req.params.cardId));
    res.json({ candidates });
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.patch('/buyer-workbooks/:id/carryover-candidates/:candidateId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerCarryoverCandidateUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await updateCarryoverCandidate(routeParam(req.params.id), routeParam(req.params.candidateId), parsed.data);
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-workbooks/:id/carryover-candidates/:candidateId/create-model-line', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = actorSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await createModelLineFromCandidate(routeParam(req.params.id), routeParam(req.params.candidateId), parsed.data);
    res.status(201).json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-workbooks/:id/carryover-candidates/:candidateId/unavailable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerCarryoverUnavailableSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await flagCandidateUnavailable(routeParam(req.params.id), routeParam(req.params.candidateId), parsed.data);
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-workbooks/:id/cards/:cardId/copy-model', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerCopyModelSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await copySeedModel(routeParam(req.params.id), routeParam(req.params.cardId), parsed.data);
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-workbooks/:id/carryovers/:lineId/unavailable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerCarryoverUnavailableSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await flagCarryoverUnavailable(routeParam(req.params.id), routeParam(req.params.lineId), parsed.data);
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.patch('/buyer-workbooks/:id/cards/:cardId/new-style-targets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerNewStyleTargetsSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await updateNewStyleTargets(routeParam(req.params.id), routeParam(req.params.cardId), parsed.data);
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.patch('/buyer-workbooks/:id/cards/:cardId/attribute-plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerAttributePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await updateAttributePlan(routeParam(req.params.id), routeParam(req.params.cardId), parsed.data);
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-workbooks/:id/cards/:cardId/planned-styles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerPlannedStyleCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await addPlannedStyle(routeParam(req.params.id), routeParam(req.params.cardId), parsed.data);
    res.status(201).json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.patch('/buyer-workbooks/:id/planned-styles/:styleId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerPlannedStyleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await updatePlannedStyle(routeParam(req.params.id), routeParam(req.params.styleId), parsed.data);
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.delete('/buyer-workbooks/:id/planned-styles/:styleId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = typeof req.query.actor === 'string' ? req.query.actor : undefined;
    const workbook = await deletePlannedStyle(routeParam(req.params.id), routeParam(req.params.styleId), actor);
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.post('/buyer-workbooks/:id/po-links', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = buyerPoLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const workbook = await linkPurchaseOrder(routeParam(req.params.id), parsed.data);
    res.status(201).json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

router.delete('/buyer-workbooks/:id/po-links/:linkId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = typeof req.query.actor === 'string' ? req.query.actor : undefined;
    const workbook = await unlinkPurchaseOrder(routeParam(req.params.id), routeParam(req.params.linkId), actor);
    res.json(workbook);
  } catch (err) {
    if (sendBuyerWorkbookServiceError(res, err)) return;
    next(err);
  }
});

const projectionsSchema = z
  .object({
    dimension: z.enum(['department', 'category', 'vendor']),
    // Empty / missing → all stores (resolved in the facade via listSalesDimensions).
    storeNumbers: z.array(z.number().int().positive()).optional(),
    forecast: forecastSchema,
    eohMethod: z.enum(['forward', 'seasonal']),
    coverMonths: z.number().int().min(1).max(24).optional(),
    asOfYearMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'asOfYearMonth must be YYYY-MM')
      .optional(),
    filters: z
      .object({
        departmentsRaw: z.string().optional(),
        categoriesRaw: z.string().optional(),
        vendorsRaw: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * @openapi
 * /api/v1/purchase-planning/projections:
 *   post:
 *     tags: [Purchase Planning]
 *     summary: Compute a forecast-driven 12-month buy plan.
 *     description: |
 *       Projects next 12 months of sales per dimension (department/category/vendor),
 *       subtracts current on-hand, and emits the required Buy quantity per month.
 *       Four forecast methods × two EOH target methods.
 *     responses:
 *       200:
 *         description: Computed plan (rows, totals, meta).
 */
router.post('/projections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = projectionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid purchase-planning request',
          issues: parsed.error.issues,
        },
      });
      return;
    }
    const plan = await computePurchasePlan(parsed.data);
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

router.post('/plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = savedPlanCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const plan = await createPurchasePlan({
      ...parsed.data,
      departmentNumbers: parsed.data.departmentNumbers ?? [],
    });
    res.status(201).json(plan);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

const v3ReportSchema = z
  .object({
    storeGroupCodes: z.array(z.string().trim().min(1).max(64)).min(1).max(20).optional(),
    departmentNumber: z.number().int().min(1).max(99),
    year: z.number().int().min(2020).max(2100),
    label: z.string().trim().min(1).max(200).optional(),
    forecast: z.object({
      method: forecastMethodSchema.optional(),
      trailingMonths: z.number().int().min(1).max(24).optional(),
      growthPct: z.number().min(-99).max(500).optional(),
      yearsToBlend: z.union([z.literal(2), z.literal(3)]).optional(),
    }).strict().optional(),
    eohMethod: z.enum(['forward', 'seasonal']).optional(),
    coverMonths: z.number().int().min(1).max(12).optional(),
    discountNormalization: z.boolean().optional(),
    createdBy: z.string().trim().max(120).optional(),
  })
  .strict();

router.post('/v3/seasonal-report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = v3ReportSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const report = await generatePurchasePlanV3Report(parsed.data);
    res.json(report);
  } catch (err) {
    if (sendV3ServiceError(res, err)) return;
    next(err);
  }
});

router.post('/v3/plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = v3ReportSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const report = await createPurchasePlanV3(parsed.data);
    res.status(201).json(report);
  } catch (err) {
    if (sendV3ServiceError(res, err)) return;
    next(err);
  }
});

router.get('/v3/plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !['draft', 'archived', 'all'].includes(status)) {
      sendZodError(res, [{ code: z.ZodIssueCode.custom, path: ['status'], message: 'Invalid status' }]);
      return;
    }
    const plans = await listPurchasePlansV3({ status: status as 'draft' | 'archived' | 'all' | undefined });
    res.json({ plans });
  } catch (err) {
    if (sendV3ServiceError(res, err)) return;
    next(err);
  }
});

router.get('/v3/plans/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await getPurchasePlanV3(routeParam(req.params.id));
    res.json(plan);
  } catch (err) {
    if (sendV3ServiceError(res, err)) return;
    next(err);
  }
});

router.post('/v3/plans/:id/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = actorSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const plan = await archivePurchasePlanV3(routeParam(req.params.id), parsed.data.actor ?? 'system');
    res.json(plan);
  } catch (err) {
    if (sendV3ServiceError(res, err)) return;
    next(err);
  }
});

router.post('/seasonal-report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = seasonalReportSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const report = await generateSeasonalPurchaseReport(parsed.data);
    res.json(report);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.get('/plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const storeGroupCode = typeof req.query.storeGroupCode === 'string' ? req.query.storeGroupCode : undefined;
    if (status && !['draft', 'archived', 'all'].includes(status)) {
      sendZodError(res, [{ code: z.ZodIssueCode.custom, path: ['status'], message: 'Invalid status' }]);
      return;
    }
    const plans = await listPurchasePlans({ status: status as 'draft' | 'archived' | 'all' | undefined, storeGroupCode });
    res.json({ plans });
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.get('/plans/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await getPurchasePlan(routeParam(req.params.id));
    res.json(plan);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.post('/plans/:id/recalculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = savedPlanRecalculateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const plan = await recalculatePurchasePlan(routeParam(req.params.id), parsed.data);
    res.json(plan);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.post('/plans/:id/adjustments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = savedPlanAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const plan = await addPurchasePlanAdjustment(routeParam(req.params.id), parsed.data);
    res.status(201).json(plan);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.patch('/plans/:id/rows', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = savedPlanRowsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const plan = await updatePurchasePlanRows(routeParam(req.params.id), parsed.data);
    res.json(plan);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.patch('/plans/:id/rows/:rowId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = savedPlanRowUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const plan = await updatePurchasePlanRow(routeParam(req.params.id), routeParam(req.params.rowId), parsed.data);
    res.json(plan);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.get('/plans/:id/compare', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comparison = await comparePurchasePlan(routeParam(req.params.id));
    res.json(comparison);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.post('/plans/:id/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = actorSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const plan = await archivePurchasePlan(routeParam(req.params.id), parsed.data.actor ?? 'system');
    res.json(plan);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

export default router;
