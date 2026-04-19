import { Router, Request, Response, IRouter } from 'express';
import {
  searchPosSkus,
  getPosSku,
  getPriceSlots,
  listActivePromotions,
  listReturnCodes,
} from '../services/ricsProductAdapter';

const router: IRouter = Router();

/**
 * @openapi
 * /api/v1/pos/skus:
 *   get:
 *     summary: Search SKUs against the live RICS InventoryMaster for the register
 *     tags: [POS]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 */
router.get('/skus', async (req: Request, res: Response): Promise<void> => {
  const q = (req.query.q as string | undefined)?.trim();
  const limitRaw = Number(req.query.limit ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
  if (!q) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'q is required' } });
    return;
  }
  try {
    const data = await searchPosSkus(q, limit);
    res.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'SKU search failed';
    res.status(500).json({ error: { code: 'RICS_READ_FAILED', message } });
  }
});

/**
 * @openapi
 * /api/v1/pos/skus/{skuCode}:
 *   get:
 *     summary: Get a single SKU from RICS by code
 *     tags: [POS]
 */
router.get('/skus/:skuCode', async (req: Request, res: Response): Promise<void> => {
  try {
    const sku = await getPosSku(req.params.skuCode as string);
    if (!sku) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SKU not found' } });
      return;
    }
    res.json(sku);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'SKU lookup failed';
    res.status(500).json({ error: { code: 'RICS_READ_FAILED', message } });
  }
});

/**
 * @openapi
 * /api/v1/pos/skus/{skuCode}/price-slots:
 *   get:
 *     summary: Get List / Retail / MD1 / MD2 price slots + next-price rotation for a SKU (RICS p. 32)
 *     tags: [POS]
 */
router.get('/skus/:skuCode/price-slots', async (req: Request, res: Response): Promise<void> => {
  try {
    const slots = await getPriceSlots(req.params.skuCode as string);
    if (!slots) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SKU not found' } });
      return;
    }
    res.json(slots);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Price slot lookup failed';
    res.status(500).json({ error: { code: 'RICS_READ_FAILED', message } });
  }
});

/**
 * @openapi
 * /api/v1/pos/promotions:
 *   get:
 *     summary: List currently-active promotion codes for the promo picker (RICS p. 167)
 *     tags: [POS]
 */
router.get('/promotions', async (req: Request, res: Response): Promise<void> => {
  const storeId = Number(req.query.storeId ?? 1);
  const data = await listActivePromotions(storeId, new Date());
  res.json({ data });
});

/**
 * @openapi
 * /api/v1/pos/return-codes:
 *   get:
 *     summary: List available return codes (RICS p. 166)
 *     tags: [POS]
 */
router.get('/return-codes', async (_req: Request, res: Response): Promise<void> => {
  const data = await listReturnCodes();
  res.json({ data });
});

export default router;
