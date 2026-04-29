/**
 * Product Family routes — mount at /api/v1/products/families.
 *
 * READS
 *   GET  /                              — list all families (sort_order asc)
 *   GET  /:code/categories              — categories assigned to the family (joined w/ dept)
 *   GET  /:code/attribute-rules         — dimensions ruled for this family
 *   GET  /by-category/:categoryNumber   — resolve a RICS category to its dept + family
 *
 * ADMIN WRITES
 *   POST  /                             — create a product family
 *   PATCH /:code                        — edit labelEs, descriptionEs, sortOrder
 *   PUT   /:code/categories             — replace category mapping (body: { categories: number[] })
 *                                         query ?force=true to override orphan-assignment 409
 *   PUT   /:code/attribute-rules        — replace the family's attribute rule list
 *                                         body: { rules: [{ dimensionCode, enabled, isRequired, sortOrder? }] }
 *   PATCH /:code/attribute-rules/:dimCode — toggle enabled/isRequired for one pair
 *
 * Plan: C:\Users\zbend\.claude\plans\now-we-have-all-vivid-charm.md
 */
import { Router, Request, Response, IRouter } from 'express';
import {
  listFamilies,
  createFamily,
  getCategoriesForFamily,
  resolveCategory,
  updateFamilyMetadata,
  replaceFamilyCategories,
} from '../../services/products/productFamilyService';
import { createAttributesService } from '../../services/products/attributesService';
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

function resolveActor(req: Request): string {
  const u = (req as Request & { user?: { id?: string; email?: string } }).user;
  return u?.email ?? u?.id ?? 'system';
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const families = await listFamilies();
    res.json(families);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: { code: 'INTERNAL', message } });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input = {
    code: typeof body.code === 'string' ? body.code : '',
    labelEs: typeof body.labelEs === 'string' ? body.labelEs : '',
    descriptionEs: body.descriptionEs === null || typeof body.descriptionEs === 'string' ? body.descriptionEs : null,
    sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : null,
  };
  send(res, await createFamily(input, resolveActor(req)), 201);
});

router.get('/by-category/:categoryNumber', async (req: Request, res: Response) => {
  const n = Number(req.params.categoryNumber);
  if (!Number.isInteger(n)) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'categoryNumber must be an integer.' } });
    return;
  }
  try {
    const resolution = await resolveCategory(n);
    if (resolution == null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `No family resolution for category ${n}.` } });
      return;
    }
    res.json(resolution);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: { code: 'INTERNAL', message } });
  }
});

router.get('/:code/categories', async (req: Request, res: Response) => {
  const code = String(req.params.code);
  if (code.length === 0) {
    res.status(400).json({ error: { code: 'INVALID_CODE', message: 'family code is required.' } });
    return;
  }
  try {
    const categories = await getCategoriesForFamily(code);
    res.json(categories);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: { code: 'INTERNAL', message } });
  }
});

router.get('/:code/attribute-rules', async (req: Request, res: Response) => {
  const code = String(req.params.code);
  send(res, await createAttributesService().listRulesForFamily(code));
});

// ──────────────── Admin writes ────────────────

router.patch('/:code', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<{ labelEs: string; descriptionEs: string | null; sortOrder: number }> = {};
  if (typeof body.labelEs === 'string') patch.labelEs = body.labelEs.trim();
  if (body.descriptionEs === null) patch.descriptionEs = null;
  else if (typeof body.descriptionEs === 'string') patch.descriptionEs = body.descriptionEs;
  if (typeof body.sortOrder === 'number') patch.sortOrder = body.sortOrder;
  send(res, await updateFamilyMetadata(String(req.params.code), patch, resolveActor(req)));
});

router.put('/:code/categories', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(body.categories)) {
    return res
      .status(422)
      .json({ error: { code: 'CONSTRAINT_VIOLATION', message: 'categories[] required.' } });
  }
  const nums: number[] = [];
  for (const raw of body.categories as unknown[]) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isInteger(n)) nums.push(n);
  }
  const force = req.query.force === 'true' || req.query.force === '1';
  send(
    res,
    await replaceFamilyCategories(String(req.params.code), nums, resolveActor(req), { force }),
  );
});

router.put('/:code/attribute-rules', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(body.rules)) {
    return res
      .status(422)
      .json({ error: { code: 'CONSTRAINT_VIOLATION', message: 'rules[] required.' } });
  }
  const rules: { dimensionCode: string; enabled: boolean; isRequired: boolean; sortOrder?: number }[] = [];
  for (const r of body.rules as unknown[]) {
    if (!r || typeof r !== 'object') continue;
    const { dimensionCode, enabled, isRequired, sortOrder } = r as Record<string, unknown>;
    if (typeof dimensionCode !== 'string') continue;
    rules.push({
      dimensionCode,
      enabled: enabled !== false,
      isRequired: isRequired === true,
      ...(typeof sortOrder === 'number' ? { sortOrder } : {}),
    });
  }
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.replaceRulesForFamily(String(req.params.code), rules));
});

router.patch('/:code/attribute-rules/:dimCode', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: { enabled?: boolean; isRequired?: boolean; sortOrder?: number } = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.isRequired === 'boolean') patch.isRequired = body.isRequired;
  if (typeof body.sortOrder === 'number') patch.sortOrder = body.sortOrder;
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(
    res,
    await perRequest.upsertRule(String(req.params.dimCode), String(req.params.code), patch),
  );
});

router.delete('/:code/attribute-rules/:dimCode', async (req: Request, res: Response) => {
  const perRequest = createAttributesService({ actor: resolveActor(req) });
  send(res, await perRequest.deleteRule(String(req.params.dimCode), String(req.params.code)));
});

export default router;
