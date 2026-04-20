/**
 * Live read-through adapter from the legacy RICS MDB (Access) databases into
 * the storefront's public product API shape.
 *
 * Flow:
 *   storefront →  /api/public/products (or /facets, /:id)
 *             →  publicProductService (routes based on PRODUCT_SOURCE)
 *             →  ricsProductAdapter (this file)
 *             →  PowerShell + Microsoft.ACE.OLEDB.12.0 → .MDB files
 *             →  merged with ProductContent rows from Postgres (web overlay)
 *
 * Read-only. Never issues INSERT/UPDATE/DELETE against RICS.
 *
 * Mapping source: docs/rics-db-schema.md (regenerate with
 * `pnpm --filter @benlow-rics/api rics:discover`). Each section below cites the
 * relevant heading from that doc when picking a column.
 *
 * Cross-MDB joins are avoided. Dimension tables (Categories, Departments,
 * Vendors, SizeTypes) are tiny (≤ ~2.3 k rows total) — we load each into an
 * in-memory map on first use and do the joins client-side. A single facets or
 * list request triggers at most:
 *   1× InventoryMaster query                (the row source)
 *   1× InvCatalog query                     (only on detail)
 *   ≤ 4× one-time dimension queries         (cached 5 min)
 * — never an N+1 across SKUs.
 */

import fs from 'node:fs';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildSelectScript,
} from './accessOleDb';
import { prisma } from '../db/prisma';
import type {
  ProductCard,
  ProductDetail,
  FacetsResult,
  ProductListParams,
  FacetFilterParams,
  PaginatedProducts,
} from './publicProductService';

// ─────────────────────────── tiny in-memory TTL cache ─────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

async function cachedAsync<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await loader();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function clearCache(): void {
  cache.clear();
}

// ─────────────────────────── MDB file paths ───────────────────────────────

function mdbPath(envKey: string, defaultFile: string): string {
  return ricsDbPath(process.env[envKey] || defaultFile);
}

const INVMAS_MDB = () => mdbPath('RICS_INVMAS_DB_FILE', 'RIINVMAS.MDB');
const CATEG_MDB = () => mdbPath('RICS_CATEG_DB_FILE', 'RICATEG.MDB');
const DEPT_MDB = () => mdbPath('RICS_DEPT_DB_FILE', 'RIDEPT.MDB');
const VENDOR_MDB = () => mdbPath('RICS_VENDOR_DB_FILE', 'RIVENDOR.MDB');
const SIZE_MDB = () => mdbPath('RICS_SIZE_DB_FILE', 'RISIZE.MDB');

// ─────────────────────────── dimension-table caches ───────────────────────
// Small, rarely-changing tables. Loaded once per 5 min.

interface CategoryRow {
  number: number;
  name: string;
  departmentNumber: number | null;
  departmentName: string | null;
}
interface DepartmentRow {
  number: number;
  name: string;
  begCateg: number;
  endCateg: number;
}
interface VendorRow {
  code: string;
  shortName: string | null;
  manuName: string | null;
}
interface SizeTypeRow {
  code: number;
  desc: string | null;
  columns: string[]; // non-blank cell labels in column order (≤ 54)
  rows: string[];    // non-blank cell labels in row order (≤ 27)
}

// Source: docs/rics-db-schema.md → "RICATEG.MDB / Categories" + "RIDEPT.MDB / Departments".
// Departments resolve via range lookup: BegCateg ≤ Category.Number ≤ EndCateg
// (RIDEPT carries 92 rows, RICATEG ~616 — both trivial to cache.)
async function loadCategoryMap(): Promise<Map<number, CategoryRow>> {
  return cachedAsync('dim:categories', 300_000, async () => {
    const map = new Map<number, CategoryRow>();
    const cats = await queryAll<{ Number: number; Desc: string | null }>(
      CATEG_MDB(),
      'SELECT [Number], [Desc] FROM [Categories]',
    );
    const depts = await loadDepartmentList();
    for (const c of cats) {
      const dept = depts.find((d) => c.Number >= d.begCateg && c.Number <= d.endCateg);
      map.set(c.Number, {
        number: c.Number,
        name: (c.Desc || '').trim(),
        departmentNumber: dept?.number ?? null,
        departmentName: dept?.name ?? null,
      });
    }
    return map;
  });
}

// Source: docs/rics-db-schema.md → "RIDEPT.MDB / Departments". Only 92 rows.
async function loadDepartmentList(): Promise<DepartmentRow[]> {
  return cachedAsync('dim:departments', 300_000, async () => {
    const rows = await queryAll<{
      Number: number;
      Desc: string | null;
      BegCateg: number | null;
      EndCateg: number | null;
    }>(DEPT_MDB(), 'SELECT [Number], [Desc], [BegCateg], [EndCateg] FROM [Departments]');
    return rows
      .filter((r) => r.BegCateg != null && r.EndCateg != null)
      .map((r) => ({
        number: r.Number,
        name: (r.Desc || '').trim(),
        begCateg: r.BegCateg as number,
        endCateg: r.EndCateg as number,
      }));
  });
}

// Source: docs/rics-db-schema.md → "RIVENDOR.MDB / Vendor Master". 22 cols, 2 254
// rows in this customer's data. Code is the FK target for InventoryMaster.Vendor.
async function loadVendorMap(): Promise<Map<string, VendorRow>> {
  return cachedAsync('dim:vendors', 300_000, async () => {
    const map = new Map<string, VendorRow>();
    const rows = await queryAll<{ Code: string; 'Short Name': string | null; 'Manu Name': string | null }>(
      VENDOR_MDB(),
      'SELECT [Code], [Short Name], [Manu Name] FROM [Vendor Master]',
    );
    for (const r of rows) {
      if (!r.Code) continue;
      map.set(r.Code.trim(), {
        code: r.Code.trim(),
        shortName: r['Short Name']?.trim() || null,
        manuName: r['Manu Name']?.trim() || null,
      });
    }
    return map;
  });
}

