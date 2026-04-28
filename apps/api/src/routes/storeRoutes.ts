import { Router, type IRouter, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import {
  assignStoreToChain,
  createStoreChain,
  getStoreById,
  isStoreServiceError,
  listStoreChains,
  listStores,
  updateStoreChain,
} from '../services/storeService';

const router: IRouter = Router();

const createStoreChainSchema = z.object({
  code: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

const updateStoreChainSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
}).refine((value) => value.label !== undefined || value.active !== undefined || value.sortOrder !== undefined, {
  message: 'At least one field must be provided.',
});

const assignStoreChainSchema = z.object({
  chainId: z.string().min(1).max(64).nullable(),
});

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

router.get('/chains', async (_req: Request, res: Response) => {
  try {
    const chains = await listStoreChains();
    res.json({ chains });
  } catch (err) {
    if (isStoreServiceError(err)) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

router.post('/chains', validate(createStoreChainSchema), async (req: Request, res: Response) => {
  try {
    const chain = await createStoreChain(req.body as z.infer<typeof createStoreChainSchema>);
    res.status(201).json({ chain });
  } catch (err) {
    if (isStoreServiceError(err)) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

router.patch('/chains/:id', validate(updateStoreChainSchema), async (req: Request, res: Response) => {
  try {
    const chain = await updateStoreChain(String(req.params.id), req.body as z.infer<typeof updateStoreChainSchema>);
    res.json({ chain });
  } catch (err) {
    if (isStoreServiceError(err)) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

router.put('/:id/chain', validate(assignStoreChainSchema), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const store = await assignStoreToChain(id, (req.body as z.infer<typeof assignStoreChainSchema>).chainId);
    res.json({ store });
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
