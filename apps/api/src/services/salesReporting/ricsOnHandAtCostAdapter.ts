/**
 * On-hand-at-cost aggregator for Sales Analysis ROI/Turns columns.
 *
 * Joins RIINVQUA (OnHand per SKU×Store, wide-column OnHand_01..18 summed
 * into TotalOnHand) with RIINVMAS (Category, Vendor, CurrentCost) and groups
 * the resulting (OnHand × CurrentCost) by whatever dimension the sales
 * summary is grouping at. Result is a Map keyed by the dimensionKey (or
 * `${dimensionKey}|${storeNumber}` when per-store).
 *
 * Phase 1: live read from the RICS MDBs. RIINVMAS-join-only dimensions
 * (GROUP / SEASON / STYLE_COLOR / SECTOR summary) return an empty map; the
 * sales facade renders null for ROI/Turns on those reports until Phase 2.5.
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

/** 18-column ON-HAND sum, Postgres syntax against rics_mirror.inventory_quantities. */
const ON_HAND_SUM_SQL = Array.from({ length: 18 }, (_, i) =>
  `COALESCE(on_hand_${String(i + 1).padStart(2, '0')}, 0)`,
).join(' + ');

// The RIINVQUA GROUP BY aggregation and the RIINVMAS lite pull are both
// expensive over OLEDB (tens of thousands of rows × wide-column sums).
// Cache them independently of the report-specific criteria — callers apply
// criteria in-memory after the raw data lands. Five-minute TTL is tight
// enough that stock movements show up within one coffee break.
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

const MASTER_JOIN_ONLY = new Set<SalesAnalysisReportType>([
  'GROUP_SUMMARY',
  'SEASON_SUMMARY',
  'STYLE_COLOR_SUMMARY',
  'SECTOR_SUMMARY',
]);

interface QuaRow {
  SKU: string | null;
  Store: number | null;
  TotalOnHand: number | null;
}

interface MasterRow {
  SKU: string | null;
  Category: number | null;
  Vendor: string | null;
  Season: string | null;
  CurrentCost: number | null;
}

async function loadQuaAggregate(): Promise<QuaRow[]> {
  return cached('onhand:qua', () =>
    prisma.$queryRawUnsafe<QuaRow[]>(`
      SELECT sku AS "SKU",
             store AS "Store",
             SUM(${ON_HAND_SUM_SQL})::int AS "TotalOnHand"
        FROM rics_mirror.inventory_quantities
       GROUP BY sku, store
      HAVING SUM(${ON_HAND_SUM_SQL}) > 0
    `),
  );
}

async function loadMasterSnapshot(): Promise<MasterRow[]> {
  return cached('onhand:master', () =>
    prisma.$queryRawUnsafe<MasterRow[]>(`
      SELECT sku AS "SKU",
             category AS "Category",
             vendor AS "Vendor",
             season AS "Season",
             current_cost::float8 AS "CurrentCost"
        FROM rics_mirror.inventory_master
       WHERE status IS NULL OR status <> 'D'
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
  if (MASTER_JOIN_ONLY.has(params.reportType)) {
    return new Map();
  }

  const qua = await loadQuaAggregate();
  const masters = await loadMasterSnapshot();

  const categoryExpr = parseCriteria(params.criteria.categoriesRaw);
  const vendorExpr = parseCriteria(params.criteria.vendorsRaw);
  const skuExpr = parseCriteria(params.criteria.skusRaw);
  const storeExpr = parseCriteria(params.criteria.storesRaw);

  const masterBySku = new Map<string, MasterRow>();
  for (const m of masters) {
    if (!m.SKU) continue;
    if (!facetKeeps(params.criteria.categories, categoryExpr, m.Category ?? null)) continue;
    if (!facetKeeps(params.criteria.vendors, vendorExpr, m.Vendor?.trim() ?? null)) continue;
    if (!facetKeeps(params.criteria.skus, skuExpr, m.SKU.trim())) continue;
    masterBySku.set(m.SKU.trim(), m);
  }

  const combine = params.storeOption === 'COMBINE';
  const out = new Map<string, number>();

  for (const q of qua) {
    const sku = q.SKU?.trim();
    if (!sku) continue;
    const m = masterBySku.get(sku);
    if (!m) continue;
    const store = Number(q.Store ?? 0);
    if (!facetKeeps(params.criteria.stores, storeExpr, store)) continue;

    const onHand = Number(q.TotalOnHand ?? 0);
    const cost = Number(m.CurrentCost ?? 0);
    if (onHand <= 0 || cost <= 0) continue;
    const value = onHand * cost;

    const dimKey = dimensionKeyFor(params.reportType, sku, m);
    if (!dimKey) continue;
    const key = combine ? dimKey : `${dimKey}|${store}`;
    out.set(key, (out.get(key) ?? 0) + value);
  }

  return out;
}

// ─────────────────────────── units-by-SKU export (purchase-planning) ──────
//
// Returns a pre-joined flat list of per-(SKU × Store) on-hand units together
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
//   - `category`, `vendor`, `currentCost` (from InventoryMaster; only rows
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
  const qua = await loadQuaAggregate();
  const masters = await loadMasterSnapshot();

  const masterBySku = new Map<string, MasterRow>();
  for (const m of masters) {
    if (!m.SKU) continue;
    masterBySku.set(m.SKU.trim(), m);
  }

  const storeFilter = params.storeNumbers && params.storeNumbers.length > 0
    ? new Set(params.storeNumbers.map((n) => Number(n)))
    : null;

  const out: OnHandUnitsRow[] = [];
  for (const q of qua) {
    const sku = q.SKU?.trim();
    if (!sku) continue;
    const store = Number(q.Store ?? 0);
    if (storeFilter && !storeFilter.has(store)) continue;
    const m = masterBySku.get(sku);
    if (!m) continue;
    const onHand = Number(q.TotalOnHand ?? 0);
    if (onHand <= 0) continue;
    out.push({
      sku,
      store,
      onHand,
      category: m.Category != null ? Number(m.Category) : null,
      vendor: m.Vendor?.trim() || null,
      currentCost: Number(m.CurrentCost ?? 0),
    });
  }
  return out;
}

function dimensionKeyFor(
  reportType: SalesAnalysisReportType,
  sku: string,
  m: MasterRow,
): string | null {
  switch (reportType) {
    case 'SKU_DETAIL':
      return sku;
    case 'CATEGORY_SUMMARY':
      return m.Category != null ? String(m.Category) : null;
    case 'VENDOR_SUMMARY':
      return m.Vendor?.trim() || null;
    case 'DEPT_SUMMARY':
      // Department requires the RIDEPT map; resolution is deferred to the
      // facade. Key by `CAT:<cat>` so the caller re-buckets via its existing
      // deptNumberForCategory helper.
      return m.Category != null ? `CAT:${m.Category}` : null;
    case 'PRICE_POINT_SUMMARY':
      // Price-point bucketing requires RetailPrice + the sales-side bucket list.
      // Key by `PP:<sku>` so the facade can re-aggregate. (When the facade
      // can't resolve, ROI/Turns render as null — see spec Open Question 2.)
      return `PP:${sku}`;
    default:
      return null;
  }
}
