import { Router, Request, Response, IRouter } from 'express';
import * as svc from '../services/companySettingsService';
import { otbEntryMethodSchema, validate } from '../middleware/validation';

const router: IRouter = Router();

router.get('/otb-entry-method', (_req: Request, res: Response): void => {
  res.json({ value: svc.getOtbEntryMethod() });
});

router.put('/otb-entry-method', validate(otbEntryMethodSchema), (req: Request, res: Response): void => {
  svc.setOtbEntryMethod(req.body.value, req.body.changedBy);
  res.json({ value: svc.getOtbEntryMethod() });
});

export default router;
