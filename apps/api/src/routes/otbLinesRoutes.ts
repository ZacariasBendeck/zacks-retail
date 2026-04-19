import { Router, Request, Response, IRouter } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validation';
import * as otbLinesService from '../services/otbLinesService';
import { ALLOWED_DEPARTMENTS, CATEGORY_CODE_MIN, CATEGORY_CODE_MAX } from '../constants/domain';

const router: IRouter = Router();

const SORT_WHITELIST = [
  'skuCode', 'style', 'department', 'category',
  'budgetUnits', 'actualUnits', 'onOrderUnits', 'openToBuyUnits',
] as const;

const otbLinesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(SORT_WHITELIST).default('openToBuyUnits'),
  order: z.enum(['asc', 'desc']).default('asc'),
  year: z.coerce.number().int().min(2020).max(2099).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  department: z.enum(ALLOWED_DEPARTMENTS).optional(),
  category: z.coerce.number().int().min(CATEGORY_CODE_MIN).max(CATEGORY_CODE_MAX).optional(),
  skuCode: z.string().optional(),
  style: z.string().optional(),
});

/**
 * @openapi
 * /api/v1/otb/lines:
 *   get:
 *     summary: OTB SKU-level plan lines — budget vs actual vs on-order for frontend table
 *     tags: [OTB]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [skuCode, style, department, category, budgetUnits, actualUnits, onOrderUnits, openToBuyUnits] }
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc] }
 *       - name: year
 *         in: query
 *         schema: { type: integer }
 *         description: Budget year (defaults to current year)
 *       - name: month
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *         description: Budget month (defaults to current month)
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 556, maximum: 599 }
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
 *         description: Paginated OTB SKU line rows
 */
router.get('/lines', validateQuery(otbLinesQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery;
  const result = otbLinesService.listOtbLines(params);
  res.json(result);
});

export default router;
