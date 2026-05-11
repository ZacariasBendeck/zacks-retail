/**
 * Read-only sales-reporting endpoints sourced from the legacy RICS MDBs.
 * Hosts the Phase 1 + Phase 2 reports from docs/modules/sales-reporting.md.
 *
 * Mounted under /api/v1/reports/sales.
 *
 * See docs/rics-db-schema.md → "Sales Reporting" for column mappings.
 */

import { Router, Request, Response, NextFunction, IRouter } from 'express';
import { z } from 'zod';
import {
  getSalesByDay,
  getSalesByTime,
  getSalesBySku,
  getSalespersonSummary,
  getBestSellers,
  getSalesAnalysis,
  getSalesHierarchy,
  getSalesPivot,
  getStockStatus,
  listSalesDimensions,
  SalesSourceNotImplementedError,
  ReportTypeNotImplementedError,
} from '../services/salesReporting/salesReportFacade';
import { validateQuery } from '../middleware/validation';
import { getRequestStoreScopeConstraintIfAuthenticated, sendStoreScopeForbidden } from '../middleware/storeScopeMiddleware';
import { prisma } from '../db/prisma';
import { sendXlsx, XLSX_NUMFMT } from '../utils/xlsxExport';
import { parsePositiveIntegerSelection } from '../utils/numberSelection';
import { buildReportFilename, type ReportFilenameCriterion } from '../utils/reportFilename';
import type { PivotDimension, SalesAnalysisCriteria, SalesPivotLevels } from '../services/salesReporting/types';
import { resolveSharedStoreNumbers } from '../services/salesReporting/sharedReportCriteria';
import {
  buildSalesAnalysisHierarchyExport,
  validateSalesAnalysisHierarchyLevels,
  type SalesAnalysisGroupOrder,
  type SalesAnalysisHierarchyLevels,
} from '../services/salesReporting/salesAnalysisExportBuilder';

const router: IRouter = Router();

// ─────────────────────────── helpers ──────────────────────────────────────

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(dateRegex, 'Must be YYYY-MM-DD');
const csvIntList = z
  .string()
  .optional()
  .transform((v, ctx): number[] | undefined => {
    if (!v) return undefined;
    const parsed = parsePositiveIntegerSelection(v);
    if (parsed.error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error });
      return z.NEVER;
    }
    return parsed.values.length ? parsed.values : undefined;
  });
const csvStringList = z
  .string()
  .optional()
  .transform((v): string[] | undefined => {
    if (!v) return undefined;
    const out = v.split(',').map((s) => s.trim()).filter(Boolean);
    return out.length ? out : undefined;
  });
const queryBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return value;
}, z.boolean());

const hierarchyDepthField = z.preprocess((value) => {
  if (typeof value === 'string') return Number(value);
  return value;
}, z.union([z.literal(2), z.literal(3)]));

const salesAnalysisHierarchyDimensionSchema = z.enum([
  'department',
  'category',
  'vendor',
  'store',
  'store_chain',
  'season',
  'group',
  'buyer',
  'attribute',
]);

const sharedCriteriaShape = {
  stores: csvIntList,
  chains: csvStringList,
  sectors: csvIntList,
  departments: csvIntList,
  categories: csvIntList,
  vendors: csvStringList,
  seasons: csvStringList,
  skus: csvStringList,
  groups: csvStringList,
  keywords: csvStringList,
  buyers: csvStringList,
  styleColor: z.string().optional(),
  storesRaw: z.string().optional(),
  categoriesRaw: z.string().optional(),
  vendorsRaw: z.string().optional(),
  seasonsRaw: z.string().optional(),
  skusRaw: z.string().optional(),
  groupsRaw: z.string().optional(),
  keywordsRaw: z.string().optional(),
  styleColorRaw: z.string().optional(),
};

