/**
 * Live read-through adapter from the legacy RICS sales MDBs into the shapes
 * the `sales-reporting` module spec (docs/modules/sales-reporting.md) publishes.
 *
 * Read-only. Never writes to RICS.
 *
 * Covers Phase 1 + Phase 2 of the spec (7 reports):
 *   - Sales by Day      (RICS Ch. 6 p. 52)  — getSalesByDay(...)
 *   - Sales by Time     (RICS Ch. 2 p. 41)  — getSalesByTime(...)
 *   - Sales by SKU      (RICS Ch. 2 p. 43)  — getSalesBySku(...)
 *   - Salesperson Summ. (RICS Ch. 2 p. 42)  — getSalespersonSummary(...)
 *   - Sales Analysis    (RICS Ch. 6 p. 88)  — getSalesAnalysis(...)       [flagship]
 *   - Best Sellers      (RICS Ch. 6 p. 93)  — getBestSellers(...)
 *   - Stock Status      (RICS Ch. 6 p. 96)  — getStockStatus(...)
 *
 * Data sources (column names pinned in docs/rics-db-schema.md → Sales Reporting):
 *   RITRNSSV.TicketHeader       → transaction header (filter on TransType=1, Voided=False)
 *   RITRNSSV.TicketDetail       → line-level: SKU, Qty, Extension, Category, Vendor,
 *                                 Cost, SalesPerson, Column/Row (size grid), ReturnCode
 *   RISTORE.StoreMaster         → store number → store name
 *   RISLSPSN.Salespeople        → salesperson code → name
 *   RIINVQUA.InventoryQuantity  → Stock Status on-hand / model / short / critical
 *   RIPODET.Purchase Detail     → Stock Status on-order
 *
 * Known limitations (documented in docs/modules/sales-reporting.md Open Questions):
 *   - Layaway / special-order / gift-cert volumes are NOT joined in v1 — all
 *     reports reflect RITRNSSV only (regular sales + returns + house-charge sales).
 *   - Sales Analysis markdown + COGS columns use TicketDetail.Cost directly.
 *     Prior-year markdowns derived from (Prices_02 - RealPrice) * Qty only if
 *     the caller opts in (deferred to Phase 2.5 follow-up).
 *   - Per-line permission gating (e.g. hide GP % for staff without
 *     `reports.view_gp`) is NOT implemented — no permission system yet.
 */

import { prisma } from '../../db/prisma';
import { getOnHandAtCostByDimension } from './ricsOnHandAtCostAdapter';
import { computeRoiTurnsGp } from './metrics';
import {
  parseCriteria,
  matchesCriteria,
  type CriteriaExpression,
  sqlNumericBounds,
} from '../../utils/criteriaGrammar';
import type {
  RicsSalesByDayByStoreReport,
  RicsSalesByDayRow,
  RicsSalesTotals,
  SalesByTimeReport,
  HourlyBucket,
  SalesBySkuReport,
  SalesBySkuRow,
  SalesBySkuSortBy,
  SalesBySkuSizeCell,
  SalespersonSummaryReport,
  SalespersonRow,
  SalespersonSubtotal,
  SalespersonSubtotalBy,
  CashierRow,
  BestSellersReport,
  BestSellersDimension,
  BestSellersMetric,
  BestSellersPeriod,
  BestSellerRow,
  SalesAnalysisReport,
  SalesAnalysisDimension,
  SalesAnalysisReportType,
  SalesAnalysisStoreOption,
  SalesAnalysisCriteria,
  SalesAnalysisPrinting,
  SalesAnalysisRow,
  StockStatusReport,
  StockStatusRow,
  StockStatusSortBy,
  StockStatusStoreOption,
  StockStatusItemFilter,
  StockStatusPrintQty,
} from './types';

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

// ─────────────────────────── dimension loaders ────────────────────────────

interface StoreRow {
  number: number;
  name: string | null;
}

async function loadStoreMap(): Promise<Map<number, StoreRow>> {
  return cachedAsync('sr:dim:stores', 300_000, async () => {
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

interface SalespersonInfo {
  code: string;
  name: string | null;
}

async function loadSalespersonMap(): Promise<Map<string, SalespersonInfo>> {
  return cachedAsync('sr:dim:salespeople', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<{ Code: string | null; Name: string | null }[]>(
      `SELECT code AS "Code", name AS "Name" FROM rics_mirror.salespeople`,
    );
    const map = new Map<string, SalespersonInfo>();
    for (const r of rows) {
      if (!r.Code) continue;
      const code = r.Code.trim();
      if (!code) continue;
      map.set(code, {
        code,
        name: r.Name?.trim() || null,
      });
    }
    return map;
  });
}

interface CategoryRow {
  number: number;
  desc: string | null;
}

async function loadCategoryList(): Promise<CategoryRow[]> {
  return cachedAsync('sr:dim:categories', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<{ Number: number; Desc: string | null }[]>(
      `SELECT number AS "Number", "desc" AS "Desc" FROM rics_mirror.categories`,
    );
    return rows
      .filter((r) => r.Number != null)
      .map<CategoryRow>((r) => ({
        number: Number(r.Number),
        desc: r.Desc?.trim() || null,
      }))
      .sort((a, b) => a.number - b.number);
  });
}

interface GroupRow {
  code: string;
  desc: string | null;
}

async function loadGroupList(): Promise<GroupRow[]> {
  return cachedAsync('sr:dim:groups', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<{ Code: string | null; Desc: string | null }[]>(
      `SELECT code AS "Code", "desc" AS "Desc" FROM rics_mirror.group_codes`,
    );
    return rows
      .filter((r): r is { Code: string; Desc: string | null } => !!r.Code)
      .map<GroupRow>((r) => ({
        code: r.Code.trim(),
        desc: r.Desc?.trim() || null,
      }))
      .sort((a, b) => (a.desc ?? a.code).localeCompare(b.desc ?? b.code));
  });
}

/**
 * Returns the dimension lookups UI dropdowns need: stores, categories, and
 * groups. All three are small (<500 rows each), cached 5 min, returned in one
 * response so the page loads its criteria controls in a single round trip.
 */
export interface SalesDimensionsResponse {
  stores: Array<{ number: number; name: string | null }>;
  categories: CategoryRow[];
  groups: GroupRow[];
}

export async function listSalesDimensions(): Promise<SalesDimensionsResponse> {
  const [storeMap, categories, groups] = await Promise.all([
    loadStoreMap(),
    loadCategoryList(),
    loadGroupList(),
  ]);
  const stores = [...storeMap.values()]
    .map(({ number, name }) => ({ number, name }))
    .sort((a, b) => a.number - b.number);
  return { stores, categories, groups };
}

// ─────────────────────────── row shapes (raw from MDB) ────────────────────

interface RawTicketDetailRow {
  UserID: string | null;
  BatchDate: string | null;
  Terminal: string | null;
  Store: number | null;
  Ticket: number | null;
  RealDate: string | null;
  Line: number | null;
  SKU: string | null;
  Column: string | null;
  Row: string | null;
  Qty: number | null;
  Extension: number | null;
  Perks: number | null;
  SalesPerson: string | null;
  Category: number | null;
  Vendor: string | null;
  Cost: number | null;
  ReturnCode: number | null;
  RealPrice: number | null;
}

