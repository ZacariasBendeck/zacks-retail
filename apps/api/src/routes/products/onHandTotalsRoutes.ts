/**
 * Batch on-hand totals: POST a list of SKU codes, get back `{ [sku]: total }`.
 *
 * Mount at /api/v1/products/skus/on-hand-totals.
 */

import { Router, type IRouter, type Request, type Response } from 'express';
import { getOnHandTotals } from '../../services/products/onHandTotalsService';

const router: IRouter = Router();

router.post('/', async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const skus = Array.isArray(body.skus) ? body.skus.filter((s: unknown) => typeof s === 'string') : [];
  try {
    const map = await getOnHandTotals(skus);
    const obj: Record<string, number> = {};
    for (const [k, v] of map) obj[k] = v;
    res.json(obj);
  } catch (err) {
    res.status(500).json({ error: { code: 'InternalError', message: (err as Error).message } });
  }
});

export default router;
