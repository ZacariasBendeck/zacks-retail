import { Router, Request, Response, IRouter } from 'express';
import * as svc from '../services/otbPlanRowService';
import {
  createOtbPlanRowSchema,
  updateOtbPlanRowSchema,
  otbPlanRowListQuerySchema,
  otbPlanRowCopySchema,
  otbPlanRowRecalcSchema,
  validate,
  validateQuery,
} from '../middleware/validation';

const router: IRouter = Router();

type ServiceError = { code: string } & Record<string, unknown>;

function respondWithError(res: Response, err: ServiceError): void {
  const status =
    err.code === 'NOT_FOUND' ? 404 :
    err.code === 'DUPLICATE_KEY' ? 409 :
    err.code === 'INVALID_MONTHLY_ARRAY_LENGTH' ? 400 :
    err.code === 'INVALID_GP_PCT' ? 400 :
    500;
  res.status(status).json({ error: { code: err.code, detail: err } });
}

router.post('/', validate(createOtbPlanRowSchema), (req: Request, res: Response): void => {
  const r = svc.createOtbPlanRow(req.body);
  if ('code' in r) return respondWithError(res, r);
  res.status(201).json(r);
});

router.get('/', validateQuery(otbPlanRowListQuerySchema), (req: Request, res: Response): void => {
  const params = (req as Request & { validatedQuery: svc.ListParams }).validatedQuery;
  res.json(svc.listOtbPlanRows(params));
});

router.get('/:id', (req: Request, res: Response): void => {
  const r = svc.getOtbPlanRow(req.params.id as string);
  if ('code' in r) return respondWithError(res, r);
  res.json(r);
});

router.patch('/:id', validate(updateOtbPlanRowSchema), (req: Request, res: Response): void => {
  const r = svc.updateOtbPlanRow(req.params.id as string, req.body);
  if ('code' in r) return respondWithError(res, r);
  res.json(r);
});

router.delete('/:id', (req: Request, res: Response): void => {
  const r = svc.deleteOtbPlanRow(req.params.id as string);
  if ('code' in r) return respondWithError(res, r);
  res.status(204).send();
});

router.post('/:id/recalculate', validate(otbPlanRowRecalcSchema), (req: Request, res: Response): void => {
  const r = svc.recalculatePlannedSales(req.params.id as string, req.body.changedBy);
  if ('code' in r) return respondWithError(res, r);
  res.json(r);
});

router.post('/:id/copy', validate(otbPlanRowCopySchema), (req: Request, res: Response): void => {
  const r = svc.copyOtbPlanRow(req.params.id as string, req.body.targetStoreId, req.body.targetCategoryId, req.body.changedBy);
  if ('code' in r) return respondWithError(res, r);
  res.status(201).json(r);
});

router.get('/:id/audit', (req: Request, res: Response): void => {
  const exists = svc.getOtbPlanRow(req.params.id as string);
  if ('code' in exists) return respondWithError(res, exists);
  res.json(svc.getOtbPlanRowAudit(req.params.id as string));
});

export default router;
