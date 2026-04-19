/**
 * Vendor routes — CRUD endpoints for RICS `Vendor Master` + `Vendor Accounts`.
 *
 * Mount at /api/v1/vendors.
 *
 * Error mapping follows the shared `repoHttpStatus()` helper used by
 * taxonomyRoutes.ts — NotFound → 404, ConstraintViolation → 422,
 * DuplicatePrimaryKey / Concurrent → 409, AccessConnectionError → 503.
 */

import { Router, Request, Response, IRouter } from 'express';
import { vendorService } from '../../services/products/vendorService';
import {
  repoHttpStatus,
  repoHttpCode,
  type Result,
  type RepoError,
} from '../../repositories/rics/repoResult';

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

function paramString(raw: unknown): string {
  if (Array.isArray(raw)) return String(raw[0] ?? '');
  return String(raw ?? '');
}

function parseInt32(raw: unknown): number | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return parseInt32(raw[0]);
  }
  const n = typeof raw === 'number' ? raw : Number(raw as string);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

// ─────────────────────── Vendor CRUD ────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const qRaw = req.query.q;
  const limitRaw = req.query.limit;
  const q = typeof qRaw === 'string' ? qRaw : undefined;
  const limit = typeof limitRaw === 'string' ? Number(limitRaw) : undefined;
  send(res, await vendorService.list(q, Number.isFinite(limit) ? limit : undefined));
});

router.get('/sku-counts', async (_req: Request, res: Response) => {
  send(res, await vendorService.skuCountsAll());
});

router.get('/:code', async (req: Request, res: Response) => {
  send(res, await vendorService.get(paramString(req.params.code)));
});

router.get('/:code/sku-count', async (req: Request, res: Response) => {
  send(res, await vendorService.skuCount(paramString(req.params.code)));
});

router.post('/', async (req: Request, res: Response) => {
  send(res, await vendorService.create(req.body), 201);
});

router.patch('/:code', async (req: Request, res: Response) => {
  send(res, await vendorService.update(paramString(req.params.code), req.body));
});

router.delete('/:code', async (req: Request, res: Response) => {
  send(res, await vendorService.delete(paramString(req.params.code)), 204);
});

// ─────────────────────── Per-store accounts ─────────────────────────────────

router.get('/:code/store-accounts', async (req: Request, res: Response) => {
  send(res, await vendorService.listStoreAccounts(paramString(req.params.code)));
});

router.put('/:code/store-accounts/:storeId', async (req: Request, res: Response) => {
  const storeId = parseInt32(req.params.storeId);
  if (storeId == null) {
    res
      .status(400)
      .json({ error: { code: 'INVALID_PARAM', message: 'storeId must be an integer.' } });
    return;
  }
  const accountNo =
    typeof req.body?.accountNo === 'string'
      ? req.body.accountNo
      : typeof req.body?.account === 'string'
      ? req.body.account
      : '';
  if (!accountNo) {
    res
      .status(400)
      .json({ error: { code: 'INVALID_PARAM', message: 'accountNo is required.' } });
    return;
  }
  send(
    res,
    await vendorService.upsertStoreAccount(paramString(req.params.code), storeId, accountNo),
  );
});

router.delete('/:code/store-accounts/:storeId', async (req: Request, res: Response) => {
  const storeId = parseInt32(req.params.storeId);
  if (storeId == null) {
    res
      .status(400)
      .json({ error: { code: 'INVALID_PARAM', message: 'storeId must be an integer.' } });
    return;
  }
  send(
    res,
    await vendorService.deleteStoreAccount(paramString(req.params.code), storeId),
    204,
  );
});

export default router;
