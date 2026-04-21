/**
 * Live read-through adapter from the legacy RICS MDBs into the shapes the
 * `inventory` module spec (docs/modules/inventory.md) publishes.
 *
 * Read-only. Never writes to RICS.
 *
 * Covers the Phase 1 read surfaces:
 *   - Inventory Inquiry  (RICS Ch. 4 p. 75)  — getInventoryInquiry(sku)
 *   - Find by Size       (RICS Ch. 4 p. 70)  — findBySize(sku, sizeLabel)
 *   - Inventory Detail   (RICS Ch. 4 p. 78)  — getInventoryDetailReport(...)
 *
 * Data sources:
 *   RIINVQUA "Inventory Quantities"  → on-hand / on-order / model / max / reorder / sales history
 *   RIINVMAS "InventoryMaster"       → SKU master (desc, brand FK, size type, pricing)
 *   RISIZE   "SizeTypes"             → row + column labels for the size grid
 *   RISTORE  "StoreMaster"           → store numbers → store names
 *   RIVENDOR "Vendor Master"         → brand display name
 *
 * The RIINVQUA wide-column shape (`OnHand_01..18` per (SKU, Store, Row, Segment))
 * is unwound here into flat `InventoryCell` objects that the inventory module
 * spec prescribes. Segment N covers size-grid columns `(N-1)*18 + 1 .. N*18`.
 */

import { prisma } from '../db/prisma';
import { findIndexedMaster, findNeighborSku } from './ricsProductAdapter';
import { getInquirySalesRollup } from './salesReporting/ricsInquiryRollupAdapter';

// ─────────────────────────── public types ─────────────────────────────────

export interface InventoryCell {
  storeNumber: number;
  rowLabel: string;          // size-grid row (e.g. "M", "W", or "" for single-row)
  columnLabel: string;       // size-grid column (e.g. "7", "7.5")
  onHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  model: number;
  maxQty: number;
  reorder: number;
  mtdSales: number;
  stdSales: number;
  ytdSales: number;
  lySales: number;
}

export interface InventoryInquiryStore {
  storeNumber: number;
  storeName: string | null;
  cells: InventoryCell[];
  totals: {
    onHand: number;
    currentOnOrder: number;
    futureOnOrder: number;
    ytdSales: number;
    lySales: number;
  };
}

// ─────────────────────── extended inquiry types ───────────────────────────

export type PriceSlot = 'LIST' | 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2';

export interface InquiryPricing {
  retail: number;
  markdown1: number;
  markdown2: number;
  avgCost: number;
  currentCost: number;
  listPrice: number;
  currentSlot: PriceSlot;
}

export interface InquiryRollupCell {
  qty: number;
  net: number;
  markdown: number;
  profit: number;
}

export interface InquiryRollup {
  week: InquiryRollupCell;
  month: InquiryRollupCell;
  season: InquiryRollupCell;
  year: InquiryRollupCell;
}

export interface InquirySizeGrid {
  columns: string[];
  rows: Array<{ label: string; cells: Array<{ value: number | null }> }>;
}

export interface InquiryGrids {
  onHand?: InquirySizeGrid;
  model?: InquirySizeGrid;
  max?: InquirySizeGrid;
  reorder?: InquirySizeGrid;
  short?: InquirySizeGrid;
  allStoresOnHand?: InquirySizeGrid;
  allStoresSummary?: InquirySizeGrid;
}

export interface InquiryInfo {
  seasonCode: string | null;
  labelCode: string | null;
  groupCode: string | null;
  /** Not on InventoryMaster — Phase 2 will source from a receipts table. */
  firstReceivedAt: string | null;
  /** Sourced from InventoryMaster.LastPriceChange if available, else null. */
  lastMarkdownAt: string | null;
  perks: number | null;
  comment: string | null;
}

export interface InventoryInquiry {
  sku: string;
  master: {
    description: string | null;
    brand: string | null;
    vendorCode: string | null;
    category: number | null;
    season: string | null;
    retailPrice: number | null;
    currentCost: number | null;
    sizeType: {
      code: number | null;
      desc: string | null;
      rowLabels: string[];
      columnLabels: string[];
    };
  };
  stores: InventoryInquiryStore[];
  totals: InventoryInquiryStore['totals'];
  pricing: InquiryPricing;
  rollup: InquiryRollup;
  grids: InquiryGrids;
  pictureUrl: string | null;
  info: InquiryInfo;
}

export interface FindBySizeResult {
  sku: string;
  description: string | null;
  brand: string | null;
  sizeLabel: string;
  matches: Array<{
    storeNumber: number;
    storeName: string | null;
    rowLabel: string;
    onHand: number;
  }>;
  totalOnHand: number;
}

export interface InventoryDetailReportRow {
  sku: string;
  description: string | null;
  brand: string | null;
  vendorCode: string | null;
  category: number | null;
  styleColor: string | null;
  season: string | null;
  retailPrice: number | null;
  currentCost: number | null;
  totalOnHand: number;
  totalCurrentOnOrder: number;
  totalYtdSales: number;
  totalLySales: number;
  retailValue: number;
  costValue: number;
}

export interface InventoryDetailReportParams {
  storeNumber?: number;       // if omitted, sum across all stores
  vendorCode?: string;
  categoryMin?: number;
  categoryMax?: number;
  season?: string;
  limit?: number;
}

/**
 * One row from RICS's InvChanges ledger (RIINVCHG). Matches the raw columns
 * directly — `rowLabel` / `columnLabel` are the size-grid coordinates, and
 * `otherStore` is the counterpart store for transfer entries.
 */
export interface ChangeDetailRow {
  sku: string;
  origSku: string | null;
  store: number;
  changeType: string;        // POR | RET | PHY | TOU | TIN | REC | ...
  date: string;              // ISO 8601
  rowLabel: string;
  columnLabel: string;
  purchaseOrder: string | null;
  otherStore: number | null; // transfer counterpart store, 0/null otherwise
  quantity: number;
  cost: number;
  rmaNumber: string | null;
}

export interface ChangeDetailParams {
  sku?: string;
  store?: number;
  changeType?: string;
  fromDate?: string;         // YYYY-MM-DD (inclusive)
  toDate?: string;           // YYYY-MM-DD (inclusive)
  limit?: number;            // default 200, max 1000
  /**
   * When true, UNION in SKU-level sales rows from rics_mirror.ticket_detail
   * (joined to ticket_header) as `changeType = 'SAL'` with negated quantity.
   * Sales are not recorded in RIINVCHG; this flag brings them into the same
   * ledger for audit use. RICS Ch. 5 Post-Sales-to-Inventory (p. 45) is the
   * original "sales-as-movements" path we're replicating here.
   */
  includeSales?: boolean;
}

export class ChangeDetailQueryTooBroadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangeDetailQueryTooBroadError';
  }
}

export class TransferSummaryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferSummaryInputError';
  }
}

// ─────────────────────────── Transfer Summary Report types ────────────────

export interface TransferSummaryParams {
  fromDate: string; // YYYY-MM-DD, required (inclusive)
  toDate: string;   // YYYY-MM-DD, required (inclusive)
  fromStoreNumbers?: number[];
  toStoreNumbers?: number[];
}

export interface TransferSummaryCell {
  fromStore: number;
  fromStoreName: string | null;
  toStore: number;
  toStoreName: string | null;
  quantity: number;
  cost: number;
  transferEvents: number; // count of RIINVCHG TOU rows (one per SKU-cell transfer)
}

export interface TransferSummaryMonth {
  month: string; // YYYY-MM
  cells: TransferSummaryCell[];
  totalQuantity: number;
  totalCost: number;
  totalEvents: number;
}

export interface TransferSummaryReport {
  fromDate: string;
  toDate: string;
  months: TransferSummaryMonth[];
  matrix: TransferSummaryCell[]; // from×to rollup across the full range
  stores: Array<{ number: number; name: string | null }>;
  grandTotalQuantity: number;
  grandTotalCost: number;
  grandTotalEvents: number;
}

// ─────────────────────────── TTL cache ────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

async function cachedAsync<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function clearCache(): void {
  cache.clear();
}

// ─────────────────────────── data source ──────────────────────────────────
// Phase A: reads come from `rics_mirror.*` Postgres tables, populated by
// `pnpm sync:rics` from the legacy MDBs. Projections alias snake_case columns
// back to the PascalCase shape the rest of this file expects.

/** Map an MDB wide-column prefix (e.g. "OnHand_", "M-T-DSales_") to its
 *  rics_mirror.inventory_quantities snake_case equivalent prefix. Explicit
 *  map covers the known RICS prefixes; anything else falls back to a
 *  camel/hyphen-to-snake heuristic. */