type SharedCriteriaQuery = Partial<{
  stores: number[];
  chains: string[];
  sectors: number[];
  departments: number[];
  categories: number[];
  vendors: string[];
  seasons: string[];
  skus: string[];
  groups: string[];
  keywords: string[];
  buyers: string[];
  styleColor: string;
  storesRaw: string;
  categoriesRaw: string;
  vendorsRaw: string;
  seasonsRaw: string;
  skusRaw: string;
  groupsRaw: string;
  keywordsRaw: string;
  styleColorRaw: string;
}>;

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function buildSalesCriteria(q: SharedCriteriaQuery, stores?: number[]): SalesAnalysisCriteria {
  return {
    stores: stores ?? q.stores,
    chains: q.chains,
    sectors: q.sectors,
    departments: q.departments,
    categories: q.categories,
    vendors: q.vendors,
    seasons: q.seasons,
    skus: q.skus,
    groups: q.groups,
    keywords: q.keywords,
    buyers: q.buyers,
    styleColor: cleanText(q.styleColor),
    storesRaw: cleanText(q.storesRaw),
    categoriesRaw: cleanText(q.categoriesRaw),
    vendorsRaw: cleanText(q.vendorsRaw),
    seasonsRaw: cleanText(q.seasonsRaw),
    skusRaw: cleanText(q.skusRaw),
    groupsRaw: cleanText(q.groupsRaw),
    keywordsRaw: cleanText(q.keywordsRaw),
    styleColorRaw: cleanText(q.styleColorRaw),
  };
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function sendCsv(res: Response, header: string[], rows: (string | number | null | undefined)[][], filename: string): void {
  const body = [header.join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

function effectiveStoresFilenamePart(stores: number[] | undefined): ReportFilenameCriterion {
  return {
    value: stores && stores.length > 0 ? `S${stores.join('_')}` : 'all',
    includeIfDefault: true,
  };
}

function dateRangeFilenameParts(startDate?: string, endDate?: string): ReportFilenameCriterion[] {
  return [{ value: startDate && endDate ? `${startDate}_${endDate}` : undefined }];
}

function sharedCriteriaFilenameParts(
  q: SharedCriteriaQuery,
  options: { omitStores?: boolean } = {},
): ReportFilenameCriterion[] {
  return [
    ...(options.omitStores ? [] : [{ key: 's', value: q.stores }]),
    { key: 'ch', value: q.chains },
    { key: 'sec', value: q.sectors },
    { key: 'dep', value: q.departments },
    { key: 'cat', value: q.categories },
    { key: 'v', value: q.vendors },
    { key: 'sea', value: q.seasons },
    { key: 'sku', value: q.skus },
    { key: 'grp', value: q.groups },
    { key: 'kw', value: q.keywords },
    { key: 'buyer', value: q.buyers },
    { key: 'style', value: cleanText(q.styleColor) },
    { key: 'scrit', value: cleanText(q.storesRaw) },
    { key: 'catcrit', value: cleanText(q.categoriesRaw) },
    { key: 'vcrit', value: cleanText(q.vendorsRaw) },
    { key: 'seacrit', value: cleanText(q.seasonsRaw) },
    { key: 'skucrit', value: cleanText(q.skusRaw) },
    { key: 'grpcrit', value: cleanText(q.groupsRaw) },
    { key: 'kwcrit', value: cleanText(q.keywordsRaw) },
    { key: 'stylecrit', value: cleanText(q.styleColorRaw) },
  ];
}

function salesExportFilename(
  baseStem: string,
  extension: 'csv' | 'xlsx',
  criteria: ReportFilenameCriterion[],
): string {
  return buildReportFilename(baseStem, extension, criteria);
}

async function scopedStoreNumbersForRequest(
  req: Request,
  res: Response,
  q: SharedCriteriaQuery,
): Promise<number[] | undefined | null> {
  const hasRawOrChainStoreCriteria = !!q.chains?.length || !!q.storesRaw?.trim();
  const hasStoreCriteria = !!q.stores?.length || hasRawOrChainStoreCriteria;
  const requestedStores = q.stores ?? [];
  const resolvedRequestedStores = hasStoreCriteria
    ? await resolveSharedStoreNumbers(buildSalesCriteria(q), requestedStores)
    : requestedStores.length > 0
      ? requestedStores
      : undefined;

  const constraint = await getRequestStoreScopeConstraintIfAuthenticated(
    prisma,
    req,
    res,
    hasRawOrChainStoreCriteria ? [] : requestedStores,
  );
  if (constraint === undefined) return resolvedRequestedStores;
  if (constraint === null) return null;

  if (constraint.allStores) return resolvedRequestedStores;

  if (resolvedRequestedStores && resolvedRequestedStores.length > 0) {
    const allowedStores = new Set(constraint.storeIds);
    const scoped = resolvedRequestedStores.filter((storeNumber) => allowedStores.has(storeNumber));
    if (scoped.length === 0) {
      sendStoreScopeForbidden(res, null);
      return null;
    }
    return scoped;
  }

  if (hasStoreCriteria) {
    sendStoreScopeForbidden(res, null);
    return null;
  }

  return constraint.storeIds;
}

// ─────────────────────────── /dimensions ──────────────────────────────────
//
// Returns the small dimension lookups that the Criteria UI needs to populate
// Store / Category / Group dropdowns. Cached 5 minutes server-side.

router.get('/dimensions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const dims = await listSalesDimensions();
    res.json(dims);
  } catch (err) { next(err); }
});

// ─────────────────────────── /by-day (RICS p. 52) ─────────────────────────

const byDaySchema = z.object({
  /** Comma-separated store numbers. Required (no default) — UI defaults to empty. */
  startDate: dateField,
  ...sharedCriteriaShape,
  endDate: dateField,
  comparisonOffsetDays: z.coerce.number().int().positive().max(366 * 2).default(364),
  combineStores: queryBoolean.default(false),
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
});

/**
 * @openapi
 * /api/v1/reports/sales/by-day:
 *   get:
 *     tags: [Sales Reports]
 *     summary: Sales by Day (RICS Ch. 6 p. 52) — net sales + profit by day for one or more stores, with prior-year weekday comparison.
 *     parameters:
 *       - { in: query, name: stores, required: false, schema: { type: string, description: "CSV of store numbers; omit for all stores" } }
 *       - { in: query, name: startDate, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: endDate, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: comparisonOffsetDays, schema: { type: integer, default: 364 } }
 *       - { in: query, name: combineStores, schema: { type: boolean, default: false } }
 *       - { in: query, name: format, schema: { type: string, enum: [json, csv, xlsx] } }
 */
router.get('/by-day', validateQuery(byDaySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof byDaySchema>;
    if (q.startDate > q.endDate) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'startDate must be <= endDate' } });
      return;
    }
    const scopedStores = await scopedStoreNumbersForRequest(req, res, q);
    if (scopedStores === null) return;
    const stores = scopedStores ?? [];
    const report = await getSalesByDay({
      storeNumbers: stores,
      startDate: q.startDate,
      endDate: q.endDate,
      comparisonOffsetDays: q.comparisonOffsetDays,
      combineStores: q.combineStores,
      criteria: buildSalesCriteria(q, scopedStores ?? undefined),
    });

    // Flat row list for CSV/XLSX. Combined mode emits a single block;
    // separate mode emits one block per store, each followed by a totals row.
    const exportBlocks = report.combineStores && report.combined
      ? [{ label: report.combined.storeLabel, rows: report.combined.rows, totals: report.combined.totals }]
      : report.storeBreakdowns.map((b) => ({ label: b.storeLabel, rows: b.rows, totals: b.totals }));
    const filenameCriteria = [
      effectiveStoresFilenamePart(stores),
      ...dateRangeFilenameParts(q.startDate, q.endDate),
      { key: 'cmp', value: q.comparisonOffsetDays, defaultValue: 364 },
      { key: 'comb', value: q.combineStores, defaultValue: false },
      ...sharedCriteriaFilenameParts(q, { omitStores: true }),
    ];

    if (q.format === 'xlsx') {
      const xlsxRows: Array<Record<string, unknown>> = [];
      for (const block of exportBlocks) {
        for (const r of block.rows) {
          xlsxRows.push({
            store: block.label,
            date: r.date,
            day: r.dayName,
            netSales: r.netSales,
            profit: r.profit,
            comparedToDate: r.comparedToDate,
            comparedNetSales: r.comparedNetSales,
            comparedProfit: r.comparedProfit,
            dollarChange: r.dollarChange,
            profitChange: r.profitChange,
            pctChange: r.pctChange,
          });
        }
        xlsxRows.push({
          store: `${block.label} — Totals`,
          date: '',
          day: '',
          netSales: block.totals.netSales,
          profit: block.totals.profit,
          comparedToDate: '',
          comparedNetSales: block.totals.comparedNetSales,
          comparedProfit: block.totals.comparedProfit,
          dollarChange: block.totals.dollarChange,
          profitChange: block.totals.profitChange,
          pctChange: block.totals.pctChange,
        });
      }
      await sendXlsx(res, {
        filename: salesExportFilename('SBD', 'xlsx', filenameCriteria),
        sheets: [
          {
            name: 'Sales by Day',
            columns: [
              { header: 'Store', key: 'store', width: 28 },
              { header: 'Date', key: 'date', width: 12 },
              { header: 'Day', key: 'day', width: 12 },
              { header: 'Net Sales', key: 'netSales', width: 14, numFmt: XLSX_NUMFMT.money },
              { header: 'Profit', key: 'profit', width: 14, numFmt: XLSX_NUMFMT.money },
              { header: 'Compared To Date', key: 'comparedToDate', width: 16 },
              { header: 'Compared Net Sales', key: 'comparedNetSales', width: 18, numFmt: XLSX_NUMFMT.money },
              { header: 'Compared Profit', key: 'comparedProfit', width: 16, numFmt: XLSX_NUMFMT.money },
              { header: '$ Change', key: 'dollarChange', width: 12, numFmt: XLSX_NUMFMT.money },
              { header: 'Profit Change', key: 'profitChange', width: 14, numFmt: XLSX_NUMFMT.money },
              { header: '% Change', key: 'pctChange', width: 10, numFmt: XLSX_NUMFMT.percent1 },
            ],
            rows: xlsxRows,
          },
        ],
      });
      return;
    }
    if (q.format === 'csv') {
      const header = ['Store', 'Date', 'Day', 'Net Sales', 'Profit', 'Compared To Date', 'Compared Net Sales', 'Compared Profit', '$ Change', 'Profit Change', '% Change'];
      const rows: (string | number | null | undefined)[][] = [];
      for (const block of exportBlocks) {
        for (const r of block.rows) {
          rows.push([
            block.label,
            r.date,
            r.dayName,
            r.netSales.toFixed(2),
            r.profit.toFixed(2),
            r.comparedToDate,
            r.comparedNetSales.toFixed(2),
            r.comparedProfit.toFixed(2),
            r.dollarChange.toFixed(2),
            r.profitChange.toFixed(2),
            r.pctChange == null ? '' : r.pctChange.toFixed(1),
          ]);
        }
        rows.push([
          `${block.label} — Totals`, '', '',
          block.totals.netSales.toFixed(2),
          block.totals.profit.toFixed(2),
          '',
          block.totals.comparedNetSales.toFixed(2),
          block.totals.comparedProfit.toFixed(2),
          block.totals.dollarChange.toFixed(2),
          block.totals.profitChange.toFixed(2),
          block.totals.pctChange == null ? '' : block.totals.pctChange.toFixed(1),
        ]);
      }
      sendCsv(res, header, rows, salesExportFilename('SBD', 'csv', filenameCriteria));
      return;
    }
    res.json(report);
  } catch (err) { next(err); }
});

