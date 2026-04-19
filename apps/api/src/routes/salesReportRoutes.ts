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
  getStockStatus,
  listSalesDimensions,
  SalesSourceNotImplementedError,
  ReportTypeNotImplementedError,
} from '../services/salesReporting/salesReportFacade';
import { validateQuery } from '../middleware/validation';
import { sendXlsx, XLSX_NUMFMT } from '../utils/xlsxExport';

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
  store: z.coerce.number().int().positive(),
  startDate: dateField,
  endDate: dateField,
  comparisonOffsetDays: z.coerce.number().int().positive().max(366 * 2).default(364),
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
});

/**
 * @openapi
 * /api/v1/reports/sales/by-day:
 *   get:
 *     tags: [Sales Reports]
 *     summary: Sales by Day (RICS Ch. 6 p. 52) — net sales by day for a single store with prior-year weekday comparison.
 *     parameters:
 *       - { in: query, name: store, required: true, schema: { type: integer } }
 *       - { in: query, name: startDate, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: endDate, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: comparisonOffsetDays, schema: { type: integer, default: 364 } }
 *       - { in: query, name: format, schema: { type: string, enum: [json, csv] } }
 */
router.get('/by-day', validateQuery(byDaySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req as any).validatedQuery as z.infer<typeof byDaySchema>;
    if (q.startDate > q.endDate) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'startDate must be <= endDate' } });
      return;
    }
    const report = await getSalesByDay({
      storeNumber: q.store,
      startDate: q.startDate,
      endDate: q.endDate,
      comparisonOffsetDays: q.comparisonOffsetDays,
    });
    if (q.format === 'xlsx') {
      const xlsxRows = [
        ...report.rows.map((r) => ({
          store: report.storeLabel,
          date: r.date,
          day: r.dayName,
          netSales: r.netSales,
          comparedToDate: r.comparedToDate,
          comparedNetSales: r.comparedNetSales,
          dollarChange: r.dollarChange,
          pctChange: r.pctChange,
        })),
        {
          store: 'Weekly Totals',
          date: '',
          day: '',
          netSales: report.weeklyTotals.netSales,
          comparedToDate: '',
          comparedNetSales: report.weeklyTotals.comparedNetSales,
          dollarChange: report.weeklyTotals.dollarChange,
          pctChange: report.weeklyTotals.pctChange,
        },
      ];
      await sendXlsx(res, {
        filename: `sales-by-day-store-${q.store}-${q.startDate}-to-${q.endDate}.xlsx`,
        sheets: [
          {
            name: 'Sales by Day',
            columns: [
              { header: 'Store', key: 'store', width: 22 },
              { header: 'Date', key: 'date', width: 12 },
              { header: 'Day', key: 'day', width: 12 },
              { header: 'Net Sales', key: 'netSales', width: 14, numFmt: XLSX_NUMFMT.money },
              { header: 'Compared To Date', key: 'comparedToDate', width: 16 },
              { header: 'Compared Net Sales', key: 'comparedNetSales', width: 18, numFmt: XLSX_NUMFMT.money },
              { header: '$ Change', key: 'dollarChange', width: 12, numFmt: XLSX_NUMFMT.money },
              { header: '% Change', key: 'pctChange', width: 10, numFmt: XLSX_NUMFMT.percent1 },
            ],
            rows: xlsxRows,
          },
        ],
      });
      return;
    }
    if (q.format === 'csv') {
      const header = ['Store', 'Date', 'Day', 'Net Sales', 'Compared To Date', 'Compared Net Sales', '$ Change', '% Change'];
      const rows = report.rows.map((r) => [
        report.storeLabel,
        r.date,
        r.dayName,
        r.netSales.toFixed(2),
        r.comparedToDate,
        r.comparedNetSales.toFixed(2),
        r.dollarChange.toFixed(2),
        r.pctChange == null ? '' : r.pctChange.toFixed(1),
      ]);
      rows.push([
        'Weekly Totals', '', '',
        report.weeklyTotals.netSales.toFixed(2), '',
        report.weeklyTotals.comparedNetSales.toFixed(2),
        report.weeklyTotals.dollarChange.toFixed(2),
        report.weeklyTotals.pctChange == null ? '' : report.weeklyTotals.pctChange.toFixed(1),
      ]);
      sendCsv(res, header, rows, `sales-by-day-store-${q.store}-${q.startDate}-to-${q.endDate}.csv`);
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
  wtd: z.coerce.boolean().default(false),
  mtd: z.coerce.boolean().default(false),
  std: z.coerce.boolean().default(false),
  ytd: z.coerce.boolean().default(false),
  priorYear: z.coerce.boolean().default(false),
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
      },
      printing: { wtd: q.wtd, mtd: q.mtd, std: q.std, ytd: q.ytd, priorYear: q.priorYear },
      startDate: q.startDate,
      endDate: q.endDate,
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
