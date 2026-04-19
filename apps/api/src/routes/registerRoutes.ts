import { Router, Request, Response, IRouter } from 'express';
import * as registerService from '../services/registerService';
import { createRegisterSchema, updateRegisterSchema, validate } from '../middleware/salesPosValidation';

const router: IRouter = Router();

router.get('/stores', (_req: Request, res: Response): void => {
  res.json({ stores: registerService.listStores() });
});

router.get('/stores/:id', (req: Request, res: Response): void => {
  const store = registerService.getStore(Number((req.params.id as string)));
  if (!store) {
    res.status(404).json({ error: { code: 'STORE_NOT_FOUND', message: 'Store not found.' } });
    return;
  }
  res.json(store);
});

router.get('/registers', (req: Request, res: Response): void => {
  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
  res.json({ registers: registerService.listRegisters(storeId) });
});

router.post('/registers', validate(createRegisterSchema), (req: Request, res: Response): void => {
  try {
    const reg = registerService.createRegister(req.body);
    res.status(201).json(reg);
  } catch (err: any) {
    const code = err?.message || 'INTERNAL_ERROR';
    const map: Record<string, number> = { STORE_NOT_FOUND: 404 };
    res.status(map[code] ?? 500).json({ error: { code, message: err?.message } });
  }
});

router.patch('/registers/:id', validate(updateRegisterSchema), (req: Request, res: Response): void => {
  try {
    const reg = registerService.updateRegister((req.params.id as string), req.body);
    res.json(reg);
  } catch (err: any) {
    const code = err?.message || 'INTERNAL_ERROR';
    const map: Record<string, number> = { REGISTER_NOT_FOUND: 404 };
    res.status(map[code] ?? 500).json({ error: { code, message: err?.message } });
  }
});

router.get('/stores/:storeId/tender-types', (req: Request, res: Response): void => {
  res.json({ tenderTypes: registerService.listTenderTypes(Number((req.params.storeId as string))) });
});

router.get('/stores/:storeId/payout-categories', (req: Request, res: Response): void => {
  res.json({ payoutCategories: registerService.listPayoutCategories(Number((req.params.storeId as string))) });
});

export default router;
