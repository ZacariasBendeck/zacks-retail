import { Router, Request, Response, IRouter } from 'express';
import * as adjustmentService from '../services/adjustmentService';
import {
  createAdjustmentSchema,
  adjustmentListQuerySchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

/**
 * @openapi
 * /api/v1/inventory/adjustments:
 *   get:
 *     summary: List inventory adjustments with filtering and pagination
 *     tags: [Inventory Adjustments]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 25, maximum: 200 }
 *       - name: type
 *         in: query
 *         schema: { type: string, enum: [RECEIPT, TRANSFER, MANUAL_ADJUST, RETURN, DAMAGE, SHRINKAGE] }
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [type, createdAt], default: createdAt }
 *         description: Field to sort by
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Paginated list of adjustments
 */
router.get('/', validateQuery(adjustmentListQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery;
  res.json(adjustmentService.listAdjustments(params));
});

/**
 * @openapi
 * /api/v1/inventory/adjustments/{id}:
 *   get:
 *     summary: Get a single inventory adjustment by ID
 *     tags: [Inventory Adjustments]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: The adjustment
 *       404:
 *         description: Adjustment not found
 */
router.get('/:id', (req: Request, res: Response): void => {
  const adjustment = adjustmentService.getAdjustmentById(req.params.id as string);
  if (!adjustment) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Adjustment not found.' } });
    return;
  }
  res.json(adjustment);
});

/**
 * @openapi
 * /api/v1/inventory/adjustments:
 *   post:
 *     summary: Create a new inventory adjustment
 *     tags: [Inventory Adjustments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, lineItems]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [RECEIPT, TRANSFER, MANUAL_ADJUST, RETURN, DAMAGE, SHRINKAGE]
 *               fromLocationId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               toLocationId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               reason:
 *                 type: string
 *                 nullable: true
 *               lineItems:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [skuId, quantity]
 *                   properties:
 *                     skuId:
 *                       type: string
 *                       format: uuid
 *                     quantity:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Adjustment created
 *       404:
 *         description: SKU or location not found
 *       409:
 *         description: Insufficient stock
 */
router.post('/', validate(createAdjustmentSchema), (req: Request, res: Response): void => {
  const result = adjustmentService.createAdjustment(req.body);
  if ('error' in result) {
    res.status(result.status).json({ error: { code: result.code, message: result.error } });
    return;
  }
  res.status(201).json(result);
});

export default router;
