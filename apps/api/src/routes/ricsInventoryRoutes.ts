/**
 * Read-only inventory endpoints sourced from the legacy RICS MDBs.
 * Hosts the three Phase 1 screens from `docs/modules/inventory.md`:
 *   GET /inquiry/:sku       — full size-grid × store (Ch. 4 p. 75)
 *   GET /find-by-size       — SKU + size → on-hand per store (Ch. 4 p. 70)
 *   GET /detail-report      — per-SKU rollup (Ch. 4 p. 78)
 *
 * Mounted under /api/v1/inventory, so these paths sit alongside the existing
 * `inventoryMutationRoutes`. None of them overlap with that router's paths.
 */

import { Router, Request, Response, NextFunction, IRouter } from 'express';
import {
  getInventoryInquiry,
  findBySize,
  getInventoryDetailReport,
  getChangeDetail,
  getTransferSummary,
  getSkuStoreRollup,
  getSkuStoreCellRollup,
  getRecommendedTransfers,
  InventorySourceNotImplementedError,
  ChangeDetailQueryTooBroadError,
  TransferSummaryInputError,
} from '../services/ricsInventoryFacade';
import type { RecommendedTransferRule } from '../services/ricsInventoryAdapter';
import { findNeighborSku } from '../services/ricsProductAdapter';

const router: IRouter = Router();

/**
 * @openapi
 * /api/v1/inventory/inquiry/{sku}:
 *   get:
 *     tags: [Inventory]
 *     summary: Inventory Inquiry — full size-grid on-hand / on-order / model / max / reorder / sales per store for one SKU
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Inquiry payload with one entry per store
 *       404:
 *         description: SKU not found
 */
router.get('/inquiry/:sku', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuRaw = req.params.sku;
    const sku = Array.isArray(skuRaw) ? skuRaw[0] : skuRaw;
    const inquiry = await getInventoryInquiry(sku);
    if (!inquiry) {
      res.status(404).json({ error: { code: 'SKU_NOT_FOUND', message: `SKU ${sku} not found` } });
      return;
    }
    res.json(inquiry);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/inventory/inquiry/{sku}/neighbor:
 *   get:
 *     tags: [Inventory]
 *     summary: Next/Prev SKU for the Inventory Inquiry Prev/Next buttons. Walks the in-memory SKU index (sorted by SKU) optionally filtered to the current SKU's vendor or category.
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: direction
 *         required: true
 *         schema: { type: string, enum: [next, prev] }
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [general, vendor, category], default: general }
 *     responses:
 *       200:
 *         description: "Neighbor SKU payload. `sku` is null when no neighbor exists in scope."
 */
router.get('/inquiry/:sku/neighbor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuRaw = req.params.sku;
    const sku = Array.isArray(skuRaw) ? skuRaw[0] : skuRaw;
    const directionRaw = String(req.query.direction ?? '').toLowerCase();
    const direction: 'next' | 'prev' =
      directionRaw === 'prev' ? 'prev' : directionRaw === 'next' ? 'next' : 'next';
    const scopeRaw = String(req.query.scope ?? 'general').toLowerCase();
    const scope: 'general' | 'vendor' | 'category' =
      scopeRaw === 'vendor' ? 'vendor' : scopeRaw === 'category' ? 'category' : 'general';
    const neighbor = await findNeighborSku(sku, direction, scope);
    res.json({ sku: neighbor });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/inventory/find-by-size:
 *   get:
 *     tags: [Inventory]
 *     summary: Find the stores holding a given (SKU, size). Case-insensitive exact size label match.
 *     parameters:
 *       - in: query
 *         name: sku
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: size
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Per-store matches for that size }
 *       400: { description: sku or size missing }
 *       404: { description: SKU not found }
 */
