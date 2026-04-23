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
      `SELECT number AS "Number", "desc" AS "Desc" FROM rics_mirror.categories`,
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
      `SELECT sku AS "SKU", vendor AS "Vendor", category AS "Category",
              season AS "Season", style_color AS "StyleColor",
              group_code AS "GroupCode", key_words AS "KeyWords"
         FROM rics_mirror.inventory_master
        WHERE status IS NULL OR status <> 'D'`,
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

  // Pick the grouping dim. For 'sku' we group by SKU; otherwise by vendor or
  // category. Ticket-detail vendor/sku fields are text and may be NULL; return
  // '(none)' / 0 as the null sentinel so the facade doesn't have to fan out.
  let dimExpr: string;
  if (params.detailLevel === 'sku') {
    dimExpr = `COALESCE(d.sku, '(none)')`;
  } else if (params.detailLevel === 'department') {
    dimExpr = `COALESCE(d.category, 0)`;
  } else {
    dimExpr =
      params.sortBy === 'vendor'
        ? `COALESCE(d.vendor, '(none)')`
        : `COALESCE(d.category, 0)`;
  }

  // Parameterize values; keep identifiers as literals.
  const sqlParams: unknown[] = [
    startIso,
    endExclusiveIso,
    params.storeNumbers.map((n) => Number(n)),
  ];
  const wheres: string[] = [
    `h.real_date >= $1::date`,
    `h.real_date <  $2::date`,
    `h.trans_type = 1`,
    `h.voided     = false`,
    `h.store      = ANY($3::int[])`,
  ];
  if (params.skuFilter && params.skuFilter.length > 0) {
    // ticket_detail.sku is right-padded to 15 chars in the mirror — pad each
    // caller SKU before comparing. `ANY($N::text[])` keeps the index usable.
    const padded = params.skuFilter.map((s) => s.padEnd(15, ' '));
    sqlParams.push(padded);
    wheres.push(`d.sku = ANY($${sqlParams.length}::text[])`);
  }
  if (params.vendorFilter && params.vendorFilter.length > 0) {
    sqlParams.push(params.vendorFilter);
    wheres.push(`d.vendor = ANY($${sqlParams.length}::text[])`);
  }
  if (params.categoryFilter && params.categoryFilter.length > 0) {
    sqlParams.push(params.categoryFilter.map((c) => Number(c)));
    wheres.push(`d.category = ANY($${sqlParams.length}::int[])`);
  }

  const sql = `SELECT
  h.store AS "StoreNumber",
  EXTRACT(YEAR  FROM h.real_date)::int AS "Y",
  EXTRACT(MONTH FROM h.real_date)::int AS "M",
  ${dimExpr} AS "DimKey",
  COALESCE(d.vendor, '(none)')    AS "Vendor",
  COALESCE(d.category, 0)         AS "Category",
  SUM(COALESCE(d.qty, 0))::int    AS "Qty",
  SUM(d.extension)::float8        AS "NetSales",
  SUM(COALESCE(d.cost, 0) * COALESCE(d.qty, 0))::float8 AS "CostTotal"
FROM rics_mirror.ticket_header h
INNER JOIN rics_mirror.ticket_detail d
  ON h.user_id    = d.user_id
 AND h.batch_date = d.batch_date
 AND h.terminal   = d.terminal
 AND h.store      = d.store
 AND h.ticket     = d.ticket
 AND h.real_date  = d.real_date
WHERE
  ${wheres.join(' AND ')}
GROUP BY h.store, EXTRACT(YEAR FROM h.real_date), EXTRACT(MONTH FROM h.real_date),
  ${dimExpr},
  COALESCE(d.vendor, '(none)'),
  COALESCE(d.category, 0)`;

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

const INVHIS_SELECT_COLUMNS = [
  `sku AS "SKU"`,
  `store AS "Store"`,
  `average_cost::float8 AS "AverageCost"`,
  `on_hand AS "OnHand"`,
  ...Array.from({ length: 12 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `ly_month_qty_oh_${n} AS "LYMonthQtyOH_${n}"`;
  }),
  ...Array.from({ length: 12 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `ly_month_on_hand_${n}::float8 AS "LYMonthOnHand_${n}"`;
  }),
].join(', ');

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

  const sqlParams: unknown[] = [params.storeNumbers.map((n) => Number(n))];
  const wheres: string[] = [`store = ANY($1::int[])`];

  if (params.skuFilter && params.skuFilter.length > 0) {
    // inv_his.sku padding is uncertain here (unlike ticket_detail which is
    // known-padded to 15). Check both the raw and padded forms so we tolerate
    // either shape.
    const pairs = new Set<string>();
    for (const s of params.skuFilter) {
      pairs.add(s);
      pairs.add(s.padEnd(15, ' '));
    }
    sqlParams.push([...pairs]);
    wheres.push(`sku = ANY($${sqlParams.length}::text[])`);
  } else if (params.nonZeroOnly !== false) {
    // Skip the long tail of all-zero (store, sku) pairs that bloat the scan.
    wheres.push(`(
      on_hand <> 0 OR average_cost > 0 OR
      ly_month_qty_oh_01 <> 0 OR ly_month_qty_oh_02 <> 0 OR ly_month_qty_oh_03 <> 0 OR
      ly_month_qty_oh_04 <> 0 OR ly_month_qty_oh_05 <> 0 OR ly_month_qty_oh_06 <> 0 OR
      ly_month_qty_oh_07 <> 0 OR ly_month_qty_oh_08 <> 0 OR ly_month_qty_oh_09 <> 0 OR
      ly_month_qty_oh_10 <> 0 OR ly_month_qty_oh_11 <> 0 OR ly_month_qty_oh_12 <> 0
    )`);
  }

  const sql = `SELECT ${INVHIS_SELECT_COLUMNS}
                 FROM rics_mirror.inv_his
                WHERE ${wheres.join(' AND ')}`;

  const raw = await prisma.$queryRawUnsafe<RawInvHisRow[]>(sql, ...sqlParams);
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

