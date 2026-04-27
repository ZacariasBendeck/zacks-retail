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
import { sendXlsx, XLSX_NUMFMT } from '../utils/xlsxExport';
import type { PivotDimension } from '../services/salesReporting/types';

const router: IRouter = Router();

// ─────────────────────────── helpers ──────────────────────────────────────

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(dateRegex, 'Must be YYYY-MM-DD');
const csvIntList = z
  .string()
  .optional()
  .transform((v): number[] | undefined => {
    if (!v) return undefined;
    const nums = v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    return nums.length ? nums : undefined;
  });
const csvStringList = z
  .string()
  .optional()
  .transform((v): string[] | undefined => {
    if (!v) return undefined;
    const out = v.split(',').map((s) => s.trim()).filter(Boolean);
    return out.length ? out : undefined;
  });

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
  stores: csvIntList,
  startDate: dateField,
  endDate: dateField,
  comparisonOffsetDays: z.coerce.number().int().positive().max(366 * 2).default(364),
  combineStores: z.coerce.boolean().default(false),
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
    const stores = q.stores ?? [];
    const report = await getSalesByDay({
      storeNumbers: stores,
      startDate: q.startDate,
      endDate: q.endDate,
      comparisonOffsetDays: q.comparisonOffsetDays,
      combineStores: q.combineStores,
    });

    // Flat row list for CSV/XLSX. Combined mode emits a single block;
    // separate mode emits one block per store, each followed by a totals row.
    const exportBlocks = report.combineStores && report.combined
      ? [{ label: report.combined.storeLabel, rows: report.combined.rows, totals: report.combined.totals }]
      : report.storeBreakdowns.map((b) => ({ label: b.storeLabel, rows: b.rows, totals: b.totals }));

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
      const fileStem = stores.length ? stores.join('_') : 'all-stores';
      await sendXlsx(res, {
        filename: `sales-by-day-${fileStem}-${q.startDate}-to-${q.endDate}.xlsx`,
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
      const fileStem = stores.length ? stores.join('_') : 'all-stores';
      sendCsv(res, header, rows, `sales-by-day-${fileStem}-${q.startDate}-to-${q.endDate}.csv`);
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
  stores: csvIntList,
  pctOfTotal: z.coerce.boolean().default(false),
  format: z.enum(['json', 'csv']).default('json'),
});

router.get('/by-time', validateQuery(byTimeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof byTimeSchema>;
    const report = await getSalesByTime({
      startDate: q.startDate,
      endDate: q.endDate,
      compareStartDate: q.compareStartDate,
      compareEndDate: q.compareEndDate,
      storeNumbers: q.stores,
      printPctOfTotal: q.pctOfTotal,
    });
    if (q.format === 'csv') {
      const header = ['Hour', 'Tickets', 'Qty', 'Dollars', '% of Total'];
      const rows = report.rangeA.map((b) => [
        b.hour, b.tickets, b.qty, b.dollars.toFixed(2), b.pctOfTotal == null ? '' : b.pctOfTotal.toFixed(1),
      ]);
      sendCsv(res, header, rows, `sales-by-time-${q.startDate}-to-${q.endDate}.csv`);
      return;
    }
    res.json(report);
  } catch (err) { next(err); }
});

// ─────────────────────────── /by-sku (RICS p. 43) ─────────────────────────

const bySkuSchema = z.object({
  startDate: dateField,
  endDate: dateField,
  stores: csvIntList,
  sortBy: z.enum(['SKU', 'CATEGORY_SKU', 'VENDOR_SKU']).default('SKU'),
  includeReturns: z.coerce.boolean().default(true),
  skus: csvStringList,
  format: z.enum(['json', 'csv']).default('json'),
});

