import { prisma } from '../../db/prisma';
import { fillConstrainedDemandHistory, forecast, shiftYearMonth } from './forecast';
import { computePlanWithInventoryPosition } from './compute';
import {
  normalizeDiscountDistortedHistory,
} from './normalization';
import { PURCHASE_PLAN_SEASONS, buildSeasonMonths, seasonLabel } from './season';
import type {
  EohMethod,
  ForecastMethod,
  ForecastParams,
  HistoryPoint,
  InventoryPosition,
  PurchasePlanSeason,
} from './types';

const DEFAULT_FORECAST_METHOD: ForecastMethod = 'holtWinters';
const DEFAULT_EOH_METHOD: EohMethod = 'forward';
const DEFAULT_COVER_MONTHS = 3;
const HISTORY_MONTHS = 36;

export class PurchasePlanningV3ServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isPurchasePlanningV3ServiceError(err: unknown): err is PurchasePlanningV3ServiceError {
  return err instanceof PurchasePlanningV3ServiceError;
}

export interface PurchasePlanV3Request {
  storeGroupCodes?: string[];
  departmentNumber: number;
  year: number;
  forecast?: {
    method?: ForecastMethod;
  } & ForecastParams;
  eohMethod?: EohMethod;
  coverMonths?: number;
  discountNormalization?: boolean;
  createdBy?: string;
  label?: string;
}

export interface PurchasePlanV3Value {
  units: number;
}

export interface PurchasePlanV3WarehouseDetail {
  skuCode: string;
  skuDescription: string | null;
  startingWarehouseOnHand: number;
  eligibleStoreGroupCodes: string[];
  allocatedUnits: number;
  remainingUnits: number;
  reason: 'eligible_credit' | 'no_chain_tag' | 'no_selected_chain_need';
}

export interface PurchasePlanV3SeasonRow {
  id?: string;
  planId?: string;
  storeGroupCode: string;
  storeGroupLabel: string;
  season: PurchasePlanSeason;
  seasonYear: number;
  seasonLabel: string;
  seasonMonths: string[];
  projectedBoh: PurchasePlanV3Value;
  projectedSales: PurchasePlanV3Value;
  eohTarget: PurchasePlanV3Value;
  baselineBuy: PurchasePlanV3Value;
  chainOnHand: PurchasePlanV3Value;
  currentOnOrder: PurchasePlanV3Value;
  futureOnOrder: PurchasePlanV3Value;
  nativeOpenPo: PurchasePlanV3Value;
  stockPosition: PurchasePlanV3Value;
  warehouseEligible: PurchasePlanV3Value;
  warehousePlanningCredit: PurchasePlanV3Value;
  warehouseUnallocated: PurchasePlanV3Value;
  totalAvailableForPlan: PurchasePlanV3Value;
  recommendedBuy: PurchasePlanV3Value;
  projectedEoh: PurchasePlanV3Value;
  warehouseDetails: PurchasePlanV3WarehouseDetail[];
}

export interface PurchasePlanV3Report {
  plan?: PurchasePlanV3Header;
  storeGroups: Array<{ code: string; label: string; storeNumbers: number[] }>;
  departmentNumber: number;
  departmentLabel: string;
  year: number;
  forecastMethod: ForecastMethod;
  eohMethod: EohMethod;
  coverMonths: number;
  discountNormalization: boolean;
  historyFromYearMonth: string;
  historyToYearMonth: string;
  warehouseStoreNumbers: number[];
  seasons: Array<{
    season: PurchasePlanSeason;
    seasonYear: number;
    seasonLabel: string;
    months: string[];
    rows: PurchasePlanV3SeasonRow[];
  }>;
  totals: {
    projectedSales: PurchasePlanV3Value;
    baselineBuy: PurchasePlanV3Value;
    warehousePlanningCredit: PurchasePlanV3Value;
    recommendedBuy: PurchasePlanV3Value;
    warehouseUnallocated: PurchasePlanV3Value;
  };
  warnings: string[];
  generatedAt: string;
}

