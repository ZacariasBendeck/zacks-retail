import { Router, Request, Response, IRouter } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validation';
import * as salesLedgerService from '../services/salesLedgerService';

const router: IRouter = Router();

const SALES_CHANNELS = ['STORE', 'ONLINE', 'WHOLESALE'] as const;
const SALES_LEDGER_CATEGORY_MIN = 1;
const SALES_LEDGER_CATEGORY_MAX = 999;

const SORT_WHITELIST = [
  'saleDate', 'storeId', 'channel', 'skuCode', 'style',
  'department', 'category', 'unitsSold', 'netRevenue',
] as const;

const salesLedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(SORT_WHITELIST).default('saleDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
  storeId: z.coerce.number().int().min(0).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  department: z.string().trim().min(1).max(120).optional(),
  category: z.coerce.number().int().min(SALES_LEDGER_CATEGORY_MIN).max(SALES_LEDGER_CATEGORY_MAX).optional(),
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
 *         schema: { type: string, enum: [saleDate, storeId, channel, skuCode, style, department, category, unitsSold, netRevenue] }
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
 *       - name: storeId
 *         in: query
 *         schema: { type: integer, minimum: 0 }
 *       - name: department
 *         in: query
 *         schema: { type: string }
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 999 }
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
router.get('/ledger', validateQuery(salesLedgerQuerySchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const params = (req as any).validatedQuery;
    const result = await salesLedgerService.listSalesLedger(params);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'SALES_LEDGER_QUERY_FAILED',
        message: err instanceof Error ? err.message : 'Failed to query sales ledger.',
      },
    });
  }
});

export default router;
