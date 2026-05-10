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
import {
  getOnHandAtCostByDimension,
  type OnHandInventoryMetrics,
} from './ricsOnHandAtCostAdapter';
import { computeRoiTurnsGp } from './metrics';
import {
  loadSkuAttributeAssignmentsBySku,
  loadSkuAttributesBySku,
} from './skuAttributesEnricher';
import {
  parseCriteria,
  matchesCriteria,
  matchesKeywords,
  type CriteriaExpression,
  sqlNumericBounds,
} from '../../utils/criteriaGrammar';
import { parseStoreCriteriaExpression } from './sharedReportCriteria';
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
  SalesAnalysisAttributeDimension,
  SalesHierarchyReport,
  SalesHierarchyNode,
  SalesHierarchyStoreOption,
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

interface SalespersonInfo {
  code: string;
  name: string | null;
}

async function loadSalespersonMap(): Promise<Map<string, SalespersonInfo>> {
  return cachedAsync('sr:dim:salespeople', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<{ Code: string | null; Name: string | null }[]>(
      `SELECT salesperson_code AS "Code", display_name AS "Name"
       FROM app.employee`,
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
      `SELECT number AS "Number", "desc" AS "Desc" FROM app.taxonomy_category`,
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

async function loadCategoryMap(): Promise<Map<number, string>> {
  const categories = await loadCategoryList();
  const map = new Map<number, string>();
  for (const category of categories) {
    map.set(category.number, category.desc ?? String(category.number));
  }
  return map;
}

async function loadVendorMap(): Promise<Map<string, string>> {
  return cachedAsync('sr:dim:vendors', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<{ Code: string | null; Name: string | null }[]>(
      `SELECT code AS "Code", COALESCE(NULLIF(BTRIM(short_name), ''), NULLIF(BTRIM(mail_name), ''), code) AS "Name"
       FROM app.vendor`,
    );
    const map = new Map<string, string>();
    for (const row of rows) {
      const code = row.Code?.trim();
      if (!code) continue;
      map.set(code, row.Name?.trim() || code);
    }
    return map;
  });
}

interface GroupRow {
  code: string;
  desc: string | null;
}

interface StoreChainRow {
  code: string;
  label: string;
  storeNumbers: number[];
}
interface StoreChainByStoreRow {
  store_number: number | null;
  chain_code: string | null;
  chain_label: string | null;
}

async function loadGroupList(): Promise<GroupRow[]> {
  return cachedAsync('sr:dim:groups', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<{ Code: string | null; Desc: string | null }[]>(
      `SELECT code AS "Code", "desc" AS "Desc" FROM app.taxonomy_group`,
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

async function loadStoreChainList(): Promise<StoreChainRow[]> {
  return cachedAsync('sr:dim:store-chains', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{
      code: string;
      label: string | null;
      store_numbers: number[] | string[] | null;
    }>>(
      `
        SELECT
          sg.code,
          sg.label,
          ARRAY_AGG(sgm.store_number ORDER BY sgm.store_number)
            FILTER (WHERE sgm.store_number IS NOT NULL) AS store_numbers
        FROM app.store_group sg
        LEFT JOIN app.store_group_member sgm ON sgm.group_code = sg.code
        WHERE sg.active = true
        GROUP BY sg.code, sg.label, sg.sort_order
        ORDER BY sg.sort_order ASC, sg.label ASC
      `,
    );
    return rows.map((row) => ({
      code: row.code,
      label: row.label?.trim() || row.code,
      storeNumbers: Array.isArray(row.store_numbers)
        ? row.store_numbers
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n > 0)
        : [],
    }));
  });
}

async function loadStoreChainByStore(): Promise<Map<number, { code: string; label: string }>> {
  return cachedAsync('sr:store-chain-by-store', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<StoreChainByStoreRow[]>(
      `
        SELECT
          sgm.store_number,
          sg.code AS chain_code,
          sg.label AS chain_label
        FROM app.store_group_member sgm
        INNER JOIN app.store_group sg ON sg.code = sgm.group_code
        WHERE sg.active = true
      `,
    );
    const out = new Map<number, { code: string; label: string }>();
    for (const row of rows) {
      const storeNumber = Number(row.store_number);
      const code = row.chain_code?.trim();
      if (!Number.isInteger(storeNumber) || storeNumber <= 0 || !code) continue;
      out.set(storeNumber, {
        code,
        label: row.chain_label?.trim() || code,
      });
    }
    return out;
  });
}

async function loadOpenPurchaseOrdersBySku(skuCodes: string[]): Promise<Map<string, OnOrderMetrics>> {
  const unique = Array.from(new Set(
    skuCodes
      .map((sku) => sku?.trim().toUpperCase())
      .filter((sku): sku is string => !!sku),
  ));
  const out = new Map<string, OnOrderMetrics>();
  if (unique.length === 0) return out;

  const nativeRows = await prisma.$queryRawUnsafe<Array<{
    sku_code: string | null;
    store_number: number | null;
    open_qty: number | bigint | null;
    open_cost: number | string | null;
  }>>(
    `
      SELECT
        UPPER(TRIM(s.code)) AS sku_code,
        po.ship_to_store_id AS store_number,
        COALESCE(SUM(pol.quantity_ordered - pol.quantity_received), 0)::int AS open_qty,
        COALESCE(SUM(
          (pol.quantity_ordered - pol.quantity_received)
          * COALESCE(pol.estimated_landed_unit_cost_hnl, pol.unit_cost)
        ), 0)::float8 AS open_cost
      FROM app.purchase_order_line pol
      JOIN app.purchase_order po ON po.id = pol.po_id
      JOIN app.sku s ON s.id = pol.sku_id
      WHERE po.status IN ('SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED')
        AND (pol.quantity_ordered - pol.quantity_received) > 0
        AND s.code IS NOT NULL
        AND UPPER(TRIM(s.code)) = ANY($1::text[])
      GROUP BY UPPER(TRIM(s.code)), po.ship_to_store_id
    `,
    unique,
  );

  const legacyRows = await prisma.$queryRawUnsafe<Array<{
    sku_code: string | null;
    store_number: number | null;
    open_qty: number | bigint | null;
    open_cost: number | string | null;
  }>>(
    `
      WITH legacy_open AS (
        SELECT
          UPPER(TRIM(l.sku_code)) AS sku_code,
          po.ship_store AS store_number,
          GREATEST(COALESCE(ordered.qty, 0) - COALESCE(received.qty, 0), 0) AS open_qty,
          COALESCE(l.cost, 0)::float8 AS unit_cost
        FROM app.purchase_order_legacy_line l
        JOIN app.purchase_order_legacy po ON po.po_number = l.po_number
        CROSS JOIN LATERAL (
          SELECT COALESCE(SUM(v), 0)::int AS qty FROM unnest(l.ordered_qtys) AS v
        ) ordered
        CROSS JOIN LATERAL (
          SELECT COALESCE(SUM(v), 0)::int AS qty FROM unnest(l.received_qtys) AS v
        ) received
        WHERE COALESCE(TRIM(l.sku_code), '') <> ''
          AND UPPER(TRIM(l.sku_code)) = ANY($1::text[])
      )
      SELECT
        sku_code,
        store_number,
        COALESCE(SUM(open_qty), 0)::int AS open_qty,
        COALESCE(SUM(open_qty * unit_cost), 0)::float8 AS open_cost
      FROM legacy_open
      WHERE open_qty > 0
      GROUP BY sku_code, store_number
    `,
    unique,
  );

  for (const row of [...nativeRows, ...legacyRows]) {
    const sku = row.sku_code?.trim().toUpperCase();
    if (!sku) continue;
    const qty = Number(row.open_qty ?? 0);
    const cost = Number(row.open_cost ?? 0);
    addOnOrderMetrics(out, `${sku}|*`, qty, cost);
    const storeNumber = Number(row.store_number);
    if (Number.isInteger(storeNumber) && storeNumber > 0) {
      addOnOrderMetrics(out, `${sku}|${storeNumber}`, qty, cost);
    }
  }

  return out;
}

/**
 * Returns the dimension lookups UI dropdowns need. Every list is small
 * (<500 rows each), cached 5 min, returned in one response so a page loads
 * its criteria controls in a single round trip. The Custom Pivot filter
 * card pulls sectors / departments / seasons / buyers from here too —
 * adding them to the shared endpoint is cheaper than a parallel one
 * because every response shares the same server-side cache.
 */
export interface SalesDimensionsResponse {
  stores: Array<{ number: number; name: string | null }>;
  chains: StoreChainRow[];
  categories: CategoryRow[];
  groups: GroupRow[];
  sectors: Array<{ number: number; name: string | null }>;
  departments: Array<{ number: number; name: string | null }>;
  seasons: Array<{ code: string; description: string | null }>;
  buyers: Array<{ code: string; label: string | null }>;
}

async function loadSectorList(): Promise<Array<{ number: number; name: string | null }>> {
  return cachedAsync('sr:dim:sectors', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<{ number: number | null; desc: string | null }[]>(
      `SELECT number, "desc" FROM app.taxonomy_sector`,
    );
    return rows
      .filter((r): r is { number: number; desc: string | null } => r.number != null)
      .map((r) => ({ number: Number(r.number), name: r.desc?.trim() || null }))
      .sort((a, b) => a.number - b.number);
  });
}

async function loadDepartmentList(): Promise<Array<{ number: number; name: string | null }>> {
  return cachedAsync('sr:dim:departments', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<{ number: number | null; desc: string | null }[]>(
      `SELECT number, "desc" FROM app.taxonomy_department`,
    );
    return rows
      .filter((r): r is { number: number; desc: string | null } => r.number != null)
      .map((r) => ({ number: Number(r.number), name: r.desc?.trim() || null }))
      .sort((a, b) => a.number - b.number);
  });
}

async function loadSeasonList(): Promise<Array<{ code: string; description: string | null }>> {
  return cachedAsync('sr:dim:seasons', 300_000, async () => {
    // Seasons live in public.season_overlay per CLAUDE.md — operator-editable
    // Postgres list, not RICS MDB. If that table does not exist yet, fall
    // back to distinct season codes already present on app.sku.
    const [{ present }] = await prisma.$queryRawUnsafe<Array<{ present: boolean }>>(
      `SELECT to_regclass('public.season_overlay') IS NOT NULL AS present`,
    );
    if (present) {
      const rows = await prisma.$queryRawUnsafe<{ code: string; description: string | null }[]>(
        `SELECT code, description FROM public.season_overlay ORDER BY code`,
      );
      return rows.map((r) => ({ code: r.code, description: r.description?.trim() || null }));
    }
    const rows = await prisma.$queryRawUnsafe<{ code: string; description: string | null }[]>(
      `
        SELECT DISTINCT TRIM(season) AS code, NULL::text AS description
        FROM app.sku
        WHERE COALESCE(TRIM(season), '') <> ''
        ORDER BY TRIM(season)
      `,
    );
    return rows;
  });
}

async function loadBuyerList(): Promise<Array<{ code: string; label: string | null }>> {
  return cachedAsync('sr:dim:buyers', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<{ code: string; label: string | null }[]>(
      `
        SELECT av.code, av.label_es AS label
          FROM app.attribute_value av
         INNER JOIN app.attribute_dimension ad ON ad.id = av.dimension_id
         WHERE ad.code = 'buyer' AND av.is_active = true
         ORDER BY av.sort_order NULLS LAST, av.code
      `,
    );
    return rows.map((r) => ({ code: r.code, label: r.label?.trim() || null }));
  });
}

export async function listSalesDimensions(): Promise<SalesDimensionsResponse> {
  const [storeMap, chains, categories, groups, sectors, departments, seasons, buyers] = await Promise.all([
    loadStoreMap(),
    loadStoreChainList(),
    loadCategoryList(),
    loadGroupList(),
    loadSectorList(),
    loadDepartmentList(),
    loadSeasonList(),
    loadBuyerList(),
  ]);
  const stores = [...storeMap.values()]
    .map(({ number, name }) => ({ number, name }))
    .sort((a, b) => a.number - b.number);
  return { stores, chains, categories, groups, sectors, departments, seasons, buyers };
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
  cogsAmount?: number;
  priceBucket?: string | null;
  returnCode: number;
  posted: boolean;
}

interface SkuMasterFields {
  sku: string;
  season: string | null;
  groupCode: string | null;
  styleColor: string | null;
  keywords: string | null;
  category: number | null;
  vendor: string | null;
  buyerCode: string | null;
}

interface AnalysisLine extends TicketLine {
  master?: SkuMasterFields | null;
}

interface RawTicketHeaderFlag {
  TicketId: string | null;
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

function addYears(date: string, years: number): string {
  const d = toUtcDate(date);
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + years);
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
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

const EMPTY_INVENTORY_METRICS: OnHandInventoryMetrics = {
  unitsOnHand: 0,
  onHandAtCost: 0,
  inventoryUnitCost: null,
};

interface SalesAnalysisInventoryMetrics extends OnHandInventoryMetrics {
  beginningInventoryValue: number;
  averageInventoryValue: number;
  priorYearOnHandAtCost: number;
}

const EMPTY_SALES_ANALYSIS_INVENTORY_METRICS: SalesAnalysisInventoryMetrics = {
  ...EMPTY_INVENTORY_METRICS,
  beginningInventoryValue: 0,
  averageInventoryValue: 0,
  priorYearOnHandAtCost: 0,
};

interface SalesAnalysisInventoryScopeRow {
  dimensionKey: string;
  storeNumber: number | null;
  master: SkuMasterFields;
}

interface SalesAnalysisInventoryScope {
  metricsByKey: Map<string, SalesAnalysisInventoryMetrics>;
  skuScopeRows: SalesAnalysisInventoryScopeRow[];
}

interface OnOrderMetrics {
  qty: number;
  cost: number;
  unitCost: number | null;
}

const EMPTY_ON_ORDER_METRICS: OnOrderMetrics = {
  qty: 0,
  cost: 0,
  unitCost: null,
};

interface PriorYearSalesMetrics {
  qty: number;
  netSales: number;
  grossProfit: number;
}

const EMPTY_PRIOR_YEAR_SALES_METRICS: PriorYearSalesMetrics = {
  qty: 0,
  netSales: 0,
  grossProfit: 0,
};

function addSalesAnalysisInventoryMetrics(
  out: Map<string, SalesAnalysisInventoryMetrics>,
  key: string,
  unitsOnHand: number,
  onHandAtCost: number,
  beginningInventoryValue: number,
  priorYearOnHandAtCost: number,
  averageInventoryValue?: number | null,
): void {
  const current = out.get(key) ?? { ...EMPTY_SALES_ANALYSIS_INVENTORY_METRICS };
  current.unitsOnHand += unitsOnHand;
  current.onHandAtCost += onHandAtCost;
  current.beginningInventoryValue += beginningInventoryValue;
  current.priorYearOnHandAtCost += priorYearOnHandAtCost;
  if (averageInventoryValue != null) {
    current.averageInventoryValue += averageInventoryValue;
  } else {
    current.averageInventoryValue = (current.beginningInventoryValue + current.onHandAtCost) / 2;
  }
  current.inventoryUnitCost =
    current.unitsOnHand > 0 ? current.onHandAtCost / current.unitsOnHand : null;
  out.set(key, current);
}

function addPriorYearSalesMetrics(
  out: Map<string, PriorYearSalesMetrics>,
  key: string,
  qty: number,
  netSales: number,
  grossProfit: number,
): void {
  const current = out.get(key) ?? { ...EMPTY_PRIOR_YEAR_SALES_METRICS };
  current.qty += qty;
  current.netSales += netSales;
  current.grossProfit += grossProfit;
  out.set(key, current);
}

function lineCogs(line: Pick<TicketLine, 'cost' | 'qty' | 'cogsAmount'>): number {
  return line.cogsAmount ?? line.cost * line.qty;
}

function priorYearPctChange(current: number, prior: number | null): number | null {
  if (prior == null) return null;
  if (prior === 0) return 0;
  return round1(((current - prior) / prior) * 100);
}

function addOnOrderMetrics(
  out: Map<string, OnOrderMetrics>,
  key: string,
  qty: number,
  cost: number,
): void {
  if (qty <= 0) return;
  const current = out.get(key) ?? { ...EMPTY_ON_ORDER_METRICS };
  current.qty += qty;
  current.cost += cost;
  current.unitCost = current.qty > 0 ? current.cost / current.qty : null;
  out.set(key, current);
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
const REPORT_TIME_ZONE = 'America/Tegucigalpa';

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
      extraWheres.push(`h.store_id = ANY($${sqlParams.length}::int[])`);
    }
    // includeUnposted: the MDB-era "posted='Y'" flag (posted to inventory) has no
    // direct equivalent in the app-owned surface. status='completed' is the closest
    // analog and is already enforced unconditionally below; the param is preserved
    // for caller compatibility but is currently a no-op.
    void includeUnposted;
    const extraClause = extraWheres.length ? ' AND ' + extraWheres.join(' AND ') : '';

