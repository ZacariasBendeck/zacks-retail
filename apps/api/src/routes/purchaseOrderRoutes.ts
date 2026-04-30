import { Router, Request, Response, IRouter } from 'express';
import * as poService from '../services/purchaseOrderService';
import * as otbService from '../services/otbBudgetService';
import { getLegacyPurchaseOrderByNumber } from '../services/legacyPurchaseOrderService';
import {
  buildOtbPolicyAuditEvents,
  recordOtbPolicyAuditEvents,
  OtbPolicyAuditEvent,
} from '../services/otbPolicyAuditService';
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  poStatusTransitionSchema,
  poListQuerySchema,
  poReceiveSchema,
  duplicatePurchaseOrderSchema,
  replicatePurchaseOrderSchema,
  combinePurchaseOrdersSchema,
  poReceiveFullSchema,
  poSubmitSchema,
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
router.post('/', validate(createPurchaseOrderSchema), async (req: Request, res: Response): Promise<void> => {
  const result = await poService.createPurchaseOrder(req.body);

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
    if (result.error === 'PO_NUMBER_EXISTS') {
      res.status(409).json({ error: { code: 'PO_NUMBER_EXISTS', message: 'Purchase order number already exists.' } });
      return;
    }
    if (result.error === 'RESERVED_PO_PREFIX') {
      res.status(409).json({ error: { code: 'RESERVED_PO_PREFIX', message: 'PO numbers starting with A or V are reserved.' } });
      return;
    }
    if (result.error === 'INVALID_FX_RATE') {
      res.status(422).json({ error: { code: 'INVALID_FX_RATE', message: 'Foreign-currency purchase orders require an FX rate greater than zero.' } });
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
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [poNumber, status, createdAt, updatedAt], default: createdAt }
 *         description: Field to sort by
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Paginated list of purchase orders
 */
router.get('/', validateQuery(poListQuerySchema), async (req: Request, res: Response): Promise<void> => {
  const params = (req as any).validatedQuery;
  const result = await poService.listPurchaseOrders(params);
  res.json(result);
});

router.get('/vendor-options', async (req: Request, res: Response): Promise<void> => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const pageSize = Number(req.query.pageSize);
  const result = await poService.listPurchaseOrderVendorOptions({
    q,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
  });
  res.json(result);
});

router.get('/buyer-options', async (_req: Request, res: Response): Promise<void> => {
  const result = await poService.listPurchaseOrderBuyerOptions();
  res.json(result);
});

router.get('/sku-options', async (req: Request, res: Response): Promise<void> => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined;
  const pageSize = Number(req.query.pageSize);
  const result = await poService.listPurchaseOrderSkuOptions({
    q,
    vendorId,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
  });
  res.json(result);
});

/**
 * @openapi
 * /api/v1/purchase-orders/overdue-exceptions:
 *   get:
 *     summary: List POs where vendor lead time has been exceeded without receipt
 *     tags: [Purchase Orders]
 *     responses:
 *       200:
 *         description: List of overdue PO exceptions with days overdue
 */
router.get('/overdue-exceptions', async (_req: Request, res: Response): Promise<void> => {
  const exceptions = await poService.listOverdueExceptions();
  res.json(exceptions);
});

router.get('/legacy/:poNumber', async (req: Request, res: Response): Promise<void> => {
  const poNumberRaw = req.params.poNumber;
  const poNumber = Array.isArray(poNumberRaw) ? poNumberRaw[0] : poNumberRaw;
  const result = await getLegacyPurchaseOrderByNumber(poNumber);
  if (!result) {
    res.status(404).json({
      error: { code: 'LEGACY_PO_NOT_FOUND', message: `Legacy purchase order ${poNumber} not found.` },
    });
    return;
  }
  res.json(result);
});

router.post('/combine', validate(combinePurchaseOrdersSchema), async (req: Request, res: Response): Promise<void> => {
  const sourcePoIds = Array.isArray(req.body.sourcePoIds)
    ? req.body.sourcePoIds
    : req.body.sourcePoId;
  const result = await poService.combinePurchaseOrders(sourcePoIds, req.body.intoPoId, {
    changedBy: req.body.changedBy,
  });

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Source or destination purchase order not found.' } });
    return;
  }

  if ('error' in result) {
    res.status(409).json({ error: { code: result.error, message: result.error } });
    return;
  }

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
router.get('/:poId', async (req: Request, res: Response): Promise<void> => {
  const po = await poService.getPurchaseOrderById(req.params.poId as string);
  if (!po) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }
  res.json(po);
});

