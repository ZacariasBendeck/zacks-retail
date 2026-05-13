import { Router, Request, Response, IRouter, NextFunction } from 'express';
import * as reportService from '../services/reportService';
import * as purchaseOrderService from '../services/purchaseOrderService';
import * as inventoryAgingPg from '../services/reports/inventoryAgingPg';
import * as salesReportFacade from '../services/salesReporting/salesReportFacade';
import {
  resolveSharedProductCriteriaSkuWhitelist,
  resolveSharedStoreNumbers,
} from '../services/salesReporting/sharedReportCriteria';
import { getSeasonalityIndexReport } from '../services/seasonalityIndexService';
import { validateQuery } from '../middleware/validation';
import { getRequestStoreScopeConstraintIfAuthenticated } from '../middleware/storeScopeMiddleware';
import { prisma } from '../db/prisma';
import { getDb } from '../db/database';
import { ALLOWED_DEPARTMENTS, CATEGORY_CODE_MIN, CATEGORY_CODE_MAX } from '../constants/domain';
import { sendXlsx, XLSX_NUMFMT } from '../utils/xlsxExport';
import { parsePositiveIntegerSelection } from '../utils/numberSelection';
import { buildReportFilename, type ReportFilenameCriterion } from '../utils/reportFilename';
import { z } from 'zod';
import type { SalesAnalysisCriteria } from '../services/salesReporting/types';

const router: IRouter = Router();

const purchaseOrderReportQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED']).optional(),
  vendorId: z.string().trim().min(1).max(4).optional(),
  balanceMode: z.enum(['ordered', 'open']).default('open'),
  dateBy: z.enum(['orderDate', 'shipDate', 'cancelDate', 'paymentDate']).default('orderDate'),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const openPoByMonthQuerySchema = z.object({
  sortBy: z.enum(['vendor', 'category']).default('vendor'),
  dateBy: z.enum(['shipDate', 'cancelDate', 'paymentDate']).default('shipDate'),
  status: z.enum(['all', 'atOnce', 'future']).default('all'),
});

router.get(
  '/purchase-orders',
  validateQuery(purchaseOrderReportQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const params = (req as any).validatedQuery;
    const rows = await purchaseOrderService.listPurchaseOrderReport(params);
    res.json({ rows });
  },
);

router.get(
  '/open-po-by-month',
  validateQuery(openPoByMonthQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const params = (req as any).validatedQuery;
    const rows = await purchaseOrderService.listOpenPoByMonth(params);
    res.json({ rows });
  },
);

router.get('/po-cash-projection', async (_req: Request, res: Response): Promise<void> => {
  const rows = await purchaseOrderService.listPoCashProjection();
  res.json({ rows });
});

const reportPaginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
};

const categoryCodeQueryField = z.coerce.number().int().min(CATEGORY_CODE_MIN).max(CATEGORY_CODE_MAX).optional();

type CategoryLookup = {
  idToCode: Map<number, number>;
  codeToId: Map<number, number>;
};

function getCategoryLookup(): CategoryLookup {
  const db = getDb();
  const rows = db.prepare('SELECT id, rics_code FROM ref_categories').all() as { id: number; rics_code: number }[];
  const idToCode = new Map<number, number>();
  const codeToId = new Map<number, number>();

  for (const row of rows) {
    idToCode.set(row.id, row.rics_code);
    codeToId.set(row.rics_code, row.id);
  }

  return { idToCode, codeToId };
}

function toCategoryCode(categoryId: number | null, idToCode: ReadonlyMap<number, number>): number | null {
  if (categoryId == null) return null;
  return idToCode.get(categoryId) ?? categoryId;
}

function toCategoryFilterId(categoryCode: number | undefined, codeToId: ReadonlyMap<number, number>): number | undefined {
  if (categoryCode == null) return undefined;
  return codeToId.get(categoryCode) ?? -1;
}

function mapCategoryField<T extends { categoryId: number | null }>(
  rows: T[],
  idToCode: ReadonlyMap<number, number>,
): Array<Omit<T, 'categoryId'> & { category: number | null }> {
  return rows.map((row) => {
    const { categoryId, ...rest } = row;
    return {
      ...rest,
      category: toCategoryCode(categoryId, idToCode),
    };
  });
}

function reportExportFilename(
  baseStem: string,
  extension: 'csv' | 'xlsx',
  criteria: ReportFilenameCriterion[],
): string {
  return buildReportFilename(baseStem, extension, criteria);
}

function dateRangeFilenameParts(startDate?: string, endDate?: string): ReportFilenameCriterion[] {
  return [{ value: startDate && endDate ? `${startDate}_${endDate}` : undefined }];
}

function effectiveStoresFilenamePart(stores: number[] | undefined): ReportFilenameCriterion {
  return {
    value: stores && stores.length > 0 ? `S${stores.join('_')}` : 'all',
    includeIfDefault: true,
  };
}

const onHandQuerySchema = z.object({
  department: z.enum(ALLOWED_DEPARTMENTS).optional(),
  category: categoryCodeQueryField,
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
  ...reportPaginationFields,
});

/**
 * @openapi
 * /api/v1/reports/on-hand:
 *   get:
 *     summary: On-hand inventory report grouped by department
 *     tags: [Reports]
 *     parameters:
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *         description: Drill-down into a specific department to see by-category breakdown
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 556, maximum: 599 }
 *         description: Filter to a specific category (requires department)
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json, csv], default: json }
 *         description: Response format (json or csv)
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *         description: Page number (applies to detail-level drill-down views)
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *         description: Items per page (applies to detail-level drill-down views)
 *       - name: sort
 *         in: query
 *         schema: { type: string }
 *         description: Field to sort by (optional, applies to detail-level drill-down views)
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc] }
 *         description: Sort direction (optional, applies to detail-level drill-down views)
 *     responses:
 *       200:
 *         description: On-hand inventory report
 */
router.get('/on-hand', validateQuery(onHandQuerySchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
  const query = (req as any).validatedQuery as {
    department?: string;
    category?: number;
    format: 'json' | 'csv' | 'xlsx';
    page: number;
    pageSize: number;
    sort?: string;
    order?: 'asc' | 'desc';
  };
  const categoryLookup = getCategoryLookup();
  const categoryIdFilter = toCategoryFilterId(query.category, categoryLookup.codeToId);

  if (query.format === 'csv' || query.format === 'xlsx') {
    const detailsResult = reportService.getOnHandDetails({
      department: query.department,
      category: categoryIdFilter,
    });
    const details = mapCategoryField(detailsResult.data, categoryLookup.idToCode);

    if (query.format === 'xlsx') {
      await sendXlsx(res, {
        filename: 'on-hand-report.xlsx',
        sheets: [
          {
            name: 'On-Hand',
            columns: [
              { header: 'SKU Code', key: 'skuCode', width: 22 },
              { header: 'Brand', key: 'brand', width: 16 },
              { header: 'Style', key: 'style', width: 14 },
              { header: 'Color', key: 'color', width: 14 },
              { header: 'Department', key: 'department', width: 14 },
              { header: 'Category ID', key: 'category', width: 12, numFmt: XLSX_NUMFMT.integer },
              { header: 'Price', key: 'price', width: 12, numFmt: XLSX_NUMFMT.money },
              { header: 'Quantity On Hand', key: 'quantityOnHand', width: 16, numFmt: XLSX_NUMFMT.integer },
              { header: 'Cost Value', key: 'costValue', width: 14, numFmt: XLSX_NUMFMT.money },
            ],
            rows: details.map((d) => ({
              skuCode: d.skuCode,
              brand: d.brand ?? '',
              style: d.style,
              color: d.color ?? '',
              department: d.department,
              category: d.category ?? null,
              price: d.price,
              quantityOnHand: d.quantityOnHand,
              costValue: d.costValue,
            })),
          },
        ],
      });
      return;
    }

    const header = 'SKU Code,Brand,Style,Color,Department,Category ID,Price,Quantity On Hand,Cost Value';
    const rows = details.map((d) =>
      [
        escapeCsv(d.skuCode),
        escapeCsv(d.brand ?? ''),
        escapeCsv(d.style),
        escapeCsv(d.color ?? ''),
        d.department,
        d.category ?? '',
        d.price.toFixed(2),
        d.quantityOnHand,
        d.costValue.toFixed(2),
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="on-hand-report.csv"');
    res.send(csv);
    return;
  }

  // JSON response
  const paginationParams = { page: query.page, pageSize: query.pageSize, sort: query.sort, order: query.order };

  if (query.department) {
    // Drill-down: show categories within a department
    const categories = mapCategoryField(reportService.getOnHandByCategory(query.department), categoryLookup.idToCode);
    const detailsResult = reportService.getOnHandDetails({
      department: query.department,
      category: categoryIdFilter,
    }, paginationParams);
    const details = mapCategoryField(detailsResult.data, categoryLookup.idToCode);

    res.json({
      department: query.department,
      categories,
      details,
      pagination: detailsResult.pagination,
    });
    return;
  }

  // Top-level: show department summary
  const departments = reportService.getOnHandByDepartment();
  res.json({ departments });
  } catch (err) { next(err); }
});

// ── Sales Performance Report ──────────────────────────────────────

const salesPerformanceQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  department: z.enum(ALLOWED_DEPARTMENTS).optional(),
  category: categoryCodeQueryField,
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
  ...reportPaginationFields,
});