// ─────────────────────────── /by-time (RICS p. 41) ────────────────────────

const byTimeSchema = z.object({
  startDate: dateField,
  endDate: dateField,
  compareStartDate: dateField.optional(),
  compareEndDate: dateField.optional(),
  ...sharedCriteriaShape,
  pctOfTotal: queryBoolean.default(false),
  format: z.enum(['json', 'csv']).default('json'),
});

router.get('/by-time', validateQuery(byTimeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof byTimeSchema>;
    const scopedStores = await scopedStoreNumbersForRequest(req, res, q);
    if (scopedStores === null) return;
    const report = await getSalesByTime({
      startDate: q.startDate,
      endDate: q.endDate,
      compareStartDate: q.compareStartDate,
      compareEndDate: q.compareEndDate,
      storeNumbers: scopedStores,
      printPctOfTotal: q.pctOfTotal,
      criteria: buildSalesCriteria(q, scopedStores ?? undefined),
    });
    const filenameCriteria = [
      effectiveStoresFilenamePart(scopedStores),
      ...dateRangeFilenameParts(q.startDate, q.endDate),
      { key: 'cf', value: q.compareStartDate },
      { key: 'ct', value: q.compareEndDate },
      { key: 'pct', value: q.pctOfTotal, defaultValue: false },
      ...sharedCriteriaFilenameParts(q, { omitStores: true }),
    ];
    if (q.format === 'csv') {
      const header = ['Hour', 'Tickets', 'Qty', 'Dollars', '% of Total'];
      const rows = report.rangeA.map((b) => [
        b.hour, b.tickets, b.qty, b.dollars.toFixed(2), b.pctOfTotal == null ? '' : b.pctOfTotal.toFixed(1),
      ]);
      sendCsv(res, header, rows, salesExportFilename('SBT', 'csv', filenameCriteria));
      return;
    }
    res.json(report);
  } catch (err) { next(err); }
});

// ─────────────────────────── /by-sku (RICS p. 43) ─────────────────────────

const bySkuSchema = z.object({
  startDate: dateField,
  endDate: dateField,
  ...sharedCriteriaShape,
  sortBy: z.enum(['SKU', 'CATEGORY_SKU', 'VENDOR_SKU']).default('SKU'),
  includeReturns: queryBoolean.default(true),
  format: z.enum(['json', 'csv']).default('json'),
});

router.get('/by-sku', validateQuery(bySkuSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof bySkuSchema>;
    const scopedStores = await scopedStoreNumbersForRequest(req, res, q);
    if (scopedStores === null) return;
    const report = await getSalesBySku({
      startDate: q.startDate,
      endDate: q.endDate,
      storeNumbers: scopedStores,
      sortBy: q.sortBy,
      includeReturns: q.includeReturns,
      skus: q.skus,
      criteria: buildSalesCriteria(q, scopedStores ?? undefined),
    });
    const filenameCriteria = [
      effectiveStoresFilenamePart(scopedStores),
      ...dateRangeFilenameParts(q.startDate, q.endDate),
      { key: 'sort', value: q.sortBy, includeIfDefault: true },
      { key: 'ret', value: q.includeReturns, defaultValue: true },
      ...sharedCriteriaFilenameParts(q, { omitStores: true }),
    ];
    if (q.format === 'csv') {
      const header = ['SKU', 'Category', 'Vendor', 'Qty', 'Dollars', 'Returns Qty', 'Returns Dollars'];
      const rows = report.rows.map((r) => [
        r.sku, r.category ?? '', r.vendor ?? '', r.qty, r.dollars.toFixed(2), r.returnsQty, r.returnsDollars.toFixed(2),
      ]);
      sendCsv(res, header, rows, salesExportFilename('SBSKU', 'csv', filenameCriteria));
      return;
    }
    res.json(report);
  } catch (err) { next(err); }
});

