/**
 * Routes sales-reporting reads between the RICS live adapter and the (future)
 * Postgres-backed path. Mirrors the `ricsInventoryFacade` shape so the same
 * env-var idiom applies across modules.
 *
 * Current state: only `rics` is implemented. `local` throws a typed error the
 * route layer maps to HTTP 501.
 */

import * as ricsAdapter from './ricsSalesReportAdapter';
import * as monthlyAdapter from './ricsSalesHistoryByMonthAdapter';
import * as pivotAdapter from './ricsSalesPivotAdapter';
import * as pivotByBuyerAdapter from './ricsSalesPivotByBuyerAdapter';
import * as pivotCustomAdapter from './ricsSalesPivotCustomAdapter';
import {
  parseCriteria,
  matchesCriteria,
  matchesKeywords,
  type CriteriaExpression,
} from '../../utils/criteriaGrammar';
import { prisma } from '../../db/prisma';
export { ReportTypeNotImplementedError } from './ricsSalesReportAdapter';
export type { SalesDimensionsResponse } from './ricsSalesReportAdapter';
export type {
  MonthlyNetSalesSortBy,
  MonthlyNetSalesRow,
  MonthlyDetailLevel,
  MonthlyMeasuresRow,
} from './ricsSalesHistoryByMonthAdapter';
import type {
  RicsSalesByDayByStoreReport,
  SalesByTimeReport,
  SalesBySkuReport,
  SalesBySkuSortBy,
  SalespersonSummaryReport,
  SalespersonSubtotalBy,
  BestSellersReport,
  BestSellersDimension,
  BestSellersMetric,
  BestSellersPeriod,
  SalesAnalysisReport,
  SalesAnalysisDimension,
  SalesAnalysisReportType,
  SalesAnalysisStoreOption,
  SalesAnalysisCriteria,
  SalesAnalysisPrinting,
  SalesHierarchyReport,
  SalesHierarchyStoreOption,
  PivotDimension,
  SalesPivotReport,
  SalesPivotVariant,
  StockStatusReport,
  StockStatusSortBy,
  StockStatusStoreOption,
  StockStatusItemFilter,
  StockStatusPrintQty,
} from './types';

export class SalesSourceNotImplementedError extends Error {
  constructor(source: string) {
    super(`SALES_SOURCE="${source}" is not implemented yet. Set SALES_SOURCE=rics.`);
    this.name = 'SalesSourceNotImplementedError';
  }
}

function source(): string {
  return (process.env.SALES_SOURCE || 'rics').toLowerCase();
}

export function sourceIsRics(): boolean {
  return source() === 'rics';
}

// ─────────────────────────── Phase 1 ──────────────────────────────────────

export async function getSalesByDay(params: {
  storeNumbers: number[];
  startDate: string;
  endDate: string;
  comparisonOffsetDays?: number;
  combineStores?: boolean;
}): Promise<RicsSalesByDayByStoreReport> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());
  return ricsAdapter.getSalesByDay(params);
}

export async function getSalesByTime(params: {
  startDate: string;
  endDate: string;
  compareStartDate?: string;
  compareEndDate?: string;
  storeNumbers?: number[];
  printPctOfTotal?: boolean;
}): Promise<SalesByTimeReport> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());
  return ricsAdapter.getSalesByTime(params);
}

export async function getSalesBySku(params: {
  startDate: string;
  endDate: string;
  storeNumbers?: number[];
  sortBy?: SalesBySkuSortBy;
  includeReturns?: boolean;
  skus?: string[];
}): Promise<SalesBySkuReport> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());
  return ricsAdapter.getSalesBySku(params);
}

export async function getSalespersonSummary(params: {
  startDate: string;
  endDate: string;
  storeNumbers?: number[];
  subtotalBy?: SalespersonSubtotalBy;
  combineStores?: boolean;
  cashierSummary?: boolean;
}): Promise<SalespersonSummaryReport> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());
  return ricsAdapter.getSalespersonSummary(params);
}

// ─────────────────────────── Phase 2 ──────────────────────────────────────

export async function getBestSellers(params: {
  dimension: BestSellersDimension;
  metric: BestSellersMetric;
  period: BestSellersPeriod;
  storeNumbers?: number[];
  combineStores?: boolean;
  topN?: number;
}): Promise<BestSellersReport> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());
  return ricsAdapter.getBestSellers(params);
}

export async function getSalesAnalysis(params: {
  dimension: SalesAnalysisDimension;
  reportType: SalesAnalysisReportType;
  storeOption: SalesAnalysisStoreOption;
  criteria: SalesAnalysisCriteria;
  printing: SalesAnalysisPrinting;
  startDate?: string;
  endDate?: string;
  /** Opt-in per-SKU attribute enrichment (SKU_DETAIL only). See adapter. */
  includeAttributes?: boolean;
}): Promise<SalesAnalysisReport> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());
  return ricsAdapter.getSalesAnalysis(params);
}

/**
 * Sales Pivot — dispatches to one of three variants based on `variant`:
 *   department                 Sector → Dept → Category → SKU
 *   department-separate-store  Store → Sector → Dept → Category → SKU
 *   buyer                      Buyer → Dept → Category → SKU
 */
export async function getSalesPivot(params: {
  startDate: string;
  endDate: string;
  storeNumbers?: number[];
  variant: SalesPivotVariant;
  /** Required when variant === 'custom'; ignored otherwise. */
  levels?: [PivotDimension, PivotDimension, PivotDimension];
  /** Criteria filters — variant='custom' only. Empty/undefined = no filter. */
  sectors?: number[];
  departments?: number[];
  seasons?: string[];
  buyers?: string[];
}): Promise<SalesPivotReport> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());
  if (params.variant === 'custom') {
    if (!params.levels) {
      throw new Error('levels are required when variant=custom');
    }
    return pivotCustomAdapter.getSalesPivotCustom({
      startDate: params.startDate,
      endDate: params.endDate,
      storeNumbers: params.storeNumbers,
      levels: params.levels,
      sectors: params.sectors,
      departments: params.departments,
      seasons: params.seasons,
      buyers: params.buyers,
    });
  }
  if (params.variant === 'buyer' ||
      params.variant === 'buyer-vendor' ||
      params.variant === 'buyer-vendor-separate-store') {
    return pivotByBuyerAdapter.getSalesPivotByBuyer({
      startDate: params.startDate,
      endDate: params.endDate,
      storeNumbers: params.storeNumbers,
      variant: params.variant,
    });
  }
  return pivotAdapter.getSalesPivotByDepartment({
    startDate: params.startDate,
    endDate: params.endDate,
    storeNumbers: params.storeNumbers,
    separateStore: params.variant === 'department-separate-store',
  });
}

