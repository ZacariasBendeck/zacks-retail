import { Router, Request, Response, IRouter } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validation';
import * as salesLedgerService from '../services/salesLedgerService';
import { ALLOWED_DEPARTMENTS, CATEGORY_CODE_MIN, CATEGORY_CODE_MAX } from '../constants/domain';

const router: IRouter = Router();

const SALES_CHANNELS = ['STORE', 'ONLINE', 'WHOLESALE'] as const;

const SORT_WHITELIST = [
  'saleDate', 'channel', 'skuCode', 'style',
  'department', 'category', 'unitsSold', 'netRevenue',
] as const;

const salesLedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(SORT_WHITELIST).default('saleDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  department: z.enum(ALLOWED_DEPARTMENTS).optional(),
  category: z.coerce.number().int().min(CATEGORY_CODE_MIN).max(CATEGORY_CODE_MAX).optional(),
  channel: z.enum(SALES_CHANNELS).optional(),
  skuCode: z.string().optional(),
  style: z.string().optional(),
});

/**
 * @openapi
 * /api/v1/sales/ledger:
 *   get:
 *     summary: Sales ledger — transaction-level rows for frontend table consumption
 *     tags: [Sales]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [saleDate, channel, skuCode, style, department, category, unitsSold, netRevenue] }
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc] }
 *       - name: startDate
 *         in: query
 *         schema: { type: string, format: date }
 *         description: Inclusive start date (YYYY-MM-DD)
 *       - name: endDate
 *         in: query
 *         schema: { type: string, format: date }
 *         description: Inclusive end date (YYYY-MM-DD)
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 556, maximum: 599 }
 *       - name: channel
 *         in: query
 *         schema: { type: string, enum: [STORE, ONLINE, WHOLESALE] }
 *       - name: skuCode
 *         in: query
 *         schema: { type: string }
 *         description: Case-insensitive contains filter on SKU code
 *       - name: style
 *         in: query
 *         schema: { type: string }
 *         description: Case-insensitive contains filter on style
 *     responses:
 *       200:
 *         description: Paginated sales ledger rows
 */
router.get('/ledger', validateQuery(salesLedgerQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery;
  const result = salesLedgerService.listSalesLedger(params);
  res.json(result);
});

export default router;
