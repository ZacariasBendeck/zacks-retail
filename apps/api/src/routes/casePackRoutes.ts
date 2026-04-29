import { Router, type IRouter, type Request, type Response } from 'express';
import { getCasePackByCode, listCasePacks } from '../services/casePackService';

const router: IRouter = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const rawSizeTypeCode = req.query.sizeTypeCode;
    const sizeTypeCode = rawSizeTypeCode == null || rawSizeTypeCode === ''
      ? undefined
      : Number(rawSizeTypeCode);
    if (sizeTypeCode != null && (!Number.isInteger(sizeTypeCode) || sizeTypeCode < 0)) {
      res.status(400).json({
        error: { code: 'INVALID_SIZE_TYPE_CODE', message: 'sizeTypeCode must be a positive integer.' },
      });
      return;
    }
    const casePacks = await listCasePacks({ sizeTypeCode });
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
