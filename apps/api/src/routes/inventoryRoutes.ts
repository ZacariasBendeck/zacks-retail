import { Router, Request, Response, IRouter } from 'express';
import * as inventoryService from '../services/inventoryService';
import {
  stockAdjustmentSchema,
  auditLogQuerySchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

/**
 * @openapi
 * /api/v1/skus/{skuId}/inventory:
 *   get:
 *     summary: Get current stock level for a SKU
 *     tags: [Inventory]
 *     parameters:
 *       - name: skuId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Current inventory for the SKU
 *       404:
 *         description: SKU not found
 */
router.get('/:skuId/inventory', (req: Request, res: Response): void => {
  const skuId = req.params.skuId as string;
  const inventory = inventoryService.getInventoryBySkuId(skuId);
  if (!inventory) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SKU not found.' } });
    return;
  }
  res.json(inventory);
});

/**
 * @openapi
 * /api/v1/skus/{skuId}/inventory/adjustments:
 *   post:
 *     summary: Record a stock adjustment
 *     tags: [Inventory]
 *     parameters:
 *       - name: skuId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [adjustment, reason]
 *             properties:
 *               adjustment:
 *                 type: integer
 *                 description: Positive to add stock, negative to remove
 *               reason:
 *                 type: string
 *                 description: Reason for the adjustment
 *               performedBy:
 *                 type: string
 *                 description: User performing the adjustment
 *     responses:
 *       200:
 *         description: Stock adjusted successfully
 *       400:
 *         description: Validation error or insufficient stock
 *       404:
 *         description: SKU not found
 */
router.post('/:skuId/inventory/adjustments', validate(stockAdjustmentSchema), (req: Request, res: Response): void => {
  const skuId = req.params.skuId as string;
  try {
    const result = inventoryService.adjustStock(skuId, req.body);
    res.json(result);
  } catch (err: any) {
    if (err.message === 'SKU_NOT_FOUND') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SKU not found.' } });
      return;
    }
    if (err.message === 'INSUFFICIENT_STOCK') {
      res.status(400).json({
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: 'Adjustment would bring quantity below zero.',
        },
      });
      return;
    }
    throw err;
  }
});

/**
 * @openapi
 * /api/v1/skus/{skuId}/inventory/audit-log:
 *   get:
 *     summary: Get stock adjustment audit log for a SKU
 *     tags: [Inventory]
 *     parameters:
 *       - name: skuId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [createdAt, adjustment], default: createdAt }
 *         description: Field to sort by
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Paginated audit log entries
 *       404:
 *         description: SKU not found
 */
router.get('/:skuId/inventory/audit-log', validateQuery(auditLogQuerySchema), (req: Request, res: Response): void => {
  const skuId = req.params.skuId as string;
  const params = (req as any).validatedQuery as { page: number; pageSize: number; sort?: string; order?: 'asc' | 'desc' };
  const result = inventoryService.getAuditLog(skuId, params);
  if (!result) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SKU not found.' } });
    return;
  }
  res.json(result);
});

export default router;
