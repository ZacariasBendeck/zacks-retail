import { Router, type IRouter, type Request, type Response } from 'express';
import { getCasePackByCode, listCasePacks } from '../services/casePackService';

const router: IRouter = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const casePacks = await listCasePacks();
    res.json({ casePacks });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

router.get('/:code', async (req: Request, res: Response) => {
  try {
    const casePack = await getCasePackByCode(String(req.params.code));
    if (!casePack) {
      res.status(404).json({ error: { code: 'CASE_PACK_NOT_FOUND', message: 'Case pack not found.' } });
      return;
    }
    res.json({ casePack });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

export default router;
