/**
 * Sales History by Month (RICS v7.7 Ch. 6 p. 95) — live read-only adapter.
 *
 * v2: returns long-format rows with **all** numeric measures the facade may
 * need — quantity sold, net sales (extension) and COGS (cost) — in a single
 * OLEDB round-trip. The facade pivots once and derives % of Store, Profit,
 * and GP% in memory. The v1 "net-sales-only" path is preserved as a thin
 * projection for callers that only need the Net Sales metric.
 *
 * Ticket filter: TransType=1, Voided=False (regular sales + returns) — same
 * predicate used by every other sales-reporting adapter for consistency, so
 * numbers reconcile across reports.
 *
 * Criteria pre-filter: the adapter accepts a `criteria` object with
 * vendor/category/sku filters that it pushes into the TicketDetail SQL as
 * `IN (…)` clauses when they're expressible. Free-form criteria (seasons,
 * style/color, groups, keywords, wildcards, ranges, exclusions) are resolved
 * by pre-querying InventoryMaster for the matching SKU set; that SKU set is
 * either joined via `IN` on TicketDetail.SKU (when the set is small) or, for
 * large sets, is returned to the facade which post-filters. In practice the
 * facade always passes a resolved `skus` list when a non-simple facet is set.
 *
 * Detail granularity:
 *   - `sku`         — groups by (store, year, month, sku); uses Category/Vendor
 *                     already on TicketDetail for later rollup choices.
 *   - `subtotals`   — groups by (store, year, month, dim) where dim is vendor
 *                     or category (v1 behavior).
 *   - `department`  — groups the same way as `subtotals` but with Category as
 *                     the dim; the facade maps category→department after the
 *                     query returns.
 */

import fs from 'node:fs';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildSelectScript,
} from '../accessOleDb';

// ─────────────────────────── MDB path resolvers ───────────────────────────

function mdbPath(envKey: string, defaultFile: string): string {
  return ricsDbPath(process.env[envKey] || defaultFile);
}
const SALES_MDB  = (): string => mdbPath('RICS_SALES_DB_FILE',  'RITRNSSV.MDB');
const CATEG_MDB  = (): string => mdbPath('RICS_CATEG_DB_FILE',  'RICATEG.MDB');
const INVMAS_MDB = (): string => mdbPath('RICS_INVMAS_DB_FILE', 'RIINVMAS.MDB');
const INVHIS_MDB = (): string => mdbPath('RICS_INVHIS_DB_FILE', 'RIINVHIS.MDB');

// ─────────────────────────── public types ─────────────────────────────────

export type MonthlyDetailLevel = 'sku' | 'subtotals' | 'department';
export type MonthlyNetSalesSortBy = 'vendor' | 'category';

export interface MonthlyMeasuresRow {
  storeNumber: number;
  /** 'YYYY-MM' */
  yearMonth: string;
  /** Primary grouping key (vendor / category / sku depending on detailLevel). */
  dimKey: string;
  /** Human-facing label. */
  dimLabel: string;
  /** For `detailLevel='sku'` only — the parent category code (if known). */
  categoryKey: string | null;
  /** For `detailLevel='sku'` only — the parent vendor code (if known). */
  vendorKey: string | null;
  /** Units sold (net of returns — returns are negative Qty on TicketDetail). */
  quantity: number;
  /** Net Sales = SUM(Extension). */
  netSales: number;
  /** Cost-at-sale-time = SUM(Cost × Qty). Reconciles with Sales Analysis COGS. */
  cogs: number;
}

export interface QueryMonthlyMeasuresParams {
  storeNumbers: number[];
  /** 'YYYY-MM' inclusive */
  fromYearMonth: string;
  /** 'YYYY-MM' inclusive */
  toYearMonth: string;
  sortBy: MonthlyNetSalesSortBy;
  detailLevel: MonthlyDetailLevel;
  /** Optional narrow SKU list — pushed into SQL as `d.SKU IN (…)`. */
  skuFilter?: string[];
  /** Optional narrow vendor list — pushed into SQL as `d.Vendor IN (…)`. */
  vendorFilter?: string[];
  /** Optional narrow category list — pushed into SQL as `d.Category IN (…)`. */
  categoryFilter?: number[];
}

