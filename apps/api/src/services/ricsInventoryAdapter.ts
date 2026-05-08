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
import { findNeighborSku } from './ricsProductAdapter';
import { buildRicsImageUrl } from './ricsImageUrl';

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
  total?: number;
}

export interface InquiryGrids {
  onHand?: InquirySizeGrid;
  onOrderCurrent?: InquirySizeGrid;
  onOrderFuture?: InquirySizeGrid;
  model?: InquirySizeGrid;
  max?: InquirySizeGrid;
  reorder?: InquirySizeGrid;
  short?: InquirySizeGrid;
  mtdSales?: InquirySizeGrid;
  stdSales?: InquirySizeGrid;
  ytdSales?: InquirySizeGrid;
  lySales?: InquirySizeGrid;
  singleColumn?: InquirySizeGrid;
  allStoresOnHand?: InquirySizeGrid;
  allStoresOneRow?: InquirySizeGrid;
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

export interface InquiryInfoMonth {
  label: string;
  qty: number;
  sales: number;
}

export interface InquiryInfoMetricCell {
  gpPct: number | null;
  roi: number | null;
  turns: number | null;
}

export interface InquiryInfoDetail {
  scopeLabel: string;
  seasonCode: string | null;
  seasonDescription: string | null;
  labelCode: string | null;
  groupCode: string | null;
  groupDescription: string | null;
  firstReceivedAt: string | null;
  lastMarkdownAt: string | null;
  perks: number | null;
  keywords: string | null;
  comment: string | null;
  prior12Months: InquiryInfoMonth[];
  totals: {
    qty: number;
    sales: number;
  };
  metrics: {
    mtd: InquiryInfoMetricCell;
    std: InquiryInfoMetricCell;
    ytd: InquiryInfoMetricCell;
  };
}

export interface InquiryTrendColumn {
  label: string;
  availWeek: number | null;
  availPeriod: number | null;
  recTranAdj: number | null;
  sales: number | null;
  stWeekly: number | null;
  stPeriod: number | null;
  periodReset: boolean;
}

export interface InquiryTrend {
  scopeLabel: string;
  columns: InquiryTrendColumn[];
}

export interface InquiryOpenPoRow {
  poNumber: string;
  storeId: number;
  orderClass: 'AT_ONCE' | 'FUTURE';
  dueDate: string | null;
  rowLabel: string;
  columnLabel: string;
  orderedQty: number;
  receivedQty: number;
  openQty: number;
}

export interface InquiryPurchaseOrderHistoryRow {
  poNumber: string;
  shipStore: number | null;
  vendorCode: string | null;
  buyer: string | null;
  orderDate: string | null;
  dueDate: string | null;
  lastReceivedAt: string | null;
  orderType: string | null;
  legacyStatus: string | null;
  current: boolean | null;
  orderedQty: number;
  receivedQty: number;
  openQty: number;
  lineCount: number;
}

export interface InventoryInquiry {
  sku: string;
  master: {
    description: string | null;
    brand: string | null;
    vendorCode: string | null;
    category: number | null;
    categoryName: string | null;
    vendorSku: string | null;
    styleColor: string | null;
    status: string | null;
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
  lastReceivedAt: string | null;
  pricing: InquiryPricing;
  rollup: InquiryRollup;
  grids: InquiryGrids;
  pictureUrl: string | null;
  info: InquiryInfo;
}

export type FindBySizeSort = 'SKU' | 'DESCRIPTION' | 'VENDOR' | 'CATEGORY';

export interface FindBySizeParams {
  seedSku?: string;
  sizeTypeCode?: number;
  columnLabel?: string;
  rowLabel?: string;
  restrictToSizeType?: boolean;
  vendorCode?: string;
  category?: number;
  styleColor?: string;
  storeNumbers?: number[];
  sort?: FindBySizeSort;
  separateByStore?: boolean;
  limit?: number;
}

export interface FindBySizeRow {
  sku: string;
  description: string | null;
  brand: string | null;
  vendorCode: string | null;
  category: number | null;
  styleColor: string | null;
  sizeTypeCode: number | null;
  sizeTypeDesc: string | null;
  totalOnHand: number;
  storeCount: number;
  storeNumber: number | null;
  storeName: string | null;
}

export interface FindBySizeResult {
  seedSku: string | null;
  columnLabel: string | null;
  rowLabel: string | null;
  sizeTypeCode: number | null;
  sizeTypeDesc: string | null;
  restrictToSizeType: boolean;
  separateByStore: boolean;
  sort: FindBySizeSort;
  rows: FindBySizeRow[];
  totalMatches: number;
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

interface InquiryTimingEntry {
  name: string;
  ms: number;
}

function inquirySlowThresholdMs(): number {
  const raw = Number(process.env.INQUIRY_SLOW_MS ?? 1_000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1_000;
}

async function timeInquiryStep<T>(
  timings: InquiryTimingEntry[],
  name: string,
  loader: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await loader();
  } finally {
    timings.push({ name, ms: Date.now() - startedAt });
  }
}

function logSlowInquiry(
  sku: string,
  totalMs: number,
  timings: InquiryTimingEntry[],
  error?: unknown,
): void {
  const thresholdMs = inquirySlowThresholdMs();
  if (totalMs < thresholdMs) return;

  console.warn('[ricsInventoryAdapter] slow inventory inquiry', {
    sku,
    totalMs,
    thresholdMs,
    steps: timings.map((entry) => ({ name: entry.name, ms: entry.ms })),
    error: error instanceof Error ? error.message : undefined,
  });
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
      `SELECT number AS "Number", "desc" AS "Desc" FROM app.store_master`,
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
    const rows = await prisma.taxonomySizeType.findMany({
      select: {
        code: true,
        description: true,
        columns: true,
        rows: true,
        maxColumns: true,
        maxRows: true,
      },
      orderBy: { code: 'asc' },
    });
    const map = new Map<number, SizeTypeRow>();
    for (const r of rows) {
      const code = Number(r.code);
      if (!Number.isFinite(code)) continue;
      const maxCols = Math.min(54, Math.max(0, Number(r.maxColumns ?? 0)));
      const maxRows = Math.min(27, Math.max(0, Number(r.maxRows ?? 0)));
      const cols = Array.from({ length: maxCols }, (_, i) => (r.columns[i] ?? '').trim());
      const rws = Array.from({ length: maxRows }, (_, i) => (r.rows[i] ?? '').trim());
      map.set(code, {
        code,
        desc: r.description.trim() || null,
        columns: cols,
        rows: rws,
        maxColumns: maxCols,
        maxRows,
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

interface CategoryRow {
  number: number;
  description: string | null;
}

async function loadCategoryMap(): Promise<Map<number, CategoryRow>> {
  return cachedAsync('dim:categories', 300_000, async () => {
    const rows = await prisma.taxonomyCategory.findMany({
      select: {
        number: true,
        description: true,
      },
      orderBy: { number: 'asc' },
    });
    const map = new Map<number, CategoryRow>();
    for (const row of rows) {
      const number = Number(row.number);
      if (!Number.isFinite(number)) continue;
      map.set(number, {
        number,
        description: row.description?.trim() || null,
      });
    }
    return map;
  });
}

interface AppInventorySkuRow {
  id: string;
  code: string | null;
  provisionalCode: string;
  descriptionRics: string | null;
  vendorId: string | null;
  manufacturer: string | null;
  categoryNumber: number | null;
  skuState: string | null;
  ricsStatus: string | null;
  sizeType: number | null;
  season: string | null;
  vendorSku: string | null;
  styleColor: string | null;
  listPrice: number | null;
  retailPrice: number | null;
  markDownPrice1: number | null;
  markDownPrice2: number | null;
  currentCost: number | null;
  currentPriceSlot: string | null;
  labelCode: string | null;
  groupCode: string | null;
  pictureFileName: string | null;
  perks: number | null;
  comment: string | null;
  keywords: string | null;
}

interface StockLevelCellRow {
  storeId: number;
  rowLabel: string;
  columnLabel: string;
  onHand: number;
  lastReceivedAt: Date | null;
  lastMovementAt: Date | null;
}

interface ReplenishmentTargetCellRow {
  storeId: number;
  rowLabel: string;
  columnLabel: string;
  modelQty: number;
  maxQty: number;
  reorderQty: number;
}

interface InventoryHistorySnapshotRow {
  snapshotAsOf: Date | null;
  storeId: number;
  dateLastReceived: Date | null;
  dateFirstReceived: Date | null;
  lastPriceChangeAt: Date | null;
  averageCost: number;
  onHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  modelQty: number;
  weekQtySales: number;
  weekDolSales: number;
  weekProfit: number;
  weekMarkdown: number;
  monthQtySales: number;
  monthDolSales: number;
  monthProfit: number;
  monthMarkdown: number;
  seasonQtySales: number;
  seasonDolSales: number;
  seasonProfit: number;
  seasonMarkdown: number;
  yearQtySales: number;
  yearDolSales: number;
  yearProfit: number;
  yearMarkdown: number;
  lyYearQtySales: number;
  lastMonthOnHand: number;
  lastSeasonOnHand: number;
  lastYearOnHand: number;
  lastMonthInvValue: number;
  trendWeek8BegOnHand: number;
}

interface InventoryHistoryTrendWeekRow {
  storeId: number;
  slotNumber: number;
  beginOnHand: number;
  onHandConstant: number;
  sales: number;
}

interface PurchaseOrderOpenCellRow {
  poNumber: string;
  storeId: number;
  orderClass: 'AT_ONCE' | 'FUTURE';
  dueDate: Date | null;
  rowLabel: string;
  columnLabel: string;
  orderedQty: number;
  receivedQty: number;
  openQty: number;
}

interface SalesHistorySizeRow {
  storeId: number;
  rowLabel: string;
  columnLabel: string;
  mtdSales: number;
  stdSales: number;
  ytdSales: number;
  lySales: number;
}

async function loadVendorMap(): Promise<Map<string, VendorRow>> {
  return cachedAsync('dim:vendors', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<
      { Code: string | null; 'Short Name': string | null; 'Manu Name': string | null }[]
    >(
      `SELECT
          COALESCE(o.code, v.code) AS "Code",
          COALESCE(o.short_name, v.short_name) AS "Short Name",
          COALESCE(o.manu_name, v.manu_name) AS "Manu Name"
         FROM app.vendor v
         FULL OUTER JOIN app.vendor_overlay o ON o.code = v.code
        WHERE (o.source IS NULL OR o.source <> 'tombstone')
          AND (v.code IS NOT NULL OR o.code IS NOT NULL)`,
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

async function loadAppInventorySkuByCode(skuCode: string): Promise<AppInventorySkuRow | null> {
  const row = await prisma.sku.findFirst({
    where: {
      OR: [{ code: skuCode }, { provisionalCode: skuCode }],
    },
    select: {
      id: true,
      code: true,
      provisionalCode: true,
      descriptionRics: true,
      vendorId: true,
      manufacturer: true,
      categoryNumber: true,
      skuState: true,
      ricsStatus: true,
      sizeType: true,
      season: true,
      vendorSku: true,
      styleColor: true,
      listPrice: true,
      retailPrice: true,
      markDownPrice1: true,
      markDownPrice2: true,
      currentCost: true,
      currentPriceSlot: true,
      labelCode: true,
      groupCode: true,
      pictureFileName: true,
      perks: true,
      comment: true,
      keywords: true,
    },
  });
  if (!row) {
    return null;
  }
  return {
    ...row,
    listPrice: row.listPrice == null ? null : Number(row.listPrice),
    retailPrice: row.retailPrice == null ? null : Number(row.retailPrice),
    markDownPrice1: row.markDownPrice1 == null ? null : Number(row.markDownPrice1),
    markDownPrice2: row.markDownPrice2 == null ? null : Number(row.markDownPrice2),
    currentCost: row.currentCost == null ? null : Number(row.currentCost),
    perks: row.perks == null ? null : Number(row.perks),
  };
}

function resolveSkuStatus(sku: Pick<AppInventorySkuRow, 'skuState' | 'ricsStatus'>): string {
  const state = sku.skuState?.trim().toUpperCase();
  if (state) return state;

  const ricsStatus = sku.ricsStatus?.trim().toUpperCase();
  if (ricsStatus === 'D') return 'DISCONTINUED';
  if (ricsStatus) return ricsStatus;
  return 'ACTIVE';
}

async function loadStockLevelRowsForSkuId(skuId: string): Promise<StockLevelCellRow[]> {
  const rows = await prisma.stockLevel.findMany({
    where: { skuId },
    select: {
      storeId: true,
      rowLabel: true,
      columnLabel: true,
      onHand: true,
      lastReceivedAt: true,
      lastMovementAt: true,
    },
  });

  return rows.map((row) => ({
    storeId: row.storeId,
    rowLabel: row.rowLabel.trim(),
    columnLabel: row.columnLabel.trim(),
    onHand: row.onHand,
    lastReceivedAt: row.lastReceivedAt,
    lastMovementAt: row.lastMovementAt,
  }));
}

async function loadReplenishmentTargetRowsForSkuId(skuId: string): Promise<ReplenishmentTargetCellRow[]> {
  const rows = await prisma.replenishmentTarget.findMany({
    where: { skuId },
    select: {
      storeId: true,
      rowLabel: true,
      columnLabel: true,
      modelQty: true,
      maxQty: true,
      reorderQty: true,
    },
  });

  return rows.map((row) => ({
    storeId: row.storeId,
    rowLabel: row.rowLabel.trim(),
    columnLabel: row.columnLabel.trim(),
    modelQty: Number(row.modelQty ?? 0),
    maxQty: Number(row.maxQty ?? 0),
    reorderQty: Number(row.reorderQty ?? 0),
  }));
}

async function loadInventorySalesCellRowsForSkuId(skuId: string): Promise<SalesHistorySizeRow[]> {
  const rows = await prisma.inventorySalesCell.findMany({
    where: { skuId },
    select: {
      storeId: true,
      rowLabel: true,
      columnLabel: true,
      mtdSales: true,
      stdSales: true,
      ytdSales: true,
      lySales: true,
    },
  });

  return rows.map((row) => ({
    storeId: row.storeId,
    rowLabel: row.rowLabel.trim(),
    columnLabel: row.columnLabel.trim(),
    mtdSales: row.mtdSales,
    stdSales: row.stdSales,
    ytdSales: row.ytdSales,
    lySales: row.lySales,
  }));
}

async function loadInventoryHistorySnapshotsForSkuId(
  skuId: string,
): Promise<InventoryHistorySnapshotRow[]> {
  const rows = await prisma.inventoryHistorySnapshot.findMany({
    where: { skuId },
    select: {
      snapshotAsOf: true,
      storeId: true,
      dateLastReceived: true,
      dateFirstReceived: true,
      lastPriceChangeAt: true,
      averageCost: true,
      onHand: true,
      currentOnOrder: true,
      futureOnOrder: true,
      modelQty: true,
      weekQtySales: true,
      weekDolSales: true,
      weekProfit: true,
      weekMarkdown: true,
      monthQtySales: true,
      monthDolSales: true,
      monthProfit: true,
      monthMarkdown: true,
      seasonQtySales: true,
      seasonDolSales: true,
      seasonProfit: true,
      seasonMarkdown: true,
      yearQtySales: true,
      yearDolSales: true,
      yearProfit: true,
      yearMarkdown: true,
      lyYearQtySales: true,
      lastMonthOnHand: true,
      lastSeasonOnHand: true,
      lastYearOnHand: true,
      lastMonthInvValue: true,
      trendWeek8BegOnHand: true,
    },
  });

  return rows.map((row) => ({
    snapshotAsOf: row.snapshotAsOf,
    storeId: row.storeId,
    dateLastReceived: row.dateLastReceived,
    dateFirstReceived: row.dateFirstReceived,
    lastPriceChangeAt: row.lastPriceChangeAt,
    averageCost: Number(row.averageCost ?? 0),
    onHand: row.onHand,
    currentOnOrder: row.currentOnOrder,
    futureOnOrder: row.futureOnOrder,
    modelQty: row.modelQty,
    weekQtySales: row.weekQtySales,
    weekDolSales: Number(row.weekDolSales ?? 0),
    weekProfit: Number(row.weekProfit ?? 0),
    weekMarkdown: Number(row.weekMarkdown ?? 0),
    monthQtySales: row.monthQtySales,
    monthDolSales: Number(row.monthDolSales ?? 0),
    monthProfit: Number(row.monthProfit ?? 0),
    monthMarkdown: Number(row.monthMarkdown ?? 0),
    seasonQtySales: row.seasonQtySales,
    seasonDolSales: Number(row.seasonDolSales ?? 0),
    seasonProfit: Number(row.seasonProfit ?? 0),
    seasonMarkdown: Number(row.seasonMarkdown ?? 0),
    yearQtySales: row.yearQtySales,
    yearDolSales: Number(row.yearDolSales ?? 0),
    yearProfit: Number(row.yearProfit ?? 0),
    yearMarkdown: Number(row.yearMarkdown ?? 0),
    lyYearQtySales: row.lyYearQtySales,
    lastMonthOnHand: row.lastMonthOnHand,
    lastSeasonOnHand: row.lastSeasonOnHand,
    lastYearOnHand: row.lastYearOnHand,
    lastMonthInvValue: Number(row.lastMonthInvValue ?? 0),
    trendWeek8BegOnHand: row.trendWeek8BegOnHand,
  }));
}

async function loadInventoryHistoryTrendWeeksForSkuId(
  skuId: string,
): Promise<InventoryHistoryTrendWeekRow[]> {
  const rows = await prisma.inventoryHistoryTrendWeek.findMany({
    where: {
      snapshot: { skuId },
    },
    select: {
      slotNumber: true,
      beginOnHand: true,
      onHandConstant: true,
      sales: true,
      snapshot: {
        select: {
          storeId: true,
        },
      },
    },
    orderBy: [{ snapshot: { storeId: 'asc' } }, { slotNumber: 'asc' }],
  });

  return rows.map((row) => ({
    storeId: row.snapshot.storeId,
    slotNumber: row.slotNumber,
    beginOnHand: row.beginOnHand,
    onHandConstant: row.onHandConstant,
    sales: row.sales,
  }));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addCalendarDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function resolveSeasonStart(today: Date): Date {
  const t = startOfDay(today);
  const month = t.getMonth() + 1;
  if (month >= 2 && month <= 7) return new Date(t.getFullYear(), 1, 1);
  if (month >= 8) return new Date(t.getFullYear(), 7, 1);
  return new Date(t.getFullYear() - 1, 7, 1);
}

async function loadSalesHistorySizeRowsForSku(
  skuId: string,
  skuCode: string,
): Promise<SalesHistorySizeRow[]> {
  const today = startOfDay(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const seasonStart = resolveSeasonStart(today);
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
  const currentYearStart = yearStart;
  const endExclusive = addCalendarDays(today, 1);

  const lines = await prisma.salesHistoryTicketLine.findMany({
    where: {
      OR: [
        { skuId },
        { skuCode },
      ],
      ticket: {
        status: 'completed',
        purchasedAt: {
          gte: lastYearStart,
          lt: endExclusive,
        },
      },
    },
    select: {
      quantity: true,
      isReturn: true,
      columnLabel: true,
      rowLabel: true,
      sizeValue: true,
      ticket: {
        select: {
          storeId: true,
          purchasedAt: true,
        },
      },
    },
  });

  const bucket = new Map<string, SalesHistorySizeRow>();
  for (const line of lines) {
    const storeId = Number(line.ticket.storeId ?? 0);
    if (!Number.isFinite(storeId) || storeId <= 0) continue;
    const rowLabel = (line.rowLabel ?? '').trim();
    const columnLabel = (line.columnLabel ?? line.sizeValue ?? '').trim();
    const key = `${storeId}|${rowLabel}|${columnLabel}`;
    const qty = Number(line.quantity ?? 0);
    const signedQty = line.isReturn ? -Math.abs(qty) : qty;
    const entry = bucket.get(key) ?? {
      storeId,
      rowLabel,
      columnLabel,
      mtdSales: 0,
      stdSales: 0,
      ytdSales: 0,
      lySales: 0,
    };
    const purchasedAt = line.ticket.purchasedAt;
    if (purchasedAt >= monthStart) entry.mtdSales += signedQty;
    if (purchasedAt >= seasonStart) entry.stdSales += signedQty;
    if (purchasedAt >= yearStart) entry.ytdSales += signedQty;
    if (purchasedAt >= lastYearStart && purchasedAt < currentYearStart) entry.lySales += signedQty;
    bucket.set(key, entry);
  }

  return [...bucket.values()];
}

async function loadOpenPurchaseOrderCellRowsForSku(
  skuId: string,
  skuCode: string,
  sizeType: SizeTypeRow | null,
): Promise<PurchaseOrderOpenCellRow[]> {
  const rows = await prisma.purchaseOrderLegacyLine.findMany({
    where: {
      OR: [{ skuId }, { skuCode }],
      purchaseOrder: {
        shipStore: { not: null },
      },
    },
    select: {
      poNumber: true,
      rowLabel: true,
      segment: true,
      orderedQtys: true,
      receivedQtys: true,
      purchaseOrder: {
        select: {
          shipStore: true,
          current: true,
          dueDate: true,
        },
      },
    },
    orderBy: [{ poNumber: 'asc' }, { rowLabel: 'asc' }, { segment: 'asc' }],
  });

  const out: PurchaseOrderOpenCellRow[] = [];
  for (const row of rows) {
    const storeId = Number(row.purchaseOrder.shipStore ?? 0);
    if (!Number.isFinite(storeId) || storeId <= 0) continue;
    const firstCol = (Number(row.segment ?? 1) - 1) * 18;
    for (let idx = 0; idx < row.orderedQtys.length; idx += 1) {
      const orderedQty = Number(row.orderedQtys[idx] ?? 0);
      const receivedQty = Number(row.receivedQtys[idx] ?? 0);
      const openQty = orderedQty - receivedQty;
      if (openQty <= 0) continue;
      const absoluteIdx = firstCol + idx;
      const columnLabel = sizeType?.columns[absoluteIdx]?.trim() || '';
      if (!columnLabel && sizeType && absoluteIdx >= sizeType.maxColumns) continue;
      out.push({
        poNumber: row.poNumber,
        storeId,
        orderClass: row.purchaseOrder.current === false ? 'FUTURE' : 'AT_ONCE',
        dueDate: row.purchaseOrder.dueDate,
        rowLabel: row.rowLabel.trim(),
        columnLabel,
        orderedQty,
        receivedQty,
        openQty,
      });
    }
  }

  return out;
}

// ─────────────────────────── master lookup ────────────────────────────────

function sumQuantityArray(values: number[] | null | undefined): number {
  return (values ?? []).reduce((sum, value) => sum + Number(value ?? 0), 0);
}

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
  // Full Inventory Inquiry master rows are now loaded on demand from app.sku.
  // The warmed SKU index is intentionally smaller and only covers the lookup
  // modal, lookup facets, and prev/next navigation.
  const rows = await prisma.$queryRawUnsafe<MasterRow[]>(
    `
    SELECT
      s.code AS "SKU",
      s.description_rics AS "Desc",
      s.vendor_id AS "Vendor",
      s.manufacturer AS "Manufacturer",
      s.category_number AS "Category",
      s.size_type AS "SizeType",
      s.season AS "Season",
      s.label_code AS "LabelCode",
      s.group_code AS "GroupCode",
      s.style_color AS "StyleColor",
      s.vendor_sku AS "VendorSku",
      s.list_price::float8 AS "ListPrice",
      s.retail_price::float8 AS "RetailPrice",
      s.mark_down_price1::float8 AS "MarkDownPrice1",
      s.mark_down_price2::float8 AS "MarkDownPrice2",
      CASE UPPER(COALESCE(s.current_price_slot, ''))
        WHEN '1' THEN 1
        WHEN 'LIST' THEN 1
        WHEN '2' THEN 2
        WHEN 'RETAIL' THEN 2
        WHEN '3' THEN 3
        WHEN 'MARKDOWN1' THEN 3
        WHEN 'MARK_DOWN_1' THEN 3
        WHEN 'MD1' THEN 3
        WHEN '4' THEN 4
        WHEN 'MARKDOWN2' THEN 4
        WHEN 'MARK_DOWN_2' THEN 4
        WHEN 'MD2' THEN 4
        ELSE 2
      END AS "CurrentPrice",
      s.current_cost::float8 AS "CurrentCost",
      to_char(s.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "LastPriceChange",
      s.picture_file_name AS "PictureFileName",
      s.perks::float8 AS "Perks",
      s.comment AS "Comment",
      CASE WHEN s.sku_state = 'DISCONTINUED' THEN 'D' ELSE NULL END AS "Status"
    FROM app.sku s
    WHERE s.code = $1
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

function resolveCurrentSlotFromSku(currentPriceSlot: string | null | undefined): PriceSlot {
  const slot = (currentPriceSlot ?? '').trim().toUpperCase();
  if (slot === 'LIST') return 'LIST';
  if (slot === 'MD1' || slot === 'MARKDOWN1') return 'MARKDOWN1';
  if (slot === 'MD2' || slot === 'MARKDOWN2') return 'MARKDOWN2';
  return 'RETAIL';
}

function buildPricingFromSku(sku: AppInventorySkuRow): InquiryPricing {
  return {
    retail: Number(sku.retailPrice ?? 0),
    markdown1: Number(sku.markDownPrice1 ?? 0),
    markdown2: Number(sku.markDownPrice2 ?? 0),
    avgCost: 0,
    currentCost: Number(sku.currentCost ?? 0),
    listPrice: Number(sku.listPrice ?? 0),
    currentSlot: resolveCurrentSlotFromSku(sku.currentPriceSlot),
  };
}

function naturalLabelCompare(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function displayColumnLabel(label: string): string {
  return label.trim() || 'Qty';
}

function displayRowLabel(label: string, fallback = 'Qty'): string {
  return label.trim() || fallback;
}

function resolveRowLabels(storeEntries: InventoryInquiryStore[], sizeType: SizeTypeRow | null): string[] {
  const present = new Set<string>();
  for (const store of storeEntries) {
    for (const cell of store.cells) {
      present.add((cell.rowLabel ?? '').trim());
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const label of sizeType?.rows ?? []) {
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  for (const label of [...present].sort(naturalLabelCompare)) {
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }

  return out.length > 0 ? out : [''];
}

function resolveSelectedRow(selectedRow: string | null | undefined, rowLabels: string[]): string {
  const trimmed = (selectedRow ?? '').trim();
  if (trimmed && rowLabels.includes(trimmed)) return trimmed;
  return rowLabels[0] ?? '';
}

type InquiryGridRow = { label: string; cells: Array<{ value: number | null }> };

function computeGridTotal(rows: InquiryGridRow[]): number {
  return rows
    .filter((row) => row.label.trim().toLowerCase() !== 'total')
    .reduce(
      (sum, row) => sum + row.cells.reduce((rowSum, cell) => rowSum + Number(cell.value ?? 0), 0),
      0,
    );
}

function withGridTotal(grid: InquirySizeGrid): InquirySizeGrid {
  return {
    ...grid,
    total: computeGridTotal(grid.rows),
  };
}

function buildTotalRowFromGrid(columns: string[], rows: InquiryGridRow[], label = 'Total'): InquiryGridRow {
  return {
    label,
    cells: columns.map((_, columnIndex) => ({
      value: rows.reduce((sum, row) => sum + Number(row.cells[columnIndex]?.value ?? 0), 0),
    })),
  };
}

function appendTotalRow(grid: InquirySizeGrid, label = 'Total'): InquirySizeGrid {
  if (grid.columns.length === 0 || grid.rows.length === 0) return grid;
  return {
    ...grid,
    rows: [...grid.rows, buildTotalRowFromGrid(grid.columns, grid.rows, label)],
  };
}

function appendTotalColumn(grid: InquirySizeGrid, label = 'TOT'): InquirySizeGrid {
  if (grid.columns.length === 0 || grid.rows.length === 0) return grid;
  if (grid.columns.some((column) => column.trim().toLowerCase() === label.trim().toLowerCase())) {
    return grid;
  }
  return {
    ...grid,
    columns: [...grid.columns, label],
    rows: grid.rows.map((row) => ({
      ...row,
      cells: [
        ...row.cells,
        { value: row.cells.reduce((sum, cell) => sum + Number(cell.value ?? 0), 0) },
      ],
    })),
  };
}

function removeNullOnlyColumns(grid: InquirySizeGrid): InquirySizeGrid {
  if (grid.columns.length === 0 || grid.rows.length === 0) return grid;

  const keepIndexes = grid.columns
    .map((_, index) => index)
    .filter((columnIndex) =>
      grid.rows.some((row) => row.cells[columnIndex]?.value != null),
    );

  if (keepIndexes.length === grid.columns.length) return grid;

  return {
    ...grid,
    columns: keepIndexes.map((index) => grid.columns[index]),
    rows: grid.rows.map((row) => ({
      ...row,
      cells: keepIndexes.map((index) => row.cells[index] ?? { value: null }),
    })),
  };
}

function buildSingleStoreMetricGrid(
  storeEntries: InventoryInquiryStore[],
  storeId: number,
  columns: string[],
  rowLabels: string[],
  getValue: (cell: InventoryCell) => number,
): InquirySizeGrid {
  const store = storeEntries.find((entry) => entry.storeNumber === storeId);
  const rows = rowLabels.length > 0 ? rowLabels : [''];
  return {
    columns,
    rows: rows.map((rowLabel) => {
      const byCol = new Map<string, number>();
      for (const cell of store?.cells ?? []) {
        if ((cell.rowLabel ?? '').trim() !== rowLabel) continue;
        const display = displayColumnLabel(cell.columnLabel);
        byCol.set(display, (byCol.get(display) ?? 0) + getValue(cell));
      }
      return {
        label: displayRowLabel(rowLabel),
        cells: columns.map((column) => ({ value: byCol.get(column) ?? null })),
      };
    }),
  };
}

function buildStoreMetricGrid(
  storeEntries: InventoryInquiryStore[],
  columns: string[],
  getValue: (cell: InventoryCell) => number,
  rowFilter?: string | null,
): InquirySizeGrid {
  return {
    columns,
    rows: storeEntries.map((store) => {
      const byCol = new Map<string, number>();
      for (const cell of store.cells) {
        if (rowFilter != null && (cell.rowLabel ?? '').trim() !== rowFilter.trim()) continue;
        const display = displayColumnLabel(cell.columnLabel);
        byCol.set(display, (byCol.get(display) ?? 0) + getValue(cell));
      }
      return {
        label: store.storeName ?? `Store ${store.storeNumber}`,
        cells: columns.map((column) => ({ value: byCol.get(column) ?? null })),
      };
    }),
  };
}

function shortQuantity(cell: InventoryCell): number {
  return Math.max(cell.model - cell.onHand, 0);
}

function buildMetricRowByColumnGrid(
  storeEntries: InventoryInquiryStore[],
  columns: string[],
  rowFilter: string,
  label: string,
  getValue: (cell: InventoryCell) => number,
  options?: {
    includeTotal?: boolean;
    totalOverride?: number;
    blankDetail?: boolean;
  },
): { label: string; cells: Array<{ value: number | null }> } {
  const totalsByCol = new Map<string, number>();
  for (const store of storeEntries) {
    for (const cell of store.cells) {
      if ((cell.rowLabel ?? '').trim() !== rowFilter.trim()) continue;
      const display = displayColumnLabel(cell.columnLabel);
      totalsByCol.set(display, (totalsByCol.get(display) ?? 0) + getValue(cell));
    }
  }
  const cells = columns.map((column) => ({
    value: options?.blankDetail ? null : (totalsByCol.get(column) ?? null),
  }));
  if (options?.includeTotal) {
    const computedTotal = [...totalsByCol.values()].reduce((sum, value) => sum + value, 0);
    const totalValue = options.totalOverride ?? computedTotal;
    cells.push({ value: totalValue === 0 ? null : totalValue });
  }
  return {
    label,
    cells,
  };
}

interface SummaryStoreMetrics {
  onHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  mtdSales: number;
  stdSales: number;
  ytdSales: number;
  lySales: number;
}

function zeroSummaryStoreMetrics(): SummaryStoreMetrics {
  return {
    onHand: 0,
    currentOnOrder: 0,
    futureOnOrder: 0,
    mtdSales: 0,
    stdSales: 0,
    ytdSales: 0,
    lySales: 0,
  };
}

function summarizeStoreMetrics(cells: InventoryCell[]): SummaryStoreMetrics {
  return cells.reduce<SummaryStoreMetrics>(
    (totals, cell) => ({
      onHand: totals.onHand + cell.onHand,
      currentOnOrder: totals.currentOnOrder + cell.currentOnOrder,
      futureOnOrder: totals.futureOnOrder + cell.futureOnOrder,
      mtdSales: totals.mtdSales + cell.mtdSales,
      stdSales: totals.stdSales + cell.stdSales,
      ytdSales: totals.ytdSales + cell.ytdSales,
      lySales: totals.lySales + cell.lySales,
    }),
    zeroSummaryStoreMetrics(),
  );
}

function buildSummaryMetricsByStore(
  storeEntries: InventoryInquiryStore[],
): Map<number, SummaryStoreMetrics> {
  return new Map(
    storeEntries.map((store) => [store.storeNumber, summarizeStoreMetrics(store.cells)]),
  );
}

function buildStoreSummaryMetricsGrid(
  metricsByStore: Map<number, SummaryStoreMetrics>,
): InquirySizeGrid {
  const storeIds = [...metricsByStore.entries()]
    .filter(([, metrics]) =>
      metrics.onHand !== 0
      || metrics.currentOnOrder !== 0
      || metrics.futureOnOrder !== 0
      || metrics.mtdSales !== 0
      || metrics.stdSales !== 0
      || metrics.ytdSales !== 0
      || metrics.lySales !== 0)
    .map(([storeId]) => storeId)
    .sort((a, b) => a - b);
  const columns = [...storeIds.map((storeId) => String(storeId)), 'TOT'];
  const metricRows: Array<{ label: string; getValue: (metrics: SummaryStoreMetrics) => number }> = [
    { label: 'On Hand', getValue: (metrics) => metrics.onHand },
    { label: 'On Ord (A/O)', getValue: (metrics) => metrics.currentOnOrder },
    { label: 'On Ord (Fut)', getValue: (metrics) => metrics.futureOnOrder },
    { label: 'MTD Sales', getValue: (metrics) => metrics.mtdSales },
    { label: 'STD Sales', getValue: (metrics) => metrics.stdSales },
    { label: 'YTD Sales', getValue: (metrics) => metrics.ytdSales },
    { label: 'L/Y Sales', getValue: (metrics) => metrics.lySales },
  ];

  return {
    columns,
    rows: metricRows.map((metricRow) => {
      let total = 0;
      const cells = storeIds.map((storeId) => {
        const value = metricRow.getValue(metricsByStore.get(storeId)!);
        total += value;
        return { value: value === 0 ? null : value };
      });
      cells.push({ value: total === 0 ? null : total });
      return {
        label: metricRow.label,
        cells,
      };
    }),
  };
}

function buildAllStoresOneRowGrid(
  storeEntries: InventoryInquiryStore[],
  rowLabel: string,
): InquirySizeGrid {
  const activeStores = [...storeEntries]
    .filter((store) => store.cells.some((cell) => (cell.rowLabel ?? '').trim() === rowLabel.trim()))
    .sort((a, b) => a.storeNumber - b.storeNumber);
  const columns = [...activeStores.map((store) => String(store.storeNumber)), 'TOT'];
  const metricRows: Array<{ label: string; getValue: (cell: InventoryCell) => number }> = [
    { label: 'On Hand', getValue: (cell) => cell.onHand },
    { label: 'On Ord (A/O)', getValue: (cell) => cell.currentOnOrder },
    { label: 'On Ord (Fut)', getValue: (cell) => cell.futureOnOrder },
    { label: 'MTD Sales', getValue: (cell) => cell.mtdSales },
    { label: 'STD Sales', getValue: (cell) => cell.stdSales },
    { label: 'YTD Sales', getValue: (cell) => cell.ytdSales },
    { label: 'L/Y Sales', getValue: (cell) => cell.lySales },
  ];

  return {
    columns,
    rows: metricRows.map((metricRow) => {
      let total = 0;
      const cells = activeStores.map((store) => {
        const value = store.cells
          .filter((cell) => (cell.rowLabel ?? '').trim() === rowLabel.trim())
          .reduce((sum, cell) => sum + metricRow.getValue(cell), 0);
        total += value;
        return { value: value === 0 ? null : value };
      });
      cells.push({ value: total === 0 ? null : total });
      return {
        label: metricRow.label,
        cells,
      };
    }),
  };
}

function buildGrids(
  storeEntries: InventoryInquiryStore[],
  sizeType: SizeTypeRow | null,
  summaryByStore: Map<number, SummaryStoreMetrics>,
  scopedStoreId?: number,
  selectedRow?: string | null,
): InquiryGrids {
  if (!storeEntries.length && summaryByStore.size === 0) return {};

  const columns = mergeColumnLabels(storeEntries, sizeType?.columns ?? []);
  const rowLabels = resolveRowLabels(storeEntries, sizeType);
  const effectiveRow = resolveSelectedRow(selectedRow, rowLabels);
  const scopedMetricGrid = (getValue: (cell: InventoryCell) => number): InquirySizeGrid =>
    scopedStoreId != null
      ? buildSingleStoreMetricGrid(storeEntries, scopedStoreId, columns, rowLabels, getValue)
      : buildStoreMetricGrid(storeEntries, columns, getValue);
  const visibleMetricGrid = (getValue: (cell: InventoryCell) => number): InquirySizeGrid =>
    removeNullOnlyColumns(scopedMetricGrid(getValue));

  return {
    onHand: appendTotalColumn(withGridTotal(visibleMetricGrid((cell) => cell.onHand))),
    onOrderCurrent: visibleMetricGrid((cell) => cell.currentOnOrder),
    onOrderFuture: visibleMetricGrid((cell) => cell.futureOnOrder),
    model: appendTotalRow(appendTotalColumn(withGridTotal(visibleMetricGrid((cell) => cell.model)))),
    max: visibleMetricGrid((cell) => cell.maxQty),
    reorder: visibleMetricGrid((cell) => cell.reorder),
    short: withGridTotal(appendTotalRow(visibleMetricGrid(shortQuantity))),
    mtdSales: withGridTotal(appendTotalRow(visibleMetricGrid((cell) => cell.mtdSales))),
    stdSales: withGridTotal(appendTotalRow(visibleMetricGrid((cell) => cell.stdSales))),
    ytdSales: withGridTotal(appendTotalRow(visibleMetricGrid((cell) => cell.ytdSales))),
    lySales: withGridTotal(appendTotalRow(visibleMetricGrid((cell) => cell.lySales))),
    singleColumn: appendTotalColumn(
      removeNullOnlyColumns({
        columns,
        rows: [
          buildMetricRowByColumnGrid(storeEntries, columns, effectiveRow, 'On Hand', (cell) => cell.onHand),
          buildMetricRowByColumnGrid(storeEntries, columns, effectiveRow, 'On Ord (A/O)', (cell) => cell.currentOnOrder),
          buildMetricRowByColumnGrid(storeEntries, columns, effectiveRow, 'On Ord (Fut)', (cell) => cell.futureOnOrder),
          buildMetricRowByColumnGrid(storeEntries, columns, effectiveRow, 'Model', (cell) => cell.model),
          buildMetricRowByColumnGrid(storeEntries, columns, effectiveRow, 'Short', shortQuantity),
          buildMetricRowByColumnGrid(storeEntries, columns, effectiveRow, 'MTD Sales', (cell) => cell.mtdSales),
          buildMetricRowByColumnGrid(storeEntries, columns, effectiveRow, 'STD Sales', (cell) => cell.stdSales),
          buildMetricRowByColumnGrid(storeEntries, columns, effectiveRow, 'YTD Sales', (cell) => cell.ytdSales),
          buildMetricRowByColumnGrid(storeEntries, columns, effectiveRow, 'L/Y Sales', (cell) => cell.lySales),
        ],
      }),
    ),
    allStoresOnHand: removeNullOnlyColumns(
      buildStoreMetricGrid(storeEntries, columns, (cell) => cell.onHand, effectiveRow),
    ),
    allStoresOneRow:
      rowLabels.length <= 1
        ? buildStoreSummaryMetricsGrid(summaryByStore)
        : buildAllStoresOneRowGrid(storeEntries, effectiveRow),
    allStoresSummary: buildStoreSummaryMetricsGrid(summaryByStore),
  };
}

function buildPictureUrl(master: MasterRow): string | null {
  return buildRicsImageUrl(master.PictureFileName);
}

function buildPictureUrlFromSku(sku: AppInventorySkuRow): string | null {
  return buildRicsImageUrl(sku.pictureFileName);
}

function mergeColumnLabels(storeEntries: InventoryInquiryStore[], preferred: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const label of preferred) {
    const display = displayColumnLabel(label);
    if (seen.has(display)) continue;
    seen.add(display);
    out.push(display);
  }

  for (const store of storeEntries) {
    for (const cell of store.cells) {
      const display = displayColumnLabel(cell.columnLabel);
      if (seen.has(display)) continue;
      seen.add(display);
      out.push(display);
    }
  }

  return out.length > 0 ? out : ['Qty'];
}

// ─────────────────────────── public: Inventory Inquiry ────────────────────

export async function getInventoryInquiry(
  sku: string,
  storeId?: number,
  selectedRow?: string | null,
): Promise<InventoryInquiry | null> {
  const trimmed = (sku ?? '').trim();
  if (!trimmed) return null;

  const totalStartedAt = Date.now();
  const timings: InquiryTimingEntry[] = [];
  const skuRow = await timeInquiryStep(timings, 'skuLookup', () => loadAppInventorySkuByCode(trimmed));
  if (!skuRow) return null;

  const [stores, sizeTypes, categories] = await Promise.all([
    timeInquiryStep(timings, 'stores', () => loadStoreMap()),
    timeInquiryStep(timings, 'sizeTypes', () => loadSizeTypeMap()),
    timeInquiryStep(timings, 'categories', () => loadCategoryMap()),
  ]);
  const sizeType = skuRow.sizeType != null ? sizeTypes.get(Number(skuRow.sizeType)) ?? null : null;
  const category =
    skuRow.categoryNumber != null ? categories.get(Number(skuRow.categoryNumber)) ?? null : null;
  const effectiveStoreId =
    storeId != null && Number.isFinite(Number(storeId)) ? Math.trunc(Number(storeId)) : undefined;
  const skuCode = skuRow.code ?? skuRow.provisionalCode;
  type InquiryLoadRows = [
    StockLevelCellRow[],
    ReplenishmentTargetCellRow[],
    InventoryHistorySnapshotRow[],
    Map<number, InquiryHistoryMonthAggregate[]>,
    PurchaseOrderOpenCellRow[],
    SalesHistorySizeRow[],
  ];

  const [
    stockRows,
    targetRows,
    historyRows,
    historyMonthsByStore,
    openPoRows,
    salesCellRows,
  ] = await (async (): Promise<InquiryLoadRows> => {
    try {
      return await Promise.all([
        timeInquiryStep(timings, 'stock', () => loadStockLevelRowsForSkuId(skuRow.id)),
        timeInquiryStep(timings, 'replenishmentTargets', () => loadReplenishmentTargetRowsForSkuId(skuRow.id)),
        timeInquiryStep(timings, 'historySnapshots', () => loadInventoryHistorySnapshotsForSkuId(skuRow.id)),
        timeInquiryStep(timings, 'monthlyHistoryByStore', () => loadInquiryMonthlySalesByStore(skuRow.id)),
        timeInquiryStep(timings, 'openPurchaseOrders', () =>
          loadOpenPurchaseOrderCellRowsForSku(skuRow.id, skuCode, sizeType),
        ),
        timeInquiryStep(timings, 'salesCells', () => loadInventorySalesCellRowsForSkuId(skuRow.id)),
      ]) as InquiryLoadRows;
    } catch (err) {
      logSlowInquiry(skuCode, Date.now() - totalStartedAt, timings, err);
      throw err;
    }
  })();

  const cellsByStore = new Map<number, Map<string, InventoryCell>>();
  const ensureCell = (storeNumber: number, rowLabel: string, columnLabel: string): InventoryCell => {
    const normalizedRow = (rowLabel ?? '').trim();
    const normalizedColumn = (columnLabel ?? '').trim();
    const cellKey = `${normalizedRow}|${normalizedColumn}`;
    let byCell = cellsByStore.get(storeNumber);
    if (!byCell) {
      byCell = new Map<string, InventoryCell>();
      cellsByStore.set(storeNumber, byCell);
    }
    const existing = byCell.get(cellKey);
    if (existing) return existing;
    const created: InventoryCell = {
      storeNumber,
      rowLabel: normalizedRow,
      columnLabel: normalizedColumn,
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
    byCell.set(cellKey, created);
    return created;
  };

  let latestReceivedAt: Date | null = null;
  for (const row of stockRows) {
    const cell = ensureCell(row.storeId, row.rowLabel, row.columnLabel);
    cell.onHand = row.onHand;
    if (row.lastReceivedAt && (!latestReceivedAt || row.lastReceivedAt > latestReceivedAt)) {
      latestReceivedAt = row.lastReceivedAt;
    }
  }

  for (const row of targetRows) {
    const cell = ensureCell(row.storeId, row.rowLabel, row.columnLabel);
    cell.model = row.modelQty;
    cell.maxQty = row.maxQty;
    cell.reorder = row.reorderQty;
  }

  for (const row of openPoRows) {
    const cell = ensureCell(row.storeId, row.rowLabel, row.columnLabel);
    if (row.orderClass === 'AT_ONCE') cell.currentOnOrder += row.openQty;
    else cell.futureOnOrder += row.openQty;
  }

  for (const row of salesCellRows) {
    const cell = ensureCell(row.storeId, row.rowLabel, row.columnLabel);
    cell.mtdSales += row.mtdSales;
    cell.stdSales += row.stdSales;
    cell.ytdSales += row.ytdSales;
    cell.lySales += row.lySales;
  }

  for (const row of historyRows) {
    if (row.dateLastReceived && (!latestReceivedAt || row.dateLastReceived > latestReceivedAt)) {
      latestReceivedAt = row.dateLastReceived;
    }
  }

  const storeEntries: InventoryInquiryStore[] = [...cellsByStore.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([storeNumber, byCell]) => {
      const cells = [...byCell.values()].sort((a, b) => {
        const rowCmp = naturalLabelCompare(a.rowLabel, b.rowLabel);
        return rowCmp !== 0 ? rowCmp : naturalLabelCompare(a.columnLabel, b.columnLabel);
      });
      return {
        storeNumber,
        storeName: stores.get(storeNumber)?.name ?? `Store ${storeNumber}`,
        cells,
        totals: sumCellTotals(cells),
      };
    });
  const scopedHistoryRows =
    effectiveStoreId != null
      ? historyRows.filter((row) => row.storeId === effectiveStoreId)
      : historyRows;
  const summaryByStore = buildSummaryMetricsByStoreFromHistory(
    storeEntries,
    historyRows,
    historyMonthsByStore,
  );
  const summaryTotals = [...summaryByStore.values()].reduce(
    (totals, metrics) => ({
      ytdSales: totals.ytdSales + metrics.ytdSales,
      lySales: totals.lySales + metrics.lySales,
    }),
    { ytdSales: 0, lySales: 0 },
  );
  const inventoryTotals = storeEntries.reduce<InventoryInquiryStore['totals']>(
    (totals, store) => ({
      onHand: totals.onHand + store.totals.onHand,
      currentOnOrder: totals.currentOnOrder + store.totals.currentOnOrder,
      futureOnOrder: totals.futureOnOrder + store.totals.futureOnOrder,
      ytdSales: 0,
      lySales: 0,
    }),
    { onHand: 0, currentOnOrder: 0, futureOnOrder: 0, ytdSales: 0, lySales: 0 },
  );

  const brand = skuRow.manufacturer?.trim() || skuRow.vendorId?.trim() || null;

  const rowLabelsPresent = new Set<string>();
  for (const entry of storeEntries) {
    for (const cell of entry.cells) {
      if (cell.rowLabel) rowLabelsPresent.add(cell.rowLabel);
    }
  }

  const inquiry: InventoryInquiry = {
    sku: skuCode,
    master: {
      description: skuRow.descriptionRics?.trim() || null,
      brand,
      vendorCode: skuRow.vendorId?.trim() || null,
      category: skuRow.categoryNumber ?? null,
      categoryName: category?.description ?? null,
      vendorSku: skuRow.vendorSku?.trim() || null,
      styleColor: skuRow.styleColor?.trim() || null,
      status: resolveSkuStatus(skuRow),
      season: skuRow.season?.trim() || null,
      retailPrice: skuRow.retailPrice ?? null,
      currentCost: skuRow.currentCost ?? null,
      sizeType: {
        code: sizeType?.code ?? skuRow.sizeType ?? null,
        desc: sizeType?.desc ?? null,
        rowLabels: sizeType
          ? sizeType.rows.filter((label) => label && (rowLabelsPresent.size === 0 || rowLabelsPresent.has(label)))
          : [...rowLabelsPresent],
        columnLabels: sizeType ? sizeType.columns.filter((label) => !!label) : [],
      },
    },
    stores: storeEntries,
    totals: {
      onHand: inventoryTotals.onHand,
      currentOnOrder: inventoryTotals.currentOnOrder,
      futureOnOrder: inventoryTotals.futureOnOrder,
      ytdSales: summaryTotals.ytdSales,
      lySales: summaryTotals.lySales,
    },
    lastReceivedAt: latestReceivedAt?.toISOString() ?? null,
    pricing: buildPricingFromSku(skuRow),
    rollup: buildInquiryRollupFromHistory(scopedHistoryRows),
    grids: buildGrids(storeEntries, sizeType, summaryByStore, effectiveStoreId, selectedRow),
    pictureUrl: buildPictureUrlFromSku(skuRow),
    info: {
      seasonCode: skuRow.season?.trim() || null,
      labelCode: skuRow.labelCode?.trim() || null,
      groupCode: skuRow.groupCode?.trim() || null,
      firstReceivedAt: null,
      lastMarkdownAt: null,
      perks: skuRow.perks ?? null,
      comment: skuRow.comment?.trim() || null,
    },
  };

  logSlowInquiry(skuCode, Date.now() - totalStartedAt, timings);
  return inquiry;
}

interface InquiryInventoryHistoryMonthAggregateRow {
  YearMonth: string | null;
  QtySales: number | null;
  NetSales: number | null;
}

interface InquiryInventoryHistoryMonthStoreAggregateRow {
  StoreId: number | null;
  YearMonth: string | null;
  QtySales: number | null;
  NetSales: number | null;
}

interface InquiryHistoryMonthAggregate {
  yearMonth: string;
  qty: number;
  sales: number;
}

interface InquiryMonthlySalesResult {
  months: InquiryInfoMonth[];
  history: InquiryHistoryMonthAggregate[];
}

interface InquirySnapshotMetricAccumulator {
  snapshotAsOf: Date | null;
  currentInventoryValue: number;
  monthBeginValue: number;
  seasonBeginValue: number;
  yearBeginValue: number;
  monthQtySales: number;
  monthSales: number;
  monthProfit: number;
  seasonQtySales: number;
  seasonSales: number;
  seasonProfit: number;
  yearQtySales: number;
  yearSales: number;
  yearProfit: number;
}

const inquiryMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' });

function parseYearMonth(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

async function loadInquiryMonthlySales(
  skuId: string,
  storeId: number | undefined,
): Promise<InquiryMonthlySalesResult> {
  const storeFilter = storeId != null ? 'AND s.store_id = $2::int' : '';
  const sql = `
    SELECT
      m.year_month AS "YearMonth",
      SUM(COALESCE(m.qty_sales, 0))::float8 AS "QtySales",
      SUM(COALESCE(m.net_sales, 0))::float8 AS "NetSales"
    FROM app.inventory_history_month m
    INNER JOIN app.inventory_history_snapshot s ON s.id = m.snapshot_id
    WHERE
      s.sku_id = $1::uuid
      ${storeFilter}
    GROUP BY 1
    ORDER BY 1
  `;

  const params: unknown[] = [skuId];
  if (storeId != null) params.push(storeId);
  const rows = await prisma.$queryRawUnsafe<InquiryInventoryHistoryMonthAggregateRow[]>(sql, ...params);

  const history: InquiryHistoryMonthAggregate[] = [];
  for (const row of rows) {
    if (!row.YearMonth) continue;
    history.push({
      yearMonth: row.YearMonth,
      qty: Number(row.QtySales ?? 0),
      sales: Number(row.NetSales ?? 0),
    });
  }
  return {
    history,
    months: history.map((row) => {
      const slotDate = parseYearMonth(row.yearMonth);
      return {
        label: slotDate ? inquiryMonthFormatter.format(slotDate) : row.yearMonth,
        qty: row.qty,
        sales: row.sales,
      };
    }),
  };
}

async function loadInquiryMonthlySalesByStore(
  skuId: string,
): Promise<Map<number, InquiryHistoryMonthAggregate[]>> {
  const rows = await prisma.$queryRawUnsafe<InquiryInventoryHistoryMonthStoreAggregateRow[]>(
    `
      SELECT
        s.store_id AS "StoreId",
        m.year_month AS "YearMonth",
        SUM(COALESCE(m.qty_sales, 0))::float8 AS "QtySales",
        SUM(COALESCE(m.net_sales, 0))::float8 AS "NetSales"
      FROM app.inventory_history_month m
      INNER JOIN app.inventory_history_snapshot s ON s.id = m.snapshot_id
      WHERE s.sku_id = $1::uuid
      GROUP BY 1, 2
      ORDER BY 1, 2
    `,
    skuId,
  );

  const out = new Map<number, InquiryHistoryMonthAggregate[]>();
  for (const row of rows) {
    const storeId = Number(row.StoreId ?? 0);
    if (!Number.isFinite(storeId) || storeId <= 0 || !row.YearMonth) continue;
    const history = out.get(storeId) ?? [];
    history.push({
      yearMonth: row.YearMonth,
      qty: Number(row.QtySales ?? 0),
      sales: Number(row.NetSales ?? 0),
    });
    out.set(storeId, history);
  }

  return out;
}

function buildLegacyLastYearSalesByStore(
  historyRows: InventoryHistorySnapshotRow[],
  monthlyHistoryByStore: Map<number, InquiryHistoryMonthAggregate[]>,
): Map<number, number> {
  const latestSnapshotAsOf = maxDate(historyRows.map((row) => row.snapshotAsOf));
  if (!latestSnapshotAsOf) return new Map();

  const lastCalendarYear = latestSnapshotAsOf.getFullYear() - 1;
  const snapshotMonth = latestSnapshotAsOf.getMonth() + 1;
  const lastYearPrefix = `${lastCalendarYear}-`;

  const out = new Map<number, number>();
  for (const row of historyRows) {
    const visibleLastYearQty = (monthlyHistoryByStore.get(row.storeId) ?? []).reduce(
      (sum, month) => (
        month.yearMonth.startsWith(lastYearPrefix)
          ? sum + month.qty
          : sum
      ),
      0,
    );

    // The rolling 12-month table only carries the trailing closed months.
    // Once the snapshot advances past January, the early months of the prior
    // calendar year live in the LY year carry field.
    const lyCarryQty = snapshotMonth > 1 ? row.lyYearQtySales : 0;
    out.set(row.storeId, visibleLastYearQty + lyCarryQty);
  }

  return out;
}

function buildSummaryMetricsByStoreFromHistory(
  storeEntries: InventoryInquiryStore[],
  historyRows: InventoryHistorySnapshotRow[],
  monthlyHistoryByStore: Map<number, InquiryHistoryMonthAggregate[]>,
): Map<number, SummaryStoreMetrics> {
  const metricsByStore = new Map<number, SummaryStoreMetrics>(
    storeEntries.map((store) => {
      const totals = summarizeStoreMetrics(store.cells);
      return [store.storeNumber, {
        onHand: totals.onHand,
        currentOnOrder: totals.currentOnOrder,
        futureOnOrder: totals.futureOnOrder,
        mtdSales: 0,
        stdSales: 0,
        ytdSales: 0,
        lySales: 0,
      }];
    }),
  );
  const legacyLastYearByStore = buildLegacyLastYearSalesByStore(historyRows, monthlyHistoryByStore);

  for (const row of historyRows) {
    const current = metricsByStore.get(row.storeId) ?? zeroSummaryStoreMetrics();
    metricsByStore.set(row.storeId, {
      ...current,
      mtdSales: current.mtdSales + row.monthQtySales,
      stdSales: current.stdSales + row.seasonQtySales,
      ytdSales: current.ytdSales + row.yearQtySales,
      lySales: legacyLastYearByStore.get(row.storeId) ?? current.lySales,
    });
  }

  for (const [storeId, lySales] of legacyLastYearByStore.entries()) {
    if (metricsByStore.has(storeId)) continue;
    metricsByStore.set(storeId, { ...zeroSummaryStoreMetrics(), lySales });
  }

  return metricsByStore;
}

function zeroRollupCell(): InquiryRollupCell {
  return { qty: 0, net: 0, markdown: 0, profit: 0 };
}

function buildInquiryRollupFromHistory(historyRows: InventoryHistorySnapshotRow[]): InquiryRollup {
  return historyRows.reduce<InquiryRollup>(
    (rollup, row) => ({
      week: {
        qty: rollup.week.qty + row.weekQtySales,
        net: rollup.week.net + row.weekDolSales,
        markdown: rollup.week.markdown + row.weekMarkdown,
        profit: rollup.week.profit + row.weekProfit,
      },
      month: {
        qty: rollup.month.qty + row.monthQtySales,
        net: rollup.month.net + row.monthDolSales,
        markdown: rollup.month.markdown + row.monthMarkdown,
        profit: rollup.month.profit + row.monthProfit,
      },
      season: {
        qty: rollup.season.qty + row.seasonQtySales,
        net: rollup.season.net + row.seasonDolSales,
        markdown: rollup.season.markdown + row.seasonMarkdown,
        profit: rollup.season.profit + row.seasonProfit,
      },
      year: {
        qty: rollup.year.qty + row.yearQtySales,
        net: rollup.year.net + row.yearDolSales,
        markdown: rollup.year.markdown + row.yearMarkdown,
        profit: rollup.year.profit + row.yearProfit,
      },
    }),
    {
      week: zeroRollupCell(),
      month: zeroRollupCell(),
      season: zeroRollupCell(),
      year: zeroRollupCell(),
    },
  );
}

function buildInquiryMetricCell(
  netSales: number,
  grossProfit: number,
  beginInventoryValue: number,
  currentInventoryValue: number,
  annualizer: number,
): InquiryInfoMetricCell {
  const gpPct =
    netSales === 0 ? null : round1((grossProfit / netSales) * 100);
  const averageInventoryValue = (beginInventoryValue + currentInventoryValue) / 2;
  if (averageInventoryValue <= 0 || annualizer <= 0) {
    return { gpPct, roi: null, turns: null };
  }
  const cogs = netSales - grossProfit;
  return {
    gpPct,
    roi: ((grossProfit * annualizer) / averageInventoryValue) * 100,
    turns: (cogs * annualizer) / averageInventoryValue,
  };
}

function summarizeInquirySnapshotMetrics(
  scopedHistory: InventoryHistorySnapshotRow[],
): InquirySnapshotMetricAccumulator {
  return scopedHistory.reduce<InquirySnapshotMetricAccumulator>(
    (totals, row) => ({
      snapshotAsOf:
        !totals.snapshotAsOf || (row.snapshotAsOf && row.snapshotAsOf > totals.snapshotAsOf)
          ? (row.snapshotAsOf ?? totals.snapshotAsOf)
          : totals.snapshotAsOf,
      currentInventoryValue: totals.currentInventoryValue + (row.onHand * row.averageCost),
      monthBeginValue: totals.monthBeginValue + row.lastMonthInvValue,
      seasonBeginValue: totals.seasonBeginValue + (row.lastSeasonOnHand * row.averageCost),
      yearBeginValue: totals.yearBeginValue + (row.lastYearOnHand * row.averageCost),
      monthQtySales: totals.monthQtySales + row.monthQtySales,
      monthSales: totals.monthSales + row.monthDolSales,
      monthProfit: totals.monthProfit + row.monthProfit,
      seasonQtySales: totals.seasonQtySales + row.seasonQtySales,
      seasonSales: totals.seasonSales + row.seasonDolSales,
      seasonProfit: totals.seasonProfit + row.seasonProfit,
      yearQtySales: totals.yearQtySales + row.yearQtySales,
      yearSales: totals.yearSales + row.yearDolSales,
      yearProfit: totals.yearProfit + row.yearProfit,
    }),
    {
      snapshotAsOf: null,
      currentInventoryValue: 0,
      monthBeginValue: 0,
      seasonBeginValue: 0,
      yearBeginValue: 0,
      monthQtySales: 0,
      monthSales: 0,
      monthProfit: 0,
      seasonQtySales: 0,
      seasonSales: 0,
      seasonProfit: 0,
      yearQtySales: 0,
      yearSales: 0,
      yearProfit: 0,
    },
  );
}

function inferSeasonClosedMonthCount(
  history: InquiryHistoryMonthAggregate[],
  monthQtySales: number,
  monthSales: number,
  seasonQtySales: number,
  seasonSales: number,
): number {
  const targetQty = seasonQtySales - monthQtySales;
  const targetSales = seasonSales - monthSales;
  if (Math.abs(targetQty) < 0.0001 && Math.abs(targetSales) < 0.01) return 0;

  let runningQty = 0;
  let runningSales = 0;
  let count = 0;
  for (const row of [...history].reverse()) {
    runningQty += row.qty;
    runningSales += row.sales;
    count += 1;
    if (Math.abs(runningQty - targetQty) < 0.0001 && Math.abs(runningSales - targetSales) < 0.01) {
      return count;
    }
  }
  return 1;
}

function resolveYearAnnualizer(snapshotAsOf: Date | null): number {
  if (!snapshotAsOf) return 12;
  const closedMonths = snapshotAsOf.getMonth();
  return 12 / Math.max(1, closedMonths);
}

function loadInquiryMetrics(
  scopedHistory: InventoryHistorySnapshotRow[],
  history: InquiryHistoryMonthAggregate[],
): InquiryInfoDetail['metrics'] {
  const totals = summarizeInquirySnapshotMetrics(scopedHistory);
  const seasonClosedMonths = inferSeasonClosedMonthCount(
    history,
    totals.monthQtySales,
    totals.monthSales,
    totals.seasonQtySales,
    totals.seasonSales,
  );

  return {
    mtd: buildInquiryMetricCell(
      totals.monthSales,
      totals.monthProfit,
      totals.monthBeginValue,
      totals.currentInventoryValue,
      12,
    ),
    std: buildInquiryMetricCell(
      totals.seasonSales,
      totals.seasonProfit,
      totals.seasonBeginValue,
      totals.currentInventoryValue,
      12 / Math.max(1, seasonClosedMonths),
    ),
    ytd: buildInquiryMetricCell(
      totals.yearSales,
      totals.yearProfit,
      totals.yearBeginValue,
      totals.currentInventoryValue,
      resolveYearAnnualizer(totals.snapshotAsOf),
    ),
  };
}

function minDate(values: Array<Date | null | undefined>): Date | null {
  let out: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!out || value < out) out = value;
  }
  return out;
}

function maxDate(values: Array<Date | null | undefined>): Date | null {
  let out: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!out || value > out) out = value;
  }
  return out;
}

export async function getInquiryInfo(
  sku: string,
  storeId?: number,
): Promise<InquiryInfoDetail | null> {
  const trimmed = (sku ?? '').trim();
  if (!trimmed) return null;

  const skuRow = await loadAppInventorySkuByCode(trimmed);
  if (!skuRow) return null;

  const effectiveStoreId =
    storeId != null && Number.isFinite(Number(storeId)) ? Math.trunc(Number(storeId)) : undefined;

  const [stores, historyRows, seasonRow, groupRow] = await Promise.all([
    loadStoreMap(),
    loadInventoryHistorySnapshotsForSkuId(skuRow.id),
    skuRow.season
      ? prisma.seasonOverlay.findUnique({
          where: { code: skuRow.season.trim().toUpperCase() },
          select: { description: true },
        })
      : Promise.resolve(null),
    skuRow.groupCode
      ? prisma.taxonomyGroup.findUnique({
          where: { code: skuRow.groupCode.trim().toUpperCase() },
          select: { description: true },
        })
      : Promise.resolve(null),
  ]);

  const scopedHistory = effectiveStoreId != null
    ? historyRows.filter((row) => row.storeId === effectiveStoreId)
    : historyRows;
  const storeLabel = effectiveStoreId == null
    ? 'ALL stores'
    : (stores.get(effectiveStoreId)?.name
      ? `Store ${effectiveStoreId} - ${stores.get(effectiveStoreId)?.name}`
      : `Store ${effectiveStoreId}`);

  const { months: prior12Months, history } = await loadInquiryMonthlySales(skuRow.id, effectiveStoreId);
  const metrics = loadInquiryMetrics(scopedHistory, history);

  return {
    scopeLabel: storeLabel,
    seasonCode: skuRow.season?.trim() || null,
    seasonDescription: seasonRow?.description?.trim() || null,
    labelCode: skuRow.labelCode?.trim() || null,
    groupCode: skuRow.groupCode?.trim() || null,
    groupDescription: groupRow?.description?.trim() || null,
    firstReceivedAt: minDate(scopedHistory.map((row) => row.dateFirstReceived))?.toISOString() ?? null,
    lastMarkdownAt: maxDate(scopedHistory.map((row) => row.lastPriceChangeAt))?.toISOString() ?? null,
    perks: skuRow.perks ?? null,
    keywords: skuRow.keywords?.trim() || null,
    comment: skuRow.comment?.trim() || null,
    prior12Months,
    totals: prior12Months.reduce(
      (acc, row) => ({
        qty: acc.qty + row.qty,
        sales: acc.sales + row.sales,
      }),
      { qty: 0, sales: 0 },
    ),
    metrics,
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

function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

function buildInquiryTrendColumns(
  scopedHistory: InventoryHistorySnapshotRow[],
  trendByStore: Map<number, InventoryHistoryTrendWeekRow[]>,
): InquiryTrendColumn[] {
  const aggregates = Array.from({ length: 8 }, (_, index) => ({
    label: index < 7 ? String(7 - index) : 'Current',
    availWeek: 0,
    availPeriod: 0,
    sales: 0,
    recTranAdj: 0,
  }));

  for (const snapshot of scopedHistory) {
    const weeks = trendByStore.get(snapshot.storeId) ?? [];
    let previousAvailWeek: number | null = null;
    let previousSales = 0;

    for (let index = 0; index < 7; index += 1) {
      const week = weeks[index];
      if (!week) continue;

      const availWeek = week.beginOnHand;
      const recTranAdj = previousAvailWeek == null
        ? 0
        : availWeek - (previousAvailWeek - previousSales);

      aggregates[index].availWeek += availWeek;
      aggregates[index].availPeriod += week.onHandConstant;
      aggregates[index].sales += week.sales;
      aggregates[index].recTranAdj += recTranAdj;

      previousAvailWeek = availWeek;
      previousSales = week.sales;
    }

    const lastWeek = weeks[weeks.length - 1];
    const currentBegin = lastWeek
      ? lastWeek.beginOnHand - lastWeek.sales
      : snapshot.trendWeek8BegOnHand;
    const currentAvailWeek = snapshot.onHand + snapshot.weekQtySales;
    const currentAvailPeriod = lastWeek && lastWeek.onHandConstant !== 0
      ? lastWeek.onHandConstant - snapshot.weekQtySales
      : currentAvailWeek;

    aggregates[7].availWeek += currentAvailWeek;
    aggregates[7].availPeriod += currentAvailPeriod;
    aggregates[7].sales += snapshot.weekQtySales;
    aggregates[7].recTranAdj += currentAvailWeek - currentBegin;
  }

  return aggregates.map((aggregate, index) => {
    const availWeek = aggregate.availWeek === 0 ? null : aggregate.availWeek;
    const availPeriod = aggregate.availPeriod === 0 ? null : aggregate.availPeriod;
    const sales = aggregate.sales === 0 ? null : aggregate.sales;

    return {
      label: aggregate.label,
      availWeek,
      availPeriod,
      recTranAdj: aggregate.recTranAdj === 0 ? null : aggregate.recTranAdj,
      sales,
      stWeekly: availWeek && sales != null ? round1((sales / availWeek) * 100) : null,
      stPeriod: availPeriod && sales != null ? round1((sales / availPeriod) * 100) : null,
      periodReset: index > 0 && aggregate.recTranAdj !== 0,
    };
  });
}

export async function getInquiryTrend(sku: string, storeId?: number): Promise<InquiryTrend | null> {
  const trimmed = (sku ?? '').trim();
  if (!trimmed) return null;

  const skuRow = await loadAppInventorySkuByCode(trimmed);
  if (!skuRow) return null;

  const [stores, historyRows, trendRows] = await Promise.all([
    loadStoreMap(),
    loadInventoryHistorySnapshotsForSkuId(skuRow.id),
    loadInventoryHistoryTrendWeeksForSkuId(skuRow.id),
  ]);

  const effectiveStoreId =
    storeId != null && Number.isFinite(Number(storeId)) ? Math.trunc(Number(storeId)) : undefined;
  const scopedHistory = effectiveStoreId != null
    ? historyRows.filter((row) => row.storeId === effectiveStoreId)
    : historyRows;
  if (scopedHistory.length === 0) return null;

  const scopedStoreIds = new Set(scopedHistory.map((row) => row.storeId));
  const trendByStore = new Map<number, InventoryHistoryTrendWeekRow[]>();
  for (const row of trendRows) {
    if (!scopedStoreIds.has(row.storeId)) continue;
    const list = trendByStore.get(row.storeId) ?? [];
    list.push(row);
    trendByStore.set(row.storeId, list);
  }
  for (const list of trendByStore.values()) {
    list.sort((a, b) => a.slotNumber - b.slotNumber);
  }
  const columns = buildInquiryTrendColumns(scopedHistory, trendByStore);

  return {
    scopeLabel: effectiveStoreId != null
      ? (stores.get(effectiveStoreId)?.name ?? `Store ${effectiveStoreId}`)
      : 'ALL stores',
    columns,
  };
}

export async function getInquiryOpenPoRows(sku: string, storeId?: number): Promise<InquiryOpenPoRow[]> {
  const trimmed = (sku ?? '').trim();
  if (!trimmed) return [];

  const skuRow = await loadAppInventorySkuByCode(trimmed);
  if (!skuRow) return [];

  const sizeTypes = await loadSizeTypeMap();
  const sizeType = skuRow.sizeType != null ? sizeTypes.get(Number(skuRow.sizeType)) ?? null : null;
  const rows = await loadOpenPurchaseOrderCellRowsForSku(
    skuRow.id,
    skuRow.code ?? skuRow.provisionalCode,
    sizeType,
  );
  const effectiveStoreId =
    storeId != null && Number.isFinite(Number(storeId)) ? Math.trunc(Number(storeId)) : undefined;

  return rows
    .filter((row) => effectiveStoreId == null || row.storeId === effectiveStoreId)
    .sort((a, b) => {
      const dueA = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const dueB = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;
      const poCmp = a.poNumber.localeCompare(b.poNumber);
      if (poCmp !== 0) return poCmp;
      const storeCmp = a.storeId - b.storeId;
      if (storeCmp !== 0) return storeCmp;
      const rowCmp = naturalLabelCompare(a.rowLabel, b.rowLabel);
      if (rowCmp !== 0) return rowCmp;
      return naturalLabelCompare(a.columnLabel, b.columnLabel);
    })
    .map((row) => ({
      poNumber: row.poNumber,
      storeId: row.storeId,
      orderClass: row.orderClass,
      dueDate: row.dueDate?.toISOString() ?? null,
      rowLabel: row.rowLabel,
      columnLabel: displayColumnLabel(row.columnLabel),
      orderedQty: row.orderedQty,
      receivedQty: row.receivedQty,
      openQty: row.openQty,
    }));
}

// ─────────────────────────── public: Find by Size ─────────────────────────

/**
 * Find available on-hand for a single (SKU, sizeLabel) across every store.
 * Matches RICS's Ch. 4 p. 70 flow: enter SKU + size → see which store has it.
 * Size matching is case-insensitive exact-match against the SizeType's column
 * labels (or row labels when the shoe grid uses rows for width).
 */
export async function getInquiryPurchaseOrderHistory(
  sku: string,
  storeId?: number,
): Promise<InquiryPurchaseOrderHistoryRow[]> {
  const trimmed = (sku ?? '').trim();
  if (!trimmed) return [];

  const skuRow = await loadAppInventorySkuByCode(trimmed);
  if (!skuRow) return [];

  const effectiveStoreId =
    storeId != null && Number.isFinite(Number(storeId)) ? Math.trunc(Number(storeId)) : undefined;

  const rows = await prisma.purchaseOrderLegacyLine.findMany({
    where: {
      OR: [{ skuId: skuRow.id }, { skuCode: skuRow.code ?? skuRow.provisionalCode }],
      purchaseOrder: {
        ...(effectiveStoreId != null ? { shipStore: effectiveStoreId } : {}),
      },
    },
    select: {
      poNumber: true,
      orderedQtys: true,
      receivedQtys: true,
      purchaseOrder: {
        select: {
          shipStore: true,
          vendorCode: true,
          buyer: true,
          orderDate: true,
          dueDate: true,
          lastReceivedAt: true,
          orderType: true,
          legacyStatus: true,
          current: true,
        },
      },
    },
    orderBy: [{ poNumber: 'asc' }],
  });

  const byPo = new Map<string, InquiryPurchaseOrderHistoryRow>();
  for (const row of rows) {
    const orderedQty = sumQuantityArray(row.orderedQtys);
    const receivedQty = sumQuantityArray(row.receivedQtys);
    if (orderedQty === 0 && receivedQty === 0) continue;

    const existing = byPo.get(row.poNumber);
    if (existing) {
      existing.orderedQty += orderedQty;
      existing.receivedQty += receivedQty;
      existing.openQty += orderedQty - receivedQty;
      existing.lineCount += 1;
      continue;
    }

    byPo.set(row.poNumber, {
      poNumber: row.poNumber,
      shipStore: row.purchaseOrder.shipStore,
      vendorCode: row.purchaseOrder.vendorCode,
      buyer: row.purchaseOrder.buyer,
      orderDate: row.purchaseOrder.orderDate?.toISOString() ?? null,
      dueDate: row.purchaseOrder.dueDate?.toISOString() ?? null,
      lastReceivedAt: row.purchaseOrder.lastReceivedAt?.toISOString() ?? null,
      orderType: row.purchaseOrder.orderType,
      legacyStatus: row.purchaseOrder.legacyStatus,
      current: row.purchaseOrder.current,
      orderedQty,
      receivedQty,
      openQty: orderedQty - receivedQty,
      lineCount: 1,
    });
  }

  return [...byPo.values()].sort((a, b) => {
    const dateA = a.lastReceivedAt ?? a.orderDate ?? '';
    const dateB = b.lastReceivedAt ?? b.orderDate ?? '';
    const dateCmp = dateB.localeCompare(dateA);
    if (dateCmp !== 0) return dateCmp;
    return a.poNumber.localeCompare(b.poNumber);
  });
}

export async function findBySize(params: FindBySizeParams = {}): Promise<FindBySizeResult> {
  const seedSku = (params.seedSku ?? '').trim() || null;
  const columnLabel = (params.columnLabel ?? '').trim() || null;
  const rowLabel = (params.rowLabel ?? '').trim() || null;
  const restrictToSizeType = params.restrictToSizeType !== false;
  const separateByStore = params.separateByStore === true;
  const sort: FindBySizeSort = params.sort ?? 'SKU';
  const limit = clamp(params.limit ?? 2_000, 1, 10_000);

  let effectiveSizeTypeCode =
    params.sizeTypeCode != null && Number.isFinite(Number(params.sizeTypeCode))
      ? Number(params.sizeTypeCode)
      : null;

  if (seedSku && effectiveSizeTypeCode == null) {
    const seedSkuRow = await loadAppInventorySkuByCode(seedSku);
    if (seedSkuRow?.sizeType != null && Number.isFinite(Number(seedSkuRow.sizeType))) {
      effectiveSizeTypeCode = Number(seedSkuRow.sizeType);
    }
  }

  const [sizeTypes, stockRows] = await Promise.all([
    loadSizeTypeMap(),
    prisma.stockLevel.findMany({
      where: {
        ...(params.storeNumbers?.length
          ? { storeId: { in: params.storeNumbers.map((n) => Number(n)) } }
          : {}),
        sku: {
          is: {
            ...(params.vendorCode ? { vendorId: params.vendorCode.trim() } : {}),
            ...(params.category != null ? { categoryNumber: Number(params.category) } : {}),
            ...(params.styleColor ? { styleColor: { contains: params.styleColor.trim(), mode: 'insensitive' } } : {}),
            ...(restrictToSizeType && effectiveSizeTypeCode != null ? { sizeType: effectiveSizeTypeCode } : {}),
          },
        },
      },
      select: {
        storeId: true,
        rowLabel: true,
        columnLabel: true,
        onHand: true,
        sku: {
          select: {
            code: true,
            provisionalCode: true,
            descriptionRics: true,
            vendorId: true,
            manufacturer: true,
            categoryNumber: true,
            sizeType: true,
            styleColor: true,
          },
        },
      },
      take: limit * 50,
    }),
  ]);

  const effectiveSizeType =
    effectiveSizeTypeCode != null ? sizeTypes.get(effectiveSizeTypeCode) ?? null : null;

  const rowFilter = normalizeSizeLabel(rowLabel);
  const colFilter = normalizeSizeLabel(columnLabel);

  type CandidateCell = {
    sku: string;
    description: string | null;
    brand: string | null;
    vendorCode: string | null;
    category: number | null;
    styleColor: string | null;
    sizeTypeCode: number | null;
    sizeTypeDesc: string | null;
    storeNumber: number;
    storeName: string | null;
    onHand: number;
  };

  const matchedCells: CandidateCell[] = [];

  for (const row of stockRows) {
    const skuCode = row.sku.code ?? row.sku.provisionalCode;
    if (!skuCode || row.onHand <= 0) continue;

    const normalizedRowLabel = (row.rowLabel ?? '').trim();
    const normalizedColumnLabel = (row.columnLabel ?? '').trim();
    if (rowFilter && normalizeSizeLabel(normalizedRowLabel) !== rowFilter) continue;
    if (colFilter && normalizeSizeLabel(normalizedColumnLabel) !== colFilter) continue;

    const sizeType = row.sku.sizeType != null ? sizeTypes.get(Number(row.sku.sizeType)) ?? null : null;

    matchedCells.push({
      sku: skuCode,
      description: row.sku.descriptionRics?.trim() || null,
      brand: row.sku.manufacturer?.trim() || row.sku.vendorId?.trim() || null,
      vendorCode: row.sku.vendorId?.trim() || null,
      category: row.sku.categoryNumber ?? null,
      styleColor: row.sku.styleColor?.trim() || null,
      sizeTypeCode: sizeType?.code ?? row.sku.sizeType ?? null,
      sizeTypeDesc: sizeType?.desc ?? null,
      storeNumber: row.storeId,
      storeName: `Store ${row.storeId}`,
      onHand: row.onHand,
    });
  }

  if (matchedCells.length === 0) {
    return {
      seedSku,
      columnLabel,
      rowLabel,
      sizeTypeCode: restrictToSizeType ? effectiveSizeTypeCode : null,
      sizeTypeDesc: restrictToSizeType ? effectiveSizeType?.desc ?? null : null,
      restrictToSizeType,
      separateByStore,
      sort,
      rows: [],
      totalMatches: 0,
      totalOnHand: 0,
    }
  }

  const rows = separateByStore
    ? aggregateFindBySizeByStore(matchedCells)
    : aggregateFindBySizeBySku(matchedCells);

  rows.sort(compareFindBySizeRows(sort));

  return {
    seedSku,
    columnLabel,
    rowLabel,
    sizeTypeCode: restrictToSizeType ? effectiveSizeTypeCode : null,
    sizeTypeDesc: restrictToSizeType ? effectiveSizeType?.desc ?? null : null,
    restrictToSizeType,
    separateByStore,
    sort,
    rows,
    totalMatches: rows.length,
    totalOnHand: rows.reduce((sum, row) => sum + row.totalOnHand, 0),
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
 * Browse the inventory movement ledger ("InvChanges" in RICS terms; RICS
 * Ch. 2 p. 55 and Ch. 4 p. 72) plus, optionally, sales lines.
 *
 * Reads from the app-owned `app.stock_movement` table (which the
 * `sync-rics-stock-movements` backfill populates from the legacy RIINVCHG
 * data, alongside any app-native movements written by manual receipts /
 * returns / transfers) and, for the SAL branch, `app.sales_history_ticket*`.
 * The legacy `rics_mirror.inv_changes` / `rics_mirror.ticket_*` tables were
 * dropped 2026-04-25 by migration `20260425113000_drop_rics_mirror_schema`.
 *
 * The ledger can be large, so an unscoped SELECT is a performance cliff:
 * require at least one of { sku, 90-day date range }. The route layer maps
 * `ChangeDetailQueryTooBroadError` to HTTP 400.
 */
// Maps the legacy RICS chg_type code (POR / RET / PHY / TOU / TIN / REC) to
// the corresponding `app.stock_movement.movement_type` enum value. Used both
// to filter by the requested type and to translate the new enum back into the
// legacy code the page renders (tag color + tooltip lookups in the UI key off
// the 3-letter RICS codes).
const RICS_TO_MOVEMENT_TYPE: Record<string, string> = {
  POR: 'PO_RECEIPT',
  RET: 'MANUAL_RETURN',
  PHY: 'PHYSICAL_COUNT',
  TOU: 'TRANSFER_OUT',
  TIN: 'TRANSFER_IN',
  REC: 'MANUAL_RECEIPT',
};
const MOVEMENT_TYPE_TO_RICS: Record<string, string> = Object.fromEntries(
  Object.entries(RICS_TO_MOVEMENT_TYPE).map(([rics, mv]) => [mv, rics]),
);

// Comment column on RICS-imported stock_movement rows is written as
// `po=12345 | rma=ABC | otherStore=21 | origSku=XYZ-001` (any subset, in any
// order, separated by ` | `). See `stockMovementBackfill.ts` for the writer.
function parseStockMovementComment(comment: string | null): {
  purchaseOrder: string | null;
  rmaNumber: string | null;
  otherStore: number | null;
  origSku: string | null;
} {
  const out = {
    purchaseOrder: null as string | null,
    rmaNumber: null as string | null,
    otherStore: null as number | null,
    origSku: null as string | null,
  };
  if (!comment) return out;
  for (const chunk of comment.split(' | ')) {
    const eq = chunk.indexOf('=');
    if (eq < 0) continue;
    const key = chunk.slice(0, eq).trim();
    const value = chunk.slice(eq + 1).trim();
    if (!value) continue;
    if (key === 'po') out.purchaseOrder = value;
    else if (key === 'rma') out.rmaNumber = value;
    else if (key === 'otherStore') {
      const n = Number(value);
      if (Number.isFinite(n) && n !== 0) out.otherStore = n;
    } else if (key === 'origSku') out.origSku = value;
  }
  return out;
}

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
  // For the InvChanges branch we filter on `movement_type`; for legacy
  // compatibility the page sends the 3-letter RICS code, which we translate
  // here. Unknown codes (anything not in the map) match nothing.
  let movementTypeIdx: number | null = null;
  if (requestedType && requestedType !== 'SAL') {
    const mapped = RICS_TO_MOVEMENT_TYPE[requestedType] ?? '__unmatched__';
    sqlParams.push(mapped);
    movementTypeIdx = sqlParams.length;
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
    if (skuIdx != null) wheres.push(`s.code = $${skuIdx}`);
    if (storeIdx != null) wheres.push(`m.store_id = $${storeIdx}`);
    if (movementTypeIdx != null) wheres.push(`m.movement_type = $${movementTypeIdx}`);
    if (fromIdx != null) wheres.push(`m.movement_at >= $${fromIdx}::date`);
    if (toIdx != null) wheres.push(`m.movement_at <  $${toIdx}::date`);
    const whereClause = wheres.length ? ` WHERE ${wheres.join(' AND ')}` : '';
    branches.push(`SELECT
  s.code AS "SKU",
  m.store_id AS "Store",
  m.movement_type AS "MovementType",
  m.reason_code AS "ReasonCode",
  to_char(m.movement_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "Date",
  m.column_label AS "Col",
  m.row_label AS "Row",
  m.quantity_delta AS "Qty",
  m.unit_cost_snapshot::float8 AS "Cost",
  m.comment AS "Comment"
FROM app.stock_movement m
INNER JOIN app.sku s ON s.id = m.sku_id${whereClause}`);
  }

  if (wantSales) {
    const wheres: string[] = [
      `t.transaction_kind = 'purchase'`,
      `t.status = 'completed'`,
      `t.store_id IS NOT NULL`,
    ];
    if (skuIdx != null) wheres.push(`l.sku_code = $${skuIdx}`);
    if (storeIdx != null) wheres.push(`t.store_id = $${storeIdx}`);
    if (fromIdx != null) wheres.push(`t.purchased_at >= $${fromIdx}::date`);
    if (toIdx != null) wheres.push(`t.purchased_at <  $${toIdx}::date`);
    branches.push(`SELECT
  l.sku_code AS "SKU",
  t.store_id::int AS "Store",
  'SALE'::text AS "MovementType",
  'SAL'::text AS "ReasonCode",
  to_char(t.purchased_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "Date",
  l.column_label AS "Col",
  l.row_label AS "Row",
  (-COALESCE(l.quantity, 0))::int AS "Qty",
  COALESCE(l.unit_cost, 0)::float8 AS "Cost",
  NULL::text AS "Comment"
FROM app.sales_history_ticket t
INNER JOIN app.sales_history_ticket_line l ON l.ticket_id = t.id
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
    Store: number | null;
    MovementType: string | null;
    ReasonCode: string | null;
    Date: string | null;
    Col: string | null;
    Row: string | null;
    Qty: number | null;
    Cost: number | null;
    Comment: string | null;
  }
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(sql, ...sqlParams);

  return rows.map((r) => {
    const parsed = parseStockMovementComment(r.Comment);
    // Prefer the original RICS code (carried in `reason_code` for backfilled
    // rows) so the UI's tag colors and tooltips keep working; fall back to
    // mapping the new movement_type enum, then to the raw movement_type for
    // anything we don't recognize.
    const reason = (r.ReasonCode ?? '').trim().toUpperCase();
    const movementType = (r.MovementType ?? '').trim();
    const changeType =
      reason && (RICS_TO_MOVEMENT_TYPE[reason] || reason === 'SAL')
        ? reason
        : MOVEMENT_TYPE_TO_RICS[movementType] ?? movementType;
    return {
      sku: (r.SKU ?? '').trim(),
      origSku: parsed.origSku,
      store: Number(r.Store ?? 0),
      changeType,
      date: parseAccessDate(r.Date),
      rowLabel: (r.Row ?? '').trim(),
      columnLabel: (r.Col ?? '').trim(),
      purchaseOrder: parsed.purchaseOrder,
      otherStore: parsed.otherStore,
      quantity: Number(r.Qty ?? 0),
      cost: Number(r.Cost ?? 0),
      rmaNumber: parsed.rmaNumber,
    };
  });
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

function normalizeSizeLabel(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function aggregateFindBySizeBySku(
  cells: Array<{
    sku: string;
    description: string | null;
    brand: string | null;
    vendorCode: string | null;
    category: number | null;
    styleColor: string | null;
    sizeTypeCode: number | null;
    sizeTypeDesc: string | null;
    storeNumber: number;
    storeName: string | null;
    onHand: number;
  }>,
): FindBySizeRow[] {
  const bySku = new Map<string, FindBySizeRow>();
  const storeSets = new Map<string, Set<number>>();

  for (const cell of cells) {
    const current = bySku.get(cell.sku);
    const stores = storeSets.get(cell.sku) ?? new Set<number>();
    stores.add(cell.storeNumber);
    storeSets.set(cell.sku, stores);

    if (!current) {
      bySku.set(cell.sku, {
        sku: cell.sku,
        description: cell.description,
        brand: cell.brand,
        vendorCode: cell.vendorCode,
        category: cell.category,
        styleColor: cell.styleColor,
        sizeTypeCode: cell.sizeTypeCode,
        sizeTypeDesc: cell.sizeTypeDesc,
        totalOnHand: cell.onHand,
        storeCount: 1,
        storeNumber: null,
        storeName: null,
      });
      continue;
    }

    current.totalOnHand += cell.onHand;
    current.storeCount = stores.size;
  }

  return [...bySku.values()];
}

function aggregateFindBySizeByStore(
  cells: Array<{
    sku: string;
    description: string | null;
    brand: string | null;
    vendorCode: string | null;
    category: number | null;
    styleColor: string | null;
    sizeTypeCode: number | null;
    sizeTypeDesc: string | null;
    storeNumber: number;
    storeName: string | null;
    onHand: number;
  }>,
): FindBySizeRow[] {
  const bySkuStore = new Map<string, FindBySizeRow>();

  for (const cell of cells) {
    const key = `${cell.sku}::${cell.storeNumber}`;
    const current = bySkuStore.get(key);
    if (!current) {
      bySkuStore.set(key, {
        sku: cell.sku,
        description: cell.description,
        brand: cell.brand,
        vendorCode: cell.vendorCode,
        category: cell.category,
        styleColor: cell.styleColor,
        sizeTypeCode: cell.sizeTypeCode,
        sizeTypeDesc: cell.sizeTypeDesc,
        totalOnHand: cell.onHand,
        storeCount: 1,
        storeNumber: cell.storeNumber,
        storeName: cell.storeName,
      });
      continue;
    }

    current.totalOnHand += cell.onHand;
  }

  return [...bySkuStore.values()];
}

function compareFindBySizeRows(sort: FindBySizeSort): (a: FindBySizeRow, b: FindBySizeRow) => number {
  const text = (value: string | null | undefined) => (value ?? '').toUpperCase();
  return (a, b) => {
    const primary =
      sort === 'DESCRIPTION'
        ? text(a.description).localeCompare(text(b.description))
        : sort === 'VENDOR'
          ? text(a.vendorCode).localeCompare(text(b.vendorCode))
          : sort === 'CATEGORY'
            ? Number(a.category ?? 0) - Number(b.category ?? 0)
            : text(a.sku).localeCompare(text(b.sku));
    if (primary !== 0) return primary;
    const bySku = text(a.sku).localeCompare(text(b.sku));
    if (bySku !== 0) return bySku;
    const byStore = Number(a.storeNumber ?? 0) - Number(b.storeNumber ?? 0);
    if (byStore !== 0) return byStore;
    return Number(b.totalOnHand) - Number(a.totalOnHand);
  };
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

export const __test = {
  buildGrids,
  buildStoreMetricGrid,
  summarizeStoreMetrics,
  buildSummaryMetricsByStore,
  buildSummaryMetricsByStoreFromHistory,
  buildLegacyLastYearSalesByStore,
  buildInquiryRollupFromHistory,
  buildInquiryTrendColumns,
  loadInquiryMonthlySales,
  loadInquiryMonthlySalesByStore,
};