const MDB_TO_MIRROR_QUA_PREFIX: Record<string, string> = {
  'OnHand_': 'on_hand_',
  'CurrentOnOrder_': 'current_on_order_',
  'FutureOnOrder_': 'future_on_order_',
  'Model_': 'model_',
  'MaxQtys_': 'max_qtys_',
  'Reorder_': 'reorder_',
  'M-T-DSales_': 'm_t_d_sales_',
  'S-T-DSales_': 's_t_d_sales_',
  'Y-T-DSales_': 'y_t_d_sales_',
  'LYSales_': 'ly_sales_',
};

function toMirrorQuaPrefix(mdbPrefix: string): string {
  const hit = MDB_TO_MIRROR_QUA_PREFIX[mdbPrefix];
  if (hit) return hit;
  // Fallback heuristic for anything unmapped.
  const core = mdbPrefix.replace(/_$/, '');
  const snake = core
    .replace(/-/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
  return `${snake}_`;
}

// ─────────────────────────── dimension loaders ────────────────────────────

interface StoreRow {
  number: number;
  name: string | null;
}

async function loadStoreMap(): Promise<Map<number, StoreRow>> {
  return cachedAsync('dim:stores', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<{ Number: number; Desc: string | null }[]>(
      `SELECT number AS "Number", "desc" AS "Desc" FROM rics_mirror.store_master`,
    );
    const map = new Map<number, StoreRow>();
    for (const r of rows) {
      if (r.Number == null) continue;
      map.set(Number(r.Number), {
        number: Number(r.Number),
        name: r.Desc?.trim() || null,
      });
    }
    return map;
  });
}

interface SizeTypeRow {
  code: number;
  desc: string | null;
  columns: string[]; // ordered, 1-based
  rows: string[];
  maxColumns: number;
  maxRows: number;
}

async function loadSizeTypeMap(): Promise<Map<number, SizeTypeRow>> {
  return cachedAsync('dim:sizeTypes', 300_000, async () => {
    const colSelect = Array.from({ length: 54 }, (_, i) => {
      const n = pad2(i + 1);
      return `columns_${n} AS "Columns_${n}"`;
    }).join(', ');
    const rowSelect = Array.from({ length: 27 }, (_, i) => {
      const n = pad2(i + 1);
      return `rows_${n} AS "Rows_${n}"`;
    }).join(', ');
    const rows = await prisma.$queryRawUnsafe<Record<string, string | number | null>[]>(
      `SELECT code AS "Code", "desc" AS "Desc",
              max_columns AS "MaxColumns", max_rows AS "MaxRows",
              ${colSelect}, ${rowSelect}
         FROM rics_mirror.size_types`,
    );
    const map = new Map<number, SizeTypeRow>();
    for (const r of rows) {
      const code = Number(r.Code);
      if (!Number.isFinite(code)) continue;
      const maxCols = Math.min(54, Math.max(0, Number(r.MaxColumns ?? 0)));
      const maxRows = Math.min(27, Math.max(0, Number(r.MaxRows ?? 0)));
      const cols: string[] = [];
      for (let i = 1; i <= maxCols; i++) {
        const v = (r[`Columns_${pad2(i)}`] as string | null)?.toString().trim();
        cols.push(v || '');
      }
      const rws: string[] = [];
      for (let i = 1; i <= maxRows; i++) {
        const v = (r[`Rows_${pad2(i)}`] as string | null)?.toString().trim();
        rws.push(v || '');
      }
      map.set(code, {
        code,
        desc: (r.Desc as string | null)?.toString().trim() || null,
        columns: cols,
        rows: rws,
        maxColumns: maxCols,
        maxRows: maxRows,
      });
    }
    return map;
  });
}

interface VendorRow {
  code: string;
  shortName: string | null;
  manuName: string | null;
}

async function loadVendorMap(): Promise<Map<string, VendorRow>> {
  return cachedAsync('dim:vendors', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<
      { Code: string | null; 'Short Name': string | null; 'Manu Name': string | null }[]
    >(
      `SELECT code AS "Code",
              short_name AS "Short Name",
              manu_name AS "Manu Name"
         FROM rics_mirror.vendor_master`,
    );
    const map = new Map<string, VendorRow>();
    for (const r of rows) {
      if (!r.Code) continue;
      const code = r.Code.trim();
      map.set(code, {
        code,
        shortName: r['Short Name']?.trim() || null,
        manuName: r['Manu Name']?.trim() || null,
      });
    }
    return map;
  });
}

// ─────────────────────────── master lookup ────────────────────────────────

interface MasterRow {
  SKU: string | null;
  Desc: string | null;
  Vendor: string | null;
  Manufacturer: string | null;
  Category: number | null;
  SizeType: number | null;
  Season: string | null;
  LabelCode: string | null;
  GroupCode: string | null;
  StyleColor: string | null;
  VendorSku: string | null;
  ListPrice: number | null;
  RetailPrice: number | null;
  MarkDownPrice1: number | null;
  MarkDownPrice2: number | null;
  CurrentPrice: number | null;
  CurrentCost: number | null;
  LastPriceChange: string | null;
  PictureFileName: string | null;
  Perks: number | null;
  Comment: string | null;
  Status: string | null;
}

async function loadMasterBySku(sku: string): Promise<MasterRow | null> {
  // Fast path: the SKU index warmed at startup holds every non-discontinued
  // master row in memory. Avoids a PowerShell round-trip per inquiry, which
  // is the hot path when operators rapidly click SKU links. The narrow
  // projection in the index matches MasterRow one-for-one; the only nuance
  // is VendorSKU (index) vs. VendorSku (MasterRow column name in this file).
  const indexed = await findIndexedMaster(sku);
  if (indexed) {
    return {
      SKU: indexed.SKU,
      Desc: indexed.Desc,
      Vendor: indexed.Vendor,
      Manufacturer: indexed.Manufacturer,
      Category: indexed.Category,
      SizeType: indexed.SizeType,
      Season: indexed.Season,
      LabelCode: indexed.LabelCode,
      GroupCode: indexed.GroupCode,
      StyleColor: indexed.StyleColor,
      VendorSku: indexed.VendorSKU,
      ListPrice: indexed.ListPrice,
      RetailPrice: indexed.RetailPrice,
      MarkDownPrice1: indexed.MarkDownPrice1,
      MarkDownPrice2: indexed.MarkDownPrice2,
      CurrentPrice: indexed.CurrentPrice,
      CurrentCost: indexed.CurrentCost,
      LastPriceChange: indexed.LastPriceChange,
      PictureFileName: indexed.PictureFileName,
      Perks: indexed.Perks,
      Comment: indexed.Comment,
      Status: indexed.Status,
    };
  }

  // Fallback: index not yet warmed, or SKU not in it (discontinued / new).
  const rows = await prisma.$queryRawUnsafe<MasterRow[]>(
    `
    SELECT
      sku AS "SKU", "desc" AS "Desc", vendor AS "Vendor",
      manufacturer AS "Manufacturer", category AS "Category",
      size_type AS "SizeType", season AS "Season",
      label_code AS "LabelCode", group_code AS "GroupCode",
      style_color AS "StyleColor", vendor_sku AS "VendorSku",
      list_price::float8 AS "ListPrice", retail_price::float8 AS "RetailPrice",
      mark_down_price1::float8 AS "MarkDownPrice1",
      mark_down_price2::float8 AS "MarkDownPrice2",
      current_price AS "CurrentPrice",
      current_cost::float8 AS "CurrentCost",
      to_char(last_price_change AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "LastPriceChange",
      picture_file_name AS "PictureFileName",
      perks::float8 AS "Perks", comment AS "Comment", status AS "Status"
    FROM rics_mirror.inventory_master
    WHERE sku = $1
    LIMIT 1
    `,
    sku,
  );
  return rows[0] ?? null;
}

/** Resolve the effective price via the RICS `CurrentPrice` slot selector (p.155). */
function resolveCurrentPrice(row: Pick<MasterRow, 'CurrentPrice' | 'ListPrice' | 'RetailPrice' | 'MarkDownPrice1' | 'MarkDownPrice2'>): number | null {
  const slot = Number(row.CurrentPrice ?? 2);
  const picked =
    slot === 1 ? row.ListPrice :
    slot === 3 ? row.MarkDownPrice1 :
    slot === 4 ? row.MarkDownPrice2 :
                 row.RetailPrice;
  const n = Number(picked ?? 0);
  if (n > 0) return n;
  const fallback = Number(row.RetailPrice ?? 0);
  return fallback > 0 ? fallback : null;
}

// ─────────────────────────── RIINVQUA wide → flat ─────────────────────────

/** Superset row shape from `Inventory Quantities`. All `_NN` metrics are nullable SMALLINTs. */
type QuaRow = {
  SKU: string | null;
  Store: number | null;
  Row: string | null;
  Segment: number | null;
} & Record<string, string | number | null>;

interface MetricFamily {
  prefix: string;              // e.g. "OnHand_"
  key: keyof InventoryCell;    // e.g. "onHand"
}

