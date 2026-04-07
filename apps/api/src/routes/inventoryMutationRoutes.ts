import { Router, Request, Response, IRouter } from 'express';
import * as inventoryService from '../services/inventoryService';
import {
  inventoryMutationSchema,
  inventoryMutationRequireIdempotencySchema,
  onHandSkuQuerySchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

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
router.post('/mutations/receive', validate(inventoryMutationRequireIdempotencySchema), (req: Request, res: Response): void => {
  const result = inventoryService.executeMutation(req.body);
  if ('error' in result) {
    const code = (result as inventoryService.MutationError).error.code;
    const status = code.startsWith('CONFLICT') || code === 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' ? 409 : 400;
    res.status(status).json(result);
    return;
  }
  res.json(result);
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
router.post('/mutations/adjust', validate(inventoryMutationSchema), (req: Request, res: Response): void => {
  const result = inventoryService.executeMutation(req.body);
  if ('error' in result) {
    const code = (result as inventoryService.MutationError).error.code;
    const status = code.startsWith('CONFLICT') || code === 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' ? 409 : 400;
    res.status(status).json(result);
    return;
  }
  res.json(result);
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
router.post('/mutations/transfer', validate(inventoryMutationRequireIdempotencySchema), (req: Request, res: Response): void => {
  const result = inventoryService.executeMutation(req.body);
  if ('error' in result) {
    const code = (result as inventoryService.MutationError).error.code;
    const status = code.startsWith('CONFLICT') || code === 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' ? 409 : 400;
    res.status(status).json(result);
    return;
  }
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
router.get('/on-hand/sku', validateQuery(onHandSkuQuerySchema), (req: Request, res: Response): void => {
  const filters = (req as any).validatedQuery;
  const result = inventoryService.getOnHandBySku(filters);
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
router.get('/on-hand/departments', (_req: Request, res: Response): void => {
  const departments = inventoryService.getOnHandByDepartments();
  res.json({ departments });
});

export default router;