const ricsSalesByDayStoreQuerySchema = z.object({
  store: z.coerce.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  comparisonOffsetDays: z.coerce.number().int().positive().max(366 * 2).default(364),
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
});

/**
 * @openapi
 * /api/v1/reports/sales-performance:
 *   get:
 *     summary: Sales performance report by department and time period
 *     tags: [Reports]
 *     parameters:
 *       - name: startDate
 *         in: query
 *         required: true
 *         schema: { type: string, format: date }
 *         description: Start date (YYYY-MM-DD, inclusive)
 *       - name: endDate
 *         in: query
 *         required: true
 *         schema: { type: string, format: date }
 *         description: End date (YYYY-MM-DD, inclusive)
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *         description: Drill-down into a specific department
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 556, maximum: 599 }
 *         description: Filter to a specific category (requires department)
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json, csv], default: json }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *         description: Page number (applies to detail-level drill-down views)
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *         description: Items per page (applies to detail-level drill-down views)
 *       - name: sort
 *         in: query
 *         schema: { type: string }
 *         description: Field to sort by (optional, applies to detail-level drill-down views)
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc] }
 *         description: Sort direction (optional, applies to detail-level drill-down views)
 *     responses:
 *       200:
 *         description: Sales performance report
 */
router.get('/sales-performance', validateQuery(salesPerformanceQuerySchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
  const query = (req as any).validatedQuery as {
    startDate: string;
    endDate: string;
    department?: string;
    category?: number;
    format: 'json' | 'csv' | 'xlsx';
    page: number;
    pageSize: number;
    sort?: string;
    order?: 'asc' | 'desc';
  };

  // endDate is inclusive, so add one day for the < comparison
  const endDateExclusive = new Date(query.endDate);
  endDateExclusive.setDate(endDateExclusive.getDate() + 1);
  const endStr = endDateExclusive.toISOString().split('T')[0];
  const categoryLookup = getCategoryLookup();
  const categoryIdFilter = toCategoryFilterId(query.category, categoryLookup.codeToId);
  const filenameCriteria = [
    ...dateRangeFilenameParts(query.startDate, query.endDate),
    { key: 'dep', value: query.department },
    { key: 'cat', value: query.category },
  ];

  if (query.format === 'csv' || query.format === 'xlsx') {
    const detailsResult = reportService.getSalesPerformanceDetails(query.startDate, endStr, {
      department: query.department,
      category: categoryIdFilter,
    });
    const details = mapCategoryField(detailsResult.data, categoryLookup.idToCode);

    if (query.format === 'xlsx') {
      // Even when empty we still return a well-formed XLSX with just the
      // header row, so clients don't have to special-case an empty buffer.
      await sendXlsx(res, {
        filename: reportExportFilename('SPERF', 'xlsx', filenameCriteria),
        sheets: [
          {
            name: 'Sales Performance',
            columns: [
              { header: 'SKU Code', key: 'skuCode', width: 22 },
              { header: 'Brand', key: 'brand', width: 16 },
              { header: 'Style', key: 'style', width: 14 },
              { header: 'Color', key: 'color', width: 14 },
              { header: 'Department', key: 'department', width: 14 },
              { header: 'Category ID', key: 'category', width: 12, numFmt: XLSX_NUMFMT.integer },
              { header: 'Units Sold', key: 'totalUnitsSold', width: 12, numFmt: XLSX_NUMFMT.integer },
              { header: 'Revenue', key: 'totalRevenue', width: 14, numFmt: XLSX_NUMFMT.money },
              { header: 'Avg Selling Price', key: 'avgSellingPrice', width: 16, numFmt: XLSX_NUMFMT.money },
            ],
            rows: details.map((d) => ({
              skuCode: d.skuCode,
              brand: d.brand ?? '',
              style: d.style,
              color: d.color ?? '',
              department: d.department,
              category: d.category ?? null,
              totalUnitsSold: d.totalUnitsSold,
              totalRevenue: d.totalRevenue,
              avgSellingPrice: d.avgSellingPrice,
            })),
          },
        ],
      });
      return;
    }

    if (details.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${reportExportFilename('SPERF', 'csv', filenameCriteria)}"`,
      );
      res.send('No sales data found for the selected period.');
      return;
    }

    const header = 'SKU Code,Brand,Style,Color,Department,Category ID,Units Sold,Revenue,Avg Selling Price';
    const rows = details.map((d) =>
      [
        escapeCsv(d.skuCode),
        escapeCsv(d.brand ?? ''),
        escapeCsv(d.style),
        escapeCsv(d.color ?? ''),
        d.department,
        d.category ?? '',
        d.totalUnitsSold,
        d.totalRevenue.toFixed(2),
        d.avgSellingPrice.toFixed(2),
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${reportExportFilename('SPERF', 'csv', filenameCriteria)}"`,
    );
    res.send(csv);
    return;
  }

  // JSON response
  const salesPaginationParams = { page: query.page, pageSize: query.pageSize, sort: query.sort, order: query.order };

  if (query.department) {
    const categories = mapCategoryField(
      reportService.getSalesPerformanceByCategory(query.startDate, endStr, query.department),
      categoryLookup.idToCode,
    );
    const detailsResult = reportService.getSalesPerformanceDetails(query.startDate, endStr, {
      department: query.department,
      category: categoryIdFilter,
    }, salesPaginationParams);
    const details = mapCategoryField(detailsResult.data, categoryLookup.idToCode);

    res.json({
      startDate: query.startDate,
      endDate: query.endDate,
      department: query.department,
      categories,
      details,
      pagination: detailsResult.pagination,
    });
    return;
  }

  // Top-level: by department
  const departments = reportService.getSalesPerformanceByDepartment(query.startDate, endStr);
  res.json({
    startDate: query.startDate,
    endDate: query.endDate,
    departments,
  });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/reports/rics-sales-by-day-store:
 *   get:
 *     summary: RICS net sales by day for a store with prior-year weekday comparison
 *     tags: [Reports]
 *     parameters:
 *       - name: store
 *         in: query
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *         description: Store number from RICS StoreMaster (e.g., 2 for "UNLIMITED C. 2000")
 *       - name: startDate
 *         in: query
 *         required: true
 *         schema: { type: string, format: date }
 *         description: Start date (YYYY-MM-DD, inclusive)
 *       - name: endDate
 *         in: query
 *         required: true
 *         schema: { type: string, format: date }
 *         description: End date (YYYY-MM-DD, inclusive)
 *       - name: comparisonOffsetDays
 *         in: query
 *         schema: { type: integer, default: 364, minimum: 1, maximum: 732 }
 *         description: Days offset used for comparison period (364 = same weekday prior year)
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json, csv], default: json }
 *         description: Response format (json or csv)
 *     responses:
 *       200:
 *         description: Sales by day by store report
 */