    // Migrated 2026-04-25 from rics_mirror.ticket_header/ticket_detail (retired) to
    // the app-owned sales-history surface. Field semantics:
    //   - extension     ← sales_history_ticket_line.net_amount  (line dollars, post-discount)
    //   - perks         → 0 (the legacy RICS perks column was not carried over)
    //   - posted        ← (status = 'completed') — the "trans_type=1 AND voided=false"
    //                     filter from the MDBs is approximated by status='completed'
    //   - category      ← category_key parsed as int (RICS used 3-digit numeric codes)
    //   - vendor        ← brand_key (the new app-owned vendor surface)
    //   - returnCode    ← return_code parsed as int with default 0
    const startBoundary = `($1::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`;
    const endBoundary = `($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`;
    const sql = `SELECT
  h.store_id     AS "H_Store",
  h.ticket_number AS "H_Ticket",
  to_char(h.purchased_at AT TIME ZONE '${REPORT_TIME_ZONE}', 'YYYY-MM-DD"T"HH24:MI:SS') AS "H_RealDate",
  h.cashier_code AS "H_Cashier",
  CASE WHEN h.status = 'completed' THEN 'Y' ELSE 'N' END AS "H_Posted",
  COALESCE(NULLIF(BTRIM(d.sku_code), ''), s.code, s.provisional_code) AS "D_SKU",
  d.column_label  AS "D_Column",
  d.row_label     AS "D_Row",
  d.quantity      AS "D_Qty",
  d.net_amount::float8 AS "D_Extension",
  0::float8       AS "D_Perks",
  d.salesperson_code   AS "D_SalesPerson",
  COALESCE(
    CASE WHEN d.category_key ~ '^[0-9]+$' THEN d.category_key::int ELSE NULL END,
    s.category_number
  ) AS "D_Category",
  COALESCE(NULLIF(BTRIM(d.brand_key), ''), s.vendor_id) AS "D_Vendor",
  COALESCE(d.unit_cost, s.current_cost)::float8 AS "D_Cost",
  CASE WHEN d.return_code ~ '^[0-9]+$' THEN d.return_code::int ELSE 0 END AS "D_ReturnCode",
  d.unit_price::float8 AS "D_RealPrice"
FROM app.sales_history_ticket h
INNER JOIN app.sales_history_ticket_line d ON d.ticket_id = h.id
LEFT JOIN app.sku s ON s.id = d.sku_id
WHERE
  h.purchased_at >= ${startBoundary}
  AND h.purchased_at <  ${endBoundary}
  AND h.status = 'completed'${extraClause}
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
      cogsAmount: Number(r.D_Cost ?? 0) * Number(r.D_Qty ?? 0),
      returnCode: Number(r.D_ReturnCode ?? 0),
      posted: (r.H_Posted ?? '').trim().toUpperCase() === 'Y',
    }));
  });
}

interface RawSalesAnalysisAggregateRow {
  H_Store: number | null;
  D_SKU: string | null;
  D_Category: number | null;
  D_Vendor: string | null;
  D_PriceBucket: string | null;
  D_Qty: number | null;
  D_Extension: number | null;
  D_Cogs: number | null;
}

/**
 * Sales Analysis can scan more than a million imported ticket lines for a
 * 12-month run. Aggregate in Postgres first so the report is not affected by
 * the defensive MAX_TICKET_ROWS cap used by detail-style report loaders.
 */
async function loadSalesAnalysisAggregateLines(params: {
  startDate: string;
  endDate: string;
  storeNumbers?: number[];
  categoryNumbers?: number[];
  vendorCodes?: string[];
  skuCodes?: string[];
}): Promise<TicketLine[]> {
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  const endExclusive = addDays(endDate, 1);
  const cacheKey = `sr:salesAnalysisAggregateLines:${JSON.stringify({
    startDate,
    endDate,
    stores: normalizedNumberList(params.storeNumbers),
    categories: normalizedNumberList(params.categoryNumbers),
    vendors: normalizedStringList(params.vendorCodes),
    skus: normalizedStringList(params.skuCodes),
  })}`;

  return cachedAsync(cacheKey, 600_000, async () => {
    const sqlParams: unknown[] = [startDate, endExclusive];
    const extraWheres: string[] = [];
    if (params.storeNumbers && params.storeNumbers.length > 0) {
      sqlParams.push(params.storeNumbers.map((n) => Number(n)));
      extraWheres.push(`h.store_id = ANY($${sqlParams.length}::int[])`);
    }
    if (params.categoryNumbers && params.categoryNumbers.length > 0) {
      sqlParams.push(params.categoryNumbers.map((n) => Number(n)));
      extraWheres.push(`COALESCE(
        CASE WHEN d.category_key ~ '^[0-9]+$' THEN d.category_key::int ELSE NULL END,
        s.category_number
      ) = ANY($${sqlParams.length}::int[])`);
    }
    if (params.vendorCodes && params.vendorCodes.length > 0) {
      sqlParams.push(params.vendorCodes.map((code) => code.trim().toUpperCase()).filter(Boolean));
      extraWheres.push(`UPPER(BTRIM(COALESCE(NULLIF(BTRIM(d.brand_key), ''), s.vendor_id))) = ANY($${sqlParams.length}::text[])`);
    }
    if (params.skuCodes && params.skuCodes.length > 0) {
      sqlParams.push(params.skuCodes.map((sku) => sku.trim().toUpperCase()).filter(Boolean));
      extraWheres.push(`UPPER(BTRIM(COALESCE(NULLIF(BTRIM(d.sku_code), ''), s.code, s.provisional_code))) = ANY($${sqlParams.length}::text[])`);
    }
    const extraClause = extraWheres.length ? ' AND ' + extraWheres.join(' AND ') : '';
    const startBoundary = `($1::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`;
    const endBoundary = `($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`;
    const unitPriceBucket = `
      CASE
        WHEN COALESCE(d.quantity, 0) = 0 THEN '(zero-qty)'
        ELSE CONCAT(
          (FLOOR(ABS(COALESCE(d.net_amount, 0) / NULLIF(d.quantity, 0)) / 25) * 25)::int,
          '-',
          ((FLOOR(ABS(COALESCE(d.net_amount, 0) / NULLIF(d.quantity, 0)) / 25) + 1) * 25)::int
        )
      END`;

    const sql = `
WITH line_scope AS (
  SELECT
    h.store_id AS store_id,
    COALESCE(NULLIF(BTRIM(d.sku_code), ''), s.code, s.provisional_code) AS sku,
    COALESCE(
      CASE WHEN d.category_key ~ '^[0-9]+$' THEN d.category_key::int ELSE NULL END,
      s.category_number
    ) AS category,
    COALESCE(NULLIF(BTRIM(d.brand_key), ''), s.vendor_id) AS vendor,
    ${unitPriceBucket} AS price_bucket,
    COALESCE(d.quantity, 0)::float8 AS qty,
    COALESCE(d.net_amount, 0)::float8 AS extension,
    COALESCE(
      d.cost_amount,
      COALESCE(d.unit_cost, s.current_cost, 0) * COALESCE(d.quantity, 0)
    )::float8 AS cogs
  FROM app.sales_history_ticket h
  INNER JOIN app.sales_history_ticket_line d ON d.ticket_id = h.id
  LEFT JOIN app.sku s ON s.id = d.sku_id
  WHERE
    h.purchased_at >= ${startBoundary}
    AND h.purchased_at < ${endBoundary}
    AND h.status = 'completed'${extraClause}
)
SELECT
  store_id AS "H_Store",
  sku AS "D_SKU",
  category AS "D_Category",
  vendor AS "D_Vendor",
  price_bucket AS "D_PriceBucket",
  SUM(qty)::float8 AS "D_Qty",
  SUM(extension)::float8 AS "D_Extension",
  SUM(cogs)::float8 AS "D_Cogs"
FROM line_scope
GROUP BY 1, 2, 3, 4, 5`;

    const [, raw] = await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL max_parallel_workers_per_gather = 0`),
      prisma.$queryRawUnsafe<RawSalesAnalysisAggregateRow[]>(sql, ...sqlParams),
    ]);
    return raw.map<TicketLine>((r) => {
      const qty = Number(r.D_Qty ?? 0);
      const cogs = Number(r.D_Cogs ?? 0);
      return {
        store: Number(r.H_Store ?? 0),
        ticket: 0,
        date: startDate,
        hour: 0,
        sku: (r.D_SKU ?? '').trim(),
        column: '',
        row: '',
        qty,
        extension: Number(r.D_Extension ?? 0),
        perks: 0,
        salesperson: '',
        category: r.D_Category == null ? null : Number(r.D_Category),
        vendor: r.D_Vendor?.trim() || null,
        cost: qty === 0 ? 0 : cogs / qty,
        cogsAmount: cogs,
        priceBucket: r.D_PriceBucket?.trim() || null,
        returnCode: 0,
        posted: true,
      };
    });
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
      extraWheres.push(`h.store_id = ANY($${sqlParams.length}::int[])`);
    }
    void includeUnposted; // see loadTicketLines — no longer applicable post-migration.
    const extraClause = extraWheres.length ? ' AND ' + extraWheres.join(' AND ') : '';

    // Migrated 2026-04-25 from rics_mirror.ticket_header to app.sales_history_ticket.
    // The 6-column composite identity (user_id|batch_date|terminal|store|ticket|real_date)
    // collapses to the app surface's UUID primary key.
    const startBoundary = `($1::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`;
    const endBoundary = `($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')`;
    const sql = `SELECT
  h.id        AS "TicketId",
  h.store_id  AS "Store",
  h.ticket_number AS "Ticket",
  to_char(h.purchased_at AT TIME ZONE '${REPORT_TIME_ZONE}', 'YYYY-MM-DD"T"HH24:MI:SS') AS "RealDate",
  h.cashier_code AS "Cashier",
  CASE WHEN h.status = 'completed' THEN 'Y' ELSE 'N' END AS "Posted"
FROM app.sales_history_ticket h
WHERE
  h.purchased_at >= ${startBoundary}
  AND h.purchased_at <  ${endBoundary}
  AND h.status = 'completed'${extraClause}`;
    const raw = await prisma.$queryRawUnsafe<RawTicketHeaderFlag[]>(sql, ...sqlParams);
    return raw.map<TicketHeaderFlag>((r) => ({
      store: Number(r.Store ?? 0),
      ticket: Number(r.Ticket ?? 0),
      date: parseMsDateToIso(r.RealDate),
      cashier: (r.Cashier ?? '').trim(),
      posted: (r.Posted ?? '').trim().toUpperCase() === 'Y',
      key: r.TicketId ?? `${r.Store}|${r.Ticket}|${r.RealDate}`,
    }));
  });
}

// ══════════════════════════════════════════════════════════════════════════
// Public API — Phase 1 reports
// ══════════════════════════════════════════════════════════════════════════

// ─────────────────────────── Sales by Day (RICS p. 52) ────────────────────

interface DailyStoreSales {
  netSales: number;
  profit: number;
}

/**
 * Aggregate net sales + profit by local-day and store, sourced from the
 * app-owned imported sales history ticket header totals. Sales by Day is a
 * ticket-level RICS report: header `net_amount` includes return-only tickets
 * plus discount/coupon effects that are intentionally not present as normal
 * merchandise rows in `sales_history_ticket_line`.
 *
 * Day boundaries are bucketed in store-local time (`America/Tegucigalpa`) to
 * match the rest of the new sales adapters. `includeUnposted=false` mirrors the
 * legacy `Posted='Y'` filter via `status='completed'`; otherwise we exclude
 * only `cancelled` rows.
 *
 * Returns a nested map: date (YYYY-MM-DD) → store_id → { netSales, profit }.
 * Callers resolve "all stores" before reaching this loader so the SQL always
 * receives an explicit store list.
 */
async function loadDailySalesByStores(params: {
  storeNumbers: number[];
  startDate: string;
  endDate: string;
  includeUnposted?: boolean;
}): Promise<Map<string, Map<number, DailyStoreSales>>> {
  const out = new Map<string, Map<number, DailyStoreSales>>();
  if (!params.storeNumbers || params.storeNumbers.length === 0) return out;

  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  const endExclusive = addDays(endDate, 1);
  const includeUnposted = params.includeUnposted !== false;
  const storeKey = [...params.storeNumbers].map((n) => Number(n)).sort((a, b) => a - b).join(',');

  const cacheKey = `sr:dailyNet:v3:${storeKey}:${startDate}:${endDate}:${includeUnposted}`;
  return cachedAsync(cacheKey, 600_000, async () => {
    const startBoundary = `($1::date::timestamp AT TIME ZONE 'America/Tegucigalpa')`;
    const endBoundary = `($2::date::timestamp AT TIME ZONE 'America/Tegucigalpa')`;
    const statusClause = includeUnposted
      ? `AND t.status <> 'cancelled'`
      : `AND t.status = 'completed'`;
    const sql = `
      SELECT
        to_char(t.purchased_at AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD') AS d,
        t.store_id::int AS store,
        SUM(COALESCE(t.net_amount, 0))::float8 AS net_sales,
        SUM(COALESCE(t.net_amount, 0) - COALESCE(t.cost_amount, 0))::float8 AS profit
      FROM app.sales_history_ticket t
      WHERE
        t.purchased_at >= ${startBoundary}
        AND t.purchased_at <  ${endBoundary}
        AND t.store_id = ANY($3::int[])
        ${statusClause}
      GROUP BY
        to_char(t.purchased_at AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD'),
        t.store_id
    `;
    const rows = await prisma.$queryRawUnsafe<
      { d: string | null; store: number | null; net_sales: number | null; profit: number | null }[]
    >(
      sql,
      startDate,
      endExclusive,
      params.storeNumbers.map((n) => Number(n)),
    );
    const map = new Map<string, Map<number, DailyStoreSales>>();
    for (const r of rows) {
      if (!r.d || r.store == null) continue;
      let perStore = map.get(r.d);
      if (!perStore) {
        perStore = new Map<number, DailyStoreSales>();
        map.set(r.d, perStore);
      }
      perStore.set(Number(r.store), {
        netSales: Number(r.net_sales ?? 0),
        profit: Number(r.profit ?? 0),
      });
    }
    return map;
  });
}

