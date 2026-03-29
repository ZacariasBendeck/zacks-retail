import { Router, Request, Response, IRouter } from 'express';
import * as poService from '../services/purchaseOrderService';
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  poStatusTransitionSchema,
  poListQuerySchema,
  poReceiveSchema,
  poCancelSchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

/**
 * @openapi
 * /api/v1/purchase-orders:
 *   post:
 *     summary: Create a new purchase order in Draft status
 *     tags: [Purchase Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePurchaseOrderInput'
 *     responses:
 *       201:
 *         description: Purchase order created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Vendor or SKU not found
 */
router.post('/', validate(createPurchaseOrderSchema), (req: Request, res: Response): void => {
  const result = poService.createPurchaseOrder(req.body);

  if ('error' in result) {
    if (result.error === 'VENDOR_NOT_FOUND') {
      res.status(404).json({ error: { code: 'VENDOR_NOT_FOUND', message: 'Vendor not found.' } });
      return;
    }
    if (result.error.startsWith('SKU_NOT_FOUND')) {
      const skuId = result.error.split(':')[1];
      res.status(404).json({ error: { code: 'SKU_NOT_FOUND', message: `SKU ${skuId} not found.` } });
      return;
    }
  }

  res.status(201).json(result);
});

/**
 * @openapi
 * /api/v1/purchase-orders:
 *   get:
 *     summary: List purchase orders with filtering and pagination
 *     tags: [Purchase Orders]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [DRAFT, SUBMITTED, CONFIRMED, CANCELLED] }
 *       - name: vendorId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: q
 *         in: query
 *         schema: { type: string }
 *         description: Search by PO number or notes
 *     responses:
 *       200:
 *         description: Paginated list of purchase orders
 */
router.get('/', validateQuery(poListQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery;
  const result = poService.listPurchaseOrders(params);
  res.json(result);
});

/**
 * @openapi
 * /api/v1/purchase-orders/{poId}:
 *   get:
 *     summary: Get a purchase order by ID
 *     tags: [Purchase Orders]
 *     parameters:
 *       - name: poId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Purchase order found
 *       404:
 *         description: Purchase order not found
 */
router.get('/:poId', (req: Request, res: Response): void => {
  const po = poService.getPurchaseOrderById(req.params.poId as string);
  if (!po) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }
  res.json(po);
});

/**
 * @openapi
 * /api/v1/purchase-orders/{poId}:
 *   patch:
 *     summary: Update a draft purchase order (notes and/or line items)
 *     tags: [Purchase Orders]
 *     parameters:
 *       - name: poId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePurchaseOrderInput'
 *     responses:
 *       200:
 *         description: Purchase order updated
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Only draft POs can be edited
 */
router.patch('/:poId', validate(updatePurchaseOrderSchema), (req: Request, res: Response): void => {
  const result = poService.updatePurchaseOrder(req.params.poId as string, req.body);

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }

  if ('error' in result) {
    if (result.error === 'ONLY_DRAFT_EDITABLE') {
      res.status(409).json({ error: { code: 'ONLY_DRAFT_EDITABLE', message: 'Only draft purchase orders can be edited.' } });
      return;
    }
    if (result.error.startsWith('SKU_NOT_FOUND')) {
      const skuId = result.error.split(':')[1];
      res.status(404).json({ error: { code: 'SKU_NOT_FOUND', message: `SKU ${skuId} not found.` } });
      return;
    }
  }

  res.json(result);
});

/**
 * @openapi
 * /api/v1/purchase-orders/{poId}/status:
 *   patch:
 *     summary: Transition PO status (submit, confirm, or cancel)
 *     tags: [Purchase Orders]
 *     parameters:
 *       - name: poId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [SUBMITTED, CONFIRMED, CANCELLED]
 *     responses:
 *       200:
 *         description: Status updated
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Invalid status transition
 */
router.patch('/:poId/status', validate(poStatusTransitionSchema), (req: Request, res: Response): void => {
  const result = poService.transitionStatus(req.params.poId as string, req.body.status, {
    reason: req.body.reason,
  });

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }

  if ('error' in result) {
    res.status(409).json({
      error: { code: 'INVALID_STATUS_TRANSITION', message: `Invalid status transition: ${result.error.replace('INVALID_TRANSITION:', '')}` },
    });
    return;
  }

  res.json(result);
});

/**
 * @openapi
 * /api/v1/purchase-orders/{poId}/submit:
 *   patch:
 *     summary: Submit a draft PO (DRAFT → SUBMITTED)
 *     tags: [Purchase Orders]
 *     parameters:
 *       - name: poId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: PO submitted
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Invalid transition or validation failure
 */
router.patch('/:poId/submit', (req: Request, res: Response): void => {
  const result = poService.submitPurchaseOrder(req.params.poId as string);

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }

  if ('error' in result) {
    if (result.error === 'NO_LINE_ITEMS') {
      res.status(409).json({ error: { code: 'NO_LINE_ITEMS', message: 'PO must have at least one line item to submit.' } });
      return;
    }
    if (result.error.startsWith('INACTIVE_SKU')) {
      const skuId = result.error.split(':')[1];
      res.status(409).json({ error: { code: 'INACTIVE_SKU', message: `SKU ${skuId} is not active.` } });
      return;
    }
    res.status(409).json({
      error: { code: 'INVALID_STATUS_TRANSITION', message: `Invalid status transition: ${result.error.replace('INVALID_TRANSITION:', '')}` },
    });
    return;
  }

  res.json(result);
});