router.get('/rics-sales-by-day-store', validateQuery(ricsSalesByDayStoreQuerySchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
  const query = (req as any).validatedQuery as {
    store: number;
    startDate: string;
    endDate: string;
    comparisonOffsetDays: number;
    format: 'json' | 'csv' | 'xlsx';
  };

  if (query.startDate > query.endDate) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'startDate must be less than or equal to endDate',
      },
    });
    return;
  }

  const scopeConstraint = await getRequestStoreScopeConstraintIfAuthenticated(prisma, req, res, [query.store]);
  if (scopeConstraint === null) return;

  const fullReport = await salesReportFacade.getSalesByDay({
    storeNumbers: [query.store],
    startDate: query.startDate,
    endDate: query.endDate,
    comparisonOffsetDays: query.comparisonOffsetDays,
  });

  // Adapt the multi-store response back to the legacy single-store shape this
  // alias documented (one block, with `storeLabel`, `rows`, `weeklyTotals`).
  const block = fullReport.storeBreakdowns[0];
  const report = {
    storeNumber: block?.storeNumber ?? query.store,
    storeName: block?.storeName ?? null,
    storeLabel: block?.storeLabel ?? String(query.store),
    startDate: fullReport.startDate,
    endDate: fullReport.endDate,
    comparisonOffsetDays: fullReport.comparisonOffsetDays,
    comparisonStartDate: fullReport.comparisonStartDate,
    comparisonEndDate: fullReport.comparisonEndDate,
    rows: block?.rows ?? [],
    weeklyTotals: block?.totals ?? {
      ticketCount: 0, netSales: 0, avgTicket: 0, profit: 0, comparedTicketCount: 0, comparedNetSales: 0, comparedAvgTicket: 0, comparedProfit: 0, dollarChange: 0, profitChange: 0, pctChange: null, profitPctChange: null,
    },
    storeTotals: block?.totals ?? {
      ticketCount: 0, netSales: 0, avgTicket: 0, profit: 0, comparedTicketCount: 0, comparedNetSales: 0, comparedAvgTicket: 0, comparedProfit: 0, dollarChange: 0, profitChange: 0, pctChange: null, profitPctChange: null,
    },
  };
  const filenameCriteria = [
    { value: `S${query.store}`, includeIfDefault: true },
    ...dateRangeFilenameParts(query.startDate, query.endDate),
    { key: 'cmp', value: query.comparisonOffsetDays, defaultValue: 364 },
  ];

  if (query.format === 'xlsx') {
    // Trailing "Weekly Totals" row mirrors the CSV output — keeps parity so
    // the XLSX file looks like what CSV consumers are used to.
    const rows = [
      ...report.rows.map((r) => ({
        store: report.storeLabel,
        date: r.date,
        day: r.dayName,
        ticketCount: r.ticketCount,
        netSales: r.netSales,
        avgTicket: r.avgTicket,
        comparedToDate: r.comparedToDate,
        comparedTicketCount: r.comparedTicketCount,
        comparedNetSales: r.comparedNetSales,
        comparedAvgTicket: r.comparedAvgTicket,
        dollarChange: r.dollarChange,
        // % Change is already a display-ready percentage (e.g. 12.3 = 12.3%),
        // so we use the pre-scaled 'percent1' format rather than Excel's '%'.
        pctChange: r.pctChange,
        profitChange: r.profitChange,
        profitPctChange: r.profitPctChange,
      })),
      {
        store: 'Weekly Totals',
        date: '',
        day: '',
        ticketCount: report.weeklyTotals.ticketCount,
        netSales: report.weeklyTotals.netSales,
        avgTicket: report.weeklyTotals.avgTicket,
        comparedToDate: '',
        comparedTicketCount: report.weeklyTotals.comparedTicketCount,
        comparedNetSales: report.weeklyTotals.comparedNetSales,
        comparedAvgTicket: report.weeklyTotals.comparedAvgTicket,
        dollarChange: report.weeklyTotals.dollarChange,
        pctChange: report.weeklyTotals.pctChange,
        profitChange: report.weeklyTotals.profitChange,
        profitPctChange: report.weeklyTotals.profitPctChange,
      },
    ];
    await sendXlsx(res, {
      filename: reportExportFilename('SBD', 'xlsx', filenameCriteria),
      sheets: [
        {
          name: 'Sales by Day',
          columns: [
            { header: 'Store', key: 'store', width: 22 },
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Day', key: 'day', width: 12 },
            { header: 'Tickets', key: 'ticketCount', width: 10, numFmt: XLSX_NUMFMT.integer },
            { header: 'Net Sales', key: 'netSales', width: 14, numFmt: XLSX_NUMFMT.money },
            { header: 'Avg Ticket', key: 'avgTicket', width: 14, numFmt: XLSX_NUMFMT.money },
            { header: 'Compared To Date', key: 'comparedToDate', width: 16 },
            { header: 'Compared Tickets', key: 'comparedTicketCount', width: 17, numFmt: XLSX_NUMFMT.integer },
            { header: 'Compared Net Sales', key: 'comparedNetSales', width: 18, numFmt: XLSX_NUMFMT.money },
            { header: 'Compared Avg Ticket', key: 'comparedAvgTicket', width: 20, numFmt: XLSX_NUMFMT.money },
            { header: '$ Change', key: 'dollarChange', width: 12, numFmt: XLSX_NUMFMT.money },
            { header: 'Net Sales % Change', key: 'pctChange', width: 18, numFmt: XLSX_NUMFMT.percent1 },
            { header: 'Profit Change', key: 'profitChange', width: 14, numFmt: XLSX_NUMFMT.money },
            { header: 'Profit % Change', key: 'profitPctChange', width: 16, numFmt: XLSX_NUMFMT.percent1 },
          ],
          rows,
        },
      ],
    });
    return;
  }

  if (query.format === 'csv') {
    const header = 'Store,Date,Day,Tickets,Net Sales,Avg Ticket,Compared To Date,Compared Tickets,Compared Net Sales,Compared Avg Ticket,$ Change,Net Sales % Change,Profit Change,Profit % Change';
    const rows = report.rows.map((row) =>
      [
        escapeCsv(report.storeLabel),
        row.date,
        row.dayName,
        row.ticketCount,
        row.netSales.toFixed(2),
        row.avgTicket.toFixed(2),
        row.comparedToDate,
        row.comparedTicketCount,
        row.comparedNetSales.toFixed(2),
        row.comparedAvgTicket.toFixed(2),
        row.dollarChange.toFixed(2),
        row.pctChange == null ? '' : row.pctChange.toFixed(1),
        row.profitChange.toFixed(2),
        row.profitPctChange == null ? '' : row.profitPctChange.toFixed(1),
      ].join(',')
    );

    const totals = [
      escapeCsv('Weekly Totals'),
      '',
      '',
      report.weeklyTotals.ticketCount,
      report.weeklyTotals.netSales.toFixed(2),
      report.weeklyTotals.avgTicket.toFixed(2),
      '',
      report.weeklyTotals.comparedTicketCount,
      report.weeklyTotals.comparedNetSales.toFixed(2),
      report.weeklyTotals.comparedAvgTicket.toFixed(2),
      report.weeklyTotals.dollarChange.toFixed(2),
      report.weeklyTotals.pctChange == null ? '' : report.weeklyTotals.pctChange.toFixed(1),
      report.weeklyTotals.profitChange.toFixed(2),
      report.weeklyTotals.profitPctChange == null ? '' : report.weeklyTotals.profitPctChange.toFixed(1),
    ].join(',');

    const csv = [header, ...rows, totals].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${reportExportFilename('SBD', 'csv', filenameCriteria)}"`,
    );
    res.send(csv);
    return;
  }

  res.json(report);
  } catch (err) { next(err); }
});

// ── Inventory Turnover Report ────────────────────────────────────

const inventoryTurnoverQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  department: z.enum(ALLOWED_DEPARTMENTS).optional(),
  category: categoryCodeQueryField,
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
  ...reportPaginationFields,
});

/**
 * @openapi
 * /api/v1/reports/inventory-turnover:
 *   get:
 *     summary: Inventory turnover report — COGS / average inventory by department
 *     tags: [Reports]
 *     parameters:
 *       - name: startDate
 *         in: query
 *         schema: { type: string, format: date }
 *         description: Start date for COGS period (YYYY-MM-DD, inclusive)
 *       - name: endDate
 *         in: query
 *         schema: { type: string, format: date }
 *         description: End date for COGS period (YYYY-MM-DD, inclusive)
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *         description: Drill-down into a specific department to see by-category breakdown
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 556, maximum: 599 }
 *         description: Filter to a specific category (requires department)
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json, csv], default: json }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *         description: Page number (applies to detail-level drill-down views)
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *         description: Items per page (applies to detail-level drill-down views)
 *       - name: sort
 *         in: query
 *         schema: { type: string }
 *         description: Field to sort by (optional, applies to detail-level drill-down views)
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc] }
 *         description: Sort direction (optional, applies to detail-level drill-down views)
 *     responses:
 *       200:
 *         description: Inventory turnover report
 */