export interface PurchasePlanV3Header {
  id: string;
  label: string;
  status: 'draft' | 'archived';
  storeGroupCodes: string[];
  departmentNumber: number;
  departmentLabel: string;
  year: number;
  forecastMethod: ForecastMethod;
  eohMethod: EohMethod;
  coverMonths: number;
  discountNormalization: boolean;
  historyFromYearMonth: string;
  historyToYearMonth: string;
  warehouseStoreNumbers: number[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface PurchasePlanV3ListItem extends PurchasePlanV3Header {
  rowCount: number;
  recommendedBuy: number;
  warehousePlanningCredit: number;
}

interface StoreGroupRow {
  code: string;
  label: string;
  storeNumbers: number[] | string[] | null;
}

interface DepartmentRow {
  number: number;
  description: string;
}

interface MonthlyFactRow {
  yearMonth: string;
  qty: unknown;
  netSales: unknown;
  referenceRetail: unknown;
  beginningOnHand: unknown;
}

interface PositionRow {
  onHand: unknown;
  currentOnOrder: unknown;
  futureOnOrder: unknown;
}

interface NativeOpenPoRow {
  nativeOpenPo: unknown;
}

interface LatestDataMonthRow {
  yearMonth: string | null;
}

interface WarehouseSkuRow {
  skuId: string | null;
  skuCode: string;
  description: string | null;
  onHand: unknown;
  attrCodes: string[] | null;
  keywords: string | null;
}

interface HeaderDb {
  id: string;
  label: string;
  status: string;
  storeGroupCodes: string[] | null;
  departmentNumber: number;
  departmentLabel: string;
  year: number;
  forecastMethod: string;
  eohMethod: string;
  coverMonths: number;
  discountNormalization: boolean;
  historyFromYearMonth: string;
  historyToYearMonth: string;
  warehouseStoreNumbers: number[] | null;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  archivedAt: Date | string | null;
}

interface RowDb {
  id: string;
  planId: string;
  storeGroupCode: string;
  storeGroupLabel: string;
  season: string;
  seasonYear: number;
  seasonMonths: string[];
  projectedBoh: number;
  projectedSales: number;
  eohTarget: number;
  baselineBuy: number;
  chainOnHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  nativeOpenPo: number;
  stockPosition: number;
  warehouseEligible: number;
  warehousePlanningCredit: number;
  warehouseUnallocated: number;
  totalAvailableForPlan: number;
  recommendedBuy: number;
  projectedEoh: number;
  metadata: unknown;
}

export interface WarehousePoolItem {
  skuCode: string;
  skuDescription: string | null;
  remainingQty: number;
  startingQty: number;
  eligibleStoreGroupCodes: string[];
}

export interface WarehouseSeasonAllocation {
  creditByChain: Map<string, number>;
  eligibleByChain: Map<string, number>;
  detailsByChain: Map<string, PurchasePlanV3WarehouseDetail[]>;
  unallocatedDetails: PurchasePlanV3WarehouseDetail[];
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && 'toNumber' in value) {
    const decimalLike = value as { toNumber?: () => number };
    if (typeof decimalLike.toNumber === 'function') return Number(decimalLike.toNumber());
  }
  return Number(value);
}

function value(units: number): PurchasePlanV3Value {
  return { units: Math.max(0, Math.round(units)) };
}

function toIso(input: Date | string | null): string | null {
  if (input == null) return null;
  return input instanceof Date ? input.toISOString() : new Date(input).toISOString();
}

function parseIntArray(input: number[] | string[] | null | undefined): number[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item))
    .sort((a, b) => a - b);
}