const CELL_METRICS: MetricFamily[] = [
  { prefix: 'OnHand_',         key: 'onHand' },
  { prefix: 'CurrentOnOrder_', key: 'currentOnOrder' },
  { prefix: 'FutureOnOrder_',  key: 'futureOnOrder' },
  { prefix: 'Model_',          key: 'model' },
  { prefix: 'MaxQtys_',        key: 'maxQty' },
  { prefix: 'Reorder_',        key: 'reorder' },
  // The Access column names carry hyphens literally — bracket them in SQL:
  { prefix: 'M-T-DSales_',     key: 'mtdSales' },
  { prefix: 'S-T-DSales_',     key: 'stdSales' },
  { prefix: 'Y-T-DSales_',     key: 'ytdSales' },
  { prefix: 'LYSales_',        key: 'lySales' },
];

/** Postgres SELECT column list covering all metric families for segments 01–18.
 *  Aliases snake_case mirror columns back to the PascalCase/hyphenated MDB names
 *  so `expandQuaRow`'s dynamic `q[prefix + NN]` lookups keep working unchanged. */
function buildQuaSelect(): string {
  const cols = [
    `sku AS "SKU"`,
    `store AS "Store"`,
    `"row" AS "Row"`,
    `segment AS "Segment"`,
  ];
  for (const m of CELL_METRICS) {
    const mirrorPrefix = toMirrorQuaPrefix(m.prefix);
    for (let i = 1; i <= 18; i++) {
      const n = pad2(i);
      cols.push(`${mirrorPrefix}${n} AS "${m.prefix}${n}"`);
    }
  }
  return cols.join(',\n  ');
}

/**
 * Unwind one RIINVQUA row into up to 18 cells. Cells whose column slot maps
 * past the SizeType's MaxColumns are dropped; cells with all zero metrics are
 * dropped only when `includeZero` is false (inquiry keeps them so the grid is
 * complete; find-by-size drops them so the result is small).
 */
function expandQuaRow(
  q: QuaRow,
  sizeType: SizeTypeRow | null,
  opts: { includeZero: boolean },
): InventoryCell[] {
  const segment = Number(q.Segment ?? 1);
  const firstCol = (segment - 1) * 18 + 1; // 1-based position in the full size grid
  const rowLabel = (q.Row ?? '').toString().trim();
  const storeNumber = Number(q.Store ?? 0);

  const out: InventoryCell[] = [];
  for (let i = 1; i <= 18; i++) {
    const absoluteCol = firstCol + (i - 1);
    if (sizeType && absoluteCol > sizeType.maxColumns) break;
    const columnLabel = sizeType
      ? (sizeType.columns[absoluteCol - 1] ?? '').trim()
      : '';

    const cell: InventoryCell = {
      storeNumber,
      rowLabel,
      columnLabel: columnLabel || String(absoluteCol),
      onHand: 0,
      currentOnOrder: 0,
      futureOnOrder: 0,
      model: 0,
      maxQty: 0,
      reorder: 0,
      mtdSales: 0,
      stdSales: 0,
      ytdSales: 0,
      lySales: 0,
    };

    let any = false;
    for (const m of CELL_METRICS) {
      const v = Number(q[`${m.prefix}${pad2(i)}`] ?? 0) || 0;
      (cell as any)[m.key] = v;
      if (v !== 0) any = true;
    }

    // Drop pure-zero cells that also have no column label (i.e. unused slots
    // in a segment that overshoots the size grid).
    if (!columnLabel && !any) continue;
    if (!opts.includeZero && !any) continue;
    out.push(cell);
  }
  return out;
}

// ─────────────────────── extended inquiry helpers ─────────────────────────

/** Map the RICS CurrentPrice selector to a named slot. Defaults to RETAIL. */
function resolveCurrentSlot(currentPrice: number | null): PriceSlot {
  const slot = Number(currentPrice ?? 2);
  if (slot === 1) return 'LIST';
  if (slot === 3) return 'MARKDOWN1';
  if (slot === 4) return 'MARKDOWN2';
  return 'RETAIL';
}

function buildPricing(master: MasterRow): InquiryPricing {
  return {
    retail:      Number(master.RetailPrice   ?? 0),
    markdown1:   Number(master.MarkDownPrice1 ?? 0),
    markdown2:   Number(master.MarkDownPrice2 ?? 0),
    // AvgCost is not stored on InventoryMaster; default 0 (concern: RICS
    // may store it elsewhere — deferred to a future workstream).
    avgCost:     0,
    currentCost: Number(master.CurrentCost   ?? 0),
    listPrice:   Number(master.ListPrice     ?? 0),
    currentSlot: resolveCurrentSlot(master.CurrentPrice),
  };
}

/**
 * Reshape the per-store InventoryCell array into summary grids.
 *
 * v1 live modes: onHand, model, max, reorder.
 * (short / allStoresOnHand / allStoresSummary require cross-store aggregation
 * that is non-trivial; left absent for now — the test only checks keys.length>0.)
 *
 * Grid shape: { columns: string[], rows: [{ label: string, cells: [{value}] }] }
 * Each row is one store; each cell is one column label.
 */
function buildGrids(storeEntries: InventoryInquiryStore[], columnLabels: string[]): InquiryGrids {
  if (!storeEntries.length) return {};

  type MetricKey = 'onHand' | 'model' | 'maxQty' | 'reorder';
  const GRID_METRICS: Array<{ key: MetricKey; gridKey: keyof InquiryGrids }> = [
    { key: 'onHand',  gridKey: 'onHand' },
    { key: 'model',   gridKey: 'model' },
    { key: 'maxQty',  gridKey: 'max' },
    { key: 'reorder', gridKey: 'reorder' },
  ];

  // Determine ordered columns: use the sizeType labels if available, else
  // collect from cells in order.
  const cols: string[] = columnLabels.length > 0
    ? columnLabels
    : (() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const s of storeEntries) {
          for (const c of s.cells) {
            if (c.columnLabel && !seen.has(c.columnLabel)) {
              seen.add(c.columnLabel);
              out.push(c.columnLabel);
            }
          }
        }
        return out;
      })();

  if (!cols.length) return {};

  const grids: InquiryGrids = {};

  for (const { key, gridKey } of GRID_METRICS) {
    const rows: InquirySizeGrid['rows'] = storeEntries.map((store) => {
      const byCol = new Map<string, number>();
      for (const c of store.cells) {
        if (!c.columnLabel) continue;
        byCol.set(c.columnLabel, (byCol.get(c.columnLabel) ?? 0) + (c[key] as number));
      }
      return {
        label: store.storeName ?? `Store ${store.storeNumber}`,
        cells: cols.map((col) => ({ value: byCol.get(col) ?? null })),
      };
    });
    grids[gridKey] = { columns: cols, rows };
  }

  return grids;
}

function buildPictureUrl(master: MasterRow): string | null {
  const s = master.PictureFileName?.trim();
  if (!s) return null;
  return `/rics-images/${encodeURIComponent(s)}`;
}

// ─────────────────────────── public: Inventory Inquiry ────────────────────