// ─────────────────────────── /salesperson-summary (RICS p. 42) ────────────

const salespersonSchema = z.object({
  startDate: dateField,
  endDate: dateField,
  ...sharedCriteriaShape,
  subtotalBy: z.enum(['DEPARTMENT', 'VENDOR']).optional(),
  combineStores: queryBoolean.default(false),
  cashierSummary: queryBoolean.default(false),
  format: z.enum(['json', 'csv']).default('json'),
});

router.get('/salesperson-summary', validateQuery(salespersonSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof salespersonSchema>;
    const scopedStores = await scopedStoreNumbersForRequest(req, res, q);
    if (scopedStores === null) return;
    const report = await getSalespersonSummary({
      startDate: q.startDate,
      endDate: q.endDate,
      storeNumbers: scopedStores,
      subtotalBy: q.subtotalBy,
      combineStores: q.combineStores,
      cashierSummary: q.cashierSummary,
      criteria: buildSalesCriteria(q, scopedStores ?? undefined),
    });
    const filenameCriteria = [
      effectiveStoresFilenamePart(scopedStores),
      ...dateRangeFilenameParts(q.startDate, q.endDate),
      { key: 'sub', value: q.subtotalBy },
      { key: 'comb', value: q.combineStores, defaultValue: false },
      { key: 'cash', value: q.cashierSummary, defaultValue: false },
      ...sharedCriteriaFilenameParts(q, { omitStores: true }),
    ];
    if (q.format === 'csv') {
      const header = ['Salesperson', 'Name', 'Store', 'Qty', 'Dollars', 'Perks'];
      const rows = report.salespeople.map((s) => [
        s.salespersonCode, s.salespersonName ?? '', s.storeNumber, s.qty, s.dollars.toFixed(2), s.perks.toFixed(2),
      ]);
      sendCsv(res, header, rows, salesExportFilename('SPSUM', 'csv', filenameCriteria));
      return;
    }
    res.json(report);
  } catch (err) { next(err); }
});

// ─────────────────────────── /best-sellers (RICS p. 93) ───────────────────

const bestSellersSchema = z.object({
  dimension: z.enum(['SKU', 'VENDOR', 'CATEGORY', 'STORE']),
  metric: z.enum(['QTY', 'NET_SALES', 'PROFIT']),
  period: z.enum(['WTD', 'MTD', 'STD', 'YTD']).optional(),
  lastNMonths: z.coerce.number().int().min(1).max(24).optional(),
  ...sharedCriteriaShape,
  combineStores: queryBoolean.default(false),
  topN: z.coerce.number().int().min(1).max(1000).default(50),
  format: z.enum(['json', 'csv']).default('json'),
});

router.get('/best-sellers', validateQuery(bestSellersSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof bestSellersSchema>;
    if (!q.period && !q.lastNMonths) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Either period or lastNMonths is required' } });
      return;
    }
    const scopedStores = await scopedStoreNumbersForRequest(req, res, q);
    if (scopedStores === null) return;
    const report = await getBestSellers({
      dimension: q.dimension,
      metric: q.metric,
      period: q.lastNMonths ? { lastNMonths: q.lastNMonths } : (q.period as 'WTD' | 'MTD' | 'STD' | 'YTD'),
      storeNumbers: scopedStores,
      combineStores: q.combineStores,
      topN: q.topN,
      criteria: buildSalesCriteria(q, scopedStores ?? undefined),
    });
    const filenameCriteria = [
      { value: q.dimension, includeIfDefault: true },
      { value: q.metric, includeIfDefault: true },
      { value: q.lastNMonths ? `${q.lastNMonths}mo` : q.period, includeIfDefault: true },
      effectiveStoresFilenamePart(scopedStores),
      { key: 'top', value: q.topN, includeIfDefault: true },
      { key: 'comb', value: q.combineStores, defaultValue: false },
      ...sharedCriteriaFilenameParts(q, { omitStores: true }),
    ];
    if (q.format === 'csv') {
      const header = ['Rank', 'Key', 'Label', 'Qty', 'Net Sales', 'Profit', 'Profit %'];
      const rows = report.rows.map((r) => [
        r.rank, r.key, r.label ?? '', r.qty, r.netSales.toFixed(2), r.profit.toFixed(2),
        r.profitPct == null ? '' : r.profitPct.toFixed(1),
      ]);
      sendCsv(res, header, rows, salesExportFilename('BS', 'csv', filenameCriteria));
      return;
    }
    res.json(report);
  } catch (err) { next(err); }
});

// ─────────────────────────── /sales-analysis (RICS p. 88) ─────────────────

const salesAnalysisSchema = z.object({
  dimension: z.enum(['CATEGORY', 'VENDOR', 'SEASON', 'GROUP']),
  reportType: z.enum([
    'SKU_DETAIL',
    'CATEGORY_SUMMARY',
    'DEPT_SUMMARY',
    'STYLE_COLOR_SUMMARY',
    'VENDOR_SUMMARY',
    'PRICE_POINT_SUMMARY',
    'SEASON_SUMMARY',
    'GROUP_SUMMARY',
    'SECTOR_SUMMARY',
  ]),
  storeOption: z.enum(['SEPARATE', 'COMPARE', 'COMBINE']).default('SEPARATE'),
  startDate: dateField.optional(),
  endDate: dateField.optional(),
  stores: csvIntList,
  chains: csvStringList,
  sectors: csvIntList,
  departments: csvIntList,
  categories: csvIntList,
  vendors: csvStringList,
  seasons: csvStringList,
  skus: csvStringList,
  styleColor: z.string().optional(),
  groups: csvStringList,
  keywords: csvStringList,
  buyers: csvStringList,
  // RICS-grammar raw strings per facet — ranges like "556-599", exclusions
  // "<>575", wildcards "5?0". Merged with the structured lists above by the
  // adapter (see ricsSalesReportAdapter.applyAnalysisCriteria).
  storesRaw: z.string().optional(),
  categoriesRaw: z.string().optional(),
  vendorsRaw: z.string().optional(),
  seasonsRaw: z.string().optional(),
  skusRaw: z.string().optional(),
  groupsRaw: z.string().optional(),
  keywordsRaw: z.string().optional(),
  styleColorRaw: z.string().optional(),
  wtd: queryBoolean.default(false),
  mtd: queryBoolean.default(false),
  std: queryBoolean.default(false),
  ytd: queryBoolean.default(false),
  priorYear: queryBoolean.default(false),
  // Opt-in per-SKU enrichment. Defaults to false so the preview endpoint
  // stays fast — only the full-screen viewer asks for these columns.
  includeAttributes: queryBoolean.default(false),
  includeOnOrder: queryBoolean.default(false),
  exportLayout: z.enum(['detail', 'hierarchy']).default('detail'),
  hierarchyDepth: hierarchyDepthField.default(2),
  level1: salesAnalysisHierarchyDimensionSchema.default('department'),
  level2: salesAnalysisHierarchyDimensionSchema.default('category'),
  level3: salesAnalysisHierarchyDimensionSchema.default('attribute'),
  groupOrder: z.enum(['NET_SALES_DESC', 'LEFT_GROUP_ASC']).default('NET_SALES_DESC'),
  attributeDimensionCode: z.string().optional(),
  showPercentOfTotal: queryBoolean.default(false),
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
});