router.get('/inventory-turnover', validateQuery(inventoryTurnoverQuerySchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
  const query = (req as any).validatedQuery as {
    startDate?: string;
    endDate?: string;
    department?: string;
    category?: number;
    format: 'json' | 'csv' | 'xlsx';
    page: number;
    pageSize: number;
    sort?: string;
    order?: 'asc' | 'desc';
  };

  const filters: reportService.TurnoverFilters = {
    startDate: query.startDate,
    endDate: query.endDate,
    department: query.department,
    category: undefined,
  };
  const categoryLookup = getCategoryLookup();
  const categoryIdFilter = toCategoryFilterId(query.category, categoryLookup.codeToId);
  filters.category = categoryIdFilter;

  if (query.format === 'csv' || query.format === 'xlsx') {
    const detailsResult = reportService.getTurnoverDetails(filters);
    const details = mapCategoryField(detailsResult.data, categoryLookup.idToCode);

    if (query.format === 'xlsx') {
      await sendXlsx(res, {
        filename: 'inventory-turnover-report.xlsx',
        sheets: [
          {
            name: 'Turnover',
            columns: [
              { header: 'SKU Code', key: 'skuCode', width: 22 },
              { header: 'Brand', key: 'brand', width: 16 },
              { header: 'Style', key: 'style', width: 14 },
              { header: 'Color', key: 'color', width: 14 },
              { header: 'Department', key: 'department', width: 14 },
              { header: 'Category ID', key: 'category', width: 12, numFmt: XLSX_NUMFMT.integer },
              { header: 'Price', key: 'price', width: 12, numFmt: XLSX_NUMFMT.money },
              { header: 'Qty On Hand', key: 'quantityOnHand', width: 12, numFmt: XLSX_NUMFMT.integer },
              { header: 'Inventory Value', key: 'inventoryValue', width: 16, numFmt: XLSX_NUMFMT.money },
              { header: 'COGS', key: 'cogs', width: 12, numFmt: XLSX_NUMFMT.money },
              // Turnover ratio is a multiplier (e.g. 2.43x) — two decimal digits,
              // no currency symbol.
              { header: 'Turnover Ratio', key: 'turnoverRatio', width: 14, numFmt: XLSX_NUMFMT.decimal2 },
            ],
            rows: details.map((d) => ({
              skuCode: d.skuCode,
              brand: d.brand ?? '',
              style: d.style,
              color: d.color ?? '',
              department: d.department,
              category: d.category ?? null,
              price: d.price,
              quantityOnHand: d.quantityOnHand,
              inventoryValue: d.inventoryValue,
              cogs: d.cogs,
              turnoverRatio: d.turnoverRatio,
            })),
          },
        ],
      });
      return;
    }

    const header = 'SKU Code,Brand,Style,Color,Department,Category ID,Price,Qty On Hand,Inventory Value,COGS,Turnover Ratio';
    const rows = details.map((d) =>
      [
        escapeCsv(d.skuCode),
        escapeCsv(d.brand ?? ''),
        escapeCsv(d.style),
        escapeCsv(d.color ?? ''),
        d.department,
        d.category ?? '',
        d.price.toFixed(2),
        d.quantityOnHand,
        d.inventoryValue.toFixed(2),
        d.cogs.toFixed(2),
        d.turnoverRatio.toFixed(2),
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-turnover-report.csv"');
    res.send(csv);
    return;
  }

  // JSON response
  const turnoverPaginationParams = { page: query.page, pageSize: query.pageSize, sort: query.sort, order: query.order };

  if (query.department) {
    const categories = mapCategoryField(reportService.getTurnoverByCategory(query.department, filters), categoryLookup.idToCode);
    const detailsResult = reportService.getTurnoverDetails(filters, turnoverPaginationParams);
    const details = mapCategoryField(detailsResult.data, categoryLookup.idToCode);

    res.json({
      startDate: query.startDate ?? null,
      endDate: query.endDate ?? null,
      department: query.department,
      categories,
      details,
      pagination: detailsResult.pagination,
    });
    return;
  }

  // Top-level: department summary sorted by turnover (lowest first = slow movers)
  const departments = reportService.getTurnoverByDepartment(filters);
  res.json({
    startDate: query.startDate ?? null,
    endDate: query.endDate ?? null,
    departments,
  });
  } catch (err) { next(err); }
});

// ── Sell-Through Analysis Report ────────────────────────────────

// Sell-through is data-driven against `app.taxonomy_department` and
// `app.sku.category_number` — its department/category domains aren't the
// SQLite-era 6-name enum or the 556–599 RICS code window the other reports
// still validate against. Accept any string for department and any positive
// integer for category.
const sellThroughQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  department: z.string().trim().min(1).max(120).optional(),
  category: z.coerce.number().int().positive().optional(),
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
  ...reportPaginationFields,
});

/**
 * @openapi
 * /api/v1/reports/sell-through:
 *   get:
 *     summary: Sell-through analysis — units sold / units received by style and period
 *     tags: [Reports]
 *     parameters:
 *       - name: startDate
 *         in: query
 *         schema: { type: string, format: date }
 *         description: Start date (YYYY-MM-DD, inclusive)
 *       - name: endDate
 *         in: query
 *         schema: { type: string, format: date }
 *         description: End date (YYYY-MM-DD, inclusive)
 *       - name: department
 *         in: query
 *         schema: { type: string, enum: [FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT] }
 *         description: Drill-down into a specific department
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 556, maximum: 599 }
 *         description: Filter to a specific category (requires department)
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json, csv], default: json }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *         description: Page number (applies to detail-level drill-down views)
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *         description: Items per page (applies to detail-level drill-down views)
 *       - name: sort
 *         in: query
 *         schema: { type: string }
 *         description: Field to sort by (optional, applies to detail-level drill-down views)
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc] }
 *         description: Sort direction (optional, applies to detail-level drill-down views)
 *     responses:
 *       200:
 *         description: Sell-through analysis report
 */
router.get('/sell-through', validateQuery(sellThroughQuerySchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
  const query = (req as any).validatedQuery as {
    startDate?: string;
    endDate?: string;
    department?: string;
    category?: number;
    format: 'json' | 'csv' | 'xlsx';
    page: number;
    pageSize: number;
    sort?: string;
    order?: 'asc' | 'desc';
  };

  // Sell-through reads directly from app.* — `category` is the real
  // category_number from app.sku, not a SQLite ref_categories.id, so skip the
  // SQLite lookup translation that the other reports still rely on.
  const filters: reportService.SellThroughFilters = {
    startDate: query.startDate,
    endDate: query.endDate,
    department: query.department,
    category: query.category,
  };

  // Pass-through "category id ⇄ code" mapping: the service already returns the
  // real numeric category code, so translate via an empty map (identity
  // fallback) to keep the existing `mapCategoryField` shape transformation.
  const identityCategoryMap: ReadonlyMap<number, number> = new Map();

  if (query.format === 'csv' || query.format === 'xlsx') {
    const detailsResult = await reportService.getSellThroughDetails(filters);
    const details = mapCategoryField(detailsResult.data, identityCategoryMap);

    if (query.format === 'xlsx') {
      await sendXlsx(res, {
        filename: 'sell-through-report.xlsx',
        sheets: [
          {
            name: 'Sell-Through',
            columns: [
              { header: 'SKU Code', key: 'skuCode', width: 22 },
              { header: 'Brand', key: 'brand', width: 16 },
              { header: 'Style', key: 'style', width: 14 },
              { header: 'Color', key: 'color', width: 14 },
              { header: 'Department', key: 'department', width: 14 },
              { header: 'Category ID', key: 'category', width: 12, numFmt: XLSX_NUMFMT.integer },
              { header: 'Price', key: 'price', width: 12, numFmt: XLSX_NUMFMT.money },
              { header: 'Units Sold', key: 'unitsSold', width: 12, numFmt: XLSX_NUMFMT.integer },
              { header: 'Units Received', key: 'unitsReceived', width: 14, numFmt: XLSX_NUMFMT.integer },
              // Sell-through already expressed as a 0-100 number — use the
              // pre-scaled percent format so Excel doesn't multiply by 100.
              { header: 'Sell-Through %', key: 'sellThroughPct', width: 14, numFmt: XLSX_NUMFMT.percent1 },
            ],
            rows: details.map((d) => ({
              skuCode: d.skuCode,
              brand: d.brand ?? '',
              style: d.style,
              color: d.color ?? '',
              department: d.department,
              category: d.category ?? null,
              price: d.price,
              unitsSold: d.unitsSold,
              unitsReceived: d.unitsReceived,
              sellThroughPct: d.sellThroughPct,
            })),
          },
        ],
      });
      return;
    }

    const header = 'SKU Code,Brand,Style,Color,Department,Category ID,Price,Units Sold,Units Received,Sell-Through %';
    const rows = details.map((d) =>
      [
        escapeCsv(d.skuCode),
        escapeCsv(d.brand ?? ''),
        escapeCsv(d.style),
        escapeCsv(d.color ?? ''),
        d.department,
        d.category ?? '',
        d.price.toFixed(2),
        d.unitsSold,
        d.unitsReceived,
        d.sellThroughPct.toFixed(1),
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sell-through-report.csv"');
    res.send(csv);
    return;
  }

  // JSON response
  const stPaginationParams = { page: query.page, pageSize: query.pageSize, sort: query.sort, order: query.order };

  if (query.department) {
    const categories = mapCategoryField(
      await reportService.getSellThroughByCategory(query.department, filters),
      identityCategoryMap,
    );
    const detailsResult = await reportService.getSellThroughDetails(filters, stPaginationParams);
    const details = mapCategoryField(detailsResult.data, identityCategoryMap);

    res.json({
      startDate: query.startDate ?? null,
      endDate: query.endDate ?? null,
      department: query.department,
      categories,
      details,
      pagination: detailsResult.pagination,
    });
    return;
  }

  // Top-level: department summary sorted by sell-through (lowest first = underperformers)
  const departments = await reportService.getSellThroughByDepartment(filters);
  res.json({
    startDate: query.startDate ?? null,
    endDate: query.endDate ?? null,
    departments,
  });
  } catch (err) { next(err); }
});

// ── Inventory Aging Report ──────────────────────────────────────
//
// Backed by Postgres (`app.sku` / `app.stock_level` / RICS taxonomy). The
// department and category filters accept the full RICS taxonomy, not just
// the legacy 6-macro/556-599 women's-shoe MVP slice — so this schema is
// looser than the on-hand / sales reports above.

// CSV-list helpers: the page sends `stores=1,5`, `sectors=4,5`, etc. The
// Zod transforms strip empties and coerce each token to the right type so
// the service receives typed arrays.
function csvIntList() {
  return z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return undefined;
      const parsed = parsePositiveIntegerSelection(raw);
      if (parsed.error) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error });
        return z.NEVER;
      }
      return parsed.values.length > 0 ? parsed.values : undefined;
    });
}
function csvStringList() {
  return z
    .string()
    .optional()
    .transform((raw) => {
      if (!raw) return undefined;
      const parsed = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return parsed.length > 0 ? parsed : undefined;
    });
}