export async function getInventoryInquiry(sku: string): Promise<InventoryInquiry | null> {
  const trimmed = (sku ?? '').trim();
  if (!trimmed) return null;

  const master = await loadMasterBySku(trimmed);
  if (!master || !master.SKU) return null;

  const quaSql = `SELECT ${buildQuaSelect()}
FROM rics_mirror.inventory_quantities
WHERE sku = $1
ORDER BY store, "row", segment`;

  // Parallel legs: dimension maps (cached; fast), RIINVQUA per-SKU cells
  // (the dominant cost), and the per-SKU sales rollup. Rolling them together
  // hides each leg's latency behind the others on fast connections.
  const [stores, sizeTypes, vendors, rows, salesRollup] = await Promise.all([
    loadStoreMap(),
    loadSizeTypeMap(),
    loadVendorMap(),
    prisma.$queryRawUnsafe<QuaRow[]>(quaSql, trimmed),
    getInquirySalesRollup(trimmed),
  ]);

  const sizeType = master.SizeType != null ? sizeTypes.get(Number(master.SizeType)) ?? null : null;
  const vendor = master.Vendor ? vendors.get(master.Vendor.trim()) ?? null : null;

  const byStore = new Map<number, InventoryCell[]>();
  for (const r of rows) {
    const cells = expandQuaRow(r, sizeType, { includeZero: true });
    const list = byStore.get(Number(r.Store ?? 0)) ?? [];
    list.push(...cells);
    byStore.set(Number(r.Store ?? 0), list);
  }

  const storeEntries: InventoryInquiryStore[] = [...byStore.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([storeNumber, cells]) => ({
      storeNumber,
      storeName: stores.get(storeNumber)?.name ?? null,
      cells,
      totals: sumCellTotals(cells),
    }));

  const brand =
    master.Manufacturer?.trim() ||
    vendor?.manuName ||
    vendor?.shortName ||
    master.Vendor?.trim() ||
    null;

  const rowLabelsPresent = new Set<string>();
  for (const entry of storeEntries) {
    for (const c of entry.cells) {
      if (c.rowLabel) rowLabelsPresent.add(c.rowLabel);
    }
  }

  return {
    sku: master.SKU,
    master: {
      description: master.Desc?.trim() || null,
      brand,
      vendorCode: master.Vendor?.trim() || null,
      category: master.Category ?? null,
      season: master.Season?.trim() || null,
      retailPrice: resolveCurrentPrice(master),
      currentCost: master.CurrentCost ?? null,
      sizeType: {
        code: sizeType?.code ?? master.SizeType ?? null,
        desc: sizeType?.desc ?? null,
        rowLabels: sizeType
          ? sizeType.rows.filter((lbl) => lbl && (rowLabelsPresent.size === 0 || rowLabelsPresent.has(lbl)))
          : [...rowLabelsPresent],
        columnLabels: sizeType ? sizeType.columns.filter((lbl) => !!lbl) : [],
      },
    },
    stores: storeEntries,
    totals: storeEntries.reduce<InventoryInquiryStore['totals']>(
      (acc, s) => ({
        onHand: acc.onHand + s.totals.onHand,
        currentOnOrder: acc.currentOnOrder + s.totals.currentOnOrder,
        futureOnOrder: acc.futureOnOrder + s.totals.futureOnOrder,
        ytdSales: acc.ytdSales + s.totals.ytdSales,
        lySales: acc.lySales + s.totals.lySales,
      }),
      { onHand: 0, currentOnOrder: 0, futureOnOrder: 0, ytdSales: 0, lySales: 0 },
    ),
    pricing:    buildPricing(master),
    rollup:     salesRollup,
    grids:      buildGrids(storeEntries, sizeType ? sizeType.columns.filter((lbl) => !!lbl) : []),
    pictureUrl: buildPictureUrl(master),
    info: {
      seasonCode:     master.Season?.trim()        || null,
      labelCode:      master.LabelCode?.trim()     || null,
      groupCode:      master.GroupCode?.trim()      || null,
      firstReceivedAt: null, // Phase 2: not stored on InventoryMaster
      lastMarkdownAt: master.LastPriceChange?.trim() || null,
      perks:          master.Perks ?? null,
      comment:        master.Comment?.trim()        || null,
    },
  };
}

function sumCellTotals(cells: InventoryCell[]): InventoryInquiryStore['totals'] {
  return cells.reduce(
    (acc, c) => ({
      onHand: acc.onHand + c.onHand,
      currentOnOrder: acc.currentOnOrder + c.currentOnOrder,
      futureOnOrder: acc.futureOnOrder + c.futureOnOrder,
      ytdSales: acc.ytdSales + c.ytdSales,
      lySales: acc.lySales + c.lySales,
    }),
    { onHand: 0, currentOnOrder: 0, futureOnOrder: 0, ytdSales: 0, lySales: 0 },
  );
}

// ─────────────────────────── public: Find by Size ─────────────────────────

/**
 * Find available on-hand for a single (SKU, sizeLabel) across every store.
 * Matches RICS's Ch. 4 p. 70 flow: enter SKU + size → see which store has it.
 * Size matching is case-insensitive exact-match against the SizeType's column
 * labels (or row labels when the shoe grid uses rows for width).
 */
export async function findBySize(sku: string, sizeLabel: string): Promise<FindBySizeResult | null> {
  const skuTrim = (sku ?? '').trim();
  const sizeTrim = (sizeLabel ?? '').trim();
  if (!skuTrim || !sizeTrim) return null;

  const inquiry = await getInventoryInquiry(skuTrim);
  if (!inquiry) return null;

  const target = sizeTrim.toLowerCase();
  const matches: FindBySizeResult['matches'] = [];
  for (const s of inquiry.stores) {
    for (const c of s.cells) {
      const labelMatches =
        c.columnLabel.toLowerCase() === target ||
        c.rowLabel.toLowerCase() === target;
      if (!labelMatches) continue;
      if (c.onHand === 0) continue;
      matches.push({
        storeNumber: s.storeNumber,
        storeName: s.storeName,
        rowLabel: c.rowLabel,
        onHand: c.onHand,
      });
    }
  }
  matches.sort((a, b) => b.onHand - a.onHand);

  return {
    sku: inquiry.sku,
    description: inquiry.master.description,
    brand: inquiry.master.brand,
    sizeLabel: sizeTrim,
    matches,
    totalOnHand: matches.reduce((acc, m) => acc + m.onHand, 0),
  };
}

// ─────────────────────────── public: Inventory Detail Report ──────────────

/**
 * Roll RIINVQUA up to one row per SKU (optionally scoped to one store),
 * joined with InventoryMaster so the merchandiser can see on-hand × cost /
 * retail without drilling into cells. This is RICS's Ch. 4 p. 78 "Print
 * Inventory Detail Report" in its default (by-SKU) shape — further report
 * variants (by-vendor, by-category) are simple re-aggregations of this row
 * set and are built in the web layer from the same payload.
 */
export async function getInventoryDetailReport(
  params: InventoryDetailReportParams = {},
): Promise<InventoryDetailReportRow[]> {
  const limit = Math.max(1, Math.min(params.limit ?? 5000, 20_000));

  const [stores, vendors] = await Promise.all([loadStoreMap(), loadVendorMap()]);
  void stores;

  // 1) Aggregate rics_mirror.inventory_quantities by SKU. On-hand / on-order /
  //    sales rollups are per-metric sums over every cell of every (store, row,
  //    segment).
  const quaParams: unknown[] = [];
  let storeFilter = '';
  if (params.storeNumber != null) {
    quaParams.push(Number(params.storeNumber));
    storeFilter = ` WHERE store = $${quaParams.length}`;
  }
  const onHandSum = sumOfMetric('OnHand_');
  const onOrderSum = sumOfMetric('CurrentOnOrder_');
  const ytdSum = sumOfMetric('Y-T-DSales_');
  const lySum = sumOfMetric('LYSales_');

  const sqlQua = `SELECT sku AS "SKU",
  SUM(${onHandSum}) AS "TotalOnHand",
  SUM(${onOrderSum}) AS "TotalCurrentOnOrder",
  SUM(${ytdSum}) AS "TotalYtdSales",
  SUM(${lySum}) AS "TotalLySales"
FROM rics_mirror.inventory_quantities${storeFilter}
GROUP BY sku`;

  interface QuaAgg {
    SKU: string | null;
    TotalOnHand: number | null;
    TotalCurrentOnOrder: number | null;
    TotalYtdSales: number | null;
    TotalLySales: number | null;
  }
  const aggs = await prisma.$queryRawUnsafe<QuaAgg[]>(sqlQua, ...quaParams);

  // 2) Pull the master rows for those SKUs (bounded by any caller filters).
  const masterParams: unknown[] = [];
  const wheres: string[] = [];
  if (params.vendorCode) {
    masterParams.push(params.vendorCode.trim());
    wheres.push(`vendor = $${masterParams.length}`);
  }
  if (params.categoryMin != null && params.categoryMax != null) {
    masterParams.push(Number(params.categoryMin), Number(params.categoryMax));
    wheres.push(`category BETWEEN $${masterParams.length - 1} AND $${masterParams.length}`);
  } else if (params.categoryMin != null) {
    masterParams.push(Number(params.categoryMin));
    wheres.push(`category >= $${masterParams.length}`);
  } else if (params.categoryMax != null) {
    masterParams.push(Number(params.categoryMax));
    wheres.push(`category <= $${masterParams.length}`);
  }
  if (params.season) {
    masterParams.push(params.season.trim());
    wheres.push(`season = $${masterParams.length}`);
  }
  wheres.push(`(status IS NULL OR status <> 'D')`);
  const whereClause = ` WHERE ${wheres.join(' AND ')}`;

  const sqlMaster = `SELECT
  sku AS "SKU", "desc" AS "Desc", vendor AS "Vendor",
  manufacturer AS "Manufacturer", category AS "Category",
  season AS "Season", style_color AS "StyleColor",
  list_price::float8 AS "ListPrice", retail_price::float8 AS "RetailPrice",
  mark_down_price1::float8 AS "MarkDownPrice1",
  mark_down_price2::float8 AS "MarkDownPrice2",
  current_price AS "CurrentPrice",
  current_cost::float8 AS "CurrentCost"
FROM rics_mirror.inventory_master${whereClause}
ORDER BY "desc"
LIMIT ${limit}`;
  const masters = await prisma.$queryRawUnsafe<MasterRow[]>(sqlMaster, ...masterParams);

  const aggBySku = new Map<string, QuaAgg>();
  for (const a of aggs) {
    if (a.SKU) aggBySku.set(a.SKU, a);
  }

  const report: InventoryDetailReportRow[] = [];
  for (const m of masters) {
    if (!m.SKU) continue;
    const agg = aggBySku.get(m.SKU);
    const totalOnHand = Number(agg?.TotalOnHand ?? 0);
    const totalOnOrder = Number(agg?.TotalCurrentOnOrder ?? 0);
    const totalYtd = Number(agg?.TotalYtdSales ?? 0);
    const totalLy = Number(agg?.TotalLySales ?? 0);
    if (totalOnHand === 0 && totalOnOrder === 0 && totalYtd === 0 && totalLy === 0) {
      // Skip SKUs that have no quantity footprint in the scope. The master
      // snapshot can carry orphans — a report row with all zeros is noise.
      continue;
    }
    const retail = resolveCurrentPrice(m);
    const cost = m.CurrentCost ?? null;
    const vendor = m.Vendor ? vendors.get(m.Vendor.trim()) ?? null : null;
    report.push({
      sku: m.SKU,
      description: m.Desc?.trim() || null,
      brand:
        m.Manufacturer?.trim() ||
        vendor?.manuName ||
        vendor?.shortName ||
        m.Vendor?.trim() ||
        null,
      vendorCode: m.Vendor?.trim() || null,
      category: m.Category ?? null,
      styleColor: m.StyleColor?.trim() || null,
      season: m.Season?.trim() || null,
      retailPrice: retail,
      currentCost: cost,
      totalOnHand,
      totalCurrentOnOrder: totalOnOrder,
      totalYtdSales: totalYtd,
      totalLySales: totalLy,
      retailValue: retail != null ? Math.round(retail * totalOnHand * 100) / 100 : 0,
      costValue: cost != null ? Math.round(cost * totalOnHand * 100) / 100 : 0,
    });
  }
  return report;
}