router.get('/find-by-size', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sku = (req.query.sku as string | undefined)?.trim();
    const size = (req.query.size as string | undefined)?.trim();
    if (!sku || !size) {
      res.status(400).json({
        error: { code: 'MISSING_PARAMS', message: 'sku and size query params are required' },
      });
      return;
    }
    const result = await findBySize(sku, size);
    if (!result) {
      res.status(404).json({ error: { code: 'SKU_NOT_FOUND', message: `SKU ${sku} not found` } });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/inventory/detail-report:
 *   get:
 *     tags: [Inventory]
 *     summary: Inventory Detail Report — per-SKU on-hand + cost/retail value, optionally scoped to one store
 *     parameters:
 *       - in: query
 *         name: storeNumber
 *         required: false
 *         schema: { type: integer }
 *       - in: query
 *         name: vendorCode
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: categoryMin
 *         required: false
 *         schema: { type: integer }
 *       - in: query
 *         name: categoryMax
 *         required: false
 *         schema: { type: integer }
 *       - in: query
 *         name: season
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, default: 5000, maximum: 20000 }
 *     responses:
 *       200: { description: Array of per-SKU rollup rows }
 */
router.get('/detail-report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeNumber = parseIntOrUndefined(req.query.storeNumber);
    const categoryMin = parseIntOrUndefined(req.query.categoryMin);
    const categoryMax = parseIntOrUndefined(req.query.categoryMax);
    const limit = parseIntOrUndefined(req.query.limit);
    const vendorCode = (req.query.vendorCode as string | undefined)?.trim() || undefined;
    const season = (req.query.season as string | undefined)?.trim() || undefined;

    const rows = await getInventoryDetailReport({
      storeNumber,
      categoryMin,
      categoryMax,
      vendorCode,
      season,
      limit,
    });
    res.json({ rows, total: rows.length });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/inventory/change-detail:
 *   get:
 *     tags: [Inventory]
 *     summary: Browse the RICS InvChanges ledger (RIINVCHG). Requires a SKU or a date window ≤ 90 days.
 *     parameters:
 *       - in: query
 *         name: sku
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: store
 *         required: false
 *         schema: { type: integer }
 *       - in: query
 *         name: changeType
 *         required: false
 *         description: POR | RET | PHY | TOU | TIN | REC
 *         schema: { type: string }
 *       - in: query
 *         name: fromDate
 *         required: false
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: toDate
 *         required: false
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, default: 200, maximum: 1000 }
 *     responses:
 *       200: { description: Rows ordered by date descending }
 *       400: { description: Query scope too broad (no SKU and either no window or > 90 days) }
 */
router.get('/change-detail', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sku = (req.query.sku as string | undefined)?.trim() || undefined;
    const changeType = (req.query.changeType as string | undefined)?.trim() || undefined;
    const fromDate = (req.query.fromDate as string | undefined)?.trim() || undefined;
    const toDate = (req.query.toDate as string | undefined)?.trim() || undefined;
    const store = parseIntOrUndefined(req.query.store);
    const limit = parseIntOrUndefined(req.query.limit);
    const includeSales = req.query.includeSales === 'true' || req.query.includeSales === '1';

    const rows = await getChangeDetail({ sku, store, changeType, fromDate, toDate, limit, includeSales });
    res.json({ rows, total: rows.length });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/inventory/transfer-summary:
 *   get:
 *     tags: [Inventory]
 *     summary: Transfer Summary Report — monthly from×to rollup of RICS transfers (RIINVCHG TOU rows) (RICS Ch. 4 p. 80)
 *     parameters:
 *       - in: query
 *         name: fromDate
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: toDate
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: fromStoreNumbers
 *         required: false
 *         description: Comma-separated list of source store numbers
 *         schema: { type: string }
 *       - in: query
 *         name: toStoreNumbers
 *         required: false
 *         description: Comma-separated list of destination store numbers
 *         schema: { type: string }
 *     responses:
 *       200: { description: Summary payload — months + matrix + stores + grand totals }
 *       400: { description: Missing dates, invalid format, or > 366-day window }
 */
router.get('/transfer-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fromDate = (req.query.fromDate as string | undefined)?.trim();
    const toDate = (req.query.toDate as string | undefined)?.trim();
    if (!fromDate || !toDate) {
      res.status(400).json({
        error: { code: 'MISSING_PARAMS', message: 'fromDate and toDate query params are required (YYYY-MM-DD).' },
      });
      return;
    }
    const fromStoreNumbers = parseStoreList(req.query.fromStoreNumbers);
    const toStoreNumbers = parseStoreList(req.query.toStoreNumbers);
    const report = await getTransferSummary({ fromDate, toDate, fromStoreNumbers, toStoreNumbers });
    res.json(report);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/inventory/sku-store-rollup:
 *   get:
 *     tags: [Inventory]
 *     summary: Per (SKU × Store) rollup of on-hand / model / max / reorder / sales — primitive behind recommendations and preview wizards
 *     parameters:
 *       - in: query
 *         name: storeNumbers
 *         required: false
 *         schema: { type: string }
 *         description: Comma-separated list
 *       - in: query
 *         name: vendorCode
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: categoryMin
 *         required: false
 *         schema: { type: integer }
 *       - in: query
 *         name: categoryMax
 *         required: false
 *         schema: { type: integer }
 *       - in: query
 *         name: season
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: skus
 *         required: false
 *         schema: { type: string }
 *         description: Comma-separated list, max 200
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, default: 2000, maximum: 10000 }
 *     responses:
 *       200: { description: Rows \{ sku, store, onHand, model, max, reorder, currentOnOrder, mtd/std/ytd/ly sales \} }
 */
router.get('/sku-store-rollup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await getSkuStoreRollup({
      storeNumbers: parseStoreList(req.query.storeNumbers),
      vendorCode: (req.query.vendorCode as string | undefined)?.trim() || undefined,
      categoryMin: parseIntOrUndefined(req.query.categoryMin),
      categoryMax: parseIntOrUndefined(req.query.categoryMax),
      season: (req.query.season as string | undefined)?.trim() || undefined,
      skus: parseStringList(req.query.skus),
      limit: parseIntOrUndefined(req.query.limit),
    });
    res.json({ rows, total: rows.length });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/inventory/sku-store-cell-rollup:
 *   get:
 *     tags: [Inventory]
 *     summary: Per (SKU × Store × Row × Column) cell rollup — drives per-size Auto / Balancing / Manual Transfer previews
 *     responses:
 *       200: { description: Rows \{ sku, store, rowLabel, columnLabel, onHand, model, max, reorder, ...sales \} }
 */
router.get('/sku-store-cell-rollup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await getSkuStoreCellRollup({
      storeNumbers: parseStoreList(req.query.storeNumbers),
      vendorCode: (req.query.vendorCode as string | undefined)?.trim() || undefined,
      categoryMin: parseIntOrUndefined(req.query.categoryMin),
      categoryMax: parseIntOrUndefined(req.query.categoryMax),
      season: (req.query.season as string | undefined)?.trim() || undefined,
      skus: parseStringList(req.query.skus),
      limit: parseIntOrUndefined(req.query.limit),
    });
    res.json({ rows, total: rows.length });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/inventory/recommended-transfers:
 *   get:
 *     tags: [Inventory]
 *     summary: Recommended Transfer Report (RICS Ch. 4 p. 79) — advisory, no writes
 *     parameters:
 *       - in: query
 *         name: rule
 *         required: true
 *         schema: { type: string, enum: [OVER_UNDER_MODELS, UNEVEN_DOUBLES, TURNOVER_VARIANCE] }
 *       - in: query
 *         name: turnoverRatioThreshold
 *         required: false
 *         schema: { type: number, default: 2 }
 *       - in: query
 *         name: includeSkusWithoutModels
 *         required: false
 *         schema: { type: boolean, default: false }
 *       - in: query
 *         name: storeNumbers
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: vendorCode
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: categoryMin
 *         required: false
 *         schema: { type: integer }
 *       - in: query
 *         name: categoryMax
 *         required: false
 *         schema: { type: integer }
 *       - in: query
 *         name: season
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, default: 2000 }
 *     responses:
 *       200: { description: Array of recommended transfer rows }
 *       400: { description: Missing or invalid rule param }
 */
