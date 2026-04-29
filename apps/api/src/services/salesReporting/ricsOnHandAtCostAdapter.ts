/**
 * On-hand-at-cost aggregator for Sales Analysis ROI/Turns columns.
 *
 * Joins the app-owned inventory snapshot (on-hand units per SKU x Store) with
 * app.sku (Category, Vendor, CurrentCost) and groups the resulting
 * (OnHand x CurrentCost) by whatever dimension the sales summary is grouping
 * at. Result is a Map keyed by the dimensionKey (or
 * `${dimensionKey}|${storeNumber}` when per-store).
 *
 * RIINVMAS-join-only dimensions
 * not yet implemented here return an empty map; the
 * sales facade renders null for ROI/Turns on those reports until implemented
 * against owned Postgres dimensions.
 */

import { prisma } from '../../db/prisma';
import {
  parseCriteria,
  matchesCriteria,
  type CriteriaExpression,
} from '../../utils/criteriaGrammar';
import type {
  SalesAnalysisCriteria,
  SalesAnalysisReportType,
  SalesAnalysisStoreOption,
} from './types';

export interface OnHandInventoryMetrics {
  unitsOnHand: number;
  onHandAtCost: number;
  inventoryUnitCost: number | null;
}

// Cache the app-owned snapshot independently of the report-specific criteria;
// callers apply criteria in-memory after the raw data lands. Five-minute TTL is
// tight enough that stock movements show up within one coffee break.
const CACHE_TTL_MS = 5 * 60 * 1000;
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<unknown>>();
async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}
export function clearOnHandCache(): void {
  cache.clear();
}

interface OnHandSnapshotRow {
  SKU: string | null;
  Store: number | null;
  TotalOnHand: number | null;
  Category: number | null;
  Vendor: string | null;
  Season: string | null;
  GroupCode: string | null;
  StyleColor: string | null;
  CurrentCost: number | null;
}

async function loadOnHandSnapshot(): Promise<OnHandSnapshotRow[]> {
  return cached('onhand:app-snapshot', () =>
    prisma.$queryRawUnsafe<OnHandSnapshotRow[]>(`
      SELECT h.sku_code AS "SKU",
             h.store_id AS "Store",
             h.on_hand::int AS "TotalOnHand",
             s.category_number AS "Category",
             s.vendor_id AS "Vendor",
             s.season AS "Season",
             s.group_code AS "GroupCode",
             s.style_color AS "StyleColor",
             COALESCE(s.current_cost, h.average_cost)::float8 AS "CurrentCost"
        FROM app.inventory_history_snapshot h
        LEFT JOIN app.sku s
          ON s.id = h.sku_id
       WHERE h.on_hand > 0
         AND COALESCE(s.rics_status, '') <> 'D'
    `),
  );
}

/**
 * Merge semantics per spec §2: structured picks ∪ grammar inclusions, then
 * grammar exclusions narrow on top. Exclusion-only grammar narrows the
 * structured picks (does not widen to the universe).
 */
function facetKeeps(
  structured: Array<string | number> | undefined,
  expr: CriteriaExpression,
  candidate: string | number | null,
): boolean {
  const structuredList = structured && structured.length > 0 ? structured : null;
  const grammarIncluded = expr.tokens.some((t) => !t.excluded);
  const grammarExcluded = expr.tokens.some((t) => t.excluded);

  if (!structuredList && expr.empty) return true;
  if (expr.empty) {
    if (candidate == null) return false;
    return structuredList!.some((x) => String(x) === String(candidate));
  }
  if (!structuredList) {
    return matchesCriteria(expr, candidate);
  }
  const structuredHit =
    candidate != null && structuredList.some((x) => String(x) === String(candidate));
  if (grammarIncluded) {
    if (!(structuredHit || matchesCriteria(expr, candidate))) return false;
    if (!grammarExcluded) return true;
    const exOnly: CriteriaExpression = {
      ...expr,
      tokens: expr.tokens.filter((t) => t.excluded),
    };
    return matchesCriteria(exOnly, candidate);
  }
  // exclusion-only grammar
  if (!structuredHit) return false;
  return matchesCriteria(expr, candidate);
}

export async function getOnHandAtCostByDimension(params: {
  reportType: SalesAnalysisReportType;
  storeOption: SalesAnalysisStoreOption;
  criteria: SalesAnalysisCriteria;
}): Promise<Map<string, number>> {
  const metrics = await getOnHandInventoryByDimension(params);
  const out = new Map<string, number>();
  for (const [key, value] of metrics) out.set(key, value.onHandAtCost);
  return out;
}