function isYearMonth(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function normalizeHeader(row: HeaderDb): PurchasePlanV3Header {
  return {
    id: row.id,
    label: row.label,
    status: row.status as PurchasePlanV3Header['status'],
    storeGroupCodes: row.storeGroupCodes ?? [],
    departmentNumber: Number(row.departmentNumber),
    departmentLabel: row.departmentLabel,
    year: Number(row.year),
    forecastMethod: row.forecastMethod as ForecastMethod,
    eohMethod: row.eohMethod as EohMethod,
    coverMonths: Number(row.coverMonths),
    discountNormalization: Boolean(row.discountNormalization),
    historyFromYearMonth: row.historyFromYearMonth,
    historyToYearMonth: row.historyToYearMonth,
    warehouseStoreNumbers: parseIntArray(row.warehouseStoreNumbers),
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
    archivedAt: toIso(row.archivedAt),
  };
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function mapStoreChainTagToGroupCodes(tag: string, storeGroups: StoreGroupRow[]): string[] {
  const normalizedTag = normalizeText(tag);
  const out = new Set<string>();
  for (const group of storeGroups) {
    const groupCode = normalizeText(group.code);
    const groupLabel = normalizeText(group.label);
    if (normalizedTag === 'unli' && (groupCode.includes('unlimited') || groupLabel.includes('unlimited'))) {
      out.add(group.code);
    }
    if (normalizedTag === 'magi' && (groupCode.includes('magic') || groupLabel.includes('magic'))) {
      out.add(group.code);
    }
    if (normalizedTag === 'fash' && (groupCode.includes('fashion') || groupLabel.includes('fashion') || groupLabel.includes('magic'))) {
      out.add(group.code);
    }
    if (groupCode === normalizedTag || groupCode.includes(normalizedTag) || groupLabel.includes(normalizedTag)) {
      out.add(group.code);
    }
  }
  return [...out];
}

function isWarehouseStoreGroup(group: StoreGroupRow): boolean {
  const codeLabel = normalizeText(`${group.code} ${group.label ?? ''}`);
  const storeNumbers = parseIntArray(group.storeNumbers);
  return storeNumbers.includes(99)
    || codeLabel.includes('bodega')
    || codeLabel.includes('almacen')
    || codeLabel.includes('warehouse');
}

function stockPosition(position: InventoryPosition): number {
  return Math.max(0, Math.round(
    (position.onHand ?? 0)
    + (position.currentOnOrder ?? 0)
    + (position.futureOnOrder ?? 0)
    + (position.nativeOpenPo ?? 0),
  ));
}

async function loadStoreGroups(codes?: string[]): Promise<StoreGroupRow[]> {
  const rows = await prisma.$queryRawUnsafe<StoreGroupRow[]>(
    `
      SELECT
        sg.code,
        sg.label,
        ARRAY_AGG(sgm.store_number ORDER BY sgm.store_number)
          FILTER (WHERE sgm.store_number IS NOT NULL) AS "storeNumbers"
      FROM app.store_group sg
      LEFT JOIN app.store_group_member sgm ON sgm.group_code = sg.code
      WHERE sg.active = true
        AND ($1::text[] IS NULL OR sg.code = ANY($1::text[]))
      GROUP BY sg.code, sg.label, sg.sort_order
      ORDER BY sg.sort_order, sg.label
    `,
    codes && codes.length > 0 ? codes : null,
  );
  const groups = rows
    .map((row) => ({ ...row, storeNumbers: parseIntArray(row.storeNumbers) }))
    .filter((row) => parseIntArray(row.storeNumbers).length > 0)
    .filter((row) => !isWarehouseStoreGroup(row));
  if (groups.length === 0) {
    throw new PurchasePlanningV3ServiceError(422, 'NO_CHAINS', 'No active store chains with assigned stores were found.');
  }
  return groups;
}

async function loadDepartment(number: number): Promise<DepartmentRow> {
  const rows = await prisma.$queryRawUnsafe<DepartmentRow[]>(
    `
      SELECT number, "desc" AS description
      FROM app.taxonomy_department
      WHERE number = $1
      LIMIT 1
    `,
    number,
  );
  const row = rows[0];
  if (!row) throw new PurchasePlanningV3ServiceError(404, 'DEPARTMENT_NOT_FOUND', `Department not found: ${number}`);
  return row;
}

async function loadLatestDataYearMonth(storeNumbers: number[], fallbackYearMonth: string): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<LatestDataMonthRow[]>(
    `
      SELECT to_char(MAX(snapshot_as_of), 'YYYY-MM') AS "yearMonth"
      FROM app.inventory_history_snapshot
      WHERE store_id = ANY($1::int[])
    `,
    storeNumbers,
  );
  return isYearMonth(rows[0]?.yearMonth) ? rows[0]!.yearMonth! : fallbackYearMonth;
}

async function loadMonthlyFacts(input: {
  storeNumbers: number[];
  departmentNumber: number;
  fromYearMonth: string;
  toYearMonth: string;
}): Promise<HistoryPoint[]> {
  const rows = await prisma.$queryRawUnsafe<MonthlyFactRow[]>(
    `
      WITH src AS (
        SELECT
          m.year_month,
          COALESCE(m.qty_sales, 0)::float8 AS qty_sales,
          COALESCE(m.net_sales, 0)::float8 AS net_sales,
          COALESCE(m.qty_sales, 0)::float8 * COALESCE(k.retail_price, k.list_price, 0)::float8 AS reference_retail,
          COALESCE(m.qty_on_hand, 0)::float8 AS beginning_on_hand
        FROM app.inventory_history_snapshot s
        INNER JOIN app.inventory_history_month m ON m.snapshot_id = s.id
        LEFT JOIN app.sku k ON k.id = s.sku_id
        JOIN app.taxonomy_department d ON k.category_number BETWEEN d.beg_categ AND d.end_categ
        WHERE m.year_month >= $1::text
          AND m.year_month <= $2::text
          AND s.store_id = ANY($3::int[])
          AND d.number = $4

        UNION ALL

        SELECT
          to_char(s.snapshot_as_of, 'YYYY-MM') AS year_month,
          COALESCE(s.month_qty_sales, 0)::float8 AS qty_sales,
          COALESCE(s.month_dol_sales, 0)::float8 AS net_sales,
          COALESCE(s.month_qty_sales, 0)::float8 * COALESCE(k.retail_price, k.list_price, 0)::float8 AS reference_retail,
          COALESCE(s.on_hand, 0)::float8 AS beginning_on_hand
        FROM app.inventory_history_snapshot s
        LEFT JOIN app.sku k ON k.id = s.sku_id
        JOIN app.taxonomy_department d ON k.category_number BETWEEN d.beg_categ AND d.end_categ
        WHERE to_char(s.snapshot_as_of, 'YYYY-MM') >= $1::text
          AND to_char(s.snapshot_as_of, 'YYYY-MM') <= $2::text
          AND s.store_id = ANY($3::int[])
          AND d.number = $4
      )
      SELECT
        year_month AS "yearMonth",
        SUM(qty_sales)::float8 AS "qty",
        SUM(net_sales)::float8 AS "netSales",
        SUM(reference_retail)::float8 AS "referenceRetail",
        SUM(beginning_on_hand)::float8 AS "beginningOnHand"
      FROM src
      WHERE qty_sales <> 0 OR net_sales <> 0 OR beginning_on_hand <> 0
      GROUP BY year_month
      ORDER BY year_month
    `,
    input.fromYearMonth,
    input.toYearMonth,
    input.storeNumbers,
    input.departmentNumber,
  );
  return rows.map((row) => ({
    dimKey: 'demand',
    yearMonth: row.yearMonth,
    qty: toNumber(row.qty),
    netSales: toNumber(row.netSales),
    referenceRetail: toNumber(row.referenceRetail),
    beginningOnHand: toNumber(row.beginningOnHand),
  }));
}

async function loadInventoryPosition(input: {
  storeNumbers: number[];
  departmentNumber: number;
}): Promise<InventoryPosition> {
  const [inventoryRows, openPoRows] = await Promise.all([
    prisma.$queryRawUnsafe<PositionRow[]>(
      `
        SELECT
          SUM(h.on_hand)::int AS "onHand",
          SUM(h.current_on_order)::int AS "currentOnOrder",
          SUM(h.future_on_order)::int AS "futureOnOrder"
        FROM app.inventory_history_snapshot h
        LEFT JOIN app.sku k ON k.id = h.sku_id
        JOIN app.taxonomy_department d ON k.category_number BETWEEN d.beg_categ AND d.end_categ
        WHERE h.store_id = ANY($1::int[])
          AND d.number = $2
      `,
      input.storeNumbers,
      input.departmentNumber,
    ),
    prisma.$queryRawUnsafe<NativeOpenPoRow[]>(
      `
        SELECT
          COALESCE(SUM(GREATEST(pol.quantity_ordered - pol.quantity_received, 0)), 0)::int AS "nativeOpenPo"
        FROM app.purchase_order po
        JOIN app.purchase_order_line pol ON pol.po_id = po.id
        JOIN app.sku k ON k.id = pol.sku_id
        JOIN app.taxonomy_department d ON k.category_number BETWEEN d.beg_categ AND d.end_categ
        WHERE po.status IN ('SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED')
          AND po.ship_to_store_id = ANY($1::int[])
          AND GREATEST(pol.quantity_ordered - pol.quantity_received, 0) > 0
          AND d.number = $2
      `,
      input.storeNumbers,
      input.departmentNumber,
    ),
  ]);
  const inventory = inventoryRows[0];
  return {
    onHand: toNumber(inventory?.onHand),
    currentOnOrder: toNumber(inventory?.currentOnOrder),
    futureOnOrder: toNumber(inventory?.futureOnOrder),
    nativeOpenPo: toNumber(openPoRows[0]?.nativeOpenPo),
  };
}

async function loadWarehouseStoreNumbers(): Promise<number[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ number: unknown }>>(
    `
      SELECT number
      FROM app.store_master
      WHERE number = 99
         OR lower("desc") LIKE '%bodega%'
         OR lower("desc") LIKE '%almac%'
         OR lower("desc") LIKE '%warehouse%'
      ORDER BY number
    `,
  );
  const numbers = rows.map((row) => Number(row.number)).filter((n) => Number.isFinite(n));
  return numbers.length > 0 ? [...new Set(numbers)] : [99];
}