// Back-compat shim — some callers only need Net Sales and the v1 shape.
export interface MonthlyNetSalesRow {
  storeNumber: number;
  yearMonth: string;
  dimKey: string;
  dimLabel: string;
  netSales: number;
}

export interface QueryMonthlyNetSalesParams {
  storeNumbers: number[];
  fromYearMonth: string;
  toYearMonth: string;
  sortBy: MonthlyNetSalesSortBy;
}

// ─────────────────────────── validation helpers ───────────────────────────

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertYearMonth(ym: string, fieldName: string): void {
  if (!YEAR_MONTH_RE.test(ym)) {
    throw new Error(`${fieldName} must match YYYY-MM, got: ${ym}`);
  }
}

function firstDayOfMonth(yearMonth: string): string {
  assertYearMonth(yearMonth, 'yearMonth');
  return `${yearMonth}-01`;
}

function firstDayAfterMonth(yearMonth: string): string {
  assertYearMonth(yearMonth, 'yearMonth');
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
}

function accessDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${m}/${d}/${y}`;
}

function sqlStringList(values: string[]): string {
  return values
    .map((v) => `'${String(v).trim().replace(/'/g, "''")}'`)
    .join(',');
}

// ─────────────────────────── category label cache ─────────────────────────

interface CategoryRowRaw {
  Number: number | null;
  Desc: string | null;
}

let categoryLabelCache: Map<number, string> | null = null;
let categoryLabelCacheExpiry = 0;

async function loadCategoryLabels(): Promise<Map<number, string>> {
  const now = Date.now();
  if (categoryLabelCache && categoryLabelCacheExpiry > now) return categoryLabelCache;
  const dbPath = CATEG_MDB();
  if (!fs.existsSync(dbPath)) {
    categoryLabelCache = new Map();
    categoryLabelCacheExpiry = now + 60_000;
    return categoryLabelCache;
  }
  try {
    const rows = await queryAll<CategoryRowRaw>(dbPath, 'SELECT [Number], [Desc] FROM [Categories]');
    const map = new Map<number, string>();
    for (const r of rows) {
      if (r.Number == null) continue;
      const desc = r.Desc?.trim();
      map.set(Number(r.Number), desc ? `${Number(r.Number)} - ${desc}` : String(Number(r.Number)));
    }
    categoryLabelCache = map;
    categoryLabelCacheExpiry = now + 300_000;
    return map;
  } catch {
    categoryLabelCache = new Map();
    categoryLabelCacheExpiry = now + 60_000;
    return categoryLabelCache;
  }
}

export function clearCache(): void {
  categoryLabelCache = null;
  categoryLabelCacheExpiry = 0;
  skuMasterLookupCache = null;
  skuMasterLookupExpiry = 0;
}

// ─────────────────────────── SKU master lookup (for criteria resolution) ──

export interface SkuMasterRow {
  sku: string;
  vendor: string | null;
  category: number | null;
  season: string | null;
  styleColor: string | null;
  groupCode: string | null;
  keywords: string | null;
}

let skuMasterLookupCache: SkuMasterRow[] | null = null;
let skuMasterLookupExpiry = 0;

/**
 * Load the minimal SKU-master projection needed to evaluate seasons /
 * style-color / groups / keywords / wildcards / ranges / exclusions.
 *
 * Cached for 5 minutes — the master is read-only in Phase 1 and small enough
 * (single-digit MB for typical RICS installs) that keeping it in memory is
 * fine. The cache invalidates on `clearCache()`.
 */
