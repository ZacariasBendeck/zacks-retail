import { Router, Request, Response, IRouter } from 'express';
import * as pw from '../services/salesPasswordService';
import { SalesPasswordKind } from '../models/salesPos';
import { setPasswordSchema, verifyPasswordSchema, validate } from '../middleware/salesPosValidation';

const router: IRouter = Router();

function parseKind(raw: string): SalesPasswordKind | null {
  const k = raw.toUpperCase();
  if (k === 'MANAGER' || k === 'TICKET') return k;
  return null;
}

router.get('/stores/:storeId/sales-passwords/:kind/status', (req: Request, res: Response): void => {
  const kind = parseKind((req.params.kind as string));
  if (!kind) {
    res.status(400).json({ error: { code: 'INVALID_KIND', message: 'kind must be MANAGER or TICKET.' } });
    return;
  }
  res.json(pw.getStatus(Number((req.params.storeId as string)), kind));
});

router.put('/stores/:storeId/sales-passwords/:kind', validate(setPasswordSchema), (req: Request, res: Response): void => {
  const kind = parseKind((req.params.kind as string));
  if (!kind) {
    res.status(400).json({ error: { code: 'INVALID_KIND', message: 'kind must be MANAGER or TICKET.' } });
    return;
  }
  const result = pw.setPassword(Number((req.params.storeId as string)), kind, req.body.plain, req.body.updatedByUserId);
  res.json(result);
});

router.post('/stores/:storeId/sales-passwords/:kind/verify', validate(verifyPasswordSchema), (req: Request, res: Response): void => {
  const kind = parseKind((req.params.kind as string));
  if (!kind) {
    res.status(400).json({ error: { code: 'INVALID_KIND', message: 'kind must be MANAGER or TICKET.' } });
    return;
  }
  const ok = pw.verify(Number((req.params.storeId as string)), kind, req.body.plain);
  res.status(ok ? 200 : 401).json({ ok });
});

export default router;