router.get('/by-sku', validateQuery(bySkuSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof bySkuSchema>;
    const report = await getSalesBySku({
      startDate: q.startDate,
      endDate: q.endDate,
      storeNumbers: q.stores,
      sortBy: q.sortBy,
      includeReturns: q.includeReturns,
      skus: q.skus,
    });
    if (q.format === 'csv') {
      const header = ['SKU', 'Category', 'Vendor', 'Qty', 'Dollars', 'Returns Qty', 'Returns Dollars'];
      const rows = report.rows.map((r) => [
        r.sku, r.category ?? '', r.vendor ?? '', r.qty, r.dollars.toFixed(2), r.returnsQty, r.returnsDollars.toFixed(2),
      ]);
      sendCsv(res, header, rows, `sales-by-sku-${q.startDate}-to-${q.endDate}.csv`);
      return;
    }
    res.json(report);
  } catch (err) { next(err); }
});

// ─────────────────────────── /salesperson-summary (RICS p. 42) ────────────

const salespersonSchema = z.object({
  startDate: dateField,
  endDate: dateField,
  stores: csvIntList,
  subtotalBy: z.enum(['DEPARTMENT', 'VENDOR']).optional(),
  combineStores: z.coerce.boolean().default(false),
  cashierSummary: z.coerce.boolean().default(false),
  format: z.enum(['json', 'csv']).default('json'),
});

