import { Router, Request, Response, IRouter } from 'express';
import multer from 'multer';
import * as skuService from '../services/skuService';
import { analyzeShoeImage } from '../services/imageAnalysisService';
import { getAiFillConfig, mapAiResultsToReferenceIds } from '../services/aiFieldMappingService';
import {
  createSkuSchema,
  updateSkuSchema,
  skuListQuerySchema,
  validate,
  validateQuery,
} from '../middleware/validation';
import { SkuListParams } from '../models/sku';

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed.'));
    }
  },
});

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
 * /api/v1/skus/ai-fill-config:
 *   get:
 *     summary: Get the AI fill configuration for SKU attributes
 *     tags: [SKUs]
 *     responses:
 *       200:
 *         description: AI fill config specifying which attributes are auto-fillable
 */
router.get('/ai-fill-config', (_req: Request, res: Response): void => {
  try {
    const config = getAiFillConfig();
    res.json(config);
  } catch (err: any) {
    console.error('Failed to load AI fill config:', err);
    res.status(500).json({ error: { code: 'CONFIG_ERROR', message: 'Failed to load AI fill configuration.' } });
  }
});

/**
 * @openapi
 * /api/v1/skus/analyze-image:
 *   post:
 *     summary: Analyze a shoe image using AI and return suggested attributes
 *     tags: [SKUs]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: AI-suggested shoe attributes
 *       400:
 *         description: No image provided or invalid format
 *       500:
 *         description: AI analysis failed
 */
router.post('/analyze-image', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: { code: 'NO_IMAGE', message: 'An image file is required. Upload a JPEG, PNG, GIF, or WebP image.' } });
      return;
    }

    const raw = await analyzeShoeImage(req.file.buffer, req.file.mimetype);
    const config = getAiFillConfig();
    const mapped = mapAiResultsToReferenceIds(raw as unknown as Record<string, string | null>);
    res.json({ raw, mapped, config });
  } catch (err: any) {
    if (err.message?.includes('ANTHROPIC_API_KEY')) {
      res.status(500).json({ error: { code: 'CONFIG_ERROR', message: 'AI service is not configured. Set the ANTHROPIC_API_KEY environment variable.' } });
      return;
    }
    console.error('Image analysis error:', err);
    res.status(500).json({ error: { code: 'ANALYSIS_FAILED', message: 'Failed to analyze image. Please try again.' } });
  }
});

/**
 * SKU Lookup by code
 */
router.get('/lookup', (req: Request, res: Response): void => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).json({ error: { code: 'MISSING_CODE', message: 'Query parameter "code" is required.' } });
    return;
  }
  const sku = skuService.lookupSkuByCode(code);
  if (!sku) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No SKU found with that code.' } });
    return;
  }
  res.json(sku);
});

/**
 * Reference data — all tables at once
 */
router.get('/reference/all', (_req: Request, res: Response): void => {
  const data = skuService.getAllReferenceData();
  res.json(data);
});

/**
 * Size labels for a specific size type
 */
router.get('/size-types/:sizeTypeId/sizes', (req: Request, res: Response): void => {
  const sizeTypeId = parseInt(req.params.sizeTypeId as string, 10);
  if (isNaN(sizeTypeId) || sizeTypeId < 1) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'sizeTypeId must be a positive integer.' } });
    return;
  }
  const labels = skuService.getSizeLabelsBySizeType(sizeTypeId);
  res.json(labels);
});

/**
 * Reference data — single table
 */
router.get('/reference/:tableName', (req: Request, res: Response): void => {
  const data = skuService.getReferenceData(req.params.tableName as string);
  if (!data) {
    const valid = skuService.getReferenceTableNames().join(', ');
    res.status(404).json({ error: { code: 'UNKNOWN_TABLE', message: `Unknown reference table. Valid: ${valid}` } });
    return;
  }
  res.json(data);
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

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(skuId)) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'skuId must be a valid UUID.' } });
    return;
  }

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

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(skuId)) {
      res.status(400).json({ error: { code: 'INVALID_ID', message: 'skuId must be a valid UUID.' } });
      return;
    }

    // Reject empty PATCH body
    if (Object.keys(req.body).length === 0) {
      res.status(400).json({ error: { code: 'EMPTY_BODY', message: 'PATCH body must contain at least one field to update.' } });
      return;
    }

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

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(skuId)) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'skuId must be a valid UUID.' } });
    return;
  }

  const deleted = skuService.deactivateSku(skuId);
  if (!deleted) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SKU not found.' } });
    return;
  }
  res.status(204).send();
});

export default router;
