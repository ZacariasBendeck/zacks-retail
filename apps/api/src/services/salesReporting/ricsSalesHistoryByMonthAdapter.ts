/**
 * Sales History by Month (RICS v7.7 Ch. 6 p. 95) - InvHis-backed adapter.
 *
 * v2: returns long-format rows with **all** numeric measures the facade may
 * need — quantity sold, net sales (extension) and COGS (cost) — in a single
 * Postgres query. The facade pivots once and derives % of Store, Profit,
 * and GP% in memory. The v1 "net-sales-only" path is preserved as a thin
 * projection for callers that only need the Net Sales metric.
 *
 * Source: app.inventory_history_month for closed months plus the current
 * app.inventory_history_snapshot.month_* counters for the in-progress month.
 *
 * Criteria pre-filter: the adapter accepts a `criteria` object with
 * vendor/category/sku filters that it pushes into the InvHis SQL as
 * `IN (…)` clauses when they're expressible. Free-form criteria (seasons,
 * style/color, groups, keywords, wildcards, ranges, exclusions) are resolved
 * by pre-querying app.sku for the matching SKU set; that SKU set is pushed
 * into the monthly history query. In practice the
 * facade always passes a resolved `skus` list when a non-simple facet is set.
 *
 * Detail granularity:
 *   - `sku`         — groups by (store, year, month, sku); uses Category/Vendor
 *                     resolved from app.sku for later rollup choices.
 *   - `subtotals`   — groups by (store, year, month, dim) where dim is vendor
 *                     or category (v1 behavior).
 *   - `department`  — groups the same way as `subtotals` but with Category as
 *                     the dim; the facade maps category→department after the
 *                     query returns.
 */

import { prisma } from '../../db/prisma';

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
  /** For `detailLevel='sku'` only — the SKU image filename from app.sku. */
  pictureFileName?: string | null;
  /** Units sold from InvHis monthly counters. */
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
  combineStores?: boolean;
  /** Optional narrow SKU list — pushed into SQL as `d.SKU IN (…)`. */
  skuFilter?: string[];
  /** Optional narrow vendor list — pushed into SQL as `d.Vendor IN (…)`. */
  vendorFilter?: string[];
  /** Optional narrow category list — pushed into SQL as `d.Category IN (…)`. */
  categoryFilter?: number[];
}

