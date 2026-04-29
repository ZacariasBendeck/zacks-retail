/**
 * Product Matching Set / Conjunto routes.
 *
 * Mount at /api/v1/products/matching-sets.
 */
import { Router, Request, Response, IRouter } from 'express';
import { matchingSetService } from '../../services/products/matchingSetService';
import {
  computeMatchingSetBuyingPlan,
  createPurchaseOrderFromMatchingSetPlan,
  saveMatchingSetBuyingPlan,
} from '../../services/products/matchingSetBuyingPlanService';
import {
  repoHttpCode,
  repoHttpStatus,
  type RepoError,
  type Result,
} from '../../repositories/rics/repoResult';

const router: IRouter = Router();

function send<T>(res: Response, result: Result<T>, successStatus = 200): void {
  if (result.ok) {
    res.status(successStatus).json(result.value);
    return;
  }
  const err = result.error as RepoError;
  res.status(repoHttpStatus(err)).json({
    error: { code: repoHttpCode(err), message: err.message },
  });
}

function resolveActor(req: Request): string {
  const u = (req as Request & { user?: { id?: string; email?: string } }).user;
  return u?.email ?? u?.id ?? 'system';
}

function boolParam(v: unknown): boolean | null {
  if (v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(s)) return true;
  if (['false', '0', 'no'].includes(s)) return false;
  return null;
}

function intParam(v: unknown): number | null {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

// Type and role admin must be declared before /:id.
router.get('/types', async (_req: Request, res: Response) => {
  send(res, await matchingSetService.listTypes());
});

router.post('/types', async (req: Request, res: Response) => {
  send(res, await matchingSetService.createType(req.body ?? {}, resolveActor(req)), 201);
});

router.patch('/types/:code', async (req: Request, res: Response) => {
  send(res, await matchingSetService.patchType(String(req.params.code), req.body ?? {}, resolveActor(req)));
});

router.post('/types/:code/roles', async (req: Request, res: Response) => {
  send(res, await matchingSetService.createRole(String(req.params.code), req.body ?? {}, resolveActor(req)), 201);
});

router.patch('/types/:code/roles/:roleCode', async (req: Request, res: Response) => {
  send(
    res,
    await matchingSetService.patchRole(
      String(req.params.code),
      String(req.params.roleCode),
      req.body ?? {},
      resolveActor(req),
    ),
  );
});

router.get('/by-sku/:skuRef', async (req: Request, res: Response) => {
  send(res, await matchingSetService.getBySku(String(req.params.skuRef)));
});

router.get('/', async (req: Request, res: Response) => {
  send(
    res,
    await matchingSetService.list({
      q: typeof req.query.q === 'string' ? req.query.q : null,
      setType: typeof req.query.setType === 'string' ? req.query.setType : null,
      vendorId: typeof req.query.vendorId === 'string' ? req.query.vendorId : null,
      sku: typeof req.query.sku === 'string' ? req.query.sku : null,
      role: typeof req.query.role === 'string' ? req.query.role : null,
      active: boolParam(req.query.active),
      hasGap: boolParam(req.query.hasGap),
      page: intParam(req.query.page),
      pageSize: intParam(req.query.pageSize),
    }),
  );
});

router.post('/', async (req: Request, res: Response) => {
  send(res, await matchingSetService.create(req.body ?? {}, resolveActor(req)), 201);
});

router.get('/:id', async (req: Request, res: Response) => {
  send(res, await matchingSetService.get(String(req.params.id)));
});

router.patch('/:id', async (req: Request, res: Response) => {
  send(res, await matchingSetService.patch(String(req.params.id), req.body ?? {}, resolveActor(req)));
});

router.post('/:id/archive', async (req: Request, res: Response) => {
  send(res, await matchingSetService.setActive(String(req.params.id), false, resolveActor(req)));
});

router.post('/:id/restore', async (req: Request, res: Response) => {
  send(res, await matchingSetService.setActive(String(req.params.id), true, resolveActor(req)));
});

router.get('/:id/gaps', async (req: Request, res: Response) => {
  const result = await matchingSetService.get(String(req.params.id));
  if (!result.ok) {
    send(res, result);
    return;
  }
  res.json(result.value.gaps);
});

router.get('/:id/buying-plan', async (req: Request, res: Response) => {
  send(
    res,
    await computeMatchingSetBuyingPlan(String(req.params.id), {
      chainId: typeof req.query.chainId === 'string' ? req.query.chainId : null,
      receiptMonth: typeof req.query.receiptMonth === 'string' ? req.query.receiptMonth : null,
      horizonWeeks: intParam(req.query.horizonWeeks),
      targetCoverWeeks: intParam(req.query.targetCoverWeeks),
    }),
  );
});

router.post('/:id/buying-plan', async (req: Request, res: Response) => {
  send(
    res,
    await saveMatchingSetBuyingPlan(
      String(req.params.id),
      req.body ?? {},
      resolveActor(req),
    ),
    201,
  );
});

router.post('/buying-plans/:planId/create-po', async (req: Request, res: Response) => {
  send(
    res,
    await createPurchaseOrderFromMatchingSetPlan(String(req.params.planId), resolveActor(req)),
    201,
  );
});

router.post('/:id/members', async (req: Request, res: Response) => {
  send(res, await matchingSetService.addMember(String(req.params.id), req.body ?? {}, resolveActor(req)), 201);
});

router.patch('/:id/members/:skuId', async (req: Request, res: Response) => {
  send(
    res,
    await matchingSetService.patchMember(
      String(req.params.id),
      String(req.params.skuId),
      req.body ?? {},
      resolveActor(req),
    ),
  );
});

router.delete('/:id/members/:skuId', async (req: Request, res: Response) => {
  send(
    res,
    await matchingSetService.removeMember(
      String(req.params.id),
      String(req.params.skuId),
      resolveActor(req),
    ),
  );
});

export default router;
