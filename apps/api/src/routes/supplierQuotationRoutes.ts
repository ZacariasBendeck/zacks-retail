import { Router, Request, Response, IRouter } from 'express';
import { supplierQuotationService } from '../services/supplierQuotationService';
import {
  repoHttpCode,
  repoHttpStatus,
  type RepoError,
  type Result,
} from '../repositories/rics/repoResult';

const router: IRouter = Router();

function send<T>(res: Response, result: Result<T>, successStatus = 200): void {
  if (result.ok) {
    if (result.value === undefined) {
      res.status(successStatus === 200 ? 204 : successStatus).send();
      return;
    }
    res.status(successStatus).json(result.value);
    return;
  }
  const err = result.error as RepoError;
  res
    .status(repoHttpStatus(err))
    .json({ error: { code: repoHttpCode(err), message: err.message } });
}

function resolveActor(req: Request): string {
  const u = (req as Request & { user?: { id?: string; email?: string } }).user;
  return u?.email ?? u?.id ?? 'system';
}

function intParam(v: unknown): number | null {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

// Line-specific routes must be declared before /:id.
router.get('/lines/:lineId/similarity', async (req: Request, res: Response) => {
  send(res, await supplierQuotationService.similarity(String(req.params.lineId)));
});

router.post('/lines/:lineId/relations', async (req: Request, res: Response) => {
  send(
    res,
    await supplierQuotationService.addRelation(
      String(req.params.lineId),
      req.body ?? {},
      resolveActor(req),
    ),
    201,
  );
});

router.delete('/relations/:relationId', async (req: Request, res: Response) => {
  send(
    res,
    await supplierQuotationService.removeRelation(String(req.params.relationId), resolveActor(req)),
    204,
  );
});

router.patch('/lines/:lineId/decision', async (req: Request, res: Response) => {
  send(
    res,
    await supplierQuotationService.decideLine(
      String(req.params.lineId),
      req.body ?? {},
      resolveActor(req),
    ),
  );
});

router.patch('/lines/:lineId', async (req: Request, res: Response) => {
  send(
    res,
    await supplierQuotationService.updateLine(
      String(req.params.lineId),
      req.body ?? {},
      resolveActor(req),
    ),
  );
});

router.delete('/lines/:lineId', async (req: Request, res: Response) => {
  send(
    res,
    await supplierQuotationService.deleteLine(String(req.params.lineId), resolveActor(req)),
    204,
  );
});

router.get('/', async (req: Request, res: Response) => {
  send(
    res,
    await supplierQuotationService.list({
      q: typeof req.query.q === 'string' ? req.query.q : null,
      status: typeof req.query.status === 'string' ? req.query.status : null,
      vendorCode: typeof req.query.vendorCode === 'string' ? req.query.vendorCode : null,
      buyer: typeof req.query.buyer === 'string' ? req.query.buyer : null,
      pageSize: intParam(req.query.pageSize),
    }),
  );
});

router.post('/', async (req: Request, res: Response) => {
  send(res, await supplierQuotationService.create(req.body ?? {}, resolveActor(req)), 201);
});

router.get('/:id', async (req: Request, res: Response) => {
  send(res, await supplierQuotationService.get(String(req.params.id)));
});

router.patch('/:id', async (req: Request, res: Response) => {
  send(
    res,
    await supplierQuotationService.update(String(req.params.id), req.body ?? {}, resolveActor(req)),
  );
});

router.post('/:id/archive', async (req: Request, res: Response) => {
  send(res, await supplierQuotationService.archive(String(req.params.id), resolveActor(req)));
});

router.post('/:id/lines', async (req: Request, res: Response) => {
  send(
    res,
    await supplierQuotationService.addLine(String(req.params.id), req.body ?? {}, resolveActor(req)),
    201,
  );
});

router.post('/:id/convert-to-po', async (req: Request, res: Response) => {
  send(
    res,
    await supplierQuotationService.convertAcceptedToPurchaseOrders(String(req.params.id), resolveActor(req)),
    201,
  );
});

export default router;
