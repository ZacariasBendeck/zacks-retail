import { Router, Request, Response, IRouter } from 'express';
import * as dashboardService from '../services/dashboardService';
import { validateQuery } from '../middleware/validation';
import { z } from 'zod';

const router: IRouter = Router();

const lowStockQuerySchema = z.object({
  threshold: z.coerce.number().int().min(0).max(10000).default(10),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/**
 * @openapi
 * /api/v1/dashboard/kpis:
 *   get:
 *     summary: Get dashboard KPI metrics
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Dashboard KPIs
 */
router.get('/kpis', (_req: Request, res: Response): void => {
  const kpis = dashboardService.getDashboardKpis();
  res.json(kpis);
});

/**
 * @openapi
 * /api/v1/dashboard/summary:
 *   get:
 *     summary: Get inventory summary by department
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Department summary array
 */
router.get('/summary', (_req: Request, res: Response): void => {
  const summary = dashboardService.getDepartmentSummary();
  res.json(summary);
});

/**
 * @openapi
 * /api/v1/dashboard/low-stock:
 *   get:
 *     summary: Get low stock items with pagination
 *     tags: [Dashboard]
 *     parameters:
 *       - name: threshold
 *         in: query
 *         schema: { type: integer, default: 10 }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 25, maximum: 200 }
 *     responses:
 *       200:
 *         description: Paginated low stock items
 */
router.get('/low-stock', validateQuery(lowStockQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery as { threshold: number; page: number; pageSize: number };
  const result = dashboardService.getLowStock(params.threshold, params.page, params.pageSize);
  res.json(result);
});

export default router;