async function loadWarehouseSkuPool(input: {
  warehouseStoreNumbers: number[];
  departmentNumber: number;
  storeGroups: StoreGroupRow[];
}): Promise<WarehousePoolItem[]> {
  if (input.warehouseStoreNumbers.length === 0) return [];
  const rows = await prisma.$queryRawUnsafe<WarehouseSkuRow[]>(
    `
      SELECT
        k.id::text AS "skuId",
        COALESCE(k.code, k.provisional_code, h.sku_code) AS "skuCode",
        COALESCE(k.description_web, k.description_rics, k.style_color) AS description,
        SUM(GREATEST(COALESCE(h.on_hand, 0), 0))::int AS "onHand",
        ARRAY_AGG(DISTINCT av.code) FILTER (WHERE av.code IS NOT NULL) AS "attrCodes",
        MAX(k.keywords) AS keywords
      FROM app.inventory_history_snapshot h
      LEFT JOIN app.sku k ON k.id = h.sku_id
      JOIN app.taxonomy_department d ON k.category_number BETWEEN d.beg_categ AND d.end_categ
      LEFT JOIN app.sku_attribute_assignment saa ON saa.sku_code = COALESCE(k.code, k.provisional_code, h.sku_code)
      LEFT JOIN app.attribute_dimension ad ON ad.id = saa.dimension_id AND ad.code = 'store_chain'
      LEFT JOIN app.attribute_value av ON av.id = saa.value_id AND av.dimension_id = ad.id
      WHERE h.store_id = ANY($1::int[])
        AND d.number = $2
      GROUP BY k.id, COALESCE(k.code, k.provisional_code, h.sku_code), COALESCE(k.description_web, k.description_rics, k.style_color)
      HAVING SUM(GREATEST(COALESCE(h.on_hand, 0), 0)) > 0
      ORDER BY COALESCE(k.code, k.provisional_code, h.sku_code)
    `,
    input.warehouseStoreNumbers,
    input.departmentNumber,
  );

  return rows.map((row) => {
    const tagCandidates = new Set<string>();
    for (const code of row.attrCodes ?? []) tagCandidates.add(String(code));
    const keywords = String(row.keywords ?? '').split(/\s+/).filter(Boolean);
    for (const token of keywords) {
      const upper = token.toUpperCase();
      if (upper === 'MAGI') tagCandidates.add('magi');
      if (upper === 'UNLI') tagCandidates.add('unli');
      if (upper === 'FASH') tagCandidates.add('fash');
    }
    const eligible = new Set<string>();
    for (const tag of tagCandidates) {
      for (const code of mapStoreChainTagToGroupCodes(tag, input.storeGroups)) eligible.add(code);
    }
    if (eligible.size === 0) {
      for (const group of input.storeGroups) eligible.add(group.code);
    }
    const qty = Math.max(0, Math.round(toNumber(row.onHand)));
    return {
      skuCode: row.skuCode,
      skuDescription: row.description,
      remainingQty: qty,
      startingQty: qty,
      eligibleStoreGroupCodes: [...eligible].sort(),
    };
  });
}

export function allocateWarehouseCreditForSeason(
  items: WarehousePoolItem[],
  chainNeeds: Map<string, number>,
): WarehouseSeasonAllocation {
  const creditByChain = new Map<string, number>();
  const eligibleByChain = new Map<string, number>();
  const detailsByChain = new Map<string, PurchasePlanV3WarehouseDetail[]>();
  const unallocatedDetails: PurchasePlanV3WarehouseDetail[] = [];

  for (const item of items) {
    const qty = Math.max(0, Math.round(item.remainingQty));
    if (qty <= 0) continue;
    const itemEligibleChains = item.eligibleStoreGroupCodes.length > 0
      ? item.eligibleStoreGroupCodes
      : [...chainNeeds.keys()];
    const eligibleChains = itemEligibleChains.filter((code) => chainNeeds.has(code));
    if (eligibleChains.length === 0) {
      unallocatedDetails.push({
        skuCode: item.skuCode,
        skuDescription: item.skuDescription,
        startingWarehouseOnHand: item.startingQty,
        eligibleStoreGroupCodes: itemEligibleChains,
        allocatedUnits: 0,
        remainingUnits: qty,
        reason: 'no_selected_chain_need',
      });
      continue;
    }

    for (const chain of eligibleChains) {
      eligibleByChain.set(chain, (eligibleByChain.get(chain) ?? 0) + qty);
    }

    const positiveNeed = eligibleChains
      .map((chain) => Math.max(0, Math.round(chainNeeds.get(chain) ?? 0)))
      .reduce((sum, need) => sum + need, 0);
    if (positiveNeed <= 0) {
      unallocatedDetails.push({
        skuCode: item.skuCode,
        skuDescription: item.skuDescription,
        startingWarehouseOnHand: item.startingQty,
        eligibleStoreGroupCodes: eligibleChains,
        allocatedUnits: 0,
        remainingUnits: qty,
        reason: 'no_selected_chain_need',
      });
      continue;
    }

    const allocatable = Math.min(qty, positiveNeed);
    let allocated = 0;
    const allocations = new Map<string, number>();
    const sortedEligible = eligibleChains.sort();
    for (let i = 0; i < sortedEligible.length; i++) {
      const chain = sortedEligible[i]!;
      const need = Math.max(0, Math.round(chainNeeds.get(chain) ?? 0));
      const chainAllocation = i === sortedEligible.length - 1
        ? allocatable - allocated
        : Math.min(need, Math.floor((allocatable * need) / positiveNeed));
      if (chainAllocation <= 0) continue;
      allocations.set(chain, chainAllocation);
      allocated += chainAllocation;
    }

    item.remainingQty = qty - allocated;
    for (const [chain, chainAllocation] of allocations) {
      creditByChain.set(chain, (creditByChain.get(chain) ?? 0) + chainAllocation);
      const details = detailsByChain.get(chain) ?? [];
      details.push({
        skuCode: item.skuCode,
        skuDescription: item.skuDescription,
        startingWarehouseOnHand: item.startingQty,
        eligibleStoreGroupCodes: eligibleChains,
        allocatedUnits: chainAllocation,
        remainingUnits: item.remainingQty,
        reason: 'eligible_credit',
      });
      detailsByChain.set(chain, details);
    }
  }

  return { creditByChain, eligibleByChain, detailsByChain, unallocatedDetails };
}