interface TicketLine {
  store: number;
  ticket: number;
  date: string;                 // 'YYYY-MM-DD'
  hour: number;                 // 0..23
  sku: string;
  column: string;
  row: string;
  qty: number;
  extension: number;
  perks: number;
  salesperson: string;          // 'CODE' or ''
  category: number | null;
  vendor: string | null;
  cost: number;
  returnCode: number;
  posted: boolean;
}

interface RawTicketHeaderFlag {
  UserID: string | null;
  BatchDate: string | null;
  Terminal: string | null;
  Store: number | null;
  Ticket: number | null;
  RealDate: string | null;
  Cashier: string | null;
  Posted: string | null;
}

interface TicketHeaderFlag {
  store: number;
  ticket: number;
  date: string;
  cashier: string;
  posted: boolean;
  key: string;                  // composite key for joining
}

// ─────────────────────────── date helpers ─────────────────────────────────

function normalizeDate(date: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(date)) throw new Error(`Invalid date format: ${date}`);
  return date;
}

function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

function listDatesInclusive(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const cursor = toUtcDate(startDate);
  const end = toUtcDate(endDate);
  while (cursor <= end) {
    out.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function weekdayName(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(toUtcDate(date));
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/**
 * Parse a JSON-serialized Microsoft date (`/Date(1234567890000)/`) or ISO
 * string and return its UTC yyyy-MM-dd representation.
 */
function parseMsDateToIso(raw: string | null): string {
  if (!raw) return '';
  const m = /^\/Date\((-?\d+)\)\/$/.exec(raw);
  if (m) return new Date(Number(m[1])).toISOString().slice(0, 10);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function parseMsDateToHour(raw: string | null): number {
  if (!raw) return 0;
  const m = /^\/Date\((-?\d+)\)\/$/.exec(raw);
  if (m) return new Date(Number(m[1])).getUTCHours();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? 0 : d.getUTCHours();
}

// ─────────────────────────── ticket-line query (bounded) ──────────────────

/**
 * Run a bounded TicketDetail+TicketHeader join and return flat `TicketLine`
 * rows. Every report builds on this — caller specifies the date range and
 * (optionally) the store filter, everything else is filtered client-side.
 *
 * The query caps at MAX_ROWS to prevent runaway JSON serialization over
 * PowerShell → Node (~500ms cold + ~10MB per 100k rows).
 */
const MAX_TICKET_ROWS = 250_000;

async function loadTicketLines(params: {
  startDate: string;
  endDate: string;               // inclusive
  storeNumbers?: number[];       // empty/undefined = all stores
  includeUnposted?: boolean;     // default true (Live mode); false → Posted='Y' only
}): Promise<TicketLine[]> {
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  const endExclusive = addDays(endDate, 1);
  const includeUnposted = params.includeUnposted !== false;

  const cacheKey = `sr:ticketLines:${startDate}:${endDate}:${(params.storeNumbers ?? []).join(',')}:${includeUnposted}`;
  return cachedAsync(cacheKey, 600_000, async () => {
    const sqlParams: unknown[] = [startDate, endExclusive];
    const extraWheres: string[] = [];
    if (params.storeNumbers && params.storeNumbers.length > 0) {
      sqlParams.push(params.storeNumbers.map((n) => Number(n)));
      extraWheres.push(`h.store = ANY($${sqlParams.length}::int[])`);
    }
    if (!includeUnposted) {
      extraWheres.push(`h.posted = 'Y'`);
    }
    const extraClause = extraWheres.length ? ' AND ' + extraWheres.join(' AND ') : '';

    const sql = `SELECT
  h.store       AS "H_Store",
  h.ticket      AS "H_Ticket",
  to_char(h.real_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "H_RealDate",
  h.cashier     AS "H_Cashier",
  h.posted      AS "H_Posted",
  d.sku         AS "D_SKU",
  d."column"    AS "D_Column",
  d."row"       AS "D_Row",
  d.qty         AS "D_Qty",
  d.extension::float8   AS "D_Extension",
  d.perks::float8       AS "D_Perks",
  d.sales_person        AS "D_SalesPerson",
  d.category            AS "D_Category",
  d.vendor              AS "D_Vendor",
  d.cost::float8        AS "D_Cost",
  d.return_code         AS "D_ReturnCode",
  d.real_price::float8  AS "D_RealPrice"
FROM rics_mirror.ticket_header h
INNER JOIN rics_mirror.ticket_detail d
  ON h.user_id    = d.user_id
 AND h.batch_date = d.batch_date
 AND h.terminal   = d.terminal
 AND h.store      = d.store
 AND h.ticket     = d.ticket
 AND h.real_date  = d.real_date
WHERE
  h.real_date  >= $1::date
  AND h.real_date <  $2::date
  AND h.trans_type = 1
  AND h.voided     = false${extraClause}
LIMIT ${MAX_TICKET_ROWS}`;

    interface Raw {
      H_Store: number | null; H_Ticket: number | null; H_RealDate: string | null;
      H_Cashier: string | null; H_Posted: string | null;
      D_SKU: string | null; D_Column: string | null; D_Row: string | null;
      D_Qty: number | null; D_Extension: number | null; D_Perks: number | null;
      D_SalesPerson: string | null; D_Category: number | null;
      D_Vendor: string | null; D_Cost: number | null; D_ReturnCode: number | null;
      D_RealPrice: number | null;
    }
    const raw = await prisma.$queryRawUnsafe<Raw[]>(sql, ...sqlParams);
    return raw.map<TicketLine>((r) => ({
      store: Number(r.H_Store ?? 0),
      ticket: Number(r.H_Ticket ?? 0),
      date: parseMsDateToIso(r.H_RealDate),
      hour: parseMsDateToHour(r.H_RealDate),
      sku: (r.D_SKU ?? '').trim(),
      column: (r.D_Column ?? '').trim(),
      row: (r.D_Row ?? '').trim(),
      qty: Number(r.D_Qty ?? 0),
      extension: Number(r.D_Extension ?? 0),
      perks: Number(r.D_Perks ?? 0),
      salesperson: (r.D_SalesPerson ?? '').trim(),
      category: r.D_Category == null ? null : Number(r.D_Category),
      vendor: r.D_Vendor?.trim() || null,
      cost: Number(r.D_Cost ?? 0),
      returnCode: Number(r.D_ReturnCode ?? 0),
      posted: (r.H_Posted ?? '').trim().toUpperCase() === 'Y',
    }));
  });
}

/**
 * Cashier-aware loader for Salesperson Summary (needs one row per ticket for
 * cashier counts, independent of SKU lines). Returns deduplicated header flags.
 */
async function loadTicketHeaders(params: {
  startDate: string;
  endDate: string;
  storeNumbers?: number[];
  includeUnposted?: boolean;
}): Promise<TicketHeaderFlag[]> {
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  const endExclusive = addDays(endDate, 1);
  const includeUnposted = params.includeUnposted !== false;

  const key = `sr:ticketHeaders:${startDate}:${endDate}:${(params.storeNumbers ?? []).join(',')}:${includeUnposted}`;
  return cachedAsync(key, 600_000, async () => {
    const sqlParams: unknown[] = [startDate, endExclusive];
    const extraWheres: string[] = [];
    if (params.storeNumbers && params.storeNumbers.length > 0) {
      sqlParams.push(params.storeNumbers.map((n) => Number(n)));
      extraWheres.push(`h.store = ANY($${sqlParams.length}::int[])`);
    }
    if (!includeUnposted) {
      extraWheres.push(`h.posted = 'Y'`);
    }
    const extraClause = extraWheres.length ? ' AND ' + extraWheres.join(' AND ') : '';

    const sql = `SELECT
  h.user_id AS "UserID",
  to_char(h.batch_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "BatchDate",
  h.terminal AS "Terminal",
  h.store AS "Store",
  h.ticket AS "Ticket",
  to_char(h.real_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS "RealDate",
  h.cashier AS "Cashier",
  h.posted AS "Posted"
FROM rics_mirror.ticket_header h
WHERE
  h.real_date  >= $1::date
  AND h.real_date <  $2::date
  AND h.trans_type = 1
  AND h.voided     = false${extraClause}`;
    const raw = await prisma.$queryRawUnsafe<RawTicketHeaderFlag[]>(sql, ...sqlParams);
    return raw.map<TicketHeaderFlag>((r) => ({
      store: Number(r.Store ?? 0),
      ticket: Number(r.Ticket ?? 0),
      date: parseMsDateToIso(r.RealDate),
      cashier: (r.Cashier ?? '').trim(),
      posted: (r.Posted ?? '').trim().toUpperCase() === 'Y',
      key: `${r.UserID}|${r.BatchDate}|${r.Terminal}|${r.Store}|${r.Ticket}|${r.RealDate}`,
    }));
  });
}

// ══════════════════════════════════════════════════════════════════════════
// Public API — Phase 1 reports
// ══════════════════════════════════════════════════════════════════════════

// ─────────────────────────── Sales by Day (RICS p. 52) ────────────────────

/**
 * RICS Sales by Day by Store report. Preserves the exact shape of the legacy
 * `ricsReportService.getRicsSalesByDayByStoreReport` so the existing
 * `/api/v1/reports/rics-sales-by-day-store` contract is unchanged after the
 * refactor.
 *
 * Note: this report keeps the `Posted='Y'` filter (unlike the other reports,
 * which default to Live mode including unposted) because it historically
 * reflected what the fiscal-close process had committed.
 */
export async function getSalesByDay(params: {
  storeNumber: number;
  startDate: string;
  endDate: string;
  comparisonOffsetDays?: number;
}): Promise<RicsSalesByDayByStoreReport> {
  const comparisonOffsetDays = params.comparisonOffsetDays ?? 364;
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  if (startDate > endDate) {
    throw new Error('startDate must be <= endDate');
  }

  const comparisonStartDate = addDays(startDate, -comparisonOffsetDays);
  const comparisonEndDate = addDays(endDate, -comparisonOffsetDays);

  const stores = await loadStoreMap();
  const storeName = stores.get(Number(params.storeNumber))?.name ?? null;

  const [currentLines, comparisonLines] = await Promise.all([
    loadTicketLines({
      startDate,
      endDate,
      storeNumbers: [params.storeNumber],
      includeUnposted: false,       // legacy contract: Posted='Y' only
    }),
    loadTicketLines({
      startDate: comparisonStartDate,
      endDate: comparisonEndDate,
      storeNumbers: [params.storeNumber],
      includeUnposted: false,
    }),
  ]);

  const currentByDate = sumByDate(currentLines);
  const compareByDate = sumByDate(comparisonLines);

  const days = listDatesInclusive(startDate, endDate);
  const rows: RicsSalesByDayRow[] = days.map((date) => {
    const comparedToDate = addDays(date, -comparisonOffsetDays);
    const netSales = round2(currentByDate.get(date) ?? 0);
    const comparedNetSales = round2(compareByDate.get(comparedToDate) ?? 0);
    const dollarChange = round2(netSales - comparedNetSales);
    const pctChange = comparedNetSales === 0 ? null : round1((dollarChange / comparedNetSales) * 100);
    return {
      date,
      dayName: weekdayName(date),
      netSales,
      comparedToDate,
      comparedNetSales,
      dollarChange,
      pctChange,
    };
  });

  const weeklyTotals = buildTotals(rows);
  const storeLabel = storeName ? `${params.storeNumber} - ${storeName}` : `${params.storeNumber}`;

  return {
    storeNumber: params.storeNumber,
    storeName,
    storeLabel,
    startDate,
    endDate,
    comparisonOffsetDays,
    comparisonStartDate,
    comparisonEndDate,
    rows,
    weeklyTotals,
    storeTotals: weeklyTotals,
  };
}

function sumByDate(lines: TicketLine[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    if (!l.date) continue;
    out.set(l.date, (out.get(l.date) ?? 0) + l.extension);
  }
  return out;
}

function buildTotals(rows: RicsSalesByDayRow[]): RicsSalesTotals {
  const netSales = round2(rows.reduce((s, r) => s + r.netSales, 0));
  const comparedNetSales = round2(rows.reduce((s, r) => s + r.comparedNetSales, 0));
  const dollarChange = round2(netSales - comparedNetSales);
  const pctChange = comparedNetSales === 0 ? null : round1((dollarChange / comparedNetSales) * 100);
  return { netSales, comparedNetSales, dollarChange, pctChange };
}

// ─────────────────────────── Sales by Time (RICS p. 41) ───────────────────

/**
 * Sales-by-Time report: ticket counts + units + dollars bucketed by hour-of-day.
 * Optionally compares two date ranges side by side.
 */
export async function getSalesByTime(params: {
  startDate: string;
  endDate: string;
  compareStartDate?: string;
  compareEndDate?: string;
  storeNumbers?: number[];
  printPctOfTotal?: boolean;
}): Promise<SalesByTimeReport> {
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  const storeNumbers = params.storeNumbers ?? [];

  const rangeALines = await loadTicketLines({
    startDate,
    endDate,
    storeNumbers: storeNumbers.length ? storeNumbers : undefined,
  });
  const rangeA = bucketByHour(rangeALines, params.printPctOfTotal ?? false);
  const totalsA = sumHourlyTotals(rangeA);

  let rangeB: HourlyBucket[] | null = null;
  let totalsB: SalesByTimeReport['totalsB'] = null;
  if (params.compareStartDate && params.compareEndDate) {
    const bStart = normalizeDate(params.compareStartDate);
    const bEnd = normalizeDate(params.compareEndDate);
    const lines = await loadTicketLines({
      startDate: bStart,
      endDate: bEnd,
      storeNumbers: storeNumbers.length ? storeNumbers : undefined,
    });
    rangeB = bucketByHour(lines, params.printPctOfTotal ?? false);
    totalsB = sumHourlyTotals(rangeB);
  }

  return {
    startDate,
    endDate,
    compareStartDate: params.compareStartDate ?? null,
    compareEndDate: params.compareEndDate ?? null,
    storeNumbers,
    rangeA,
    rangeB,
    totalsA,
    totalsB,
  };
}

function bucketByHour(lines: TicketLine[], computePct: boolean): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    tickets: 0,
    qty: 0,
    dollars: 0,
    pctOfTotal: computePct ? 0 : null,
  }));
  const ticketsSeen = new Set<string>();
  for (const l of lines) {
    const b = buckets[l.hour];
    if (!b) continue;
    b.qty += l.qty;
    b.dollars += l.extension;
    const ticketKey = `${l.date}|${l.store}|${l.ticket}|${l.hour}`;
    if (!ticketsSeen.has(ticketKey)) {
      ticketsSeen.add(ticketKey);
      b.tickets += 1;
    }
  }
  const total = buckets.reduce((s, b) => s + b.dollars, 0);
  for (const b of buckets) {
    b.dollars = round2(b.dollars);
    if (computePct) {
      b.pctOfTotal = total === 0 ? 0 : round1((b.dollars / total) * 100);
    }
  }
  return buckets;
}

