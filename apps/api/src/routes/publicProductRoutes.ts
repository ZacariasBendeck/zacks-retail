import { Router, Request, Response, IRouter } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validation';
import * as publicProductService from '../services/publicProductService';
import { ProductListParams } from '../services/publicProductService';

const router: IRouter = Router();

const DEPARTMENTS = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT'] as const;

// ── Validation schemas ─────────────────────────────────────────────

const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  sort: z.enum(['price', 'newest', 'name']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  brandId: z.coerce.number().int().positive().optional(),
  colorId: z.coerce.number().int().positive().optional(),
  sizeLabel: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  department: z.enum(DEPARTMENTS).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  materialId: z.coerce.number().int().positive().optional(),
  shoeTypeId: z.coerce.number().int().positive().optional(),
  q: z.string().max(200).optional(),
});

/**
 * @openapi
 * /api/public/products/facets:
 *   get:
 *     summary: Get available filter values with counts for storefront sidebar
 *     tags: [Public Products]
 *     description: Returns aggregated filter values (brands, colors, sizes, categories, departments, materials) with product counts for each value, plus the overall price range.
 *     responses:
 *       200:
 *         description: Facet values with counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 brands:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       count: { type: integer }
 *                 colors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       count: { type: integer }
 *                 sizes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label: { type: string }
 *                       count: { type: integer }
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       count: { type: integer }
 *                 departments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name: { type: string }
 *                       count: { type: integer }
 *                 materials:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name: { type: string }
 *                       count: { type: integer }
 *                 priceRange:
 *                   type: object
 *                   properties:
 *                     min: { type: number }
 *                     max: { type: number }
 */
router.get('/facets', (_req: Request, res: Response): void => {
  const facets = publicProductService.getProductFacets();
  res.json(facets);
});

/**
 * @openapi
 * /api/public/products:
 *   get:
 *     summary: List products for storefront with pagination, sorting, and filters
 *     tags: [Public Products]
 *     description: Public read-only endpoint for browsing the product catalog. No authentication required.
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1, minimum: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 24, minimum: 1, maximum: 100 }
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [price, newest, name], default: name }
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: asc }
 *       - name: brandId
 *         in: query
 *         schema: { type: integer }
 *         description: Filter by brand ID
 *       - name: colorId
 *         in: query
 *         schema: { type: integer }
 *         description: Filter by color ID
 *       - name: sizeLabel
 *         in: query
 *         schema: { type: string }
 *         description: Filter by available size label (e.g. "8", "9.5")
 *       - name: categoryId
 *         in: query
 *         schema: { type: integer }
 *         description: Filter by category ID
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *       - name: minPrice
 *         in: query
 *         schema: { type: number }
 *       - name: maxPrice
 *         in: query
 *         schema: { type: number }
 *       - name: materialId
 *         in: query
 *         schema: { type: integer }
 *         description: Filter by upper material ID
 *       - name: shoeTypeId
 *         in: query
 *         schema: { type: integer }
 *         description: Filter by shoe type/style ID
 *       - name: q
 *         in: query
 *         schema: { type: string }
 *         description: Search query across product name and description
 *     responses:
 *       200:
 *         description: Paginated product listing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       name: { type: string }
 *                       brand: { type: string, nullable: true }
 *                       price: { type: number }
 *                       mainImage: { type: string, nullable: true }
 *                       rating: { type: number, nullable: true }
 *                       colorSwatches:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             colorId: { type: integer }
 *                             name: { type: string }
 *                             code: { type: string }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     totalItems: { type: integer }
 *                     totalPages: { type: integer }
 *       400:
 *         description: Validation error
 */
router.get('/', validateQuery(productListQuerySchema), (req: Request, res: Response): void => {
  const params = (req as any).validatedQuery as ProductListParams;
  const result = publicProductService.listProducts(params);
  res.json(result);
});

/**
 * @openapi
 * /api/public/products/{productId}:
 *   get:
 *     summary: Get full product detail by ID
 *     tags: [Public Products]
 *     description: Returns complete product information including specs, available sizes with stock status, available colors, and full description.
 *     parameters:
 *       - name: productId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Product detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 skuCode: { type: string }
 *                 name: { type: string }
 *                 brand: { type: string, nullable: true }
 *                 price: { type: number }
 *                 department: { type: string }
 *                 style: { type: string }
 *                 description: { type: string, nullable: true }
 *                 material: { type: string, nullable: true }
 *                 heelType: { type: string, nullable: true }
 *                 mainImage: { type: string, nullable: true }
 *                 rating: { type: number, nullable: true }
 *                 category: { type: string, nullable: true }
 *                 color: { type: string, nullable: true }
 *                 availableSizes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       label: { type: string }
 *                       inStock: { type: boolean }
 *                 availableColors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       colorId: { type: integer }
 *                       name: { type: string }
 *                       code: { type: string }
 *                 specs:
 *                   type: object
 *                   additionalProperties: { type: string, nullable: true }
 *       400:
 *         description: Invalid product ID format
 *       404:
 *         description: Product not found
 */
router.get('/:productId', (req: Request, res: Response): void => {
  const productId = req.params.productId as string;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(productId)) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'productId must be a valid UUID.' } });
    return;
  }

  const product = publicProductService.getProductById(productId);
  if (!product) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found.' } });
    return;
  }
  res.json(product);
});

export default router;