function joinCriteriaText(
  selected: Array<string | number> | undefined,
  raw?: string,
  single?: string,
): string | undefined {
  const parts = [
    selected?.map((value) => String(value).trim()).filter(Boolean).join(','),
    single?.trim(),
    raw?.trim(),
  ].filter((value): value is string => !!value);
  return parts.length ? parts.join(',') : undefined;
}

const inventoryAgingQuerySchema = z.object({
  // `groupKey` is the value of whichever group dimension the operator drilled
  // into (department description, sector number, vendor code, buyer code,
  // store number). Legacy callers may still send `department=…`; we accept
  // both and prefer groupKey when set.
  groupBy: z.enum(['department', 'sector', 'vendor', 'buyer', 'store']).default('department'),
  groupKey: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  category: z.coerce.number().int().min(1).max(999).optional(),
  stores: csvIntList(),
  // Criteria multi-selects.
  chains: csvStringList(),
  buyers: csvStringList(),
  sectors: csvIntList(),
  departments: csvIntList(),
  categories: csvIntList(),
  vendors: csvStringList(),
  seasons: csvStringList(),
  skus: csvStringList(),
  groups: csvStringList(),
  keywords: csvStringList(),
  styleColor: z.string().optional(),
  storesRaw: z.string().optional(),
  categoriesRaw: z.string().optional(),
  vendorsRaw: z.string().optional(),
  seasonsRaw: z.string().optional(),
  skusRaw: z.string().optional(),
  groupsRaw: z.string().optional(),
  keywordsRaw: z.string().optional(),
  styleColorRaw: z.string().optional(),
  bucketScheme: z.enum(['30_60_90', '60_120_180', '90_180_270']).default('30_60_90'),
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
  ...reportPaginationFields,
});

/**
 * @openapi
 * /api/v1/reports/inventory-aging:
 *   get:
 *     summary: Inventory aging report — stock bucketed by days on hand
 *     tags: [Reports]
 *     parameters:
 *       - name: department
 *         in: query
 *         schema: { type: string }
 *         description: RICS department description (e.g. "ZAPATO MARCA HOMBRE"). Pass "Unmapped" for stock whose category is outside any department range.
 *       - name: category
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 999 }
 *         description: Filter to a specific RICS category number (requires department)
 *       - name: bucketScheme
 *         in: query
 *         schema: { type: string, enum: [30_60_90, 60_120_180, 90_180_270], default: 30_60_90 }
 *         description: Aging-bucket boundary preset. Last bucket is the "flagged" threshold (90 / 180 / 270 days).
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json, csv], default: json }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *         description: Page number (applies to detail-level drill-down views)
 *       - name: pageSize
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *         description: Items per page (applies to detail-level drill-down views)
 *       - name: sort
 *         in: query
 *         schema: { type: string }
 *         description: Field to sort by (optional, applies to detail-level drill-down views)
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc] }
 *         description: Sort direction (optional, applies to detail-level drill-down views)
 *     responses:
 *       200:
 *         description: Inventory aging report
 */
router.get('/inventory-aging', validateQuery(inventoryAgingQuerySchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
  const query = (req as any).validatedQuery as {
    groupBy: inventoryAgingPg.GroupBy;
    groupKey?: string;
    department?: string;
    category?: number;
    stores?: number[];
    chains?: string[];
    buyers?: string[];
    sectors?: number[];
    departments?: number[];
    categories?: number[];
    vendors?: string[];
    seasons?: string[];
    skus?: string[];
    groups?: string[];
    keywords?: string[];
    styleColor?: string;
    storesRaw?: string;
    categoriesRaw?: string;
    vendorsRaw?: string;
    seasonsRaw?: string;
    skusRaw?: string;
    groupsRaw?: string;
    keywordsRaw?: string;
    styleColorRaw?: string;
    bucketScheme: inventoryAgingPg.BucketScheme;
    format: 'json' | 'csv' | 'xlsx';
    page: number;
    pageSize: number;
    sort?: string;
    order?: 'asc' | 'desc';
  };
  const effectiveGroupKey = query.groupKey ?? query.department;
  const sharedCriteria: SalesAnalysisCriteria = {
    stores: query.stores,
    chains: query.chains,
    sectors: query.sectors,
    departments: query.departments,
    categories: query.categories,
    vendors: query.vendors,
    seasons: query.seasons,
    skus: query.skus,
    groups: query.groups,
    keywords: query.keywords,
    buyers: query.buyers,
    styleColor: query.styleColor?.trim() || undefined,
    storesRaw: query.storesRaw?.trim() || undefined,
    categoriesRaw: query.categoriesRaw?.trim() || undefined,
    vendorsRaw: query.vendorsRaw?.trim() || undefined,
    seasonsRaw: query.seasonsRaw?.trim() || undefined,
    skusRaw: query.skusRaw?.trim() || undefined,
    groupsRaw: query.groupsRaw?.trim() || undefined,
    keywordsRaw: query.keywordsRaw?.trim() || undefined,
    styleColorRaw: query.styleColorRaw?.trim() || undefined,
  };
  const effectiveStores = await resolveSharedStoreNumbers(sharedCriteria, query.stores);
  const skuFilter = await resolveSharedProductCriteriaSkuWhitelist(sharedCriteria);
  const agingSkuFilter = effectiveStores && effectiveStores.length === 0 ? [] : skuFilter ?? undefined;
  const detailFilters = {
    groupKey: effectiveGroupKey,
    category: query.category,
    stores: effectiveStores ?? query.stores,
    skuFilter: agingSkuFilter,
  };

  if (query.format === 'csv' || query.format === 'xlsx') {
    const detailsResult = await inventoryAgingPg.getAgingDetails(
      detailFilters,
      undefined,
      query.bucketScheme,
      query.groupBy,
    );
    const details = detailsResult.data;

    if (query.format === 'xlsx') {
      await sendXlsx(res, {
        filename: 'inventory-aging-report.xlsx',
        sheets: [
          {
            name: 'Inventory Aging',
            columns: [
              { header: 'SKU Code', key: 'skuCode', width: 22 },
              { header: 'Brand', key: 'brand', width: 16 },
              { header: 'Style', key: 'style', width: 14 },
              { header: 'Color', key: 'color', width: 14 },
              { header: 'Department', key: 'department', width: 14 },
              { header: 'Category ID', key: 'category', width: 12, numFmt: XLSX_NUMFMT.integer },
              { header: 'Price', key: 'price', width: 12, numFmt: XLSX_NUMFMT.money },
              { header: 'Qty On Hand', key: 'quantityOnHand', width: 12, numFmt: XLSX_NUMFMT.integer },
              { header: 'Cost Value', key: 'costValue', width: 14, numFmt: XLSX_NUMFMT.money },
              { header: 'Days On Hand', key: 'daysOnHand', width: 14, numFmt: XLSX_NUMFMT.integer },
              { header: 'Aging Bucket', key: 'agingBucket', width: 14 },
              // Flagged is exported as 'YES'/'' string to match the CSV output
              // rather than a boolean — keeps the two formats consistent.
              { header: 'Flagged', key: 'flagged', width: 10 },
              { header: 'Last Received', key: 'lastReceivedAt', width: 16 },
            ],
            rows: details.map((d) => ({
              skuCode: d.skuCode,
              brand: d.brand ?? '',
              style: d.style,
              color: d.color ?? '',
              department: d.department,
              category: d.category ?? null,
              price: d.price,
              quantityOnHand: d.quantityOnHand,
              costValue: d.costValue,
              daysOnHand: d.daysOnHand,
              agingBucket: d.agingBucket,
              flagged: d.flagged ? 'YES' : '',
              lastReceivedAt: d.lastReceivedAt ?? '',
            })),
          },
        ],
      });
      return;
    }

    const header = 'SKU Code,Brand,Style,Color,Department,Category ID,Price,Qty On Hand,Cost Value,Days On Hand,Aging Bucket,Flagged,Last Received';
    const rows = details.map((d) =>
      [
        escapeCsv(d.skuCode),
        escapeCsv(d.brand ?? ''),
        escapeCsv(d.style),
        escapeCsv(d.color ?? ''),
        d.department,
        d.category ?? '',
        d.price.toFixed(2),
        d.quantityOnHand,
        d.costValue.toFixed(2),
        d.daysOnHand,
        d.agingBucket,
        d.flagged ? 'YES' : '',
        d.lastReceivedAt ?? '',
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-aging-report.csv"');
    res.send(csv);
    return;
  }

  // JSON response
  const agingPaginationParams = { page: query.page, pageSize: query.pageSize, sort: query.sort, order: query.order };

  if (effectiveGroupKey) {
    const detailsResult = await inventoryAgingPg.getAgingDetails(
      detailFilters,
      agingPaginationParams,
      query.bucketScheme,
      query.groupBy,
    );

    res.json({
      groupBy: query.groupBy,
      groupKey: effectiveGroupKey,
      department: query.groupBy === 'department' ? effectiveGroupKey : undefined,
      bucketScheme: query.bucketScheme,
      details: detailsResult.data,
      pagination: detailsResult.pagination,
    });
    return;
  }

  // Top-level: group summary with aging buckets
  const groups = await inventoryAgingPg.getAgingByGroup({
    groupBy: query.groupBy,
    stores: effectiveStores ?? query.stores,
    skuFilter: agingSkuFilter,
    scheme: query.bucketScheme,
  });
  res.json({
    groupBy: query.groupBy,
    bucketScheme: query.bucketScheme,
    departments: groups.map((g) => ({ ...g, department: g.groupLabel })),
    groups,
  });
  } catch (err) { next(err); }
});

// ── Inventory Aging — dimensions endpoint ───────────────────────────
router.get('/inventory-aging/dimensions', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dims = await inventoryAgingPg.getAgingDimensions();
    res.json(dims);
  } catch (err) {
    next(err);
  }
});