function buildProjectionMonths(year: number): string[] {
  return PURCHASE_PLAN_SEASONS.flatMap((season) => buildSeasonMonths(season, year));
}

function monthsBetweenInclusive(fromYearMonth: string, toYearMonth: string): string[] {
  const months: string[] = [];
  let cursor = fromYearMonth;
  while (cursor <= toYearMonth) {
    months.push(cursor);
    cursor = shiftYearMonth(cursor, 1);
  }
  return months;
}

function sumRows(rows: Array<{ projSales: number; eohTarget: number; buy: number; eohActual: number }>, field: 'projSales' | 'eohTarget' | 'buy'): number {
  return rows.reduce((sum, row) => sum + Math.max(0, Math.round(row[field])), 0);
}

async function buildV3Report(input: PurchasePlanV3Request): Promise<PurchasePlanV3Report> {
  const departmentNumber = Math.trunc(Number(input.departmentNumber));
  if (!Number.isInteger(departmentNumber) || departmentNumber <= 0) {
    throw new PurchasePlanningV3ServiceError(400, 'INVALID_DEPARTMENT', 'Department number is required.');
  }
  const year = Math.trunc(Number(input.year));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new PurchasePlanningV3ServiceError(400, 'INVALID_YEAR', 'Report year must be between 2020 and 2100.');
  }

  const forecastMethod = input.forecast?.method ?? DEFAULT_FORECAST_METHOD;
  const eohMethod = input.eohMethod ?? DEFAULT_EOH_METHOD;
  const coverMonths = Math.max(1, Math.round(input.coverMonths ?? DEFAULT_COVER_MONTHS));
  const discountNormalization = input.discountNormalization ?? true;
  const [storeGroups, department, warehouseStoreNumbers] = await Promise.all([
    loadStoreGroups(input.storeGroupCodes),
    loadDepartment(departmentNumber),
    loadWarehouseStoreNumbers(),
  ]);

  const allStoreNumbers = [...new Set(storeGroups.flatMap((group) => parseIntArray(group.storeNumbers)))];
  const firstProjectionMonth = buildSeasonMonths('spring', year)[0]!;
  const fallbackHistoryTo = shiftYearMonth(firstProjectionMonth, -1);
  const latestDataYearMonth = await loadLatestDataYearMonth(allStoreNumbers, fallbackHistoryTo);
  const historyToYearMonth = latestDataYearMonth < fallbackHistoryTo ? latestDataYearMonth : fallbackHistoryTo;
  const historyFromYearMonth = shiftYearMonth(historyToYearMonth, -HISTORY_MONTHS + 1);
  const projectionMonths = buildProjectionMonths(year);
  const coverTailMonths = eohMethod === 'forward'
    ? Array.from({ length: coverMonths }, (_, index) => shiftYearMonth(projectionMonths[projectionMonths.length - 1]!, index + 1))
    : [];
  const forecastMonths = [...new Set([...projectionMonths, ...coverTailMonths])];

  const chainCalculations = await Promise.all(storeGroups.map(async (group) => {
    const storeNumbers = parseIntArray(group.storeNumbers);
    const [history, position] = await Promise.all([
      loadMonthlyFacts({
        storeNumbers,
        departmentNumber,
        fromYearMonth: historyFromYearMonth,
        toYearMonth: historyToYearMonth,
      }),
      loadInventoryPosition({ storeNumbers, departmentNumber }),
    ]);
    const historyForForecast = forecastMethod === 'constrainedDemand'
      ? fillConstrainedDemandHistory(history, ['demand'], monthsBetweenInclusive(historyFromYearMonth, historyToYearMonth))
      : history;
    const normalized = normalizeDiscountDistortedHistory(historyForForecast, discountNormalization);
    const projected = forecast(normalized, forecastMethod, input.forecast ?? {}, forecastMonths);
    const rows = computePlanWithInventoryPosition(
      projected.length ? projected : forecast([{ dimKey: 'demand', yearMonth: historyToYearMonth, qty: 0 }], forecastMethod, input.forecast ?? {}, forecastMonths),
      new Map([['demand', position]]),
      projectionMonths,
      { eohMethod, coverMonths },
    );
    return { group, position, rows };
  }));

  const warehousePool = await loadWarehouseSkuPool({ warehouseStoreNumbers, departmentNumber, storeGroups });
  const seasons: PurchasePlanV3Report['seasons'] = [];
  const warnings: string[] = [];
  let totalUnallocated = 0;

  for (const season of PURCHASE_PLAN_SEASONS) {
    const seasonMonths = buildSeasonMonths(season, year);
    const needs = new Map<string, number>();
    const baselineByChain = new Map<string, {
      projectedBoh: number;
      projectedSales: number;
      eohTarget: number;
      baselineBuy: number;
      projectedEoh: number;
      position: InventoryPosition;
      group: StoreGroupRow;
    }>();

    for (const calc of chainCalculations) {
      const seasonRows = calc.rows.filter((row) => seasonMonths.includes(row.yearMonth));
      const firstRow = seasonRows[0];
      const lastRow = seasonRows[seasonRows.length - 1];
      const baselineBuy = sumRows(seasonRows, 'buy');
      needs.set(calc.group.code, baselineBuy);
      baselineByChain.set(calc.group.code, {
        projectedBoh: Math.max(0, Math.round(firstRow?.boh ?? stockPosition(calc.position))),
        projectedSales: sumRows(seasonRows, 'projSales'),
        eohTarget: sumRows(seasonRows, 'eohTarget'),
        baselineBuy,
        projectedEoh: Math.max(0, Math.round(lastRow?.eohActual ?? 0)),
        position: calc.position,
        group: calc.group,
      });
    }

    const allocation = allocateWarehouseCreditForSeason(warehousePool, needs);
    totalUnallocated += allocation.unallocatedDetails.reduce((sum, detail) => sum + detail.remainingUnits, 0);
    const rows: PurchasePlanV3SeasonRow[] = [];
    for (const calc of chainCalculations) {
      const baseline = baselineByChain.get(calc.group.code)!;
      const credit = Math.min(baseline.baselineBuy, allocation.creditByChain.get(calc.group.code) ?? 0);
      const recommendedBuy = Math.max(0, baseline.baselineBuy - credit);
      rows.push({
        storeGroupCode: calc.group.code,
        storeGroupLabel: calc.group.label,
        season,
        seasonYear: year,
        seasonLabel: `${seasonLabel(season)} ${year}`,
        seasonMonths,
        projectedBoh: value(baseline.projectedBoh),
        projectedSales: value(baseline.projectedSales),
        eohTarget: value(baseline.eohTarget),
        baselineBuy: value(baseline.baselineBuy),
        chainOnHand: value(calc.position.onHand),
        currentOnOrder: value(calc.position.currentOnOrder),
        futureOnOrder: value(calc.position.futureOnOrder),
        nativeOpenPo: value(calc.position.nativeOpenPo),
        stockPosition: value(stockPosition(calc.position)),
        warehouseEligible: value(allocation.eligibleByChain.get(calc.group.code) ?? 0),
        warehousePlanningCredit: value(credit),
        warehouseUnallocated: value(0),
        totalAvailableForPlan: value(baseline.projectedBoh + credit),
        recommendedBuy: value(recommendedBuy),
        projectedEoh: value(baseline.projectedEoh),
        warehouseDetails: allocation.detailsByChain.get(calc.group.code) ?? [],
      });
    }
    seasons.push({
      season,
      seasonYear: year,
      seasonLabel: `${seasonLabel(season)} ${year}`,
      months: seasonMonths,
      rows,
    });
  }

  const remainingWarehouse = warehousePool.reduce((sum, item) => sum + item.remainingQty, 0);
  if (remainingWarehouse > 0) warnings.push(`${remainingWarehouse} warehouse units remain unused after demand fair-share planning for the selected chains/year.`);
  if (warehouseStoreNumbers.length > 0) warnings.push(`Warehouse planning credit considered store(s): ${warehouseStoreNumbers.join(', ')}.`);

  const totals = seasons.flatMap((season) => season.rows).reduce(
    (acc, row) => {
      acc.projectedSales.units += row.projectedSales.units;
      acc.baselineBuy.units += row.baselineBuy.units;
      acc.warehousePlanningCredit.units += row.warehousePlanningCredit.units;
      acc.recommendedBuy.units += row.recommendedBuy.units;
      return acc;
    },
    {
      projectedSales: value(0),
      baselineBuy: value(0),
      warehousePlanningCredit: value(0),
      recommendedBuy: value(0),
      warehouseUnallocated: value(remainingWarehouse),
    },
  );

  return {
    storeGroups: storeGroups.map((group) => ({
      code: group.code,
      label: group.label,
      storeNumbers: parseIntArray(group.storeNumbers),
    })),
    departmentNumber,
    departmentLabel: `${department.number} - ${department.description}`,
    year,
    forecastMethod,
    eohMethod,
    coverMonths,
    discountNormalization,
    historyFromYearMonth,
    historyToYearMonth,
    warehouseStoreNumbers,
    seasons,
    totals,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

export async function generatePurchasePlanV3Report(input: PurchasePlanV3Request): Promise<PurchasePlanV3Report> {
  return buildV3Report(input);
}

function defaultLabel(report: PurchasePlanV3Report): string {
  const chains = report.storeGroups.map((group) => group.label).join(' + ');
  return `V3 ${chains} ${report.departmentLabel} ${report.year}`;
}

export async function createPurchasePlanV3(input: PurchasePlanV3Request): Promise<PurchasePlanV3Report> {
  const report = await buildV3Report(input);
  const actor = input.createdBy?.trim() || 'system';
  const label = input.label?.trim() || defaultLabel(report);
  const planId = await prisma.$transaction(async (tx) => {
    const inserted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `
        INSERT INTO app.purchase_plan_v3 (
          label, store_group_codes, department_number, department_label, year,
          forecast_method, eoh_method, cover_months, discount_normalization,
          history_from_year_month, history_to_year_month, warehouse_store_numbers, created_by
        )
        VALUES ($1, $2::text[], $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::int[], $13)
        RETURNING id::text
      `,
      label,
      report.storeGroups.map((group) => group.code),
      report.departmentNumber,
      report.departmentLabel,
      report.year,
      report.forecastMethod,
      report.eohMethod,
      report.coverMonths,
      report.discountNormalization,
      report.historyFromYearMonth,
      report.historyToYearMonth,
      report.warehouseStoreNumbers,
      actor,
    );
    const id = inserted[0]?.id;
    if (!id) throw new Error('Purchase plan v3 insert did not return an id.');
    for (const season of report.seasons) {
      for (const row of season.rows) {
        await tx.$executeRawUnsafe(
          `
            INSERT INTO app.purchase_plan_v3_row (
              plan_id, store_group_code, store_group_label, season, season_year, season_months,
              projected_boh, projected_sales, eoh_target, baseline_buy,
              chain_on_hand, current_on_order, future_on_order, native_open_po, stock_position,
              warehouse_eligible, warehouse_planning_credit, warehouse_unallocated,
              total_available_for_plan, recommended_buy, projected_eoh, metadata
            )
            VALUES (
              $1::uuid, $2, $3, $4, $5, $6::text[],
              $7, $8, $9, $10,
              $11, $12, $13, $14, $15,
              $16, $17, $18,
              $19, $20, $21, $22::jsonb
            )
          `,
          id,
          row.storeGroupCode,
          row.storeGroupLabel,
          row.season,
          row.seasonYear,
          row.seasonMonths,
          row.projectedBoh.units,
          row.projectedSales.units,
          row.eohTarget.units,
          row.baselineBuy.units,
          row.chainOnHand.units,
          row.currentOnOrder.units,
          row.futureOnOrder.units,
          row.nativeOpenPo.units,
          row.stockPosition.units,
          row.warehouseEligible.units,
          row.warehousePlanningCredit.units,
          row.warehouseUnallocated.units,
          row.totalAvailableForPlan.units,
          row.recommendedBuy.units,
          row.projectedEoh.units,
          JSON.stringify({ warehouseDetails: row.warehouseDetails }),
        );
      }
    }
    await tx.$executeRawUnsafe(
      `
        INSERT INTO app.purchase_plan_v3_audit (plan_id, action, actor, after_json)
        VALUES ($1::uuid, 'create', $2, $3::jsonb)
      `,
      id,
      actor,
      JSON.stringify({ label, rows: report.seasons.flatMap((season) => season.rows).length }),
    );
    return id;
  });
  return getPurchasePlanV3(planId);
}

