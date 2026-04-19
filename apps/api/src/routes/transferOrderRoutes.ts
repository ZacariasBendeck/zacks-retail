import { Router, Request, Response, IRouter } from 'express';
import * as purchaseOrderService from '../services/purchaseOrderService';

const router: IRouter = Router();

const TRANSFER_STATUSES = new Set(['DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']);

/**
 * @openapi
 * /api/v1/transfer-orders:
 *   get:
 *     summary: List transfer orders with pagination
 *     tags: [Transfer Orders]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [DRAFT, IN_TRANSIT, RECEIVED, CANCELLED] }
 *       - name: fromLocationId
 *         in: query
 *         schema: { type: string }
 *       - name: toLocationId
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated transfer order list
 */
router.get('/', (req: Request, res: Response): void => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 50;
  const status = req.query.status as string | undefined;
  const fromLocationId = req.query.fromLocationId as string | undefined;
  const toLocationId = req.query.toLocationId as string | undefined;

  if (isNaN(page) || page < 1) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'page must be a positive integer.' } });
    return;
  }
  if (isNaN(pageSize) || pageSize < 1 || pageSize > 200) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'pageSize must be between 1 and 200.' } });
    return;
  }
  if (status && !TRANSFER_STATUSES.has(status)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid transfer status filter.' } });
    return;
  }

  const result = purchaseOrderService.listTransferOrders({
    page,
    pageSize,
    status: status as 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED' | undefined,
    fromLocationId,
    toLocationId,
  });
  res.json(result);
});

/**
 * @openapi
 * /api/v1/transfer-orders/{transferOrderId}:
 *   get:
 *     summary: Get transfer order detail by id
 *     tags: [Transfer Orders]
 *     parameters:
 *       - name: transferOrderId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Transfer order detail
 *       404:
 *         description: Transfer order not found
 */
router.get('/:transferOrderId', (req: Request, res: Response): void => {
  const transferOrder = purchaseOrderService.getTransferOrderById(req.params.transferOrderId as string);
  if (!transferOrder) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transfer order not found.' } });
    return;
  }
  res.json(transferOrder);
});

export default router;
