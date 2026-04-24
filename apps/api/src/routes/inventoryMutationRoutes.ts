import { Router, Request, Response, IRouter } from 'express';
import * as inventoryService from '../services/inventoryService';
import {
  inventoryMutationSchema,
  inventoryMutationRequireIdempotencySchema,
  onHandSkuQuerySchema,
  inventoryListQuerySchema,
  movementTimelineQuerySchema,
  movementReconciliationQuerySchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

/**
 * @openapi
 * /api/v1/inventory:
 *   get:
 *     summary: List inventory with cursor-based pagination
 *     tags: [Inventory]
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 50, minimum: 1, maximum: 200 }
 *       - name: cursor
 *         in: query
 *         schema: { type: string }
 *         description: Opaque cursor token from previous page's nextCursor
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [quantityOnHand, updatedAt, skuCode, department], default: updatedAt }
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *       - name: brandId
 *         in: query
 *         schema: { type: integer }
 *       - name: categoryId
 *         in: query
 *         schema: { type: integer }
 *       - name: active
 *         in: query
 *         schema: { type: boolean }
 *       - name: q
 *         in: query
 *         schema: { type: string }
 *         description: Free-text search across skuCode, style, ricsDescription
 *     responses:
 *       200:
 *         description: Cursor-paginated inventory list with appliedSort and appliedFilters echo
 *       400:
 *         description: Validation error
 */
router.get('/', validateQuery(inventoryListQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery;
  const result = inventoryService.listInventory(params);
  res.json(result);
});

/**
 * @openapi
 * /api/v1/inventory/mutations/receive:
 *   post:
 *     summary: Record a stock receive mutation with atomic ledger write
 *     tags: [Inventory Mutations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InventoryMutationInput'
 *     responses:
 *       200:
 *         description: Mutation committed with ledger entry
 *       400:
 *         description: Validation error
 *       409:
 *         description: Idempotency key conflict
 */
router.post('/mutations/receive', validate(inventoryMutationRequireIdempotencySchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await inventoryService.executeMutation(req.body);
    if ('error' in result) {
      const code = (result as inventoryService.MutationError).error.code;
      const status = code.startsWith('CONFLICT') || code === 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' ? 409 : 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('Inventory receive mutation failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Inventory mutation failed unexpectedly.' } });
  }
});

/**
 * @openapi
 * /api/v1/inventory/mutations/adjust:
 *   post:
 *     summary: Record a stock adjustment mutation with atomic ledger write
 *     tags: [Inventory Mutations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InventoryMutationInput'
 *     responses:
 *       200:
 *         description: Mutation committed with ledger entry
 *       400:
 *         description: Validation error
 *       409:
 *         description: Idempotency key conflict
 */
router.post('/mutations/adjust', validate(inventoryMutationSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await inventoryService.executeMutation(req.body);
    if ('error' in result) {
      const code = (result as inventoryService.MutationError).error.code;
      const status = code.startsWith('CONFLICT') || code === 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' ? 409 : 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('Inventory adjust mutation failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Inventory mutation failed unexpectedly.' } });
  }
});

/**
 * @openapi
 * /api/v1/inventory/mutations/transfer:
 *   post:
 *     summary: Record a stock transfer mutation with atomic ledger write
 *     tags: [Inventory Mutations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InventoryMutationInput'
 *     responses:
 *       200:
 *         description: Mutation committed with ledger entry
 *       400:
 *         description: Validation error
 *       409:
 *         description: Idempotency key conflict
 */
router.post('/mutations/transfer', validate(inventoryMutationRequireIdempotencySchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await inventoryService.executeMutation(req.body);
    if ('error' in result) {
      const code = (result as inventoryService.MutationError).error.code;
      const status = code.startsWith('CONFLICT') || code === 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' ? 409 : 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('Inventory transfer mutation failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Inventory mutation failed unexpectedly.' } });
  }
});

/**
 * @openapi
 * /api/v1/inventory/movements/timeline:
 *   get:
 *     summary: List inventory movements as a cursor-paginated timeline
 *     tags: [Inventory Movements]
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 50, minimum: 1, maximum: 200 }
 *       - name: cursor
 *         in: query
 *         schema: { type: string }
 *         description: Opaque cursor token from previous page's nextCursor
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [movementAt, quantityDelta], default: movementAt }
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - name: skuId
 *         in: query
 *         schema: { type: string, format: uuid }
 *         description: Filter by SKU ID
 *       - name: locationId
 *         in: query
 *         schema: { type: string }
 *         description: Filter by location ID
 *       - name: movementType
 *         in: query
 *         schema: { type: string, enum: [sale, po_receipt, transfer_in, transfer_out, adjustment] }
 *         description: Filter by movement type
 *       - name: fromDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *         description: Filter movements on or after this date
 *       - name: toDate
 *         in: query
 *         schema: { type: string, format: date-time }
 *         description: Filter movements on or before this date
 *     responses:
 *       200:
 *         description: Cursor-paginated movement timeline with appliedSort and appliedFilters echo
 *       400:
 *         description: Validation error
 */
router.get('/movements/timeline', validateQuery(movementTimelineQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery;
  const result = inventoryService.listMovementTimeline(params);
  res.json(result);
});

/**
 * @openapi
 * /api/v1/inventory/movements/reconciliation:
 *   get:
 *     summary: List inventory movement reconciliation aggregates per SKU and location
 *     tags: [Inventory Movements]
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 50, minimum: 1, maximum: 200 }
 *       - name: cursor
 *         in: query
 *         schema: { type: string }
 *         description: Opaque cursor token from previous page's nextCursor
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [expectedQuantityDelta, lastMovementAt, movementRowCount], default: lastMovementAt }
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - name: skuId
 *         in: query
 *         schema: { type: string, format: uuid }
 *         description: Filter by SKU ID
 *       - name: locationId
 *         in: query
 *         schema: { type: string }
 *         description: Filter by location ID
 *     responses:
 *       200:
 *         description: Cursor-paginated reconciliation aggregates with appliedSort and appliedFilters echo
 *       400:
 *         description: Validation error
 */
router.get('/movements/reconciliation', validateQuery(movementReconciliationQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery;
  const result = inventoryService.listMovementReconciliation(params);
  res.json(result);
});

/**
 * @openapi
 * /api/v1/inventory/on-hand/sku:
 *   get:
 *     summary: Exact SKU on-hand lookup by Brand/Style/Color/Size
 *     tags: [Inventory]
 *     parameters:
 *       - name: brandId
 *         in: query
 *         schema: { type: integer }
 *       - name: style
 *         in: query
 *         schema: { type: string }
 *       - name: colorId
 *         in: query
 *         schema: { type: integer }
 *       - name: sizeId
 *         in: query
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: On-hand data for matched SKU
 *       404:
 *         description: No matching SKU found
 */
router.get('/on-hand/sku', validateQuery(onHandSkuQuerySchema), async (req: Request, res: Response): Promise<void> => {
  const filters = (req as any).validatedQuery;
  const result = await inventoryService.getOnHandBySku(filters);
  if (!result) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No matching SKU found for the given filters.' } });
    return;
  }
  res.json(result);
});

/**
 * @openapi
 * /api/v1/inventory/on-hand/departments:
 *   get:
 *     summary: Department-segmented on-hand summary across all 6 macro-departments
 *     tags: [Inventory]
 *     responses:
 *       200:
 *         description: On-hand totals per department (FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT)
 */
router.get('/on-hand/departments', async (_req: Request, res: Response): Promise<void> => {
  const departments = await inventoryService.getOnHandByDepartments();
  res.json({ departments });
});

export default router;
