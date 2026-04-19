/**
 * SKU routes — CRUD endpoints for the products-module SKU admin.
 *
 * Mount at /api/v1/products/skus.
 */

import { Router, Request, Response, IRouter } from 'express';
import { skuService } from '../../services/products/skuService';
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

router.get('/', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const vendor = typeof req.query.vendor === 'string' ? req.query.vendor : undefined;
  const category = parseInt32(req.query.category) ?? undefined;
  const season = typeof req.query.season === 'string' ? req.query.season : undefined;
  const group = typeof req.query.group === 'string' ? req.query.group : undefined;
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword : undefined;
  const limit = parseInt32(req.query.limit) ?? undefined;
  const offset = parseInt32(req.query.offset) ?? undefined;
  send(
    res,
    await skuService.list({ q, vendor, category, season, group, keyword, limit, offset }),
  );
});

router.get('/:code', async (req: Request, res: Response) => {
  send(res, await skuService.get(paramString(req.params.code)));
});

router.post('/', async (req: Request, res: Response) => {
  send(res, await skuService.create(req.body), 201);
});

router.patch('/:code', async (req: Request, res: Response) => {
  send(res, await skuService.update(paramString(req.params.code), req.body));
});

router.delete('/:code', async (req: Request, res: Response) => {
  send(res, await skuService.delete(paramString(req.params.code)), 204);
});

export default router;