export async function getSalesHierarchy(params: {
  storeOption: SalesHierarchyStoreOption;
  criteria: SalesAnalysisCriteria;
  startDate: string;
  endDate: string;
  priorYear?: boolean;
  includeAttributes?: boolean;
}): Promise<SalesHierarchyReport> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());
  return ricsAdapter.getSalesHierarchy(params);
}

export async function getStockStatus(params: {
  sortBy?: StockStatusSortBy;
  storeOption?: StockStatusStoreOption;
  itemFilter?: StockStatusItemFilter;
  criteria?: { vendors?: string[]; categories?: number[]; seasons?: string[]; skus?: string[] };
  printQty?: StockStatusPrintQty;
}): Promise<StockStatusReport> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());
  return ricsAdapter.getStockStatus(params);
}

export async function listSalesDimensions(): Promise<import('./ricsSalesReportAdapter').SalesDimensionsResponse> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());
  return ricsAdapter.listSalesDimensions();
}

// ─────────────────────────── Sales History by Month (RICS Ch. 6 p. 95) ────
//
// v2 expansion: reports multiple metrics (Quantity Sold, Net Sales, % of Store
// Net Sales, Profit, Gross Profit %) at three detail levels (SKU / Vendor-or-
// Category subtotals / Department summary), filtered by RICS criteria grammar
// across 7 facets (Stores, Categories, Vendors, Seasons, Style/Colors, Groups,
// Keywords). See docs/dev/specs/2026-04-18-sales-history-by-month-design.md
// for the v1→v2 delta.
//
// v2.1 (2026-04-18): Beginning On-Hand Qty, ROI%, and Turns ship after the
// RIINVHIS.MDB discovery pass turned up monthly inventory snapshots in the
// `InvHis.LYMonthQtyOH_NN` / `LYMonthOnHand_NN` rolling arrays. See the
// adapter's `queryMonthlyInventoryHistory` for the column semantics and the
// "metric formulas" section below for how ROI% / Turns are derived.

import type { MonthlyDetailLevel } from './ricsSalesHistoryByMonthAdapter';

/** Metric keys users may request under `dataToPrint`. */
export const SUPPORTED_MONTHLY_METRICS = [
  'quantitySold',
  'netSales',
  'pctOfStoreNetSales',
  'profit',
  'grossProfit',
  'beginningOnHand',
  'roiPct',
  'turns',
] as const;
export type MonthlyMetricKey = (typeof SUPPORTED_MONTHLY_METRICS)[number];

/** Metrics listed in the RICS manual that still require a data source we
 * don't have yet. Currently empty — the three formerly deferred metrics
 * (Beginning On-Hand Qty, ROI%, Turns) shipped in v2.1 once RIINVHIS was
 * indexed. Retained as a type for backward compatibility with callers that
 * still send `deferredMetrics=…` on the query string; any keys sent are
 * echoed back in the response and otherwise ignored by the facade. */
export const DEFERRED_MONTHLY_METRICS = [] as const;
export type DeferredMetricKey = 'beginningOnHand' | 'roiPct' | 'turns';

export interface SalesHistoryByMonthCriteria {
  /** Raw RICS-grammar strings per facet. Empty strings = "no filter". */
  stores?: string;        // e.g. "2,13" or "<>9" — narrows the store list
  categories?: string;    // "556-599" ranges work here
  vendors?: string;
  seasons?: string;
  styleColors?: string;
  groups?: string;
  keywords?: string;
}

export interface SalesHistoryByMonthBlockRow {
  key: string;                            // dim key (vendor / category / dept / sku)
  label: string;                          // human label
  /** Parent grouping for SKU-detail rows, currently vendor/category. */
  groupKey?: string;
  groupLabel?: string;
  /** Product image filename for SKU-detail rows. */
  pictureFileName?: string | null;
  /** Child SKU rows for grouped SKU-detail reports. */
  children?: SalesHistoryByMonthBlockRow[];
  /** Per-metric 12-month values keyed by MonthlyMetricKey. */
  metrics: Partial<Record<MonthlyMetricKey, number[]>>;
  /** Per-metric row total over 12 months (for pct-of-store the value
   *  is the row's weighted total share — see compute path below). */
  totals: Partial<Record<MonthlyMetricKey, number>>;
}

export interface SalesHistoryByMonthBlock {
  storeNumber: number | 'ALL';
  storeLabel: string;
  rows: SalesHistoryByMonthBlockRow[];
  /** Per-metric column totals (length 12). */
  columnTotals: Partial<Record<MonthlyMetricKey, number[]>>;
  /** Per-metric grand total (sum of columnTotals). */
  grandTotals: Partial<Record<MonthlyMetricKey, number>>;
}

export interface SalesHistoryByMonthChartSeries {
  name: string;
  values: number[];                       // length 12, always Net Sales (anchor metric)
}

export interface SalesHistoryByMonthResult {
  sortBy: 'vendor' | 'category';
  endMonth: string;
  months: string[];                       // length 12, ascending
  combineStores: boolean;
  stores: Array<{ number: number; label: string }>;
  detailLevel: MonthlyDetailLevel;
  dataToPrint: MonthlyMetricKey[];
  deferredMetrics: DeferredMetricKey[];   // metrics requested but Phase 2
  criteria: SalesHistoryByMonthCriteria;
  blocks: SalesHistoryByMonthBlock[];
  chartSeries: SalesHistoryByMonthChartSeries[];
}

export interface GetSalesHistoryByMonthParams {
  storeNumbers: number[];
  endYearMonth: string;
  sortBy: 'vendor' | 'category';
  combineStores: boolean;
  detailLevel?: MonthlyDetailLevel;
  dataToPrint?: MonthlyMetricKey[];
  criteria?: SalesHistoryByMonthCriteria;
  /** Metrics the caller requested that we can't produce yet (passed through
   * to the response for UI display). Accepted names: beginningOnHand, roiPct,
   * turns. */
  deferredMetrics?: DeferredMetricKey[];
}

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertYearMonth(ym: string, fieldName: string): void {
  if (!YEAR_MONTH_RE.test(ym)) {
    throw new Error(`${fieldName} must match YYYY-MM, got: ${ym}`);
  }
}