router.get('/salesperson-summary', validateQuery(salespersonSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof salespersonSchema>;
    const report = await getSalespersonSummary({
      startDate: q.startDate,
      endDate: q.endDate,
      storeNumbers: q.stores,
      subtotalBy: q.subtotalBy,
      combineStores: q.combineStores,
      cashierSummary: q.cashierSummary,
    });
    if (q.format === 'csv') {
      const header = ['Salesperson', 'Name', 'Store', 'Qty', 'Dollars', 'Perks'];
      const rows = report.salespeople.map((s) => [
        s.salespersonCode, s.salespersonName ?? '', s.storeNumber, s.qty, s.dollars.toFixed(2), s.perks.toFixed(2),
      ]);
      sendCsv(res, header, rows, `salesperson-summary-${q.startDate}-to-${q.endDate}.csv`);
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
  stores: csvIntList,
  combineStores: z.coerce.boolean().default(false),
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
    const report = await getBestSellers({
      dimension: q.dimension,
      metric: q.metric,
      period: q.lastNMonths ? { lastNMonths: q.lastNMonths } : (q.period as 'WTD' | 'MTD' | 'STD' | 'YTD'),
      storeNumbers: q.stores,
      combineStores: q.combineStores,
      topN: q.topN,
    });
    if (q.format === 'csv') {
      const header = ['Rank', 'Key', 'Label', 'Qty', 'Net Sales', 'Profit', 'Profit %'];
      const rows = report.rows.map((r) => [
        r.rank, r.key, r.label ?? '', r.qty, r.netSales.toFixed(2), r.profit.toFixed(2),
        r.profitPct == null ? '' : r.profitPct.toFixed(1),
      ]);
      sendCsv(res, header, rows, `best-sellers-${q.dimension}-${q.metric}.csv`);
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
  categories: csvIntList,
  vendors: csvStringList,
  seasons: csvStringList,
  skus: csvStringList,
  styleColor: z.string().optional(),
  groups: csvStringList,
  keywords: csvStringList,
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
  wtd: z.coerce.boolean().default(false),
  mtd: z.coerce.boolean().default(false),
  std: z.coerce.boolean().default(false),
  ytd: z.coerce.boolean().default(false),
  priorYear: z.coerce.boolean().default(false),
  // Opt-in per-SKU enrichment. Defaults to false so the preview endpoint
  // stays fast — only the full-screen viewer asks for these columns.
  includeAttributes: z.coerce.boolean().default(false),
  format: z.enum(['json', 'csv']).default('json'),
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
    const report = await getSalesAnalysis({
      dimension: q.dimension,
      reportType: q.reportType,
      storeOption: q.storeOption,
      criteria: {
        stores: q.stores,
        categories: q.categories,
        vendors: q.vendors,
        seasons: q.seasons,
        skus: q.skus,
        styleColor: q.styleColor || undefined,
        groups: q.groups,
        keywords: q.keywords,
        storesRaw: q.storesRaw?.trim() || undefined,
        categoriesRaw: q.categoriesRaw?.trim() || undefined,
        vendorsRaw: q.vendorsRaw?.trim() || undefined,
        seasonsRaw: q.seasonsRaw?.trim() || undefined,
        skusRaw: q.skusRaw?.trim() || undefined,
        groupsRaw: q.groupsRaw?.trim() || undefined,
        keywordsRaw: q.keywordsRaw?.trim() || undefined,
        styleColorRaw: q.styleColorRaw?.trim() || undefined,
      },
      printing: { wtd: q.wtd, mtd: q.mtd, std: q.std, ytd: q.ytd, priorYear: q.priorYear },
      startDate: q.startDate,
      endDate: q.endDate,
      includeAttributes: q.includeAttributes,
    });
    if (q.format === 'csv') {
      const header = ['Dimension', 'Label', 'Store', 'Qty', 'Net Sales', 'COGS', 'Gross Profit', 'GP %', 'Prior Yr Net', 'PY % Change'];
      const rows = report.rows.map((r) => [
        r.dimensionKey, r.dimensionLabel ?? '', r.storeNumber ?? '',
        r.qty, r.netSales.toFixed(2), r.cogs.toFixed(2), r.grossProfit.toFixed(2),
        r.gpPct == null ? '' : r.gpPct.toFixed(1),
        r.priorYearNetSales == null ? '' : r.priorYearNetSales.toFixed(2),
        r.pyPctChange == null ? '' : r.pyPctChange.toFixed(1),
      ]);
      sendCsv(res, header, rows, `sales-analysis-${q.dimension}.csv`);
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
  stores: csvIntList,
  variant: z.enum([
    'department',
    'department-separate-store',
    'buyer',
    'buyer-vendor',
    'buyer-vendor-separate-store',
    'custom',
  ]).default('department'),
  // Three hierarchy dimensions, required when variant='custom'. Zod leaves
  // them optional so the fixed variants don't have to pass them.
  level1: z.enum(['buyer', 'sector', 'department', 'season', 'group', 'vendor', 'store']).optional(),
  level2: z.enum(['buyer', 'sector', 'department', 'season', 'group', 'vendor', 'store']).optional(),
  level3: z.enum(['buyer', 'sector', 'department', 'season', 'group', 'vendor', 'store', 'category']).optional(),
  // Criteria filters (variant='custom'). CSV lists. Each narrows the SKU
  // universe before aggregation; passing none = include every SKU.
  sectors: csvIntList,
  departments: csvIntList,
  seasons: csvStringList,
  buyers: csvStringList,
  format: z.enum(['json', 'csv']).default('json'),
});

router.get('/sales-pivot', validateQuery(salesPivotSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof salesPivotSchema>;
    if (q.startDate > q.endDate) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'startDate must be <= endDate' } });
      return;
    }
    let levels: [PivotDimension, PivotDimension, PivotDimension] | undefined;
    if (q.variant === 'custom') {
      if (!q.level1 || !q.level2 || !q.level3) {
        res.status(400).json({ error: {
          code: 'VALIDATION_ERROR',
          message: 'level1, level2, and level3 are required when variant=custom',
        } });
        return;
      }
      const set = new Set<PivotDimension>([q.level1, q.level2, q.level3]);
      if (set.size !== 3) {
        res.status(400).json({ error: {
          code: 'VALIDATION_ERROR',
          message: 'level1, level2, level3 must be three distinct dimensions',
        } });
        return;
      }
      levels = [q.level1, q.level2, q.level3];
    }
    const report = await getSalesPivot({
      startDate: q.startDate,
      endDate: q.endDate,
      storeNumbers: q.stores,
      variant: q.variant,
      levels,
      sectors: q.sectors,
      departments: q.departments,
      seasons: q.seasons,
      buyers: q.buyers,
    });
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
        sendCsv(res, header, rows, `sales-pivot-buyer-${q.startDate}-to-${q.endDate}.csv`);
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
          }
        };
        const header = [
          ...dimHeader(levels[0]), ...dimHeader(levels[1]), ...dimHeader(levels[2]),
          'SKU', 'Description',
          ...measureHeader,
        ];
        const rows = report.rows.map((r) => [
          ...dimCols(r, levels[0]), ...dimCols(r, levels[1]), ...dimCols(r, levels[2]),
          r.sku, r.skuDescription ?? '',
          ...measureCells(r),
        ]);
        sendCsv(
          res,
          header,
          rows,
          `sales-pivot-${levels.join('-')}-${q.startDate}-to-${q.endDate}.csv`,
        );
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
        const base = separate ? 'sales-pivot-store-buyer-vendor' : 'sales-pivot-buyer-vendor';
        sendCsv(res, header, rows, `${base}-${q.startDate}-to-${q.endDate}.csv`);
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
      const base = separate ? 'sales-pivot-store-department' : 'sales-pivot-department';
      sendCsv(res, header, rows, `${base}-${q.startDate}-to-${q.endDate}.csv`);
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
  stores: csvIntList,
  categories: csvIntList,
  vendors: csvStringList,
  seasons: csvStringList,
  skus: csvStringList,
  styleColor: z.string().optional(),
  groups: csvStringList,
  keywords: csvStringList,
  storesRaw: z.string().optional(),
  categoriesRaw: z.string().optional(),
  vendorsRaw: z.string().optional(),
  seasonsRaw: z.string().optional(),
  skusRaw: z.string().optional(),
  groupsRaw: z.string().optional(),
  keywordsRaw: z.string().optional(),
  styleColorRaw: z.string().optional(),
  priorYear: z.coerce.boolean().default(false),
  includeAttributes: z.coerce.boolean().default(false),
});