function escapeCsv(value: string | null): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── Sales History by Month (RICS Ch. 6 p. 95) ────────────────────────

function currentYearMonth(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const queryBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (normalized === '') return undefined;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return value;
}, z.boolean());

const SUPPORTED_METRIC_KEYS = [
  'quantitySold',
  'netSales',
  'pctOfStoreNetSales',
  'profit',
  'grossProfit',
  // v2.1 — shipped after RIINVHIS discovery.
  'beginningOnHand',
  'roiPct',
  'turns',
  'newSkuStoreCount',
  'carryoverSkuStoreCount',
  'newSkuDistinctCount',
  'carryoverSkuDistinctCount',
  'newSkuUnitsSold',
  'carryoverSkuUnitsSold',
  'newCarryoverSkuRatio',
  'newCarryoverUnitsSoldRatio',
] as const;
const DEFERRED_METRIC_KEYS = ['beginningOnHand', 'roiPct', 'turns'] as const;

const seasonalityIndexQuerySchema = z.object({
  endMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'endMonth must be YYYY-MM')
    .optional(),
  department: z.coerce.number().int().positive().optional(),
});

router.get(
  '/seasonality-index',
  validateQuery(seasonalityIndexQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req as any).validatedQuery as {
        endMonth?: string;
        department?: number;
      };
      const report = await getSeasonalityIndexReport({
        endMonth: query.endMonth,
        departmentNumber: query.department,
      });
      res.json(report);
    } catch (err) {
      next(err);
    }
  },
);

const salesHistoryByMonthQuerySchema = z.object({
  stores: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s?.trim()) return [] as number[];
      const parsed = parsePositiveIntegerSelection(s);
      if (parsed.error) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `stores must be a comma-separated list of positive integers or ranges: ${parsed.error}` });
        return z.NEVER;
      }
      return parsed.values;
    }),
  endMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'endMonth must be YYYY-MM')
    .optional()
    .default(currentYearMonth()),
  sortBy: z.enum(['vendor', 'category']).default('vendor'),
  combineStores: queryBoolean.default(true),
  // v2: which metrics to emit. Comma-separated list; any unknown key is
  // dropped. Empty string / missing → defaults to just `netSales` (v1 parity).
  dataToPrint: z
    .string()
    .optional()
    .transform((s) => {
      if (!s) return ['netSales'] as const;
      const keys = s.split(',').map((k) => k.trim()).filter(Boolean);
      const known = keys.filter((k): k is (typeof SUPPORTED_METRIC_KEYS)[number] =>
        (SUPPORTED_METRIC_KEYS as readonly string[]).includes(k),
      );
      return known.length > 0 ? known : (['netSales'] as const);
    }),
  // Legacy compatibility only. Beginning On-Hand / ROI / Turns are now backed
  // by owned inventory-history tables, but callers may still send
  // `deferredMetrics` on the query string and expect it to echo back.
  deferredMetrics: z
    .string()
    .optional()
    .transform((s) => {
      if (!s) return [] as const;
      const keys = s.split(',').map((k) => k.trim()).filter(Boolean);
      return keys.filter((k): k is (typeof DEFERRED_METRIC_KEYS)[number] =>
        (DEFERRED_METRIC_KEYS as readonly string[]).includes(k),
      );
    }),
  detailLevel: z.enum(['sku', 'subtotals', 'department']).default('subtotals'),
  includePriorYear: queryBoolean.default(false),
  // Seven criteria facets — every facet is a raw RICS-grammar string and
  // optional. An empty / missing string means "no filter on this facet".
  critStores: z.string().optional(),
  critCategories: z.string().optional(),
  critVendors: z.string().optional(),
  critSeasons: z.string().optional(),
  critStyleColors: z.string().optional(),
  critGroups: z.string().optional(),
  critKeywords: z.string().optional(),
  chains: csvStringList(),
  sectors: csvIntList(),
  departments: csvIntList(),
  categories: csvIntList(),
  vendors: csvStringList(),
  seasons: csvStringList(),
  skus: csvStringList(),
  groups: csvStringList(),
  keywords: csvStringList(),
  buyers: csvStringList(),
  styleColor: z.string().optional(),
  storesRaw: z.string().optional(),
  categoriesRaw: z.string().optional(),
  vendorsRaw: z.string().optional(),
  seasonsRaw: z.string().optional(),
  skusRaw: z.string().optional(),
  groupsRaw: z.string().optional(),
  keywordsRaw: z.string().optional(),
  styleColorRaw: z.string().optional(),
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
});