router.get('/recommended-transfers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rule = (req.query.rule as string | undefined)?.trim().toUpperCase();
    const VALID: RecommendedTransferRule[] = ['OVER_UNDER_MODELS', 'UNEVEN_DOUBLES', 'TURNOVER_VARIANCE'];
    if (!rule || !VALID.includes(rule as RecommendedTransferRule)) {
      res.status(400).json({
        error: {
          code: 'INVALID_RULE',
          message: `rule must be one of ${VALID.join(' | ')}`,
        },
      });
      return;
    }
    const turnoverRatioThreshold = req.query.turnoverRatioThreshold != null
      ? Number(req.query.turnoverRatioThreshold)
      : undefined;
    const rows = await getRecommendedTransfers({
      rule: rule as RecommendedTransferRule,
      turnoverRatioThreshold: Number.isFinite(turnoverRatioThreshold) ? turnoverRatioThreshold : undefined,
      includeSkusWithoutModels: (req.query.includeSkusWithoutModels as string | undefined) === 'true',
      storeNumbers: parseStoreList(req.query.storeNumbers),
      vendorCode: (req.query.vendorCode as string | undefined)?.trim() || undefined,
      categoryMin: parseIntOrUndefined(req.query.categoryMin),
      categoryMax: parseIntOrUndefined(req.query.categoryMax),
      season: (req.query.season as string | undefined)?.trim() || undefined,
      limit: parseIntOrUndefined(req.query.limit),
    });
    res.json({ rows, total: rows.length });
  } catch (err) {
    next(err);
  }
});

// Map the facade's "not implemented" error to HTTP 501 so the web layer can
// render a useful hint. Anything else falls through to the global handler.
router.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof InventorySourceNotImplementedError) {
    res.status(501).json({ error: { code: 'INVENTORY_SOURCE_NOT_IMPLEMENTED', message: err.message } });
    return;
  }
  if (err instanceof ChangeDetailQueryTooBroadError) {
    res.status(400).json({ error: { code: 'QUERY_SCOPE_TOO_BROAD', message: err.message } });
    return;
  }
  if (err instanceof TransferSummaryInputError) {
    res.status(400).json({ error: { code: 'TRANSFER_SUMMARY_BAD_INPUT', message: err.message } });
    return;
  }
  next(err);
});

function parseStoreList(v: unknown): number[] | undefined {
  if (v == null || v === '') return undefined;
  const raw = Array.isArray(v) ? v.join(',') : String(v);
  const nums = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  return nums.length ? nums : undefined;
}

function parseStringList(v: unknown): string[] | undefined {
  if (v == null || v === '') return undefined;
  const raw = Array.isArray(v) ? v.join(',') : String(v);
  const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function parseIntOrUndefined(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export default router;