router.get('/hierarchy-drill-down', validateQuery(hierarchyDrillDownSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof hierarchyDrillDownSchema>;
    if (q.startDate > q.endDate) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'startDate must be <= endDate' } });
      return;
    }
    const report = await getSalesHierarchy({
      storeOption: q.storeOption,
      criteria: {
        stores: q.stores,
        categories: q.categories,
        vendors: q.vendors,
        seasons: q.seasons,
        skus: q.skus,
        styleColor: q.styleColor || undefined,
        groups: q.groups,
        keywords: q.keywords,
        storesRaw: q.storesRaw?.trim() || undefined,
        categoriesRaw: q.categoriesRaw?.trim() || undefined,
        vendorsRaw: q.vendorsRaw?.trim() || undefined,
        seasonsRaw: q.seasonsRaw?.trim() || undefined,
        skusRaw: q.skusRaw?.trim() || undefined,
        groupsRaw: q.groupsRaw?.trim() || undefined,
        keywordsRaw: q.keywordsRaw?.trim() || undefined,
        styleColorRaw: q.styleColorRaw?.trim() || undefined,
      },
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
    if (q.format === 'csv') {
      const header = ['SKU', 'Description', 'Vendor', 'Category', 'Store', 'On Hand', 'On Order', 'Model', 'Short', 'Critical', 'Retail Value', 'Cost Value'];
      const rows = report.rows.map((r) => [
        r.sku, r.description ?? '', r.vendorCode ?? '', r.category ?? '', r.storeNumber,
        r.onHand, r.onOrder, r.model, r.short, r.critical,
        r.retailValue.toFixed(2), r.costValue.toFixed(2),
      ]);
      sendCsv(res, header, rows, `stock-status.csv`);
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
