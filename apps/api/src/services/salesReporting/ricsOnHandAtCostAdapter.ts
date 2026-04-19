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

import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildSelectScript,
} from '../accessOleDb';
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

const INVQUA_MDB = () =>
  ricsDbPath(process.env.RICS_INVQUA_DB_FILE || 'RIINVQUA.MDB');
const INVMAS_MDB = () =>
  ricsDbPath(process.env.RICS_INVMAS_DB_FILE || 'RIINVMAS.MDB');

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
function cached<T>(key: string, loader: () => T): T {
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;
  const value = loader();
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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
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

  const qua = cached('onhand:qua', () => {
    const pw = getOrRecoverPassword(INVQUA_MDB());
    const onHandExpr = Array.from({ length: 18 }, (_, i) =>
      `IIF([OnHand_${pad2(i + 1)}] IS NULL, 0, [OnHand_${pad2(i + 1)}])`,
    ).join(' + ');
    const quaSql = `SELECT [SKU], [Store], SUM(${onHandExpr}) AS TotalOnHand
FROM [Inventory Quantities]
GROUP BY [SKU], [Store]
HAVING SUM(${onHandExpr}) > 0`;
    return (
      runPowerShellJson<QuaRow[]>(buildSelectScript(INVQUA_MDB(), pw, quaSql)) ?? []
    );
  });

  const masters = cached('onhand:master', () => {
    const pw = getOrRecoverPassword(INVMAS_MDB());
    const masterSql = `SELECT [SKU], [Category], [Vendor], [Season], [CurrentCost]
FROM [InventoryMaster]
WHERE ([Status] IS NULL OR [Status] <> 'D')`;
    return (
      runPowerShellJson<MasterRow[]>(buildSelectScript(INVMAS_MDB(), pw, masterSql)) ?? []
    );
  });

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