/**
 * @openapi
 * /api/v1/purchase-orders/{poId}/confirm:
 *   patch:
 *     summary: Confirm a submitted PO (SUBMITTED → CONFIRMED)
 *     tags: [Purchase Orders]
 *     parameters:
 *       - name: poId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: PO confirmed
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Invalid transition
 */
router.patch('/:poId/confirm', (req: Request, res: Response): void => {
  const result = poService.transitionStatus(req.params.poId as string, 'CONFIRMED');

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }

  if ('error' in result) {
    res.status(409).json({
      error: { code: 'INVALID_STATUS_TRANSITION', message: `Invalid status transition: ${result.error.replace('INVALID_TRANSITION:', '')}` },
    });
    return;
  }

  res.json(result);
});

/**
 * @openapi
 * /api/v1/purchase-orders/{poId}/cancel:
 *   patch:
 *     summary: Cancel a PO (DRAFT/SUBMITTED/CONFIRMED → CANCELLED)
 *     tags: [Purchase Orders]
 *     parameters:
 *       - name: poId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: PO cancelled
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Invalid transition or reason required
 */
router.patch('/:poId/cancel', validate(poCancelSchema), (req: Request, res: Response): void => {
  const result = poService.cancelPurchaseOrder(req.params.poId as string, {
    reason: req.body.reason,
  });

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }

  if ('error' in result) {
    if (result.error === 'REASON_REQUIRED') {
      res.status(409).json({ error: { code: 'REASON_REQUIRED', message: 'Cancellation reason is required for submitted or confirmed POs.' } });
      return;
    }
    res.status(409).json({
      error: { code: 'INVALID_STATUS_TRANSITION', message: `Invalid status transition: ${result.error.replace('INVALID_TRANSITION:', '')}` },
    });
    return;
  }

  res.json(result);
});

/**
 * @openapi
 * /api/v1/purchase-orders/{poId}/receive:
 *   post:
 *     summary: Receive goods for a PO (CONFIRMED/PARTIALLY_RECEIVED → PARTIALLY_RECEIVED/RECEIVED)
 *     tags: [Purchase Orders]
 *     parameters:
 *       - name: poId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lines:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     lineId: { type: string, format: uuid }
 *                     quantityReceived: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Goods received, status updated
 *       404:
 *         description: Purchase order or line not found
 *       409:
 *         description: Invalid transition or line not found
 */
router.post('/:poId/receive', validate(poReceiveSchema), (req: Request, res: Response): void => {
  const result = poService.receivePurchaseOrder(req.params.poId as string, req.body);

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }

  if ('error' in result) {
    if (result.error.startsWith('LINE_NOT_FOUND')) {
      const lineId = result.error.split(':')[1];
      res.status(409).json({ error: { code: 'LINE_NOT_FOUND', message: `Line item ${lineId} not found on this PO.` } });
      return;
    }
    if (result.error.startsWith('QUANTITY_EXCEEDS_ORDERED')) {
      const lineId = result.error.split(':')[1];
      res.status(409).json({ error: { code: 'QUANTITY_EXCEEDS_ORDERED', message: `Received quantity exceeds ordered quantity for line ${lineId}.` } });
      return;
    }
    res.status(409).json({
      error: { code: 'INVALID_STATUS_TRANSITION', message: `Invalid status transition: ${result.error.replace('INVALID_TRANSITION:', '')}` },
    });
    return;
  }

  res.json(result);
});

/**
 * @openapi
 * /api/v1/purchase-orders/{poId}/close:
 *   patch:
 *     summary: Close a received PO (RECEIVED → CLOSED)
 *     tags: [Purchase Orders]
 *     parameters:
 *       - name: poId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: PO closed
 *       404:
 *         description: Purchase order not found
 *       409:
 *         description: Invalid transition
 */
router.patch('/:poId/close', (req: Request, res: Response): void => {
  const result = poService.transitionStatus(req.params.poId as string, 'CLOSED');

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }

  if ('error' in result) {
    res.status(409).json({
      error: { code: 'INVALID_STATUS_TRANSITION', message: `Invalid status transition: ${result.error.replace('INVALID_TRANSITION:', '')}` },
    });
    return;
  }

  res.json(result);
});

/**
 * @openapi
 * /api/v1/purchase-orders/{poId}/history:
 *   get:
 *     summary: Get status transition history for a purchase order
 *     tags: [Purchase Orders]
 *     parameters:
 *       - name: poId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Status history list
 *       404:
 *         description: Purchase order not found
 */
router.get('/:poId/history', (req: Request, res: Response): void => {
  const po = poService.getPurchaseOrderById(req.params.poId as string);
  if (!po) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }
  const history = poService.getStatusHistory(req.params.poId as string);
  res.json(history);
});

export default router;
