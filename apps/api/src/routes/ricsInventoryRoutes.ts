/**
 * Read-only inventory endpoints sourced from the legacy RICS MDBs.
 * Hosts the three Phase 1 screens from `docs/modules/inventory.md`:
 *   GET /inquiry/:sku       — full size-grid × store (Ch. 4 p. 75)
 *   GET /find-by-size       — size search → matching SKUs with on-hand (Ch. 4 p. 72)
 *   GET /detail-report      — per-SKU rollup (Ch. 4 p. 78)
 *
 * Mounted under /api/v1/inventory, so these paths sit alongside the existing
 * `inventoryMutationRoutes`. None of them overlap with that router's paths.
 */

import { Router, Request, Response, NextFunction, IRouter } from 'express';
import {
  getInventoryInquiry,
  getInquiryInfo,
  getInquiryTrend,
  getInquiryOpenPoRows,
  getInquiryPurchaseOrderHistory,
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
import { analyzeSkuInquiryRecommendation } from '../services/skuInquiryRecommendationService';
import {
  createReorderDraftPurchaseOrder,
  getReorderPlan,
  saveReorderDefaults,
} from '../services/reorderPlannerService';

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
    const storeId = parseIntOrUndefined(req.query.storeId);
    const row = typeof req.query.row === 'string' ? req.query.row.trim() : undefined;
    const inquiry = await getInventoryInquiry(sku, storeId, row);
    if (!inquiry) {
      res.status(404).json({ error: { code: 'SKU_NOT_FOUND', message: `SKU ${sku} not found` } });
      return;
    }
    res.json(inquiry);
  } catch (err) {
    next(err);
  }
});

router.get('/inquiry/:sku/reorder-plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuRaw = req.params.sku;
    const sku = Array.isArray(skuRaw) ? skuRaw[0] : skuRaw;
    const plan = await getReorderPlan(sku, {
      leadTimeDays: parseIntOrUndefined(req.query.leadTimeDays),
      orderCycleDays: parseIntOrUndefined(req.query.orderCycleDays),
      moqQty: parseIntOrUndefined(req.query.moqQty),
    });
    if (!plan) {
      res.status(404).json({ error: { code: 'SKU_NOT_FOUND', message: `SKU ${sku} not found` } });
      return;
    }
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

router.put('/inquiry/:sku/reorder-defaults', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuRaw = req.params.sku;
    const sku = Array.isArray(skuRaw) ? skuRaw[0] : skuRaw;
    const defaults = await saveReorderDefaults(sku, {
      scopeType: req.body?.scopeType === 'VENDOR' ? 'VENDOR' : 'SKU',
      leadTimeDays: parseBodyInt(req.body?.leadTimeDays),
      orderCycleDays: parseBodyInt(req.body?.orderCycleDays),
      moqQty: parseBodyInt(req.body?.moqQty),
      updatedBy: typeof req.body?.updatedBy === 'string' ? req.body.updatedBy : undefined,
    });
    if (!defaults) {
      res.status(404).json({ error: { code: 'SKU_NOT_FOUND', message: `SKU ${sku} not found` } });
      return;
    }
    res.json(defaults);
  } catch (err: any) {
    if (err?.message?.includes('no vendor')) {
      res.status(400).json({ error: { code: 'SKU_VENDOR_REQUIRED', message: err.message } });
      return;
    }
    next(err);
  }
});