router.get('/sales-analysis', validateQuery(salesAnalysisSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof salesAnalysisSchema>;
    // Enforce the RICS "no more than two Printing Options" mutex.
    const flags = [q.wtd, q.mtd, q.std, q.ytd, q.priorYear].filter(Boolean).length;
    if (flags > 2) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No more than two of {wtd, mtd, std, ytd, priorYear} may be set (RICS Printing Options constraint).',
        },
      });
      return;
    }
    const hierarchyLevels = (q.hierarchyDepth === 3
      ? [q.level1, q.level2, q.level3]
      : [q.level1, q.level2]) as SalesAnalysisHierarchyLevels;
    const useHierarchyExport = q.exportLayout === 'hierarchy' &&
      q.reportType === 'SKU_DETAIL' &&
      (q.format === 'csv' || q.format === 'xlsx');
    if (useHierarchyExport) {
      const hierarchyError = validateSalesAnalysisHierarchyLevels(hierarchyLevels);
      if (hierarchyError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: hierarchyError,
          },
        });
        return;
      }
    }
    const scopedStores = await scopedStoreNumbersForRequest(req, res, q);
    if (scopedStores === null) return;
    const report = await getSalesAnalysis({
      dimension: q.dimension,
      reportType: q.reportType,
      storeOption: q.storeOption,
      criteria: buildSalesCriteria(q, scopedStores ?? undefined),
      printing: { wtd: q.wtd, mtd: q.mtd, std: q.std, ytd: q.ytd, priorYear: q.priorYear },
      startDate: q.startDate,
      endDate: q.endDate,
      includeAttributes: q.includeAttributes || useHierarchyExport,
      includeOnOrder: q.includeOnOrder,
    });
    const printingOptions = [
      q.wtd ? 'wtd' : undefined,
      q.mtd ? 'mtd' : undefined,
      q.std ? 'std' : undefined,
      q.ytd ? 'ytd' : undefined,
      q.priorYear ? 'prior-year' : undefined,
    ].filter((value): value is string => !!value);
    const filenameCriteria = [
      { value: q.dimension, includeIfDefault: true },
      { value: q.reportType, includeIfDefault: true },
      { value: q.storeOption, includeIfDefault: true },
      effectiveStoresFilenamePart(scopedStores),
      ...dateRangeFilenameParts(q.startDate, q.endDate),
      { key: 'p', value: printingOptions },
      { key: 'attr', value: q.includeAttributes, defaultValue: false },
      { key: 'oo', value: q.includeOnOrder, defaultValue: false },
      { key: 'layout', value: useHierarchyExport ? q.exportLayout : undefined, defaultValue: 'detail' },
      { key: 'h', value: useHierarchyExport ? hierarchyLevels.join('_') : undefined },
      { key: 'order', value: useHierarchyExport ? q.groupOrder : undefined, defaultValue: 'NET_SALES_DESC' },
      { key: 'pct', value: useHierarchyExport ? q.showPercentOfTotal : undefined, defaultValue: false },
      ...sharedCriteriaFilenameParts(q, { omitStores: true }),
    ];
    if (useHierarchyExport && q.format === 'xlsx') {
      const groupedExport = buildSalesAnalysisHierarchyExport(report, {
        levels: hierarchyLevels,
        groupOrder: q.groupOrder as SalesAnalysisGroupOrder,
        attributeDimensionCode: q.attributeDimensionCode,
        showPercentOfTotal: q.showPercentOfTotal,
        includeOnOrder: q.includeOnOrder,
        priorYear: q.priorYear,
        startDate: q.startDate,
        endDate: q.endDate,
      });
      await sendXlsx(res, {
        filename: salesExportFilename('SAR', 'xlsx', filenameCriteria),
        sheets: groupedExport.xlsxSheets,
      });
      return;
    }
    if (useHierarchyExport && q.format === 'csv') {
      const groupedExport = buildSalesAnalysisHierarchyExport(report, {
        levels: hierarchyLevels,
        groupOrder: q.groupOrder as SalesAnalysisGroupOrder,
        attributeDimensionCode: q.attributeDimensionCode,
        showPercentOfTotal: q.showPercentOfTotal,
        includeOnOrder: q.includeOnOrder,
        priorYear: q.priorYear,
        startDate: q.startDate,
        endDate: q.endDate,
      });
      sendCsv(res, groupedExport.csvHeader, groupedExport.csvRows, salesExportFilename('SAR', 'csv', filenameCriteria));
      return;
    }
    if (q.format === 'xlsx') {
      await sendXlsx(res, {
        filename: salesExportFilename('SAR', 'xlsx', filenameCriteria),
        sheets: [
          {
            name: 'Sales Analysis',
            columns: [
              { header: 'Dimension', key: 'dimension', width: 18 },
              { header: 'Label', key: 'label', width: 32 },
              { header: 'Store', key: 'store', width: 10 },
              { header: 'On Hand Qty', key: 'unitsOnHand', width: 14, numFmt: XLSX_NUMFMT.integer },
              { header: 'Avg Cost', key: 'inventoryUnitCost', width: 12, numFmt: XLSX_NUMFMT.money },
              { header: 'Total Inventory Cost', key: 'onHandAtCost', width: 20, numFmt: XLSX_NUMFMT.money },
              { header: 'Qty Sold', key: 'qty', width: 10, numFmt: XLSX_NUMFMT.integer },
              { header: 'Net Sales', key: 'netSales', width: 14, numFmt: XLSX_NUMFMT.money },
              { header: 'COGS', key: 'cogs', width: 14, numFmt: XLSX_NUMFMT.money },
              { header: 'Gross Profit', key: 'grossProfit', width: 14, numFmt: XLSX_NUMFMT.money },
              { header: 'GP %', key: 'gpPct', width: 10, numFmt: XLSX_NUMFMT.percent1 },
              { header: 'Turns', key: 'turns', width: 10, numFmt: XLSX_NUMFMT.decimal2 },
              { header: 'ROI', key: 'roiPct', width: 10, numFmt: XLSX_NUMFMT.percent1 },
              ...(q.priorYear
                ? [
                    { header: 'Prior Yr Qty', key: 'priorYearQty', width: 12, numFmt: XLSX_NUMFMT.integer },
                    { header: 'Prior Yr Sales', key: 'priorYearNetSales', width: 14, numFmt: XLSX_NUMFMT.money },
                    { header: 'Prior Yr Sales % Change', key: 'pyPctChange', width: 20, numFmt: XLSX_NUMFMT.percent1 },
                    { header: 'Prior Yr Profit', key: 'priorYearGrossProfit', width: 14, numFmt: XLSX_NUMFMT.money },
                    { header: 'Prior Yr Profit % Change', key: 'pyGrossProfitPctChange', width: 20, numFmt: XLSX_NUMFMT.percent1 },
                    { header: 'Prior Yr On Hand Cost', key: 'priorYearOnHandAtCost', width: 20, numFmt: XLSX_NUMFMT.money },
                    { header: 'Prior Yr On Hand % Change', key: 'pyOnHandPctChange', width: 22, numFmt: XLSX_NUMFMT.percent1 },
                  ]
                : []),
              ...(q.includeOnOrder
                ? [
                    { header: 'On Order Qty', key: 'onOrderQty', width: 14, numFmt: XLSX_NUMFMT.integer },
                    { header: 'Landed Cost/Unit', key: 'onOrderUnitCost', width: 18, numFmt: XLSX_NUMFMT.money },
                    { header: 'Total Order Cost', key: 'onOrderCost', width: 18, numFmt: XLSX_NUMFMT.money },
                  ]
                : []),
            ],
            rows: report.rows.map((r) => ({
              dimension: r.dimensionKey,
              label: r.dimensionLabel ?? '',
              store: r.storeNumber ?? '',
              unitsOnHand: r.unitsOnHand,
              inventoryUnitCost: r.inventoryUnitCost,
              onHandAtCost: r.onHandAtCost,
              qty: r.qty,
              netSales: r.netSales,
              cogs: r.cogs,
              grossProfit: r.grossProfit,
              gpPct: r.gpPct,
              turns: r.turns,
              roiPct: r.roiPct,
              ...(q.priorYear
                ? {
                    priorYearQty: r.priorYearQty,
                    priorYearNetSales: r.priorYearNetSales,
                    pyPctChange: r.pyPctChange,
                    priorYearGrossProfit: r.priorYearGrossProfit,
                    pyGrossProfitPctChange: r.pyGrossProfitPctChange,
                    priorYearOnHandAtCost: r.priorYearOnHandAtCost,
                    pyOnHandPctChange: r.pyOnHandPctChange,
                  }
                : {}),
              ...(q.includeOnOrder
                ? {
                    onOrderQty: r.onOrderQty ?? 0,
                    onOrderUnitCost: r.onOrderUnitCost ?? null,
                    onOrderCost: r.onOrderCost ?? null,
                  }
                : {}),
            })),
          },
        ],
      });
      return;
    }
    if (q.format === 'csv') {
      const header = [
        'Dimension',
        'Label',
        'Store',
        'On Hand Qty',
        'Avg Cost',
        'Total Inventory Cost',
        'Qty Sold',
        'Net Sales',
        'COGS',
        'Gross Profit',
        'GP %',
        ...(q.priorYear
          ? [
              'Prior Yr Qty',
              'Prior Yr Sales',
              'Prior Yr Sales % Change',
              'Prior Yr Profit',
              'Prior Yr Profit % Change',
              'Prior Yr On Hand Cost',
              'Prior Yr On Hand % Change',
            ]
          : []),
        ...(q.includeOnOrder ? ['On Order Qty', 'Landed Cost/Unit', 'Total Order Cost'] : []),
      ];
      const rows = report.rows.map((r) => [
        r.dimensionKey, r.dimensionLabel ?? '', r.storeNumber ?? '',
        r.unitsOnHand,
        r.inventoryUnitCost == null ? '' : r.inventoryUnitCost.toFixed(2),
        r.onHandAtCost.toFixed(2),
        r.qty,
        r.netSales.toFixed(2), r.cogs.toFixed(2), r.grossProfit.toFixed(2),
        r.gpPct == null ? '' : r.gpPct.toFixed(1),
        ...(q.priorYear
          ? [
              r.priorYearQty == null ? '' : r.priorYearQty,
              r.priorYearNetSales == null ? '' : r.priorYearNetSales.toFixed(2),
              r.pyPctChange == null ? '' : r.pyPctChange.toFixed(1),
              r.priorYearGrossProfit == null ? '' : r.priorYearGrossProfit.toFixed(2),
              r.pyGrossProfitPctChange == null ? '' : r.pyGrossProfitPctChange.toFixed(1),
              r.priorYearOnHandAtCost == null ? '' : r.priorYearOnHandAtCost.toFixed(2),
              r.pyOnHandPctChange == null ? '' : r.pyOnHandPctChange.toFixed(1),
            ]
          : []),
        ...(q.includeOnOrder
          ? [
              r.onOrderQty ?? 0,
              r.onOrderUnitCost == null ? '' : r.onOrderUnitCost.toFixed(2),
              r.onOrderCost == null ? '' : r.onOrderCost.toFixed(2),
            ]
          : []),
      ]);
      sendCsv(res, header, rows, salesExportFilename('SAR', 'csv', filenameCriteria));
      return;
    }
    res.json(report);
  } catch (err) { next(err); }
});