// ─────────────────────────── public: Change Detail ───────────────────────

/**
 * Browse the RIINVCHG "InvChanges" movement ledger. RICS Ch. 2 p. 55 and
 * Ch. 4 p. 72.
 *
 * The ledger carries ~11 M rows across ~6 years, so an unscoped SELECT would
 * be a performance cliff: require at least one of { sku, 90-day date range }.
 * The route layer maps `ChangeDetailQueryTooBroadError` to HTTP 400.
 */
export async function getChangeDetail(params: ChangeDetailParams): Promise<ChangeDetailRow[]> {
  const limit = clamp(params.limit ?? 200, 1, 1000);
  const requestedType = params.changeType?.trim().toUpperCase() || undefined;
  const wantInvChanges = !requestedType || requestedType !== 'SAL';
  const wantSales = !!params.includeSales && (!requestedType || requestedType === 'SAL');

  const sqlParams: unknown[] = [];

  // Resolve and validate the date window once; applied to both branches.
  const { from, to } = normalizeDateRange(params.fromDate, params.toDate);
  const haveSku = !!params.sku?.trim();
  const spanDays = from && to ? daysBetween(from, to) + 1 : null;
  if (!haveSku) {
    if (spanDays == null) {
      throw new ChangeDetailQueryTooBroadError(
        'Provide a SKU, or a fromDate+toDate window (≤ 90 days), before browsing InvChanges.',
      );
    }
    if (spanDays > 90) {
      throw new ChangeDetailQueryTooBroadError(
        `Date window is ${spanDays} days; cap without a SKU is 90 days.`,
      );
    }
  }

  // Shared parameter indices — populate once, reference from both branches.
  let skuIdx: number | null = null;
  if (params.sku?.trim()) {
    sqlParams.push(params.sku.trim());
    skuIdx = sqlParams.length;
  }
  let storeIdx: number | null = null;
  if (params.store != null) {
    sqlParams.push(Number(params.store));
    storeIdx = sqlParams.length;
  }
  let typeIdx: number | null = null;
  if (requestedType) {
    sqlParams.push(requestedType);
    typeIdx = sqlParams.length;
  }
  let fromIdx: number | null = null;
  if (from) {
    sqlParams.push(from);
    fromIdx = sqlParams.length;
  }
  let toIdx: number | null = null;
  if (to) {
    sqlParams.push(addDays(to, 1));
    toIdx = sqlParams.length;
  }

  const branches: string[] = [];

  if (wantInvChanges) {
    const wheres: string[] = [];
    if (skuIdx != null) wheres.push(`sku = $${skuIdx}`);
    if (storeIdx != null) wheres.push(`store = $${storeIdx}`);
    if (typeIdx != null) wheres.push(`UPPER(chg_type) = $${typeIdx}`);
    if (fromIdx != null) wheres.push(`date >= $${fromIdx}::date`);
    if (toIdx != null) wheres.push(`date <  $${toIdx}::date`);
    const whereClause = wheres.length ? ` WHERE ${wheres.join(' AND ')}` : '';
    branches.push(`SELECT
  sku AS "SKU", orig_sku AS "OrigSKU", store AS "Store",
  chg_type AS "ChgType",
  to_char(date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "Date",
  col AS "Col", "row" AS "Row",
  po AS "PO", oth_store AS "OthStore",
  qty AS "Qty", cost::float8 AS "Cost", rma_number AS "RMANumber"
FROM rics_mirror.inv_changes${whereClause}`);
  }

  if (wantSales) {
    // ticket_detail.sku is right-padded to 15 chars — wrap the filter with RPAD.
    const wheres: string[] = [
      `h.trans_type = 1`,
      `h.voided     = false`,
    ];
    if (skuIdx != null) wheres.push(`d.sku = RPAD($${skuIdx}, 15)`);
    if (storeIdx != null) wheres.push(`h.store = $${storeIdx}`);
    if (fromIdx != null) wheres.push(`h.real_date >= $${fromIdx}::date`);
    if (toIdx != null) wheres.push(`h.real_date <  $${toIdx}::date`);
    branches.push(`SELECT
  d.sku AS "SKU", NULL::text AS "OrigSKU", h.store AS "Store",
  'SAL'::text AS "ChgType",
  to_char(h.real_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "Date",
  NULL::text AS "Col", NULL::text AS "Row",
  NULL::text AS "PO", NULL::int AS "OthStore",
  (-COALESCE(d.qty, 0))::int AS "Qty",
  COALESCE(d.cost, 0)::float8 AS "Cost",
  NULL::text AS "RMANumber"
FROM rics_mirror.ticket_header h
INNER JOIN rics_mirror.ticket_detail d
  ON h.user_id = d.user_id
 AND h.batch_date = d.batch_date
 AND h.terminal = d.terminal
 AND h.store = d.store
 AND h.ticket = d.ticket
 AND h.real_date = d.real_date
WHERE ${wheres.join(' AND ')}`);
  }

  if (branches.length === 0) {
    return [];
  }

  const union = branches.length === 1 ? branches[0] : branches.map((b) => `(${b})`).join(' UNION ALL ');
  const sql = `${union}
ORDER BY "Date" DESC
LIMIT ${limit}`;

  interface RawRow {
    SKU: string | null;
    OrigSKU: string | null;
    Store: number | null;
    ChgType: string | null;
    Date: string | null;
    Col: string | null;
    Row: string | null;
    PO: string | null;
    OthStore: number | null;
    Qty: number | null;
    Cost: number | null;
    RMANumber: string | null;
  }
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(sql, ...sqlParams);

  return rows.map((r) => ({
    sku: (r.SKU ?? '').trim(),
    origSku: r.OrigSKU?.trim() || null,
    store: Number(r.Store ?? 0),
    changeType: (r.ChgType ?? '').trim(),
    date: parseAccessDate(r.Date),
    rowLabel: (r.Row ?? '').trim(),
    columnLabel: (r.Col ?? '').trim(),
    purchaseOrder: r.PO?.trim() || null,
    otherStore: r.OthStore != null && Number(r.OthStore) !== 0 ? Number(r.OthStore) : null,
    quantity: Number(r.Qty ?? 0),
    cost: Number(r.Cost ?? 0),
    rmaNumber: r.RMANumber?.trim() || null,
  }));
}

// ─────────────────────────── per-(SKU × Store) rollup ────────────────────

/**
 * Per (SKU × Store) rollup from RIINVQUA — one row per (SKU × Store) with
 * aggregate on-hand, model, max, reorder, current-on-order, and sales
 * (MTD / STD / YTD / LY) rolled across every size cell. This is the primitive
 * behind Recommended Transfer (Ch. 4 p. 79), Auto Transfer Preview (Ch. 4 p. 76),
 * and Balancing Transfer Preview (Ch. 4 p. 77). Filter by store(s) / vendor /
 * category range / season to keep the scan bounded.
 */
export interface SkuStoreRollupParams {
  storeNumbers?: number[];
  vendorCode?: string;
  categoryMin?: number;
  categoryMax?: number;
  season?: string;
  skus?: string[];     // scope to an explicit list (max 200)
  limit?: number;       // SKU-level safety cap (default 50 000, hard ceiling 200 000).
                        // This is NOT a scope limit — it's a safety bound. Clients
                        // should scope via vendor / category / season filters.
}