/** Return the 12-month window ending inclusively at `endYearMonth`, oldest first. */
function trailing12Months(endYearMonth: string): string[] {
  assertYearMonth(endYearMonth, 'endYearMonth');
  const endYear = Number(endYearMonth.slice(0, 4));
  const endMonth = Number(endYearMonth.slice(5, 7));
  const out: string[] = [];
  let y = endYear;
  let m = endMonth - 11;
  while (m <= 0) { m += 12; y -= 1; }
  for (let i = 0; i < 12; i++) {
    out.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
  return out;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

// ─────────────────────── RIINVHIS calendar-slot mapping ──────────────────
//
// RIINVHIS.InvHis stores rolling 12-month inventory snapshots keyed by
// calendar month (NN=01..12). Slot NN always holds the MOST RECENT COMPLETED
// occurrence of calendar-month NN — so if today is 2026-04, slot _04 =
// 2025-04 (in-progress 2026-04 hasn't closed yet), slot _03 = 2026-03,
// slot _12 = 2025-12, etc. This helper maps each window month to the
// calendar slot that stores its end-of-month qty, or null if that window
// month is outside the RIINVHIS rolling window.
function slotForWindowMonth(
  windowYearMonth: string,
  todayYear: number,
  todayMonth: number,
): number | null {
  const y = Number(windowYearMonth.slice(0, 4));
  const m = Number(windowYearMonth.slice(5, 7));
  const storedYear = m < todayMonth ? todayYear : todayYear - 1;
  return storedYear === y ? m - 1 : null;
}

/** For each of the 12 window months, return the InvHis slot index (0-11) that
 *  holds that month's end-of-month snapshot, or null if it's outside the
 *  rolling window. */
function mapWindowToInvHisSlot(
  months: string[],
  today: { year: number; month: number },
): (number | null)[] {
  return months.map((ym) => slotForWindowMonth(ym, today.year, today.month));
}

/** For each of the 12 window months, return the InvHis slot index holding the
 *  end-of-month snapshot of the PREVIOUS month (i.e. the beginning-on-hand
 *  source for this month), or null if unavailable. */
function mapWindowToPrevMonthInvHisSlot(
  months: string[],
  today: { year: number; month: number },
): (number | null)[] {
  return months.map((ym) => {
    let y = Number(ym.slice(0, 4));
    let m = Number(ym.slice(5, 7)) - 1;
    if (m === 0) { m = 12; y -= 1; }
    const prevYm = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
    return slotForWindowMonth(prevYm, today.year, today.month);
  });
}

// ─────────────────────────── department lookup ────────────────────────────

/** Returns a function mapping a RICS category code → department label. Uses
 * RICS departments own category ranges: beg_categ <= category <= end_categ. */
async function buildDepartmentMapper(): Promise<(code: number) => { key: string; label: string }> {
  try {
    const rows = await prisma.$queryRawUnsafe<{
      Number: number | null;
      Desc: string | null;
      BegCateg: number | null;
      EndCateg: number | null;
    }[]>(
      `SELECT number AS "Number",
              "desc" AS "Desc",
              beg_categ AS "BegCateg",
              end_categ AS "EndCateg"
         FROM app.taxonomy_department
        ORDER BY number`,
    );
    const ranges = rows
      .filter((r) => r.Number != null && r.BegCateg != null && r.EndCateg != null)
      .map((r) => ({
        number: Number(r.Number),
        label: r.Desc?.trim() ? `${Number(r.Number)} - ${r.Desc.trim()}` : String(Number(r.Number)),
        begCateg: Number(r.BegCateg),
        endCateg: Number(r.EndCateg),
      }));
    return (code: number) => {
      const n = Number(code);
      const dept = ranges.find((r) => n >= r.begCateg && n <= r.endCateg);
      return dept
        ? { key: String(dept.number), label: dept.label }
        : { key: `UNMAPPED-${code}`, label: `Unmapped (cat ${code})` };
    };
  } catch {
    // Tests that don't init the DB can still exercise the facade — fall
    // back to a trivial mapper that groups everything under "UNMAPPED-<code>".
    return (code: number) => ({ key: `UNMAPPED-${code}`, label: `Cat ${code}` });
  }
}

// ─────────────────────────── criteria → SKU resolver ──────────────────────

interface ResolvedCriteria {
  vendorFilter?: string[];
  categoryFilter?: number[];
  storeFilter?: number[];
  /** The narrow SKU set satisfying complex facets (seasons, styleColor,
   *  groups, keywords, wildcards/ranges/exclusions on vendors/categories). */
  skuFilter?: string[];
  /** When the SKU resolver cannot apply (InventoryMaster unreadable), we fall
   * back to adapter-side filtering and rely on vendor/category pushdowns. */
  warning?: string;
}

/**
 * Resolve a raw criteria payload into SQL-ready filter lists.
 *
 * Heuristic: if a facet consists of pure literal tokens (no `?`, no `*`, no
 * `<>`, no ranges), push it straight into the adapter IN-list. Otherwise
 * resolve against InventoryMaster to produce a SKU set. Stores are always
 * resolved via `matchesCriteria` against the caller's `storeNumbers`.
 */
async function resolveCriteria(
  raw: SalesHistoryByMonthCriteria | undefined,
  callerStoreNumbers: number[],
): Promise<ResolvedCriteria> {
  const criteria: SalesHistoryByMonthCriteria = raw ?? {};
  const out: ResolvedCriteria = {};

  // Stores — always an intersection of the caller list and the `stores` facet.
  const storesExpr = parseCriteria(criteria.stores);
  if (!storesExpr.empty) {
    out.storeFilter = callerStoreNumbers.filter((n) => matchesCriteria(storesExpr, n));
  } else {
    out.storeFilter = callerStoreNumbers.slice();
  }

  const vendorsExpr = parseCriteria(criteria.vendors);
  const categoriesExpr = parseCriteria(criteria.categories);
  const seasonsExpr = parseCriteria(criteria.seasons);
  const styleColorsExpr = parseCriteria(criteria.styleColors);
  const groupsExpr = parseCriteria(criteria.groups);
  const keywordsExpr = parseCriteria(criteria.keywords);

  // Simple path: only vendors/categories provided, and each is literal-only.
  const simpleVendors = simpleLiteralList(vendorsExpr);
  const simpleCategories = simpleNumericLiteralList(categoriesExpr);

  const needsMasterResolve =
    !seasonsExpr.empty ||
    !styleColorsExpr.empty ||
    !groupsExpr.empty ||
    !keywordsExpr.empty ||
    (vendorsExpr.empty ? false : simpleVendors == null) ||
    (categoriesExpr.empty ? false : simpleCategories == null);

  if (!needsMasterResolve) {
    if (simpleVendors && simpleVendors.length > 0) out.vendorFilter = simpleVendors;
    if (simpleCategories && simpleCategories.length > 0) out.categoryFilter = simpleCategories;
    return out;
  }

  // Complex path — resolve SKU set via InventoryMaster projection.
  const masterRows = await monthlyAdapter.loadSkuMasterForCriteria();
  if (masterRows.length === 0) {
    out.warning = 'InventoryMaster not readable; complex criteria ignored';
    if (simpleVendors && simpleVendors.length > 0) out.vendorFilter = simpleVendors;
    if (simpleCategories && simpleCategories.length > 0) out.categoryFilter = simpleCategories;
    return out;
  }

  const skuSet: string[] = [];
  for (const r of masterRows) {
    if (!vendorsExpr.empty && !matchesCriteria(vendorsExpr, r.vendor)) continue;
    if (!categoriesExpr.empty && !matchesCriteria(categoriesExpr, r.category)) continue;
    if (!seasonsExpr.empty && !matchesCriteria(seasonsExpr, r.season)) continue;
    if (!styleColorsExpr.empty && !matchesCriteria(styleColorsExpr, r.styleColor)) continue;
    if (!groupsExpr.empty && !matchesCriteria(groupsExpr, r.groupCode)) continue;
    if (!keywordsExpr.empty && !matchesKeywords(keywordsExpr, r.keywords)) continue;
    skuSet.push(r.sku);
  }

  // Important: if the resolver produced zero SKUs (meaning the criteria are
  // over-constrained for this customer), we still pass `skuFilter: []` so the
  // adapter returns no rows. An adapter call with a huge skuFilter is
  // chunked — see adapter implementation. If the resolver set is empty AND
  // every facet expression was empty (no effective filter), we instead leave
  // skuFilter undefined so the adapter runs unrestricted.
  if (
    vendorsExpr.empty &&
    categoriesExpr.empty &&
    seasonsExpr.empty &&
    styleColorsExpr.empty &&
    groupsExpr.empty &&
    keywordsExpr.empty
  ) {
    return out;
  }
  out.skuFilter = skuSet;
  return out;
}

function simpleLiteralList(expr: CriteriaExpression): string[] | null {
  if (expr.empty) return null;
  if (expr.tokens.some((t) => t.excluded || t.kind !== 'literal')) return null;
  return expr.tokens.map((t) => (t.kind === 'literal' ? t.value : '')).filter(Boolean);
}

function simpleNumericLiteralList(expr: CriteriaExpression): number[] | null {
  if (expr.empty) return null;
  if (expr.tokens.some((t) => t.excluded)) return null;
  const out: number[] = [];
  for (const t of expr.tokens) {
    if (t.kind === 'literal') {
      const n = Number(t.value);
      if (!Number.isFinite(n)) return null;
      out.push(n);
    } else if (t.kind === 'range' && t.numeric) {
      const from = Number(t.from);
      const to = Number(t.to);
      for (let i = from; i <= to; i++) out.push(i);
    } else {
      return null;
    }
  }
  return out;
}

// ─────────────────────────── main entry point ─────────────────────────────

/**
 * Sales History by Month (RICS Ch. 6 p. 95) — v2.
 *
 * Returns a 12-month trailing window of sales measures pivoted by vendor /
 * category / department / SKU (per `detailLevel`), optionally combined across
 * stores, with per-metric 12-month grids for each metric in `dataToPrint`.
 *
 * Metric formulas (per RICS p. 87):
 *   - Net Sales       = SUM(TicketDetail.Extension)          — reconciles with
 *                       Sales Analysis and by-day reports.
 *   - Quantity Sold   = SUM(TicketDetail.Qty), returns = negative.
 *   - Profit          = NetSales − COGS, COGS = SUM(Cost × Qty) per p. 87.
 *   - Gross Profit %  = Profit / NetSales (the "GP-%" column on p. 87).
 *   - % of Store      = row NetSales / store NetSales for that month,
 *                       expressed as a 0-100 scale decimal (e.g. 53.3).
 */
export async function getSalesHistoryByMonth(
  params: GetSalesHistoryByMonthParams,
): Promise<SalesHistoryByMonthResult> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());

  if (!Array.isArray(params.storeNumbers) || params.storeNumbers.length === 0) {
    throw new Error('storeNumbers must have at least one entry');
  }
  assertYearMonth(params.endYearMonth, 'endYearMonth');
  if (params.sortBy !== 'vendor' && params.sortBy !== 'category') {
    throw new Error(`sortBy must be 'vendor' or 'category', got: ${params.sortBy}`);
  }

  const detailLevel: MonthlyDetailLevel = params.detailLevel ?? 'subtotals';
  const dataToPrint: MonthlyMetricKey[] = (params.dataToPrint && params.dataToPrint.length > 0)
    ? params.dataToPrint.filter((k): k is MonthlyMetricKey => SUPPORTED_MONTHLY_METRICS.includes(k))
    : ['netSales'];
  const criteria = params.criteria ?? {};
  const deferredMetrics = params.deferredMetrics ?? [];

  const months = trailing12Months(params.endYearMonth);
  const fromYearMonth = months[0];
  const toYearMonth = months[11];
  const monthIndex = new Map<string, number>();
  months.forEach((m, i) => monthIndex.set(m, i));

  // Resolve criteria → SQL filters + optional SKU set.
  const resolved = await resolveCriteria(criteria, params.storeNumbers);
  const effectiveStores = resolved.storeFilter && resolved.storeFilter.length > 0
    ? resolved.storeFilter
    : params.storeNumbers;

  // Single adapter call with the filter pushdowns.
  const longRows = await monthlyAdapter.queryMonthlyMeasures({
    storeNumbers: effectiveStores,
    fromYearMonth,
    toYearMonth,
    sortBy: params.sortBy,
    detailLevel,
    combineStores: params.combineStores,
    skuFilter: resolved.skuFilter,
    vendorFilter: resolved.vendorFilter,
    categoryFilter: resolved.categoryFilter,
  });

  // Resolve store labels via the same store lookup the other reports use.
  const storeMap = await ricsAdapter.listSalesDimensions()
    .then((d) => new Map(d.stores.map((s) => [s.number, s.name] as const)))
    .catch(() => new Map<number, string | null>());

  const stores = effectiveStores.map((n) => {
    const name = storeMap.get(n);
    return {
      number: n,
      label: name ? `${n} - ${name}` : String(n),
    };
  });

  // ─── Pivot ────────────────────────────────────────────────────────────
  // For department level, roll category → department here.
  const deptMap = detailLevel === 'department' ? await buildDepartmentMapper() : null;

  type PivotRow = {
    storeBucket: number | 'ALL';
    dimKey: string;
    dimLabel: string;
    groupKey?: string;
    groupLabel?: string;
    pictureFileName?: string | null;
    quantity: number[];
    netSales: number[];
    cogs: number[];
  };
  const pivotMap = new Map<string, PivotRow>();
  const groupPivotMap = new Map<string, PivotRow>();

  // Per-store NetSales totals (for % of Store).
  type StoreTotals = { netSales: number[]; total: number };
  const storeNetSales = new Map<number | 'ALL', StoreTotals>();
  function bumpStoreTotals(bucket: number | 'ALL', mIdx: number, v: number): void {
    let s = storeNetSales.get(bucket);
    if (!s) {
      s = { netSales: new Array<number>(12).fill(0), total: 0 };
      storeNetSales.set(bucket, s);
    }
    s.netSales[mIdx] += v;
    s.total += v;
  }

  for (const r of longRows) {
    const mIdx = monthIndex.get(r.yearMonth);
    if (mIdx === undefined) continue;                       // outside 12-month window
    const storeBucket: number | 'ALL' = params.combineStores ? 'ALL' : r.storeNumber;
    // Remap dim if department level: fold category→dept.
    let dimKey = r.dimKey;
    let dimLabel = r.dimLabel;
    if (detailLevel === 'department' && deptMap) {
      const n = Number(r.dimKey);
      const d = deptMap(n);
      dimKey = d.key;
      dimLabel = d.label;
    }
    const groupKey = detailLevel === 'sku' && params.sortBy === 'vendor'
      ? (r.vendorKey?.trim() || '(none)')
      : undefined;
    const groupLabel = groupKey;

    const mapKey = `${storeBucket}|${dimKey}`;
    let row = pivotMap.get(mapKey);
    if (!row) {
      row = {
        storeBucket,
        dimKey,
        dimLabel,
        groupKey,
        groupLabel,
        pictureFileName: detailLevel === 'sku' ? r.pictureFileName ?? null : null,
        quantity: new Array<number>(12).fill(0),
        netSales: new Array<number>(12).fill(0),
        cogs: new Array<number>(12).fill(0),
      };
      pivotMap.set(mapKey, row);
    }
    row.quantity[mIdx] += r.quantity;
    row.netSales[mIdx] += r.netSales;
    row.cogs[mIdx] += r.cogs;
    if (groupKey) {
      const groupMapKey = `${storeBucket}|${groupKey}`;
      let groupRow = groupPivotMap.get(groupMapKey);
      if (!groupRow) {
        groupRow = {
          storeBucket,
          dimKey: groupKey,
          dimLabel: groupLabel ?? groupKey,
          quantity: new Array<number>(12).fill(0),
          netSales: new Array<number>(12).fill(0),
          cogs: new Array<number>(12).fill(0),
        };
        groupPivotMap.set(groupMapKey, groupRow);
      }
      groupRow.quantity[mIdx] += r.quantity;
      groupRow.netSales[mIdx] += r.netSales;
      groupRow.cogs[mIdx] += r.cogs;
    }
    bumpStoreTotals(storeBucket, mIdx, r.netSales);
  }

  // ─── Inventory history (for Beginning On-Hand / ROI% / Turns) ─────────
  // Pulled from RIINVHIS.InvHis only when one of the three inventory-backed
  // metrics is requested, and rolled up through the same dim logic the sales
  // pivot uses so the two line up 1:1.
  type InvAgg = {
    monthQtyOH: number[];                 // length 12, indexed by RICS calendar slot (0=Jan, 11=Dec)
    monthValueOH: number[];               // length 12, in dollars
  };
  const needsInventory = dataToPrint.some(
    (k) => k === 'beginningOnHand' || k === 'roiPct' || k === 'turns',
  );
  const invByRow = new Map<string, InvAgg>();
  const today = new Date();
  const todayInfo = { year: today.getFullYear(), month: today.getMonth() + 1 };
  let currentSlotMap = mapWindowToInvHisSlot(months, todayInfo);
  let prevSlotMap = mapWindowToPrevMonthInvHisSlot(months, todayInfo);

  if (needsInventory && detailLevel === 'sku') {
    // Reuse the SKU master projection that resolveCriteria already loads.
    const skuMaster = await monthlyAdapter.loadSkuMasterForCriteria();
    const skuDimMap = new Map<string, { vendor: string; category: number | null }>();
    for (const s of skuMaster) {
      skuDimMap.set(s.sku, { vendor: s.vendor ?? '', category: s.category });
    }

    // Push any criteria narrowing through to the InvHis query. Without this,
    // an unfiltered report would scan the full 1-2M-row InvHis table via
    // PowerShell OLEDB which times out in practice. Priority:
    //   1. An explicit resolved.skuFilter (complex criteria path).
    //   2. Derive SKU list from vendorFilter / categoryFilter by intersecting
    //      the skuMaster projection — cheap in-memory, avoids the worst case.
    let invSkuFilter: string[] | undefined = resolved.skuFilter;
    if (!invSkuFilter && (resolved.vendorFilter || resolved.categoryFilter)) {
      const vSet = resolved.vendorFilter && resolved.vendorFilter.length > 0
        ? new Set(resolved.vendorFilter)
        : null;
      const cSet = resolved.categoryFilter && resolved.categoryFilter.length > 0
        ? new Set(resolved.categoryFilter)
        : null;
      const matched: string[] = [];
      for (const s of skuMaster) {
        if (vSet && !vSet.has(s.vendor ?? '')) continue;
        if (cSet && !cSet.has(s.category ?? -1)) continue;
        matched.push(s.sku);
      }
      if (matched.length > 0) invSkuFilter = matched;
    }

    let invRows: Awaited<ReturnType<typeof monthlyAdapter.queryMonthlyInventoryHistory>> = [];
    try {
      invRows = await monthlyAdapter.queryMonthlyInventoryHistory({
        storeNumbers: effectiveStores,
        skuFilter: invSkuFilter,
        nonZeroOnly: true,
      });

      const snapshotValue = invRows.find((row) => row.snapshotAsOf)?.snapshotAsOf;
      if (snapshotValue) {
        const snapshotDate = snapshotValue instanceof Date
          ? snapshotValue
          : new Date(snapshotValue);
        if (!Number.isNaN(snapshotDate.getTime())) {
          const snapshotInfo = {
            year: snapshotDate.getFullYear(),
            month: snapshotDate.getMonth() + 1,
          };
          currentSlotMap = mapWindowToInvHisSlot(months, snapshotInfo);
          prevSlotMap = mapWindowToPrevMonthInvHisSlot(months, snapshotInfo);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[salesReportFacade] InvHis fetch failed: ${msg}`);
    }

    for (const inv of invRows) {
      const dim = skuDimMap.get(inv.sku);
      if (!dim) continue;

      let dimKey: string;
      let dimLabel: string;
      if (detailLevel === 'sku') {
        dimKey = inv.sku;
        dimLabel = inv.sku;
      } else if (detailLevel === 'department' && deptMap) {
        const code = dim.category ?? 0;
        const d = deptMap(code);
        dimKey = d.key;
        dimLabel = d.label;
      } else if (params.sortBy === 'vendor') {
        dimKey = dim.vendor || '(Unknown)';
        dimLabel = dim.vendor || '(Unknown)';
      } else {
        dimKey = String(dim.category ?? '');
        dimLabel = dimKey;
      }

      const storeBucket: number | 'ALL' = params.combineStores ? 'ALL' : inv.storeNumber;
      const mapKey = `${storeBucket}|${dimKey}`;
      let acc = invByRow.get(mapKey);
      if (!acc) {
        acc = {
          monthQtyOH: new Array<number>(12).fill(0),
          monthValueOH: new Array<number>(12).fill(0),
        };
        invByRow.set(mapKey, acc);
      }
      for (let i = 0; i < 12; i++) {
        acc.monthQtyOH[i] += inv.monthQtyOH[i];
        acc.monthValueOH[i] += inv.monthValueOH[i];
      }
      if (params.sortBy === 'vendor') {
        const groupKey = dim.vendor || '(none)';
        const groupMapKey = `${storeBucket}|${groupKey}`;
        let groupAcc = invByRow.get(groupMapKey);
        if (!groupAcc) {
          groupAcc = {
            monthQtyOH: new Array<number>(12).fill(0),
            monthValueOH: new Array<number>(12).fill(0),
          };
          invByRow.set(groupMapKey, groupAcc);
        }
        for (let i = 0; i < 12; i++) {
          groupAcc.monthQtyOH[i] += inv.monthQtyOH[i];
          groupAcc.monthValueOH[i] += inv.monthValueOH[i];
        }
      }
      // dimLabel is intentionally unused in the aggregation (pivotMap owns labels),
      // but the block key must match pivotMap's key so lookups join correctly.
      void dimLabel;
    }
  } else if (needsInventory) {
    try {
      const invRows = await monthlyAdapter.queryMonthlyInventoryHistoryRollups({
        storeNumbers: effectiveStores,
        sortBy: params.sortBy,
        detailLevel,
        skuFilter: resolved.skuFilter,
        vendorFilter: resolved.vendorFilter,
        categoryFilter: resolved.categoryFilter,
        nonZeroOnly: true,
      });

      const snapshotValue = invRows.find((row) => row.snapshotAsOf)?.snapshotAsOf;
      if (snapshotValue) {
        const snapshotDate = snapshotValue instanceof Date
          ? snapshotValue
          : new Date(snapshotValue);
        if (!Number.isNaN(snapshotDate.getTime())) {
          const snapshotInfo = {
            year: snapshotDate.getFullYear(),
            month: snapshotDate.getMonth() + 1,
          };
          currentSlotMap = mapWindowToInvHisSlot(months, snapshotInfo);
          prevSlotMap = mapWindowToPrevMonthInvHisSlot(months, snapshotInfo);
        }
      }

      for (const inv of invRows) {
        let dimKey = inv.dimKey;
        if (detailLevel === 'department' && deptMap) {
          const d = deptMap(Number(inv.dimKey));
          dimKey = d.key;
        }

        const storeBucket: number | 'ALL' = params.combineStores ? 'ALL' : inv.storeNumber;
        const mapKey = `${storeBucket}|${dimKey}`;
        let acc = invByRow.get(mapKey);
        if (!acc) {
          acc = {
            monthQtyOH: new Array<number>(12).fill(0),
            monthValueOH: new Array<number>(12).fill(0),
          };
          invByRow.set(mapKey, acc);
        }
        for (let i = 0; i < 12; i++) {
          acc.monthQtyOH[i] += inv.monthQtyOH[i];
          acc.monthValueOH[i] += inv.monthValueOH[i];
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[salesReportFacade] InvHis rollup fetch failed: ${msg}`);
    }
  }

  /** Look up the InvHis aggregate for a (bucket, dim) row, or zero-filled default. */
  const zeroInv: InvAgg = {
    monthQtyOH: new Array<number>(12).fill(0),
    monthValueOH: new Array<number>(12).fill(0),
  };
  function invFor(bucket: number | 'ALL', dimKey: string): InvAgg {
    return invByRow.get(`${bucket}|${dimKey}`) ?? zeroInv;
  }

  // ─── Bucket into blocks ───────────────────────────────────────────────

  type BucketAccumulator = {
    storeNumber: number | 'ALL';
    storeLabel: string;
    rows: PivotRow[];
    groupRows: PivotRow[];
  };
  const buckets: BucketAccumulator[] = params.combineStores
    ? [{ storeNumber: 'ALL', storeLabel: 'All Stores', rows: [], groupRows: [] }]
    : stores.map((s) => ({ storeNumber: s.number, storeLabel: s.label, rows: [], groupRows: [] }));

  const bucketIndex = new Map<number | 'ALL', BucketAccumulator>();
  for (const b of buckets) bucketIndex.set(b.storeNumber, b);

  for (const row of pivotMap.values()) {
    const b = bucketIndex.get(row.storeBucket);
    if (!b) continue;
    b.rows.push(row);
  }
  for (const row of groupPivotMap.values()) {
    const b = bucketIndex.get(row.storeBucket);
    if (!b) continue;
    b.groupRows.push(row);
  }

  // Sort rows within each block.
  const sortRows = (rows: PivotRow[]): PivotRow[] => {
    const copy = [...rows];
    if (detailLevel === 'department') {
      copy.sort((a, b) => {
        const an = Number(a.dimKey);
        const bn = Number(b.dimKey);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return a.dimLabel.localeCompare(b.dimLabel, undefined, { sensitivity: 'base' });
      });
    } else if (detailLevel === 'sku') {
      copy.sort((a, b) => {
        const groupCompare = (a.groupLabel ?? '').localeCompare(
          b.groupLabel ?? '',
          undefined,
          { sensitivity: 'base' },
        );
        if (groupCompare !== 0) return groupCompare;
        return a.dimKey.localeCompare(b.dimKey);
      });
    } else if (params.sortBy === 'vendor') {
      copy.sort((a, b) => a.dimLabel.localeCompare(b.dimLabel, undefined, { sensitivity: 'base' }));
    } else {
      copy.sort((a, b) => Number(a.dimKey) - Number(b.dimKey));
    }
    return copy;
  };

  const blocks: SalesHistoryByMonthBlock[] = buckets.map((b) => {
    const sortedRows = sortRows(b.rows);
    const storeTotals = storeNetSales.get(b.storeNumber) ?? {
      netSales: new Array<number>(12).fill(0),
      total: 0,
    };

    // Accumulators for block-level totals across all metrics.
    const colTotals: Record<MonthlyMetricKey, number[]> = {
      quantitySold: new Array(12).fill(0),
      netSales: new Array(12).fill(0),
      pctOfStoreNetSales: new Array(12).fill(0),
      profit: new Array(12).fill(0),
      grossProfit: new Array(12).fill(0),
      beginningOnHand: new Array(12).fill(0),
      roiPct: new Array(12).fill(0),
      turns: new Array(12).fill(0),
    };
    // Block-level inventory-value accumulators, indexed by RICS calendar slot.
    // Used to compute column ROI%/Turns as aggregate profit/cogs divided by
    // aggregate avg inventory value (avoids Simpson's paradox at rollup).
    const colMonthValueBySlot = new Array<number>(12).fill(0);

    const toBlockRow = (
      r: PivotRow,
      accumulateBlockTotals: boolean,
    ): SalesHistoryByMonthBlockRow => {
      const metrics: Partial<Record<MonthlyMetricKey, number[]>> = {};
      const totals: Partial<Record<MonthlyMetricKey, number>> = {};

      // Raw per-metric series.
      const qty = r.quantity.map((v) => Math.round(v));
      const netSales = r.netSales.map((v) => round2(v));
      const profit = r.netSales.map((v, i) => round2(v - r.cogs[i]));
      const gpPct = r.netSales.map((v, i) => (v !== 0 ? round1(((v - r.cogs[i]) / v) * 100) : 0));
      const pctStore = r.netSales.map((v, i) => {
        const tot = storeTotals.netSales[i];
        return tot !== 0 ? round1((v / tot) * 100) : 0;
      });

      if (dataToPrint.includes('quantitySold')) {
        metrics.quantitySold = qty;
        totals.quantitySold = qty.reduce((s, v) => s + v, 0);
        if (accumulateBlockTotals) {
          for (let i = 0; i < 12; i++) colTotals.quantitySold[i] += qty[i];
        }
      }
      if (dataToPrint.includes('netSales')) {
        metrics.netSales = netSales;
        totals.netSales = round2(netSales.reduce((s, v) => s + v, 0));
        if (accumulateBlockTotals) {
          for (let i = 0; i < 12; i++) colTotals.netSales[i] += netSales[i];
        }
      }
      if (dataToPrint.includes('profit')) {
        metrics.profit = profit;
        totals.profit = round2(profit.reduce((s, v) => s + v, 0));
        if (accumulateBlockTotals) {
          for (let i = 0; i < 12; i++) colTotals.profit[i] += profit[i];
        }
      }
      if (dataToPrint.includes('grossProfit')) {
        metrics.grossProfit = gpPct;
        // Row-total GP% uses aggregated numerator/denominator, not avg-of-months.
        const rowNet = r.netSales.reduce((s, v) => s + v, 0);
        const rowCogs = r.cogs.reduce((s, v) => s + v, 0);
        totals.grossProfit = rowNet !== 0 ? round1(((rowNet - rowCogs) / rowNet) * 100) : 0;
      }
      if (dataToPrint.includes('pctOfStoreNetSales')) {
        metrics.pctOfStoreNetSales = pctStore;
        const rowNet = r.netSales.reduce((s, v) => s + v, 0);
        totals.pctOfStoreNetSales = storeTotals.total !== 0
          ? round1((rowNet / storeTotals.total) * 100)
          : 0;
      }

      // ─ Inventory-backed metrics (BoH, ROI%, Turns) ─
      // RICS p. 87: ROI% "always annualized regardless of what period is
      // being analyzed." Same for Turns. We compute per-month values as
      // (monthly flow × 12) / avgInventoryValue, and the row-total as
      // (total flow over window) / avgInventoryValue (window is 12 months
      // so already a year).
      const needsInvRow =
        dataToPrint.includes('beginningOnHand') ||
        dataToPrint.includes('roiPct') ||
        dataToPrint.includes('turns');
      if (needsInvRow) {
        const inv = invFor(b.storeNumber, r.dimKey);

        // Accumulate per-slot inv value into the block-level vector (used
        // later for column totals).
        if (accumulateBlockTotals) {
          for (let s = 0; s < 12; s++) colMonthValueBySlot[s] += inv.monthValueOH[s];
        }

        // Row-level avg inventory value: mean of mapped window months only.
        let rowAvgInvValue = 0;
        let mappedCount = 0;
        for (let i = 0; i < 12; i++) {
          const slot = currentSlotMap[i];
          if (slot !== null) {
            rowAvgInvValue += inv.monthValueOH[slot];
            mappedCount += 1;
          }
        }
        rowAvgInvValue = mappedCount > 0 ? rowAvgInvValue / mappedCount : 0;

        if (dataToPrint.includes('beginningOnHand')) {
          const boh = months.map((_m, i) => {
            const slot = prevSlotMap[i];
            return slot === null ? 0 : Math.round(inv.monthQtyOH[slot]);
          });
          metrics.beginningOnHand = boh;
          // Row total = average BoH across the window (BoH is a stock, not a
          // flow — summing 12 snapshots isn't meaningful, averaging is).
          totals.beginningOnHand = Math.round(boh.reduce((s, v) => s + v, 0) / 12);
          if (accumulateBlockTotals) {
            for (let i = 0; i < 12; i++) colTotals.beginningOnHand[i] += boh[i];
          }
        }

        if (dataToPrint.includes('roiPct')) {
          // Per-month annualized ROI% = (monthly profit × 12) / avgInv × 100
          const roi = profit.map((p) =>
            rowAvgInvValue > 0 ? round1(((p * 12) / rowAvgInvValue) * 100) : 0,
          );
          metrics.roiPct = roi;
          // Row-total ROI% over the window (already 12 months, no ×12 needed).
          const rowProfit = profit.reduce((s, v) => s + v, 0);
          totals.roiPct = rowAvgInvValue > 0
            ? round1((rowProfit / rowAvgInvValue) * 100)
            : 0;
        }

        if (dataToPrint.includes('turns')) {
          const turns = r.cogs.map((c) =>
            rowAvgInvValue > 0 ? round2((c * 12) / rowAvgInvValue) : 0,
          );
          metrics.turns = turns;
          const rowCogs = r.cogs.reduce((s, v) => s + v, 0);
          totals.turns = rowAvgInvValue > 0
            ? round2(rowCogs / rowAvgInvValue)
            : 0;
        }
      }

      return {
        key: r.dimKey,
        label: r.dimLabel,
        groupKey: r.groupKey,
        groupLabel: r.groupLabel,
        pictureFileName: r.pictureFileName ?? null,
        metrics,
        totals,
      };
    };

    let resultRows: SalesHistoryByMonthBlockRow[];
    if (detailLevel === 'sku' && params.sortBy === 'vendor' && b.groupRows.length > 0) {
      const skuRowsByGroup = new Map<string, PivotRow[]>();
      for (const row of sortedRows) {
        const groupKey = row.groupKey ?? '(none)';
        const list = skuRowsByGroup.get(groupKey) ?? [];
        list.push(row);
        skuRowsByGroup.set(groupKey, list);
      }
      const sortedGroupRows = sortRows(b.groupRows);
      resultRows = sortedGroupRows.map((groupRow) => ({
        ...toBlockRow(groupRow, true),
        children: (skuRowsByGroup.get(groupRow.dimKey) ?? []).map((skuRow) =>
          toBlockRow(skuRow, false),
        ),
      }));
    } else {
      resultRows = sortedRows.map((r) => toBlockRow(r, true));
    }

    const columnTotals: Partial<Record<MonthlyMetricKey, number[]>> = {};
    const grandTotals: Partial<Record<MonthlyMetricKey, number>> = {};
    for (const k of dataToPrint) {
      if (k === 'quantitySold') {
        columnTotals.quantitySold = colTotals.quantitySold.map((v) => Math.round(v));
        grandTotals.quantitySold = columnTotals.quantitySold!.reduce((s, v) => s + v, 0);
      } else if (k === 'netSales') {
        columnTotals.netSales = colTotals.netSales.map((v) => round2(v));
        grandTotals.netSales = round2(columnTotals.netSales!.reduce((s, v) => s + v, 0));
      } else if (k === 'profit') {
        columnTotals.profit = colTotals.profit.map((v) => round2(v));
        grandTotals.profit = round2(columnTotals.profit!.reduce((s, v) => s + v, 0));
      } else if (k === 'grossProfit') {
        // Column GP% = column Profit / column NetSales (aggregated).
        const perMonth: number[] = [];
        for (let i = 0; i < 12; i++) {
          const net = colTotals.netSales[i];
          const prof = colTotals.profit[i];
          perMonth.push(net !== 0 ? round1((prof / net) * 100) : 0);
        }
        columnTotals.grossProfit = perMonth;
        const totNet = colTotals.netSales.reduce((s, v) => s + v, 0);
        const totProf = colTotals.profit.reduce((s, v) => s + v, 0);
        grandTotals.grossProfit = totNet !== 0 ? round1((totProf / totNet) * 100) : 0;
      } else if (k === 'pctOfStoreNetSales') {
        // Column sum is always ~100 when every row is included; we still
        // compute explicitly so it tolerates numerical drift.
        columnTotals.pctOfStoreNetSales = colTotals.netSales.map((v, i) => {
          const tot = storeTotals.netSales[i];
          return tot !== 0 ? round1((v / tot) * 100) : 0;
        });
        grandTotals.pctOfStoreNetSales = storeTotals.total !== 0
          ? round1(
              (colTotals.netSales.reduce((s, v) => s + v, 0) / storeTotals.total) * 100,
            )
          : 0;
      } else if (k === 'beginningOnHand') {
        columnTotals.beginningOnHand = colTotals.beginningOnHand.map((v) => Math.round(v));
        grandTotals.beginningOnHand = Math.round(
          columnTotals.beginningOnHand.reduce((s, v) => s + v, 0) / 12,
        );
      } else if (k === 'roiPct' || k === 'turns') {
        // Column ROI%/Turns at block level = aggregate flow / aggregate avg
        // inv value (avoids Simpson's paradox). Block avg inv value uses the
        // block-level per-slot accumulator mapped through the window.
        let blockAvgInvValue = 0;
        let mappedCount = 0;
        for (let i = 0; i < 12; i++) {
          const slot = currentSlotMap[i];
          if (slot !== null) {
            blockAvgInvValue += colMonthValueBySlot[slot];
            mappedCount += 1;
          }
        }
        blockAvgInvValue = mappedCount > 0 ? blockAvgInvValue / mappedCount : 0;

        if (k === 'roiPct') {
          const perMonth = colTotals.profit.map((p) =>
            blockAvgInvValue > 0 ? round1(((p * 12) / blockAvgInvValue) * 100) : 0,
          );
          columnTotals.roiPct = perMonth;
          const totalProfit = colTotals.profit.reduce((s, v) => s + v, 0);
          grandTotals.roiPct = blockAvgInvValue > 0
            ? round1((totalProfit / blockAvgInvValue) * 100)
            : 0;
        } else {
          // turns
          // Column cogs wasn't accumulated separately; derive it from
          // (netSales - profit) to avoid another accumulator.
          const colCogs = colTotals.netSales.map((n, i) => n - colTotals.profit[i]);
          const perMonth = colCogs.map((c) =>
            blockAvgInvValue > 0 ? round2((c * 12) / blockAvgInvValue) : 0,
          );
          columnTotals.turns = perMonth;
          const totalCogs = colCogs.reduce((s, v) => s + v, 0);
          grandTotals.turns = blockAvgInvValue > 0
            ? round2(totalCogs / blockAvgInvValue)
            : 0;
        }
      }
    }

    return {
      storeNumber: b.storeNumber,
      storeLabel: b.storeLabel,
      rows: resultRows,
      columnTotals,
      grandTotals,
    };
  });

  // ─── Chart series ─────────────────────────────────────────────────────
  // The chart always tracks Net Sales (the anchor metric). If Net Sales is
  // not in `dataToPrint` we still emit it for the chart so the x-axis has
  // a stable shape; the table just won't show the Net Sales columns.
  const chartSeries: SalesHistoryByMonthChartSeries[] = blocks.map((b) => {
    const values = b.columnTotals.netSales ?? (storeNetSales.get(b.storeNumber)?.netSales ?? new Array(12).fill(0));
    return { name: b.storeLabel, values: values.slice() };
  });

  return {
    sortBy: params.sortBy,
    endMonth: params.endYearMonth,
    months,
    combineStores: params.combineStores,
    stores,
    detailLevel,
    dataToPrint,
    deferredMetrics,
    criteria,
    blocks,
    chartSeries,
  };
}

export async function warmup(): Promise<void> {
  if (!sourceIsRics()) return;
  return ricsAdapter.warmup();
}
