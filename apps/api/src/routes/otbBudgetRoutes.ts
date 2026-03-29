import { Router, Request, Response, IRouter } from 'express';
import * as otbService from '../services/otbBudgetService';
import {
  createOtbBudgetSchema,
  updateOtbBudgetSchema,
  otbBudgetListQuerySchema,
  otbSummaryQuerySchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

/**
 * @openapi
 * /api/v1/otb-budgets:
 *   post:
 *     summary: Create an OTB budget for a department and month
 *     tags: [OTB Budgets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOtbBudgetInput'
 *     responses:
 *       201:
 *         description: OTB budget created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Budget already exists for this department/month
 */
router.post('/', validate(createOtbBudgetSchema), (req: Request, res: Response): void => {
  const result = otbService.createOtbBudget(req.body);

  if ('error' in result) {
    if (result.error === 'DUPLICATE_BUDGET') {
      res.status(409).json({ error: { code: 'DUPLICATE_BUDGET', message: 'A budget already exists for this department and month.' } });
      return;
    }
  }

  res.status(201).json(result);
});

/**
 * @openapi
 * /api/v1/otb-budgets:
 *   get:
 *     summary: List OTB budgets with filtering and pagination
 *     tags: [OTB Budgets]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - name: department
 *         in: query
 *         schema: { type: string }
 *       - name: year
 *         in: query
 *         schema: { type: integer }
 *       - name: month
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated list of OTB budgets
 */
router.get('/', validateQuery(otbBudgetListQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery;
  const result = otbService.listOtbBudgets(params);
  res.json(result);
});

/**
 * @openapi
 * /api/v1/otb-budgets/summary:
 *   get:
 *     summary: Get OTB summary with planned vs committed vs received
 *     tags: [OTB Budgets]
 *     parameters:
 *       - name: year
 *         in: query
 *         required: true
 *         schema: { type: integer }
 *       - name: month
 *         in: query
 *         schema: { type: integer }
 *       - name: department
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OTB summary per department/month
 */
router.get('/summary', validateQuery(otbSummaryQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery;
  const result = otbService.getOtbSummary(params);
  res.json(result);
});

/**
 * @openapi
 * /api/v1/otb-budgets/{budgetId}:
 *   get:
 *     summary: Get an OTB budget by ID
 *     tags: [OTB Budgets]
 *     parameters:
 *       - name: budgetId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: OTB budget found
 *       404:
 *         description: OTB budget not found
 */
router.get('/:budgetId', (req: Request, res: Response): void => {
  const budget = otbService.getOtbBudgetById(req.params.budgetId as string);
  if (!budget) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'OTB budget not found.' } });
    return;
  }
  res.json(budget);
});

/**
 * @openapi
 * /api/v1/otb-budgets/{budgetId}:
 *   patch:
 *     summary: Update an OTB budget (with audit trail)
 *     tags: [OTB Budgets]
 *     parameters:
 *       - name: budgetId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateOtbBudgetInput'
 *     responses:
 *       200:
 *         description: OTB budget updated
 *       404:
 *         description: OTB budget not found
 */
router.patch('/:budgetId', validate(updateOtbBudgetSchema), (req: Request, res: Response): void => {
  const result = otbService.updateOtbBudget(req.params.budgetId as string, req.body);

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'OTB budget not found.' } });
    return;
  }

  res.json(result);
});

/**
 * @openapi
 * /api/v1/otb-budgets/{budgetId}/audit:
 *   get:
 *     summary: Get audit trail for an OTB budget
 *     tags: [OTB Budgets]
 *     parameters:
 *       - name: budgetId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Audit log entries
 *       404:
 *         description: OTB budget not found
 */
router.get('/:budgetId/audit', (req: Request, res: Response): void => {
  const budget = otbService.getOtbBudgetById(req.params.budgetId as string);
  if (!budget) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'OTB budget not found.' } });
    return;
  }
  const audit = otbService.getOtbBudgetAudit(req.params.budgetId as string);
  res.json(audit);
});

/**
 * @openapi
 * /api/v1/otb-budgets/{budgetId}:
 *   delete:
 *     summary: Delete an OTB budget
 *     tags: [OTB Budgets]
 *     parameters:
 *       - name: budgetId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: OTB budget deleted
 *       404:
 *         description: OTB budget not found
 */
router.delete('/:budgetId', (req: Request, res: Response): void => {
  const deleted = otbService.deleteOtbBudget(req.params.budgetId as string);
  if (!deleted) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'OTB budget not found.' } });
    return;
  }
  res.status(204).send();
});

export default router;
