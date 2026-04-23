import { Router, Request, Response, IRouter } from 'express';
import {
  searchPosSkus,
  getPosSku,
  getPriceSlots,
  listActivePromotions,
  listReturnCodes,
} from '../services/ricsProductAdapter';
import { skuGate } from '../services/products/skuLifecycleGate';
import { repoHttpStatus, repoHttpCode } from '../repositories/rics/repoResult';

const router: IRouter = Router();

/**
 * Phase 5g gate — checks if the given `code` matches a non-ACTIVE SKU in
 * `app.sku` (the lifecycle table). If so, we short-circuit with the typed
 * error so a cashier can't ring up a DRAFT or DISCONTINUED SKU. Legacy RICS
 * SKUs (not in app.sku) pass through and hit the normal RICS adapter below.
 *
 * Returns `true` when the route handler must stop (response already sent).
 * See docs/operations/sku-lifecycle-gate.md.
 */
async function gateBlocksPosRead(code: string, res: Response): Promise<boolean> {
  const result = await skuGate.findActiveSku({ code });
  if (result.ok) return false; // either no match (Ok(null)) or ACTIVE match — proceed
  // Non-ACTIVE SKU matched — block with the gate's Spanish message.
  res.status(repoHttpStatus(result.error)).json({
    error: { code: repoHttpCode(result.error), message: result.error.message },
  });
  return true;
}

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
    const code = req.params.skuCode as string;
    if (await gateBlocksPosRead(code, res)) return;
    const sku = await getPosSku(code);
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
    const code = req.params.skuCode as string;
    if (await gateBlocksPosRead(code, res)) return;
    const slots = await getPriceSlots(code);
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
