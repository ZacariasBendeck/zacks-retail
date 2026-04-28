/**
 * Extended-attributes routes.
 *
 * Mount at /api/v1/products.
 *
 * READS
 *   GET  /attributes/dimensions[?withCounts=true]
 *   GET  /attributes/coverage
 *   GET  /attributes/dimensions/:code/family-rules
 *   GET  /attributes/macros
 *   GET  /attributes/macros/:sourceDimensionCode/:targetDimensionCode
 *   PUT  /attributes/macros/:sourceDimensionCode/:targetDimensionCode
 *   GET  /skus/:code/attributes
 *
 * DIMENSION ADMIN
 *   POST   /attributes/dimensions
 *   PATCH  /attributes/dimensions/:code
 *   DELETE /attributes/dimensions/:code           (409 on assignments-in-use)
 *   POST   /attributes/dimensions/reorder          { entries: [{code, sortOrder}] }
 *
 * FAMILY RULES (from the dimension side)
 *   PUT  /attributes/dimensions/:code/family-rules
 *          { universal: true }  |  { universal: false, rules: [{familyCode, enabled, isRequired, sortOrder}] }
 *
 * VALUE ADMIN
 *   POST   /attributes/dimensions/:code/values
 *   PATCH  /attributes/values/:id                   (labelEs, sortOrder, isActive)
 *   DELETE /attributes/values/:id                   (409 on assignments-in-use; merge or deactivate instead)
 *   POST   /attributes/values/:id/deactivate        (soft-delete via is_active=false)
 *   POST   /attributes/values/:id/merge-into/:targetId
 *   POST   /attributes/dimensions/:code/values/reorder { entries: [{valueId, sortOrder}] }
 *
 * PER-SKU ASSIGNMENTS
 *   GET  /skus/:code/attributes
 *   PUT  /skus/:code/attributes
 *
 * Spec: docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md
 * Plan: C:\Users\zbend\.claude\plans\now-we-have-all-vivid-charm.md
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

router.get('/attributes/macros', async (_req: Request, res: Response) => {
  send(res, await attributesService.listMacroRuleSummaries());
});

router.get('/attributes/macros/:sourceDimensionCode/:targetDimensionCode', async (req: Request, res: Response) => {
  send(
    res,
    await attributesService.getMacroRuleSet(
      paramString(req.params.sourceDimensionCode),
      paramString(req.params.targetDimensionCode),
    ),
  );
});

router.put('/attributes/macros/:sourceDimensionCode/:targetDimensionCode', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(body.rules)) {
    return res.status(422).json({
      error: { code: 'CONSTRAINT_VIOLATION', message: 'rules[] is required.' },
    });
  }

  const rules: { sourceValueCode: string; targetValueCode: string | null }[] = [];
  for (const rawRule of body.rules) {
    if (!rawRule || typeof rawRule !== 'object') {
      return res.status(422).json({
        error: { code: 'CONSTRAINT_VIOLATION', message: 'Each rule must be an object.' },
      });
    }
    const rule = rawRule as Record<string, unknown>;
    const sourceValueCode =
      typeof rule.sourceValueCode === 'string'
        ? rule.sourceValueCode
        : typeof rule.source_value_code === 'string'
          ? rule.source_value_code
          : '';
    const targetValueCode =
      typeof rule.targetValueCode === 'string'
        ? rule.targetValueCode
        : typeof rule.target_value_code === 'string'
          ? rule.target_value_code
          : rule.targetValueCode === null || rule.target_value_code === null
            ? null
            : '';
    if (!sourceValueCode) {
      return res.status(422).json({
        error: { code: 'CONSTRAINT_VIOLATION', message: 'Each rule requires sourceValueCode.' },
      });
    }
    if (targetValueCode === '') {
      return res.status(422).json({
        error: {
          code: 'CONSTRAINT_VIOLATION',
          message: 'Each rule requires targetValueCode or null.',
        },
      });
    }
    rules.push({ sourceValueCode, targetValueCode });
  }

  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(
    res,
    await perRequest.replaceMacroRules(
      paramString(req.params.sourceDimensionCode),
      paramString(req.params.targetDimensionCode),
      rules,
    ),
  );
});

router.get('/attributes/dimensions/:code/family-rules', async (req: Request, res: Response) => {
  send(res, await attributesService.listRulesForDimension(paramString(req.params.code)));
});

// ──────────────── Dimension admin ────────────────

router.post('/attributes/dimensions', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const labelEs = typeof body.labelEs === 'string' ? body.labelEs.trim() : '';
  const descriptionEs =
    typeof body.descriptionEs === 'string' && body.descriptionEs.length > 0
      ? body.descriptionEs
      : null;
  const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : Number(body.sortOrder ?? 0);
  const isMultiValue = body.isMultiValue === true || body.isMultiValue === 'true';
  if (!code || !labelEs) {
    return res
      .status(422)
      .json({ error: { code: 'CONSTRAINT_VIOLATION', message: 'code and labelEs are required.' } });
  }
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(
    res,
    await perRequest.createDimension({
      code,
      labelEs,
      descriptionEs,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      isMultiValue,
    }),
    201,
  );
});

router.patch('/attributes/dimensions/:code', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<{ labelEs: string; descriptionEs: string | null; sortOrder: number; isMultiValue: boolean }> = {};
  if (typeof body.labelEs === 'string') patch.labelEs = body.labelEs.trim();
  if (body.descriptionEs === null) patch.descriptionEs = null;
  else if (typeof body.descriptionEs === 'string') patch.descriptionEs = body.descriptionEs;
  if (typeof body.sortOrder === 'number') patch.sortOrder = body.sortOrder;
  if (typeof body.isMultiValue === 'boolean') patch.isMultiValue = body.isMultiValue;
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.updateDimension(paramString(req.params.code), patch));
});

router.delete('/attributes/dimensions/:code', async (req: Request, res: Response) => {
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.deleteDimension(paramString(req.params.code)));
});

router.post('/attributes/dimensions/reorder', async (req: Request, res: Response) => {
  const entries = Array.isArray((req.body ?? {}).entries) ? (req.body as any).entries : [];
  const cleaned: { code: string; sortOrder: number }[] = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const code = typeof e.code === 'string' ? e.code : '';
    const sortOrder = typeof e.sortOrder === 'number' ? e.sortOrder : Number(e.sortOrder);
    if (!code || !Number.isFinite(sortOrder)) continue;
    cleaned.push({ code, sortOrder });
  }
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.reorderDimensions(cleaned));
});

// ──────────────── Family rules (from dim side) ────────────────

router.put('/attributes/dimensions/:code/family-rules', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const universal = body.universal === true;
  if (universal) {
    const perRequest = createAttributesService({ actor: resolveActor(req) });
    return send(
      res,
      await perRequest.replaceRulesForDimension(paramString(req.params.code), { universal: true }),
    );
  }
  if (!Array.isArray(body.rules)) {
    return res.status(422).json({
      error: { code: 'CONSTRAINT_VIOLATION', message: 'rules[] required unless universal=true.' },
    });
  }
  const rules: { familyCode: string; enabled: boolean; isRequired: boolean; sortOrder?: number }[] = [];
  for (const r of body.rules as unknown[]) {
    if (!r || typeof r !== 'object') continue;
    const { familyCode, enabled, isRequired, sortOrder } = r as Record<string, unknown>;
    if (typeof familyCode !== 'string') continue;
    rules.push({
      familyCode,
      enabled: enabled !== false,
      isRequired: isRequired === true,
      ...(typeof sortOrder === 'number' ? { sortOrder } : {}),
    });
  }
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(
    res,
    await perRequest.replaceRulesForDimension(paramString(req.params.code), {
      universal: false,
      rules,
    }),
  );
});

// ──────────────── Value admin ────────────────

router.post('/attributes/dimensions/:code/values', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const labelEs = typeof body.labelEs === 'string' ? body.labelEs.trim() : '';
  const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : Number(body.sortOrder ?? 0);
  if (!code || !labelEs) {
    return res
      .status(422)
      .json({ error: { code: 'CONSTRAINT_VIOLATION', message: 'code and labelEs are required.' } });
  }
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(
    res,
    await perRequest.createValue(paramString(req.params.code), {
      code,
      labelEs,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    }),
    201,
  );
});

router.patch('/attributes/values/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'value id must be integer.' } });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<{ labelEs: string; sortOrder: number; isActive: boolean }> = {};
  if (typeof body.labelEs === 'string') patch.labelEs = body.labelEs.trim();
  if (typeof body.sortOrder === 'number') patch.sortOrder = body.sortOrder;
  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.updateValue(id, patch));
});

router.delete('/attributes/values/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'value id must be integer.' } });
  }
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.deleteValue(id));
});

router.post('/attributes/values/:id/deactivate', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'value id must be integer.' } });
  }
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.updateValue(id, { isActive: false }));
});

router.post('/attributes/values/:id/merge-into/:targetId', async (req: Request, res: Response) => {
  const src = Number(req.params.id);
  const tgt = Number(req.params.targetId);
  if (!Number.isInteger(src) || !Number.isInteger(tgt)) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'value ids must be integers.' } });
  }
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.mergeValues(src, tgt));
});

router.post('/attributes/dimensions/:code/values/reorder', async (req: Request, res: Response) => {
  const entries = Array.isArray((req.body ?? {}).entries) ? (req.body as any).entries : [];
  const cleaned: { valueId: number; sortOrder: number }[] = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const valueId = typeof e.valueId === 'number' ? e.valueId : Number(e.valueId);
    const sortOrder = typeof e.sortOrder === 'number' ? e.sortOrder : Number(e.sortOrder);
    if (!Number.isInteger(valueId) || !Number.isFinite(sortOrder)) continue;
    cleaned.push({ valueId, sortOrder });
  }
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.reorderValues(paramString(req.params.code), cleaned));
});

router.get('/skus/:code/attributes', async (req: Request, res: Response) => {
  send(res, await attributesService.getForSku(paramString(req.params.code)));
});

router.put('/skus/:code/attributes', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { assignments?: unknown; scope?: unknown };
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

  // Optional `scope: string[]` narrows the atomic-replace to just those dims.
  // Callers that don't send scope get the original full-replace behaviour.
  let scope: string[] | undefined;
  if (Array.isArray(body.scope)) {
    scope = body.scope.filter((s): s is string => typeof s === 'string' && s.length > 0);
    if (scope.length === 0) scope = undefined;
  }

  // Per-request service so the audit entry attributes to the caller.
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.setForSku(paramString(req.params.code), assignments, scope));
});

export default router;
