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

function loadCategoryLabels(): Map<number, string> {
  const now = Date.now();
  if (categoryLabelCache && categoryLabelCacheExpiry > now) return categoryLabelCache;
  const dbPath = CATEG_MDB();
  if (!fs.existsSync(dbPath)) {
    categoryLabelCache = new Map();
    categoryLabelCacheExpiry = now + 60_000;
    return categoryLabelCache;
  }
  try {
    const rows = queryAll<CategoryRowRaw>(dbPath, 'SELECT [Number], [Desc] FROM [Categories]');
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
    const rows = queryAll<{
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

  const raw = queryAll<RawMonthlyRow>(SALES_MDB(), sql);

  const categoryLabels =
    params.sortBy === 'category' || params.detailLevel === 'department'
      ? loadCategoryLabels()
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

// ─────────────────────────── internals ────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function queryAll<T>(dbPath: string, sql: string): T[] {
  if (!fs.existsSync(dbPath)) {
    console.warn(`[ricsSalesHistoryByMonthAdapter] MDB not found at ${dbPath}`);
    return [];
  }
  const password = getOrRecoverPassword(dbPath);
  try {
    const raw = runPowerShellJson<T | T[]>(buildSelectScript(dbPath, password, sql));
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ricsSalesHistoryByMonthAdapter] query failed on ${dbPath}:`, msg);
    return [];
  }
}