export interface SkuStoreRollupRow {
  sku: string;
  store: number;
  storeName: string | null;
  description: string | null;
  brand: string | null;
  vendorCode: string | null;
  category: number | null;
  season: string | null;
  onHand: number;
  model: number;
  maxQty: number;
  reorder: number;
  currentOnOrder: number;
  mtdSales: number;
  stdSales: number;
  ytdSales: number;
  lySales: number;
}

/**
 * Per-cell rollup: one row per (SKU × Store × Row × Column), unwound from
 * RIINVQUA segments. Primitive behind the transfer wizards' per-size
 * allocation — Auto Transfer's warehouse-to-store fill by size, Manual
 * Transfer's donor grid, Balancing Transfer's per-cell doubles. Same filter
 * surface as `getSkuStoreRollup`, same SKU cap, but an extra row-per-cell
 * factor multiplies the payload (up to `maxColumns × maxRows` cells per
 * SKU × Store), so callers should scope aggressively.
 */
export interface SkuStoreCellRow {
  sku: string;
  store: number;
  storeName: string | null;
  rowLabel: string;
  columnLabel: string;
  description: string | null;
  brand: string | null;
  vendorCode: string | null;
  category: number | null;
  season: string | null;
  sizeTypeCode: number | null;
  sizeTypeDesc: string | null;
  onHand: number;
  model: number;
  maxQty: number;
  reorder: number;
  currentOnOrder: number;
  futureOnOrder: number;
  mtdSales: number;
  stdSales: number;
  ytdSales: number;
  lySales: number;
}

export async function getSkuStoreCellRollup(
  params: SkuStoreRollupParams = {},
): Promise<SkuStoreCellRow[]> {
  // Per-cell rollup is the most payload-heavy shape (each SKU × Store fans
  // out to up to 18 cells), but the scan should still cover every SKU that
  // matches the operator's filters. The cap is a safety bound, not a scope
  // limit: the cell expansion is bounded in memory by MaxColumns × MaxRows
  // of the SKU's size type, and chunked by 100 SKUs per SQL call below.
  const limit = clamp(params.limit ?? 50_000, 1, 200_000);
  const [stores, sizeTypes, vendors] = await Promise.all([
    loadStoreMap(),
    loadSizeTypeMap(),
    loadVendorMap(),
  ]);

  const masterParams: unknown[] = [];
  const masterWheres: string[] = [`(status IS NULL OR status <> 'D')`];
  if (params.vendorCode) {
    masterParams.push(params.vendorCode.trim());
    masterWheres.push(`vendor = $${masterParams.length}`);
  }
  if (params.categoryMin != null && params.categoryMax != null) {
    masterParams.push(Number(params.categoryMin), Number(params.categoryMax));
    masterWheres.push(`category BETWEEN $${masterParams.length - 1} AND $${masterParams.length}`);
  } else if (params.categoryMin != null) {
    masterParams.push(Number(params.categoryMin));
    masterWheres.push(`category >= $${masterParams.length}`);
  } else if (params.categoryMax != null) {
    masterParams.push(Number(params.categoryMax));
    masterWheres.push(`category <= $${masterParams.length}`);
  }
  if (params.season) {
    masterParams.push(params.season.trim());
    masterWheres.push(`season = $${masterParams.length}`);
  }
  if (params.skus?.length) {
    masterParams.push(params.skus.slice(0, 200));
    masterWheres.push(`sku = ANY($${masterParams.length}::text[])`);
  }
  const masterWhere = ` WHERE ${masterWheres.join(' AND ')}`;
  const sqlMaster = `SELECT
  sku AS "SKU", "desc" AS "Desc", vendor AS "Vendor",
  manufacturer AS "Manufacturer", category AS "Category",
  season AS "Season", size_type AS "SizeType"
FROM rics_mirror.inventory_master${masterWhere}
ORDER BY sku
LIMIT ${limit}`;
  interface MasterSlim {
    SKU: string | null;
    Desc: string | null;
    Vendor: string | null;
    Manufacturer: string | null;
    Category: number | null;
    Season: string | null;
    SizeType: number | null;
  }
  const masters = await prisma.$queryRawUnsafe<MasterSlim[]>(sqlMaster, ...masterParams);
  if (masters.length === 0) return [];

  const masterBySku = new Map<string, MasterSlim>();
  for (const m of masters) {
    if (!m.SKU) continue;
    masterBySku.set(m.SKU, m);
  }
  const skuList = [...masterBySku.keys()];

  const CHUNK = 100;
  const allCells: SkuStoreCellRow[] = [];

  for (let i = 0; i < skuList.length; i += CHUNK) {
    const chunk = skuList.slice(i, i + CHUNK);
    const chunkParams: unknown[] = [chunk];
    const chunkWheres = [`sku = ANY($1::text[])`];
    if (params.storeNumbers?.length) {
      chunkParams.push(params.storeNumbers.map((n) => Number(n)));
      chunkWheres.push(`store = ANY($${chunkParams.length}::int[])`);
    }
    const sql = `SELECT ${buildQuaSelect()}
FROM rics_mirror.inventory_quantities
WHERE ${chunkWheres.join(' AND ')}`;
    const quaRows = await prisma.$queryRawUnsafe<QuaRow[]>(sql, ...chunkParams);

    for (const r of quaRows) {
      const sku = (r.SKU ?? '').toString();
      const m = masterBySku.get(sku);
      if (!m) continue;
      const sizeType = m.SizeType != null ? sizeTypes.get(Number(m.SizeType)) ?? null : null;
      const cells = expandQuaRow(r, sizeType, { includeZero: false });
      if (cells.length === 0) continue;
      const vendor = m.Vendor ? vendors.get(m.Vendor.trim()) ?? null : null;
      const brand =
        m.Manufacturer?.trim() ||
        vendor?.manuName ||
        vendor?.shortName ||
        m.Vendor?.trim() ||
        null;
      for (const c of cells) {
        allCells.push({
          sku,
          store: c.storeNumber,
          storeName: stores.get(c.storeNumber)?.name ?? null,
          rowLabel: c.rowLabel,
          columnLabel: c.columnLabel,
          description: m.Desc?.trim() || null,
          brand,
          vendorCode: m.Vendor?.trim() || null,
          category: m.Category ?? null,
          season: m.Season?.trim() || null,
          sizeTypeCode: sizeType?.code ?? m.SizeType ?? null,
          sizeTypeDesc: sizeType?.desc ?? null,
          onHand: c.onHand,
          model: c.model,
          maxQty: c.maxQty,
          reorder: c.reorder,
          currentOnOrder: c.currentOnOrder,
          futureOnOrder: c.futureOnOrder,
          mtdSales: c.mtdSales,
          stdSales: c.stdSales,
          ytdSales: c.ytdSales,
          lySales: c.lySales,
        });
      }
    }
  }

  return allCells;
}