router.post('/inquiry/:sku/reorder-plan/draft-po', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuRaw = req.params.sku;
    const sku = Array.isArray(skuRaw) ? skuRaw[0] : skuRaw;
    const result = await createReorderDraftPurchaseOrder(sku, {
      chainId: typeof req.body?.chainId === 'string' ? req.body.chainId : null,
      chainLabel: typeof req.body?.chainLabel === 'string' ? req.body.chainLabel : null,
      leadTimeDays: parseBodyInt(req.body?.leadTimeDays),
      orderCycleDays: parseBodyInt(req.body?.orderCycleDays),
      moqQty: parseBodyInt(req.body?.moqQty),
      casePackId: typeof req.body?.casePackId === 'string' ? req.body.casePackId : null,
      casePackMultiplier: parseBodyInt(req.body?.casePackMultiplier),
      sizeCells: Array.isArray(req.body?.sizeCells) ? req.body.sizeCells : [],
      createdBy: typeof req.body?.createdBy === 'string' ? req.body.createdBy : undefined,
    });
    if (!result) {
      res.status(404).json({ error: { code: 'SKU_NOT_FOUND', message: `SKU ${sku} not found` } });
      return;
    }
    if ('error' in result) {
      const status = [
        'SKU_VENDOR_REQUIRED',
        'EMPTY_REORDER_QUANTITY',
        'CASE_PACK_NOT_FOUND',
        'CASE_PACK_INACTIVE',
        'CASE_PACK_SIZE_TYPE_MISMATCH',
      ].includes(result.error) ? 400 : 409;
      res.status(status).json({ error: { code: result.error, message: reorderDraftPoErrorMessage(result.error) } });
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/inquiry/:sku/ai-recommendation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuRaw = req.params.sku;
    const sku = Array.isArray(skuRaw) ? skuRaw[0] : skuRaw;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
    const recommendation = await analyzeSkuInquiryRecommendation(sku, { notes });
    if (!recommendation) {
      res.status(404).json({ error: { code: 'SKU_NOT_FOUND', message: `SKU ${sku} not found` } });
      return;
    }
    res.json(recommendation);
  } catch (err: any) {
    if (err?.message?.includes('ANTHROPIC_API_KEY')) {
      res.status(500).json({
        error: {
          code: 'CONFIG_ERROR',
          message: 'AI service is not configured. Set the ANTHROPIC_API_KEY environment variable.',
        },
      });
      return;
    }
    console.error(`SKU inquiry AI recommendation error for ${req.params.sku}:`, err);
    res.status(500).json({
      error: {
        code: 'ANALYSIS_FAILED',
        message: 'Failed to analyze SKU. Please try again.',
      },
    });
  }
});

router.get('/inquiry/:sku/trend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuRaw = req.params.sku;
    const sku = Array.isArray(skuRaw) ? skuRaw[0] : skuRaw;
    const storeId = parseIntOrUndefined(req.query.storeId);
    const trend = await getInquiryTrend(sku, storeId);
    if (!trend) {
      res.status(404).json({ error: { code: 'SKU_NOT_FOUND', message: `SKU ${sku} not found` } });
      return;
    }
    res.json(trend);
  } catch (err) {
    next(err);
  }
});

router.get('/inquiry/:sku/info', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuRaw = req.params.sku;
    const sku = Array.isArray(skuRaw) ? skuRaw[0] : skuRaw;
    const storeId = parseIntOrUndefined(req.query.storeId);
    const info = await getInquiryInfo(sku, storeId);
    if (!info) {
      res.status(404).json({ error: { code: 'SKU_NOT_FOUND', message: `SKU ${sku} not found` } });
      return;
    }
    res.json(info);
  } catch (err) {
    next(err);
  }
});

router.get('/inquiry/:sku/open-pos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuRaw = req.params.sku;
    const sku = Array.isArray(skuRaw) ? skuRaw[0] : skuRaw;
    const storeId = parseIntOrUndefined(req.query.storeId);
    const rows = await getInquiryOpenPoRows(sku, storeId);
    res.json({ rows, total: rows.length });
  } catch (err) {
    next(err);
  }
});

