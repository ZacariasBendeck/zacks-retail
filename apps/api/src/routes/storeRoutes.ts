import { Router, type IRouter, type Request, type Response } from 'express';
import {
  getStoreById,
  isStoreServiceError,
  listStores,
} from '../services/storeService';

const router: IRouter = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const stores = await listStores();
    res.json({ stores });
  } catch (err) {
    if (isStoreServiceError(err)) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const store = await getStoreById(id);
    if (!store) {
      res.status(404).json({ error: { code: 'STORE_NOT_FOUND', message: 'Store not found.' } });
      return;
    }
    res.json(store);
  } catch (err) {
    if (isStoreServiceError(err)) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

export default router;
