/**
 * SKU routes — CRUD endpoints for the products-module SKU admin.
 *
 * Mount at /api/v1/products/skus.
 */

import { Router, Request, Response, IRouter } from 'express';
import { skuService } from '../../services/products/skuService';
import { attributesService } from '../../services/products/attributesService';
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

/**
 * Multi-value query-string parser. Supports three shapes:
 *   - `?vendors=ABC,DEF,GHI`        (comma-separated)
 *   - `?vendors=ABC&vendors=DEF`    (repeated key)
 *   - `?vendors=ABC`                (single value)
 * Trims and drops empties so `?vendors=,,,ABC` reads as `['ABC']`.
 */
function parseStringArray(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  const all = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const item of all) {
    if (typeof item !== 'string') continue;
    for (const piece of item.split(',')) {
      const t = piece.trim();
      if (t.length > 0) out.push(t);
    }
  }
  return out.length > 0 ? out : undefined;
}
function parseIntArray(raw: unknown): number[] | undefined {
  const strs = parseStringArray(raw);
  if (!strs) return undefined;
  const out: number[] = [];
  for (const s of strs) {
    const n = Number(s);
    if (Number.isFinite(n) && Number.isInteger(n)) out.push(n);
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Extract `attr.<dimension_code>=<value_code>[,<value_code>...]` filters from
 * the query string. Returns one entry per dimension present.
 */
function parseAttrFilters(query: Record<string, unknown>): { dimensionCode: string; valueCodes: string[] }[] {
  const out: { dimensionCode: string; valueCodes: string[] }[] = [];
  for (const key of Object.keys(query)) {
    if (!key.startsWith('attr.')) continue;
    const dim = key.slice('attr.'.length);
    if (dim.length === 0) continue;
    const values = parseStringArray(query[key]);
    if (values && values.length > 0) {
      out.push({ dimensionCode: dim, valueCodes: values });
    }
  }
  return out;
}

router.get('/', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  // Single-value aliases kept for back-compat; the admin workbench sends arrays.
  const vendor = typeof req.query.vendor === 'string' ? req.query.vendor : undefined;
  const category = parseInt32(req.query.category) ?? undefined;
  const season = typeof req.query.season === 'string' ? req.query.season : undefined;
  const group = typeof req.query.group === 'string' ? req.query.group : undefined;
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword : undefined;
  // Multi-value filters — the admin workbench sends these.
  const vendors = parseStringArray(req.query.vendors);
  const categories = parseIntArray(req.query.categories);
  const seasons = parseStringArray(req.query.seasons);
  const groups = parseStringArray(req.query.groups);
  const keywords = parseStringArray(req.query.keywords);
  const styleColor =
    typeof req.query.styleColor === 'string' ? req.query.styleColor : undefined;
  const description =
    typeof req.query.description === 'string' ? req.query.description : undefined;
  const limit = parseInt32(req.query.limit) ?? undefined;
  const offset = parseInt32(req.query.offset) ?? undefined;
  // Extended-attribute filters: resolve `attr.<dim>=<value>[,<value>...]` to
  // a SKU-code allowlist (intersection across dims, union within a dim).
  const attrFilters = parseAttrFilters(req.query as Record<string, unknown>);
  let codes: string[] | undefined;
  if (attrFilters.length > 0) {
    const attrResult = await attributesService.findSkuCodesByAttributeFilters(attrFilters);
    if (!attrResult.ok) {
      const err = attrResult.error;
      res
        .status(repoHttpStatus(err))
        .json({ error: { code: repoHttpCode(err), message: err.message } });
      return;
    }
    // Zero matches = empty list (not "no filter"). Sentinel: ['\0__NO_MATCH__'].
    codes = attrResult.value.size === 0 ? ['\0__NO_MATCH__'] : Array.from(attrResult.value);
  }
  send(
    res,
    await skuService.list({
      q,
      vendor,
      category,
      season,
      group,
      keyword,
      vendors,
      categories,
      seasons,
      groups,
      keywords,
      styleColor,
      description,
      codes,
      limit,
      offset,
    }),
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