export async function loadSkuMasterForCriteria(): Promise<SkuMasterRow[]> {
  const now = Date.now();
  if (skuMasterLookupCache && skuMasterLookupExpiry > now) return skuMasterLookupCache;
  const dbPath = INVMAS_MDB();
  if (!fs.existsSync(dbPath)) {
    skuMasterLookupCache = [];
    skuMasterLookupExpiry = now + 60_000;
    return skuMasterLookupCache;
  }
  try {
    const rows = await queryAll<{
      SKU: string | null;
      Vendor: string | null;
      Category: number | null;
      Season: string | null;
      StyleColor: string | null;
      GroupCode: string | null;
      KeyWords: string | null;
    }>(
      dbPath,
      'SELECT [SKU], [Vendor], [Category], [Season], [StyleColor], [GroupCode], [KeyWords] FROM [InventoryMaster] WHERE [Status] IS NULL OR [Status] <> \'D\'',
    );
    const parsed: SkuMasterRow[] = rows
      .filter((r) => !!r.SKU)
      .map((r) => ({
        sku: String(r.SKU!).trim(),
        vendor: r.Vendor?.trim() || null,
        category: r.Category != null ? Number(r.Category) : null,
        season: r.Season?.trim() || null,
        styleColor: r.StyleColor?.trim() || null,
        groupCode: r.GroupCode?.trim() || null,
        keywords: r.KeyWords?.trim() || null,
      }));
    skuMasterLookupCache = parsed;
    skuMasterLookupExpiry = now + 300_000;
    return parsed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ricsSalesHistoryByMonthAdapter] InventoryMaster projection failed: ${msg}`);
    skuMasterLookupCache = [];
    skuMasterLookupExpiry = now + 60_000;
    return skuMasterLookupCache;
  }
}

// ─────────────────────────── raw row shape ────────────────────────────────

interface RawMonthlyRow {
  StoreNumber: number | null;
  Y: number | null;
  M: number | null;
  DimKey: string | null;
  Vendor: string | null;
  Category: number | null;
  Qty: number | null;
  NetSales: number | null;
  CostTotal: number | null;
}

// ─────────────────────────── main entry point ─────────────────────────────

/**
 * Fetch all numeric measures for the 12-month window in one OLEDB round-trip.
 *
 * Group key is (StoreNumber, Year, Month, dim) where `dim` depends on
 * `detailLevel`:
 *   - 'sku'        → d.SKU
 *   - 'subtotals'  → d.Vendor or d.Category (per `sortBy`)
 *   - 'department' → d.Category (facade maps to department)
 *
 * For the SKU detail we also emit Vendor and Category alongside so the
 * facade can roll up later without a second query.
 */
export async function queryMonthlyMeasures(
  params: QueryMonthlyMeasuresParams,
): Promise<MonthlyMeasuresRow[]> {
  assertYearMonth(params.fromYearMonth, 'fromYearMonth');
  assertYearMonth(params.toYearMonth, 'toYearMonth');
  if (params.fromYearMonth > params.toYearMonth) {
    throw new Error('fromYearMonth must be <= toYearMonth');
  }
  if (!params.storeNumbers.length) {
    throw new Error('storeNumbers must have at least one entry');
  }
  if (params.sortBy !== 'vendor' && params.sortBy !== 'category') {
    throw new Error(`sortBy must be 'vendor' or 'category', got: ${params.sortBy}`);
  }

  const startIso = firstDayOfMonth(params.fromYearMonth);
  const endExclusiveIso = firstDayAfterMonth(params.toYearMonth);
  const storeList = params.storeNumbers.map((n) => Number(n)).join(',');

  // Pick the grouping dim. For 'sku' we group by SKU; otherwise by vendor or category.
  let dimExpr: string;
  if (params.detailLevel === 'sku') {
    dimExpr = `IIF(d.SKU IS NULL, '(none)', d.SKU)`;
  } else if (params.detailLevel === 'department') {
    // Department rolls categories up at the facade layer — still group by category here.
    dimExpr = `IIF(d.Category IS NULL, 0, d.Category)`;
  } else {
    dimExpr =
      params.sortBy === 'vendor'
        ? `IIF(d.Vendor IS NULL, '(none)', d.Vendor)`
        : `IIF(d.Category IS NULL, 0, d.Category)`;
  }

  // Optional criteria pushdowns. The facade resolves complex facets (seasons,
  // style/color, groups, keywords, wildcards) into an `skuFilter` list.
  const wheres: string[] = [
    `h.RealDate >= #${accessDate(startIso)}#`,
    `h.RealDate < #${accessDate(endExclusiveIso)}#`,
    `h.TransType = 1`,
    `h.Voided = False`,
    `h.Store IN (${storeList})`,
  ];
  if (params.skuFilter && params.skuFilter.length > 0) {
    // Access has a ~1000-entry cap on IN; if we go over that, chunk the query.
    // For v2 we cap the chunk at 500 SKUs and OR the chunks together inside
    // the WHERE. In practice most criteria sets are small enough to fit.
    const chunks = chunkArray(params.skuFilter, 500);
    const orParts = chunks.map((c) => `d.SKU IN (${sqlStringList(c)})`);
    wheres.push(`(${orParts.join(' OR ')})`);
  }
  if (params.vendorFilter && params.vendorFilter.length > 0) {
    wheres.push(`d.Vendor IN (${sqlStringList(params.vendorFilter)})`);
  }
  if (params.categoryFilter && params.categoryFilter.length > 0) {
    wheres.push(`d.Category IN (${params.categoryFilter.map((c) => Number(c)).join(',')})`);
  }

  const sql = `SELECT
  h.Store AS StoreNumber,
  Year(h.RealDate) AS Y,
  Month(h.RealDate) AS M,
  ${dimExpr} AS DimKey,
  IIF(d.Vendor IS NULL, '(none)', d.Vendor) AS Vendor,
  IIF(d.Category IS NULL, 0, d.Category) AS Category,
  SUM(IIF(d.Qty IS NULL, 0, d.Qty)) AS Qty,
  SUM(d.Extension) AS NetSales,
  SUM(IIF(d.Cost IS NULL, 0, d.Cost) * IIF(d.Qty IS NULL, 0, d.Qty)) AS CostTotal
FROM TicketHeader h INNER JOIN TicketDetail d
  ON h.UserID = d.UserID AND h.BatchDate = d.BatchDate AND h.Terminal = d.Terminal
 AND h.Store = d.Store AND h.Ticket = d.Ticket AND h.RealDate = d.RealDate
WHERE
  ${wheres.join(' AND ')}
GROUP BY h.Store, Year(h.RealDate), Month(h.RealDate), ${dimExpr},
  IIF(d.Vendor IS NULL, '(none)', d.Vendor),
  IIF(d.Category IS NULL, 0, d.Category)`;

  const raw = await queryAll<RawMonthlyRow>(SALES_MDB(), sql);

  const categoryLabels =
    params.sortBy === 'category' || params.detailLevel === 'department'
      ? await loadCategoryLabels()
      : null;

  const rows: MonthlyMeasuresRow[] = [];
  for (const r of raw) {
    if (r.StoreNumber == null || r.Y == null || r.M == null) continue;
    const yearMonth = `${String(Number(r.Y)).padStart(4, '0')}-${String(Number(r.M)).padStart(2, '0')}`;

    let dimKey: string;
    let dimLabel: string;
    if (params.detailLevel === 'sku') {
      const s = r.DimKey == null ? '(none)' : String(r.DimKey).trim() || '(none)';
      dimKey = s;
      dimLabel = s;
    } else if (params.detailLevel === 'department') {
      const n = r.DimKey == null ? 0 : Number(r.DimKey);
      dimKey = String(n);
      dimLabel = categoryLabels?.get(n) ?? String(n);
    } else if (params.sortBy === 'vendor') {
      const v = r.DimKey == null ? '(none)' : String(r.DimKey).trim() || '(none)';
      dimKey = v;
      dimLabel = v;
    } else {
      const n = r.DimKey == null ? 0 : Number(r.DimKey);
      dimKey = String(n);
      dimLabel = categoryLabels?.get(n) ?? String(n);
    }

    rows.push({
      storeNumber: Number(r.StoreNumber),
      yearMonth,
      dimKey,
      dimLabel,
      categoryKey: r.Category == null ? null : String(Number(r.Category)),
      vendorKey: r.Vendor == null ? null : String(r.Vendor).trim() || null,
      quantity: Number(r.Qty ?? 0),
      netSales: Number(r.NetSales ?? 0),
      cogs: Number(r.CostTotal ?? 0),
    });
  }
  return rows;
}