// ─────────────────────────── /sales-pivot (app-native, no RICS ancestor) ─
//
// One endpoint, three variants selected by `variant`:
//   department                 Sector → Dept → Category → SKU       (default)
//   department-separate-store  Store → Sector → Dept → Category → SKU
//   buyer                      Buyer → Dept → Category → SKU
//
// The response shape is unified: identity fields that don't apply to the
// requested variant are null. The client groups the flat leaves into the
// appropriate tree.

const salesPivotSchema = z.object({
  startDate: dateField,
  endDate: dateField,
  ...sharedCriteriaShape,
  variant: z.enum([
    'department',
    'department-separate-store',
    'buyer',
    'buyer-vendor',
    'buyer-vendor-separate-store',
    'custom',
  ]).default('department'),
  // Two or three hierarchy dimensions, required when variant='custom'. Zod leaves
  // them optional so the fixed variants don't have to pass them.
  level1: z.enum(['buyer', 'sector', 'department', 'season', 'group', 'vendor', 'store']).optional(),
  level2: z.enum(['buyer', 'sector', 'department', 'season', 'group', 'vendor', 'store', 'category', 'attribute']).optional(),
  level3: z.enum(['buyer', 'sector', 'department', 'season', 'group', 'vendor', 'store', 'category', 'attribute']).optional(),
  attributeDimension: z.string().trim().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

router.get('/sales-pivot', validateQuery(salesPivotSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof salesPivotSchema>;
    if (q.startDate > q.endDate) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'startDate must be <= endDate' } });
      return;
    }
    let levels: SalesPivotLevels | undefined;
    if (q.variant === 'custom') {
      if (!q.level1 || !q.level2) {
        res.status(400).json({ error: {
          code: 'VALIDATION_ERROR',
          message: 'level1 and level2 are required when variant=custom',
        } });
        return;
      }
      const candidateLevels = (q.level3
        ? [q.level1, q.level2, q.level3]
        : [q.level1, q.level2]) as SalesPivotLevels;
      const set = new Set<PivotDimension>(candidateLevels);
      if (set.size !== candidateLevels.length) {
        res.status(400).json({ error: {
          code: 'VALIDATION_ERROR',
          message: 'custom pivot levels must be distinct dimensions',
        } });
        return;
      }
      const attributeIndex = candidateLevels.findIndex((level) => level === 'attribute');
      if (attributeIndex !== -1 && attributeIndex !== candidateLevels.length - 1) {
        res.status(400).json({ error: {
          code: 'VALIDATION_ERROR',
          message: 'attribute is only allowed as the deepest custom pivot level',
        } });
        return;
      }
      levels = candidateLevels;
    }
    const scopedStores = await scopedStoreNumbersForRequest(req, res, q);
    if (scopedStores === null) return;
    const report = await getSalesPivot({
      startDate: q.startDate,
      endDate: q.endDate,
      storeNumbers: scopedStores,
      variant: q.variant,
      levels,
      criteria: buildSalesCriteria(q, scopedStores ?? undefined),
    });
    const filenameCriteria = [
      { value: q.variant, includeIfDefault: true },
      { key: 'lvl', value: levels },
      effectiveStoresFilenamePart(scopedStores),
      ...dateRangeFilenameParts(q.startDate, q.endDate),
      ...sharedCriteriaFilenameParts(q, { omitStores: true }),
    ];
    if (q.format === 'csv') {
      const yr = (label: string) => `${label} ${report.currentYear}`;
      const py = (label: string) => `${label} ${report.priorYear}`;
      const measureHeader = [
        'OnHand Qty', 'OnHand Cost Val',
        yr('Qty'), yr('Net Sales'), yr('Profit'),
        py('Qty'), py('Net Sales'), py('Profit'),
      ];
      const measureCells = (r: typeof report.rows[number]) => [
        r.onHandQty, r.onHandCostVal.toFixed(2),
        r.qtyTY, r.netSalesTY.toFixed(2), r.profitTY.toFixed(2),
        r.qtyLY, r.netSalesLY.toFixed(2), r.profitLY.toFixed(2),
      ];

      if (q.variant === 'buyer') {
        const header = [
          'Buyer Code', 'Buyer',
          'Dept #', 'Dept', 'Category #', 'Category',
          'SKU', 'Description',
          ...measureHeader,
        ];
        const rows = report.rows.map((r) => [
          r.buyerCode ?? '', r.buyerLabel ?? '',
          r.dept ?? '', r.deptDesc ?? '',
          r.categ ?? '', r.categDesc ?? '',
          r.sku, r.skuDescription ?? '',
          ...measureCells(r),
        ]);
        sendCsv(res, header, rows, salesExportFilename('SPV', 'csv', filenameCriteria));
        return;
      }

      if (q.variant === 'custom' && levels) {
        // Dimension → (code header, label header, code cell, label cell).
        // Emits a pair of columns per chosen level so the CSV is readable
        // without a schema — "Buyer Code / Buyer", "Sector # / Sector", etc.
        const dimCols = (r: typeof report.rows[number], dim: PivotDimension): [string | number, string] => {
          switch (dim) {
            case 'buyer':      return [r.buyerCode ?? '', r.buyerLabel ?? ''];
            case 'sector':     return [r.sector ?? '', r.sectorDesc ?? ''];
            case 'department': return [r.dept ?? '', r.deptDesc ?? ''];
            case 'season':     return [r.season ?? '', r.seasonDesc ?? ''];
            case 'group':      return [r.groupCode ?? '', r.groupDesc ?? ''];
            case 'vendor':     return [r.vendorCode ?? '', r.vendorLabel ?? ''];
            case 'store':      return [r.storeNumber ?? '', r.storeName ?? ''];
            case 'category':   return [r.categ ?? '', r.categDesc ?? ''];
            case 'attribute': {
              const attr = q.attributeDimension
                ? r.attributeAssignments?.[q.attributeDimension]
                : null;
              return [attr?.valueCodes.join(', ') ?? '', attr?.label ?? ''];
            }
          }
        };
        const dimHeader = (dim: PivotDimension): [string, string] => {
          switch (dim) {
            case 'buyer':      return ['Buyer Code', 'Buyer'];
            case 'sector':     return ['Sector #', 'Sector'];
            case 'department': return ['Dept #', 'Dept'];
            case 'season':     return ['Season', 'Season Desc'];
            case 'group':      return ['Group Code', 'Group'];
            case 'vendor':     return ['Vendor Code', 'Vendor'];
            case 'store':      return ['Store #', 'Store'];
            case 'category':   return ['Category #', 'Category'];
            case 'attribute': {
              const label = report.attributeDimensions
                ?.find((dimension) => dimension.code === q.attributeDimension)
                ?.label ?? 'Attribute';
              return [`${label} Code`, label];
            }
          }
        };
        const header = [
          ...levels.flatMap((level) => dimHeader(level)),
          'SKU', 'Description',
          ...measureHeader,
        ];
        const rows = report.rows.map((r) => [
          ...levels.flatMap((level) => dimCols(r, level)),
          r.sku, r.skuDescription ?? '',
          ...measureCells(r),
        ]);
        sendCsv(res, header, rows, salesExportFilename('SPV', 'csv', filenameCriteria));
        return;
      }

      if (q.variant === 'buyer-vendor' || q.variant === 'buyer-vendor-separate-store') {
        const separate = q.variant === 'buyer-vendor-separate-store';
        const header = [
          ...(separate ? ['Store #', 'Store'] : []),
          'Buyer Code', 'Buyer',
          'Vendor Code', 'Vendor',
          'SKU', 'Description',
          ...measureHeader,
        ];
        const rows = report.rows.map((r) => [
          ...(separate ? [r.storeNumber ?? '', r.storeName ?? ''] : []),
          r.buyerCode ?? '', r.buyerLabel ?? '',
          r.vendorCode ?? '', r.vendorLabel ?? '',
          r.sku, r.skuDescription ?? '',
          ...measureCells(r),
        ]);
        sendCsv(res, header, rows, salesExportFilename('SPV', 'csv', filenameCriteria));
        return;
      }

      const separate = q.variant === 'department-separate-store';
      const header = [
        ...(separate ? ['Store #', 'Store'] : []),
        'Sector #', 'Sector',
        'Dept #', 'Dept',
        'Category #', 'Category',
        'SKU', 'Description',
        ...measureHeader,
      ];
      const rows = report.rows.map((r) => [
        ...(separate ? [r.storeNumber ?? '', r.storeName ?? ''] : []),
        r.sector ?? '', r.sectorDesc ?? '',
        r.dept ?? '', r.deptDesc ?? '',
        r.categ ?? '', r.categDesc ?? '',
        r.sku, r.skuDescription ?? '',
        ...measureCells(r),
      ]);
      sendCsv(res, header, rows, salesExportFilename('SPV', 'csv', filenameCriteria));
      return;
    }
    res.json(report);
  } catch (err) { next(err); }
});

