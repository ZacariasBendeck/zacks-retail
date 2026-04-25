import { Router, type IRouter, type Request, type Response } from 'express';
import {
  createAutoTransferRunSchema,
  createBalancingTransferRunSchema,
  createBalancingTransferRunV2Schema,
  validate,
} from '../middleware/validation';
import {
  commitAutoTransferRun,
  commitBalancingTransferRun,
  createAutoTransferRun,
  createBalancingTransferRun,
  getAutoTransferRunPreview,
  getBalancingTransferRunPreview,
  isTransferRunServiceError,
  listTransferStores,
} from '../services/transferRunService';
import {
  commitBalancingTransferRunV2,
  createBalancingTransferRunV2,
  getBalancingTransferRunPreviewV2,
} from '../services/transferRunServiceV2';

const router: IRouter = Router();

function actorFromRequest(req: Request): string | null {
  const user = (req as Request & { user?: { id?: string; email?: string; displayName?: string } }).user;
  return user?.displayName?.trim() || user?.email?.trim() || user?.id || null;
}

function handleError(err: unknown, res: Response): void {
  if (isTransferRunServiceError(err)) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
}

router.get('/transfer-stores', async (_req: Request, res: Response) => {
  try {
    const stores = await listTransferStores();
    res.json(stores);
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/auto-transfer-runs', validate(createAutoTransferRunSchema), async (req: Request, res: Response) => {
  try {
    const result = await createAutoTransferRun(req.body, actorFromRequest(req));
    res.status(201).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

router.get('/auto-transfer-runs/:id/preview', async (req: Request, res: Response) => {
  try {
    const result = await getAutoTransferRunPreview(String(req.params.id ?? ''));
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Automatic transfer preview not found.' } });
      return;
    }
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/auto-transfer-runs/:id/commit', async (req: Request, res: Response) => {
  try {
    const result = await commitAutoTransferRun(String(req.params.id ?? ''));
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/balancing-transfer-runs', validate(createBalancingTransferRunSchema), async (req: Request, res: Response) => {
  try {
    const result = await createBalancingTransferRun(req.body, actorFromRequest(req));
    res.status(201).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

router.get('/balancing-transfer-runs/:id/preview', async (req: Request, res: Response) => {
  try {
    const result = await getBalancingTransferRunPreview(String(req.params.id ?? ''));
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Balancing transfer preview not found.' } });
      return;
    }
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/balancing-transfer-runs/:id/commit', async (req: Request, res: Response) => {
  try {
    const result = await commitBalancingTransferRun(String(req.params.id ?? ''));
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/balancing-transfer-runs-v2', validate(createBalancingTransferRunV2Schema), async (req: Request, res: Response) => {
  try {
    const result = await createBalancingTransferRunV2(req.body, actorFromRequest(req));
    res.status(201).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

router.get('/balancing-transfer-runs-v2/:id/preview', async (req: Request, res: Response) => {
  try {
    const result = await getBalancingTransferRunPreviewV2(String(req.params.id ?? ''));
    if (!result) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Balancing transfer v2 preview not found.' } });
      return;
    }
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/balancing-transfer-runs-v2/:id/commit', async (req: Request, res: Response) => {
  try {
    const result = await commitBalancingTransferRunV2(String(req.params.id ?? ''));
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