async function loadHeader(id: string): Promise<PurchasePlanV3Header> {
  const rows = await prisma.$queryRawUnsafe<HeaderDb[]>(
    `
      SELECT
        id::text,
        label,
        status,
        store_group_codes AS "storeGroupCodes",
        department_number AS "departmentNumber",
        department_label AS "departmentLabel",
        year,
        forecast_method AS "forecastMethod",
        eoh_method AS "eohMethod",
        cover_months AS "coverMonths",
        discount_normalization AS "discountNormalization",
        history_from_year_month AS "historyFromYearMonth",
        history_to_year_month AS "historyToYearMonth",
        warehouse_store_numbers AS "warehouseStoreNumbers",
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        archived_at AS "archivedAt"
      FROM app.purchase_plan_v3
      WHERE id = $1::uuid
      LIMIT 1
    `,
    id,
  );
  const row = rows[0];
  if (!row) throw new PurchasePlanningV3ServiceError(404, 'PLAN_NOT_FOUND', 'Purchase planning V3 plan not found.');
  return normalizeHeader(row);
}

function detailsFromMetadata(metadata: unknown): PurchasePlanV3WarehouseDetail[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = metadata as { warehouseDetails?: unknown };
  return Array.isArray(raw.warehouseDetails) ? raw.warehouseDetails as PurchasePlanV3WarehouseDetail[] : [];
}