// ─────────────────────────── /hierarchy-drill-down (app-native) ──────────
//
// Same filter surface as /sales-analysis, but the response is a nested tree
// of Department → Category → SKU rows (with an outer Store level when
// storeOption=SEPARATE). The UI renders this with Ant Design's tree table —
// departments are collapsed by default, each click drills one level deeper.

const hierarchyDrillDownSchema = z.object({
  storeOption: z.enum(['SEPARATE', 'COMBINE']).default('COMBINE'),
  startDate: dateField,
  endDate: dateField,
  ...sharedCriteriaShape,
  priorYear: queryBoolean.default(false),
  includeAttributes: queryBoolean.default(false),
});

router.get('/hierarchy-drill-down', validateQuery(hierarchyDrillDownSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof hierarchyDrillDownSchema>;
    if (q.startDate > q.endDate) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'startDate must be <= endDate' } });
      return;
    }
    const scopedStores = await scopedStoreNumbersForRequest(req, res, q);
    if (scopedStores === null) return;
    const report = await getSalesHierarchy({
      storeOption: q.storeOption,
      criteria: buildSalesCriteria(q, scopedStores ?? undefined),
      startDate: q.startDate,
      endDate: q.endDate,
      priorYear: q.priorYear,
      includeAttributes: q.includeAttributes,
    });
    res.json(report);
  } catch (err) { next(err); }
});