export interface QueryPriorYearTicketMeasuresParams extends QueryMonthlyMeasuresParams {}

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
  try {
    const rows = await prisma.$queryRawUnsafe<CategoryRowRaw[]>(
      `SELECT number AS "Number", "desc" AS "Desc" FROM app.taxonomy_category`,
    );
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
  try {
    const rows = await prisma.$queryRawUnsafe<{
      SKU: string | null;
      Vendor: string | null;
      Category: number | null;
      Season: string | null;
      StyleColor: string | null;
      GroupCode: string | null;
      KeyWords: string | null;
    }[]>(
      `SELECT code AS "SKU",
              vendor_id AS "Vendor",
              category_number AS "Category",
              season AS "Season",
              style_color AS "StyleColor",
              group_code AS "GroupCode",
              keywords AS "KeyWords"
         FROM app.sku
        WHERE code IS NOT NULL
          AND BTRIM(code) <> ''
          AND COALESCE(sku_state, 'ACTIVE') <> 'DRAFT'
          AND COALESCE(rics_status, '') <> 'D'`,
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
    console.warn(`[ricsSalesHistoryByMonthAdapter] SKU master projection failed: ${msg}`);
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
  PictureFileName: string | null;
  Qty: number | null;
  NetSales: number | null;
  CostTotal: number | null;
}

// ─────────────────────────── main entry point ─────────────────────────────

/**
 * Fetch all numeric measures for the 12-month window from InvHis-derived
 * Postgres tables.
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
  if (params.skuFilter && params.skuFilter.length === 0) {
    return [];
  }

  const startIso = params.fromYearMonth;
  const endExclusiveIso = params.toYearMonth;
  const storeExpr = params.combineStores ? `0` : `src.store_id`;

  // Pick the grouping dim. The CTE normalizes SKU/vendor/category once so
  // grouping and filter expressions stay compact.
  let dimExpr: string;
  if (params.detailLevel === 'sku') {
    dimExpr = `src.sku`;
  } else if (params.detailLevel === 'department') {
    dimExpr = `src.category`;
  } else {
    dimExpr =
      params.sortBy === 'vendor'
        ? `src.vendor`
        : `src.category`;
  }

  // Parameterize values; keep identifiers as literals.
  const sqlParams: unknown[] = [
    startIso,
    endExclusiveIso,
    params.storeNumbers.map((n) => Number(n)),
  ];
  const wheres: string[] = [
    `src.year_month >= $1::text`,
    `src.year_month <= $2::text`,
    `src.store_id = ANY($3::int[])`,
    `(src.qty_sales <> 0 OR src.net_sales <> 0 OR src.profit <> 0)`,
  ];
  if (params.skuFilter && params.skuFilter.length > 0) {
    sqlParams.push(params.skuFilter.map((s) => s.trim().toUpperCase()).filter(Boolean));
    wheres.push(`UPPER(src.sku) = ANY($${sqlParams.length}::text[])`);
  }
  if (params.vendorFilter && params.vendorFilter.length > 0) {
    sqlParams.push(params.vendorFilter.map((s) => s.trim().toUpperCase()).filter(Boolean));
    wheres.push(`UPPER(src.vendor) = ANY($${sqlParams.length}::text[])`);
  }
  if (params.categoryFilter && params.categoryFilter.length > 0) {
    sqlParams.push(params.categoryFilter.map((c) => Number(c)));
    wheres.push(`src.category = ANY($${sqlParams.length}::int[])`);
  }

  const sql = `
WITH src AS (
  SELECT
    s.store_id,
    UPPER(BTRIM(s.sku_code)) AS sku,
    COALESCE(NULLIF(BTRIM(k.vendor_id), ''), '(none)') AS vendor,
    COALESCE(k.category_number, 0) AS category,
    NULLIF(BTRIM(k.picture_file_name), '') AS picture_file_name,
    m.year_month,
    COALESCE(m.qty_sales, 0)::float8 AS qty_sales,
    COALESCE(m.net_sales, 0)::float8 AS net_sales,
    COALESCE(m.profit, 0)::float8 AS profit
  FROM app.inventory_history_snapshot s
  INNER JOIN app.inventory_history_month m
    ON m.snapshot_id = s.id
  LEFT JOIN app.sku k
    ON k.id = s.sku_id
  WHERE m.year_month >= $1::text
    AND m.year_month <= $2::text
    AND s.store_id = ANY($3::int[])
    AND (
      m.qty_sales <> 0 OR
      COALESCE(m.net_sales, 0) <> 0 OR
      COALESCE(m.profit, 0) <> 0
    )

  UNION ALL

  SELECT
    s.store_id,
    UPPER(BTRIM(s.sku_code)) AS sku,
    COALESCE(NULLIF(BTRIM(k.vendor_id), ''), '(none)') AS vendor,
    COALESCE(k.category_number, 0) AS category,
    NULLIF(BTRIM(k.picture_file_name), '') AS picture_file_name,
    to_char(s.snapshot_as_of, 'YYYY-MM') AS year_month,
    COALESCE(s.month_qty_sales, 0)::float8 AS qty_sales,
    COALESCE(s.month_dol_sales, 0)::float8 AS net_sales,
    COALESCE(s.month_profit, 0)::float8 AS profit
  FROM app.inventory_history_snapshot s
  LEFT JOIN app.sku k
    ON k.id = s.sku_id
  WHERE (
      COALESCE(s.month_qty_sales, 0) <> 0 OR
      COALESCE(s.month_dol_sales, 0) <> 0 OR
      COALESCE(s.month_profit, 0) <> 0
    )
    AND to_char(s.snapshot_as_of, 'YYYY-MM') >= $1::text
    AND to_char(s.snapshot_as_of, 'YYYY-MM') <= $2::text
    AND s.store_id = ANY($3::int[])
)
SELECT
  ${storeExpr} AS "StoreNumber",
  substring(src.year_month from 1 for 4)::int AS "Y",
  substring(src.year_month from 6 for 2)::int AS "M",
  ${dimExpr} AS "DimKey",
  MIN(src.vendor) AS "Vendor",
  MIN(src.category) AS "Category",
  MIN(src.picture_file_name) AS "PictureFileName",
  SUM(src.qty_sales)::int AS "Qty",
  SUM(src.net_sales)::float8 AS "NetSales",
  SUM(src.net_sales - src.profit)::float8 AS "CostTotal"
FROM src
WHERE
  ${wheres.join(' AND ')}
GROUP BY 1, 2, 3, 4`;

  const [, raw] = await prisma.$transaction([
    prisma.$executeRawUnsafe(`SET LOCAL max_parallel_workers_per_gather = 0`),
    prisma.$queryRawUnsafe<RawMonthlyRow[]>(sql, ...sqlParams),
  ]);

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
      pictureFileName: r.PictureFileName?.trim() || null,
      quantity: Number(r.Qty ?? 0),
      netSales: Number(r.NetSales ?? 0),
      cogs: Number(r.CostTotal ?? 0),
    });
  }
  return rows;
}

/**
 * Ticket-backed companion for Sales History by Month prior-year comparisons.
 *
 * `app.inventory_history_month` only holds RICS's rolling closed 12-month
 * window. Prior-year comparison months outside that window come from the
 * normalized ticket history tables imported from RICS tickets.
 */
export async function queryPriorYearTicketMeasures(
  params: QueryPriorYearTicketMeasuresParams,
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
  if (params.skuFilter && params.skuFilter.length === 0) {
    return [];
  }

  const storeExpr = params.combineStores ? `0` : `src.store_id`;
  let dimExpr: string;
  if (params.detailLevel === 'sku') {
    dimExpr = `src.sku`;
  } else if (params.detailLevel === 'department') {
    dimExpr = `src.category`;
  } else {
    dimExpr = params.sortBy === 'vendor' ? `src.vendor` : `src.category`;
  }

  const sqlParams: unknown[] = [
    params.fromYearMonth,
    params.toYearMonth,
    params.storeNumbers.map((n) => Number(n)),
  ];
  const wheres: string[] = [
    `src.year_month >= $1::text`,
    `src.year_month <= $2::text`,
    `src.store_id = ANY($3::int[])`,
    `(src.qty_sales <> 0 OR src.net_sales <> 0 OR src.cost_total <> 0)`,
  ];
  if (params.skuFilter && params.skuFilter.length > 0) {
    sqlParams.push(params.skuFilter.map((s) => s.trim().toUpperCase()).filter(Boolean));
    wheres.push(`UPPER(src.sku) = ANY($${sqlParams.length}::text[])`);
  }
  if (params.vendorFilter && params.vendorFilter.length > 0) {
    sqlParams.push(params.vendorFilter.map((s) => s.trim().toUpperCase()).filter(Boolean));
    wheres.push(`UPPER(src.vendor) = ANY($${sqlParams.length}::text[])`);
  }
  if (params.categoryFilter && params.categoryFilter.length > 0) {
    sqlParams.push(params.categoryFilter.map((c) => Number(c)));
    wheres.push(`src.category = ANY($${sqlParams.length}::int[])`);
  }

  const sql = `
WITH src AS (
  SELECT
    t.store_id,
    UPPER(BTRIM(COALESCE(NULLIF(l.sku_code, ''), k.code, ''))) AS sku,
    COALESCE(NULLIF(BTRIM(k.vendor_id), ''), '(none)') AS vendor,
    COALESCE(
      k.category_number,
      NULLIF(regexp_replace(COALESCE(l.category_key, ''), '\\D', '', 'g'), '')::int,
      0
    ) AS category,
    NULLIF(BTRIM(k.picture_file_name), '') AS picture_file_name,
    to_char(t.purchased_at AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM') AS year_month,
    COALESCE(l.quantity, 0)::float8 AS qty_sales,
    COALESCE(l.net_amount, 0)::float8 AS net_sales,
    COALESCE(l.cost_amount, 0)::float8 AS cost_total
  FROM app.sales_history_ticket t
  INNER JOIN app.sales_history_ticket_line l
    ON l.ticket_id = t.id
  LEFT JOIN app.sku k
    ON k.id = l.sku_id
  WHERE t.purchased_at >= (($1::text || '-01')::date::timestamp AT TIME ZONE 'America/Tegucigalpa')
    AND t.purchased_at < ((($2::text || '-01')::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'America/Tegucigalpa')
    AND t.store_id = ANY($3::int[])
    AND LOWER(COALESCE(t.status, '')) = 'completed'
)
SELECT
  ${storeExpr} AS "StoreNumber",
  substring(src.year_month from 1 for 4)::int AS "Y",
  substring(src.year_month from 6 for 2)::int AS "M",
  ${dimExpr} AS "DimKey",
  MIN(src.vendor) AS "Vendor",
  MIN(src.category) AS "Category",
  MIN(src.picture_file_name) AS "PictureFileName",
  SUM(src.qty_sales)::int AS "Qty",
  SUM(src.net_sales)::float8 AS "NetSales",
  SUM(src.cost_total)::float8 AS "CostTotal"
FROM src
WHERE
  ${wheres.join(' AND ')}
GROUP BY 1, 2, 3, 4`;

  const raw = await prisma.$queryRawUnsafe<RawMonthlyRow[]>(sql, ...sqlParams);
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
      pictureFileName: r.PictureFileName?.trim() || null,
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
// `apps/api/scripts/rics/discovery/discover-invhis.ts` and
// `apps/api/scripts/rics/probes/probe-invhis-alignment.ts`.

export interface MonthlyInventoryHistoryRow {
  storeNumber: number;
  sku: string;
  averageCost: number;
  /** Import snapshot timestamp used to map rolling month slots to concrete year-months. */
  snapshotAsOf?: Date | string;
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

export interface MonthlyInventoryHistoryRollupRow {
  storeNumber: number;
  dimKey: string;
  snapshotAsOf?: Date | string;
  monthQtyOH: number[];
  monthValueOH: number[];
}

export interface QueryMonthlyInventoryHistoryRollupParams extends QueryMonthlyInventoryHistoryParams {
  sortBy: MonthlyNetSalesSortBy;
  detailLevel: MonthlyDetailLevel;
  combineStores?: boolean;
  vendorFilter?: string[];
  categoryFilter?: number[];
}

interface RawInventoryHistoryRow {
  SKU: string | null;
  Store: number | null;
  AverageCost: number | null;
  SnapshotAsOf: Date | string | null;
  OnHand: number | null;
  SlotNumber: number | null;
  QtyOnHand: number | null;
  InventoryValue: number | null;
}

/**
 * Pull the 12-slot calendar-month inventory-history snapshots from the owned
 * Postgres replacement for `RIINVHIS.InvHis`.
 *
 * Returns one row per `(store, sku)` with the month-end on-hand vectors already
 * pivoted back into the legacy Jan..Dec slot arrays so the facade contract
 * does not change.
 *
 * If `skuFilter` is omitted, the scan returns every SKU that has at least
 * **some** historical activity (non-zero OnHand, month-end qty, or
 * AverageCost). Callers that want subtotal or department rollups should
 * prefer to pre-resolve the SKU set via `loadSkuMasterForCriteria`.
 */
export async function queryMonthlyInventoryHistory(
  params: QueryMonthlyInventoryHistoryParams,
): Promise<MonthlyInventoryHistoryRow[]> {
  if (!params.storeNumbers || params.storeNumbers.length === 0) {
    throw new Error('storeNumbers must have at least one entry');
  }
  if (params.skuFilter && params.skuFilter.length === 0) {
    return [];
  }

  const sqlParams: unknown[] = [params.storeNumbers.map((n) => Number(n))];
  const wheres: string[] = [`s.store_id = ANY($1::int[])`];

  if (params.skuFilter && params.skuFilter.length > 0) {
    const pairs = new Set<string>();
    for (const s of params.skuFilter) {
      pairs.add(s.trim());
    }
    sqlParams.push([...pairs]);
    wheres.push(`s.sku_code = ANY($${sqlParams.length}::text[])`);
  } else if (params.nonZeroOnly !== false) {
    wheres.push(`(
      EXISTS (
        SELECT 1
        FROM app.inventory_history_month m2
        WHERE m2.snapshot_id = s.id
          AND (m2.qty_on_hand <> 0 OR COALESCE(m2.inventory_value, 0) <> 0)
      )
    )`);
  }

  const sql = `
    SELECT
      s.sku_code AS "SKU",
      s.store_id AS "Store",
      s.average_cost::float8 AS "AverageCost",
      s.snapshot_as_of AS "SnapshotAsOf",
      s.on_hand AS "OnHand",
      m.slot_number AS "SlotNumber",
      m.qty_on_hand AS "QtyOnHand",
      m.inventory_value::float8 AS "InventoryValue"
    FROM app.inventory_history_snapshot s
    LEFT JOIN app.inventory_history_month m
      ON m.snapshot_id = s.id
    WHERE ${wheres.join(' AND ')}
  `;

  const raw = await prisma.$queryRawUnsafe<RawInventoryHistoryRow[]>(sql, ...sqlParams);
  const rows = new Map<string, MonthlyInventoryHistoryRow>();
  for (const r of raw) {
    if (r.SKU == null || r.Store == null) continue;
    const sku = String(r.SKU).trim();
    const key = `${Number(r.Store)}|${sku}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        storeNumber: Number(r.Store),
        sku,
        averageCost: Number(r.AverageCost ?? 0),
        snapshotAsOf: r.SnapshotAsOf ?? undefined,
        onHand: Number(r.OnHand ?? 0),
        monthQtyOH: new Array<number>(12).fill(0),
        monthValueOH: new Array<number>(12).fill(0),
      };
      rows.set(key, row);
    }

    const slotIndex = Number(r.SlotNumber ?? 0) - 1;
    if (slotIndex >= 0 && slotIndex < 12) {
      row.monthQtyOH[slotIndex] = Number(r.QtyOnHand ?? 0);
      row.monthValueOH[slotIndex] = Number(r.InventoryValue ?? 0);
    }
  }
  return [...rows.values()];
}

interface RawInventoryHistoryRollupRow {
  Store: number | null;
  DimKey: string | null;
  SnapshotAsOf: Date | string | null;
  SlotNumber: number | null;
  QtyOnHand: number | null;
  InventoryValue: number | null;
}

/**
 * Aggregated inventory-history fetch for subtotal / summary reports.
 *
 * The old subtotal path loaded one row per `(store, sku)` into Node, then
 * rolled it up by vendor/category in memory. That is too slow for all-store
 * category/vendor summaries. This query lets Postgres aggregate the 12 slot
 * vectors by the report dimension first, so the facade only processes the
 * small final report shape.
 */
export async function queryMonthlyInventoryHistoryRollups(
  params: QueryMonthlyInventoryHistoryRollupParams,
): Promise<MonthlyInventoryHistoryRollupRow[]> {
  if (!params.storeNumbers || params.storeNumbers.length === 0) {
    throw new Error('storeNumbers must have at least one entry');
  }
  if (params.skuFilter && params.skuFilter.length === 0) {
    return [];
  }
  if (params.sortBy !== 'vendor' && params.sortBy !== 'category') {
    throw new Error(`sortBy must be 'vendor' or 'category', got: ${params.sortBy}`);
  }

  const dimExpr =
    params.detailLevel === 'department'
      ? `src.category::text`
      : params.sortBy === 'vendor'
        ? `src.vendor`
        : `src.category::text`;

  const sqlParams: unknown[] = [params.storeNumbers.map((n) => Number(n))];
  const wheres: string[] = [`s.store_id = ANY($1::int[])`];

  if (params.skuFilter && params.skuFilter.length > 0) {
    sqlParams.push(params.skuFilter.map((s) => s.trim()).filter(Boolean));
    wheres.push(`s.sku_code = ANY($${sqlParams.length}::text[])`);
  }
  if (params.vendorFilter && params.vendorFilter.length > 0) {
    sqlParams.push(params.vendorFilter.map((s) => s.trim().toUpperCase()).filter(Boolean));
    wheres.push(`UPPER(COALESCE(NULLIF(BTRIM(k.vendor_id), ''), '(none)')) = ANY($${sqlParams.length}::text[])`);
  }
  if (params.categoryFilter && params.categoryFilter.length > 0) {
    sqlParams.push(params.categoryFilter.map((c) => Number(c)));
    wheres.push(`COALESCE(k.category_number, 0) = ANY($${sqlParams.length}::int[])`);
  }
  if (params.nonZeroOnly !== false) {
    wheres.push(`(m.qty_on_hand <> 0 OR COALESCE(m.inventory_value, 0) <> 0)`);
  }

  const sql = `
WITH src AS (
  SELECT
    s.store_id,
    COALESCE(NULLIF(BTRIM(k.vendor_id), ''), '(none)') AS vendor,
    COALESCE(k.category_number, 0) AS category,
    s.snapshot_as_of,
    m.slot_number,
    m.qty_on_hand,
    m.inventory_value
  FROM app.inventory_history_snapshot s
  INNER JOIN app.inventory_history_month m
    ON m.snapshot_id = s.id
  LEFT JOIN app.sku k
    ON k.id = s.sku_id
  WHERE ${wheres.join(' AND ')}
)
SELECT
  src.store_id AS "Store",
  ${dimExpr} AS "DimKey",
  MAX(src.snapshot_as_of) AS "SnapshotAsOf",
  src.slot_number AS "SlotNumber",
  SUM(src.qty_on_hand)::float8 AS "QtyOnHand",
  SUM(src.inventory_value)::float8 AS "InventoryValue"
FROM src
GROUP BY 1, 2, 4
  `;

  const raw = await prisma.$queryRawUnsafe<RawInventoryHistoryRollupRow[]>(sql, ...sqlParams);
  const rows = new Map<string, MonthlyInventoryHistoryRollupRow>();
  for (const r of raw) {
    if (r.Store == null) continue;
    const dimKey = r.DimKey == null ? '(none)' : String(r.DimKey).trim() || '(none)';
    const key = `${Number(r.Store)}|${dimKey}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        storeNumber: Number(r.Store),
        dimKey,
        snapshotAsOf: r.SnapshotAsOf ?? undefined,
        monthQtyOH: new Array<number>(12).fill(0),
        monthValueOH: new Array<number>(12).fill(0),
      };
      rows.set(key, row);
    }

    const slotIndex = Number(r.SlotNumber ?? 0) - 1;
    if (slotIndex >= 0 && slotIndex < 12) {
      row.monthQtyOH[slotIndex] = Number(r.QtyOnHand ?? 0);
      row.monthValueOH[slotIndex] = Number(r.InventoryValue ?? 0);
    }
  }
  return [...rows.values()];
}

// ─────────────────────────── internals ────────────────────────────────────