router.get('/inquiry/:sku/po-history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuRaw = req.params.sku;
    const sku = Array.isArray(skuRaw) ? skuRaw[0] : skuRaw;
    const storeId = parseIntOrUndefined(req.query.storeId);
    const rows = await getInquiryPurchaseOrderHistory(sku, storeId);
    res.json({ rows, total: rows.length });
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
 *     summary: Find SKUs holding a given size, with optional size-type and merchandise filters.
 *     parameters:
 *       - in: query
 *         name: seedSku
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: sizeTypeCode
 *         required: false
 *         schema: { type: integer }
 *       - in: query
 *         name: columnLabel
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: rowLabel
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: restrictToSizeType
 *         required: false
 *         schema: { type: boolean, default: true }
 *       - in: query
 *         name: vendorCode
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         required: false
 *         schema: { type: integer }
 *       - in: query
 *         name: styleColor
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: storeNumbers
 *         required: false
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         required: false
 *         schema: { type: string, enum: [SKU, DESCRIPTION, VENDOR, CATEGORY], default: SKU }
 *       - in: query
 *         name: separateByStore
 *         required: false
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Matching SKU rows for that size search
 *       400:
 *         description: At least one of columnLabel or rowLabel is required
 */
router.get('/find-by-size', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sortRaw = (req.query.sort as string | undefined)?.trim().toUpperCase();
    const sort =
      sortRaw === 'DESCRIPTION' || sortRaw === 'VENDOR' || sortRaw === 'CATEGORY' || sortRaw === 'SKU'
        ? sortRaw
        : undefined;
    const seedSku = (req.query.seedSku as string | undefined)?.trim()
      || (req.query.sku as string | undefined)?.trim()
      || undefined;
    const columnLabel = (req.query.columnLabel as string | undefined)?.trim()
      || (req.query.size as string | undefined)?.trim()
      || undefined;
    const rowLabel = (req.query.rowLabel as string | undefined)?.trim() || undefined;
    if (!columnLabel && !rowLabel) {
      res.status(400).json({
        error: {
          code: 'MISSING_PARAMS',
          message: 'At least one of columnLabel or rowLabel query params is required.',
        },
      });
      return;
    }
    const result = await findBySize({
      seedSku,
      sizeTypeCode: parseIntOrUndefined(req.query.sizeTypeCode),
      columnLabel,
      rowLabel,
      restrictToSizeType:
        req.query.restrictToSizeType == null
          ? true
          : req.query.restrictToSizeType === 'true' || req.query.restrictToSizeType === '1',
      vendorCode: (req.query.vendorCode as string | undefined)?.trim() || undefined,
      category: parseIntOrUndefined(req.query.category),
      styleColor: (req.query.styleColor as string | undefined)?.trim() || undefined,
      storeNumbers: parseStoreList(req.query.storeNumbers),
      sort,
      separateByStore: req.query.separateByStore === 'true' || req.query.separateByStore === '1',
      limit: parseIntOrUndefined(req.query.limit),
    });
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
 *       200:
 *         description: Array of per-SKU rollup rows
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
 *       200:
 *         description: Rows ordered by date descending
 *       400:
 *         description: Query scope too broad (no SKU and either no window or greater than 90 days)
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
 *       200:
 *         description: Summary payload with months, matrix, stores, and grand totals
 *       400:
 *         description: Missing dates, invalid format, or greater than 366-day window
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
 *       200:
 *         description: Rows with sku, store, onHand, model, max, reorder, currentOnOrder, and sales rollups
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
 *       200:
 *         description: Rows with sku, store, rowLabel, columnLabel, onHand, replenishment targets, and sales rollups
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
 *       200:
 *         description: Array of recommended transfer rows
 *       400:
 *         description: Missing or invalid rule param
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

function parseBodyInt(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function reorderDraftPoErrorMessage(code: string): string {
  if (code === 'SKU_VENDOR_REQUIRED') return 'SKU must have a vendor before creating a reorder draft PO.';
  if (code === 'EMPTY_REORDER_QUANTITY') return 'At least one reorder quantity is required.';
  if (code === 'CASE_PACK_NOT_FOUND') return 'Selected case pack was not found.';
  if (code === 'CASE_PACK_INACTIVE') return 'Selected case pack is inactive.';
  if (code === 'CASE_PACK_SIZE_TYPE_MISMATCH') return 'Selected case pack does not match the SKU size type.';
  if (code === 'EXISTING_PO_NOT_FOUND') return 'The vendor draft PO is no longer available.';
  if (code === 'ONLY_DRAFT_EDITABLE') return 'Only draft purchase orders can be updated by the reorder planner.';
  if (code === 'PO_VENDOR_MISMATCH') return 'The selected draft PO no longer matches the SKU vendor.';
  if (code === 'VENDOR_NOT_FOUND') return 'Vendor not found.';
  if (code.startsWith('SKU_NOT_FOUND')) return 'SKU not found.';
  return 'Failed to create reorder draft PO.';
}

export default router;
