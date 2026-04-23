/**
 * SKU lifecycle routes — mount at /api/v1/products/sku-drafts.
 *
 * All net-new SKUs created by the products module lifecycle live behind this
 * router. The path is named after the primary mode (DRAFT), but the endpoints
 * service every state — DRAFT, ACTIVE, DISCONTINUED.
 *
 * Routes:
 *   GET    /drafts                  — list all DRAFT rows, newest first
 *   POST   /                        — create a DRAFT
 *   GET    /:id                     — fetch any SKU by id (any state)
 *   PATCH  /:id                     — update fields (blocked when DISCONTINUED)
 *   POST   /:id/finalize            — transition DRAFT → ACTIVE (body: { code })
 *   POST   /:id/discontinue         — transition DRAFT/ACTIVE → DISCONTINUED
 *
 * Spec: C:\Users\zbend\.claude\plans\http-localhost-3000-inventory-skus-new-i-piped-galaxy.md
 *       §"Phase 5 — SKU lifecycle"
 */
import { Router, Request, Response, IRouter } from 'express';
import { skuLifecycle } from '../../services/products/skuLifecycleService';
import {
  repoHttpStatus,
  repoHttpCode,
  type Result,
  type RepoError,
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

// GET /drafts — list all DRAFT rows (admin page data source)
router.get('/drafts', async (_req: Request, res: Response) => {
  send(res, await skuLifecycle.listDrafts());
});

// POST / — create a DRAFT with an auto-generated provisional_code
router.post('/', async (req: Request, res: Response) => {
  send(res, await skuLifecycle.create(req.body ?? {}, resolveActor(req)), 201);
});

// GET /:id — fetch any SKU by id (any state; the name is a historical lie)
router.get('/:id', async (req: Request, res: Response) => {
  send(res, await skuLifecycle.getById(String(req.params.id)));
});

// PATCH /:id — update fields. Lifecycle service enforces the state gates.
router.patch('/:id', async (req: Request, res: Response) => {
  send(res, await skuLifecycle.update(String(req.params.id), req.body ?? {}, resolveActor(req)));
});

// POST /:id/finalize — DRAFT → ACTIVE. Body: { code: string, data?: UpdateSkuInput }
// `data` is the atomic-patch (Phase 5f.1) — fields are persisted + validated +
// state is flipped in a single transaction. Without `data`, finalize only runs
// against whatever the row already has.
router.post('/:id/finalize', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : '';
  const data =
    body.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : undefined;
  send(
    res,
    await skuLifecycle.finalize(
      String(req.params.id),
      { code, data: data as Parameters<typeof skuLifecycle.finalize>[1]['data'] },
      resolveActor(req),
    ),
  );
});

// POST /:id/discontinue — DRAFT/ACTIVE → DISCONTINUED
router.post('/:id/discontinue', async (req: Request, res: Response) => {
  send(res, await skuLifecycle.discontinue(String(req.params.id), resolveActor(req)));
});

export default router;