export async function getOnHandInventoryByDimension(params: {
  reportType: SalesAnalysisReportType;
  storeOption: SalesAnalysisStoreOption;
  criteria: SalesAnalysisCriteria;
}): Promise<Map<string, OnHandInventoryMetrics>> {
  const rows = await loadOnHandSnapshot();

  const categoryExpr = parseCriteria(params.criteria.categoriesRaw);
  const vendorExpr = parseCriteria(params.criteria.vendorsRaw);
  const skuExpr = parseCriteria(params.criteria.skusRaw);
  const storeExpr = parseCriteria(params.criteria.storesRaw);

  const combine = params.storeOption === 'COMBINE';
  const out = new Map<string, OnHandInventoryMetrics>();

  for (const row of rows) {
    const sku = row.SKU?.trim();
    if (!sku) continue;
    if (!facetKeeps(params.criteria.categories, categoryExpr, row.Category ?? null)) continue;
    if (!facetKeeps(params.criteria.vendors, vendorExpr, row.Vendor?.trim() ?? null)) continue;
    if (!facetKeeps(params.criteria.skus, skuExpr, sku)) continue;

    const store = Number(row.Store ?? 0);
    if (!facetKeeps(params.criteria.stores, storeExpr, store)) continue;

    const onHand = Number(row.TotalOnHand ?? 0);
    const cost = Number(row.CurrentCost ?? 0);
    if (onHand <= 0) continue;
    const value = onHand * Math.max(0, cost);

    const dimKey = dimensionKeyFor(params.reportType, sku, row);
    if (!dimKey) continue;
    const key = combine ? dimKey : `${dimKey}|${store}`;
    addInventoryMetrics(out, key, onHand, value);
  }

  return out;
}

function addInventoryMetrics(
  out: Map<string, OnHandInventoryMetrics>,
  key: string,
  unitsOnHand: number,
  onHandAtCost: number,
): void {
  const current = out.get(key) ?? { unitsOnHand: 0, onHandAtCost: 0, inventoryUnitCost: null };
  current.unitsOnHand += unitsOnHand;
  current.onHandAtCost += onHandAtCost;
  current.inventoryUnitCost =
    current.unitsOnHand > 0 ? current.onHandAtCost / current.unitsOnHand : null;
  out.set(key, current);
}

// ─────────────────────────── units-by-SKU export (purchase-planning) ──────
//
// Returns a pre-joined flat list of per-(SKU x Store) on-hand units together
// with the master fields needed to bucket the rows at a caller-defined
// dimension (department / category / vendor / etc).
//
// Purpose: the purchase-planning module (docs/modules/purchase-planning.md)
// needs on-hand **in units**, not dollars, grouped by arbitrary dimensions
// it owns the mapping of. Rather than adding N dimension-specific functions
// to this file, we expose the raw join so callers can bucket however they
// need. Reuses the two 5-minute caches above, so the OLEDB round-trip is
// amortised across every caller.
//
// Each row:
//   - `sku`, `store`, `onHand` (units, already summed across the 18 size
//     segments; zero-on-hand rows are dropped by the underlying query)
//   - `category`, `vendor`, `currentCost` (from app.sku; only rows
//     with non-deleted Status are included)
//
// Rows with no master match (orphan QUA rows) are excluded.

export interface OnHandUnitsRow {
  sku: string;
  store: number;
  onHand: number;
  category: number | null;
  vendor: string | null;
  currentCost: number;
}

export async function getOnHandSkuRows(params: {
  storeNumbers?: number[];
} = {}): Promise<OnHandUnitsRow[]> {
  const rows = await loadOnHandSnapshot();

  const storeFilter = params.storeNumbers && params.storeNumbers.length > 0
    ? new Set(params.storeNumbers.map((n) => Number(n)))
    : null;

  const out: OnHandUnitsRow[] = [];
  for (const row of rows) {
    const sku = row.SKU?.trim();
    if (!sku) continue;
    const store = Number(row.Store ?? 0);
    if (storeFilter && !storeFilter.has(store)) continue;
    const onHand = Number(row.TotalOnHand ?? 0);
    if (onHand <= 0) continue;
    out.push({
      sku,
      store,
      onHand,
      category: row.Category != null ? Number(row.Category) : null,
      vendor: row.Vendor?.trim() || null,
      currentCost: Number(row.CurrentCost ?? 0),
    });
  }
  return out;
}

function dimensionKeyFor(
  reportType: SalesAnalysisReportType,
  sku: string,
  row: OnHandSnapshotRow,
): string | null {
  switch (reportType) {
    case 'SKU_DETAIL':
      return sku;
    case 'CATEGORY_SUMMARY':
      return row.Category != null ? String(row.Category) : null;
    case 'VENDOR_SUMMARY':
      return row.Vendor?.trim() || null;
    case 'DEPT_SUMMARY':
      // Department requires the RIDEPT map; resolution is deferred to the
      // facade. Key by `CAT:<cat>` so the caller re-buckets via its existing
      // deptNumberForCategory helper.
      return row.Category != null ? `CAT:${row.Category}` : null;
    case 'SECTOR_SUMMARY':
      // Sector also resolves through category -> department -> sector in the
      // facade. Return category keys so that code can re-bucket once it has
      // the taxonomy maps.
      return row.Category != null ? `CAT:${row.Category}` : null;
    case 'SEASON_SUMMARY':
      return row.Season?.trim() || null;
    case 'GROUP_SUMMARY':
      return row.GroupCode?.trim() || null;
    case 'STYLE_COLOR_SUMMARY':
      return row.StyleColor?.trim() || null;
    case 'PRICE_POINT_SUMMARY':
      // Price-point bucketing requires RetailPrice + the sales-side bucket list.
      // Key by `PP:<sku>` so the facade can re-aggregate. (When the facade
      // can't resolve, ROI/Turns render as null — see spec Open Question 2.)
      return `PP:${sku}`;
    default:
      return null;
  }
}
