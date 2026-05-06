import { Router, Request, Response, NextFunction, IRouter } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validation';
import {
  getOtbDashboardSummary,
  isOtbDashboardServiceError,
  listOtbDashboardPlans,
  listOtbDashboardRows,
} from '../services/otbDashboardService';

const router: IRouter = Router();

const SORT_WHITELIST = [
  'yearMonth',
  'departmentNumber',
  'departmentLabel',
  'plannedBuyUnits',
  'projectedSalesUnits',
  'currentOnOrderUnits',
  'futureOnOrderUnits',
  'nativeOpenPoUnits',
  'committedUnits',
  'stockPositionUnits',
  'openToBuyUnits',
] as const;

const plansQuerySchema = z.object({
  status: z.enum(['draft', 'all']).default('all'),
});

const dashboardFilterSchema = z.object({
  planId: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  departmentNumber: z.coerce.number().int().min(1).max(999).optional(),
});

const rowsQuerySchema = dashboardFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(SORT_WHITELIST).default('openToBuyUnits'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

function sendServiceError(res: Response, err: unknown): boolean {
  if (!isOtbDashboardServiceError(err)) return false;
  res.status(err.status).json({ error: { code: err.code, message: err.message } });
  return true;
}

router.get('/plans', validateQuery(plansQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = (req as any).validatedQuery;
    const plans = await listOtbDashboardPlans(params);
    res.json({ plans });
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.get('/summary', validateQuery(dashboardFilterSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = (req as any).validatedQuery;
    const summary = await getOtbDashboardSummary(params);
    res.json(summary);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

router.get('/rows', validateQuery(rowsQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = (req as any).validatedQuery;
    const rows = await listOtbDashboardRows(params);
    res.json(rows);
  } catch (err) {
    if (sendServiceError(res, err)) return;
    next(err);
  }
});

export default router;
