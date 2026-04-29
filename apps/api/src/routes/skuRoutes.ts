/**
 * Legacy SKU routes — backed by the SQLite `skus` table.
 *
 * **DEPRECATED** — Phase 5g. The SKU form (`/inventory/skus/new`) now writes
 * through `/api/v1/products/sku-drafts/*` (the lifecycle-aware Postgres path).
 * These routes remain mounted only for:
 *   - The legacy SKU list page (`/inventory/skus`)
 *   - The AI image analyze endpoint (`/api/v1/skus/analyze-image`)
 *   - Reference-data reads (`/api/v1/skus/reference/*`)
 *   - The SKU Inquiry search modal (`/api/v1/skus/search`)
 *
 * Do NOT add new write paths here. New writes go through
 * `apps/api/src/routes/products/skuDraftRoutes.ts`. Every response from this
 * router carries a `Deprecation: true` + `Sunset` header per RFC 8594 so
 * operators and future tooling can surface the migration path.
 *
 * Sunset target: after two sprints of products-module usage in prod.
 * Tracking: the Phase 5g checklist in
 * docs/operations/sku-lifecycle-gate.md.
 */
import { Router, Request, Response, IRouter, NextFunction } from 'express';
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
import {
  searchSkusForLookup,
  getSkuLookupFacets,
  type SkuLookupMatchMode,
  type SkuLookupSort,
} from '../services/ricsProductAdapter';

const router: IRouter = Router();

/**
 * Phase 5g — every response from this router signals the RFC 8594 deprecation
 * contract. Operators + any future tooling that watches for the header can
 * detect usage of the legacy path and migrate. The Link header points at the
 * replacement route.
 */