async function loadRows(planId: string): Promise<PurchasePlanV3SeasonRow[]> {
  const rows = await prisma.$queryRawUnsafe<RowDb[]>(
    `
      SELECT
        id::text,
        plan_id::text AS "planId",
        store_group_code AS "storeGroupCode",
        store_group_label AS "storeGroupLabel",
        season,
        season_year AS "seasonYear",
        season_months AS "seasonMonths",
        projected_boh AS "projectedBoh",
        projected_sales AS "projectedSales",
        eoh_target AS "eohTarget",
        baseline_buy AS "baselineBuy",
        chain_on_hand AS "chainOnHand",
        current_on_order AS "currentOnOrder",
        future_on_order AS "futureOnOrder",
        native_open_po AS "nativeOpenPo",
        stock_position AS "stockPosition",
        warehouse_eligible AS "warehouseEligible",
        warehouse_planning_credit AS "warehousePlanningCredit",
        warehouse_unallocated AS "warehouseUnallocated",
        total_available_for_plan AS "totalAvailableForPlan",
        recommended_buy AS "recommendedBuy",
        projected_eoh AS "projectedEoh",
        metadata
      FROM app.purchase_plan_v3_row
      WHERE plan_id = $1::uuid
      ORDER BY season_year, array_position(ARRAY['spring','summer','fall','winter']::text[], season), store_group_label
    `,
    planId,
  );
  return rows.map((row) => ({
    id: row.id,
    planId: row.planId,
    storeGroupCode: row.storeGroupCode,
    storeGroupLabel: row.storeGroupLabel,
    season: row.season as PurchasePlanSeason,
    seasonYear: Number(row.seasonYear),
    seasonLabel: `${seasonLabel(row.season as PurchasePlanSeason)} ${row.seasonYear}`,
    seasonMonths: row.seasonMonths,
    projectedBoh: value(row.projectedBoh),
    projectedSales: value(row.projectedSales),
    eohTarget: value(row.eohTarget),
    baselineBuy: value(row.baselineBuy),
    chainOnHand: value(row.chainOnHand),
    currentOnOrder: value(row.currentOnOrder),
    futureOnOrder: value(row.futureOnOrder),
    nativeOpenPo: value(row.nativeOpenPo),
    stockPosition: value(row.stockPosition),
    warehouseEligible: value(row.warehouseEligible),
    warehousePlanningCredit: value(row.warehousePlanningCredit),
    warehouseUnallocated: value(row.warehouseUnallocated),
    totalAvailableForPlan: value(row.totalAvailableForPlan),
    recommendedBuy: value(row.recommendedBuy),
    projectedEoh: value(row.projectedEoh),
    warehouseDetails: detailsFromMetadata(row.metadata),
  }));
}

