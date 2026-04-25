import { Router, type IRouter, type Request, type Response } from 'express';
import {
  createManualReturnSchema,
  manualReturnContextQuerySchema,
  manualReturnListQuerySchema,
  validate,
  validateQuery,
} from '../middleware/validation';
import {
  createManualReturn,
  getManualReturnById,
  getManualReturnContext,
  isManualReturnServiceError,
  listManualReturnStores,
  listManualReturns,
} from '../services/manualReturnService';

const router: IRouter = Router();

function actorFromRequest(req: Request): string | null {
  const user = (req as Request & { user?: { id?: string; email?: string; displayName?: string } }).user;
  return user?.displayName?.trim() || user?.email?.trim() || user?.id || null;
}

router.get('/stores', async (_req: Request, res: Response) => {
  try {
    const result = await listManualReturnStores();
    res.json(result);
  } catch (err) {
    if (isManualReturnServiceError(err)) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

router.get(
  '/context',
  validateQuery(manualReturnContextQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const query = (req as any).validatedQuery;
      const result = await getManualReturnContext(query);
      res.json(result);
    } catch (err) {
      if (isManualReturnServiceError(err)) {
        res.status(err.status).json({ error: { code: err.code, message: err.message } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
    }
  },
);

router.get(
  '/',
  validateQuery(manualReturnListQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const query = (req as any).validatedQuery;
      const result = await listManualReturns(query);
      res.json(result);
    } catch (err) {
      if (isManualReturnServiceError(err)) {
        res.status(err.status).json({ error: { code: err.code, message: err.message } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
    }
  },
);

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const row = await getManualReturnById(String(req.params.id ?? ''));
    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Manual return not found.' } });
      return;
    }
    res.json(row);
  } catch (err) {
    if (isManualReturnServiceError(err)) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

router.post('/', validate(createManualReturnSchema), async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const result = await createManualReturn(payload, actorFromRequest(req));
    res.status(result.created ? 201 : 200).json(result.record);
  } catch (err) {
    if (isManualReturnServiceError(err)) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

export default router;
