/**
 * Taxonomy routes — CRUD endpoints for the products module's reference
 * entities (Departments, Categories, Groups, Keywords, Seasons, Sectors,
 * Return Codes, Promotion Codes, Size Types, NRF Codes).
 *
 * Writes go directly to the live RICS MDB files via the typed repository
 * layer; reads are pulled the same way (no snapshot cache yet — taxonomy
 * tables are tiny and edit-rare, so the PowerShell round-trip is fine for
 * Phase 1).
 *
 * Error mapping: `RepoError.kind` → HTTP status via `repoHttpStatus()`.
 * NotFound → 404, ConstraintViolation → 422, DuplicatePrimaryKey / Concurrent
 * → 409, AccessConnectionError → 503.
 */

import { Router, Request, Response, IRouter } from 'express';
import { taxonomyService } from '../../services/products/taxonomyService';
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

// ────────────────── System-wide SKU total (coverage denominator) ──────────

/**
 * GET /api/v1/taxonomy/sku-total
 *
 * Returns `{ total: number }`, the count of every row in InventoryMaster.
 * Frontend list pages sum their per-row `skuCount` and compare against this
 * to show coverage (how many SKUs have the attribute assigned).
 */
router.get('/sku-total', async (_req: Request, res: Response) => {
  res.status(200).json(await taxonomyService.skuTotal());
});

// ────────────────── Resolve Category → Department → Sector ────────────────

/**
 * GET /api/v1/taxonomy/resolve?category=100
 *
 * Returns `{ category, department, sector }`. Department and Sector may be
 * null when no range-covering row exists (reporting gap — the UI should show
 * this, not hide it).
 */
router.get('/resolve', async (req: Request, res: Response) => {
  const category = parseInt32(req.query.category);
  if (category == null) {
    res.status(400).json({
      error: { code: 'INVALID_PARAM', message: 'category query param is required (integer).' },
    });
    return;
  }
  send(res, await taxonomyService.resolveForCategory(category));
});

// ────────────────── Departments ────────────────────────────────────────────

router.get('/departments', async (_req: Request, res: Response) => {
  send(res, await taxonomyService.departments.list());
});

router.get('/departments/:number', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.number);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Department number must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.departments.getByNumber(n));
});

router.post('/departments', async (req: Request, res: Response) => {
  send(res, await taxonomyService.departments.create(req.body), 201);
});

router.patch('/departments/:number', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.number);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Department number must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.departments.update(n, req.body));
});

router.delete('/departments/:number', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.number);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Department number must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.departments.delete(n), 204);
});

// ────────────────── Categories ─────────────────────────────────────────────

router.get('/category-buyers/options', async (_req: Request, res: Response) => {
  send(res, await taxonomyService.categories.listBuyerOptions());
});

router.get('/categories', async (_req: Request, res: Response) => {
  send(res, await taxonomyService.categories.list());
});

router.get('/categories/:number', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.number);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Category number must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.categories.getByNumber(n));
});

router.post('/categories', async (req: Request, res: Response) => {
  send(res, await taxonomyService.categories.create(req.body), 201);
});

router.patch('/categories/:number', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.number);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Category number must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.categories.update(n, req.body));
});

router.delete('/categories/:number', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.number);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Category number must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.categories.delete(n), 204);
});

// ────────────────── Groups ─────────────────────────────────────────────────

router.get('/groups', async (_req: Request, res: Response) => {
  send(res, await taxonomyService.groups.list());
});

router.get('/groups/:code', async (req: Request, res: Response) => {
  send(res, await taxonomyService.groups.getByCode(paramString(req.params.code)));
});

router.post('/groups', async (req: Request, res: Response) => {
  send(res, await taxonomyService.groups.create(req.body), 201);
});

router.patch('/groups/:code', async (req: Request, res: Response) => {
  send(res, await taxonomyService.groups.update(paramString(req.params.code), req.body));
});

router.delete('/groups/:code', async (req: Request, res: Response) => {
  send(res, await taxonomyService.groups.delete(paramString(req.params.code)), 204);
});

// ────────────────── Keywords ───────────────────────────────────────────────

router.get('/keywords', async (_req: Request, res: Response) => {
  send(res, await taxonomyService.keywords.list());
});

router.get('/keywords/:keyword', async (req: Request, res: Response) => {
  send(res, await taxonomyService.keywords.getByKeyword(paramString(req.params.keyword)));
});

router.post('/keywords', async (req: Request, res: Response) => {
  send(res, await taxonomyService.keywords.create(req.body), 201);
});

router.patch('/keywords/:keyword', async (req: Request, res: Response) => {
  send(res, await taxonomyService.keywords.update(paramString(req.params.keyword), req.body));
});

router.delete('/keywords/:keyword', async (req: Request, res: Response) => {
  send(res, await taxonomyService.keywords.delete(paramString(req.params.keyword)), 204);
});

// ────────────────── Seasons (user-editable SKU attribute, RICS p. 218) ─────

router.get('/seasons', async (_req: Request, res: Response) => {
  send(res, await taxonomyService.seasons.list());
});

/**
 * Diagnostic: is the repo reading from RISEMF or Postgres right now?
 * Returns the resolved path, introspected table/columns, and last probe error.
 * Kept under the /seasons/ prefix for simplicity; declared before /:code so
 * the literal 'source' path isn't captured as a code param.
 */
