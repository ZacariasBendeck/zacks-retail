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
import {
  parseCriteria,
  matchesCriteria,
  matchesKeywords,
  type CriteriaExpression,
} from '../../utils/criteriaGrammar';
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
  storeNumber: number;
  startDate: string;
  endDate: string;
  comparisonOffsetDays?: number;
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
}): Promise<SalesAnalysisReport> {
  if (!sourceIsRics()) throw new SalesSourceNotImplementedError(source());
  return ricsAdapter.getSalesAnalysis(params);
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
// Keywords). See docs/superpowers/specs/2026-04-18-sales-history-by-month-design.md
// for the v1→v2 delta.
//
// Deferred (Phase 2, gated by monthly-inventory-history data source):
//   - Beginning On-Hand Qtys — requires a BOM inventory snapshot per (sku,
//     store, month); not available from the live RICS MDBs we query today.
//   - ROI% and Turns — derive from Beginning On-Hand, so they defer with it.

import type { MonthlyDetailLevel } from './ricsSalesHistoryByMonthAdapter';

/** Metric keys users may request under `dataToPrint`. */
export const SUPPORTED_MONTHLY_METRICS = [
  'quantitySold',
  'netSales',
  'pctOfStoreNetSales',
  'profit',
  'grossProfit',
] as const;
export type MonthlyMetricKey = (typeof SUPPORTED_MONTHLY_METRICS)[number];

/** Metrics listed in the RICS manual that require a monthly inventory snapshot
 * the adapter can't produce today. Returned in the response so the UI can
 * disable the checkboxes with a tooltip (see spec v2). */
export const DEFERRED_MONTHLY_METRICS = ['beginningOnHand', 'roiPct', 'turns'] as const;
export type DeferredMetricKey = (typeof DEFERRED_MONTHLY_METRICS)[number];

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

// ─────────────────────────── department lookup ────────────────────────────

/** Returns a function mapping a RICS category code → department label. Uses
 * the seed table `ref_categories` (migrated in db 011) when available, and
 * falls back to "UNMAPPED-<code>" for categories not present in the lookup. */
function buildDepartmentMapper(): (code: number) => { key: string; label: string } {
  try {
    // Lazy import to avoid a hard dep on the DB from facade tests that mock
    // the adapter layer.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getDb } = require('../../db/database');
    const db = getDb();
    const rows = db
      .prepare('SELECT rics_code, dept_macro FROM ref_categories')
      .all() as { rics_code: number; dept_macro: string }[];
    const map = new Map<number, string>();
    for (const r of rows) map.set(Number(r.rics_code), r.dept_macro);
    return (code: number) => {
      const dept = map.get(Number(code));
      return dept
        ? { key: dept, label: dept }
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
  const deptMap = detailLevel === 'department' ? buildDepartmentMapper() : null;

  type PivotRow = {
    storeBucket: number | 'ALL';
    dimKey: string;
    dimLabel: string;
    quantity: number[];
    netSales: number[];
    cogs: number[];
  };
  const pivotMap = new Map<string, PivotRow>();

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
    const mapKey = `${storeBucket}|${dimKey}`;
    let row = pivotMap.get(mapKey);
    if (!row) {
      row = {
        storeBucket,
        dimKey,
        dimLabel,
        quantity: new Array<number>(12).fill(0),
        netSales: new Array<number>(12).fill(0),
        cogs: new Array<number>(12).fill(0),
      };
      pivotMap.set(mapKey, row);
    }
    row.quantity[mIdx] += r.quantity;
    row.netSales[mIdx] += r.netSales;
    row.cogs[mIdx] += r.cogs;
    bumpStoreTotals(storeBucket, mIdx, r.netSales);
  }

  // ─── Bucket into blocks ───────────────────────────────────────────────

  type BucketAccumulator = {
    storeNumber: number | 'ALL';
    storeLabel: string;
    rows: PivotRow[];
  };
  const buckets: BucketAccumulator[] = params.combineStores
    ? [{ storeNumber: 'ALL', storeLabel: 'All Stores', rows: [] }]
    : stores.map((s) => ({ storeNumber: s.number, storeLabel: s.label, rows: [] }));

  const bucketIndex = new Map<number | 'ALL', BucketAccumulator>();
  for (const b of buckets) bucketIndex.set(b.storeNumber, b);

  for (const row of pivotMap.values()) {
    const b = bucketIndex.get(row.storeBucket);
    if (!b) continue;
    b.rows.push(row);
  }

  // Sort rows within each block.
  const sortRows = (rows: PivotRow[]): PivotRow[] => {
    const copy = [...rows];
    if (detailLevel === 'department') {
      copy.sort((a, b) => a.dimLabel.localeCompare(b.dimLabel, undefined, { sensitivity: 'base' }));
    } else if (detailLevel === 'sku') {
      copy.sort((a, b) => a.dimKey.localeCompare(b.dimKey));
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
    };

    const resultRows: SalesHistoryByMonthBlockRow[] = sortedRows.map((r) => {
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
        for (let i = 0; i < 12; i++) colTotals.quantitySold[i] += qty[i];
      }
      if (dataToPrint.includes('netSales')) {
        metrics.netSales = netSales;
        totals.netSales = round2(netSales.reduce((s, v) => s + v, 0));
        for (let i = 0; i < 12; i++) colTotals.netSales[i] += netSales[i];
      }
      if (dataToPrint.includes('profit')) {
        metrics.profit = profit;
        totals.profit = round2(profit.reduce((s, v) => s + v, 0));
        for (let i = 0; i < 12; i++) colTotals.profit[i] += profit[i];
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

      return { key: r.dimKey, label: r.dimLabel, metrics, totals };
    });

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