/**
 * RICS Sales by Day by Store report. Multi-store-aware: pass an explicit
 * `storeNumbers` list, or an empty list for all stores, and `combineStores`
 * flag. Output always carries per-store breakdowns; when `combineStores=true`,
 * an additional summed `combined` block is included so the UI can render either
 * layout off one payload.
 *
 * Note: this report keeps the `Posted='Y'` filter (unlike the other reports,
 * which default to Live mode including unposted) because it historically
 * reflected what the fiscal-close process had committed.
 */
export async function getSalesByDay(params: {
  storeNumbers: number[];
  startDate: string;
  endDate: string;
  comparisonOffsetDays?: number;
  combineStores?: boolean;
  criteria?: SalesAnalysisCriteria;
}): Promise<RicsSalesByDayByStoreReport> {
  const comparisonOffsetDays = params.comparisonOffsetDays ?? 364;
  const combineStores = params.combineStores === true;
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  if (startDate > endDate) {
    throw new Error('startDate must be <= endDate');
  }

  const resolvedStoreNumbers = await resolveStoreNumbersForCriteria(
    (params.storeNumbers ?? [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0),
    params.criteria,
  );
  const storeFilterActive = resolvedStoreNumbers !== undefined;
  let storeNumbers = resolvedStoreNumbers ?? [];

  const comparisonStartDate = addDays(startDate, -comparisonOffsetDays);
  const comparisonEndDate = addDays(endDate, -comparisonOffsetDays);

  const storeMap = await loadStoreMap();

  if (storeNumbers.length === 0 && !storeFilterActive) {
    storeNumbers = [...storeMap.keys()].sort((a, b) => a - b);
  }

  const productCriteriaActive = hasProductCriteria(params.criteria);
  const [current, compare] = productCriteriaActive
    ? await Promise.all([
        loadTicketLines({
          storeNumbers,
          startDate,
          endDate,
          includeUnposted: false,
        }).then((lines) => filterTicketLinesByCriteria(lines, params.criteria)).then(aggregateDailySalesFromLines),
        loadTicketLines({
          storeNumbers,
          startDate: comparisonStartDate,
          endDate: comparisonEndDate,
          includeUnposted: false,
        }).then((lines) => filterTicketLinesByCriteria(lines, params.criteria)).then(aggregateDailySalesFromLines),
      ])
    : await Promise.all([
        loadDailySalesByStores({
          storeNumbers,
          startDate,
          endDate,
          includeUnposted: false,       // legacy contract: Posted='Y' only
        }),
        loadDailySalesByStores({
          storeNumbers,
          startDate: comparisonStartDate,
          endDate: comparisonEndDate,
          includeUnposted: false,
        }),
      ]);

  const days = listDatesInclusive(startDate, endDate);

  const buildRowsForStore = (storeNumber: number): RicsSalesByDayRow[] =>
    days.map((date) => {
      const comparedToDate = addDays(date, -comparisonOffsetDays);
      const cur = current.get(date)?.get(storeNumber);
      const cmp = compare.get(comparedToDate)?.get(storeNumber);
      const netSales = round2(cur?.netSales ?? 0);
      const profit = round2(cur?.profit ?? 0);
      const comparedNetSales = round2(cmp?.netSales ?? 0);
      const comparedProfit = round2(cmp?.profit ?? 0);
      const dollarChange = round2(netSales - comparedNetSales);
      const profitChange = round2(profit - comparedProfit);
      const pctChange = comparedNetSales === 0 ? null : round1((dollarChange / comparedNetSales) * 100);
      return {
        date,
        dayName: weekdayName(date),
        netSales,
        profit,
        comparedToDate,
        comparedNetSales,
        comparedProfit,
        dollarChange,
        profitChange,
        pctChange,
      };
    });

  const storeBreakdowns: RicsSalesByDayByStoreReport['storeBreakdowns'] = storeNumbers.map((storeNumber) => {
    const storeName = storeMap.get(storeNumber)?.name ?? null;
    const storeLabel = storeName ? `${storeNumber} - ${storeName}` : `${storeNumber}`;
    const rows = buildRowsForStore(storeNumber);
    return {
      storeNumber,
      storeName,
      storeLabel,
      rows,
      totals: buildTotals(rows),
    };
  });

  let combined: RicsSalesByDayByStoreReport['combined'] = null;
  if (combineStores) {
    const combinedRows: RicsSalesByDayRow[] = days.map((date) => {
      const comparedToDate = addDays(date, -comparisonOffsetDays);
      let netSales = 0, profit = 0, comparedNetSales = 0, comparedProfit = 0;
      const curForDate = current.get(date);
      const cmpForDate = compare.get(comparedToDate);
      for (const storeNumber of storeNumbers) {
        const cur = curForDate?.get(storeNumber);
        const cmp = cmpForDate?.get(storeNumber);
        if (cur) { netSales += cur.netSales; profit += cur.profit; }
        if (cmp) { comparedNetSales += cmp.netSales; comparedProfit += cmp.profit; }
      }
      netSales = round2(netSales);
      profit = round2(profit);
      comparedNetSales = round2(comparedNetSales);
      comparedProfit = round2(comparedProfit);
      const dollarChange = round2(netSales - comparedNetSales);
      const profitChange = round2(profit - comparedProfit);
      const pctChange = comparedNetSales === 0 ? null : round1((dollarChange / comparedNetSales) * 100);
      return {
        date,
        dayName: weekdayName(date),
        netSales,
        profit,
        comparedToDate,
        comparedNetSales,
        comparedProfit,
        dollarChange,
        profitChange,
        pctChange,
      };
    });
    combined = {
      storeLabel: `Combined (${storeNumbers.length} store${storeNumbers.length === 1 ? '' : 's'})`,
      rows: combinedRows,
      totals: buildTotals(combinedRows),
    };
  }

  return {
    storeNumbers,
    combineStores,
    startDate,
    endDate,
    comparisonOffsetDays,
    comparisonStartDate,
    comparisonEndDate,
    storeBreakdowns,
    combined,
  };
}

function buildTotals(rows: RicsSalesByDayRow[]): RicsSalesTotals {
  const netSales = round2(rows.reduce((s, r) => s + r.netSales, 0));
  const profit = round2(rows.reduce((s, r) => s + r.profit, 0));
  const comparedNetSales = round2(rows.reduce((s, r) => s + r.comparedNetSales, 0));
  const comparedProfit = round2(rows.reduce((s, r) => s + r.comparedProfit, 0));
  const dollarChange = round2(netSales - comparedNetSales);
  const profitChange = round2(profit - comparedProfit);
  const pctChange = comparedNetSales === 0 ? null : round1((dollarChange / comparedNetSales) * 100);
  return { netSales, profit, comparedNetSales, comparedProfit, dollarChange, profitChange, pctChange };
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
  criteria?: SalesAnalysisCriteria;
}): Promise<SalesByTimeReport> {
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  const resolvedStoreNumbers = await resolveStoreNumbersForCriteria(params.storeNumbers ?? [], params.criteria);
  const storeNumbers = resolvedStoreNumbers ?? [];
  const storeFilterActive = resolvedStoreNumbers !== undefined;

  const rangeALines = storeFilterActive && storeNumbers.length === 0
    ? []
    : await loadTicketLines({
        startDate,
        endDate,
        storeNumbers: storeFilterActive ? storeNumbers : undefined,
      }).then((lines) => filterTicketLinesByCriteria(lines, params.criteria));
  const rangeA = bucketByHour(rangeALines, params.printPctOfTotal ?? false);
  const totalsA = sumHourlyTotals(rangeA);

  let rangeB: HourlyBucket[] | null = null;
  let totalsB: SalesByTimeReport['totalsB'] = null;
  if (params.compareStartDate && params.compareEndDate) {
    const bStart = normalizeDate(params.compareStartDate);
    const bEnd = normalizeDate(params.compareEndDate);
    const lines = storeFilterActive && storeNumbers.length === 0
      ? []
      : await loadTicketLines({
          startDate: bStart,
          endDate: bEnd,
          storeNumbers: storeFilterActive ? storeNumbers : undefined,
        }).then((rows) => filterTicketLinesByCriteria(rows, params.criteria));
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
  criteria?: SalesAnalysisCriteria;
}): Promise<SalesBySkuReport> {
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  const resolvedStoreNumbers = await resolveStoreNumbersForCriteria(params.storeNumbers ?? [], params.criteria);
  const storeNumbers = resolvedStoreNumbers ?? [];
  const storeFilterActive = resolvedStoreNumbers !== undefined;
  const sortBy: SalesBySkuSortBy = params.sortBy ?? 'SKU';
  const includeReturns = params.includeReturns !== false;

  const lines = storeFilterActive && storeNumbers.length === 0
    ? []
    : await loadTicketLines({
        startDate,
        endDate,
        storeNumbers: storeFilterActive ? storeNumbers : undefined,
      }).then((rows) => filterTicketLinesByCriteria(rows, params.criteria));

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
  criteria?: SalesAnalysisCriteria;
}): Promise<SalespersonSummaryReport> {
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  const resolvedStoreNumbers = await resolveStoreNumbersForCriteria(params.storeNumbers ?? [], params.criteria);
  const storeNumbers = resolvedStoreNumbers ?? [];
  const storeFilterActive = resolvedStoreNumbers !== undefined;
  const combineStores = params.combineStores === true;
  const subtotalBy = params.subtotalBy ?? null;
  const wantCashiers = params.cashierSummary === true;

  const [lines, rawHeaders, salespeople, categoryMap, vendorMap] = await Promise.all([
    storeFilterActive && storeNumbers.length === 0
      ? Promise.resolve([] as AnalysisLine[])
      : loadTicketLines({
          startDate,
          endDate,
          storeNumbers: storeFilterActive ? storeNumbers : undefined,
        }).then((rows) => filterTicketLinesByCriteria(rows, params.criteria)),
    wantCashiers
      ? storeFilterActive && storeNumbers.length === 0
        ? Promise.resolve([] as TicketHeaderFlag[])
        : loadTicketHeaders({
            startDate,
            endDate,
            storeNumbers: storeFilterActive ? storeNumbers : undefined,
          })
      : Promise.resolve([] as TicketHeaderFlag[]),
    loadSalespersonMap(),
    subtotalBy === 'DEPARTMENT' ? loadCategoryMap() : Promise.resolve(new Map<number, string>()),
    subtotalBy === 'VENDOR' ? loadVendorMap() : Promise.resolve(new Map<string, string>()),
  ]);
  const headerKeys = hasProductCriteria(params.criteria)
    ? new Set(lines.map((line) => `${line.date}|${line.store}|${line.ticket}`))
    : null;
  const headers = headerKeys
    ? rawHeaders.filter((header) => headerKeys.has(`${header.date}|${header.store}|${header.ticket}`))
    : rawHeaders;

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
      const subLabel = subtotalBy === 'VENDOR'
        ? (l.vendor ? `${l.vendor} - ${vendorMap.get(l.vendor) ?? l.vendor}` : '(none)')
        : l.category != null
          ? `${l.category} - ${categoryMap.get(l.category) ?? l.category}`
          : '(none)';
      let sub = b.subtotals.get(subKey);
      if (!sub) {
        sub = {
          key: subKey,
          label: subLabel,
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
  criteria?: SalesAnalysisCriteria;
}): Promise<BestSellersReport> {
  const resolvedStoreNumbers = await resolveStoreNumbersForCriteria(params.storeNumbers ?? [], params.criteria);
  const storeNumbers = resolvedStoreNumbers ?? [];
  const storeFilterActive = resolvedStoreNumbers !== undefined;
  const combineStores = params.combineStores === true;
  const topN = Math.max(1, Math.min(params.topN ?? 50, 1000));
  const { startDate, endDate } = resolvePeriod(params.period);

  const lines = storeFilterActive && storeNumbers.length === 0
    ? []
    : await loadTicketLines({
        startDate,
        endDate,
        storeNumbers: storeFilterActive ? storeNumbers : undefined,
      }).then((rows) => filterTicketLinesByCriteria(rows, params.criteria));

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
    b.profit += l.extension - lineCogs(l);
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
  /**
   * When true AND reportType=SKU_DETAIL, each row gets an `attributes`
   * object with description / vendor / category-desc / style-color /
   * current price / picture URL (from the in-memory SkuLookupIndex) plus
   * any extended SKU attributes assigned in app.sku_attribute_assignment.
   *
   * Defaults to false to keep the preview-grid response small. The
   * full-screen ReportViewerPage opts in to get the richer payload.
   */
  includeAttributes?: boolean;
  includeOnOrder?: boolean;
}): Promise<SalesAnalysisReport> {
  const { startDate, endDate } = resolveAnalysisWindow(params);

  const parsed: ParsedAnalysisCriteria = {
    stores: parseCriteria(params.criteria.storesRaw),
    categories: parseCriteria(params.criteria.categoriesRaw),
    vendors: parseCriteria(params.criteria.vendorsRaw),
    skus: parseCriteria(params.criteria.skusRaw),
    seasons: parseCriteria(params.criteria.seasonsRaw),
    groups: parseCriteria(params.criteria.groupsRaw),
    styleColor: parseCriteria(params.criteria.styleColorRaw || params.criteria.styleColor),
    keywords: parseCriteria(params.criteria.keywordsRaw),
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

  const needsDepartmentCriteria = !!params.criteria.departments?.length || !!params.criteria.sectors?.length;
  const [criteriaStoreChainByStore, criteriaDeptMap, criteriaSectorMap] = await Promise.all([
    params.criteria.chains?.length ? loadStoreChainByStore() : Promise.resolve(null),
    needsDepartmentCriteria ? loadDepartmentMap() : Promise.resolve(null),
    params.criteria.sectors?.length ? loadSectorMap() : Promise.resolve(null),
  ]);
  const criteriaContext: AnalysisCriteriaContext = {
    storeChainByStore: criteriaStoreChainByStore,
    departments: criteriaDeptMap,
    sectors: criteriaSectorMap,
  };
  const categorySqlPrefilter = salesAnalysisCategorySqlPrefilter(
    params.criteria,
    parsed,
    criteriaDeptMap,
    criteriaSectorMap,
  );

  const lines = await loadSalesAnalysisAggregateLines({
    startDate,
    endDate,
    storeNumbers: filteredStores,
    categoryNumbers: categorySqlPrefilter,
    vendorCodes: params.criteria.vendorsRaw?.trim() ? undefined : params.criteria.vendors,
    skuCodes: params.criteria.skusRaw?.trim() ? undefined : params.criteria.skus,
  });
  const masterBySku = needsSkuMaster(params)
    ? await loadSkuMasterFields(lines.map((l) => l.sku))
    : new Map<string, SkuMasterFields>();
  const analysisLines: AnalysisLine[] = lines.map((line) => {
    const master = line.sku ? masterBySku.get(line.sku.trim().toUpperCase()) ?? null : null;
    return { ...line, master };
  });

  // Apply criteria filters.
  const filtered = analysisLines.filter((l) => applyAnalysisCriteria(l, params.criteria, parsed, criteriaContext));

  // Row grain is driven by `reportType`:
  //   SKU_DETAIL           → one row per SKU
  //   CATEGORY_SUMMARY     → one row per category (denorm on TicketDetail)
  //   DEPT_SUMMARY         → one row per department (category → dept)
  //   VENDOR_SUMMARY       → one row per vendor (denorm on TicketDetail)
  //   PRICE_POINT_SUMMARY  → one row per $25 price bucket
  //   SEASON/GROUP/STYLE   → one row per app.sku master field
  //   SECTOR_SUMMARY       → one row per sector (category → dept → sector)
  //
  // `dimension` (analyze-by) is retained for future hierarchical grouping; it
  // does not change row grain today.
  const combine = params.storeOption === 'COMBINE';
  const deptMap = needsDepartmentMap(params.reportType) ? await loadDepartmentMap() : null;
  const sectorMap = params.reportType === 'SECTOR_SUMMARY' ? await loadSectorMap() : null;

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
    const dimKey = rowGrainKey(l, params.reportType, deptMap, sectorMap);
    if (!dimKey) continue;
    const storeKey = combine ? null : l.store;
    const mapKey = `${dimKey}|${storeKey ?? '*'}`;
    let b = buckets.get(mapKey);
    if (!b) {
      b = {
        dimensionKey: dimKey,
        dimensionLabel: dimLabelFor(dimKey, params.reportType, deptMap, sectorMap),
        storeNumber: storeKey,
        qty: 0,
        netSales: 0,
        cogs: 0,
      };
      buckets.set(mapKey, b);
    }
    b.qty += l.qty;
    b.netSales += l.extension;
    b.cogs += lineCogs(l);
  }

  // Prior year sales (optional). RICS prints Qty, Sales, Sales % Chg,
  // Profit, and Profit % Chg for the matching prior-year window.
  let priorYearByDimStore: Map<string, PriorYearSalesMetrics> | null = null;
  if (params.printing.priorYear) {
    const pyStart = addYears(startDate, -1);
    const pyEnd = addYears(endDate, -1);
    const pyLines = await loadSalesAnalysisAggregateLines({
      startDate: pyStart,
      endDate: pyEnd,
      storeNumbers: filteredStores,
      categoryNumbers: categorySqlPrefilter,
      vendorCodes: params.criteria.vendorsRaw?.trim() ? undefined : params.criteria.vendors,
      skuCodes: params.criteria.skusRaw?.trim() ? undefined : params.criteria.skus,
    });
    const pyMasterBySku = needsSkuMaster(params)
      ? await loadSkuMasterFields(pyLines.map((l) => l.sku))
      : new Map<string, SkuMasterFields>();
    priorYearByDimStore = new Map();
    for (const l of pyLines) {
      const pyLine: AnalysisLine = {
        ...l,
        master: l.sku ? pyMasterBySku.get(l.sku.trim().toUpperCase()) ?? null : null,
      };
      if (!applyAnalysisCriteria(pyLine, params.criteria, parsed, criteriaContext)) continue;
      const dimKey = rowGrainKey(pyLine, params.reportType, deptMap, sectorMap);
      if (!dimKey) continue;
      const storeKey = combine ? null : pyLine.store;
      const mapKey = `${dimKey}|${storeKey ?? '*'}`;
      addPriorYearSalesMetrics(
        priorYearByDimStore,
        mapKey,
        pyLine.qty,
        pyLine.extension,
        pyLine.extension - lineCogs(pyLine),
      );
    }
  }

  const periodDays =
    Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
    ) + 1;
  const inventoryActivityMonthSlot = salesAnalysisActivityMonthSlot(startDate, endDate);
  const fullMonthWindow = salesAnalysisFullMonthWindow(startDate, endDate);
  const useAverageInventoryForTurnsRoi =
    !!fullMonthWindow || useMonthlyAverageInventoryForSalesAnalysis(params.printing, startDate, endDate);
  const turnsRoiAnnualizer =
    fullMonthWindow
      ? 12 / fullMonthWindow.monthCount
      : salesAnalysisTurnsRoiAnnualizer(params.printing, startDate, endDate, periodDays);
  const effectiveTurnsRoiAnnualizer = turnsRoiAnnualizer ?? (periodDays > 0 ? 365 / periodDays : 0);
  const shouldSeedSkuRows = params.reportType === 'SKU_DETAIL' && shouldSeedSkuMasterRows(params.criteria);
  const skuInventoryFilter = params.reportType === 'SKU_DETAIL' && !shouldSeedSkuRows
    ? Array.from(new Set([...buckets.values()].map((bucket) => bucket.dimensionKey)))
    : undefined;
  const inventoryScope = await loadSalesAnalysisInventoryScope({
    reportType: params.reportType,
    storeOption: params.storeOption,
    criteria: params.criteria,
    parsed,
    context: criteriaContext,
    filteredStores,
    deptMap,
    sectorMap,
    activityMonthSlot: inventoryActivityMonthSlot,
    averageInventoryMonths: fullMonthWindow,
    categoryPrefilter: categorySqlPrefilter,
    skuFilter: skuInventoryFilter,
  });
  const inventoryLookup = inventoryScope.metricsByKey;
  const storeChainByStore = combine ? new Map<number, { code: string; label: string }>() : await loadStoreChainByStore();

  if (shouldSeedSkuRows) {
    for (const scopeRow of inventoryScope.skuScopeRows) {
      const mapKey = `${scopeRow.dimensionKey}|${scopeRow.storeNumber ?? '*'}`;
      if (!buckets.has(mapKey)) {
        buckets.set(mapKey, {
          dimensionKey: scopeRow.dimensionKey,
          dimensionLabel: null,
          storeNumber: scopeRow.storeNumber,
          qty: 0,
          netSales: 0,
          cogs: 0,
        });
      }
    }
  }

  const onOrderLookup = params.includeOnOrder && params.reportType === 'SKU_DETAIL'
    ? await loadOpenPurchaseOrdersBySku([...buckets.values()].map((b) => b.dimensionKey))
    : new Map<string, OnOrderMetrics>();

  // Default sort: by dimensionKey (numeric-aware). For DEPT_SUMMARY /
  // CATEGORY_SUMMARY this gives numeric ascending; for VENDOR_SUMMARY /
  // SKU_DETAIL it gives alphanumeric ascending. Users can still re-sort
  // interactively via Ant's column headers.
  const rows: SalesAnalysisRow[] = [...buckets.values()]
    .map((b) => {
      const grossProfit = b.netSales - b.cogs;
      const mapKey = `${b.dimensionKey}|${b.storeNumber ?? '*'}`;
      const priorYear = priorYearByDimStore?.get(mapKey) ?? null;
      const priorYearQty = params.printing.priorYear ? priorYear?.qty ?? 0 : null;
      const priorYearNetSales = params.printing.priorYear ? priorYear?.netSales ?? 0 : null;
      const priorYearGrossProfit = params.printing.priorYear ? priorYear?.grossProfit ?? 0 : null;

      const onHandKey =
        params.storeOption === 'COMBINE'
          ? b.dimensionKey
          : `${b.dimensionKey}|${b.storeNumber}`;
      const inventory = inventoryLookup.get(onHandKey) ?? EMPTY_SALES_ANALYSIS_INVENTORY_METRICS;
      const onHandAtCost = inventory.onHandAtCost;
      const priorYearOnHandAtCost = params.printing.priorYear ? inventory.priorYearOnHandAtCost : null;
      const inventoryValueForTurnsRoi = inventoryValueForSalesAnalysisTurnsRoi(
        inventory,
        useAverageInventoryForTurnsRoi,
      );
      const storeChain = b.storeNumber != null ? storeChainByStore.get(b.storeNumber) ?? null : null;
      const onOrderKey =
        params.storeOption === 'COMBINE'
          ? `${b.dimensionKey}|*`
          : `${b.dimensionKey}|${b.storeNumber}`;
      const onOrder = onOrderLookup.get(onOrderKey) ?? EMPTY_ON_ORDER_METRICS;

      const metrics = computeRoiTurnsGp({
        netSales: b.netSales,
        cogs: b.cogs,
        grossProfit,
        onHandAtCost,
        periodDays,
        inventoryValueForTurnsRoi,
        annualizer: effectiveTurnsRoiAnnualizer,
      });

      return {
        dimensionKey: b.dimensionKey,
        dimensionLabel: b.dimensionLabel,
        storeNumber: b.storeNumber,
        storeChainCode: storeChain?.code ?? null,
        storeChainLabel: storeChain?.label ?? null,
        qty: b.qty,
        netSales: round2(b.netSales),
        cogs: round2(b.cogs),
        grossProfit: round2(grossProfit),
        gpPct: metrics.gpPct,
        unitsOnHand: round2(inventory.unitsOnHand),
        inventoryUnitCost: inventory.inventoryUnitCost != null
          ? round2(inventory.inventoryUnitCost)
          : null,
        onHandAtCost: round2(onHandAtCost),
        turnsRoiInventoryValue: round2(inventoryValueForTurnsRoi),
        turns: metrics.turns,
        roiPct: metrics.roiPct,
        ...(params.includeOnOrder
          ? {
              onOrderQty: round2(onOrder.qty),
              onOrderUnitCost: onOrder.unitCost != null ? round2(onOrder.unitCost) : null,
              onOrderCost: round2(onOrder.cost),
            }
          : {}),
        priorYearQty,
        priorYearNetSales: priorYearNetSales != null ? round2(priorYearNetSales) : null,
        pyPctChange: priorYearPctChange(b.netSales, priorYearNetSales),
        priorYearGrossProfit: priorYearGrossProfit != null ? round2(priorYearGrossProfit) : null,
        pyGrossProfitPctChange: priorYearPctChange(grossProfit, priorYearGrossProfit),
        priorYearOnHandAtCost: priorYearOnHandAtCost != null ? round2(priorYearOnHandAtCost) : null,
        pyOnHandPctChange: priorYearPctChange(onHandAtCost, priorYearOnHandAtCost),
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
  const totalUnitsOnHand = rows.reduce((s, r) => s + r.unitsOnHand, 0);
  const totalOnHandAtCost = rows.reduce((s, r) => s + r.onHandAtCost, 0);
  const totalInventoryValueForTurnsRoi = rows.reduce((sum, row) => {
    const key = params.storeOption === 'COMBINE'
      ? row.dimensionKey
      : `${row.dimensionKey}|${row.storeNumber}`;
    const inventory = inventoryLookup.get(key) ?? EMPTY_SALES_ANALYSIS_INVENTORY_METRICS;
    return sum + inventoryValueForSalesAnalysisTurnsRoi(inventory, useAverageInventoryForTurnsRoi);
  }, 0);
  const totalOnOrderQty = rows.reduce((s, r) => s + (r.onOrderQty ?? 0), 0);
  const totalOnOrderCost = rows.reduce((s, r) => s + (r.onOrderCost ?? 0), 0);
  const totalPriorYearQty = params.printing.priorYear
    ? rows.reduce((s, r) => s + (r.priorYearQty ?? 0), 0)
    : null;
  const totalPriorYearNetSales = params.printing.priorYear
    ? rows.reduce((s, r) => s + (r.priorYearNetSales ?? 0), 0)
    : null;
  const totalPriorYearGrossProfit = params.printing.priorYear
    ? rows.reduce((s, r) => s + (r.priorYearGrossProfit ?? 0), 0)
    : null;
  const totalPriorYearOnHandAtCost = params.printing.priorYear
    ? rows.reduce((s, r) => s + (r.priorYearOnHandAtCost ?? 0), 0)
    : null;
  const totalsMetrics = computeRoiTurnsGp({
    netSales: totalNetSales,
    cogs: totalCogs,
    grossProfit: totalGrossProfit,
    onHandAtCost: totalOnHandAtCost,
    periodDays,
    inventoryValueForTurnsRoi: totalInventoryValueForTurnsRoi,
    annualizer: effectiveTurnsRoiAnnualizer,
  });
  const totals = {
    qty: rows.reduce((s, r) => s + r.qty, 0),
    netSales: round2(totalNetSales),
    cogs: round2(totalCogs),
    grossProfit: round2(totalGrossProfit),
    unitsOnHand: round2(totalUnitsOnHand),
    inventoryUnitCost: totalUnitsOnHand > 0
      ? round2(totalOnHandAtCost / totalUnitsOnHand)
      : null,
    onHandAtCost: round2(totalOnHandAtCost),
    gpPct: totalsMetrics.gpPct,
    turns: totalsMetrics.turns,
    roiPct: totalsMetrics.roiPct,
    ...(params.includeOnOrder
      ? {
          onOrderQty: round2(totalOnOrderQty),
          onOrderUnitCost: totalOnOrderQty > 0 ? round2(totalOnOrderCost / totalOnOrderQty) : null,
          onOrderCost: round2(totalOnOrderCost),
        }
      : {}),
    priorYearQty: totalPriorYearQty,
    priorYearNetSales: totalPriorYearNetSales != null ? round2(totalPriorYearNetSales) : null,
    pyPctChange: priorYearPctChange(totalNetSales, totalPriorYearNetSales),
    priorYearGrossProfit: totalPriorYearGrossProfit != null ? round2(totalPriorYearGrossProfit) : null,
    pyGrossProfitPctChange: priorYearPctChange(totalGrossProfit, totalPriorYearGrossProfit),
    priorYearOnHandAtCost: totalPriorYearOnHandAtCost != null ? round2(totalPriorYearOnHandAtCost) : null,
    pyOnHandPctChange: priorYearPctChange(totalOnHandAtCost, totalPriorYearOnHandAtCost),
  };

  // Optional per-SKU enrichment for SKU_DETAIL runs — only attached when the
  // caller asks via includeAttributes=true (the viewer opts in; the inline
  // builder preview does not, to keep payloads small).
  let attributeDimensions: SalesAnalysisAttributeDimension[] | undefined;
  if (params.includeAttributes && params.reportType === 'SKU_DETAIL' && rows.length > 0) {
    const skuCodes = rows.map((r) => r.dimensionKey);
    const ageStoreNumbers = params.storeOption === 'COMBINE'
      ? filteredStores
      : Array.from(new Set(rows.map((r) => r.storeNumber).filter((n): n is number => n != null)));
    const [attrsBySku, attributeLoad] = await Promise.all([
      loadSkuAttributesBySku(skuCodes, {
        storeNumbers: ageStoreNumbers,
        reportEndDate: endDate,
      }),
      loadSkuAttributeAssignmentsBySku(skuCodes),
    ]);
    attributeDimensions = attributeLoad.dimensions;
    for (const row of rows) {
      const skuKey = row.dimensionKey.trim().toUpperCase();
      const attrs = attrsBySku.get(skuKey);
      if (attrs) row.attributes = attrs;
      const assignments = attributeLoad.assignmentsBySku.get(skuKey);
      if (assignments) row.attributeAssignments = assignments;
    }
  }

  return {
    dimension: params.dimension,
    reportType: params.reportType,
    storeOption: params.storeOption,
    criteria: params.criteria,
    printing: params.printing,
    rows,
    totals,
    periodDays,
    turnsRoiAnnualizer: round2(effectiveTurnsRoiAnnualizer),
    ...(attributeDimensions ? { attributeDimensions } : {}),
  };
}

// ─────────────────────────── Sales Hierarchy Drill-Down ───────────────────
//
// Same criteria surface as `getSalesAnalysis`, but the output is a nested
// tree (Store? → Department → Category → SKU) instead of a flat row list.
// Ticket lines feed all three row grains at once — one pass, one cache hit.
// On-hand at cost is loaded at SKU grain and rolled up; prior-year uses the
// same calendar window one year earlier.

export async function getSalesHierarchy(params: {
  storeOption: SalesHierarchyStoreOption;
  criteria: SalesAnalysisCriteria;
  startDate: string;
  endDate: string;
  priorYear?: boolean;
  includeAttributes?: boolean;
}): Promise<SalesHierarchyReport> {
  const startDate = normalizeDate(params.startDate);
  const endDate = normalizeDate(params.endDate);
  const combine = params.storeOption === 'COMBINE';

  const parsed: ParsedAnalysisCriteria = {
    stores: parseCriteria(params.criteria.storesRaw),
    categories: parseCriteria(params.criteria.categoriesRaw),
    vendors: parseCriteria(params.criteria.vendorsRaw),
    skus: parseCriteria(params.criteria.skusRaw),
    seasons: parseCriteria(params.criteria.seasonsRaw),
    groups: parseCriteria(params.criteria.groupsRaw),
    styleColor: parseCriteria(params.criteria.styleColorRaw || params.criteria.styleColor),
    keywords: parseCriteria(params.criteria.keywordsRaw),
  };

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

  const [lines, deptMap, categoryList, storeMap] = await Promise.all([
    loadTicketLines({ startDate, endDate, storeNumbers: filteredStores }),
    loadDepartmentMap(),
    loadCategoryList(),
    loadStoreMap(),
  ]);

  const categoryDescByNumber = new Map<number, string>();
  for (const c of categoryList) {
    if (c.desc) categoryDescByNumber.set(c.number, c.desc);
  }
  const [criteriaStoreChainByStore, criteriaSectorMap] = await Promise.all([
    params.criteria.chains?.length ? loadStoreChainByStore() : Promise.resolve(null),
    params.criteria.sectors?.length ? loadSectorMap() : Promise.resolve(null),
  ]);
  const criteriaContext: AnalysisCriteriaContext = {
    storeChainByStore: criteriaStoreChainByStore,
    departments: deptMap,
    sectors: criteriaSectorMap,
  };

  // Bucket ticket lines at SKU grain, tagging each SKU with its (dept, cat)
  // so rollup is a single walk later. Lines with no category map to a
  // synthetic "unmapped" department so the tree still renders them rather
  // than silently dropping rows.
  type SkuBucket = {
    storeNumber: number | null;
    deptKey: string;             // `${deptNum}` or '_unmapped'
    catKey: string;              // `${catNum}` or '_unmapped'
    sku: string;
    qty: number;
    netSales: number;
    cogs: number;
  };
  const skuBuckets = new Map<string, SkuBucket>();

  for (const l of lines) {
    if (!applyAnalysisCriteria(l, params.criteria, parsed, criteriaContext)) continue;
    if (!l.sku) continue;
    const storeNumber = combine ? null : l.store;
    const catNum = l.category ?? null;
    const catKey = catNum != null ? String(catNum) : '_unmapped';
    const deptNum = deptNumberForCategory(catNum, deptMap);
    const deptKey = deptNum != null ? String(deptNum) : '_unmapped';
    const mapKey = `${storeNumber ?? '*'}|${deptKey}|${catKey}|${l.sku}`;
    let b = skuBuckets.get(mapKey);
    if (!b) {
      b = {
        storeNumber,
        deptKey,
        catKey,
        sku: l.sku,
        qty: 0,
        netSales: 0,
        cogs: 0,
      };
      skuBuckets.set(mapKey, b);
    }
    b.qty += l.qty;
    b.netSales += l.extension;
    b.cogs += lineCogs(l);
  }

  // Prior-year netSales at the same SKU grain, using the same calendar
  // window one year earlier to match RICS Sales Analysis.
  let priorYearBySku: Map<string, number> | null = null;
  if (params.priorYear) {
    const pyStart = addYears(startDate, -1);
    const pyEnd = addYears(endDate, -1);
    const pyLines = await loadTicketLines({
      startDate: pyStart,
      endDate: pyEnd,
      storeNumbers: filteredStores,
    });
    priorYearBySku = new Map();
    for (const l of pyLines) {
      if (!applyAnalysisCriteria(l, params.criteria, parsed, criteriaContext)) continue;
      if (!l.sku) continue;
      const storeNumber = combine ? null : l.store;
      const catNum = l.category ?? null;
      const catKey = catNum != null ? String(catNum) : '_unmapped';
      const deptNum = deptNumberForCategory(catNum, deptMap);
      const deptKey = deptNum != null ? String(deptNum) : '_unmapped';
      const mapKey = `${storeNumber ?? '*'}|${deptKey}|${catKey}|${l.sku}`;
      priorYearBySku.set(mapKey, (priorYearBySku.get(mapKey) ?? 0) + l.extension);
    }
  }

  // On-hand at SKU grain, fed by the existing SKU_DETAIL path so we benefit
  // from its 5-min cache + criteria filtering.
  const onHandSkuMap = await getOnHandAtCostByDimension({
    reportType: 'SKU_DETAIL',
    storeOption: params.storeOption === 'SEPARATE' ? 'SEPARATE' : 'COMBINE',
    criteria: params.criteria,
  });
  // Key shape: COMBINE => '<sku>', SEPARATE => '<sku>|<store>'.
  function onHandFor(sku: string, storeNumber: number | null): number {
    const key = storeNumber == null ? sku : `${sku}|${storeNumber}`;
    return onHandSkuMap.get(key) ?? 0;
  }

  // SKU attribute enrichment (description-as-label, etc.) — opt-in.
  const allSkuCodes = Array.from(new Set([...skuBuckets.values()].map((b) => b.sku)));
  const attrsBySku = params.includeAttributes && allSkuCodes.length > 0
    ? await loadSkuAttributesBySku(allSkuCodes)
    : new Map<string, import('./types').SkuAttributeColumns>();

  const periodDays =
    Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
    ) + 1;

  // Build the tree. Intermediate node shape owns its accumulators; we wrap
  // into the public SalesHierarchyNode shape at the end so metrics stay
  // computed from aggregate (net, cogs, onHand) rather than row averages.
  type InternalAgg = {
    qty: number;
    netSales: number;
    cogs: number;
    onHandAtCost: number;
    priorYearNetSales: number;
    priorYearHit: boolean;
  };
  function emptyAgg(): InternalAgg {
    return { qty: 0, netSales: 0, cogs: 0, onHandAtCost: 0, priorYearNetSales: 0, priorYearHit: false };
  }
  function addInto(acc: InternalAgg, src: InternalAgg): void {
    acc.qty += src.qty;
    acc.netSales += src.netSales;
    acc.cogs += src.cogs;
    acc.onHandAtCost += src.onHandAtCost;
    acc.priorYearNetSales += src.priorYearNetSales;
    if (src.priorYearHit) acc.priorYearHit = true;
  }

  type StoreBucket = {
    storeNumber: number | null;
    departments: Map<string, DeptBucket>;
    agg: InternalAgg;
  };
  type DeptBucket = {
    key: string;
    categories: Map<string, CategoryBucket>;
    agg: InternalAgg;
  };
  type CategoryBucket = {
    key: string;
    skus: Map<string, SkuLeaf>;
    agg: InternalAgg;
  };
  type SkuLeaf = {
    sku: string;
    agg: InternalAgg;
  };

  const storeBuckets = new Map<string, StoreBucket>();
  function getStoreBucket(storeNumber: number | null): StoreBucket {
    const k = storeNumber == null ? '*' : String(storeNumber);
    let s = storeBuckets.get(k);
    if (!s) {
      s = { storeNumber, departments: new Map(), agg: emptyAgg() };
      storeBuckets.set(k, s);
    }
    return s;
  }

  for (const b of skuBuckets.values()) {
    const store = getStoreBucket(b.storeNumber);
    let dept = store.departments.get(b.deptKey);
    if (!dept) {
      dept = { key: b.deptKey, categories: new Map(), agg: emptyAgg() };
      store.departments.set(b.deptKey, dept);
    }
    let cat = dept.categories.get(b.catKey);
    if (!cat) {
      cat = { key: b.catKey, skus: new Map(), agg: emptyAgg() };
      dept.categories.set(b.catKey, cat);
    }
    const pyKey = `${b.storeNumber ?? '*'}|${b.deptKey}|${b.catKey}|${b.sku}`;
    const pyValue = priorYearBySku?.get(pyKey);
    const leafAgg: InternalAgg = {
      qty: b.qty,
      netSales: b.netSales,
      cogs: b.cogs,
      onHandAtCost: onHandFor(b.sku, b.storeNumber),
      priorYearNetSales: pyValue ?? 0,
      priorYearHit: pyValue != null,
    };
    cat.skus.set(b.sku, { sku: b.sku, agg: leafAgg });
    addInto(cat.agg, leafAgg);
    addInto(dept.agg, leafAgg);
    addInto(store.agg, leafAgg);
  }

  function finalize(
    level: SalesHierarchyNode['level'],
    key: string,
    label: string,
    storeNumber: number | null,
    agg: InternalAgg,
    children?: SalesHierarchyNode[],
    attributes?: import('./types').SkuAttributeColumns,
  ): SalesHierarchyNode {
    const grossProfit = agg.netSales - agg.cogs;
    const metrics = computeRoiTurnsGp({
      netSales: agg.netSales,
      cogs: agg.cogs,
      grossProfit,
      onHandAtCost: agg.onHandAtCost,
      periodDays,
    });
    const priorYearNetSales = params.priorYear
      ? (agg.priorYearHit ? round2(agg.priorYearNetSales) : null)
      : null;
    const pyPctChange =
      priorYearNetSales == null || priorYearNetSales === 0
        ? null
        : round1(((agg.netSales - priorYearNetSales) / priorYearNetSales) * 100);
    return {
      level,
      key,
      label,
      storeNumber,
      qty: agg.qty,
      netSales: round2(agg.netSales),
      cogs: round2(agg.cogs),
      grossProfit: round2(grossProfit),
      gpPct: metrics.gpPct,
      onHandAtCost: round2(agg.onHandAtCost),
      turns: metrics.turns,
      roiPct: metrics.roiPct,
      priorYearNetSales,
      pyPctChange,
      ...(attributes ? { attributes } : {}),
      ...(children ? { children } : {}),
    };
  }

  function deptLabel(key: string): string {
    if (key === '_unmapped') return '(Unmapped)';
    const d = deptMap.find((r) => String(r.number) === key);
    return d?.desc ? `${key} — ${d.desc}` : `Dept ${key}`;
  }
  function catLabel(key: string): string {
    if (key === '_unmapped') return '(Unmapped)';
    const n = Number(key);
    const desc = Number.isFinite(n) ? categoryDescByNumber.get(n) : undefined;
    return desc ? `${key} — ${desc}` : `Cat ${key}`;
  }
  function skuLabel(sku: string): string {
    const a = attrsBySku.get(sku.trim().toUpperCase());
    return a?.description ? `${sku} — ${a.description}` : sku;
  }
  function storeLabel(num: number): string {
    const s = storeMap.get(num);
    return s?.name ? `${num} — ${s.name}` : `Store ${num}`;
  }

  function buildDept(storeNumber: number | null, d: DeptBucket): SalesHierarchyNode {
    const catNodes = [...d.categories.values()]
      .sort((a, b) => sortKeyCompare(a.key, b.key))
      .map((c) => {
        const skuNodes = [...c.skus.values()]
          .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }))
          .map((s) => finalize(
            'sku',
            s.sku,
            skuLabel(s.sku),
            storeNumber,
            s.agg,
            undefined,
            attrsBySku.get(s.sku.trim().toUpperCase()),
          ));
        return finalize('category', c.key, catLabel(c.key), storeNumber, c.agg, skuNodes);
      });
    return finalize('department', d.key, deptLabel(d.key), storeNumber, d.agg, catNodes);
  }

  const storeList = [...storeBuckets.values()].sort((a, b) => {
    if (a.storeNumber == null) return -1;
    if (b.storeNumber == null) return 1;
    return a.storeNumber - b.storeNumber;
  });

  let roots: SalesHierarchyNode[];
  if (combine) {
    // Single store bucket (storeNumber=null); unwrap to department roots.
    const bucket = storeList[0];
    roots = bucket
      ? [...bucket.departments.values()]
          .sort((a, b) => sortKeyCompare(a.key, b.key))
          .map((d) => buildDept(null, d))
      : [];
  } else {
    roots = storeList.map((store) => {
      const sNum = store.storeNumber ?? 0;
      const deptNodes = [...store.departments.values()]
        .sort((a, b) => sortKeyCompare(a.key, b.key))
        .map((d) => buildDept(store.storeNumber, d));
      return finalize('store', String(sNum), storeLabel(sNum), store.storeNumber, store.agg, deptNodes);
    });
  }

  // Grand totals: aggregate fresh from all store buckets so the metrics line
  // up with what the rolled-up rows compute (aggregate num/denom, not sum of
  // row ratios).
  const grandAgg = emptyAgg();
  for (const s of storeList) addInto(grandAgg, s.agg);
  const grandGp = grandAgg.netSales - grandAgg.cogs;
  const grandMetrics = computeRoiTurnsGp({
    netSales: grandAgg.netSales,
    cogs: grandAgg.cogs,
    grossProfit: grandGp,
    onHandAtCost: grandAgg.onHandAtCost,
    periodDays,
  });

  return {
    storeOption: params.storeOption,
    criteria: params.criteria,
    priorYear: !!params.priorYear,
    startDate,
    endDate,
    periodDays,
    roots,
    totals: {
      qty: grandAgg.qty,
      netSales: round2(grandAgg.netSales),
      cogs: round2(grandAgg.cogs),
      grossProfit: round2(grandGp),
      onHandAtCost: round2(grandAgg.onHandAtCost),
      gpPct: grandMetrics.gpPct,
      turns: grandMetrics.turns,
      roiPct: grandMetrics.roiPct,
      priorYearNetSales: params.priorYear && grandAgg.priorYearHit
        ? round2(grandAgg.priorYearNetSales)
        : null,
    },
  };
}

