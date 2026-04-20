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

const router: IRouter = Router();

const forecastSchema = z
  .object({
    method: z.enum([
      'sameMonthLastYear',
      'trailingAverage',
      'yoyGrowth',
      'blendedMultiYear',
    ]),
    trailingMonths: z.number().int().min(1).max(24).optional(),
    growthPct: z.number().min(-99).max(500).optional(),
    yearsToBlend: z.union([z.literal(2), z.literal(3)]).optional(),
  })
  .strict();

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

export default router;