router.use((req: Request, res: Response, next: NextFunction) => {
  res.set('Deprecation', 'true');
  res.set('Link', '</api/v1/products/sku-drafts>; rel="successor-version"');
  // Write paths (POST/PATCH/DELETE on /api/v1/skus/*) are the real concern —
  // log them so operators see who's still hitting the old surface.
  if (req.method !== 'GET') {
    console.warn(
      `[deprecation] legacy SQLite write hit: ${req.method} /api/v1/skus${req.path} — ` +
        `route to /api/v1/products/sku-drafts`,
    );
  }
  next();
});

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
    if (err.name === 'ValidationError' && err.status) {
      const errorPayload: {
        code: string;
        message: string;
        details?: Record<string, string>[];
      } = {
        code: typeof err.code === 'string' ? err.code : 'INVALID_FK',
        message: err.message,
      };
      if (Array.isArray(err.details) && err.details.length > 0) {
        errorPayload.details = err.details;
      }
      res.status(err.status).json({ error: errorPayload });
      return;
    }
    if (err.message?.includes('UNIQUE constraint failed') && err.message?.includes('barcode')) {
      res.status(409).json({ error: { code: 'DUPLICATE_BARCODE', message: 'A SKU with this barcode already exists.' } });
      return;
    }
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
      res.status(400).json({ error: { code: 'INVALID_REFERENCE', message: 'One or more referenced records do not exist.' } });
      return;
    }
    if (err.message?.includes('NOT NULL constraint failed')) {
      const match = err.message.match(/NOT NULL constraint failed:\s*\w+\.(\w+)/);
      const column = match ? match[1] : 'unknown';
      res.status(400).json({ error: { code: 'NOT_NULL_VIOLATION', message: `Required field '${column}' cannot be null.` } });
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
    // Family is required: it scopes which real Postgres categories get injected
    // into the prompt. Without it, the AI would have to pick from 615 categories
    // across every sector (accuracy tanks). Accept via form field or query param.
    const family = (
      (req.body && typeof req.body.family === 'string' && req.body.family.trim()) ||
      (typeof req.query.family === 'string' && req.query.family.trim()) ||
      ''
    );
    if (!family) {
      res.status(400).json({ error: { code: 'MISSING_FAMILY', message: 'A product family is required. Select a family before uploading an image.' } });
      return;
    }

    const { raw, resolution, warning } = await analyzeShoeImage(req.file.buffer, req.file.mimetype, family);
    const config = getAiFillConfig();
    const mapped = mapAiResultsToReferenceIds(raw as unknown as Record<string, string | null>);
    // 2026-04-26 — the web form renamed this field to `genderId`, but the
    // legacy AI-fill config still emits `targetAudienceId`. Return both keys
    // during the transition so existing DRAFT payloads and the modern UI agree.
    const targetAudienceId = (mapped as Record<string, unknown>).targetAudienceId;
    if (
      (typeof targetAudienceId === 'number' || targetAudienceId === null) &&
      (mapped as Record<string, unknown>).genderId === undefined
    ) {
      (mapped as Record<string, unknown>).genderId = targetAudienceId;
    }
    // Overlay the resolved Postgres values on top of `mapped`. These take
    // precedence over the legacy SQLite-backed categoryId fuzzy match — the
    // frontend should prefer `mapped.categoryCode` / `mapped.departmentCode`
    // when present.
    //
    // `mapped.categoryId` is emitted by the legacy fuzzy matcher
    // (aiFieldMappingService.matchReferenceValue) and does NOT know about the
    // selected family — substring matching on "Pend Clasificar" can return a
    // category from a totally different family. Always align it with the
    // family-validated resolution so the frontend can't apply a cross-family id.
    if (resolution) {
      (mapped as Record<string, unknown>).categoryId = resolution.categoryNumber;
      (mapped as Record<string, unknown>).categoryCode = resolution.categoryNumber;
      (mapped as Record<string, unknown>).categoryName = resolution.categoryDesc;
      (mapped as Record<string, unknown>).departmentCode = resolution.departmentNumber;
      (mapped as Record<string, unknown>).departmentName = resolution.departmentDesc;
      (mapped as Record<string, unknown>).familyCode = resolution.familyCode;
    } else {
      // Family check rejected (or AI returned no category): clear the legacy
      // fuzzy-matched id so the frontend doesn't silently apply a cross-family row.
      (mapped as Record<string, unknown>).categoryId = null;
    }
    res.json({ raw, mapped, config, resolution, warning });
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
 * @openapi
 * /api/v1/skus/autocomplete:
 *   get:
 *     summary: Autocomplete SKUs by code prefix
 *     tags: [SKUs]
 *     parameters:
 *       - name: q
 *         in: query
 *         required: true
 *         schema: { type: string }
 *         description: SKU code prefix to search for
 *     responses:
 *       200:
 *         description: Up to 10 matching SKUs ordered alphabetically
 */
router.get('/autocomplete', (req: Request, res: Response): void => {
  const q = (req.query.q as string || '').trim();
  if (!q) {
    res.json([]);
    return;
  }
  const results = skuService.autocompleteSkus(q);
  res.json(results);
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
 * SKU Search for the Inventory Inquiry / SKU Lookup modal.
 * Supports prefix or contains match on SKU code, substring/whole-word match on
 * description, sorting by SKU | DESCRIPTION | VENDOR | STYLE_COLOR, and pagination.
 */
router.get('/search', async (req: Request, res: Response, next): Promise<void> => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const descContains = typeof req.query.descContains === 'string' ? req.query.descContains : undefined;

    if (q === undefined && !descContains) {
      res.status(400).json({ error: 'q or descContains is required' });
      return;
    }

    // `searchField` picks which column `q` filters against. Also accept the
    // legacy `sort` query parameter (older clients) so we don't break them.
    const fieldRaw = (
      typeof req.query.searchField === 'string' ? req.query.searchField
      : typeof req.query.sort === 'string' ? req.query.sort
      : 'SKU'
    ).toUpperCase();
    const allowedFields: SkuLookupSort[] = ['SKU', 'DESCRIPTION', 'VENDOR', 'STYLE_COLOR'];
    const searchField = (allowedFields as string[]).includes(fieldRaw)
      ? (fieldRaw as SkuLookupSort)
      : 'SKU';

    const wholeWord = req.query.wholeWord === 'true';
    const skuMatchModeRaw = typeof req.query.skuMatchMode === 'string'
      ? req.query.skuMatchMode.trim().toLowerCase()
      : undefined;
    const skuMatchMode: SkuLookupMatchMode = skuMatchModeRaw === 'prefix'
      ? 'prefix'
      : 'contains';
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const season = typeof req.query.season === 'string' && req.query.season.trim()
      ? req.query.season.trim()
      : undefined;
    const vendor = typeof req.query.vendor === 'string' && req.query.vendor.trim()
      ? req.query.vendor.trim()
      : undefined;
    const department = req.query.department != null && req.query.department !== ''
      ? Number(req.query.department)
      : undefined;

    const result = await searchSkusForLookup({
      q, descContains, wholeWord, searchField, skuMatchMode, limit, offset,
      season, vendor,
      department: department != null && Number.isFinite(department) ? department : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Distinct Season / Vendor / Department values over the live SKU index —
 * powers the dropdown filters on the SKU Lookup modal.
 */
router.get('/lookup-facets', async (req: Request, res: Response, next): Promise<void> => {
  try {
    const season = typeof req.query.season === 'string' && req.query.season.trim()
      ? req.query.season.trim()
      : undefined;
    const vendor = typeof req.query.vendor === 'string' && req.query.vendor.trim()
      ? req.query.vendor.trim()
      : undefined;
    const department = req.query.department != null && req.query.department !== ''
      ? Number(req.query.department)
      : undefined;
    const facets = await getSkuLookupFacets({
      season,
      vendor,
      department: department != null && Number.isFinite(department) ? department : undefined,
    });
    res.json(facets);
  } catch (err) {
    next(err);
  }
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
 * Canonical StyleColor catalog list
 */
router.get('/style-colors', (req: Request, res: Response): void => {
  const brandId = req.query.brandId ? parseInt(req.query.brandId as string, 10) : undefined;
  const colorId = req.query.colorId ? parseInt(req.query.colorId as string, 10) : undefined;
  const department = req.query.department as SkuListParams['department'] | undefined;
  const activeRaw = req.query.active as string | undefined;
  const active = activeRaw === undefined ? undefined : activeRaw === 'true';

  if (brandId !== undefined && (isNaN(brandId) || brandId < 1)) {
    res.status(400).json({ error: { code: 'INVALID_FILTER', message: 'brandId must be a positive integer.' } });
    return;
  }
  if (colorId !== undefined && (isNaN(colorId) || colorId < 1)) {
    res.status(400).json({ error: { code: 'INVALID_FILTER', message: 'colorId must be a positive integer.' } });
    return;
  }

  const rows = skuService.listStyleColors({ brandId, colorId, department, active });
  res.json(rows);
});

/**
 * Canonical StyleColor linkage for one SKU
 */
router.get('/:skuId/style-color', (req: Request, res: Response): void => {
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

  const styleColor = skuService.getSkuStyleColorLink(skuId);
  if (!styleColor) {
    res.status(404).json({ error: { code: 'STYLE_COLOR_NOT_LINKED', message: 'No StyleColor mapping exists for this SKU.' } });
    return;
  }
  res.json(styleColor);
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
 * /api/v1/skus/{skuCode}/upcs:
 *   get:
 *     summary: List UPCs for a SKU by SKU code
 *     tags: [SKUs]
 *     description: UPC data is not yet wired from the RICS source tables, so this route currently returns an empty array.
 *     parameters:
 *       - name: skuCode
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Array of UPC records (may be empty)
 *
 */
router.get('/:skuCode/upcs', (req: Request, res: Response): void => {
  // TODO(Phase 2): query SkuUpc by skuCode once adapter exposes UPC data.
  res.json([]);
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
    if (err.name === 'ValidationError' && err.status) {
      const errorPayload: {
        code: string;
        message: string;
        details?: Record<string, string>[];
      } = {
        code: typeof err.code === 'string' ? err.code : 'INVALID_FK',
        message: err.message,
      };
      if (Array.isArray(err.details) && err.details.length > 0) {
        errorPayload.details = err.details;
      }
      res.status(err.status).json({ error: errorPayload });
      return;
    }
    if (err.message?.includes('UNIQUE constraint failed') && err.message?.includes('barcode')) {
      res.status(409).json({ error: { code: 'DUPLICATE_BARCODE', message: 'A SKU with this barcode already exists.' } });
      return;
    }
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
      res.status(400).json({ error: { code: 'INVALID_REFERENCE', message: 'One or more referenced records do not exist.' } });
      return;
    }
    if (err.message?.includes('NOT NULL constraint failed')) {
      const match = err.message.match(/NOT NULL constraint failed:\s*\w+\.(\w+)/);
      const column = match ? match[1] : 'unknown';
      res.status(400).json({ error: { code: 'NOT_NULL_VIOLATION', message: `Required field '${column}' cannot be null.` } });
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