// Source: docs/rics-db-schema.md → "RISIZE.MDB / SizeTypes". The wide-column
// shape (`Columns_01..54`, `Rows_01..27`) is unwound into ordered arrays so the
// adapter can produce a flat sizes facet without additional MDB hits.
// `NRMACodes` is empty for this customer — intentionally not loaded.
async function loadSizeTypeMap(): Promise<Map<number, SizeTypeRow>> {
  return cachedAsync('dim:sizeTypes', 300_000, async () => {
    const map = new Map<number, SizeTypeRow>();
    const colSelect = Array.from({ length: 54 }, (_, i) => `[Columns_${String(i + 1).padStart(2, '0')}]`).join(', ');
    const rowSelect = Array.from({ length: 27 }, (_, i) => `[Rows_${String(i + 1).padStart(2, '0')}]`).join(', ');
    const rows = await queryAll<Record<string, string | number | null>>(
      SIZE_MDB(),
      `SELECT [Code], [Desc], [MaxColumns], [MaxRows], ${colSelect}, ${rowSelect} FROM [SizeTypes]`,
    );
    for (const r of rows) {
      const code = Number(r.Code);
      if (!Number.isFinite(code)) continue;
      const maxCols = Math.min(54, Math.max(0, Number(r.MaxColumns ?? 0)));
      const maxRows = Math.min(27, Math.max(0, Number(r.MaxRows ?? 0)));
      const columns: string[] = [];
      for (let i = 1; i <= maxCols; i++) {
        const v = (r[`Columns_${String(i).padStart(2, '0')}`] as string | null);
        const trimmed = (v ?? '').toString().trim();
        if (trimmed) columns.push(trimmed);
      }
      const rowsLbl: string[] = [];
      for (let i = 1; i <= maxRows; i++) {
        const v = (r[`Rows_${String(i).padStart(2, '0')}`] as string | null);
        const trimmed = (v ?? '').toString().trim();
        if (trimmed) rowsLbl.push(trimmed);
      }
      map.set(code, {
        code,
        desc: (r.Desc as string | null)?.toString().trim() || null,
        columns,
        rows: rowsLbl,
      });
    }
    return map;
  });
}

// ─────────────────────────── inventory snapshot ───────────────────────────
// PowerShell+OLEDB spawns are ~500ms each on Windows, plus MDB open+decrypt.
// Serving every list/facets request live would put the storefront well above a
// one-second first-paint target. Instead we load InventoryMaster *once* into
// memory (lightly pre-filtered: RetailPrice > 0 AND Status <> 'D'), cache it
// for 10 min, and do all user-side filtering / sorting / aggregation from that
// snapshot in pure JS. A single warm request becomes sub-10ms.

const SNAPSHOT_TTL_MS = 10 * 60_000;
const INVENTORY_SNAPSHOT_CAP = 10_000; // safety cap; bump if catalog grows.

// Storefront catalog scope. RICS houses the entire retail operation in one
// InventoryMaster table; for the web store we only want one season and the
// shoes category range (RICS codes 556–599, which macro-map to FORMAL /
// CASUAL / FIESTA / SANDALIAS / BOOTS / COMFORT per the existing module spec).
// Bake these into the snapshot-load SQL so nothing outside that scope ever
// enters memory.
const STOREFRONT_SEASON = process.env.RICS_STOREFRONT_SEASON ?? 'A';
const STOREFRONT_CATEGORY_MIN = Number(process.env.RICS_STOREFRONT_CATEGORY_MIN ?? 556);
const STOREFRONT_CATEGORY_MAX = Number(process.env.RICS_STOREFRONT_CATEGORY_MAX ?? 599);

async function loadInventorySnapshot(): Promise<InventoryMasterRow[]> {
  return cachedAsync('inv:snapshot', SNAPSHOT_TTL_MS, async () => {
    const dbPath = INVMAS_MDB();
    if (!fs.existsSync(dbPath)) {
      console.warn(`[ricsProductAdapter] RIINVMAS not found at ${dbPath}; snapshot empty.`);
      return [];
    }
    const password = getOrRecoverPassword(dbPath);

    const safeSeason = STOREFRONT_SEASON.replace(/'/g, "''");
    const sql = `
SELECT TOP ${INVENTORY_SNAPSHOT_CAP}
  [SKU], [VendorSKU], [Category], [Vendor], [SizeType], [Desc], [StyleColor],
  [Season], [Location],
  [ListPrice], [RetailPrice], [MarkDownPrice1], [MarkDownPrice2], [CurrentPrice], [CurrentCost],
  [OverSizeColumn], [OverSizeAmount], [Perks],
  [Manufacturer], [LabelCode], [ColorCode], [Comment], [GroupCode], [KeyWords],
  [PictureFileName], [Coupon], [LastPriceChange], [Status],
  [DateLastChanged], [OrderMultiple], [OrderUOM]
FROM [InventoryMaster]
WHERE [RetailPrice] > 0
  AND ([Status] IS NULL OR [Status] <> 'D')
  AND [Season] = '${safeSeason}'
  AND [Category] BETWEEN ${STOREFRONT_CATEGORY_MIN} AND ${STOREFRONT_CATEGORY_MAX}
ORDER BY [Desc]
`.trim();

    const t0 = Date.now();
    try {
      const raw = await runPowerShellJson<InventoryMasterRow | InventoryMasterRow[]>(
        buildSelectScript(dbPath, password, sql),
      );
      const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
      console.log(`[ricsProductAdapter] snapshot loaded: ${rows.length} rows in ${Date.now() - t0}ms`);
      return rows;
    } catch (err: any) {
      console.error('[ricsProductAdapter] snapshot load failed:', err.message);
      return [];
    }
  });
}

/**
 * Eagerly warm the snapshot and dimension caches. Call once from server
 * startup so the first page hit doesn't pay the cold-spawn tax.
 */
export async function warmup(): Promise<void> {
  try {
    await Promise.all([
      loadInventorySnapshot(),
      loadCategoryMap(),
      loadVendorMap(),
      loadSizeTypeMap(),
      loadDepartmentList(),
      // Full SKU index for the Inventory Inquiry's SKU Lookup modal.
      // This is usually the slowest leg of warmup (scales with row count),
      // but doing it once up-front makes every subsequent lookup instant.
      loadSkuLookupIndex(),
    ]);
    console.log('[ricsProductAdapter] warmup complete');
  } catch (err: any) {
    console.warn('[ricsProductAdapter] warmup failed (non-fatal):', err.message);
  }
}

/**
 * Brand index derived from a snapshot. Vendor codes are ranked by SKU count
 * (most popular first), and each gets a stable numeric id (1-based rank).
 *
 * The storefront's `ProductListParams.brandId` is this numeric id — both
 * /facets (when it emits brands) and filterSnapshot (when it consumes a brand
 * filter) must use the same ranking to agree on what `brandId=3` means.
 */
interface BrandIndex {
  /** ordered entries, most SKUs first; index+1 is the public `id`. */
  ordered: Array<{ id: number; code: string; name: string; count: number }>;
  byCode: Map<string, { id: number; name: string; count: number }>;
  byId: Map<number, string>;
}

function buildBrandIndex(
  rows: InventoryMasterRow[],
  vendors: Map<string, VendorRow>,
): BrandIndex {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.Vendor) continue;
    const code = r.Vendor.trim();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  // Secondary sort key (vendor code) makes the ranking deterministic when
  // counts tie, so the same brandId means the same brand across requests.
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const ordered: BrandIndex['ordered'] = [];
  const byCode: BrandIndex['byCode'] = new Map();
  const byId: BrandIndex['byId'] = new Map();
  sorted.forEach(([code, count], i) => {
    const id = i + 1;
    const v = vendors.get(code);
    const name = v?.manuName?.trim() || v?.shortName?.trim() || code;
    ordered.push({ id, code, name, count });
    byCode.set(code, { id, name, count });
    byId.set(id, code);
  });
  return { ordered, byCode, byId };
}