router.get('/seasons/_source', async (_req: Request, res: Response) => {
  const status = await taxonomyService.seasons.getSourceStatus();
  res.status(200).json(status);
});

router.get('/seasons/:code', async (req: Request, res: Response) => {
  send(res, await taxonomyService.seasons.getByCode(paramString(req.params.code)));
});

router.post('/seasons', async (req: Request, res: Response) => {
  send(res, await taxonomyService.seasons.create(req.body), 201);
});

router.patch('/seasons/:code', async (req: Request, res: Response) => {
  send(res, await taxonomyService.seasons.update(paramString(req.params.code), req.body));
});

router.delete('/seasons/:code', async (req: Request, res: Response) => {
  send(res, await taxonomyService.seasons.delete(paramString(req.params.code)), 204);
});

// ────────────────── Sectors ────────────────────────────────────────────────

router.get('/sectors', async (_req: Request, res: Response) => {
  send(res, await taxonomyService.sectors.list());
});

router.get('/sectors/:number', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.number);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Sector number must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.sectors.getByNumber(n));
});

router.post('/sectors', async (req: Request, res: Response) => {
  send(res, await taxonomyService.sectors.create(req.body), 201);
});

router.patch('/sectors/:number', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.number);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Sector number must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.sectors.update(n, req.body));
});

router.delete('/sectors/:number', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.number);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Sector number must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.sectors.delete(n), 204);
});

// ────────────────── Return Codes ───────────────────────────────────────────

router.get('/return-codes', async (_req: Request, res: Response) => {
  send(res, await taxonomyService.returnCodes.list());
});

router.get('/return-codes/:code', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.code);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Return code must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.returnCodes.getByCode(n));
});

router.post('/return-codes', async (req: Request, res: Response) => {
  send(res, await taxonomyService.returnCodes.create(req.body), 201);
});

router.patch('/return-codes/:code', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.code);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Return code must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.returnCodes.update(n, req.body));
});

router.delete('/return-codes/:code', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.code);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Return code must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.returnCodes.delete(n), 204);
});

// ────────────────── Promotion Codes ────────────────────────────────────────

router.get('/promotion-codes', async (_req: Request, res: Response) => {
  send(res, await taxonomyService.promotionCodes.list());
});

router.get('/promotion-codes/:code', async (req: Request, res: Response) => {
  send(res, await taxonomyService.promotionCodes.getByCode(paramString(req.params.code)));
});

router.post('/promotion-codes', async (req: Request, res: Response) => {
  send(res, await taxonomyService.promotionCodes.create(req.body), 201);
});

router.patch('/promotion-codes/:code', async (req: Request, res: Response) => {
  send(res, await taxonomyService.promotionCodes.update(paramString(req.params.code), req.body));
});

router.delete('/promotion-codes/:code', async (req: Request, res: Response) => {
  send(res, await taxonomyService.promotionCodes.delete(paramString(req.params.code)), 204);
});

// ────────────────── Size Types ─────────────────────────────────────────────

router.get('/size-types', async (_req: Request, res: Response) => {
  send(res, await taxonomyService.sizeTypes.list());
});

router.get('/size-types/:code', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.code);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Size type code must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.sizeTypes.getByCode(n));
});

router.post('/size-types', async (req: Request, res: Response) => {
  send(res, await taxonomyService.sizeTypes.create(req.body), 201);
});

router.patch('/size-types/:code', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.code);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Size type code must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.sizeTypes.update(n, req.body));
});

router.delete('/size-types/:code', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.code);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Size type code must be an integer.' } });
    return;
  }
  send(res, await taxonomyService.sizeTypes.delete(n), 204);
});

// ── Size Type columns/rows are a convenience view; the underlying wide-column
//    row is written atomically via PATCH /size-types/:code, so these routes
//    expose the flat arrays for UI convenience.
router.get('/size-types/:code/columns', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.code);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Size type code must be an integer.' } });
    return;
  }
  const result = await taxonomyService.sizeTypes.getByCode(n);
  if (!result.ok) {
    send(res, result);
    return;
  }
  res.json({ columnDescription: result.value.columnDescription, columns: result.value.columns });
});

router.get('/size-types/:code/rows', async (req: Request, res: Response) => {
  const n = parseInt32(req.params.code);
  if (n == null) {
    res.status(400).json({ error: { code: 'INVALID_PARAM', message: 'Size type code must be an integer.' } });
    return;
  }
  const result = await taxonomyService.sizeTypes.getByCode(n);
  if (!result.ok) {
    send(res, result);
    return;
  }
  res.json({ rowDescription: result.value.rowDescription, rows: result.value.rows });
});

// ────────────────── NRF Codes (read-only) ──────────────────────────────────

router.get('/nrf-codes', async (req: Request, res: Response) => {
  const sizeTypeCode = parseInt32(req.query.sizeTypeCode ?? req.query.table);
  const rowLabel = req.query.rowLabel != null ? parseInt32(req.query.rowLabel) : undefined;
  const columnPosition = req.query.columnPosition != null ? parseInt32(req.query.columnPosition) : undefined;
  if (sizeTypeCode == null) {
    res.status(400).json({
      error: { code: 'INVALID_PARAM', message: 'sizeTypeCode (integer) is required.' },
    });
    return;
  }
  send(
    res,
    await taxonomyService.nrfCodes.lookup({
      sizeTypeCode,
      rowLabel: rowLabel ?? undefined,
      columnPosition: columnPosition ?? undefined,
    }),
  );
});

export default router;