function sortKeyCompare(a: string, b: string): number {
  // '_unmapped' sinks to the bottom so populated groups are shown first.
  if (a === '_unmapped' && b !== '_unmapped') return 1;
  if (b === '_unmapped' && a !== '_unmapped') return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
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

function structuredKeywordExpression(structured: string[] | undefined): CriteriaExpression {
  const values = (structured ?? []).map((value) => value.trim()).filter(Boolean);
  return {
    raw: values.join(','),
    tokens: values.map((value) => ({ kind: 'literal' as const, value, excluded: false })),
    andMode: false,
    empty: values.length === 0,
  };
}

function keywordFacetKeeps(
  structured: string[] | undefined,
  expr: CriteriaExpression,
  keywords: string | null | undefined,
): boolean {
  const structuredExpr = structuredKeywordExpression(structured);
  const hasStructured = !structuredExpr.empty;
  const grammarIncluded = expr.tokens.some((t) => !t.excluded);
  const grammarExcluded = expr.tokens.some((t) => t.excluded);

  if (!hasStructured && expr.empty) return true;
  if (expr.empty) return matchesKeywords(structuredExpr, keywords);
  if (!hasStructured) return matchesKeywords(expr, keywords);

  const structuredHit = matchesKeywords(structuredExpr, keywords);
  if (grammarIncluded) {
    if (!(structuredHit || matchesKeywords(expr, keywords))) return false;
    if (!grammarExcluded) return true;
    const exOnly: CriteriaExpression = {
      ...expr,
      tokens: expr.tokens.filter((t) => t.excluded),
    };
    return matchesKeywords(exOnly, keywords);
  }

  if (!structuredHit) return false;
  return matchesKeywords(expr, keywords);
}

interface ParsedAnalysisCriteria {
  stores: CriteriaExpression;
  categories: CriteriaExpression;
  vendors: CriteriaExpression;
  skus: CriteriaExpression;
  seasons: CriteriaExpression;
  groups: CriteriaExpression;
  styleColor: CriteriaExpression;
  keywords: CriteriaExpression;
}

function parseAnalysisCriteria(criteria: SalesAnalysisCriteria): ParsedAnalysisCriteria {
  return {
    stores: parseStoreCriteriaExpression(criteria.storesRaw),
    categories: parseCriteria(criteria.categoriesRaw),
    vendors: parseCriteria(criteria.vendorsRaw),
    skus: parseCriteria(criteria.skusRaw),
    seasons: parseCriteria(criteria.seasonsRaw),
    groups: parseCriteria(criteria.groupsRaw),
    styleColor: parseCriteria(criteria.styleColorRaw || criteria.styleColor),
    keywords: parseCriteria(criteria.keywordsRaw),
  };
}

interface AnalysisCriteriaContext {
  storeChainByStore: Map<number, { code: string; label: string }> | null;
  departments: DeptRow[] | null;
  sectors: SectorRow[] | null;
}

function selectedStringKeeps(selected: string[] | undefined, value: string | null | undefined): boolean {
  if (!selected?.length) return true;
  const normalizedValue = value?.trim().toUpperCase();
  if (!normalizedValue) return false;
  return selected.some((candidate) => candidate.trim().toUpperCase() === normalizedValue);
}

function selectedNumberKeeps(selected: number[] | undefined, value: number | null | undefined): boolean {
  if (!selected?.length) return true;
  if (value == null) return false;
  return selected.some((candidate) => Number(candidate) === value);
}

function analysisCategory(l: AnalysisLine): number | null {
  return l.master?.category ?? l.category;
}

function applyAnalysisCriteria(
  l: AnalysisLine,
  c: SalesAnalysisCriteria,
  parsed: ParsedAnalysisCriteria,
  context: AnalysisCriteriaContext,
): boolean {
  if (!facetKeeps(c.stores, parsed.stores, l.store)) return false;
  if (!selectedStringKeeps(c.chains, context.storeChainByStore?.get(l.store)?.code ?? null)) return false;
  const deptNumber = c.departments?.length || c.sectors?.length
    ? deptNumberForCategory(analysisCategory(l), context.departments)
    : null;
  if (!selectedNumberKeeps(c.departments, deptNumber)) return false;
  if (!selectedNumberKeeps(c.sectors, sectorNumberForDepartment(deptNumber, context.sectors))) return false;
  if (!facetKeeps(c.categories, parsed.categories, l.category ?? null)) return false;
  if (!facetKeeps(c.vendors, parsed.vendors, l.vendor ?? null)) return false;
  if (!facetKeeps(c.skus, parsed.skus, l.sku)) return false;
  if (!facetKeeps(c.seasons, parsed.seasons, l.master?.season ?? null)) return false;
  if (!facetKeeps(c.groups, parsed.groups, l.master?.groupCode ?? null)) return false;
  if (!selectedStringKeeps(c.buyers, l.master?.buyerCode ?? null)) return false;
  if (!matchesCriteria(parsed.styleColor, l.master?.styleColor ?? null)) return false;
  if (!keywordFacetKeeps(c.keywords, parsed.keywords, l.master?.keywords ?? null)) return false;
  return true;
}

function hasList<T>(values: T[] | undefined): boolean {
  return Array.isArray(values) && values.length > 0;
}

function hasText(value: string | undefined): boolean {
  return !!value?.trim();
}

function hasStoreCriteria(criteria: SalesAnalysisCriteria | undefined): boolean {
  if (!criteria) return false;
  return hasList(criteria.stores) || hasList(criteria.chains) || hasText(criteria.storesRaw);
}

function hasProductCriteria(criteria: SalesAnalysisCriteria | undefined): boolean {
  if (!criteria) return false;
  return (
    hasList(criteria.sectors) ||
    hasList(criteria.departments) ||
    hasList(criteria.categories) ||
    hasList(criteria.vendors) ||
    hasList(criteria.seasons) ||
    hasList(criteria.skus) ||
    hasList(criteria.groups) ||
    hasList(criteria.keywords) ||
    hasList(criteria.buyers) ||
    hasText(criteria.categoriesRaw) ||
    hasText(criteria.vendorsRaw) ||
    hasText(criteria.seasonsRaw) ||
    hasText(criteria.skusRaw) ||
    hasText(criteria.groupsRaw) ||
    hasText(criteria.keywordsRaw) ||
    hasText(criteria.styleColorRaw) ||
    hasText(criteria.styleColor)
  );
}

function hasAnyCriteria(criteria: SalesAnalysisCriteria | undefined): boolean {
  return hasStoreCriteria(criteria) || hasProductCriteria(criteria);
}

async function buildAnalysisCriteriaContext(criteria: SalesAnalysisCriteria): Promise<AnalysisCriteriaContext> {
  const needsDepartmentCriteria = hasList(criteria.departments) || hasList(criteria.sectors);
  const [storeChainByStore, departments, sectors] = await Promise.all([
    hasList(criteria.chains) ? loadStoreChainByStore() : Promise.resolve(null),
    needsDepartmentCriteria ? loadDepartmentMap() : Promise.resolve(null),
    hasList(criteria.sectors) ? loadSectorMap() : Promise.resolve(null),
  ]);
  return { storeChainByStore, departments, sectors };
}

async function resolveStoreNumbersForCriteria(
  requestedStores: number[] | undefined,
  criteria: SalesAnalysisCriteria | undefined,
): Promise<number[] | undefined> {
  const c = criteria ?? {};
  if (!requestedStores?.length && !hasStoreCriteria(c)) return undefined;

  const storeMap = await loadStoreMap();
  const parsed = parseAnalysisCriteria(c);
  const context = await buildAnalysisCriteriaContext(c);
  const base = requestedStores?.length
    ? requestedStores.map((store) => Number(store)).filter((store) => Number.isInteger(store) && store > 0)
    : [...storeMap.keys()];

  return Array.from(new Set(base))
    .filter((store) => facetKeeps(c.stores, parsed.stores, store))
    .filter((store) => selectedStringKeeps(c.chains, context.storeChainByStore?.get(store)?.code ?? null))
    .sort((a, b) => a - b);
}

async function filterTicketLinesByCriteria(
  lines: TicketLine[],
  criteria: SalesAnalysisCriteria | undefined,
): Promise<AnalysisLine[]> {
  const c = criteria ?? {};
  if (!hasAnyCriteria(c)) return lines.map((line) => ({ ...line, master: null }));

  const parsed = parseAnalysisCriteria(c);
  const [context, masterBySku] = await Promise.all([
    buildAnalysisCriteriaContext(c),
    hasProductCriteria(c) ? loadSkuMasterFields(lines.map((line) => line.sku)) : Promise.resolve(new Map<string, SkuMasterFields>()),
  ]);
  return lines
    .map<AnalysisLine>((line) => ({
      ...line,
      master: line.sku ? masterBySku.get(line.sku.trim().toUpperCase()) ?? null : null,
    }))
    .filter((line) => applyAnalysisCriteria(line, c, parsed, context));
}

function aggregateDailySalesFromLines(lines: AnalysisLine[]): Map<string, Map<number, DailyStoreSales>> {
  const map = new Map<string, Map<number, DailyStoreSales>>();
  for (const line of lines) {
    if (!line.date || !line.store) continue;
    let perStore = map.get(line.date);
    if (!perStore) {
      perStore = new Map<number, DailyStoreSales>();
      map.set(line.date, perStore);
    }
    const current = perStore.get(line.store) ?? { netSales: 0, profit: 0 };
    current.netSales += line.extension;
    current.profit += line.extension - lineCogs(line);
    perStore.set(line.store, current);
  }
  return map;
}

// Row-grain helpers ─────────────────────────────────────────────────────────

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

interface SectorRow {
  number: number;
  desc: string | null;
  begDept: number;
  endDept: number;
}

async function loadDepartmentMap(): Promise<DeptRow[]> {
  return cachedAsync('sr:dim:department-ranges', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<
      { Number: number; Desc: string | null; BegCateg: number; EndCateg: number }[]
    >(
      `SELECT number AS "Number", "desc" AS "Desc",
              beg_categ AS "BegCateg", end_categ AS "EndCateg"
         FROM app.taxonomy_department
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

async function loadSectorMap(): Promise<SectorRow[]> {
  return cachedAsync('sr:dim:sector-ranges', 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<
      { Number: number; Desc: string | null; BegDept: number; EndDept: number }[]
    >(
      `SELECT number AS "Number", "desc" AS "Desc",
              beg_dept AS "BegDept", end_dept AS "EndDept"
         FROM app.taxonomy_sector
        WHERE beg_dept IS NOT NULL AND end_dept IS NOT NULL`,
    );
    return rows
      .filter((r) => r.Number != null)
      .map<SectorRow>((r) => ({
        number: Number(r.Number),
        desc: r.Desc?.trim() || null,
        begDept: Number(r.BegDept ?? 0),
        endDept: Number(r.EndDept ?? 0),
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

function sectorNumberForDepartment(department: number | null, sectors: SectorRow[] | null): number | null {
  if (department == null || !sectors) return null;
  for (const s of sectors) {
    if (department >= s.begDept && department <= s.endDept) return s.number;
  }
  return null;
}

function needsDepartmentMap(reportType: SalesAnalysisReportType): boolean {
  return reportType === 'DEPT_SUMMARY' || reportType === 'SECTOR_SUMMARY';
}

function needsSkuMaster(params: {
  reportType: SalesAnalysisReportType;
  criteria: SalesAnalysisCriteria;
  includeAttributes?: boolean;
}): boolean {
  return (
    params.reportType === 'DEPT_SUMMARY' ||
    params.reportType === 'SECTOR_SUMMARY' ||
    params.reportType === 'SEASON_SUMMARY' ||
    params.reportType === 'GROUP_SUMMARY' ||
    params.reportType === 'STYLE_COLOR_SUMMARY' ||
    !!params.criteria.departments?.length ||
    !!params.criteria.sectors?.length ||
    !!params.criteria.seasons?.length ||
    !!params.criteria.groups?.length ||
    !!params.criteria.styleColor ||
    !!params.criteria.keywords?.length ||
    !!params.criteria.buyers?.length ||
    !!params.criteria.seasonsRaw ||
    !!params.criteria.groupsRaw ||
    !!params.criteria.styleColorRaw ||
    !!params.criteria.keywordsRaw
  );
}

function shouldSeedSkuMasterRows(criteria: SalesAnalysisCriteria): boolean {
  return (
    !!criteria.categories?.length ||
    !!criteria.vendors?.length ||
    !!criteria.seasons?.length ||
    !!criteria.skus?.length ||
    !!criteria.groups?.length ||
    !!criteria.departments?.length ||
    !!criteria.sectors?.length ||
    !!criteria.styleColor ||
    !!criteria.keywords?.length ||
    !!criteria.buyers?.length ||
    !!criteria.categoriesRaw ||
    !!criteria.vendorsRaw ||
    !!criteria.seasonsRaw ||
    !!criteria.skusRaw ||
    !!criteria.groupsRaw ||
    !!criteria.styleColorRaw ||
    !!criteria.keywordsRaw
  );
}

function zeroSalesAnalysisLine(master: SkuMasterFields, store: number): AnalysisLine {
  return {
    store,
    ticket: 0,
    date: '',
    hour: 0,
    sku: master.sku,
    column: '',
    row: '',
    qty: 0,
    extension: 0,
    perks: 0,
    salesperson: '',
    category: master.category,
    vendor: master.vendor,
    cost: 0,
    returnCode: 0,
    posted: true,
    master,
  };
}

function hasStoreFacetCriteria(criteria: SalesAnalysisCriteria, parsed: ParsedAnalysisCriteria): boolean {
  return !!criteria.stores?.length || !parsed.stores.empty || !!criteria.chains?.length;
}

async function resolveSkuDetailSeedStores(
  criteria: SalesAnalysisCriteria,
  parsed: ParsedAnalysisCriteria,
  context: AnalysisCriteriaContext,
  filteredStores: number[] | undefined,
  combine: boolean,
): Promise<Array<number | null>> {
  if (combine && !hasStoreFacetCriteria(criteria, parsed)) return [null];

  const candidates = new Set<number>();
  for (const store of filteredStores ?? []) {
    const n = Number(store);
    if (Number.isInteger(n) && n > 0) candidates.add(n);
  }

  if (candidates.size === 0 || !filteredStores?.length) {
    const stores = await loadStoreMap();
    for (const store of stores.keys()) candidates.add(store);
  }

  for (const store of criteria.stores ?? []) {
    const n = Number(store);
    if (Number.isInteger(n) && n > 0) candidates.add(n);
  }

  const stores = [...candidates]
    .filter((store) => facetKeeps(criteria.stores, parsed.stores, store))
    .filter((store) => selectedStringKeeps(criteria.chains, context.storeChainByStore?.get(store)?.code ?? null))
    .sort((a, b) => a - b);

  if (combine) return stores.length ? [stores[0]] : [];
  return stores;
}

function normalizedStringList(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? [])
    .map((value) => value.trim())
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
}

function normalizedNumberList(values: number[] | undefined): number[] {
  return Array.from(new Set((values ?? [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value))))
    .sort((a, b) => a - b);
}

function addCategoryRange(out: Set<number>, beg: number, end: number): void {
  const lo = Math.min(beg, end);
  const hi = Math.max(beg, end);
  for (let n = lo; n <= hi; n++) out.add(n);
}

function salesAnalysisCategorySqlPrefilter(
  criteria: SalesAnalysisCriteria,
  parsed: ParsedAnalysisCriteria,
  departments: DeptRow[] | null,
  sectors: SectorRow[] | null,
): number[] | undefined {
  const categories = new Set<number>();
  for (const value of normalizedNumberList(criteria.categories)) categories.add(value);

  const categoryBounds = sqlNumericBounds(parsed.categories);
  if (categoryBounds) addCategoryRange(categories, categoryBounds.min, categoryBounds.max);

  for (const deptNumber of normalizedNumberList(criteria.departments)) {
    const dept = departments?.find((row) => row.number === deptNumber);
    if (dept) addCategoryRange(categories, dept.begCateg, dept.endCateg);
  }

  const selectedSectors = normalizedNumberList(criteria.sectors);
  if (selectedSectors.length && departments && sectors) {
    const selected = new Set(selectedSectors);
    for (const sector of sectors) {
      if (!selected.has(sector.number)) continue;
      for (const dept of departments) {
        if (dept.number >= sector.begDept && dept.number <= sector.endDept) {
          addCategoryRange(categories, dept.begCateg, dept.endCateg);
        }
      }
    }
  }

  return categories.size ? [...categories].sort((a, b) => a - b) : undefined;
}

function salesAnalysisActivityMonthSlot(_startDate: string, endDate: string): number {
  const month = Number(endDate.slice(5, 7));
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : 1;
}

function isFullCalendarMonth(startDate: string, endDate: string): boolean {
  const start = toUtcDate(startDate);
  const end = toUtcDate(endDate);
  if (start.getUTCDate() !== 1) return false;
  if (
    start.getUTCFullYear() !== end.getUTCFullYear() ||
    start.getUTCMonth() !== end.getUTCMonth()
  ) {
    return false;
  }
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return toIsoDate(lastDay) === endDate;
}

function salesAnalysisFullMonthWindow(
  startDate: string,
  endDate: string,
): { fromYearMonth: string; toYearMonth: string; monthCount: number } | null {
  const start = toUtcDate(startDate);
  const end = toUtcDate(endDate);
  if (start.getUTCDate() !== 1) return null;
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0));
  if (toIsoDate(lastDay) !== endDate) return null;
  const monthCount =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;
  if (monthCount <= 0) return null;
  return {
    fromYearMonth: `${startDate.slice(0, 7)}`,
    toYearMonth: `${endDate.slice(0, 7)}`,
    monthCount,
  };
}

function useMonthlyAverageInventoryForSalesAnalysis(
  printing: SalesAnalysisPrinting,
  startDate: string,
  endDate: string,
): boolean {
  return !!printing.mtd || isFullCalendarMonth(startDate, endDate);
}

function salesAnalysisTurnsRoiAnnualizer(
  printing: SalesAnalysisPrinting,
  startDate: string,
  endDate: string,
  _periodDays: number,
): number | undefined {
  if (useMonthlyAverageInventoryForSalesAnalysis(printing, startDate, endDate)) return 12;
  if (printing.wtd) return 52;
  return undefined;
}

function inventoryValueForSalesAnalysisTurnsRoi(
  inventory: SalesAnalysisInventoryMetrics,
  useAverageInventory: boolean,
): number {
  return useAverageInventory ? inventory.averageInventoryValue : inventory.onHandAtCost;
}

function salesAnalysisSnapshotScopeSql(snapshotAlias: string, monthAlias: string): string {
  return `(
    COALESCE(${snapshotAlias}.on_hand, 0) <> 0
    OR COALESCE(${snapshotAlias}.month_qty_sales, 0) <> 0
    OR COALESCE(${snapshotAlias}.month_dol_sales, 0) <> 0
    OR COALESCE(${snapshotAlias}.month_profit, 0) <> 0
    OR COALESCE(${snapshotAlias}.last_month_on_hand, 0) <> 0
    OR COALESCE(${snapshotAlias}.last_month_inv_value, 0) <> 0
    OR COALESCE(${monthAlias}.qty_sales, 0) <> 0
    OR COALESCE(${monthAlias}.net_sales, 0) <> 0
    OR COALESCE(${monthAlias}.profit, 0) <> 0
    OR COALESCE(${monthAlias}.qty_on_hand, 0) <> 0
    OR COALESCE(${monthAlias}.inventory_value, 0) <> 0
  )`;
}

function salesAnalysisInventoryScopeCacheKey(params: {
  reportType: SalesAnalysisReportType;
  storeOption: SalesAnalysisStoreOption;
  criteria: SalesAnalysisCriteria;
  filteredStores: number[] | undefined;
  activityMonthSlot: number;
  averageInventoryMonths?: { fromYearMonth: string; toYearMonth: string; monthCount: number } | null;
  categoryPrefilter?: number[];
  skuFilter?: string[];
}): string {
  const c = params.criteria;
  return JSON.stringify({
    reportType: params.reportType,
    storeOption: params.storeOption,
    activityMonthSlot: params.activityMonthSlot,
    averageInventoryMonths: params.averageInventoryMonths ?? null,
    categoryPrefilter: normalizedNumberList(params.categoryPrefilter),
    filteredStores: normalizedNumberList(params.filteredStores),
    skuFilter: normalizedStringList(params.skuFilter).map((sku) => sku.toUpperCase()),
    stores: normalizedNumberList(c.stores),
    chains: normalizedStringList(c.chains),
    departments: normalizedNumberList(c.departments),
    sectors: normalizedNumberList(c.sectors),
    categories: normalizedNumberList(c.categories),
    vendors: normalizedStringList(c.vendors),
    seasons: normalizedStringList(c.seasons),
    skus: normalizedStringList(c.skus),
    groups: normalizedStringList(c.groups),
    keywords: normalizedStringList(c.keywords),
    buyers: normalizedStringList(c.buyers),
    styleColor: c.styleColor?.trim() ?? '',
    storesRaw: c.storesRaw?.trim() ?? '',
    categoriesRaw: c.categoriesRaw?.trim() ?? '',
    vendorsRaw: c.vendorsRaw?.trim() ?? '',
    seasonsRaw: c.seasonsRaw?.trim() ?? '',
    skusRaw: c.skusRaw?.trim() ?? '',
    groupsRaw: c.groupsRaw?.trim() ?? '',
    keywordsRaw: c.keywordsRaw?.trim() ?? '',
    styleColorRaw: c.styleColorRaw?.trim() ?? '',
  });
}

interface RawSalesAnalysisInventoryRow {
  SKU: string | null;
  Store: number | null;
  TotalOnHand: number | null;
  CurrentCost: number | null;
  BeginningInventoryValue: number | null;
  AverageInventoryValueSum: number | null;
  AverageInventoryMonthCount: number | null;
  PriorYearOnHandAtCost: number | null;
  ScopeIncluded: boolean | string | number | null;
  Season: string | null;
  GroupCode: string | null;
  StyleColor: string | null;
  Keywords: string | null;
  Category: number | null;
  Vendor: string | null;
  BuyerCode: string | null;
}

function truthyDbBoolean(value: boolean | string | number | null | undefined): boolean {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

async function loadSalesAnalysisInventoryScope(params: {
  reportType: SalesAnalysisReportType;
  storeOption: SalesAnalysisStoreOption;
  criteria: SalesAnalysisCriteria;
  parsed: ParsedAnalysisCriteria;
  context: AnalysisCriteriaContext;
  filteredStores: number[] | undefined;
  deptMap: DeptRow[] | null;
  sectorMap: SectorRow[] | null;
  activityMonthSlot: number;
  averageInventoryMonths?: { fromYearMonth: string; toYearMonth: string; monthCount: number } | null;
  categoryPrefilter?: number[];
  skuFilter?: string[];
}): Promise<SalesAnalysisInventoryScope> {
  if (params.reportType === 'PRICE_POINT_SUMMARY') {
    return { metricsByKey: new Map(), skuScopeRows: [] };
  }
  if (params.skuFilter && params.skuFilter.length === 0) {
    return { metricsByKey: new Map(), skuScopeRows: [] };
  }

  const cacheKey = `sr:salesAnalysisInventoryScope:${salesAnalysisInventoryScopeCacheKey(params)}`;
  return cachedAsync(cacheKey, 300_000, async () => {
    const averageInventoryMonths = params.averageInventoryMonths ?? null;
    const sqlParams: unknown[] = [
      params.activityMonthSlot,
      averageInventoryMonths?.fromYearMonth ?? '',
      averageInventoryMonths?.toYearMonth ?? '',
    ];
    const wheres = [
      `h.sku_code IS NOT NULL`,
      `COALESCE(s.rics_status, '') <> 'D'`,
    ];
    const filteredStores = normalizedNumberList(params.filteredStores);
    if (filteredStores.length > 0) {
      sqlParams.push(filteredStores);
      wheres.push(`h.store_id = ANY($${sqlParams.length}::int[])`);
    }
    if (params.skuFilter?.length) {
      sqlParams.push(normalizedStringList(params.skuFilter).map((sku) => sku.toUpperCase()));
      wheres.push(`UPPER(BTRIM(h.sku_code)) = ANY($${sqlParams.length}::text[])`);
    }
    if (params.categoryPrefilter?.length) {
      sqlParams.push(normalizedNumberList(params.categoryPrefilter));
      wheres.push(`s.category_number = ANY($${sqlParams.length}::int[])`);
    }
    if (params.criteria.categories?.length && !params.criteria.categoriesRaw?.trim()) {
      sqlParams.push(normalizedNumberList(params.criteria.categories));
      wheres.push(`s.category_number = ANY($${sqlParams.length}::int[])`);
    }
    if (params.criteria.vendors?.length && !params.criteria.vendorsRaw?.trim()) {
      sqlParams.push(normalizedStringList(params.criteria.vendors).map((value) => value.toUpperCase()));
      wheres.push(`UPPER(BTRIM(s.vendor_id)) = ANY($${sqlParams.length}::text[])`);
    }
    if (params.criteria.seasons?.length && !params.criteria.seasonsRaw?.trim()) {
      sqlParams.push(normalizedStringList(params.criteria.seasons).map((value) => value.toUpperCase()));
      wheres.push(`UPPER(BTRIM(s.season)) = ANY($${sqlParams.length}::text[])`);
    }
    if (params.criteria.skus?.length && !params.criteria.skusRaw?.trim()) {
      sqlParams.push(normalizedStringList(params.criteria.skus).map((sku) => sku.toUpperCase()));
      wheres.push(`UPPER(BTRIM(s.code)) = ANY($${sqlParams.length}::text[])`);
    }
    if (params.criteria.groups?.length && !params.criteria.groupsRaw?.trim()) {
      sqlParams.push(normalizedStringList(params.criteria.groups).map((value) => value.toUpperCase()));
      wheres.push(`UPPER(BTRIM(s.group_code)) = ANY($${sqlParams.length}::text[])`);
    }
    if (params.criteria.styleColor?.trim() && !params.criteria.styleColorRaw?.trim()) {
      sqlParams.push(params.criteria.styleColor.trim().toUpperCase());
      wheres.push(`UPPER(BTRIM(s.style_color)) = $${sqlParams.length}::text`);
    }
    if (params.criteria.buyers?.length) {
      sqlParams.push(normalizedStringList(params.criteria.buyers).map((value) => value.toUpperCase()));
      wheres.push(`
        EXISTS (
          SELECT 1
            FROM app.sku_attribute_assignment saa_buyer
            JOIN app.attribute_dimension ad_buyer
              ON ad_buyer.id = saa_buyer.dimension_id
             AND ad_buyer.code = 'buyer'
            JOIN app.attribute_value av_buyer
              ON av_buyer.id = saa_buyer.value_id
           WHERE UPPER(BTRIM(saa_buyer.sku_code)) = UPPER(BTRIM(s.code))
             AND UPPER(BTRIM(av_buyer.code)) = ANY($${sqlParams.length}::text[])
        )
      `);
    }

    const rows = await prisma.$queryRawUnsafe<RawSalesAnalysisInventoryRow[]>(
      `
      WITH monthly_average AS (
        SELECT
          m_avg.snapshot_id,
          SUM(COALESCE(m_avg.inventory_value, 0))::float8 AS average_inventory_value_sum,
          COUNT(*)::int AS average_inventory_month_count
        FROM app.inventory_history_month m_avg
        WHERE $2::text <> ''
          AND m_avg.year_month >= $2::text
          AND m_avg.year_month <= $3::text
        GROUP BY m_avg.snapshot_id
      ),
      inventory_scope AS (
        SELECT
          h.id AS snapshot_id,
          UPPER(BTRIM(h.sku_code)) AS sku_key,
          h.store_id,
             h.on_hand::float8 AS total_on_hand,
             COALESCE(s.current_cost, h.average_cost)::float8 AS current_cost,
             COALESCE(h.last_month_inv_value, 0)::float8 AS beginning_inventory_value,
             ma.average_inventory_value_sum,
             ma.average_inventory_month_count,
             COALESCE(hm_scope.inventory_value, 0)::float8 AS prior_year_on_hand_at_cost,
             s.season,
          s.group_code,
          s.style_color,
          s.keywords,
          s.category_number,
          s.vendor_id,
          ${salesAnalysisSnapshotScopeSql('h', 'hm_scope')} AS scope_included
        FROM app.inventory_history_snapshot h
        LEFT JOIN app.sku s
          ON s.id = h.sku_id
        LEFT JOIN app.inventory_history_month hm_scope
          ON hm_scope.snapshot_id = h.id
         AND hm_scope.slot_number = $1::int
        LEFT JOIN monthly_average ma
          ON ma.snapshot_id = h.id
        WHERE ${wheres.join(' AND ')}
      ),
      base_keywords AS (
        SELECT i.sku_key, UPPER(BTRIM(kw.keyword)) AS keyword
        FROM inventory_scope i,
             UNNEST(string_to_array(COALESCE(i.keywords, ''), ' ')) AS kw(keyword)
        WHERE BTRIM(kw.keyword) <> ''
      ),
      combined_keywords AS (
        SELECT sku_key, keyword FROM base_keywords
        UNION
        SELECT i.sku_key, UPPER(BTRIM(o.keyword)) AS keyword
        FROM inventory_scope i
        JOIN app.sku_keyword_override o
          ON UPPER(BTRIM(o.rics_sku_code)) = i.sku_key
        WHERE o.action = 'ADD'
      ),
      effective_keywords AS (
        SELECT sku_key, keyword FROM combined_keywords
        EXCEPT
        SELECT i.sku_key, UPPER(BTRIM(o.keyword)) AS keyword
        FROM inventory_scope i
        JOIN app.sku_keyword_override o
          ON UPPER(BTRIM(o.rics_sku_code)) = i.sku_key
        WHERE o.action = 'REMOVE'
      ),
      buyer_assignment AS (
        SELECT DISTINCT ON (UPPER(BTRIM(saa.sku_code)))
               UPPER(BTRIM(saa.sku_code)) AS sku_key,
               av.code AS buyer_code
          FROM app.sku_attribute_assignment saa
          JOIN app.attribute_dimension ad
            ON ad.id = saa.dimension_id
           AND ad.code = 'buyer'
          JOIN app.attribute_value av ON av.id = saa.value_id
         WHERE COALESCE(BTRIM(saa.sku_code), '') <> ''
         ORDER BY UPPER(BTRIM(saa.sku_code)), av.sort_order NULLS LAST, av.code
      )
      SELECT i.sku_key AS "SKU",
             i.store_id AS "Store",
             i.total_on_hand AS "TotalOnHand",
             i.current_cost AS "CurrentCost",
             i.beginning_inventory_value AS "BeginningInventoryValue",
             i.average_inventory_value_sum AS "AverageInventoryValueSum",
             i.average_inventory_month_count AS "AverageInventoryMonthCount",
             i.prior_year_on_hand_at_cost AS "PriorYearOnHandAtCost",
             i.scope_included AS "ScopeIncluded",
             i.season AS "Season",
             i.group_code AS "GroupCode",
             i.style_color AS "StyleColor",
             NULLIF(STRING_AGG(ek.keyword, ' ' ORDER BY ek.keyword), '') AS "Keywords",
             i.category_number AS "Category",
             i.vendor_id AS "Vendor",
             ba.buyer_code AS "BuyerCode"
        FROM inventory_scope i
        LEFT JOIN effective_keywords ek ON ek.sku_key = i.sku_key
        LEFT JOIN buyer_assignment ba ON ba.sku_key = i.sku_key
       GROUP BY i.snapshot_id, i.sku_key, i.store_id, i.total_on_hand, i.current_cost,
                i.beginning_inventory_value, i.average_inventory_value_sum, i.average_inventory_month_count,
                i.prior_year_on_hand_at_cost, i.scope_included, i.season, i.group_code,
                i.style_color, i.category_number, i.vendor_id, ba.buyer_code
      `,
      ...sqlParams,
    );

    const metricsByKey = new Map<string, SalesAnalysisInventoryMetrics>();
    const skuScopeByBucketKey = new Map<string, SalesAnalysisInventoryScopeRow>();
    const combine = params.storeOption === 'COMBINE';
    for (const row of rows) {
      const sku = row.SKU?.trim().toUpperCase();
      const store = Number(row.Store ?? 0);
      if (!sku || !Number.isInteger(store) || store <= 0) continue;
      const master: SkuMasterFields = {
        sku,
        season: row.Season?.trim() || null,
        groupCode: row.GroupCode?.trim() || null,
        styleColor: row.StyleColor?.trim() || null,
        keywords: row.Keywords?.trim() || null,
        category: row.Category != null ? Number(row.Category) : null,
        vendor: row.Vendor?.trim() || null,
        buyerCode: row.BuyerCode?.trim() || null,
      };
      const seedLine = zeroSalesAnalysisLine(master, store);
      if (!applyAnalysisCriteria(seedLine, params.criteria, params.parsed, params.context)) continue;
      const dimKey = rowGrainKey(seedLine, params.reportType, params.deptMap, params.sectorMap);
      if (!dimKey) continue;

      const onHand = Number(row.TotalOnHand ?? 0);
      const cost = Number(row.CurrentCost ?? 0);
      const onHandAtCost = onHand * Math.max(0, cost);
      const beginningInventoryValue = Number(row.BeginningInventoryValue ?? 0);
      const averageInventoryValueSum = Number(row.AverageInventoryValueSum ?? 0);
      const averageInventoryMonthCount = Number(row.AverageInventoryMonthCount ?? 0);
      const averageInventoryValue =
        averageInventoryMonthCount > 0
          ? (averageInventoryValueSum + onHandAtCost) / (averageInventoryMonthCount + 1)
          : null;
      const priorYearOnHandAtCost = Number(row.PriorYearOnHandAtCost ?? 0);
      const key = combine ? dimKey : `${dimKey}|${store}`;
      addSalesAnalysisInventoryMetrics(
        metricsByKey,
        key,
        onHand,
        onHandAtCost,
        beginningInventoryValue,
        priorYearOnHandAtCost,
        averageInventoryValue,
      );

      const scopeIncluded = row.ScopeIncluded == null
        ? onHand !== 0 || beginningInventoryValue !== 0
        : truthyDbBoolean(row.ScopeIncluded);
      if (params.reportType === 'SKU_DETAIL' && scopeIncluded) {
        const scopeStore = combine ? null : store;
        const scopeKey = `${dimKey}|${scopeStore ?? '*'}`;
        if (!skuScopeByBucketKey.has(scopeKey)) {
          skuScopeByBucketKey.set(scopeKey, { dimensionKey: dimKey, storeNumber: scopeStore, master });
        }
      }
    }

    return {
      metricsByKey,
      skuScopeRows: [...skuScopeByBucketKey.values()],
    };
  });
}

function skuMasterScopeCacheKey(criteria: SalesAnalysisCriteria, seedStores: Array<number | null>): string {
  return JSON.stringify({
    stores: normalizedNumberList(seedStores.filter((store): store is number => store != null)),
    categories: normalizedNumberList(criteria.categories),
    vendors: normalizedStringList(criteria.vendors),
    seasons: normalizedStringList(criteria.seasons),
    skus: normalizedStringList(criteria.skus),
    groups: normalizedStringList(criteria.groups),
    styleColor: criteria.styleColor?.trim() ?? '',
    keywords: normalizedStringList(criteria.keywords),
    buyers: normalizedStringList(criteria.buyers),
    categoriesRaw: criteria.categoriesRaw?.trim() ?? '',
    vendorsRaw: criteria.vendorsRaw?.trim() ?? '',
    seasonsRaw: criteria.seasonsRaw?.trim() ?? '',
    skusRaw: criteria.skusRaw?.trim() ?? '',
    groupsRaw: criteria.groupsRaw?.trim() ?? '',
    styleColorRaw: criteria.styleColorRaw?.trim() ?? '',
    keywordsRaw: criteria.keywordsRaw?.trim() ?? '',
  });
}

async function loadSkuMasterScope(
  criteria: SalesAnalysisCriteria,
  seedStores: Array<number | null>,
): Promise<SkuMasterFields[]> {
  const concreteSeedStores = normalizedNumberList(seedStores.filter((store): store is number => store != null));
  const cacheKey = `sr:skuMasterScope:${skuMasterScopeCacheKey(criteria, seedStores)}`;
  return cachedAsync(cacheKey, 300_000, async () => {
    const params: unknown[] = [];
    const wheres = [
      `s.code IS NOT NULL`,
      `COALESCE(s.rics_status, '') <> 'D'`,
    ];

    if (criteria.categories?.length && !criteria.categoriesRaw?.trim()) {
      params.push(normalizedNumberList(criteria.categories));
      wheres.push(`s.category_number = ANY($${params.length}::int[])`);
    }
    if (criteria.vendors?.length && !criteria.vendorsRaw?.trim()) {
      params.push(normalizedStringList(criteria.vendors));
      wheres.push(`s.vendor_id = ANY($${params.length}::text[])`);
    }
    if (criteria.seasons?.length && !criteria.seasonsRaw?.trim()) {
      params.push(normalizedStringList(criteria.seasons));
      wheres.push(`s.season = ANY($${params.length}::text[])`);
    }
    if (criteria.skus?.length && !criteria.skusRaw?.trim()) {
      params.push(normalizedStringList(criteria.skus).map((sku) => sku.toUpperCase()));
      wheres.push(`UPPER(BTRIM(s.code)) = ANY($${params.length}::text[])`);
    }
    if (criteria.groups?.length && !criteria.groupsRaw?.trim()) {
      params.push(normalizedStringList(criteria.groups));
      wheres.push(`s.group_code = ANY($${params.length}::text[])`);
    }
    if (criteria.styleColor?.trim() && !criteria.styleColorRaw?.trim()) {
      params.push(criteria.styleColor.trim());
      wheres.push(`s.style_color = $${params.length}::text`);
    }
    if (criteria.buyers?.length) {
      params.push(normalizedStringList(criteria.buyers));
      wheres.push(`
        EXISTS (
          SELECT 1
            FROM app.sku_attribute_assignment saa_buyer
            JOIN app.attribute_dimension ad_buyer
              ON ad_buyer.id = saa_buyer.dimension_id
             AND ad_buyer.code = 'buyer'
            JOIN app.attribute_value av_buyer
              ON av_buyer.id = saa_buyer.value_id
           WHERE UPPER(BTRIM(saa_buyer.sku_code)) = UPPER(BTRIM(s.code))
             AND av_buyer.code = ANY($${params.length}::text[])
        )
      `);
    }
    if (concreteSeedStores.length) {
      params.push(concreteSeedStores);
      wheres.push(`
        EXISTS (
          SELECT 1
            FROM app.inventory_history_snapshot h
           WHERE h.sku_id = s.id
             AND h.store_id = ANY($${params.length}::int[])
        )
      `);
    }

    const rows = await prisma.$queryRawUnsafe<Array<{
      SKU: string | null;
      Season: string | null;
      GroupCode: string | null;
      StyleColor: string | null;
      Keywords: string | null;
      Category: number | null;
      Vendor: string | null;
      BuyerCode: string | null;
    }>>(
      `
      WITH sku_scope AS (
        SELECT
          UPPER(BTRIM(s.code)) AS sku_key,
          s.season,
          s.group_code,
          s.style_color,
          s.keywords,
          s.category_number,
          s.vendor_id
        FROM app.sku s
        WHERE ${wheres.join(' AND ')}
      ),
      base_keywords AS (
        SELECT s.sku_key, UPPER(BTRIM(kw.keyword)) AS keyword
        FROM sku_scope s,
             UNNEST(string_to_array(COALESCE(s.keywords, ''), ' ')) AS kw(keyword)
        WHERE BTRIM(kw.keyword) <> ''
      ),
      combined_keywords AS (
        SELECT sku_key, keyword FROM base_keywords
        UNION
        SELECT s.sku_key, UPPER(BTRIM(o.keyword)) AS keyword
        FROM sku_scope s
        JOIN app.sku_keyword_override o
          ON UPPER(BTRIM(o.rics_sku_code)) = s.sku_key
        WHERE o.action = 'ADD'
      ),
      effective_keywords AS (
        SELECT sku_key, keyword FROM combined_keywords
        EXCEPT
        SELECT s.sku_key, UPPER(BTRIM(o.keyword)) AS keyword
        FROM sku_scope s
        JOIN app.sku_keyword_override o
          ON UPPER(BTRIM(o.rics_sku_code)) = s.sku_key
        WHERE o.action = 'REMOVE'
      ),
      buyer_assignment AS (
        SELECT DISTINCT ON (UPPER(BTRIM(saa.sku_code)))
               UPPER(BTRIM(saa.sku_code)) AS sku_key,
               av.code AS buyer_code
          FROM app.sku_attribute_assignment saa
          JOIN app.attribute_dimension ad
            ON ad.id = saa.dimension_id
           AND ad.code = 'buyer'
          JOIN app.attribute_value av ON av.id = saa.value_id
         WHERE COALESCE(BTRIM(saa.sku_code), '') <> ''
         ORDER BY UPPER(BTRIM(saa.sku_code)), av.sort_order NULLS LAST, av.code
      )
      SELECT s.sku_key AS "SKU",
             s.season AS "Season",
             s.group_code AS "GroupCode",
             s.style_color AS "StyleColor",
             NULLIF(STRING_AGG(ek.keyword, ' ' ORDER BY ek.keyword), '') AS "Keywords",
             s.category_number AS "Category",
             s.vendor_id AS "Vendor",
             ba.buyer_code AS "BuyerCode"
        FROM sku_scope s
        LEFT JOIN effective_keywords ek ON ek.sku_key = s.sku_key
        LEFT JOIN buyer_assignment ba ON ba.sku_key = s.sku_key
       GROUP BY s.sku_key, s.season, s.group_code, s.style_color, s.category_number, s.vendor_id, ba.buyer_code
      `,
      ...params,
    );

    return rows
      .map<SkuMasterFields | null>((row) => {
        const sku = row.SKU?.trim().toUpperCase();
        if (!sku) return null;
        return {
          sku,
          season: row.Season?.trim() || null,
          groupCode: row.GroupCode?.trim() || null,
          styleColor: row.StyleColor?.trim() || null,
          keywords: row.Keywords?.trim() || null,
          category: row.Category != null ? Number(row.Category) : null,
          vendor: row.Vendor?.trim() || null,
          buyerCode: row.BuyerCode?.trim() || null,
        };
      })
      .filter((row): row is SkuMasterFields => row != null);
  });
}

async function loadSkuMasterFields(skuCodes: string[]): Promise<Map<string, SkuMasterFields>> {
  const unique = Array.from(new Set(
    skuCodes
      .map((sku) => sku?.trim().toUpperCase())
      .filter((sku): sku is string => !!sku),
  ));
  if (unique.length === 0) return new Map();
  return cachedAsync(`sr:skuMaster:${unique.sort().join('|')}`, 300_000, async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{
      SKU: string | null;
      Season: string | null;
      GroupCode: string | null;
      StyleColor: string | null;
      Keywords: string | null;
      Category: number | null;
      Vendor: string | null;
      BuyerCode: string | null;
    }>>(
      `
      WITH sku_scope AS (
        SELECT
          UPPER(BTRIM(code)) AS sku_key,
          season,
          group_code,
          style_color,
          keywords,
          category_number,
          vendor_id
        FROM app.sku
        WHERE code IS NOT NULL
          AND UPPER(BTRIM(code)) = ANY($1::text[])
          AND COALESCE(rics_status, '') <> 'D'
      ),
      base_keywords AS (
        SELECT s.sku_key, UPPER(BTRIM(kw.keyword)) AS keyword
        FROM sku_scope s,
             UNNEST(string_to_array(COALESCE(s.keywords, ''), ' ')) AS kw(keyword)
        WHERE BTRIM(kw.keyword) <> ''
      ),
      combined_keywords AS (
        SELECT sku_key, keyword FROM base_keywords
        UNION
        SELECT s.sku_key, UPPER(BTRIM(o.keyword)) AS keyword
        FROM sku_scope s
        JOIN app.sku_keyword_override o
          ON UPPER(BTRIM(o.rics_sku_code)) = s.sku_key
        WHERE o.action = 'ADD'
      ),
      effective_keywords AS (
        SELECT sku_key, keyword FROM combined_keywords
        EXCEPT
        SELECT s.sku_key, UPPER(BTRIM(o.keyword)) AS keyword
        FROM sku_scope s
        JOIN app.sku_keyword_override o
          ON UPPER(BTRIM(o.rics_sku_code)) = s.sku_key
        WHERE o.action = 'REMOVE'
      ),
      buyer_assignment AS (
        SELECT DISTINCT ON (UPPER(BTRIM(saa.sku_code)))
               UPPER(BTRIM(saa.sku_code)) AS sku_key,
               av.code AS buyer_code
          FROM app.sku_attribute_assignment saa
          JOIN app.attribute_dimension ad
            ON ad.id = saa.dimension_id
           AND ad.code = 'buyer'
          JOIN app.attribute_value av ON av.id = saa.value_id
         WHERE COALESCE(BTRIM(saa.sku_code), '') <> ''
         ORDER BY UPPER(BTRIM(saa.sku_code)), av.sort_order NULLS LAST, av.code
      )
      SELECT s.sku_key AS "SKU",
             s.season AS "Season",
             s.group_code AS "GroupCode",
             s.style_color AS "StyleColor",
             NULLIF(STRING_AGG(ek.keyword, ' ' ORDER BY ek.keyword), '') AS "Keywords",
             s.category_number AS "Category",
             s.vendor_id AS "Vendor",
             ba.buyer_code AS "BuyerCode"
        FROM sku_scope s
        LEFT JOIN effective_keywords ek ON ek.sku_key = s.sku_key
        LEFT JOIN buyer_assignment ba ON ba.sku_key = s.sku_key
       GROUP BY s.sku_key, s.season, s.group_code, s.style_color, s.category_number, s.vendor_id, ba.buyer_code
      `,
      unique,
    );
    const out = new Map<string, SkuMasterFields>();
    for (const row of rows) {
      const sku = row.SKU?.trim().toUpperCase();
      if (!sku) continue;
      out.set(sku, {
        sku,
        season: row.Season?.trim() || null,
        groupCode: row.GroupCode?.trim() || null,
        styleColor: row.StyleColor?.trim() || null,
        keywords: row.Keywords?.trim() || null,
        category: row.Category != null ? Number(row.Category) : null,
        vendor: row.Vendor?.trim() || null,
        buyerCode: row.BuyerCode?.trim() || null,
      });
    }
    return out;
  });
}

/** $25 price buckets. Example: $37.50 → "25-50". */
function priceBucketFor(extension: number, qty: number): string {
  if (qty === 0) return '(zero-qty)';
  const unit = Math.abs(extension / qty);
  const lo = Math.floor(unit / 25) * 25;
  return `${lo}-${lo + 25}`;
}

function rowGrainKey(
  l: AnalysisLine,
  rt: SalesAnalysisReportType,
  depts: DeptRow[] | null,
  sectors: SectorRow[] | null,
): string | null {
  switch (rt) {
    case 'SKU_DETAIL':
      return l.sku || null;
    case 'CATEGORY_SUMMARY':
      return l.category != null ? String(l.category) : '(none)';
    case 'DEPT_SUMMARY': {
      const d = deptNumberForCategory(analysisCategory(l), depts);
      return d != null ? String(d) : '(none)';
    }
    case 'VENDOR_SUMMARY':
      return l.vendor ?? '(none)';
    case 'PRICE_POINT_SUMMARY':
      return l.priceBucket || priceBucketFor(l.extension, l.qty);
    case 'SEASON_SUMMARY':
      return l.master?.season || '(none)';
    case 'GROUP_SUMMARY':
      return l.master?.groupCode || '(none)';
    case 'STYLE_COLOR_SUMMARY':
      return l.master?.styleColor || '(none)';
    case 'SECTOR_SUMMARY': {
      const d = deptNumberForCategory(analysisCategory(l), depts);
      const s = sectorNumberForDepartment(d, sectors);
      return s != null ? String(s) : '(none)';
    }
    default:
      return null;
  }
}

function dimLabelFor(
  key: string,
  rt: SalesAnalysisReportType,
  depts: DeptRow[] | null,
  sectors: SectorRow[] | null,
): string | null {
  if (rt === 'DEPT_SUMMARY' && depts) {
    const found = depts.find((d) => String(d.number) === key);
    return found?.desc ?? null;
  }
  if (rt === 'SECTOR_SUMMARY' && sectors) {
    const found = sectors.find((s) => String(s.number) === key);
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
