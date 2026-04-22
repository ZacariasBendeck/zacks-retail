/**
 * Extended-attributes routes.
 *
 * Mount at /api/v1/products.
 *
 *   GET  /attributes/dimensions[?withCounts=true]
 *   GET  /attributes/coverage
 *   GET  /skus/:code/attributes
 *   PUT  /skus/:code/attributes
 *
 * Spec: docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md
 */

import { Router, type IRouter, type Request, type Response } from 'express';
import {
  attributesService,
  createAttributesService,
} from '../../services/products/attributesService';
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

function resolveActor(req: Request): string {
  const u = (req as Request & { user?: { id?: string; email?: string } }).user;
  return u?.email ?? u?.id ?? 'system';
}

router.get('/attributes/dimensions', async (req: Request, res: Response) => {
  const withCounts = req.query.withCounts === 'true' || req.query.withCounts === '1';
  send(res, await attributesService.listDimensions(withCounts));
});

router.get('/attributes/coverage', async (_req: Request, res: Response) => {
  send(res, await attributesService.getCoverage());
});

router.get('/skus/:code/attributes', async (req: Request, res: Response) => {
  send(res, await attributesService.getForSku(paramString(req.params.code)));
});

router.put('/skus/:code/attributes', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { assignments?: unknown };
  const raw = Array.isArray(body.assignments) ? body.assignments : [];
  const assignments: { dimensionCode: string; valueCode: string }[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') {
      return res.status(422).json({
        error: { code: 'CONSTRAINT_VIOLATION', message: 'Each assignment must be an object.' },
      });
    }
    const { dimension_code, value_code } = a as Record<string, unknown>;
    if (typeof dimension_code !== 'string' || typeof value_code !== 'string') {
      return res.status(422).json({
        error: {
          code: 'CONSTRAINT_VIOLATION',
          message: 'Each assignment requires dimension_code and value_code strings.',
        },
      });
    }
    assignments.push({ dimensionCode: dimension_code, valueCode: value_code });
  }

  // Per-request service so the audit entry attributes to the caller.
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.setForSku(paramString(req.params.code), assignments));
});

export default router;