/**
 * v1 entry point — retained for Net-Sales-only callers and for tests that
 * mock this export. Internally forwards to `queryMonthlyMeasures` at the
 * `subtotals` detail level and projects down to the net-sales shape.
 */
export async function queryMonthlyNetSales(
  params: QueryMonthlyNetSalesParams,
): Promise<MonthlyNetSalesRow[]> {
  const rich = await queryMonthlyMeasures({
    storeNumbers: params.storeNumbers,
    fromYearMonth: params.fromYearMonth,
    toYearMonth: params.toYearMonth,
    sortBy: params.sortBy,
    detailLevel: 'subtotals',
  });
  // Collapse across (category, vendor) extras the richer query emits.
  const collapsed = new Map<string, MonthlyNetSalesRow>();
  for (const r of rich) {
    const key = `${r.storeNumber}|${r.yearMonth}|${r.dimKey}`;
    const existing = collapsed.get(key);
    if (existing) {
      existing.netSales += r.netSales;
    } else {
      collapsed.set(key, {
        storeNumber: r.storeNumber,
        yearMonth: r.yearMonth,
        dimKey: r.dimKey,
        dimLabel: r.dimLabel,
        netSales: r.netSales,
      });
    }
  }
  return [...collapsed.values()];
}

// ─────────────────────────── Monthly inventory history (RIINVHIS) ─────────
//
// RIINVHIS.MDB contains one row per (SKU, Store) in the `InvHis` table.
// Each row carries RICS's rolling 12-month trailing inventory history:
//
//   - `LYMonthQtyOH_01` … `LYMonthQtyOH_12`   — units on hand at month-end,
//                                               indexed by **calendar month**
//                                               (NN=01 → January, NN=12 →
//                                               December). These are rolling:
//                                               at any given time the 12 slots
//                                               hold the trailing 12 months of
//                                               snapshots, with the current
//                                               month's slot still pointing at
//                                               last year. RICS advances the
//                                               array on month-end close.
//   - `LYMonthOnHand_01` … `LYMonthOnHand_12` — same, expressed in dollars
//                                               (qty × average cost as of the
//                                               month-end snapshot). Verified
//                                               empirically on a known SKU:
//                                               LYMonthOnHand_NN equals
//                                               LYMonthQtyOH_NN × AverageCost.
//   - `AverageCost`                            — current per-SKU-per-Store
//                                               average cost (Currency). Fed
//                                               by receipts + physical
//                                               inventory events; present on
//                                               99.99% of rows in a sample
//                                               customer DB (1,918,274 of
//                                               1,918,492).
//   - `OnHand`, `LastMonthOnHand`              — current-month scalar snapshots
//                                               used as the "end boundary"
//                                               when computing the 13-value
//                                               average inventory series.
//
// Sibling `LYMonthDolSales_NN` / `LYMonthQtySales_NN` rows were cross-checked
// against `RITRNSSV.TicketDetail` for Store 16: e.g.,
// `LYMonthDolSales_04 = 882,775.83` matches `SUM(Extension)` for
// April 2025 **exactly** — proving that NN is a calendar-month index (not an
// ordinal/relative offset) AND that the rolling window is anchored to the
// most recent month-end close.
//
// The discovery pass that produced this mapping lives in
// `apps/api/scripts/discover-invhis.ts` and
// `apps/api/scripts/probe-invhis-alignment.ts`.