function sumHourlyTotals(buckets: HourlyBucket[]): { tickets: number; qty: number; dollars: number } {
  return {
    tickets: buckets.reduce((s, b) => s + b.tickets, 0),
    qty: buckets.reduce((s, b) => s + b.qty, 0),
    dollars: round2(buckets.reduce((s, b) => s + b.dollars, 0)),
  };
}

// ─────────────────────────── Sales by SKU (RICS p. 43) ────────────────────

export async function getSalesBySku(params: {
  startDate: string;
  endDate: string;
  storeNumbers?: number[];
  sortBy?: SalesBySkuSortBy;
  includeReturns?: boolean;
  skus?: string[];              // optional filter
}): Promise<SalesBySkuReport> {
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  const storeNumbers = params.storeNumbers ?? [];
  const sortBy: SalesBySkuSortBy = params.sortBy ?? 'SKU';
  const includeReturns = params.includeReturns !== false;

  const lines = await loadTicketLines({
    startDate,
    endDate,
    storeNumbers: storeNumbers.length ? storeNumbers : undefined,
  });

  const skuFilter = params.skus && params.skus.length ? new Set(params.skus.map((s) => s.trim())) : null;

  // Group by SKU → then by (column,row) cells.
  const bySku = new Map<string, {
    sku: string;
    category: number | null;
    vendor: string | null;
    qty: number;
    dollars: number;
    returnsQty: number;
    returnsDollars: number;
    cells: Map<string, SalesBySkuSizeCell>;
  }>();
  for (const l of lines) {
    if (!l.sku) continue;
    if (skuFilter && !skuFilter.has(l.sku)) continue;
    const isReturn = l.returnCode !== 0 || l.qty < 0 || l.extension < 0;
    if (isReturn && !includeReturns) continue;

    let bucket = bySku.get(l.sku);
    if (!bucket) {
      bucket = {
        sku: l.sku,
        category: l.category,
        vendor: l.vendor,
        qty: 0,
        dollars: 0,
        returnsQty: 0,
        returnsDollars: 0,
        cells: new Map(),
      };
      bySku.set(l.sku, bucket);
    }
    bucket.qty += l.qty;
    bucket.dollars += l.extension;
    if (isReturn) {
      bucket.returnsQty += Math.abs(l.qty);
      bucket.returnsDollars += Math.abs(l.extension);
    }
    const cellKey = `${l.column}|${l.row}`;
    let cell = bucket.cells.get(cellKey);
    if (!cell) {
      cell = { columnLabel: l.column, rowLabel: l.row, qty: 0, dollars: 0 };
      bucket.cells.set(cellKey, cell);
    }
    cell.qty += l.qty;
    cell.dollars += l.extension;
  }

  let rows: SalesBySkuRow[] = [];
  for (const b of bySku.values()) {
    rows.push({
      sku: b.sku,
      category: b.category,
      vendor: b.vendor,
      qty: b.qty,
      dollars: round2(b.dollars),
      returnsQty: b.returnsQty,
      returnsDollars: round2(b.returnsDollars),
      cells: [...b.cells.values()]
        .map((c) => ({ ...c, dollars: round2(c.dollars) }))
        .sort((a, b) => a.rowLabel.localeCompare(b.rowLabel) || a.columnLabel.localeCompare(b.columnLabel)),
    });
  }

  rows = sortSkuRows(rows, sortBy);

  const totals = {
    qty: rows.reduce((s, r) => s + r.qty, 0),
    dollars: round2(rows.reduce((s, r) => s + r.dollars, 0)),
    returnsQty: rows.reduce((s, r) => s + r.returnsQty, 0),
    returnsDollars: round2(rows.reduce((s, r) => s + r.returnsDollars, 0)),
  };

  return {
    startDate,
    endDate,
    storeNumbers,
    sortBy,
    includeReturns,
    rows,
    totals,
  };
}