export async function getPurchasePlanV3(id: string): Promise<PurchasePlanV3Report> {
  const [plan, rows] = await Promise.all([loadHeader(id), loadRows(id)]);
  const seasons = PURCHASE_PLAN_SEASONS.map((season) => {
    const seasonRows = rows.filter((row) => row.season === season);
    return {
      season,
      seasonYear: plan.year,
      seasonLabel: `${seasonLabel(season)} ${plan.year}`,
      months: buildSeasonMonths(season, plan.year),
      rows: seasonRows,
    };
  });
  const totals = rows.reduce(
    (acc, row) => {
      acc.projectedSales.units += row.projectedSales.units;
      acc.baselineBuy.units += row.baselineBuy.units;
      acc.warehousePlanningCredit.units += row.warehousePlanningCredit.units;
      acc.recommendedBuy.units += row.recommendedBuy.units;
      acc.warehouseUnallocated.units += row.warehouseUnallocated.units;
      return acc;
    },
    {
      projectedSales: value(0),
      baselineBuy: value(0),
      warehousePlanningCredit: value(0),
      recommendedBuy: value(0),
      warehouseUnallocated: value(0),
    },
  );
  return {
    plan,
    storeGroups: plan.storeGroupCodes.map((code) => ({
      code,
      label: rows.find((row) => row.storeGroupCode === code)?.storeGroupLabel ?? code,
      storeNumbers: [],
    })),
    departmentNumber: plan.departmentNumber,
    departmentLabel: plan.departmentLabel,
    year: plan.year,
    forecastMethod: plan.forecastMethod,
    eohMethod: plan.eohMethod,
    coverMonths: plan.coverMonths,
    discountNormalization: plan.discountNormalization,
    historyFromYearMonth: plan.historyFromYearMonth,
    historyToYearMonth: plan.historyToYearMonth,
    warehouseStoreNumbers: plan.warehouseStoreNumbers,
    seasons,
    totals,
    warnings: [],
    generatedAt: plan.updatedAt,
  };
}

export async function listPurchasePlansV3(params: {
  status?: 'draft' | 'archived' | 'all';
} = {}): Promise<PurchasePlanV3ListItem[]> {
  const rows = await prisma.$queryRawUnsafe<Array<HeaderDb & {
    rowCount: unknown;
    recommendedBuy: unknown;
    warehousePlanningCredit: unknown;
  }>>(
    `
      SELECT
        p.id::text,
        p.label,
        p.status,
        p.store_group_codes AS "storeGroupCodes",
        p.department_number AS "departmentNumber",
        p.department_label AS "departmentLabel",
        p.year,
        p.forecast_method AS "forecastMethod",
        p.eoh_method AS "eohMethod",
        p.cover_months AS "coverMonths",
        p.discount_normalization AS "discountNormalization",
        p.history_from_year_month AS "historyFromYearMonth",
        p.history_to_year_month AS "historyToYearMonth",
        p.warehouse_store_numbers AS "warehouseStoreNumbers",
        p.created_by AS "createdBy",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        p.archived_at AS "archivedAt",
        COUNT(r.id)::int AS "rowCount",
        COALESCE(SUM(r.recommended_buy), 0)::int AS "recommendedBuy",
        COALESCE(SUM(r.warehouse_planning_credit), 0)::int AS "warehousePlanningCredit"
      FROM app.purchase_plan_v3 p
      LEFT JOIN app.purchase_plan_v3_row r ON r.plan_id = p.id
      WHERE ($1::text IS NULL OR p.status = $1::text)
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `,
    params.status && params.status !== 'all' ? params.status : null,
  );
  return rows.map((row) => ({
    ...normalizeHeader(row),
    rowCount: toNumber(row.rowCount),
    recommendedBuy: toNumber(row.recommendedBuy),
    warehousePlanningCredit: toNumber(row.warehousePlanningCredit),
  }));
}

export async function archivePurchasePlanV3(planId: string, actor = 'system'): Promise<PurchasePlanV3Report> {
  await prisma.$transaction(async (tx) => {
    const before = await loadHeader(planId);
    await tx.$executeRawUnsafe(
      `
        UPDATE app.purchase_plan_v3
        SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      planId,
    );
    await tx.$executeRawUnsafe(
      `
        INSERT INTO app.purchase_plan_v3_audit (plan_id, action, actor, before_json, after_json)
        VALUES ($1::uuid, 'archive', $2, $3::jsonb, $4::jsonb)
      `,
      planId,
      actor,
      JSON.stringify(before),
      JSON.stringify({ status: 'archived' }),
    );
  });
  return getPurchasePlanV3(planId);
}