export interface MonthlyInventoryHistoryRow {
  storeNumber: number;
  sku: string;
  averageCost: number;
  /** Current on-hand qty (end of the most recent closed month). */
  onHand: number;
  /** Per-calendar-month snapshots, index 0 = Jan (NN=01), index 11 = Dec (NN=12). */
  monthQtyOH: number[];
  /** Per-calendar-month on-hand value in dollars (qty × cost at snapshot time). */
  monthValueOH: number[];
}

export interface QueryMonthlyInventoryHistoryParams {
  storeNumbers: number[];
  /** Restrict to these SKUs (chunked at 500 per OR-clause to dodge Access's IN cap). */
  skuFilter?: string[];
  /** Restrict to rows with at least some historical activity. Skips the
   *  enormous tail of zero-on-hand SKU-store pairs that bloats the scan. */
  nonZeroOnly?: boolean;
}

interface RawInvHisRow {
  SKU: string | null;
  Store: number | null;
  AverageCost: number | null;
  OnHand: number | null;
  LYMonthQtyOH_01: number | null;  LYMonthQtyOH_02: number | null;
  LYMonthQtyOH_03: number | null;  LYMonthQtyOH_04: number | null;
  LYMonthQtyOH_05: number | null;  LYMonthQtyOH_06: number | null;
  LYMonthQtyOH_07: number | null;  LYMonthQtyOH_08: number | null;
  LYMonthQtyOH_09: number | null;  LYMonthQtyOH_10: number | null;
  LYMonthQtyOH_11: number | null;  LYMonthQtyOH_12: number | null;
  LYMonthOnHand_01: number | null; LYMonthOnHand_02: number | null;
  LYMonthOnHand_03: number | null; LYMonthOnHand_04: number | null;
  LYMonthOnHand_05: number | null; LYMonthOnHand_06: number | null;
  LYMonthOnHand_07: number | null; LYMonthOnHand_08: number | null;
  LYMonthOnHand_09: number | null; LYMonthOnHand_10: number | null;
  LYMonthOnHand_11: number | null; LYMonthOnHand_12: number | null;
}