/**
 * Apply the storefront's filter params to a snapshot of InventoryMaster rows.
 * Mirrors the old SQL `WHERE` clauses but runs in JS — no spawn, no DB hit.
 */
function filterSnapshot(
  rows: InventoryMasterRow[],
  params: ProductListParams,
  departments: DepartmentRow[],
  brandIndex: BrandIndex,
): InventoryMasterRow[] {
  const q = params.q?.trim().toLowerCase() ?? null;
  const minP = params.minPrice ?? null;
  const maxP = params.maxPrice ?? null;

  let deptCats: Set<number> | null = null;
  if (params.department) {
    deptCats = new Set<number>();
    const wanted = params.department.trim().toUpperCase();
    for (const d of departments) {
      const name = d.name.toUpperCase();
      if (name === wanted || name.includes(wanted)) {
        for (let n = d.begCateg; n <= d.endCateg; n++) deptCats.add(n);
      }
    }
    if (deptCats.size === 0) return [];
  }

  let wantedVendorCode: string | null = null;
  if (params.brandId != null) {
    wantedVendorCode = brandIndex.byId.get(params.brandId) ?? null;
    if (!wantedVendorCode) return [];
  }

  return rows.filter((r) => {
    if (params.categoryId && r.Category !== params.categoryId) return false;
    if (deptCats && (r.Category == null || !deptCats.has(r.Category))) return false;
    if (wantedVendorCode && (r.Vendor?.trim() ?? '') !== wantedVendorCode) return false;
    if (q) {
      const hay =
        (r.Desc ?? '').toLowerCase() +
        '\n' +
        (r.SKU ?? '').toLowerCase() +
        '\n' +
        (r.KeyWords ?? '').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (minP != null || maxP != null) {
      const price = resolveCurrentPrice(r);
      if (minP != null && price < minP) return false;
      if (maxP != null && price > maxP) return false;
    }
    return true;
  });
}

// ─────────────────────────── public API ───────────────────────────────────

export async function listProducts(params: ProductListParams): Promise<PaginatedProducts> {
  const key = `list:${JSON.stringify(params)}`;
  return cachedAsync(key, SNAPSHOT_TTL_MS, async () => {
    const [snapshot, categories, vendors, departments] = await Promise.all([
      loadInventorySnapshot(),
      loadCategoryMap(),
      loadVendorMap(),
      loadDepartmentList(),
    ]);
    const brandIndex = buildBrandIndex(snapshot, vendors);

    const invRows = filterSnapshot(snapshot, params, departments, brandIndex);
    const cards = invRows
      .map((r) => rowToProductCard(r, categories, vendors))
      .filter((c): c is ProductCard => c !== null);

    const sorted = sortCards(cards, invRows, params.sort, params.order);
    const merged = await mergeOverlayOntoCards(sorted);

    const offset = (params.page - 1) * params.limit;
    return {
      data: merged.slice(offset, offset + params.limit),
      pagination: {
        page: params.page,
        limit: params.limit,
        totalItems: merged.length,
        totalPages: Math.max(1, Math.ceil(merged.length / params.limit)),
      },
    };
  });
}

export async function getProductById(ricsSkuCode: string): Promise<ProductDetail | null> {
  const key = `detail:${ricsSkuCode}`;
  return cachedAsync(key, 300_000, async () => {
    // Detail-page lookups hit the snapshot first (free, already in memory).
    // Only fall back to a live SELECT when the SKU is absent from the snapshot
    // (e.g., it was filtered out by RetailPrice>0 but someone still has a
    // bookmarked link). That keeps detail fast in the common case.
    const [snapshot, categories, vendors, sizeTypes] = await Promise.all([
      loadInventorySnapshot(),
      loadCategoryMap(),
      loadVendorMap(),
      loadSizeTypeMap(),
    ]);

    let row = snapshot.find((r) => r.SKU === ricsSkuCode) ?? null;
    if (!row) {
      const dbPath = INVMAS_MDB();
      if (!fs.existsSync(dbPath)) return null;
      const password = getOrRecoverPassword(dbPath);
      const safe = ricsSkuCode.replace(/'/g, "''");
      const sql = `SELECT TOP 1 * FROM [InventoryMaster] WHERE [SKU] = '${safe}'`;
      try {
        const raw = await runPowerShellJson<InventoryMasterRow | InventoryMasterRow[]>(
          buildSelectScript(dbPath, password, sql),
        );
        const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
        row = rows[0] ?? null;
      } catch (err: any) {
        console.error('[ricsProductAdapter] getProduct fallback failed:', err.message);
        return null;
      }
    }
    if (!row) return null;

    const card = rowToProductCard(row, categories, vendors);
    if (!card) return null;
    const catalog = queryInvCatalog(row.SKU || ricsSkuCode);
    const detail = rowToProductDetail(card, row, categories, vendors, sizeTypes, catalog);
    return mergeOverlayOntoDetail(detail);
  });
}

export async function getProductFacets(filters: FacetFilterParams): Promise<FacetsResult> {
  const key = `facets:${JSON.stringify(filters)}`;
  return cachedAsync(key, SNAPSHOT_TTL_MS, async () => {
    const [snapshot, categories, vendors, sizeTypes, departments] = await Promise.all([
      loadInventorySnapshot(),
      loadCategoryMap(),
      loadVendorMap(),
      loadSizeTypeMap(),
      loadDepartmentList(),
    ]);
    const brandIndex = buildBrandIndex(snapshot, vendors);

    const invRows = filterSnapshot(snapshot, filterToListParams(filters), departments, brandIndex);
    const cards = invRows
      .map((r) => rowToProductCard(r, categories, vendors))
      .filter((c): c is ProductCard => c !== null);

    return aggregateFacets(cards, invRows, categories, sizeTypes, brandIndex);
  });
}

// ─────────────────────────── inventory master query ───────────────────────

// Subset of InventoryMaster pulled by listing/facets. Detail uses SELECT * so
// we don't need to enumerate every column there. Source: docs/rics-db-schema.md
// → "RIINVMAS.MDB / InventoryMaster".
interface InventoryMasterRow {
  SKU: string | null;
  VendorSKU: string | null;
  Category: number | null;
  Vendor: string | null;
  SizeType: number | null;
  Desc: string | null;
  StyleColor: string | null;
  Season: string | null;
  Location: string | null;
  ListPrice: number | null;
  RetailPrice: number | null;
  MarkDownPrice1: number | null;
  MarkDownPrice2: number | null;
  CurrentPrice: number | null; // SMALLINT 1=List, 2=Retail, 3=MD1, 4=MD2 (RICS p.155)
  CurrentCost: number | null;
  OverSizeColumn: string | null;
  OverSizeAmount: number | null;
  Perks: number | null;
  Manufacturer: string | null;
  LabelCode: string | null;
  ColorCode: string | null;
  Comment: string | null;
  GroupCode: string | null;
  KeyWords: string | null;
  PictureFileName: string | null;
  Coupon: boolean | null;
  LastPriceChange: string | null;
  Status: string | null;
  DateLastChanged: string | null;
  OrderMultiple: number | null;
  OrderUOM: string | null;
}

// Note: the former `queryInventoryMaster` + `buildListWhereClauses` pair
// (server-side WHERE against RIINVMAS per request) was replaced by
// `loadInventorySnapshot` + `filterSnapshot` above. That collapsed cold load
// from ~6-10 s (multiple PowerShell spawns) to one warmup spawn per 10 min;
// every subsequent list/facets request is pure JS.

// Source: docs/rics-db-schema.md → "RIINVMAS.MDB / InvCatalog". Web overlay
// owned by RICS: bullet text, bold/para descriptions, two extra picture slots,
// long color, web filename. Per-SKU; most SKUs lack a row here.
interface InvCatalogRow {
  SKU: string | null;
  LongColor: string | null;
  BoldDesc: string | null;
  ParaDesc: string | null;
  CatalogSKU: string | null;
  BulletText_01: string | null;
  BulletText_02: string | null;
  BulletText_03: string | null;
  BulletText_04: string | null;
  BulletText_05: string | null;
  PictureName_01: string | null;
  PictureName_02: string | null;
  SizeText: string | null;
  WebFileName: string | null;
}

function queryInvCatalog(sku: string): InvCatalogRow | null {
  const dbPath = INVMAS_MDB();
  if (!fs.existsSync(dbPath)) return null;
  const password = getOrRecoverPassword(dbPath);
  const safe = sku.replace(/'/g, "''");
  const sql = `SELECT TOP 1 [SKU], [LongColor], [BoldDesc], [ParaDesc], [CatalogSKU],
  [BulletText_01], [BulletText_02], [BulletText_03], [BulletText_04], [BulletText_05],
  [PictureName_01], [PictureName_02], [SizeText], [WebFileName]
FROM [InvCatalog] WHERE [SKU] = '${safe}'`;
  try {
    const raw = runPowerShellJson<InvCatalogRow | InvCatalogRow[]>(
      buildSelectScript(dbPath, password, sql),
    );
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return arr[0] ?? null;
  } catch (err: any) {
    // InvCatalog is optional — failure here just means no extra description.
    console.warn('[ricsProductAdapter] InvCatalog lookup failed:', err.message);
    return null;
  }
}

async function queryAll<T>(dbPath: string, sql: string): Promise<T[]> {
  if (!fs.existsSync(dbPath)) return [];
  const password = getOrRecoverPassword(dbPath);
  try {
    const raw = await runPowerShellJson<T | T[]>(buildSelectScript(dbPath, password, sql));
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  } catch (err: any) {
    console.error(`[ricsProductAdapter] queryAll failed for ${dbPath}:`, err.message);
    return [];
  }
}


// ─────────────────────────── row → public type mappers ────────────────────

const DEFAULT_DEPARTMENT = 'FORMAL';

/**
 * Resolve the SKU's effective price using the `CurrentPrice` slot selector
 * (RICS p. 155 — exactly one of List/Retail/MD1/MD2 is "current").
 *   1 = List, 2 = Retail, 3 = MarkDown1, 4 = MarkDown2
 * Falls back to RetailPrice when the slot is missing or its value is zero.
 */
function resolveCurrentPrice(
  row: Pick<InventoryMasterRow, 'CurrentPrice' | 'ListPrice' | 'RetailPrice' | 'MarkDownPrice1' | 'MarkDownPrice2'>,
): number {
  const slot = Number(row.CurrentPrice ?? 2);
  const candidate =
    slot === 1 ? row.ListPrice
    : slot === 3 ? row.MarkDownPrice1
    : slot === 4 ? row.MarkDownPrice2
    : row.RetailPrice;
  const n = Number(candidate ?? 0);
  if (n > 0) return n;
  return Number(row.RetailPrice ?? 0);
}

function rowToProductCard(
  row: InventoryMasterRow,
  categories: Map<number, CategoryRow>,
  vendors: Map<string, VendorRow>,
): ProductCard | null {
  if (!row.SKU) return null;

  // Cross-MDB joins are done client-side: Category number → CategoryRow
  // (RICATEG) → DepartmentRow (RIDEPT range lookup, baked into CategoryRow).
  const cat = row.Category != null ? categories.get(row.Category) : null;
  // Vendor join: InventoryMaster.Vendor → Vendor Master.Code (RIVENDOR).
  const vnd = row.Vendor ? vendors.get(row.Vendor.trim()) : null;
  // Brand resolution priority: SKU's own Manufacturer (free text) →
  // vendor's Manu Name (typically the brand it represents) → vendor's
  // Short Name → raw vendor code as last resort.
  const brand =
    (row.Manufacturer?.trim()) ||
    vnd?.manuName ||
    vnd?.shortName ||
    row.Vendor?.trim() ||
    null;

  return {
    id: row.SKU, // preserved verbatim — leading `|` is retained (open question #8 in docs/modules/products.md)
    name: row.Desc?.trim() || row.SKU,
    brand,
    price: resolveCurrentPrice(row),
    mainImage: pictureUrl(row.PictureFileName),
    rating: null,
    colorSwatches: [],
    department: cat?.departmentName ?? DEFAULT_DEPARTMENT,
    style: row.StyleColor?.trim() || '',
  };
}

function rowToProductDetail(
  card: ProductCard,
  row: InventoryMasterRow,
  categories: Map<number, CategoryRow>,
  _vendors: Map<string, VendorRow>,
  sizeTypes: Map<number, SizeTypeRow>,
  catalog: InvCatalogRow | null,
): ProductDetail {
  const cat = row.Category != null ? categories.get(row.Category) : null;
  const sizeType = row.SizeType != null ? sizeTypes.get(Number(row.SizeType)) : null;

  // Description preference: InvCatalog.BoldDesc + ParaDesc (web overlay) →
  // Bullets concatenated → InventoryMaster.KeyWords → InventoryMaster.Desc.
  // The Postgres ProductContent overlay (mergeOverlayOntoDetail) gets the
  // final say below.
  const description = pickDescription(catalog, row);

  // Picture priority: InvCatalog.WebFileName / PictureName_01 (when present)
  // → InventoryMaster.PictureFileName (already on the card).
  const mainImage =
    pictureUrl(catalog?.WebFileName) ||
    pictureUrl(catalog?.PictureName_01) ||
    card.mainImage;

  // Size grid: list every column label in the SKU's SizeType. We don't have
  // per-cell on-hand here (that lives in RIINVQUA, behind another spawn) so
  // every size shows `inStock: true` until the inventory join is wired.
  const availableSizes = (sizeType?.columns ?? []).map((label) => ({
    id: `${row.SKU}-${label}`,
    label,
    inStock: true,
  }));

  return {
    ...card,
    mainImage,
    skuCode: row.SKU ?? card.id,
    description,
    material: null,
    heelType: null,
    category: cat?.name ?? null,
    color: catalog?.LongColor?.trim() || row.StyleColor?.trim() || row.ColorCode?.trim() || null,
    availableSizes,
    availableColors: [],
    specs: buildSpecs(row, cat, sizeType, catalog),
  };
}

function pickDescription(catalog: InvCatalogRow | null, row: InventoryMasterRow): string | null {
  if (catalog) {
    const parts: string[] = [];
    if (catalog.BoldDesc?.trim()) parts.push(catalog.BoldDesc.trim());
    if (catalog.ParaDesc?.trim()) parts.push(catalog.ParaDesc.trim());
    const bullets = [
      catalog.BulletText_01,
      catalog.BulletText_02,
      catalog.BulletText_03,
      catalog.BulletText_04,
      catalog.BulletText_05,
    ]
      .map((b) => b?.trim())
      .filter((b): b is string => !!b);
    if (bullets.length) parts.push(bullets.map((b) => `• ${b}`).join('\n'));
    if (parts.length) return parts.join('\n\n');
  }
  return row.KeyWords?.trim() || row.Desc?.trim() || null;
}

function buildSpecs(
  row: InventoryMasterRow,
  cat: CategoryRow | null | undefined,
  sizeType: SizeTypeRow | null | undefined,
  _catalog: InvCatalogRow | null,
): Record<string, string | null> {
  // Surface the merchandiser-relevant RICS columns. Anything storefront-facing
  // copywriting belongs in ProductContent (Postgres) and is merged after.
  return {
    Vendor: row.Vendor?.trim() || null,
    'Category code': row.Category != null ? String(row.Category) : null,
    Category: cat?.name ?? null,
    Department: cat?.departmentName ?? null,
    Cost: row.CurrentCost != null ? String(row.CurrentCost) : null,
    'List price': row.ListPrice != null ? String(row.ListPrice) : null,
    'Retail price': row.RetailPrice != null ? String(row.RetailPrice) : null,
    'Markdown 1': row.MarkDownPrice1 != null ? String(row.MarkDownPrice1) : null,
    'Markdown 2': row.MarkDownPrice2 != null ? String(row.MarkDownPrice2) : null,
    Season: row.Season?.trim() || null,
    Location: row.Location?.trim() || null,
    'Group code': row.GroupCode?.trim() || null,
    'Vendor SKU': row.VendorSKU?.trim() || null,
    'Label code': row.LabelCode?.trim() || null,
    'Color code': row.ColorCode?.trim() || null,
    'Size type': sizeType?.desc ?? (row.SizeType != null ? String(row.SizeType) : null),
    'Order multiple': row.OrderMultiple != null ? String(row.OrderMultiple) : null,
    'Order UOM': row.OrderUOM?.trim() || null,
    'Oversize column': row.OverSizeColumn?.trim() || null,
    'Oversize amount': row.OverSizeAmount != null ? String(row.OverSizeAmount) : null,
    Perks: row.Perks != null && row.Perks > 0 ? String(row.Perks) : null,
    'Coupon SKU': row.Coupon ? 'Yes' : null,
    Comment: row.Comment?.trim() || null,
  };
}

function pictureUrl(fileName: string | null | undefined): string | null {
  // RICS stores picture file names only (e.g. "DMTDU1BK.jpg"). The underlying
  // files live on the RICS host at C:\RICSWIN\ricspics and are served by
  // Express via the `/rics-images` static mount in app.ts (configurable with
  // the RICS_IMAGES_DIR env var).
  const s = fileName?.trim();
  if (!s) return null;
  return `/rics-images/${encodeURIComponent(s)}`;
}

// ─────────────────────────── sorting / filter translation ─────────────────

function sortCards(
  cards: ProductCard[],
  rows: InventoryMasterRow[],
  sort: string,
  order: 'asc' | 'desc',
): ProductCard[] {
  const dir = order === 'desc' ? -1 : 1;

  // For "newest" we look back at the source row's DateLastChanged. RICS dates
  // come over the wire as `/Date(epochMs)/` (Microsoft JSON date format) — the
  // raw substring sorts in chronological order so a string compare is fine.
  if (sort === 'newest') {
    const dateBySku = new Map<string, string>();
    for (const r of rows) {
      if (r.SKU && r.DateLastChanged) dateBySku.set(r.SKU, r.DateLastChanged);
    }
    return [...cards].sort((a, b) => {
      const da = dateBySku.get(a.id) ?? '';
      const db = dateBySku.get(b.id) ?? '';
      if (da < db) return -1 * dir;
      if (da > db) return 1 * dir;
      return 0;
    });
  }

  const by = sort === 'price'
    ? (c: ProductCard) => c.price
    : (c: ProductCard) => c.name.toLowerCase();
  return [...cards].sort((a, b) => {
    const va = by(a);
    const vb = by(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function filterToListParams(f: FacetFilterParams): ProductListParams {
  return {
    page: 1,
    limit: 5000,
    sort: 'name',
    order: 'asc',
    q: undefined,
    categoryId: f.categoryId,
    department: f.department,
    brandId: f.brandId,
    colorId: f.colorId,
    sizeLabel: f.size,
    minPrice: undefined,
    maxPrice: undefined,
    materialId: undefined,
    shoeTypeId: undefined,
  };
}

// ─────────────────────────── facet aggregation ────────────────────────────

function aggregateFacets(
  cards: ProductCard[],
  rows: InventoryMasterRow[],
  categories: Map<number, CategoryRow>,
  sizeTypes: Map<number, SizeTypeRow>,
  brandIndex: BrandIndex,
): FacetsResult {
  const catCounts = new Map<number, number>();
  // Brand counts are scoped to the currently-filtered rows, but the *id* for
  // each brand still comes from the unfiltered brandIndex so the storefront's
  // subsequent `?brandId=N` filter round-trips consistently.
  const brandCounts = new Map<string, number>();
  const deptCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = 0;

  for (const r of rows) {
    if (r.Category != null) catCounts.set(r.Category, (catCounts.get(r.Category) ?? 0) + 1);
    if (r.Vendor) {
      const v = r.Vendor.trim();
      brandCounts.set(v, (brandCounts.get(v) ?? 0) + 1);
    }
    // Sizes facet: derive from each row's SizeType column labels (RISIZE).
    // Counts how many SKUs *could* be available in that size, not actual stock.
    // True stock-aware sizes need RIINVQUA — out of scope until inventory wiring.
    if (r.SizeType != null) {
      const st = sizeTypes.get(Number(r.SizeType));
      if (st) {
        for (const label of st.columns) {
          sizeCounts.set(label, (sizeCounts.get(label) ?? 0) + 1);
        }
      }
    }
    const p = resolveCurrentPrice(r);
    if (p > 0) {
      if (p < minPrice) minPrice = p;
      if (p > maxPrice) maxPrice = p;
    }
  }
  for (const c of cards) {
    if (c.department) deptCounts.set(c.department, (deptCounts.get(c.department) ?? 0) + 1);
  }

  return {
    // Brands: emit a stable {id,name,count} per vendor present in the filtered
    // result, using ids from the shared BrandIndex so `brandId` filter requests
    // from the storefront can be mapped back to a vendor code.
    brands: [...brandCounts.entries()]
      .map(([code, count]) => {
        const entry = brandIndex.byCode.get(code);
        return entry
          ? { id: entry.id, name: entry.name, count }
          : { id: -1, name: code, count };
      })
      .filter((b) => b.id > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
    colors: [], // RICS has no color taxonomy; ColorCode is free text per SKU.
    sizes: [...sizeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([label, count]) => ({ label, count })),
    categories: [...catCounts.entries()]
      .map(([num, count]) => ({ id: num, name: categories.get(num)?.name ?? `Cat ${num}`, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
    departments: [...deptCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    materials: [], // not tracked in RICS; materials live in ProductContent.
    priceRange: {
      min: minPrice === Number.POSITIVE_INFINITY ? 0 : Math.floor(minPrice),
      max: Math.ceil(maxPrice),
    },
  };
}

// ─────────────────────────── ProductContent overlay merge ─────────────────

interface OverlayRow {
  ricsSkuCode: string;
  webDescription: string | null;
  heroImageUrl: string | null;
  specsJson: unknown;
}

async function loadOverlayMap(ids: string[]): Promise<Map<string, OverlayRow>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await prisma.productContent.findMany({
      where: { ricsSkuCode: { in: ids } },
    });
    const map = new Map<string, OverlayRow>();
    for (const r of rows) {
      map.set(r.ricsSkuCode, {
        ricsSkuCode: r.ricsSkuCode,
        webDescription: r.webDescription,
        heroImageUrl: r.heroImageUrl,
        specsJson: r.specsJson,
      });
    }
    return map;
  } catch (err: any) {
    console.warn('[ricsProductAdapter] content overlay unavailable:', err.message);
    return new Map();
  }
}

async function mergeOverlayOntoCards(cards: ProductCard[]): Promise<ProductCard[]> {
  if (cards.length === 0) return cards;
  const overlays = await loadOverlayMap(cards.map((c) => c.id));
  return cards.map((c) => {
    const ov = overlays.get(c.id);
    if (!ov) return c;
    return { ...c, mainImage: ov.heroImageUrl ?? c.mainImage };
  });
}

async function mergeOverlayOntoDetail(detail: ProductDetail): Promise<ProductDetail> {
  const overlay = (await loadOverlayMap([detail.id])).get(detail.id);
  if (!overlay) return detail;
  return {
    ...detail,
    description: overlay.webDescription ?? detail.description,
    mainImage: overlay.heroImageUrl ?? detail.mainImage,
    specs: { ...detail.specs, ...((overlay.specsJson as Record<string, string | null> | null) ?? {}) },
  };
}

// ─────────────────────────── POS-facing adapter methods ───────────────────
// The register needs the full catalog (not just the storefront season/category
// slice) plus all RICS price slots. Keep a separate, unfiltered snapshot and
// serve SKU search / lookup / price-slot reads from it.

const POS_SNAPSHOT_TTL_MS = 10 * 60_000;
const POS_SNAPSHOT_CAP = 50_000;

export interface PosSku {
  skuCode: string;
  description: string | null;
  styleColor: string | null;
  vendorCode: string | null;
  vendorName: string | null;
  categoryNumber: number | null;
  categoryName: string | null;
  department: string | null;
  sizeType: number | null;
  currentPriceSlot: 1 | 2 | 3 | 4;
  currentPrice: number;
  listPrice: number | null;
  retailPrice: number | null;
  markDown1: number | null;
  markDown2: number | null;
  currentCost: number | null;
  perks: number | null;
  coupon: boolean;
  overSizeColumn: string | null;
  overSizeAmount: number | null;
  pictureFileName: string | null;
  status: string | null;
}

export interface PriceSlots {
  skuCode: string;
  currentSlot: 1 | 2 | 3 | 4;
  list: number | null;
  retail: number | null;
  markDown1: number | null;
  markDown2: number | null;
  nextPriceRotation: Array<{ slot: 1 | 2 | 3 | 4; label: string; value: number }>;
}

async function loadPosInventorySnapshot(): Promise<InventoryMasterRow[]> {
  return cachedAsync('pos:inv:snapshot', POS_SNAPSHOT_TTL_MS, async () => {
    const dbPath = INVMAS_MDB();
    if (!fs.existsSync(dbPath)) {
      console.warn(`[ricsProductAdapter] RIINVMAS not found at ${dbPath}; POS snapshot empty.`);
      return [];
    }
    const password = getOrRecoverPassword(dbPath);

    // Full catalog for the register — no season/category filter.
    const sql = `
SELECT TOP ${POS_SNAPSHOT_CAP}
  [SKU], [VendorSKU], [Category], [Vendor], [SizeType], [Desc], [StyleColor],
  [Season], [Location],
  [ListPrice], [RetailPrice], [MarkDownPrice1], [MarkDownPrice2], [CurrentPrice], [CurrentCost],
  [OverSizeColumn], [OverSizeAmount], [Perks],
  [Manufacturer], [LabelCode], [ColorCode], [Comment], [GroupCode], [KeyWords],
  [PictureFileName], [Coupon], [LastPriceChange], [Status],
  [DateLastChanged], [OrderMultiple], [OrderUOM]
FROM [InventoryMaster]
WHERE [RetailPrice] > 0
  AND ([Status] IS NULL OR [Status] <> 'D')
ORDER BY [Desc]
`.trim();

    const t0 = Date.now();
    try {
      const raw = await runPowerShellJson<InventoryMasterRow | InventoryMasterRow[]>(
        buildSelectScript(dbPath, password, sql),
      );
      const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
      console.log(`[ricsProductAdapter] POS snapshot loaded: ${rows.length} rows in ${Date.now() - t0}ms`);
      return rows;
    } catch (err: any) {
      console.error('[ricsProductAdapter] POS snapshot load failed:', err.message);
      return [];
    }
  });
}

// ─────────────────────────── uncapped SKU lookup index ────────────────────
// Dedicated in-memory index for the SKU Lookup modal. Unlike the POS snapshot
// (capped at 50k rows for the register), this must cover EVERY SKU in the
// catalog so the inquiry modal can find any SKU the user types. To keep the
// cold load reasonable on a large InventoryMaster, we project only the
// columns the modal actually renders — SKU, Desc, Vendor, Category,
// StyleColor, plus the price slots needed for `resolveCurrentPrice`.

const SKU_LOOKUP_INDEX_TTL_MS = 10 * 60_000;

type SkuLookupIndexRow = Pick<
  InventoryMasterRow,
  'SKU' | 'Desc' | 'Vendor' | 'Category' | 'StyleColor'
    | 'ListPrice' | 'RetailPrice' | 'MarkDownPrice1' | 'MarkDownPrice2' | 'CurrentPrice'
>;

async function loadSkuLookupIndex(): Promise<SkuLookupIndexRow[]> {
  return cachedAsync('sku:lookup:index', SKU_LOOKUP_INDEX_TTL_MS, async () => {
    const dbPath = INVMAS_MDB();
    if (!fs.existsSync(dbPath)) {
      console.warn(`[ricsProductAdapter] RIINVMAS not found at ${dbPath}; SKU lookup index empty.`);
      return [];
    }
    const password = getOrRecoverPassword(dbPath);

    // Narrow projection + no TOP cap + sort by [SKU] so the modal's default
    // sort (SKU ascending) can stream straight from the cached array. Omit
    // discontinued SKUs (Status='D') but keep zero-price SKUs — operators
    // need to look up any SKU, not just currently-priced ones.
    const sql = `
SELECT
  [SKU], [Desc], [Vendor], [Category], [StyleColor],
  [ListPrice], [RetailPrice], [MarkDownPrice1], [MarkDownPrice2], [CurrentPrice]
FROM [InventoryMaster]
WHERE ([Status] IS NULL OR [Status] <> 'D')
ORDER BY [SKU]
`.trim();

    const t0 = Date.now();
    try {
      const raw = await runPowerShellJson<SkuLookupIndexRow | SkuLookupIndexRow[]>(
        buildSelectScript(dbPath, password, sql),
      );
      const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
      console.log(`[ricsProductAdapter] SKU lookup index loaded: ${rows.length} rows in ${Date.now() - t0}ms`);
      return rows;
    } catch (err: any) {
      console.error('[ricsProductAdapter] SKU lookup index load failed:', err.message);
      return [];
    }
  });
}

/** Warmup hook — pull the index on startup so the first user request is fast. */
export async function warmupSkuLookupIndex(): Promise<void> {
  await loadSkuLookupIndex();
}

function invRowToPosSku(
  r: InventoryMasterRow,
  categories: Map<number, CategoryRow>,
  vendors: Map<string, VendorRow>,
): PosSku | null {
  if (!r.SKU) return null;
  const cat = r.Category != null ? categories.get(r.Category) : null;
  const vnd = r.Vendor ? vendors.get(r.Vendor.trim()) : null;
  const slot = (Number(r.CurrentPrice ?? 2) as 1 | 2 | 3 | 4);
  return {
    skuCode: r.SKU.trim(),
    description: r.Desc?.trim() ?? null,
    styleColor: r.StyleColor?.trim() ?? null,
    vendorCode: r.Vendor?.trim() ?? null,
    vendorName: vnd?.manuName?.trim() || vnd?.shortName?.trim() || r.Vendor?.trim() || null,
    categoryNumber: r.Category ?? null,
    categoryName: cat?.name ?? null,
    department: cat?.departmentName ?? null,
    sizeType: r.SizeType ?? null,
    currentPriceSlot: [1, 2, 3, 4].includes(slot) ? slot : 2,
    currentPrice: resolveCurrentPrice(r),
    listPrice: r.ListPrice ?? null,
    retailPrice: r.RetailPrice ?? null,
    markDown1: r.MarkDownPrice1 ?? null,
    markDown2: r.MarkDownPrice2 ?? null,
    currentCost: r.CurrentCost ?? null,
    perks: r.Perks ?? null,
    coupon: Boolean(r.Coupon),
    overSizeColumn: r.OverSizeColumn?.trim() ?? null,
    overSizeAmount: r.OverSizeAmount ?? null,
    pictureFileName: r.PictureFileName?.trim() ?? null,
    status: r.Status?.trim() ?? null,
  };
}

/**
 * Text search against the POS snapshot — matches SKU code, Desc, VendorSKU,
 * or KeyWords. Returns up to `limit` results ordered by description.
 */
export async function searchPosSkus(q: string, limit = 20): Promise<PosSku[]> {
  const [snapshot, categories, vendors] = await Promise.all([
    loadPosInventorySnapshot(),
    loadCategoryMap(),
    loadVendorMap(),
  ]);
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const matches: InventoryMasterRow[] = [];
  for (const r of snapshot) {
    const hay =
      (r.SKU ?? '').toLowerCase() +
      '\n' + (r.Desc ?? '').toLowerCase() +
      '\n' + (r.VendorSKU ?? '').toLowerCase() +
      '\n' + (r.KeyWords ?? '').toLowerCase();
    if (hay.includes(needle)) matches.push(r);
    if (matches.length >= limit * 2) break; // over-fetch for sorting stability
  }
  return matches
    .map((r) => invRowToPosSku(r, categories, vendors))
    .filter((s): s is PosSku => s !== null)
    .slice(0, limit);
}

/** Single SKU lookup by RICS SKU code (exact match). Returns null if not found. */
export async function getPosSku(skuCode: string): Promise<PosSku | null> {
  const [snapshot, categories, vendors] = await Promise.all([
    loadPosInventorySnapshot(),
    loadCategoryMap(),
    loadVendorMap(),
  ]);
  const target = skuCode.trim().toUpperCase();
  const row = snapshot.find((r) => (r.SKU ?? '').trim().toUpperCase() === target);
  if (!row) return null;
  return invRowToPosSku(row, categories, vendors);
}

// ── SKU Lookup modal search ──────────────────────────────────────────────────

export type SkuLookupSort = 'SKU' | 'DESCRIPTION' | 'VENDOR' | 'STYLE_COLOR';

export interface SkuLookupRow {
  skuId: string;
  skuCode: string;
  description: string;
  vendor: string;
  category: string;
  styleColor: string | null;
  currentPrice: number | null;
}

export interface SkuLookupParams {
  q?: string;
  descContains?: string;
  wholeWord?: boolean;
  sort?: SkuLookupSort;
  limit?: number;
  offset?: number;
}

/**
 * Search the POS inventory snapshot, with a live-query fallback for SKUs
 * the snapshot doesn't cover.
 *
 * The snapshot is capped at POS_SNAPSHOT_CAP rows (currently 50k) ordered
 * by Desc, so SKUs whose description sorts past that cap are missing
 * (e.g. the `ZN02-*` series). When the snapshot prefix filter finds nothing
 * but `q` is non-empty, fall back to a small live prefix query against
 * InventoryMaster — reusing the same queryAll() pattern that loadMasterBySku
 * uses for single-SKU lookup.
 */
export async function searchSkusForLookup(
  params: SkuLookupParams,
): Promise<{ rows: SkuLookupRow[]; total: number }> {
  // Backed by the uncapped SKU lookup index — every non-discontinued SKU in
  // InventoryMaster is in memory, so there are no cap-related blind spots.
  // The live-DB fallback that used to sit here is no longer needed.
  const index = await loadSkuLookupIndex();
  const q = (params.q ?? '').trim().toLowerCase();
  const desc = (params.descContains ?? '').trim().toLowerCase();
  const whole = !!params.wholeWord;

  let filtered = index.filter((row) => {
    const skuCode = String(row.SKU ?? '').toLowerCase();
    const description = String(row.Desc ?? '').toLowerCase();
    if (q && !skuCode.startsWith(q)) return false;
    if (desc) {
      if (whole) {
        const tokens = description.split(/\s+/);
        if (!tokens.includes(desc)) return false;
      } else if (!description.includes(desc)) {
        return false;
      }
    }
    return true;
  });

  const sort: SkuLookupSort = params.sort ?? 'SKU';
  const sortKey = (row: SkuLookupIndexRow): string => {
    switch (sort) {
      case 'DESCRIPTION': return String(row.Desc ?? '');
      case 'VENDOR':      return String(row.Vendor ?? '');
      case 'STYLE_COLOR': return String(row.StyleColor ?? '');
      case 'SKU':
      default:            return String(row.SKU ?? '');
    }
  };
  if (sort !== 'SKU') {
    // Index is already ordered by SKU from the SQL side, so skip re-sorting
    // in the common case — saves real time on a 200k+ row set.
    filtered = filtered.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }

  const total = filtered.length;
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.max(1, Math.min(params.limit ?? 50, 500));
  const page = filtered.slice(offset, offset + limit);

  const rows: SkuLookupRow[] = page.map((row) => ({
    skuId: String(row.SKU ?? ''),
    skuCode: String(row.SKU ?? ''),
    description: String(row.Desc ?? ''),
    vendor: String(row.Vendor ?? ''),
    category: String(row.Category ?? ''),
    styleColor: row.StyleColor ? String(row.StyleColor) : null,
    currentPrice: resolveCurrentPrice(row) || null,
  }));

  return { rows, total };
}

/**
 * Return all four price slots for a SKU plus the current slot selector.
 * RICS p. 32 [Next Price] button cycles through non-null, non-zero slots.
 */
export async function getPriceSlots(skuCode: string): Promise<PriceSlots | null> {
  const sku = await getPosSku(skuCode);
  if (!sku) return null;
  const rotation: Array<{ slot: 1 | 2 | 3 | 4; label: string; value: number }> = [];
  const add = (slot: 1 | 2 | 3 | 4, label: string, value: number | null) => {
    if (value != null && value > 0) rotation.push({ slot, label, value });
  };
  add(1, 'List', sku.listPrice);
  add(2, 'Retail', sku.retailPrice);
  add(3, 'Markdown 1', sku.markDown1);
  add(4, 'Markdown 2', sku.markDown2);
  return {
    skuCode: sku.skuCode,
    currentSlot: sku.currentPriceSlot,
    list: sku.listPrice,
    retail: sku.retailPrice,
    markDown1: sku.markDown1,
    markDown2: sku.markDown2,
    nextPriceRotation: rotation,
  };
}

/**
 * List currently-active promotion codes. RICS stores these in RIPROMOS.MDB
 * (p. 167). Not every deployment has this file wired — return an empty list
 * if the file is unreachable. Extend later to read the real Promotions table.
 */
export async function listActivePromotions(
  _storeId: number,
  _asOf: Date = new Date(),
): Promise<Array<{ code: string; description: string | null; startDate: string | null; endDate: string | null }>> {
  // Stage 1 placeholder — returns empty until RIPROMOS wiring is added.
  // Preserves the contract shape so the POS picker renders gracefully.
  return [];
}

/**
 * List return codes from RIRETCOD.MDB. Same treatment as promotions — empty
 * placeholder until the MDB is wired. Preserves contract shape.
 */
export async function listReturnCodes(): Promise<
  Array<{ code: string; description: string; trackable: boolean }>
> {
  return [];
}
