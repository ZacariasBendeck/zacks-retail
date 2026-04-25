import { Router, type IRouter, type Request, type Response } from 'express';
import {
  updateReplenishmentTargetSchema,
  validate,
} from '../middleware/validation';
import {
  getReplenishmentTargetBySkuCode,
  isReplenishmentTargetServiceError,
  updateReplenishmentTargetStore,
} from '../services/replenishmentTargetService';

const router: IRouter = Router();

function actorFromRequest(req: Request): string | null {
  const user = (req as Request & { user?: { id?: string; email?: string; displayName?: string } }).user;
  return user?.displayName?.trim() || user?.email?.trim() || user?.id || null;
}

router.get('/:skuCode', async (req: Request, res: Response) => {
  try {
    const result = await getReplenishmentTargetBySkuCode(String(req.params.skuCode ?? ''));
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SKU not found.' } });
      return;
    }
    res.json(result);
  } catch (err) {
    if (isReplenishmentTargetServiceError(err)) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

router.put('/:skuCode/:storeId', validate(updateReplenishmentTargetSchema), async (req: Request, res: Response) => {
  try {
    const skuCode = String(req.params.skuCode ?? '');
    const storeId = Number(req.params.storeId ?? 0);
    const payload = req.body;
    const result = await updateReplenishmentTargetStore(skuCode, storeId, payload, actorFromRequest(req));
    res.json(result);
  } catch (err) {
    if (isReplenishmentTargetServiceError(err)) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

export default router;