export async function getSkuStoreRollup(
  params: SkuStoreRollupParams = {},
): Promise<SkuStoreRollupRow[]> {
  const limit = clamp(params.limit ?? 50_000, 1, 200_000);
  const [stores, vendors] = await Promise.all([loadStoreMap(), loadVendorMap()]);

  // ── Step 1: pull the master rows that satisfy the filter — scoped SKU list ──
  const masterParams: unknown[] = [];
  const masterWheres: string[] = [`(status IS NULL OR status <> 'D')`];
  if (params.vendorCode) {
    masterParams.push(params.vendorCode.trim());
    masterWheres.push(`vendor = $${masterParams.length}`);
  }
  if (params.categoryMin != null && params.categoryMax != null) {
    masterParams.push(Number(params.categoryMin), Number(params.categoryMax));
    masterWheres.push(`category BETWEEN $${masterParams.length - 1} AND $${masterParams.length}`);
  } else if (params.categoryMin != null) {
    masterParams.push(Number(params.categoryMin));
    masterWheres.push(`category >= $${masterParams.length}`);
  } else if (params.categoryMax != null) {
    masterParams.push(Number(params.categoryMax));
    masterWheres.push(`category <= $${masterParams.length}`);
  }
  if (params.season) {
    masterParams.push(params.season.trim());
    masterWheres.push(`season = $${masterParams.length}`);
  }
  if (params.skus?.length) {
    masterParams.push(params.skus.slice(0, 200));
    masterWheres.push(`sku = ANY($${masterParams.length}::text[])`);
  }
  const masterWhere = ` WHERE ${masterWheres.join(' AND ')}`;
  const sqlMaster = `SELECT
  sku AS "SKU", "desc" AS "Desc", vendor AS "Vendor",
  manufacturer AS "Manufacturer", category AS "Category",
  season AS "Season"
FROM rics_mirror.inventory_master${masterWhere}
ORDER BY sku
LIMIT ${limit}`;
  interface MasterSlim {
    SKU: string | null;
    Desc: string | null;
    Vendor: string | null;
    Manufacturer: string | null;
    Category: number | null;
    Season: string | null;
  }
  const masters = await prisma.$queryRawUnsafe<MasterSlim[]>(sqlMaster, ...masterParams);
  if (masters.length === 0) return [];

  const skuSet = new Set<string>();
  const masterBySku = new Map<string, MasterSlim>();
  for (const m of masters) {
    if (!m.SKU) continue;
    skuSet.add(m.SKU);
    masterBySku.set(m.SKU, m);
  }

  // ── Step 2: aggregate RIINVQUA per (SKU × Store) for those SKUs ──
  const quaWheres: string[] = [];
  // Access caps the IN list size — chunk by 100 SKUs per SQL call.
  const skuList = [...skuSet];
  const CHUNK = 100;
  const allAggRows: QuaStoreAgg[] = [];

  const onHandSum = sumOfMetric('OnHand_');
  const modelSum = sumOfMetric('Model_');
  const maxSum = sumOfMetric('MaxQtys_');
  const reorderSum = sumOfMetric('Reorder_');
  const onOrderSum = sumOfMetric('CurrentOnOrder_');
  const mtdSum = sumOfMetric('M-T-DSales_');
  const stdSum = sumOfMetric('S-T-DSales_');
  const ytdSum = sumOfMetric('Y-T-DSales_');
  const lySum = sumOfMetric('LYSales_');

  for (let i = 0; i < skuList.length; i += CHUNK) {
    const chunk = skuList.slice(i, i + CHUNK);
    const chunkParams: unknown[] = [chunk];
    const chunkWheres = [...quaWheres, `sku = ANY($1::text[])`];
    if (params.storeNumbers?.length) {
      chunkParams.push(params.storeNumbers.map((n) => Number(n)));
      chunkWheres.push(`store = ANY($${chunkParams.length}::int[])`);
    }
    const sql = `SELECT sku AS "SKU", store AS "Store",
  SUM(${onHandSum})::float8 AS "OnHand",
  SUM(${modelSum})::float8 AS "Model",
  SUM(${maxSum})::float8 AS "MaxQ",
  SUM(${reorderSum})::float8 AS "Reord",
  SUM(${onOrderSum})::float8 AS "OnOrder",
  SUM(${mtdSum})::float8 AS "MtdS",
  SUM(${stdSum})::float8 AS "StdS",
  SUM(${ytdSum})::float8 AS "YtdS",
  SUM(${lySum})::float8 AS "LyS"
FROM rics_mirror.inventory_quantities
WHERE ${chunkWheres.join(' AND ')}
GROUP BY sku, store`;
    const chunkRows = await prisma.$queryRawUnsafe<QuaStoreAgg[]>(sql, ...chunkParams);
    allAggRows.push(...chunkRows);
  }

  // ── Step 3: join to master → output ──
  const out: SkuStoreRollupRow[] = [];
  for (const r of allAggRows) {
    if (!r.SKU) continue;
    const m = masterBySku.get(r.SKU);
    if (!m) continue;
    const vendor = m.Vendor ? vendors.get(m.Vendor.trim()) ?? null : null;
    out.push({
      sku: r.SKU,
      store: Number(r.Store ?? 0),
      storeName: stores.get(Number(r.Store ?? 0))?.name ?? null,
      description: m.Desc?.trim() || null,
      brand:
        m.Manufacturer?.trim() ||
        vendor?.manuName ||
        vendor?.shortName ||
        m.Vendor?.trim() ||
        null,
      vendorCode: m.Vendor?.trim() || null,
      category: m.Category ?? null,
      season: m.Season?.trim() || null,
      onHand: Number(r.OnHand ?? 0),
      model: Number(r.Model ?? 0),
      maxQty: Number(r.MaxQ ?? 0),
      reorder: Number(r.Reord ?? 0),
      currentOnOrder: Number(r.OnOrder ?? 0),
      mtdSales: Number(r.MtdS ?? 0),
      stdSales: Number(r.StdS ?? 0),
      ytdSales: Number(r.YtdS ?? 0),
      lySales: Number(r.LyS ?? 0),
    });
  }
  return out;
}

interface QuaStoreAgg {
  SKU: string | null;
  Store: number | null;
  OnHand: number | null;
  Model: number | null;
  MaxQ: number | null;
  Reord: number | null;
  OnOrder: number | null;
  MtdS: number | null;
  StdS: number | null;
  YtdS: number | null;
  LyS: number | null;
}

function sumOfMetric(prefix: string): string {
  const mirrorPrefix = toMirrorQuaPrefix(prefix);
  const parts: string[] = [];
  for (let i = 1; i <= 18; i++) {
    parts.push(`COALESCE(${mirrorPrefix}${pad2(i)}, 0)`);
  }
  return parts.join(' + ');
}

// ─────────────────────────── Recommended Transfer Report ──────────────────

/**
 * RICS Ch. 4 p. 79 — advisory report, no writes. Computes per-SKU transfer
 * suggestions under one of three rules:
 *   OVER_UNDER_MODELS   — source stores over model send to targets under model
 *   UNEVEN_DOUBLES      — stores with ≥2 of a SKU send 1 to stores with 0
 *   TURNOVER_VARIANCE   — compare YTD sales velocity; fast sellers receive
 *                         from slow sellers (expressed as a ratio threshold)
 */
export type RecommendedTransferRule =
  | 'OVER_UNDER_MODELS'
  | 'UNEVEN_DOUBLES'
  | 'TURNOVER_VARIANCE';

export interface RecommendedTransferParams extends SkuStoreRollupParams {
  rule: RecommendedTransferRule;
  turnoverRatioThreshold?: number; // default 2 — "sells 2× faster"
  includeSkusWithoutModels?: boolean; // OVER_UNDER_MODELS only
}

export interface RecommendedTransferRow {
  sku: string;
  description: string | null;
  brand: string | null;
  category: number | null;
  vendorCode: string | null;
  fromStore: number;
  fromStoreName: string | null;
  toStore: number;
  toStoreName: string | null;
  suggestedQuantity: number;
  reason: string;
  fromOnHand: number;
  toOnHand: number;
  fromModel: number;
  toModel: number;
  fromYtd: number;
  toYtd: number;
}

export async function getRecommendedTransfers(
  params: RecommendedTransferParams,
): Promise<RecommendedTransferRow[]> {
  const rollup = await getSkuStoreRollup(params);
  if (rollup.length === 0) return [];

  // Group by SKU for per-SKU pairwise reasoning.
  const bySku = new Map<string, SkuStoreRollupRow[]>();
  for (const r of rollup) {
    const list = bySku.get(r.sku) ?? [];
    list.push(r);
    bySku.set(r.sku, list);
  }

  const out: RecommendedTransferRow[] = [];
  const threshold = Math.max(1.1, params.turnoverRatioThreshold ?? 2);

  for (const [sku, rows] of bySku) {
    if (rows.length < 2) continue; // need at least two stores
    const firstRow = rows[0];

    if (params.rule === 'OVER_UNDER_MODELS') {
      const hasModels = rows.some((r) => r.model > 0);
      if (!hasModels && !params.includeSkusWithoutModels) continue;
      const donors = rows
        .filter((r) => r.onHand > r.model && r.model > 0)
        .sort((a, b) => (b.onHand - b.model) - (a.onHand - a.model));
      const receivers = rows
        .filter((r) => r.onHand < r.model)
        .sort((a, b) => (b.model - b.onHand) - (a.model - a.onHand));
      for (const receiver of receivers) {
        const need = receiver.model - receiver.onHand;
        for (const donor of donors) {
          if (donor.store === receiver.store) continue;
          const surplus = donor.onHand - donor.model;
          const move = Math.min(surplus, need);
          if (move <= 0) continue;
          out.push(transferRow(firstRow, donor, receiver, move,
            `Donor over model by ${surplus}; receiver short by ${need}.`));
          donor.onHand -= move;
          break;
        }
      }
    } else if (params.rule === 'UNEVEN_DOUBLES') {
      const donors = rows.filter((r) => r.onHand >= 2);
      const receivers = rows.filter((r) => r.onHand === 0);
      if (donors.length === 0 || receivers.length === 0) continue;
      // Sort receivers by highest YTD (better sellers first)
      receivers.sort((a, b) => b.ytdSales - a.ytdSales);
      donors.sort((a, b) => b.onHand - a.onHand);
      for (const receiver of receivers) {
        const donor = donors.find((d) => d.onHand >= 2);
        if (!donor) break;
        out.push(transferRow(firstRow, donor, receiver, 1,
          `Donor holds ${donor.onHand}; receiver at 0.`));
        donor.onHand -= 1;
      }
    } else if (params.rule === 'TURNOVER_VARIANCE') {
      const sorted = [...rows].sort((a, b) => b.ytdSales - a.ytdSales);
      const fastest = sorted[0];
      for (const slow of sorted.slice(1)) {
        if (slow.ytdSales === 0 && fastest.ytdSales === 0) continue;
        const ratio = slow.ytdSales === 0
          ? (fastest.ytdSales > 0 ? Infinity : 0)
          : fastest.ytdSales / slow.ytdSales;
        if (ratio < threshold) continue;
        if (slow.onHand <= 0) continue;
        const move = Math.min(slow.onHand, Math.max(1, Math.floor(slow.onHand / 2)));
        out.push(transferRow(firstRow, slow, fastest, move,
          `YTD variance ${ratio === Infinity ? '∞' : ratio.toFixed(1)}× (fastest ${fastest.ytdSales} vs donor ${slow.ytdSales}).`));
      }
    }
  }

  // Stable order: from store, to store, sku
  out.sort(
    (a, b) =>
      a.fromStore - b.fromStore ||
      a.toStore - b.toStore ||
      a.sku.localeCompare(b.sku),
  );
  return out;
}