/**
 * @openapi
 * /api/v1/reports/rics-sales-history-by-month:
 *   get:
 *     summary: Sales History by Month — 12-month trailing pivot (RICS Ch. 6 p. 95) — v2
 *     description: >
 *       Full-parity Sales History by Month report. Supports the Data to
 *       Print checklist including sales, inventory, and SKU lifecycle count
 *       metrics via the owned inventory-history tables, all three detail
 *       levels, and seven criteria facets following the RICS criteria grammar
 *       (ranges, lists, exclusions, wildcards).
 *     tags: [Reports]
 *     parameters:
 *       - name: stores
 *         in: query
 *         required: false
 *         schema: { type: string }
 *         description: Comma-separated list of store numbers; omit for all stores.
 *       - name: endMonth
 *         in: query
 *         schema: { type: string, pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, enum: [vendor, category], default: vendor }
 *       - name: combineStores
 *         in: query
 *         schema: { type: string, enum: ['true', 'false'], default: 'true' }
 *       - name: detailLevel
 *         in: query
 *         schema: { type: string, enum: [sku, subtotals, department], default: subtotals }
 *       - name: dataToPrint
 *         in: query
 *         schema: { type: string }
 *         description: Comma-separated metric keys. Supported - quantitySold, netSales, pctOfStoreNetSales, profit, grossProfit, beginningOnHand, roiPct, turns, newSkuStoreCount, carryoverSkuStoreCount, newSkuDistinctCount, carryoverSkuDistinctCount, newSkuUnitsSold, carryoverSkuUnitsSold, newCarryoverSkuRatio, newCarryoverUnitsSoldRatio. Defaults to netSales.
 *       - name: deferredMetrics
 *         in: query
 *         schema: { type: string }
 *         description: Legacy compatibility only. Any recognized metric names are echoed back in the response for UI display.
 *       - name: critStores
 *         in: query
 *         schema: { type: string }
 *       - name: critCategories
 *         in: query
 *         schema: { type: string }
 *       - name: critVendors
 *         in: query
 *         schema: { type: string }
 *       - name: critSeasons
 *         in: query
 *         schema: { type: string }
 *       - name: critStyleColors
 *         in: query
 *         schema: { type: string }
 *       - name: critGroups
 *         in: query
 *         schema: { type: string }
 *       - name: critKeywords
 *         in: query
 *         schema: { type: string }
 *       - name: format
 *         in: query
 *         schema: { type: string, enum: [json, csv, xlsx], default: json }
 *     responses:
 *       200:
 *         description: Sales history pivot with per-metric monthly grids, column totals, grand totals, and chart series.
 *       501:
 *         description: SALES_SOURCE is not set to 'rics'.
 */
const METRIC_LABEL: Record<string, string> = {
  quantitySold: 'Quantity Sold',
  netSales: 'Net Sales',
  pctOfStoreNetSales: '% of Store Net Sales',
  profit: 'Profit',
  grossProfit: 'Gross Profit %',
  beginningOnHand: 'Beg. of Month On Hand Qty.',
  roiPct: 'ROI %',
  turns: 'Turns',
  newSkuStoreCount: 'New SKU Store Count',
  carryoverSkuStoreCount: 'Carryover SKU Store Count',
  newSkuDistinctCount: 'New Distinct SKU Count',
  carryoverSkuDistinctCount: 'Carryover Distinct SKU Count',
  newSkuUnitsSold: 'New SKU Units Sold',
  carryoverSkuUnitsSold: 'Carryover SKU Units Sold',
  newCarryoverSkuRatio: 'New/Carryover SKU %',
  newCarryoverUnitsSoldRatio: 'New/Carryover Units Sold %',
};
// Excel number format per metric. Quantity = integer; dollar amounts = money;
// percent-like metrics already expressed as 0-100 → percent1.
const METRIC_NUMFMT: Record<string, string> = {
  quantitySold: XLSX_NUMFMT.integer,
  netSales: XLSX_NUMFMT.money,
  pctOfStoreNetSales: XLSX_NUMFMT.percent1,
  profit: XLSX_NUMFMT.money,
  grossProfit: XLSX_NUMFMT.percent1,
  beginningOnHand: XLSX_NUMFMT.integer,
  roiPct: XLSX_NUMFMT.percent1,
  turns: XLSX_NUMFMT.decimal2,
  newSkuStoreCount: XLSX_NUMFMT.integer,
  carryoverSkuStoreCount: XLSX_NUMFMT.integer,
  newSkuDistinctCount: XLSX_NUMFMT.integer,
  carryoverSkuDistinctCount: XLSX_NUMFMT.integer,
  newSkuUnitsSold: XLSX_NUMFMT.integer,
  carryoverSkuUnitsSold: XLSX_NUMFMT.integer,
  newCarryoverSkuRatio: '0.0"%"',
  newCarryoverUnitsSoldRatio: '0.0"%"',
};
function formatMetricCell(key: string, v: number): string {
  if (key === 'quantitySold') return String(Math.round(v));
  if (key === 'beginningOnHand') return String(Math.round(v));
  if (
    key === 'newSkuStoreCount' ||
    key === 'carryoverSkuStoreCount' ||
    key === 'newSkuDistinctCount' ||
    key === 'carryoverSkuDistinctCount' ||
    key === 'newSkuUnitsSold' ||
    key === 'carryoverSkuUnitsSold'
  ) return String(Math.round(v));
  if (key === 'newCarryoverSkuRatio' || key === 'newCarryoverUnitsSoldRatio') return `${v.toFixed(1)}%`;
  if (key === 'grossProfit' || key === 'pctOfStoreNetSales' || key === 'roiPct') return v.toFixed(1);
  if (key === 'turns') return v.toFixed(2);
  if (key === 'netSales' || key === 'profit') return String(Math.round(v));
  return v.toFixed(2);
}

function formatMetricTotalCell(key: string, v: number): string {
  if (key === 'beginningOnHand') return '';
  return formatMetricCell(key, v);
}