const INVHIS_SELECT_COLUMNS =
  '[SKU],[Store],[AverageCost],[OnHand],' +
  '[LYMonthQtyOH_01],[LYMonthQtyOH_02],[LYMonthQtyOH_03],[LYMonthQtyOH_04],' +
  '[LYMonthQtyOH_05],[LYMonthQtyOH_06],[LYMonthQtyOH_07],[LYMonthQtyOH_08],' +
  '[LYMonthQtyOH_09],[LYMonthQtyOH_10],[LYMonthQtyOH_11],[LYMonthQtyOH_12],' +
  '[LYMonthOnHand_01],[LYMonthOnHand_02],[LYMonthOnHand_03],[LYMonthOnHand_04],' +
  '[LYMonthOnHand_05],[LYMonthOnHand_06],[LYMonthOnHand_07],[LYMonthOnHand_08],' +
  '[LYMonthOnHand_09],[LYMonthOnHand_10],[LYMonthOnHand_11],[LYMonthOnHand_12]';

/**
 * Pull the 12-slot calendar-month inventory-history snapshots from
 * `RIINVHIS.InvHis` for the given stores and (optionally) SKUs.
 *
 * Phase 1 read-only. No joins — this function returns the raw (store, sku)
 * rows with their LY* column vectors intact; the facade is responsible for
 * mapping calendar-month NN → the 12-month report window and for rolling up
 * to vendor / category / department.
 *
 * If `skuFilter` is omitted, the scan returns every SKU that has at least
 * **some** historical activity (non-zero OnHand, LY*, or AverageCost). On a
 * 1.9M-row customer DB this still yields ~225k rows; callers that want
 * subtotal or department rollups should prefer to pre-resolve the SKU set
 * via `loadSkuMasterForCriteria` + criteria push-down so the query stays
 * under Access's IN-clause limits and under a reasonable wall-clock.
 */