// ─────────────────────────── /stock-status (RICS p. 96) ───────────────────

const stockStatusSchema = z.object({
  sortBy: z.enum(['CATEGORY', 'VENDOR']).default('CATEGORY'),
  storeOption: z.enum(['SEPARATE', 'COMBINE']).default('SEPARATE'),
  itemFilter: z.enum([
    'ALL', 'ONLY_SHORT', 'ONLY_CRITICAL', 'ONLY_ON_ORDER', 'ONLY_NEGATIVE_OH', 'ONLY_WITH_MODELS',
  ]).default('ALL'),
  vendors: csvStringList,
  categories: csvIntList,
  seasons: csvStringList,
  skus: csvStringList,
  format: z.enum(['json', 'csv']).default('json'),
});

router.get('/stock-status', validateQuery(stockStatusSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof stockStatusSchema>;
    const report = await getStockStatus({
      sortBy: q.sortBy,
      storeOption: q.storeOption,
      itemFilter: q.itemFilter,
      criteria: {
        vendors: q.vendors,
        categories: q.categories,
        seasons: q.seasons,
        skus: q.skus,
      },
    });
    const filenameCriteria = [
      { value: q.sortBy, includeIfDefault: true },
      { value: q.storeOption, includeIfDefault: true },
      { value: q.itemFilter, includeIfDefault: true },
      { key: 'v', value: q.vendors },
      { key: 'cat', value: q.categories },
      { key: 'sea', value: q.seasons },
      { key: 'sku', value: q.skus },
    ];
    if (q.format === 'csv') {
      const header = ['SKU', 'Description', 'Vendor', 'Category', 'Store', 'On Hand', 'On Order', 'Model', 'Short', 'Critical', 'Retail Value', 'Cost Value'];
      const rows = report.rows.map((r) => [
        r.sku, r.description ?? '', r.vendorCode ?? '', r.category ?? '', r.storeNumber,
        r.onHand, r.onOrder, r.model, r.short, r.critical,
        r.retailValue.toFixed(2), r.costValue.toFixed(2),
      ]);
      sendCsv(res, header, rows, salesExportFilename('SS', 'csv', filenameCriteria));
      return;
    }
    res.json(report);
  } catch (err) { next(err); }
});

// ─────────────────────────── error handler ────────────────────────────────

router.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SalesSourceNotImplementedError) {
    res.status(501).json({ error: { code: 'SALES_SOURCE_NOT_IMPLEMENTED', message: err.message } });
    return;
  }
  if (err instanceof ReportTypeNotImplementedError) {
    res.status(501).json({
      error: {
        code: 'REPORT_TYPE_NOT_IMPLEMENTED',
        message: err.message,
        reportType: err.reportType,
      },
    });
    return;
  }
  next(err);
});

export default router;
