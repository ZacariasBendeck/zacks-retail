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
} from '../services/purchasePlanning/purchasePlanningSavedService';

const router: IRouter = Router();

const forecastMethodSchema = z.enum([
  'holtWinters',
  'sameMonthLastYear',
  'trailingAverage',
  'yoyGrowth',
  'blendedMultiYear',
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
    storeGroupCode: z.string().trim().min(1).max(64),
    season: z.enum(['spring', 'summer', 'fall', 'winter']),
    seasonYear: z.number().int().min(2020).max(2100),
    departmentNumbers: z.array(z.number().int().min(1).max(99)).min(1).max(99),
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

const actorSchema = z.object({
  actor: z.string().trim().max(120).optional(),
}).strict();

const seasonalReportSchema = z
  .object({
    storeGroupCode: z.string().trim().min(1).max(64),
    departmentNumber: z.number().int().min(1).max(99),
    year: z.number().int().min(2020).max(2100),
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

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

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
    const plan = await createPurchasePlan(parsed.data);
    res.status(201).json(plan);
  } catch (err) {
    if (sendServiceError(res, err)) return;
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
    const parsed = actorSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendZodError(res, parsed.error.issues);
      return;
    }
    const plan = await recalculatePurchasePlan(routeParam(req.params.id), parsed.data.actor ?? 'system');
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
