import { Router, Request, Response, IRouter } from 'express';
import { z } from 'zod';
import { validate, validateQuery } from '../middleware/validation';
import * as svc from '../services/otbMonthlyPlanService';
import { ALLOWED_DEPARTMENTS } from '../constants/domain';

const router: IRouter = Router();

// ── Validation schemas ──────────────────────────────────────────────

const SORT_WHITELIST = [
  'planMonth', 'macroDepartment', 'style', 'sizeLabel',
  'budgetAmount', 'committedAmount', 'receivedAmount',
  'remainingToCommitAmount', 'remainingToReceiveAmount',
  'budgetVsReceivedVarianceAmount', 'updatedAt',
] as const;

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(SORT_WHITELIST).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  year: z.coerce.number().int().min(2020).max(2099).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  department: z.enum(ALLOWED_DEPARTMENTS).optional(),
  skuId: z.string().uuid().optional(),
  style: z.string().optional(),
});

const createSchema = z.object({
  otbBudgetId: z.string().uuid(),
  skuId: z.string().uuid(),
  skuSizeId: z.string().uuid(),
  budgetAmount: z.number().min(0),
  committedAmount: z.number().min(0).optional(),
  receivedAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  budgetAmount: z.number().min(0).optional(),
  committedAmount: z.number().min(0).optional(),
  receivedAmount: z.number().min(0).optional(),
  notes: z.string().nullable().optional(),
});

// ── Routes ──────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/otb/monthly-plans:
 *   get:
 *     summary: List OTB monthly department/SKU-size plan lines with server-side table controls
 *     tags: [OTB Monthly Plans]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [planMonth, macroDepartment, style, sizeLabel, budgetAmount, committedAmount, receivedAmount, remainingToCommitAmount, remainingToReceiveAmount, budgetVsReceivedVarianceAmount, updatedAt] }
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc] }
 *       - name: year
 *         in: query
 *         schema: { type: integer }
 *       - name: month
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *       - name: skuId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: style
 *         in: query
 *         schema: { type: string }
 *         description: Case-insensitive contains filter on style
 *     responses:
 *       200:
 *         description: Paginated OTB monthly plan rows
 */
router.get('/', validateQuery(listQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery;
  const result = svc.listMonthlyPlans(params);
  res.json(result);
});

/**
 * @openapi
 * /api/v1/otb/monthly-plans:
 *   post:
 *     summary: Create an OTB monthly department/SKU-size plan line
 *     tags: [OTB Monthly Plans]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otbBudgetId, skuId, skuSizeId, budgetAmount]
 *             properties:
 *               otbBudgetId: { type: string, format: uuid }
 *               skuId: { type: string, format: uuid }
 *               skuSizeId: { type: string, format: uuid }
 *               budgetAmount: { type: number, minimum: 0 }
 *               committedAmount: { type: number, minimum: 0 }
 *               receivedAmount: { type: number, minimum: 0 }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Plan line created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate plan line
 */
router.post('/', validate(createSchema), (req: Request, res: Response): void => {
  const result = svc.createMonthlyPlan(req.body);

  if ('error' in result) {
    const status = result.error === 'DUPLICATE_PLAN_LINE' ? 409 : 400;
    res.status(status).json({ error: { code: result.error, message: result.message } });
    return;
  }

  res.status(201).json(result);
});

/**
 * @openapi
 * /api/v1/otb/monthly-plans/{planId}:
 *   get:
 *     summary: Get an OTB monthly plan line by ID
 *     tags: [OTB Monthly Plans]
 *     parameters:
 *       - name: planId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Plan line found
 *       404:
 *         description: Plan line not found
 */
router.get('/:planId', (req: Request, res: Response): void => {
  const plan = svc.getMonthlyPlanById(req.params.planId as string);
  if (!plan) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'OTB monthly plan line not found.' } });
    return;
  }
  res.json(plan);
});

/**
 * @openapi
 * /api/v1/otb/monthly-plans/{planId}:
 *   patch:
 *     summary: Update an OTB monthly plan line
 *     tags: [OTB Monthly Plans]
 *     parameters:
 *       - name: planId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               budgetAmount: { type: number, minimum: 0 }
 *               committedAmount: { type: number, minimum: 0 }
 *               receivedAmount: { type: number, minimum: 0 }
 *               notes: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Plan line updated
 *       400:
 *         description: Constraint violation
 *       404:
 *         description: Plan line not found
 */
router.patch('/:planId', validate(updateSchema), (req: Request, res: Response): void => {
  const result = svc.updateMonthlyPlan(req.params.planId as string, req.body);

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'OTB monthly plan line not found.' } });
    return;
  }

  if ('error' in result) {
    res.status(400).json({ error: { code: result.error, message: result.message } });
    return;
  }

  res.json(result);
});

/**
 * @openapi
 * /api/v1/otb/monthly-plans/{planId}:
 *   delete:
 *     summary: Delete an OTB monthly plan line
 *     tags: [OTB Monthly Plans]
 *     parameters:
 *       - name: planId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Plan line deleted
 *       404:
 *         description: Plan line not found
 */
router.delete('/:planId', (req: Request, res: Response): void => {
  const deleted = svc.deleteMonthlyPlan(req.params.planId as string);
  if (!deleted) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'OTB monthly plan line not found.' } });
    return;
  }
  res.status(204).send();
});

export default router;