function sortSkuRows(rows: SalesBySkuRow[], sortBy: SalesBySkuSortBy): SalesBySkuRow[] {
  const copy = [...rows];
  if (sortBy === 'SKU') {
    copy.sort((a, b) => a.sku.localeCompare(b.sku));
  } else if (sortBy === 'CATEGORY_SKU') {
    copy.sort((a, b) =>
      (a.category ?? 0) - (b.category ?? 0) || a.sku.localeCompare(b.sku));
  } else if (sortBy === 'VENDOR_SKU') {
    copy.sort((a, b) =>
      (a.vendor ?? '').localeCompare(b.vendor ?? '') || a.sku.localeCompare(b.sku));
  }
  return copy;
}

// ─────────────────────────── Salesperson Summary (RICS p. 42) ─────────────

export async function getSalespersonSummary(params: {
  startDate: string;
  endDate: string;
  storeNumbers?: number[];
  subtotalBy?: SalespersonSubtotalBy;
  combineStores?: boolean;
  cashierSummary?: boolean;
}): Promise<SalespersonSummaryReport> {
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  const storeNumbers = params.storeNumbers ?? [];
  const combineStores = params.combineStores === true;
  const subtotalBy = params.subtotalBy ?? null;
  const wantCashiers = params.cashierSummary === true;

  const [lines, headers, salespeople] = await Promise.all([
    loadTicketLines({
      startDate,
      endDate,
      storeNumbers: storeNumbers.length ? storeNumbers : undefined,
    }),
    wantCashiers
      ? loadTicketHeaders({
          startDate,
          endDate,
          storeNumbers: storeNumbers.length ? storeNumbers : undefined,
        })
      : Promise.resolve([] as TicketHeaderFlag[]),
    loadSalespersonMap(),
  ]);

  // Group lines by (salesperson, store).
  type Bucket = {
    salespersonCode: string;
    storeNumber: number;
    qty: number;
    dollars: number;
    perks: number;
    subtotals: Map<string, SalespersonSubtotal>;
  };
  const buckets = new Map<string, Bucket>();
  for (const l of lines) {
    const person = l.salesperson || '(unknown)';
    const storeKey = combineStores ? 0 : l.store;
    const key = `${person}|${storeKey}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        salespersonCode: person,
        storeNumber: storeKey,
        qty: 0,
        dollars: 0,
        perks: 0,
        subtotals: new Map(),
      };
      buckets.set(key, b);
    }
    b.qty += l.qty;
    b.dollars += l.extension;
    b.perks += l.perks;

    if (subtotalBy) {
      const subKey = subtotalBy === 'VENDOR'
        ? (l.vendor ?? '(none)')
        : String(l.category ?? 0);
      let sub = b.subtotals.get(subKey);
      if (!sub) {
        sub = {
          key: subKey,
          label: subKey,
          qty: 0,
          dollars: 0,
          perks: 0,
        };
        b.subtotals.set(subKey, sub);
      }
      sub.qty += l.qty;
      sub.dollars += l.extension;
      sub.perks += l.perks;
    }
  }

  const salespeopleRows: SalespersonRow[] = [...buckets.values()]
    .map((b) => ({
      salespersonCode: b.salespersonCode,
      salespersonName: salespeople.get(b.salespersonCode)?.name ?? null,
      storeNumber: b.storeNumber,
      qty: b.qty,
      dollars: round2(b.dollars),
      perks: round2(b.perks),
      subtotals: [...b.subtotals.values()]
        .map((s) => ({ ...s, dollars: round2(s.dollars), perks: round2(s.perks) }))
        .sort((a, b) => b.dollars - a.dollars),
    }))
    .sort((a, b) => b.dollars - a.dollars);

  // Cashier summary (optional).
  let cashierRows: CashierRow[] | null = null;
  if (wantCashiers) {
    type CBucket = { cashier: string; store: number; tickets: number; dollars: number };
    const cbyKey = new Map<string, CBucket>();
    const dollarsByKey = new Map<string, number>();
    for (const l of lines) {
      const dollarsKey = `${l.date}|${l.store}|${l.ticket}`;
      dollarsByKey.set(dollarsKey, (dollarsByKey.get(dollarsKey) ?? 0) + l.extension);
    }
    for (const h of headers) {
      const key = combineStores ? `${h.cashier}|0` : `${h.cashier}|${h.store}`;
      let c = cbyKey.get(key);
      if (!c) {
        c = {
          cashier: h.cashier,
          store: combineStores ? 0 : h.store,
          tickets: 0,
          dollars: 0,
        };
        cbyKey.set(key, c);
      }
      c.tickets += 1;
      c.dollars += dollarsByKey.get(`${h.date}|${h.store}|${h.ticket}`) ?? 0;
    }
    cashierRows = [...cbyKey.values()]
      .map<CashierRow>((c) => ({
        cashierCode: c.cashier || '(unknown)',
        cashierName: salespeople.get(c.cashier)?.name ?? null,
        storeNumber: c.store,
        tickets: c.tickets,
        dollars: round2(c.dollars),
      }))
      .sort((a, b) => b.dollars - a.dollars);
  }

  const grandTotal = {
    qty: salespeopleRows.reduce((s, r) => s + r.qty, 0),
    dollars: round2(salespeopleRows.reduce((s, r) => s + r.dollars, 0)),
    perks: round2(salespeopleRows.reduce((s, r) => s + r.perks, 0)),
  };

  return {
    startDate,
    endDate,
    storeNumbers,
    subtotalBy,
    combineStores,
    salespeople: salespeopleRows,
    cashierSummary: cashierRows,
    grandTotal,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Public API — Phase 2 reports
// ══════════════════════════════════════════════════════════════════════════

// ─────────────────────────── Best Sellers (RICS p. 93) ────────────────────

export async function getBestSellers(params: {
  dimension: BestSellersDimension;
  metric: BestSellersMetric;
  period: BestSellersPeriod;
  storeNumbers?: number[];
  combineStores?: boolean;
  topN?: number;
}): Promise<BestSellersReport> {
  const storeNumbers = params.storeNumbers ?? [];
  const combineStores = params.combineStores === true;
  const topN = Math.max(1, Math.min(params.topN ?? 50, 1000));
  const { startDate, endDate } = resolvePeriod(params.period);

  const lines = await loadTicketLines({
    startDate,
    endDate,
    storeNumbers: storeNumbers.length ? storeNumbers : undefined,
  });

  type Bucket = { key: string; label: string | null; qty: number; netSales: number; profit: number };
  const buckets = new Map<string, Bucket>();
  for (const l of lines) {
    const key = keyForDimension(l, params.dimension, combineStores);
    if (!key) continue;
    let b = buckets.get(key);
    if (!b) {
      b = { key, label: null, qty: 0, netSales: 0, profit: 0 };
      buckets.set(key, b);
    }
    b.qty += l.qty;
    b.netSales += l.extension;
    b.profit += l.extension - l.cost * l.qty;
  }

  // Hydrate labels.
  const stores = await loadStoreMap();
  for (const b of buckets.values()) {
    if (params.dimension === 'STORE') {
      b.label = stores.get(Number(b.key))?.name ?? null;
    } else {
      b.label = b.key;          // SKU / vendor / category: key == human display
    }
  }

  const metricKey: keyof Bucket = params.metric === 'QTY' ? 'qty' :
    params.metric === 'NET_SALES' ? 'netSales' : 'profit';
  const sorted = [...buckets.values()]
    .sort((a, b) => Number(b[metricKey]) - Number(a[metricKey]))
    .slice(0, topN);

  const rows: BestSellerRow[] = sorted.map((b, i) => ({
    rank: i + 1,
    key: b.key,
    label: b.label,
    qty: b.qty,
    netSales: round2(b.netSales),
    profit: round2(b.profit),
    profitPct: b.netSales === 0 ? null : round1((b.profit / b.netSales) * 100),
  }));

  const totals = {
    qty: rows.reduce((s, r) => s + r.qty, 0),
    netSales: round2(rows.reduce((s, r) => s + r.netSales, 0)),
    profit: round2(rows.reduce((s, r) => s + r.profit, 0)),
  };

  return {
    dimension: params.dimension,
    metric: params.metric,
    period: params.period,
    startDate,
    endDate,
    storeNumbers,
    combineStores,
    rows,
    totals,
  };
}

function keyForDimension(l: TicketLine, dim: BestSellersDimension, combine: boolean): string | null {
  if (dim === 'SKU') return l.sku || null;
  if (dim === 'VENDOR') return l.vendor ?? '(none)';
  if (dim === 'CATEGORY') return l.category != null ? String(l.category) : '(none)';
  if (dim === 'STORE') return combine ? '0' : String(l.store);
  return null;
}

/**
 * Resolve WTD / MTD / STD / YTD / { lastNMonths } into a start/end date window.
 * STD (season-to-date) is approximated as 6-month trailing window until
 * fiscal-season configuration is ported from Company Setup.
 */
function resolvePeriod(period: BestSellersPeriod): { startDate: string; endDate: string } {
  const today = toIsoDate(new Date());
  if (typeof period === 'object' && 'lastNMonths' in period) {
    const start = toUtcDate(today);
    start.setUTCMonth(start.getUTCMonth() - Math.max(1, Math.floor(period.lastNMonths)));
    return { startDate: toIsoDate(start), endDate: today };
  }
  const now = toUtcDate(today);
  if (period === 'WTD') {
    const day = now.getUTCDay();                 // 0=Sun
    const dist = (day + 6) % 7;                  // days since Monday
    const start = new Date(now.getTime() - dist * 86_400_000);
    return { startDate: toIsoDate(start), endDate: today };
  }
  if (period === 'MTD') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { startDate: toIsoDate(start), endDate: today };
  }
  if (period === 'STD') {
    const start = new Date(now.getTime());
    start.setUTCMonth(start.getUTCMonth() - 6);
    return { startDate: toIsoDate(start), endDate: today };
  }
  // YTD
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return { startDate: toIsoDate(start), endDate: today };
}

// ─────────────────────────── Sales Analysis (RICS p. 88) ──────────────────

export async function getSalesAnalysis(params: {
  dimension: SalesAnalysisDimension;
  reportType: SalesAnalysisReportType;
  storeOption: SalesAnalysisStoreOption;
  criteria: SalesAnalysisCriteria;
  printing: SalesAnalysisPrinting;
  startDate?: string;           // overrides printing.* when provided
  endDate?: string;
}): Promise<SalesAnalysisReport> {
  const { startDate, endDate } = resolveAnalysisWindow(params);

  // Guard: reportTypes that require RIINVMAS master joins aren't wired yet.
  if (REQUIRES_MASTER_JOIN.has(params.reportType)) {
    throw new ReportTypeNotImplementedError(params.reportType);
  }

  const parsed: ParsedAnalysisCriteria = {
    stores: parseCriteria(params.criteria.storesRaw),
    categories: parseCriteria(params.criteria.categoriesRaw),
    vendors: parseCriteria(params.criteria.vendorsRaw),
    skus: parseCriteria(params.criteria.skusRaw),
  };

  // Widen the ticket-line pre-filter for Stores: if `storesRaw` expresses a
  // numeric range (e.g. "2-16"), include every store in those bounds in the
  // SQL-side store filter. This deliberately OVER-selects — the exact match
  // still runs per-row via `facetKeeps`/`matchesCriteria`. Exclusion-only
  // grammar returns null bounds and falls back to the structured-only path.
  const structuredStoresList = params.criteria.stores ?? [];
  const storesBounds = sqlNumericBounds(parsed.stores);
  let expandedStoresFromGrammar: number[] | null = null;
  if (storesBounds) {
    expandedStoresFromGrammar = [];
    for (let n = storesBounds.min; n <= storesBounds.max; n++) {
      expandedStoresFromGrammar.push(n);
    }
  }
  const filteredStores = (() => {
    if (!structuredStoresList.length && !expandedStoresFromGrammar) return undefined;
    if (!structuredStoresList.length) return expandedStoresFromGrammar ?? undefined;
    if (!expandedStoresFromGrammar) return structuredStoresList;
    return Array.from(new Set([...structuredStoresList, ...expandedStoresFromGrammar]));
  })();

  const lines = await loadTicketLines({
    startDate,
    endDate,
    storeNumbers: filteredStores,
  });

  // Apply criteria filters.
  const filtered = lines.filter((l) => applyAnalysisCriteria(l, params.criteria, parsed));

  // Row grain is driven by `reportType`:
  //   SKU_DETAIL           → one row per SKU
  //   CATEGORY_SUMMARY     → one row per category (denorm on TicketDetail)
  //   DEPT_SUMMARY         → one row per department (category → dept via RIDEPT)
  //   VENDOR_SUMMARY       → one row per vendor (denorm on TicketDetail)
  //   PRICE_POINT_SUMMARY  → one row per $25 price bucket
  //   SEASON/GROUP/        → requires RIINVMAS join (guarded above)
  //   STYLE_COLOR/SECTOR_SUMMARY
  //
  // `dimension` (analyze-by) is retained for future hierarchical grouping; it
  // does not change row grain today.
  const combine = params.storeOption === 'COMBINE';
  const deptMap = params.reportType === 'DEPT_SUMMARY' ? await loadDepartmentMap() : null;

  type Bucket = {
    dimensionKey: string;
    dimensionLabel: string | null;
    storeNumber: number | null;
    qty: number;
    netSales: number;
    cogs: number;
  };
  const buckets = new Map<string, Bucket>();
  for (const l of filtered) {
    const dimKey = rowGrainKey(l, params.reportType, deptMap);
    if (!dimKey) continue;
    const storeKey = combine ? null : l.store;
    const mapKey = `${dimKey}|${storeKey ?? '*'}`;
    let b = buckets.get(mapKey);
    if (!b) {
      b = {
        dimensionKey: dimKey,
        dimensionLabel: dimLabelFor(dimKey, params.reportType, deptMap),
        storeNumber: storeKey,
        qty: 0,
        netSales: 0,
        cogs: 0,
      };
      buckets.set(mapKey, b);
    }
    b.qty += l.qty;
    b.netSales += l.extension;
    b.cogs += l.cost * l.qty;
  }

  // Prior year netSales (optional).
  let priorYearByDimStore: Map<string, number> | null = null;
  if (params.printing.priorYear) {
    const pyStart = addDays(startDate, -364);
    const pyEnd = addDays(endDate, -364);
    const pyLines = await loadTicketLines({
      startDate: pyStart,
      endDate: pyEnd,
      storeNumbers: filteredStores,
    });
    priorYearByDimStore = new Map();
    for (const l of pyLines) {
      if (!applyAnalysisCriteria(l, params.criteria, parsed)) continue;
      const dimKey = rowGrainKey(l, params.reportType, deptMap);
      if (!dimKey) continue;
      const storeKey = combine ? null : l.store;
      const mapKey = `${dimKey}|${storeKey ?? '*'}`;
      priorYearByDimStore.set(mapKey, (priorYearByDimStore.get(mapKey) ?? 0) + l.extension);
    }
  }

  // On-hand-at-cost lookup (Turns/ROI denominator).
  const rawOnHandMap = await getOnHandAtCostByDimension({
    reportType: params.reportType,
    storeOption: params.storeOption,
    criteria: params.criteria,
  });

  // DEPT_SUMMARY comes back keyed as `CAT:<category>[|<store>]` — the
  // on-hand adapter doesn't have the dept map. Re-bucket here using the
  // existing deptNumberForCategory helper.
  let onHandLookup = rawOnHandMap;
  if (params.reportType === 'DEPT_SUMMARY' && deptMap) {
    onHandLookup = new Map<string, number>();
    for (const [k, v] of rawOnHandMap) {
      const pipeIdx = k.indexOf('|');
      const head = pipeIdx === -1 ? k : k.slice(0, pipeIdx);
      const tail = pipeIdx === -1 ? '' : k.slice(pipeIdx);
      const catNum = Number(head.replace(/^CAT:/, ''));
      const dept = deptNumberForCategory(catNum, deptMap);
      if (dept == null) continue;
      const newKey = `${dept}${tail}`;
      onHandLookup.set(newKey, (onHandLookup.get(newKey) ?? 0) + v);
    }
  } else if (params.reportType === 'PRICE_POINT_SUMMARY') {
    // PP bucketing requires SKU → bucket mapping from the sales adapter's
    // own bucketization, which is not currently exposed. Until that's
    // refactored, leave onHandLookup empty so ROI/Turns render as null
    // on price-point rows. Documented as spec Open Question 2.
    onHandLookup = new Map();
  }

  const periodDays =
    Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
    ) + 1;

  // Default sort: by dimensionKey (numeric-aware). For DEPT_SUMMARY /
  // CATEGORY_SUMMARY this gives numeric ascending; for VENDOR_SUMMARY /
  // SKU_DETAIL it gives alphanumeric ascending. Users can still re-sort
  // interactively via Ant's column headers.
  const rows: SalesAnalysisRow[] = [...buckets.values()]
    .map((b) => {
      const grossProfit = b.netSales - b.cogs;
      const mapKey = `${b.dimensionKey}|${b.storeNumber ?? '*'}`;
      const priorYear = priorYearByDimStore?.get(mapKey) ?? null;

      const onHandKey =
        params.storeOption === 'COMBINE'
          ? b.dimensionKey
          : `${b.dimensionKey}|${b.storeNumber}`;
      const onHandAtCost = onHandLookup.get(onHandKey) ?? 0;

      const metrics = computeRoiTurnsGp({
        netSales: b.netSales,
        cogs: b.cogs,
        grossProfit,
        onHandAtCost,
        periodDays,
      });

      return {
        dimensionKey: b.dimensionKey,
        dimensionLabel: b.dimensionLabel,
        storeNumber: b.storeNumber,
        qty: b.qty,
        netSales: round2(b.netSales),
        cogs: round2(b.cogs),
        grossProfit: round2(grossProfit),
        gpPct: metrics.gpPct,
        onHandAtCost: round2(onHandAtCost),
        turns: metrics.turns,
        roiPct: metrics.roiPct,
        priorYearNetSales: priorYear != null ? round2(priorYear) : null,
        pyPctChange: priorYear == null || priorYear === 0
          ? null
          : round1(((b.netSales - priorYear) / priorYear) * 100),
      };
    })
    .sort((a, b) =>
      a.dimensionKey.localeCompare(b.dimensionKey, undefined, {
        numeric: true,
        sensitivity: 'base',
      }));

  const totalNetSales = rows.reduce((s, r) => s + r.netSales, 0);
  const totalCogs = rows.reduce((s, r) => s + r.cogs, 0);
  const totalGrossProfit = rows.reduce((s, r) => s + r.grossProfit, 0);
  const totalOnHandAtCost = rows.reduce((s, r) => s + r.onHandAtCost, 0);
  const totalsMetrics = computeRoiTurnsGp({
    netSales: totalNetSales,
    cogs: totalCogs,
    grossProfit: totalGrossProfit,
    onHandAtCost: totalOnHandAtCost,
    periodDays,
  });
  const totals = {
    qty: rows.reduce((s, r) => s + r.qty, 0),
    netSales: round2(totalNetSales),
    cogs: round2(totalCogs),
    grossProfit: round2(totalGrossProfit),
    onHandAtCost: round2(totalOnHandAtCost),
    gpPct: totalsMetrics.gpPct,
    turns: totalsMetrics.turns,
    roiPct: totalsMetrics.roiPct,
    priorYearNetSales: priorYearByDimStore
      ? round2(rows.reduce((s, r) => s + (r.priorYearNetSales ?? 0), 0))
      : null,
  };

  return {
    dimension: params.dimension,
    reportType: params.reportType,
    storeOption: params.storeOption,
    criteria: params.criteria,
    printing: params.printing,
    rows,
    totals,
    periodDays,
  };
}

function resolveAnalysisWindow(params: { startDate?: string; endDate?: string; printing: SalesAnalysisPrinting }): { startDate: string; endDate: string } {
  if (params.startDate && params.endDate) {
    return { startDate: normalizeDate(params.startDate), endDate: normalizeDate(params.endDate) };
  }
  // Resolve based on printing flags; narrowest (WTD) wins, then MTD, STD, YTD.
  if (params.printing.wtd) return resolvePeriod('WTD');
  if (params.printing.mtd) return resolvePeriod('MTD');
  if (params.printing.std) return resolvePeriod('STD');
  return resolvePeriod('YTD');
}

/**
 * Criteria merge per spec §2: structured picks ∪ grammar inclusions, with
 * grammar exclusions applied on top. Exclusion-only grammar narrows the
 * structured picks (does not widen to the universe).
 *
 * Duplicates the same helper in `ricsOnHandAtCostAdapter.ts`. Intentional for
 * now — a follow-up cleanup can lift both into a shared module.
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

interface ParsedAnalysisCriteria {
  stores: CriteriaExpression;
  categories: CriteriaExpression;
  vendors: CriteriaExpression;
  skus: CriteriaExpression;
}

function applyAnalysisCriteria(
  l: TicketLine,
  c: SalesAnalysisCriteria,
  parsed: ParsedAnalysisCriteria,
): boolean {
  if (!facetKeeps(c.stores, parsed.stores, l.store)) return false;
  if (!facetKeeps(c.categories, parsed.categories, l.category ?? null)) return false;
  if (!facetKeeps(c.vendors, parsed.vendors, l.vendor ?? null)) return false;
  if (!facetKeeps(c.skus, parsed.skus, l.sku)) return false;
  return true;
}

// Row-grain helpers ─────────────────────────────────────────────────────────

const REQUIRES_MASTER_JOIN = new Set<SalesAnalysisReportType>([
  'SEASON_SUMMARY',
  'GROUP_SUMMARY',
  'STYLE_COLOR_SUMMARY',
  'SECTOR_SUMMARY',
]);

export class ReportTypeNotImplementedError extends Error {
  constructor(public readonly reportType: SalesAnalysisReportType) {
    super(
      `reportType="${reportType}" is not yet implemented. It requires joining RIINVMAS (Season / Group / Style-Color / Sector) — tracked as Phase 2.5. Use SKU_DETAIL, CATEGORY_SUMMARY, DEPT_SUMMARY, VENDOR_SUMMARY, or PRICE_POINT_SUMMARY for now.`,
    );
    this.name = 'ReportTypeNotImplementedError';
  }
}

interface DeptRow {
  number: number;
  desc: string | null;
  begCateg: number;
  endCateg: number;
}

async function loadDepartmentMap(): Promise<DeptRow[]> {
  return cachedAsync('sr:dim:departments', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<
      { Number: number; Desc: string | null; BegCateg: number; EndCateg: number }[]
    >(
      `SELECT number AS "Number", "desc" AS "Desc",
              beg_categ AS "BegCateg", end_categ AS "EndCateg"
         FROM rics_mirror.departments
        WHERE beg_categ IS NOT NULL AND end_categ IS NOT NULL`,
    );
    return rows
      .filter((r) => r.Number != null)
      .map<DeptRow>((r) => ({
        number: Number(r.Number),
        desc: r.Desc?.trim() || null,
        begCateg: Number(r.BegCateg ?? 0),
        endCateg: Number(r.EndCateg ?? 0),
      }));
  });
}

function deptNumberForCategory(category: number | null, depts: DeptRow[] | null): number | null {
  if (category == null || !depts) return null;
  for (const d of depts) {
    if (category >= d.begCateg && category <= d.endCateg) return d.number;
  }
  return null;
}

/** $25 price buckets. Example: $37.50 → "25-50". */
function priceBucketFor(extension: number, qty: number): string {
  if (qty === 0) return '(zero-qty)';
  const unit = Math.abs(extension / qty);
  const lo = Math.floor(unit / 25) * 25;
  return `${lo}-${lo + 25}`;
}

function rowGrainKey(
  l: TicketLine,
  rt: SalesAnalysisReportType,
  depts: DeptRow[] | null,
): string | null {
  switch (rt) {
    case 'SKU_DETAIL':
      return l.sku || null;
    case 'CATEGORY_SUMMARY':
      return l.category != null ? String(l.category) : '(none)';
    case 'DEPT_SUMMARY': {
      const d = deptNumberForCategory(l.category, depts);
      return d != null ? String(d) : '(none)';
    }
    case 'VENDOR_SUMMARY':
      return l.vendor ?? '(none)';
    case 'PRICE_POINT_SUMMARY':
      return priceBucketFor(l.extension, l.qty);
    default:
      return null;
  }
}

function dimLabelFor(
  key: string,
  rt: SalesAnalysisReportType,
  depts: DeptRow[] | null,
): string | null {
  if (rt === 'DEPT_SUMMARY' && depts) {
    const found = depts.find((d) => String(d.number) === key);
    return found?.desc ?? null;
  }
  return null;
}

// ─────────────────────────── Stock Status (RICS p. 96) ────────────────────

interface QuaAggRow {
  SKU: string | null;
  Store: number | null;
  TotalOnHand: number | null;
  TotalOnOrder: number | null;
  TotalModel: number | null;
}

interface MasterLiteRow {
  SKU: string | null;
  Desc: string | null;
  Vendor: string | null;
  Category: number | null;
  RetailPrice: number | null;
  CurrentCost: number | null;
  Season: string | null;
}

export async function getStockStatus(params: {
  sortBy?: StockStatusSortBy;
  storeOption?: StockStatusStoreOption;
  itemFilter?: StockStatusItemFilter;
  criteria?: { vendors?: string[]; categories?: number[]; seasons?: string[]; skus?: string[] };
  printQty?: StockStatusPrintQty;
}): Promise<StockStatusReport> {
  const sortBy: StockStatusSortBy = params.sortBy ?? 'CATEGORY';
  const storeOption: StockStatusStoreOption = params.storeOption ?? 'SEPARATE';
  const itemFilter: StockStatusItemFilter = params.itemFilter ?? 'ALL';
  const criteria = params.criteria ?? {};

  // 1) Aggregate rics_mirror.inventory_quantities: per (SKU, Store) sum of
  //    OnHand / OnOrder / Model across all 18 size cells.
  const onHandParts = Array.from({ length: 18 }, (_, i) => {
    const n = pad2(i + 1);
    return `COALESCE(on_hand_${n}, 0)`;
  }).join(' + ');
  const onOrderParts = Array.from({ length: 18 }, (_, i) => {
    const n = pad2(i + 1);
    return `COALESCE(current_on_order_${n}, 0) + COALESCE(future_on_order_${n}, 0)`;
  }).join(' + ');
  const modelParts = Array.from({ length: 18 }, (_, i) => {
    const n = pad2(i + 1);
    return `COALESCE(model_${n}, 0)`;
  }).join(' + ');

  const quaSql = `SELECT sku AS "SKU", store AS "Store",
  SUM(${onHandParts})::int  AS "TotalOnHand",
  SUM(${onOrderParts})::int AS "TotalOnOrder",
  SUM(${modelParts})::int   AS "TotalModel"
FROM rics_mirror.inventory_quantities
GROUP BY sku, store`;

  const qua = await prisma.$queryRawUnsafe<QuaAggRow[]>(quaSql);

  // 2) Pull master data (filtered by criteria). Parameterize caller-supplied
  //    filter values.
  const masterParams: unknown[] = [];
  const masterWheres: string[] = [`(status IS NULL OR status <> 'D')`];
  if (criteria.vendors?.length) {
    masterParams.push(criteria.vendors.map((v) => String(v).trim()));
    masterWheres.push(`vendor = ANY($${masterParams.length}::text[])`);
  }
  if (criteria.categories?.length) {
    masterParams.push(criteria.categories.map((c) => Number(c)));
    masterWheres.push(`category = ANY($${masterParams.length}::int[])`);
  }
  if (criteria.seasons?.length) {
    masterParams.push(criteria.seasons.map((s) => String(s).trim()));
    masterWheres.push(`season = ANY($${masterParams.length}::text[])`);
  }
  if (criteria.skus?.length) {
    masterParams.push(criteria.skus.map((s) => String(s).trim()));
    masterWheres.push(`sku = ANY($${masterParams.length}::text[])`);
  }
  const masterSql = `SELECT
  sku AS "SKU", "desc" AS "Desc", vendor AS "Vendor",
  category AS "Category",
  retail_price::float8  AS "RetailPrice",
  current_cost::float8  AS "CurrentCost",
  season AS "Season"
FROM rics_mirror.inventory_master
WHERE ${masterWheres.join(' AND ')}`;

  const masters = await prisma.$queryRawUnsafe<MasterLiteRow[]>(masterSql, ...masterParams);
  const masterBySku = new Map<string, MasterLiteRow>();
  for (const m of masters) {
    if (m.SKU) masterBySku.set(m.SKU, m);
  }

  // 3) Combine and filter.
  const combine = storeOption === 'COMBINE';
  type Agg = { sku: string; store: number; onHand: number; onOrder: number; model: number };
  const aggByKey = new Map<string, Agg>();
  for (const q of qua) {
    if (!q.SKU) continue;
    if (!masterBySku.has(q.SKU)) continue;
    const store = Number(q.Store ?? 0);
    const key = combine ? `${q.SKU}|0` : `${q.SKU}|${store}`;
    let a = aggByKey.get(key);
    if (!a) {
      a = { sku: q.SKU, store: combine ? 0 : store, onHand: 0, onOrder: 0, model: 0 };
      aggByKey.set(key, a);
    }
    a.onHand += Number(q.TotalOnHand ?? 0);
    a.onOrder += Number(q.TotalOnOrder ?? 0);
    a.model += Number(q.TotalModel ?? 0);
  }

  const rows: StockStatusRow[] = [];
  for (const a of aggByKey.values()) {
    const m = masterBySku.get(a.sku);
    if (!m) continue;
    const short = Math.max(0, a.model - a.onHand);
    const critical = Math.max(0, a.model - a.onHand - a.onOrder);
    if (!passesItemFilter(a, itemFilter, short, critical)) continue;

    const retailPrice = m.RetailPrice != null ? Number(m.RetailPrice) : 0;
    const currentCost = m.CurrentCost != null ? Number(m.CurrentCost) : 0;
    rows.push({
      sku: a.sku,
      description: m.Desc?.trim() || null,
      vendorCode: m.Vendor?.trim() || null,
      category: m.Category ?? null,
      storeNumber: a.store,
      onHand: a.onHand,
      onOrder: a.onOrder,
      model: a.model,
      short,
      critical,
      retailValue: round2(retailPrice * a.onHand),
      costValue: round2(currentCost * a.onHand),
    });
  }

  rows.sort((a, b) =>
    sortBy === 'VENDOR'
      ? (a.vendorCode ?? '').localeCompare(b.vendorCode ?? '') || a.sku.localeCompare(b.sku)
      : (a.category ?? 0) - (b.category ?? 0) || a.sku.localeCompare(b.sku));

  const totals = {
    onHand: rows.reduce((s, r) => s + r.onHand, 0),
    onOrder: rows.reduce((s, r) => s + r.onOrder, 0),
    model: rows.reduce((s, r) => s + r.model, 0),
    short: rows.reduce((s, r) => s + r.short, 0),
    critical: rows.reduce((s, r) => s + r.critical, 0),
    retailValue: round2(rows.reduce((s, r) => s + r.retailValue, 0)),
    costValue: round2(rows.reduce((s, r) => s + r.costValue, 0)),
  };

  return {
    sortBy,
    storeOption,
    itemFilter,
    criteria,
    rows,
    totals,
  };
}

function passesItemFilter(
  a: { onHand: number; onOrder: number; model: number },
  filter: StockStatusItemFilter,
  short: number,
  critical: number,
): boolean {
  switch (filter) {
    case 'ONLY_SHORT':        return short > 0;
    case 'ONLY_CRITICAL':     return critical > 0;
    case 'ONLY_ON_ORDER':     return a.onOrder > 0;
    case 'ONLY_NEGATIVE_OH':  return a.onHand < 0;
    case 'ONLY_WITH_MODELS':  return a.model > 0;
    case 'ALL':
    default:                  return true;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Warmup
// ══════════════════════════════════════════════════════════════════════════

export async function warmup(): Promise<void> {
  try {
    await Promise.all([loadStoreMap(), loadSalespersonMap()]);
    console.log('[ricsSalesReportAdapter] warmup complete');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[ricsSalesReportAdapter] warmup failed (non-fatal):', msg);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Internals
// ══════════════════════════════════════════════════════════════════════════

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