router.post('/:poId/duplicate', validate(duplicatePurchaseOrderSchema), async (req: Request, res: Response): Promise<void> => {
  const result = await poService.duplicatePurchaseOrder(req.params.poId as string, req.body);

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }

  if ('error' in result) {
    const status = result.error === 'PO_NUMBER_EXISTS' ? 409 : 400;
    res.status(status).json({ error: { code: result.error, message: result.error } });
    return;
  }

  res.status(201).json(result);
});

router.post('/:poId/replicate', validate(replicatePurchaseOrderSchema), async (req: Request, res: Response): Promise<void> => {
  const result = await poService.replicatePurchaseOrder(req.params.poId as string, req.body);
  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }
  res.status(201).json(result);
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
router.patch('/:poId', validate(updatePurchaseOrderSchema), async (req: Request, res: Response): Promise<void> => {
  const result = await poService.updatePurchaseOrder(req.params.poId as string, req.body);

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }

  if ('error' in result) {
    if (result.error === 'ONLY_DRAFT_EDITABLE') {
      res.status(409).json({ error: { code: 'ONLY_DRAFT_EDITABLE', message: 'Only draft purchase orders can be edited.' } });
      return;
    }
    if (result.error === 'VENDOR_NOT_FOUND') {
      res.status(404).json({ error: { code: 'VENDOR_NOT_FOUND', message: 'Vendor not found.' } });
      return;
    }
    if (result.error === 'PO_NUMBER_EXISTS') {
      res.status(409).json({ error: { code: 'PO_NUMBER_EXISTS', message: 'Purchase order number already exists.' } });
      return;
    }
    if (result.error === 'RESERVED_PO_PREFIX') {
      res.status(409).json({ error: { code: 'RESERVED_PO_PREFIX', message: 'PO numbers starting with A or V are reserved.' } });
      return;
    }
    if (result.error === 'INVALID_FX_RATE') {
      res.status(422).json({ error: { code: 'INVALID_FX_RATE', message: 'Foreign-currency purchase orders require an FX rate greater than zero.' } });
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
router.patch('/:poId/status', validate(poStatusTransitionSchema), async (req: Request, res: Response): Promise<void> => {
  const result = await poService.transitionStatus(req.params.poId as string, req.body.status, {
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
router.patch('/:poId/submit', validate(poSubmitSchema), async (req: Request, res: Response): Promise<void> => {
  const poId = req.params.poId as string;
  const {
    force,
    changedBy,
    overrideReasonCode,
    approverIds,
    ceoExceptionApprovalId,
    policySource,
    warningThresholdPct,
    hardStopThresholdPct,
    traceId,
  } = req.body;

  const budgetCheck = otbService.checkBudgetImpact(poId);
  const actorUserId = changedBy ?? 'system';
  const requestTraceId = traceId
    ?? req.header('x-trace-id')
    ?? req.header('x-request-id')
    ?? req.header('x-correlation-id')
    ?? null;
  let auditEvents: OtbPolicyAuditEvent[] = [];

  if (!('error' in budgetCheck)) {
    auditEvents = buildOtbPolicyAuditEvents({
      poId,
      budgetImpact: budgetCheck,
      force: Boolean(force),
      actorUserId,
      overrideReasonCode: overrideReasonCode ?? null,
      approverIds: approverIds ?? null,
      ceoExceptionApprovalId: ceoExceptionApprovalId ?? null,
      policySource,
      warningThresholdPct,
      hardStopThresholdPct,
      traceId: requestTraceId,
    });

    recordOtbPolicyAuditEvents(auditEvents);
  }

  // Check budget impact before submitting (soft block)
  if (!('error' in budgetCheck)) {
    const hasHardStop = auditEvents.some((event) => event.decision === 'hard_stop');
    const hasOverride = auditEvents.some((event) => event.decision === 'override');
    const hasException = auditEvents.some((event) => event.decision === 'exception');

    // M3: Hard-stop at >=100% without force
    if (!force && hasHardStop) {
      res.status(409).json({
        error: {
          code: 'BUDGET_EXCEEDED',
          message: 'This PO would exceed the OTB budget for one or more departments. Submit with force=true to override.',
        },
        budgetImpact: budgetCheck,
      });
      return;
    }

    // M4: Enforce override contract — require reason code + dual approvals (min 2)
    if (force && (hasOverride || hasException)) {
      if (!overrideReasonCode || !overrideReasonCode.trim()) {
        res.status(400).json({
          error: {
            code: 'OTB_OVERRIDE_CONTRACT_INCOMPLETE',
            message: 'Budget override requires an overrideReasonCode.',
          },
        });
        return;
      }
      if (!approverIds || approverIds.length < 2) {
        res.status(400).json({
          error: {
            code: 'OTB_OVERRIDE_CONTRACT_INCOMPLETE',
            message: 'Budget override requires at least 2 approverIds (Merchandising Director + Finance Controller).',
          },
        });
        return;
      }
    }

    // M5: Enforce CEO exception token for >105% utilization
    if (force && hasException) {
      if (!ceoExceptionApprovalId || !ceoExceptionApprovalId.trim()) {
        res.status(400).json({
          error: {
            code: 'OTB_CEO_EXCEPTION_REQUIRED',
            message: 'Projected utilization exceeds 105%. A ceoExceptionApprovalId is required.',
          },
        });
        return;
      }
    }
  }

  const result = await poService.submitPurchaseOrder(poId, { changedBy });

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

  // Include budget warning in successful response if force was used
  if (force && !('error' in budgetCheck)) {
    const hasOverrideOrException = auditEvents.some((event) => event.decision === 'override' || event.decision === 'exception');
    if (hasOverrideOrException) {
      res.json({
        ...result,
        budgetWarning: {
          message: 'PO submitted with budget override. One or more department budgets are now exceeded.',
          budgetImpact: budgetCheck,
        },
      });
      return;
    }
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
router.patch('/:poId/confirm', async (req: Request, res: Response): Promise<void> => {
  const result = await poService.transitionStatus(req.params.poId as string, 'CONFIRMED');

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
router.patch('/:poId/cancel', validate(poCancelSchema), async (req: Request, res: Response): Promise<void> => {
  const result = await poService.cancelPurchaseOrder(req.params.poId as string, {
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
router.post('/:poId/receive', validate(poReceiveSchema), async (req: Request, res: Response): Promise<void> => {
  const result = await poService.receivePurchaseOrder(req.params.poId as string, req.body);

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
    if (result.error.startsWith('LOCATION_NOT_FOUND')) {
      const locationId = result.error.split(':')[1];
      res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: `Location ${locationId} not found.` } });
      return;
    }
    if (result.error.startsWith('QUANTITY_EXCEEDS_ORDERED')) {
      const lineId = result.error.split(':')[1];
      res.status(409).json({ error: { code: 'QUANTITY_EXCEEDS_ORDERED', message: `Received quantity exceeds ordered quantity for line ${lineId}.` } });
      return;
    }
    if (result.error.startsWith('DISCREPANCY_REASON_REQUIRED')) {
      const lineId = result.error.split(':')[1];
      res.status(422).json({ error: { code: 'DISCREPANCY_REASON_REQUIRED', message: `Discrepancy reason is required when receiving less than ordered for line ${lineId}.` } });
      return;
    }
    res.status(409).json({
      error: { code: 'INVALID_STATUS_TRANSITION', message: `Invalid status transition: ${result.error.replace('INVALID_TRANSITION:', '')}` },
    });
    return;
  }

  res.json(result);
});

router.post('/:poId/receive/full', validate(poReceiveFullSchema), async (req: Request, res: Response): Promise<void> => {
  const result = await poService.receivePurchaseOrderFull(req.params.poId as string, req.body);

  if (result === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }

  if ('error' in result) {
    if (result.error.startsWith('LOCATION_NOT_FOUND')) {
      const locationId = result.error.split(':')[1];
      res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: `Location ${locationId} not found.` } });
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
 * /api/v1/purchase-orders/{poId}/receipts:
 *   get:
 *     summary: List receipt events recorded for a purchase order
 *     tags: [Purchase Orders]
 *     parameters:
 *       - name: poId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Receipt headers with received line details
 *       404:
 *         description: Purchase order not found
 */
router.get('/:poId/receipts', async (req: Request, res: Response): Promise<void> => {
  const receipts = await poService.listPoReceiptsByPurchaseOrder(req.params.poId as string);
  if (receipts === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }
  res.json(receipts);
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
router.patch('/:poId/close', async (req: Request, res: Response): Promise<void> => {
  const result = await poService.transitionStatus(req.params.poId as string, 'CLOSED');

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
router.get('/:poId/history', async (req: Request, res: Response): Promise<void> => {
  const po = await poService.getPurchaseOrderById(req.params.poId as string);
  if (!po) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Purchase order not found.' } });
    return;
  }
  const history = await poService.getStatusHistory(req.params.poId as string);
  res.json(history);
});

export default router;