router.get(
  '/rics-sales-history-by-month',
  validateQuery(salesHistoryByMonthQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req as any).validatedQuery as {
        stores: number[];
        endMonth: string;
        sortBy: 'vendor' | 'category';
        combineStores: boolean;
        dataToPrint: readonly string[];
        deferredMetrics: readonly string[];
        detailLevel: 'sku' | 'subtotals' | 'department';
        includePriorYear: boolean;
        critStores?: string;
        critCategories?: string;
        critVendors?: string;
        critSeasons?: string;
        critStyleColors?: string;
        critGroups?: string;
        critKeywords?: string;
        chains?: string[];
        sectors?: number[];
        departments?: number[];
        categories?: number[];
        vendors?: string[];
        seasons?: string[];
        skus?: string[];
        groups?: string[];
        keywords?: string[];
        buyers?: string[];
        styleColor?: string;
        storesRaw?: string;
        categoriesRaw?: string;
        vendorsRaw?: string;
        seasonsRaw?: string;
        skusRaw?: string;
        groupsRaw?: string;
        keywordsRaw?: string;
        styleColorRaw?: string;
        format: 'json' | 'csv' | 'xlsx';
      };

      const report = await salesReportFacade.getSalesHistoryByMonth({
        storeNumbers: query.stores,
        endYearMonth: query.endMonth,
        sortBy: query.sortBy,
        combineStores: query.combineStores,
        detailLevel: query.detailLevel,
        includePriorYear: query.includePriorYear,
        dataToPrint: query.dataToPrint as salesReportFacade.MonthlyMetricKey[],
        deferredMetrics: query.deferredMetrics as (
          'beginningOnHand' | 'roiPct' | 'turns'
        )[],
        criteria: {
          stores: joinCriteriaText(undefined, query.storesRaw ?? query.critStores),
          categories: joinCriteriaText(query.categories, query.categoriesRaw ?? query.critCategories),
          vendors: joinCriteriaText(query.vendors, query.vendorsRaw ?? query.critVendors),
          seasons: joinCriteriaText(query.seasons, query.seasonsRaw ?? query.critSeasons),
          skus: joinCriteriaText(query.skus, query.skusRaw),
          styleColors: joinCriteriaText(undefined, query.styleColorRaw ?? query.critStyleColors, query.styleColor),
          groups: joinCriteriaText(query.groups, query.groupsRaw ?? query.critGroups),
          keywords: joinCriteriaText(query.keywords, query.keywordsRaw ?? query.critKeywords),
          chains: query.chains,
          sectors: query.sectors,
          departments: query.departments,
          buyers: query.buyers,
        },
      });

      // Generic multi-metric CSV/XLSX writer. Layout: one section per store
      // block, one subsection per selected metric. Subsections are labeled
      // by the metric's display name so the output self-describes even when
      // the caller selects an arbitrary combination of metrics.
      const metrics = report.dataToPrint as string[];
      const filenameCriteria = [
        effectiveStoresFilenamePart(query.stores),
        { value: report.endMonth, includeIfDefault: true },
        { value: query.sortBy, includeIfDefault: true },
        { value: query.detailLevel, includeIfDefault: true },
        { value: query.combineStores ? undefined : 'split' },
        { key: 'm', value: metrics, includeIfDefault: true },
        { key: 'defer', value: query.deferredMetrics },
        { value: query.includePriorYear ? 'py' : undefined },
        { key: 'scrit', value: query.critStores },
        { key: 'catcrit', value: query.critCategories },
        { key: 'vcrit', value: query.critVendors },
        { key: 'seacrit', value: query.critSeasons },
        { key: 'stylecrit', value: query.critStyleColors },
        { key: 'grpcrit', value: query.critGroups },
        { key: 'kwcrit', value: query.critKeywords },
        { key: 'ch', value: query.chains },
        { key: 'sec', value: query.sectors },
        { key: 'dep', value: query.departments },
        { key: 'cat', value: query.categories },
        { key: 'v', value: query.vendors },
        { key: 'sea', value: query.seasons },
        { key: 'sku', value: query.skus },
        { key: 'grp', value: query.groups },
        { key: 'kw', value: query.keywords },
        { key: 'buyer', value: query.buyers },
        { key: 'style', value: query.styleColor },
        { key: 'sraw', value: query.storesRaw },
        { key: 'catraw', value: query.categoriesRaw },
        { key: 'vraw', value: query.vendorsRaw },
        { key: 'searaw', value: query.seasonsRaw },
        { key: 'skuraw', value: query.skusRaw },
        { key: 'grpraw', value: query.groupsRaw },
        { key: 'kwraw', value: query.keywordsRaw },
        { key: 'styleraw', value: query.styleColorRaw },
      ];

      if (query.format === 'csv') {
        const sortKeyLabel =
          query.detailLevel === 'sku'
            ? 'SKU'
            : query.detailLevel === 'department'
              ? 'Department'
              : query.sortBy === 'vendor'
                ? 'Vendor'
                : 'Category';
        const lines: string[] = [];
        lines.push(
          `Sales History by Month,Sort By:,${sortKeyLabel},End Month:,${report.endMonth},Detail:,${query.detailLevel}`,
        );
        lines.push('');

        for (const block of report.blocks) {
          lines.push(escapeCsv(block.storeLabel));
          for (const metric of metrics) {
            lines.push(escapeCsv(METRIC_LABEL[metric] ?? metric));
            const header = ['Key', 'Label', ...report.months, 'Total'];
            lines.push(header.map((h) => escapeCsv(h)).join(','));
            for (const row of block.rows) {
              const series = row.metrics[metric as salesReportFacade.MonthlyMetricKey] ?? new Array(report.months.length).fill(0);
              const total = row.totals[metric as salesReportFacade.MonthlyMetricKey] ?? 0;
              lines.push(
                [
                  escapeCsv(row.key),
                  escapeCsv(row.label),
                  ...series.map((v) => formatMetricCell(metric, v)),
                  formatMetricTotalCell(metric, total),
                ].join(','),
              );
            }
            const colTotals = block.columnTotals[metric as salesReportFacade.MonthlyMetricKey] ?? new Array(report.months.length).fill(0);
            const grandTotal = block.grandTotals[metric as salesReportFacade.MonthlyMetricKey] ?? 0;
            lines.push(
              [
                escapeCsv('Totals'),
                '',
                ...colTotals.map((v) => formatMetricCell(metric, v)),
                formatMetricTotalCell(metric, grandTotal),
              ].join(','),
            );
            if (report.priorYearMonths?.length) {
              lines.push(escapeCsv(`${METRIC_LABEL[metric] ?? metric} PY`));
              const priorHeader = ['Key', 'Label', ...report.priorYearMonths, 'Total'];
              lines.push(priorHeader.map((h) => escapeCsv(h)).join(','));
              for (const row of block.rows) {
                const series = row.priorYearMetrics?.[metric as salesReportFacade.MonthlyMetricKey];
                if (!series) continue;
                const total = row.priorYearTotals?.[metric as salesReportFacade.MonthlyMetricKey] ?? 0;
                lines.push(
                  [
                    escapeCsv(row.key),
                    escapeCsv(row.label),
                    ...series.map((v) => formatMetricCell(metric, v)),
                    formatMetricTotalCell(metric, total),
                  ].join(','),
                );
              }
              const colTotals = block.priorYearColumnTotals?.[metric as salesReportFacade.MonthlyMetricKey];
              const grandTotal = block.priorYearGrandTotals?.[metric as salesReportFacade.MonthlyMetricKey] ?? 0;
              if (colTotals) {
                lines.push(
                  [
                    escapeCsv('Totals'),
                    '',
                    ...colTotals.map((v) => formatMetricCell(metric, v)),
                    formatMetricTotalCell(metric, grandTotal),
                  ].join(','),
                );
              }
            }
            lines.push('');
          }
        }

        const csv = lines.join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${reportExportFilename('SHBM', 'csv', filenameCriteria)}"`,
        );
        res.send(csv);
        return;
      }

      if (query.format === 'xlsx') {
        // One sheet per block to keep columns readable for multi-metric output.
        // Inside a sheet we stack each metric as a labeled section. Excel's
        // per-column number format doesn't vary per row, so we widen the
        // approach: dedicated metric sheets would make column types cleaner,
        // but stacking keeps the export aligned with the CSV structure and
        // the user screenshot expectations.
        const months = report.months;
        const sheets = report.blocks.map((block) => {
          const columns = [
            { header: 'Key', key: 'key', width: 18 },
            { header: 'Label', key: 'label', width: 28 },
            ...months.map((m) => ({ header: m, key: `m_${m}`, width: 12 })),
            { header: 'Total', key: 'total', width: 14 },
          ];
          const rows: Array<Record<string, unknown>> = [];
          for (const metric of metrics) {
            rows.push({
              key: METRIC_LABEL[metric] ?? metric,
              label: '',
            });
            for (const row of block.rows) {
              const series = row.metrics[metric as salesReportFacade.MonthlyMetricKey] ?? new Array(months.length).fill(0);
              const total = row.totals[metric as salesReportFacade.MonthlyMetricKey] ?? 0;
              const rec: Record<string, unknown> = { key: row.key, label: row.label };
              months.forEach((m, i) => {
                rec[`m_${m}`] = series[i];
              });
              rec.total = metric === 'beginningOnHand' ? '' : total;
              rows.push(rec);
            }
            const colTotals = block.columnTotals[metric as salesReportFacade.MonthlyMetricKey] ?? new Array(months.length).fill(0);
            const grandTotal = block.grandTotals[metric as salesReportFacade.MonthlyMetricKey] ?? 0;
            const totalsRec: Record<string, unknown> = { key: 'Totals', label: '' };
            months.forEach((m, i) => {
              totalsRec[`m_${m}`] = colTotals[i];
            });
            totalsRec.total = metric === 'beginningOnHand' ? '' : grandTotal;
            rows.push(totalsRec);
            if (report.priorYearMonths?.length) {
              rows.push({
                key: `${METRIC_LABEL[metric] ?? metric} PY`,
                label: '',
              });
              for (const row of block.rows) {
                const series = row.priorYearMetrics?.[metric as salesReportFacade.MonthlyMetricKey];
                if (!series) continue;
                const total = row.priorYearTotals?.[metric as salesReportFacade.MonthlyMetricKey] ?? 0;
                const rec: Record<string, unknown> = { key: row.key, label: row.label };
                months.forEach((m, i) => {
                  rec[`m_${m}`] = series[i];
                });
                rec.total = metric === 'beginningOnHand' ? '' : total;
                rows.push(rec);
              }
              const priorTotals = block.priorYearColumnTotals?.[metric as salesReportFacade.MonthlyMetricKey];
              if (priorTotals) {
                const priorTotalsRec: Record<string, unknown> = { key: 'Totals', label: '' };
                months.forEach((m, i) => {
                  priorTotalsRec[`m_${m}`] = priorTotals[i];
                });
                priorTotalsRec.total = metric === 'beginningOnHand'
                  ? ''
                  : block.priorYearGrandTotals?.[metric as salesReportFacade.MonthlyMetricKey] ?? 0;
                rows.push(priorTotalsRec);
              }
            }
            rows.push({});
          }
          // Column numFmt — if a single metric is selected we can apply a
          // specific format; otherwise leave numeric columns as general
          // numbers since the sheet stacks different metric types. Users
          // opening XLSX in Excel can re-apply formatting if they want.
          if (metrics.length === 1) {
            const fmt = METRIC_NUMFMT[metrics[0]];
            if (fmt) {
              for (const c of columns) {
                if (c.key.startsWith('m_') || c.key === 'total') {
                  (c as { header: string; key: string; width?: number; numFmt?: string }).numFmt = fmt;
                }
              }
            }
          }
          return {
            name: block.storeLabel.slice(0, 31).replace(/[\\/?*:\[\]]/g, '_') || 'Block',
            columns,
            rows,
          };
        });
        await sendXlsx(res, {
          filename: reportExportFilename('SHBM', 'xlsx', filenameCriteria),
          sheets,
        });
        return;
      }

      res.json(report);
    } catch (err) { next(err); }
  },
);

// Route-level error handler: map the facade's "not implemented" error (hit by
// the legacy `/rics-sales-by-day-store` alias when SALES_SOURCE!=rics) to 501.
router.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof salesReportFacade.SalesSourceNotImplementedError) {
    res.status(501).json({ error: { code: 'SALES_SOURCE_NOT_IMPLEMENTED', message: err.message } });
    return;
  }
  next(err);
});

export default router;
