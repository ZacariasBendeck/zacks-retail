import { Router, Request, Response, IRouter } from 'express';
import * as skuService from '../services/skuService';
import {
  createSkuSchema,
  updateSkuSchema,
  skuListQuerySchema,
  validate,
  validateQuery,
} from '../middleware/validation';
import { SkuListParams } from '../models/sku';

const router: IRouter = Router();

/**
 * @openapi
 * /api/v1/skus:
 *   post:
 *     summary: Create a new SKU
 *     tags: [SKUs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSkuInput'
 *     responses:
 *       201:
 *         description: SKU created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate barcode
 */
router.post('/', validate(createSkuSchema), (req: Request, res: Response): void => {
  try {
    const sku = skuService.createSku(req.body);
    res.status(201).json(sku);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed') && err.message?.includes('barcode')) {
      res.status(409).json({ error: { code: 'DUPLICATE_BARCODE', message: 'A SKU with this barcode already exists.' } });
      return;
    }
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
      res.status(400).json({ error: { code: 'INVALID_VENDOR', message: 'The specified vendorId does not exist.' } });
      return;
    }
    throw err;
  }
});

/**
 * @openapi
 * /api/v1/skus:
 *   get:
 *     summary: List and search SKUs with filtering, sorting, and pagination
 *     tags: [SKUs]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [brand, style, price, createdAt] }
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc] }
 *       - name: brand
 *         in: query
 *         schema: { type: string }
 *         description: Filter by exact brand name
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 556, maximum: 599 }
 *       - name: vendorId
 *         in: query
 *         schema: { type: string, format: uuid }
 *       - name: active
 *         in: query
 *         schema: { type: boolean }
 *       - name: q
 *         in: query
 *         schema: { type: string }
 *         description: Full-text search across brand, style, color, barcode
 *       - name: minPrice
 *         in: query
 *         schema: { type: number }
 *       - name: maxPrice
 *         in: query
 *         schema: { type: number }
 *       - name: size
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated list of SKUs
 */
router.get('/', validateQuery(skuListQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery as SkuListParams;
  const result = skuService.listSkus(params);
  res.json(result);
});

/**
 * @openapi
 * /api/v1/skus/{skuId}:
 *   get:
 *     summary: Get a single SKU by ID
 *     tags: [SKUs]
 *     parameters:
 *       - name: skuId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: SKU found
 *       404:
 *         description: SKU not found
 */
router.get('/:skuId', (req: Request, res: Response): void => {
  const skuId = req.params.skuId as string;
  const sku = skuService.getSkuById(skuId);
  if (!sku) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SKU not found.' } });
    return;
  }
  res.json(sku);
});

/**
 * @openapi
 * /api/v1/skus/{skuId}:
 *   patch:
 *     summary: Update a SKU
 *     tags: [SKUs]
 *     parameters:
 *       - name: skuId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateSkuInput'
 *     responses:
 *       200:
 *         description: SKU updated
 *       404:
 *         description: SKU not found
 */
router.patch('/:skuId', validate(updateSkuSchema), (req: Request, res: Response): void => {
  try {
    const skuId = req.params.skuId as string;
    const sku = skuService.updateSku(skuId, req.body);
    if (!sku) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SKU not found.' } });
      return;
    }
    res.json(sku);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed') && err.message?.includes('barcode')) {
      res.status(409).json({ error: { code: 'DUPLICATE_BARCODE', message: 'A SKU with this barcode already exists.' } });
      return;
    }
    throw err;
  }
});

/**
 * @openapi
 * /api/v1/skus/{skuId}:
 *   delete:
 *     summary: Soft-delete a SKU (set active=false)
 *     tags: [SKUs]
 *     parameters:
 *       - name: skuId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: SKU deactivated
 *       404:
 *         description: SKU not found
 */
router.delete('/:skuId', (req: Request, res: Response): void => {
  const skuId = req.params.skuId as string;
  const deleted = skuService.deactivateSku(skuId);
  if (!deleted) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SKU not found.' } });
    return;
  }
  res.status(204).send();
});

export default router;