export async function queryMonthlyInventoryHistory(
  params: QueryMonthlyInventoryHistoryParams,
): Promise<MonthlyInventoryHistoryRow[]> {
  if (!params.storeNumbers || params.storeNumbers.length === 0) {
    throw new Error('storeNumbers must have at least one entry');
  }

  const storeList = params.storeNumbers.map((n) => Number(n)).join(',');
  const wheres: string[] = [`[Store] IN (${storeList})`];

  if (params.skuFilter && params.skuFilter.length > 0) {
    const chunks = chunkArray(params.skuFilter, 500);
    const orParts = chunks.map((c) => `[SKU] IN (${sqlStringList(c)})`);
    wheres.push(`(${orParts.join(' OR ')})`);
  } else if (params.nonZeroOnly !== false) {
    // Skip the long tail of all-zero (store, sku) pairs that bloat the scan.
    // Any row with either a current on-hand or any LY snapshot or a cost
    // counts as historically meaningful.
    wheres.push(
      '(' +
        '[OnHand] <> 0 OR [AverageCost] > 0 OR ' +
        '[LYMonthQtyOH_01] <> 0 OR [LYMonthQtyOH_02] <> 0 OR [LYMonthQtyOH_03] <> 0 OR ' +
        '[LYMonthQtyOH_04] <> 0 OR [LYMonthQtyOH_05] <> 0 OR [LYMonthQtyOH_06] <> 0 OR ' +
        '[LYMonthQtyOH_07] <> 0 OR [LYMonthQtyOH_08] <> 0 OR [LYMonthQtyOH_09] <> 0 OR ' +
        '[LYMonthQtyOH_10] <> 0 OR [LYMonthQtyOH_11] <> 0 OR [LYMonthQtyOH_12] <> 0' +
      ')',
    );
  }

  const sql =
    `SELECT ${INVHIS_SELECT_COLUMNS} FROM [InvHis] WHERE ${wheres.join(' AND ')}`;

  const raw = await queryAll<RawInvHisRow>(INVHIS_MDB(), sql);
  const rows: MonthlyInventoryHistoryRow[] = [];
  for (const r of raw) {
    if (r.SKU == null || r.Store == null) continue;
    const monthQty: number[] = [
      Number(r.LYMonthQtyOH_01 ?? 0), Number(r.LYMonthQtyOH_02 ?? 0),
      Number(r.LYMonthQtyOH_03 ?? 0), Number(r.LYMonthQtyOH_04 ?? 0),
      Number(r.LYMonthQtyOH_05 ?? 0), Number(r.LYMonthQtyOH_06 ?? 0),
      Number(r.LYMonthQtyOH_07 ?? 0), Number(r.LYMonthQtyOH_08 ?? 0),
      Number(r.LYMonthQtyOH_09 ?? 0), Number(r.LYMonthQtyOH_10 ?? 0),
      Number(r.LYMonthQtyOH_11 ?? 0), Number(r.LYMonthQtyOH_12 ?? 0),
    ];
    const monthValue: number[] = [
      Number(r.LYMonthOnHand_01 ?? 0), Number(r.LYMonthOnHand_02 ?? 0),
      Number(r.LYMonthOnHand_03 ?? 0), Number(r.LYMonthOnHand_04 ?? 0),
      Number(r.LYMonthOnHand_05 ?? 0), Number(r.LYMonthOnHand_06 ?? 0),
      Number(r.LYMonthOnHand_07 ?? 0), Number(r.LYMonthOnHand_08 ?? 0),
      Number(r.LYMonthOnHand_09 ?? 0), Number(r.LYMonthOnHand_10 ?? 0),
      Number(r.LYMonthOnHand_11 ?? 0), Number(r.LYMonthOnHand_12 ?? 0),
    ];
    rows.push({
      storeNumber: Number(r.Store),
      sku: String(r.SKU).trim(),
      averageCost: Number(r.AverageCost ?? 0),
      onHand: Number(r.OnHand ?? 0),
      monthQtyOH: monthQty,
      monthValueOH: monthValue,
    });
  }
  return rows;
}

// ─────────────────────────── internals ────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function queryAll<T>(dbPath: string, sql: string): Promise<T[]> {
  if (!fs.existsSync(dbPath)) {
    console.warn(`[ricsSalesHistoryByMonthAdapter] MDB not found at ${dbPath}`);
    return [];
  }
  const password = getOrRecoverPassword(dbPath);
  try {
    const raw = await runPowerShellJson<T | T[]>(buildSelectScript(dbPath, password, sql));
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ricsSalesHistoryByMonthAdapter] query failed on ${dbPath}:`, msg);
    return [];
  }
}
