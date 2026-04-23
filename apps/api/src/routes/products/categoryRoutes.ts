/**
 * Product Module — category lookup routes. Mount at /api/v1/products/categories.
 *
 *   GET / — every RICS category joined with its Product Family + department.
 *           Used by the SKU form's Categoría picker. Ordered by family
 *           sort_order → department number → category number so the grouped
 *           dropdown renders stably.
 *
 * NOTE: resolution of a single category → family lives at
 * /api/v1/products/families/by-category/:num (familyRoutes.ts). We don't add
 * a /:num route here to avoid ambiguity with the families path.
 */
import { Router, Request, Response, IRouter } from 'express';
import { listAllCategoriesWithFamily } from '../../services/products/productFamilyService';

const router: IRouter = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await listAllCategoriesWithFamily();
    res.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: { code: 'INTERNAL', message } });
  }
});

export default router;