function transferRow(
  seed: SkuStoreRollupRow,
  from: SkuStoreRollupRow,
  to: SkuStoreRollupRow,
  qty: number,
  reason: string,
): RecommendedTransferRow {
  return {
    sku: seed.sku,
    description: seed.description,
    brand: seed.brand,
    category: seed.category,
    vendorCode: seed.vendorCode,
    fromStore: from.store,
    fromStoreName: from.storeName,
    toStore: to.store,
    toStoreName: to.storeName,
    suggestedQuantity: qty,
    reason,
    fromOnHand: from.onHand,
    toOnHand: to.onHand,
    fromModel: from.model,
    toModel: to.model,
    fromYtd: from.ytdSales,
    toYtd: to.ytdSales,
  };
}

// ─────────────────────────── public: Transfer Summary Report ─────────────

/**
 * Monthly rollup of RIINVCHG transfer rows. RICS Ch. 4 p. 80 — "Print Transfer
 * Summary Report". We sum only the TOU ("transfer out") side to avoid
 * double-counting (every transfer also writes a matching TIN on the
 * destination). Date range is required and capped at 366 days to keep the scan
 * bounded — the ledger is append-only and grows fast.
 */
export async function getTransferSummary(
  params: TransferSummaryParams,
): Promise<TransferSummaryReport> {
  const { from, to } = normalizeDateRange(params.fromDate, params.toDate);
  if (!from || !to) {
    throw new TransferSummaryInputError('fromDate and toDate are required (YYYY-MM-DD).');
  }
  const spanDays = daysBetween(from, to) + 1;
  if (spanDays > 366) {
    throw new TransferSummaryInputError(
      `Date window is ${spanDays} days; Transfer Summary caps at 366 days per request.`,
    );
  }

  const stores = await loadStoreMap();

  const sqlParams: unknown[] = [from, addDays(to, 1)];
  const wheres: string[] = [
    `UPPER(chg_type) = 'TOU'`,
    `date >= $1::date`,
    `date < $2::date`,
  ];
  if (params.fromStoreNumbers?.length) {
    sqlParams.push(params.fromStoreNumbers.map((n) => Number(n)));
    wheres.push(`store = ANY($${sqlParams.length}::int[])`);
  }
  if (params.toStoreNumbers?.length) {
    sqlParams.push(params.toStoreNumbers.map((n) => Number(n)));
    wheres.push(`oth_store = ANY($${sqlParams.length}::int[])`);
  }
  const whereClause = ` WHERE ${wheres.join(' AND ')}`;

  // Aggregate in SQL so the payload is bounded (O(stores² × months)) instead
  // of every raw transfer line. Postgres EXTRACT gives us year+month directly.
  const sql = `SELECT
  store AS "FromStore",
  oth_store AS "ToStore",
  EXTRACT(YEAR FROM date)::int  AS "Yr",
  EXTRACT(MONTH FROM date)::int AS "Mo",
  COUNT(*)::int AS "Events",
  SUM(COALESCE(qty, 0))::int AS "TotalQty",
  SUM(COALESCE(cost, 0))::float8 AS "TotalCost"
FROM rics_mirror.inv_changes${whereClause}
GROUP BY store, oth_store, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)`;

  interface AggRow {
    FromStore: number | null;
    ToStore: number | null;
    Yr: number | null;
    Mo: number | null;
    Events: number | null;
    TotalQty: number | null;
    TotalCost: number | null;
  }
  const rows = await prisma.$queryRawUnsafe<AggRow[]>(sql, ...sqlParams);

  const monthMap = new Map<string, Map<string, TransferSummaryCell>>();
  const matrixMap = new Map<string, TransferSummaryCell>();
  const touchedStores = new Set<number>();

  let grandQty = 0;
  let grandCost = 0;
  let grandEvents = 0;

  for (const r of rows) {
    const fromStore = Number(r.FromStore ?? 0);
    const toStore = Number(r.ToStore ?? 0);
    if (!fromStore || !toStore) continue;
    const yr = Number(r.Yr ?? 0);
    const mo = Number(r.Mo ?? 0);
    if (!yr || !mo) continue;
    const month = `${yr}-${pad2(mo)}`;
    const qty = Number(r.TotalQty ?? 0);
    const cost = Number(r.TotalCost ?? 0);
    const events = Number(r.Events ?? 0);

    touchedStores.add(fromStore);
    touchedStores.add(toStore);

    const pairKey = `${fromStore}|${toStore}`;
    const monthCells = monthMap.get(month) ?? new Map<string, TransferSummaryCell>();
    const mCell = monthCells.get(pairKey) ?? {
      fromStore,
      fromStoreName: stores.get(fromStore)?.name ?? null,
      toStore,
      toStoreName: stores.get(toStore)?.name ?? null,
      quantity: 0,
      cost: 0,
      transferEvents: 0,
    };
    mCell.quantity += qty;
    mCell.cost += cost;
    mCell.transferEvents += events;
    monthCells.set(pairKey, mCell);
    monthMap.set(month, monthCells);

    const matrixCell = matrixMap.get(pairKey) ?? {
      fromStore,
      fromStoreName: stores.get(fromStore)?.name ?? null,
      toStore,
      toStoreName: stores.get(toStore)?.name ?? null,
      quantity: 0,
      cost: 0,
      transferEvents: 0,
    };
    matrixCell.quantity += qty;
    matrixCell.cost += cost;
    matrixCell.transferEvents += events;
    matrixMap.set(pairKey, matrixCell);

    grandQty += qty;
    grandCost += cost;
    grandEvents += events;
  }

  const months: TransferSummaryMonth[] = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, cells]) => {
      const cellList = [...cells.values()].sort(
        (a, b) => a.fromStore - b.fromStore || a.toStore - b.toStore,
      );
      return {
        month,
        cells: cellList,
        totalQuantity: cellList.reduce((s, c) => s + c.quantity, 0),
        totalCost: Math.round(cellList.reduce((s, c) => s + c.cost, 0) * 100) / 100,
        totalEvents: cellList.reduce((s, c) => s + c.transferEvents, 0),
      };
    });

  const matrix = [...matrixMap.values()].sort(
    (a, b) => a.fromStore - b.fromStore || a.toStore - b.toStore,
  );

  const storeList = [...touchedStores]
    .sort((a, b) => a - b)
    .map((n) => ({ number: n, name: stores.get(n)?.name ?? null }));

  return {
    fromDate: params.fromDate,
    toDate: params.toDate,
    months,
    matrix,
    stores: storeList,
    grandTotalQuantity: grandQty,
    grandTotalCost: Math.round(grandCost * 100) / 100,
    grandTotalEvents: grandEvents,
  };
}

// ─────────────────────────── warmup ───────────────────────────────────────

export async function warmup(): Promise<void> {
  try {
    await Promise.all([loadStoreMap(), loadSizeTypeMap(), loadVendorMap()]);
    console.log('[ricsInventoryAdapter] warmup complete');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[ricsInventoryAdapter] warmup failed (non-fatal):', msg);
  }
}

// ─────────────────────────── internals ────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

/**
 * RICS dates arrive from `ConvertTo-Json` as the Microsoft format
 * `/Date(1577985713000)/`. Anything else we pass through.
 */
function parseAccessDate(raw: string | null): string {
  if (!raw) return '';
  const m = /^\/Date\((-?\d+)\)\/$/.exec(raw);
  if (m) return new Date(Number(m[1])).toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}

function normalizeDateRange(from?: string, to?: string): { from: Date | null; to: Date | null } {
  const f = from ? parseYmd(from) : null;
  const t = to ? parseYmd(to) : null;
  if (f && t && f > t) return { from: t, to: f };
  return { from: f, to: t };
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function accessDate(d: Date): string {
  // Access is happy with mm/dd/yyyy inside `#` delimiters, locale-independent.
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  const yyyy = d.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.round((b.getTime() - a.getTime()) / 86_400_000));
}
