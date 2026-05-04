import { prisma } from '../../db/prisma';
import { forecast, shiftYearMonth } from './forecast';
import { computePlanWithInventoryPosition } from './compute';
import { applySeasonTotalAdjustment } from './adjustments';
import {
  normalizeDiscountDistortedHistory,
  summarizeNormalizationByDimMonth,
  type NormalizedHistoryPoint,
} from './normalization';
import {
  buildSeasonMonths,
  buildSeasonWindowFromYearMonth,
  defaultPlanLabel,
  resolveYearMonth,
  type PurchasePlanSeasonWindowItem,
} from './season';
import type {
  EohMethod,
  ForecastParams,
  ForecastMethod,
  HistoryPoint,
  InventoryPosition,
  ProjectedPoint,
  PurchasePlanAdjustment,
  PurchasePlanAdjustmentRequest,
  PurchasePlanCompareResponse,
  PurchasePlanCreateRequest,
  PurchasePlanDepartmentSummary,
  PurchasePlanDetailResponse,
  PurchasePlanHeader,
  PurchasePlanListItem,
  PurchasePlanPlanningScope,
  PurchasePlanRowsUpdateRequest,
  PurchasePlanRowUpdateRequest,
  PurchasePlanSavedRow,
  PurchasePlanSeason,
  PurchasePlanningSeasonalReportRequest,
  SeasonalPurchaseReportResponse,
  SeasonalPurchaseReportValue,
  SeasonalPurchaseReportWorksheet,
} from './types';

interface DbClient {
  $queryRawUnsafe: typeof prisma.$queryRawUnsafe;
  $executeRawUnsafe: typeof prisma.$executeRawUnsafe;
}

const DEFAULT_FORECAST_METHOD: ForecastMethod = 'holtWinters';
const DEFAULT_EOH_METHOD: EohMethod = 'forward';
const DEFAULT_COVER_MONTHS = 3;
const HISTORY_MONTHS = 36;
const REPORT_QUERY_TRANSACTION_TIMEOUT_MS = 120_000;
const UNMAPPED_KEY = 'unmapped';
const UNMAPPED_LABEL = 'Unmapped';
const ENTERPRISE_SCOPE: PurchasePlanPlanningScope = 'enterprise';
const STORE_GROUP_SCOPE: PurchasePlanPlanningScope = 'store_group';
const ENTERPRISE_CODE = 'enterprise';
const ENTERPRISE_LABEL = 'Enterprise-wide';
const ENTERPRISE_WORKBOOK_MONTHS = 15;

export class PurchasePlanningServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isPurchasePlanningServiceError(err: unknown): err is PurchasePlanningServiceError {
  return err instanceof PurchasePlanningServiceError;
}

async function withPlanningQuerySettings<T>(fn: (db: DbClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL max_parallel_workers_per_gather = 0');
    return fn(tx);
  }, { timeout: REPORT_QUERY_TRANSACTION_TIMEOUT_MS });
}

interface StoreGroupRow {
  code: string;
  label: string | null;
  storeNumbers: number[] | string[] | null;
}

interface DepartmentRow {
  number: number;
  description: string;
}

interface MonthlyFactRow {
  departmentKey: string | null;
  departmentNumber: number | null;
  departmentLabel: string | null;
  yearMonth: string;
  qty: unknown;
  netSales: unknown;
  referenceRetail: unknown;
}

interface PositionRow {
  departmentKey: string | null;
  departmentNumber: number | null;
  departmentLabel: string | null;
  onHand: unknown;
  currentOnOrder: unknown;
  futureOnOrder: unknown;
}

interface NativeOpenPoRow {
  departmentKey: string | null;
  nativeOpenPo: unknown;
}

interface LatestDataMonthRow {
  yearMonth: string | null;
}

interface PlanHeaderRow {
  id: string;
  label: string;
  status: string;
  planningScope: string | null;
  scopeLabel: string | null;
  storeGroupCode: string | null;
  storeGroupLabel: string | null;
  season: string;
  seasonYear: number;
  seasonMonths: string[] | null;
  selectedDepartments: number[] | string[] | null;
  forecastMethod: string;
  eohMethod: string;
  coverMonths: number;
  discountNormalization: boolean;
  historyFromYearMonth: string;
  historyToYearMonth: string;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  archivedAt: Date | string | null;
}

interface ReportWorksheetRow {
  id: string;
  label: string;
  matchCount: unknown;
}

interface ReportPoBucketRow {
  status: string;
  yearMonth: string;
  units: unknown;
  costHnl: unknown;
}

interface ReportUnitCostRow {
  unitCostHnl: unknown;
}

interface SavedRowDb {
  id: string;
  planId: string;
  departmentKey: string;
  departmentNumber: number | null;
  departmentLabel: string;
  yearMonth: string;
  baselineBoh: number;
  baselineProjSales: number;
  baselineEohTarget: number;
  baselineBuy: number;
  baselineEohActual: number;
  currentBoh: number;
  currentProjSales: number;
  currentEohTarget: number;
  currentBuy: number;
  currentEohActual: number;
  onHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  nativeOpenPo: number;
  stockPosition: number;
  normalizationFactor: unknown;
  rawProjSales: number | null;
}

interface AdjustmentDb {
  id: string;
  planId: string;
  departmentKey: string;
  kind: string;
  value: unknown;
  reason: string;
  appliedBy: string;
  appliedAt: Date | string;
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

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseIntArray(value: number[] | string[] | null): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item))
    .sort((a, b) => a - b);
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value)))].sort((a, b) => a - b);
}

function normalizeDepartmentKey(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '0' || raw.toLowerCase() === UNMAPPED_KEY) return UNMAPPED_KEY;
  return raw;
}

function isYearMonth(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function earlierYearMonth(a: string, b: string): string {
  return a <= b ? a : b;
}

function monthsBetweenExclusive(startYearMonth: string, endYearMonth: string): string[] {
  const out: string[] = [];
  let cursor = shiftYearMonth(startYearMonth, 1);
  while (cursor < endYearMonth) {
    out.push(cursor);
    cursor = shiftYearMonth(cursor, 1);
  }
  return out;
}

function monthsAfter(startYearMonth: string, count: number): string[] {
  const out: string[] = [];
  for (let offset = 1; offset <= Math.max(0, Math.round(count)); offset++) {
    out.push(shiftYearMonth(startYearMonth, offset));
  }
  return out;
}

function departmentLabel(number: number | null, label: string | null | undefined): string {
  if (number == null) return UNMAPPED_LABEL;
  const clean = label?.trim();
  return clean ? `${number} - ${clean}` : String(number);
}

function normalizeHeader(row: PlanHeaderRow): PurchasePlanHeader {
  const planningScope: PurchasePlanPlanningScope = row.planningScope === ENTERPRISE_SCOPE
    ? ENTERPRISE_SCOPE
    : STORE_GROUP_SCOPE;
  const planningScopeLabel = row.scopeLabel?.trim()
    || (planningScope === ENTERPRISE_SCOPE
      ? ENTERPRISE_LABEL
      : row.storeGroupLabel ?? row.storeGroupCode ?? 'Chain');
  return {
    id: row.id,
    label: row.label,
    status: row.status as PurchasePlanHeader['status'],
    planningScope,
    planningScopeLabel,
    storeGroupCode: row.storeGroupCode ?? (planningScope === ENTERPRISE_SCOPE ? ENTERPRISE_CODE : ''),
    storeGroupLabel: planningScope === ENTERPRISE_SCOPE ? ENTERPRISE_LABEL : row.storeGroupLabel,
    season: row.season as PurchasePlanSeason,
    seasonYear: Number(row.seasonYear),
    seasonMonths: row.seasonMonths ?? [],
    selectedDepartments: parseIntArray(row.selectedDepartments),
    forecastMethod: row.forecastMethod as ForecastMethod,
    eohMethod: row.eohMethod as EohMethod,
    coverMonths: Number(row.coverMonths),
    discountNormalization: Boolean(row.discountNormalization),
    historyFromYearMonth: row.historyFromYearMonth,
    historyToYearMonth: row.historyToYearMonth,
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
    archivedAt: toIso(row.archivedAt),
  };
}

function normalizeSavedRow(row: SavedRowDb): PurchasePlanSavedRow {
  return {
    id: row.id,
    planId: row.planId,
    departmentKey: row.departmentKey,
    departmentNumber: row.departmentNumber == null ? null : Number(row.departmentNumber),
    departmentLabel: row.departmentLabel,
    yearMonth: row.yearMonth,
    baselineBoh: Number(row.baselineBoh),
    baselineProjSales: Number(row.baselineProjSales),
    baselineEohTarget: Number(row.baselineEohTarget),
    baselineBuy: Number(row.baselineBuy),
    baselineEohActual: Number(row.baselineEohActual),
    currentBoh: Number(row.currentBoh),
    currentProjSales: Number(row.currentProjSales),
    currentEohTarget: Number(row.currentEohTarget),
    currentBuy: Number(row.currentBuy),
    currentEohActual: Number(row.currentEohActual),
    onHand: Number(row.onHand),
    currentOnOrder: Number(row.currentOnOrder),
    futureOnOrder: Number(row.futureOnOrder),
    nativeOpenPo: Number(row.nativeOpenPo),
    stockPosition: Number(row.stockPosition),
    normalizationFactor: row.normalizationFactor == null ? null : toNumber(row.normalizationFactor),
    rawProjSales: row.rawProjSales == null ? null : Number(row.rawProjSales),
  };
}

function normalizeAdjustment(row: AdjustmentDb): PurchasePlanAdjustment {
  return {
    id: row.id,
    planId: row.planId,
    departmentKey: row.departmentKey,
    kind: row.kind as PurchasePlanAdjustment['kind'],
    value: toNumber(row.value),
    reason: row.reason,
    appliedBy: row.appliedBy,
    appliedAt: toIso(row.appliedAt)!,
  };
}

function summarizeRows(
  rows: PurchasePlanSavedRow[],
  adjustments: PurchasePlanAdjustment[],
): Omit<PurchasePlanDetailResponse, 'plan'> {
  const byDepartment = new Map<string, PurchasePlanDepartmentSummary>();
  const adjustedDepartments = new Set(adjustments.map((item) => item.departmentKey));
  for (const row of rows) {
    let summary = byDepartment.get(row.departmentKey);
    if (!summary) {
      summary = {
        departmentKey: row.departmentKey,
        departmentNumber: row.departmentNumber,
        departmentLabel: row.departmentLabel,
        baselineTotalBuy: 0,
        currentTotalBuy: 0,
        deltaBuy: 0,
        totalProjSales: 0,
        currentOnHand: row.onHand,
        currentOnOrder: row.currentOnOrder,
        futureOnOrder: row.futureOnOrder,
        nativeOpenPo: row.nativeOpenPo,
        hasHistory: row.baselineProjSales > 0 || adjustedDepartments.has(row.departmentKey),
        months: [],
      };
      byDepartment.set(row.departmentKey, summary);
    }
    summary.months.push(row);
    summary.baselineTotalBuy += row.baselineBuy;
    summary.currentTotalBuy += row.currentBuy;
    summary.totalProjSales += row.currentProjSales;
    summary.hasHistory = summary.hasHistory || row.baselineProjSales > 0;
  }

  const departments = [...byDepartment.values()]
    .map((summary) => ({
      ...summary,
      deltaBuy: summary.currentTotalBuy - summary.baselineTotalBuy,
      months: summary.months.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)),
    }))
    .sort((a, b) => {
      const an = a.departmentNumber ?? 9999;
      const bn = b.departmentNumber ?? 9999;
      return an - bn || a.departmentLabel.localeCompare(b.departmentLabel);
    });

  const totals = departments.reduce(
    (acc, department) => {
      acc.baselineTotalBuy += department.baselineTotalBuy;
      acc.currentTotalBuy += department.currentTotalBuy;
      acc.totalProjSales += department.totalProjSales;
      return acc;
    },
    { baselineTotalBuy: 0, currentTotalBuy: 0, deltaBuy: 0, totalProjSales: 0 },
  );
  totals.deltaBuy = totals.currentTotalBuy - totals.baselineTotalBuy;
  return { departments, adjustments, totals };
}

async function getStoreGroup(code: string, db: DbClient = prisma): Promise<StoreGroupRow> {
  const rows = await db.$queryRawUnsafe<StoreGroupRow[]>(
    `
      SELECT
        sg.code,
        sg.label,
        ARRAY_AGG(sgm.store_number ORDER BY sgm.store_number)
          FILTER (WHERE sgm.store_number IS NOT NULL) AS "storeNumbers"
      FROM app.store_group sg
      LEFT JOIN app.store_group_member sgm ON sgm.group_code = sg.code
      WHERE sg.code = $1
      GROUP BY sg.code, sg.label
      LIMIT 1
    `,
    code,
  );
  const row = rows[0];
  if (!row) throw new PurchasePlanningServiceError(404, 'CHAIN_NOT_FOUND', 'Store chain not found.');
  if (parseIntArray(row.storeNumbers).length === 0) {
    throw new PurchasePlanningServiceError(422, 'CHAIN_HAS_NO_STORES', 'Store chain has no assigned stores.');
  }
  return row;
}

function isWarehouseStoreGroup(group: StoreGroupRow): boolean {
  const code = group.code.toLowerCase();
  const label = (group.label ?? '').toLowerCase();
  const storeNumbers = parseIntArray(group.storeNumbers);
  return storeNumbers.includes(99)
    || code.includes('bodega')
    || code.includes('almacen')
    || code.includes('warehouse')
    || label.includes('bodega')
    || label.includes('almacen')
    || label.includes('almacén')
    || label.includes('warehouse');
}

async function loadEnterpriseDemandStoreGroups(db: DbClient = prisma): Promise<StoreGroupRow[]> {
  const rows = await db.$queryRawUnsafe<StoreGroupRow[]>(
    `
      SELECT
        sg.code,
        sg.label,
        ARRAY_AGG(sgm.store_number ORDER BY sgm.store_number)
          FILTER (WHERE sgm.store_number IS NOT NULL) AS "storeNumbers"
      FROM app.store_group sg
      LEFT JOIN app.store_group_member sgm ON sgm.group_code = sg.code
      WHERE sg.active = true
      GROUP BY sg.code, sg.label, sg.sort_order
      ORDER BY sg.sort_order, sg.label
    `,
  );
  const groups = rows
    .map((row) => ({ ...row, storeNumbers: parseIntArray(row.storeNumbers) }))
    .filter((row) => parseIntArray(row.storeNumbers).length > 0)
    .filter((row) => !isWarehouseStoreGroup(row));
  if (groups.length === 0) {
    throw new PurchasePlanningServiceError(422, 'NO_ENTERPRISE_STORES', 'No active selling stores were found for enterprise planning.');
  }
  return groups;
}

async function loadWarehouseStoreNumbers(db: DbClient = prisma): Promise<number[]> {
  const rows = await db.$queryRawUnsafe<Array<{ number: unknown }>>(
    `
      SELECT number
      FROM app.store_master
      WHERE number = 99
         OR "desc" ILIKE '%BODEGA%'
         OR "desc" ILIKE '%ALMACEN%'
         OR "desc" ILIKE '%ALMAC%'
         OR "desc" ILIKE '%WAREHOUSE%'
      ORDER BY number
    `,
  );
  const numbers = rows.map((row) => Number(row.number)).filter((number) => Number.isInteger(number));
  return numbers.length > 0 ? uniqueSortedNumbers(numbers) : [99];
}

async function loadDepartments(departmentNumbers: number[], db: DbClient = prisma): Promise<Map<string, { number: number; label: string }>> {
  const rows = await db.$queryRawUnsafe<DepartmentRow[]>(
    `
      SELECT number, "desc" AS description
      FROM app.taxonomy_department
      WHERE number = ANY($1::int[])
      ORDER BY number
    `,
    departmentNumbers,
  );
  const out = new Map<string, { number: number; label: string }>();
  for (const row of rows) {
    out.set(String(row.number), { number: Number(row.number), label: departmentLabel(Number(row.number), row.description) });
  }
  return out;
}

async function loadMonthlyFacts(params: {
  storeNumbers: number[];
  departmentNumbers: number[];
  fromYearMonth: string;
  toYearMonth: string;
  includeUnmapped?: boolean;
}, db: DbClient = prisma): Promise<{ history: HistoryPoint[]; labelByKey: Map<string, string>; numberByKey: Map<string, number | null> }> {
  const rows = await db.$queryRawUnsafe<MonthlyFactRow[]>(
    `
WITH src AS (
  SELECT
    s.store_id,
    COALESCE(d.number::text, 'unmapped') AS department_key,
    d.number AS department_number,
    d."desc" AS department_label,
    m.year_month,
    COALESCE(m.qty_sales, 0)::float8 AS qty_sales,
    COALESCE(m.net_sales, 0)::float8 AS net_sales,
    COALESCE(m.qty_sales, 0)::float8 * COALESCE(k.retail_price, k.list_price, 0)::float8 AS reference_retail
  FROM app.inventory_history_snapshot s
  INNER JOIN app.inventory_history_month m ON m.snapshot_id = s.id
  LEFT JOIN app.sku k ON k.id = s.sku_id
  LEFT JOIN app.taxonomy_department d ON k.category_number BETWEEN d.beg_categ AND d.end_categ
  WHERE m.year_month >= $1::text
    AND m.year_month <= $2::text
    AND s.store_id = ANY($3::int[])
    AND (d.number = ANY($4::int[]) OR ($5::boolean AND d.number IS NULL))

  UNION ALL

  SELECT
    s.store_id,
    COALESCE(d.number::text, 'unmapped') AS department_key,
    d.number AS department_number,
    d."desc" AS department_label,
    to_char(s.snapshot_as_of, 'YYYY-MM') AS year_month,
    COALESCE(s.month_qty_sales, 0)::float8 AS qty_sales,
    COALESCE(s.month_dol_sales, 0)::float8 AS net_sales,
    COALESCE(s.month_qty_sales, 0)::float8 * COALESCE(k.retail_price, k.list_price, 0)::float8 AS reference_retail
  FROM app.inventory_history_snapshot s
  LEFT JOIN app.sku k ON k.id = s.sku_id
  LEFT JOIN app.taxonomy_department d ON k.category_number BETWEEN d.beg_categ AND d.end_categ
  WHERE to_char(s.snapshot_as_of, 'YYYY-MM') >= $1::text
    AND to_char(s.snapshot_as_of, 'YYYY-MM') <= $2::text
    AND s.store_id = ANY($3::int[])
    AND (d.number = ANY($4::int[]) OR ($5::boolean AND d.number IS NULL))
)
SELECT
  department_key AS "departmentKey",
  department_number AS "departmentNumber",
  department_label AS "departmentLabel",
  year_month AS "yearMonth",
  SUM(qty_sales)::float8 AS "qty",
  SUM(net_sales)::float8 AS "netSales",
  SUM(reference_retail)::float8 AS "referenceRetail"
FROM src
WHERE qty_sales <> 0 OR net_sales <> 0
GROUP BY department_key, department_number, department_label, year_month
ORDER BY department_key, year_month
    `,
    params.fromYearMonth,
    params.toYearMonth,
    params.storeNumbers,
    params.departmentNumbers,
    params.includeUnmapped ?? false,
  );

  const labelByKey = new Map<string, string>();
  const numberByKey = new Map<string, number | null>();
  const history: HistoryPoint[] = rows.map((row) => {
    const key = normalizeDepartmentKey(row.departmentKey);
    const number = row.departmentNumber == null ? null : Number(row.departmentNumber);
    labelByKey.set(key, departmentLabel(number, row.departmentLabel));
    numberByKey.set(key, number);
    return {
      dimKey: key,
      yearMonth: row.yearMonth,
      qty: toNumber(row.qty),
      netSales: toNumber(row.netSales),
      referenceRetail: toNumber(row.referenceRetail),
    };
  });
  return { history, labelByKey, numberByKey };
}

async function loadInventoryPositions(params: {
  storeNumbers: number[];
  departmentNumbers: number[];
  includeUnmapped?: boolean;
}, db: DbClient = prisma): Promise<Map<string, InventoryPosition>> {
  const inventoryRows = await db.$queryRawUnsafe<PositionRow[]>(
      `
        SELECT
          COALESCE(d.number::text, 'unmapped') AS "departmentKey",
          d.number AS "departmentNumber",
          d."desc" AS "departmentLabel",
          SUM(h.on_hand)::int AS "onHand",
          SUM(h.current_on_order)::int AS "currentOnOrder",
          SUM(h.future_on_order)::int AS "futureOnOrder"
        FROM app.inventory_history_snapshot h
        LEFT JOIN app.sku k ON k.id = h.sku_id
        LEFT JOIN app.taxonomy_department d ON k.category_number BETWEEN d.beg_categ AND d.end_categ
        WHERE h.store_id = ANY($1::int[])
          AND (d.number = ANY($2::int[]) OR ($3::boolean AND d.number IS NULL))
        GROUP BY COALESCE(d.number::text, 'unmapped'), d.number, d."desc"
      `,
      params.storeNumbers,
      params.departmentNumbers,
      params.includeUnmapped ?? false,
    );
  const openPoRows = await db.$queryRawUnsafe<NativeOpenPoRow[]>(
      `
        SELECT
          COALESCE(d.number::text, 'unmapped') AS "departmentKey",
          COALESCE(SUM(GREATEST(pol.quantity_ordered - pol.quantity_received, 0)), 0)::int AS "nativeOpenPo"
        FROM app.purchase_order po
        JOIN app.purchase_order_line pol ON pol.po_id = po.id
        JOIN app.sku k ON k.id = pol.sku_id
        LEFT JOIN app.taxonomy_department d ON k.category_number BETWEEN d.beg_categ AND d.end_categ
        WHERE po.status IN ('SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED')
          AND po.ship_to_store_id = ANY($1::int[])
          AND GREATEST(pol.quantity_ordered - pol.quantity_received, 0) > 0
          AND (d.number = ANY($2::int[]) OR ($3::boolean AND d.number IS NULL))
        GROUP BY COALESCE(d.number::text, 'unmapped')
      `,
      params.storeNumbers,
      params.departmentNumbers,
      params.includeUnmapped ?? false,
    );

  const positions = new Map<string, InventoryPosition>();
  for (const row of inventoryRows) {
    positions.set(normalizeDepartmentKey(row.departmentKey), {
      onHand: toNumber(row.onHand),
      currentOnOrder: toNumber(row.currentOnOrder),
      futureOnOrder: toNumber(row.futureOnOrder),
      nativeOpenPo: 0,
    });
  }
  for (const row of openPoRows) {
    const key = normalizeDepartmentKey(row.departmentKey);
    const current = positions.get(key) ?? { onHand: 0, currentOnOrder: 0, futureOnOrder: 0, nativeOpenPo: 0 };
    current.nativeOpenPo = toNumber(row.nativeOpenPo);
    positions.set(key, current);
  }
  return positions;
}

async function loadLatestDataYearMonth(storeNumbers: number[], fallbackYearMonth: string, db: DbClient = prisma): Promise<string> {
  const rows = await db.$queryRawUnsafe<LatestDataMonthRow[]>(
    `
      SELECT to_char(MAX(snapshot_as_of), 'YYYY-MM') AS "yearMonth"
      FROM app.inventory_history_snapshot
      WHERE store_id = ANY($1::int[])
    `,
    storeNumbers,
  );
  const yearMonth = rows[0]?.yearMonth;
  return isYearMonth(yearMonth) ? yearMonth : fallbackYearMonth;
}

function ensureProjectedRectangle(
  projected: ProjectedPoint[],
  dimKeys: string[],
  horizon: string[],
): ProjectedPoint[] {
  const seen = new Set(projected.map((point) => `${point.dimKey}|${point.yearMonth}`));
  const out = [...projected];
  for (const dimKey of dimKeys) {
    for (const yearMonth of horizon) {
      const key = `${dimKey}|${yearMonth}`;
      if (!seen.has(key)) out.push({ dimKey, yearMonth, projQty: 0 });
    }
  }
  return out;
}

function buildNormalizationFactorForHorizon(
  normalized: NormalizedHistoryPoint[],
  horizon: string[],
): Map<string, number> {
  const historyFactors = summarizeNormalizationByDimMonth(normalized);
  const out = new Map<string, number>();
  const byDimMonth = new Map<string, number[]>();
  for (const [key, factor] of historyFactors) {
    const [dimKey, yearMonth] = key.split('|');
    const month = yearMonth?.slice(5, 7);
    if (!dimKey || !month) continue;
    const bucketKey = `${dimKey}|${month}`;
    const bucket = byDimMonth.get(bucketKey) ?? [];
    bucket.push(factor);
    byDimMonth.set(bucketKey, bucket);
  }
  for (const dimKey of new Set(normalized.map((point) => point.dimKey))) {
    for (const yearMonth of horizon) {
      const factors = byDimMonth.get(`${dimKey}|${yearMonth.slice(5, 7)}`) ?? [];
      out.set(`${dimKey}|${yearMonth}`, factors.length ? factors.reduce((sum, value) => sum + value, 0) / factors.length : 1);
    }
  }
  return out;
}

interface LoadedPlanningData {
  facts: {
    history: HistoryPoint[];
    labelByKey: Map<string, string>;
    numberByKey: Map<string, number | null>;
  };
  positions: Map<string, InventoryPosition>;
  departments: Map<string, { number: number; label: string }>;
}

interface PlanningRange {
  seasonMonths: string[];
  historyFromYearMonth: string;
  historyToYearMonth: string;
  bridgeMonths: string[];
  projectionMonths: string[];
}

function planningRangeForSeason(params: {
  season: PurchasePlanSeason;
  seasonYear: number;
  latestDataYearMonth: string;
  eohMethod: EohMethod;
  coverMonths: number;
}): PlanningRange {
  return planningRangeForMonths({
    months: buildSeasonMonths(params.season, params.seasonYear),
    latestDataYearMonth: params.latestDataYearMonth,
    eohMethod: params.eohMethod,
    coverMonths: params.coverMonths,
  });
}

function planningRangeForMonths(params: {
  months: string[];
  latestDataYearMonth: string;
  eohMethod: EohMethod;
  coverMonths: number;
}): PlanningRange {
  const seasonMonths = [...params.months];
  if (seasonMonths.length === 0) {
    throw new PurchasePlanningServiceError(400, 'NO_PROJECTION_MONTHS', 'At least one projection month is required.');
  }
  const monthBeforeSeason = shiftYearMonth(seasonMonths[0], -1);
  const historyToYearMonth = earlierYearMonth(monthBeforeSeason, params.latestDataYearMonth);
  const historyFromYearMonth = shiftYearMonth(historyToYearMonth, -HISTORY_MONTHS + 1);
  const bridgeMonths = monthsBetweenExclusive(historyToYearMonth, seasonMonths[0]);
  const coverTailMonths = params.eohMethod === 'forward'
    ? monthsAfter(seasonMonths[seasonMonths.length - 1], params.coverMonths)
    : [];
  const projectionMonths = [...new Set([...bridgeMonths, ...seasonMonths, ...coverTailMonths])];
  return {
    seasonMonths,
    historyFromYearMonth,
    historyToYearMonth,
    bridgeMonths,
    projectionMonths,
  };
}

function calculateRowsFromLoadedPlanningData(input: {
  data: LoadedPlanningData;
  range: PlanningRange;
  forecastMethod: ForecastMethod;
  forecastParams: ForecastParams;
  eohMethod: EohMethod;
  coverMonths: number;
  discountNormalization: boolean;
}): Array<Omit<PurchasePlanSavedRow, 'id' | 'planId'>> {
  const labelByKey = new Map(input.data.facts.labelByKey);
  const numberByKey = new Map(input.data.facts.numberByKey);
  const positions = new Map(input.data.positions);

  for (const [key, dept] of input.data.departments) {
    labelByKey.set(key, dept.label);
    numberByKey.set(key, dept.number);
    if (!positions.has(key)) positions.set(key, { onHand: 0, currentOnOrder: 0, futureOnOrder: 0, nativeOpenPo: 0 });
  }

  const history = input.data.facts.history.filter((point) =>
    point.yearMonth >= input.range.historyFromYearMonth &&
    point.yearMonth <= input.range.historyToYearMonth);
  const normalized = normalizeDiscountDistortedHistory(history, input.discountNormalization);
  const dimKeys = [...new Set([...labelByKey.keys(), ...positions.keys()])];
  const normalizedProjection = ensureProjectedRectangle(
    forecast(normalized, input.forecastMethod, input.forecastParams, input.range.projectionMonths),
    dimKeys,
    input.range.projectionMonths,
  );
  const rawProjection = ensureProjectedRectangle(
    forecast(history, input.forecastMethod, input.forecastParams, input.range.projectionMonths),
    dimKeys,
    input.range.projectionMonths,
  );
  const rawByKey = new Map(rawProjection.map((point) => [`${point.dimKey}|${point.yearMonth}`, point.projQty]));
  const normalizationByKey = buildNormalizationFactorForHorizon(normalized, input.range.seasonMonths);

  const computed = computePlanWithInventoryPosition(normalizedProjection, positions, input.range.seasonMonths, {
    eohMethod: input.eohMethod,
    coverMonths: input.coverMonths,
    preHorizonYearMonths: input.range.bridgeMonths,
  });

  return computed.map((row) => {
    const departmentKey = normalizeDepartmentKey(row.dimKey);
    return {
      departmentKey,
      departmentNumber: numberByKey.get(departmentKey) ?? null,
      departmentLabel: labelByKey.get(departmentKey) ?? departmentKey,
      yearMonth: row.yearMonth,
      baselineBoh: row.boh,
      baselineProjSales: row.projSales,
      baselineEohTarget: row.eohTarget,
      baselineBuy: row.buy,
      baselineEohActual: row.eohActual,
      currentBoh: row.boh,
      currentProjSales: row.projSales,
      currentEohTarget: row.eohTarget,
      currentBuy: row.buy,
      currentEohActual: row.eohActual,
      onHand: row.onHand ?? 0,
      currentOnOrder: row.currentOnOrder ?? 0,
      futureOnOrder: row.futureOnOrder ?? 0,
      nativeOpenPo: row.nativeOpenPo ?? 0,
      stockPosition: row.stockPosition ?? 0,
      normalizationFactor: normalizationByKey.get(`${departmentKey}|${row.yearMonth}`) ?? 1,
      rawProjSales: Math.round(rawByKey.get(`${departmentKey}|${row.yearMonth}`) ?? row.projSales),
    };
  });
}

async function buildCalculatedRows(input: {
  planningScope?: PurchasePlanPlanningScope;
  storeGroupCode?: string;
  season: PurchasePlanSeason;
  seasonYear: number;
  seasonMonths?: string[];
  departmentNumbers: number[];
  forecastMethod: ForecastMethod;
  forecastParams: ForecastParams;
  eohMethod: EohMethod;
  coverMonths: number;
  discountNormalization: boolean;
}): Promise<{
  planningScope: PurchasePlanPlanningScope;
  scopeLabel: string;
  storeGroupCode: string | null;
  storeGroup: StoreGroupRow;
  seasonMonths: string[];
  historyFromYearMonth: string;
  historyToYearMonth: string;
  selectedDepartments: number[];
  rows: Array<Omit<PurchasePlanSavedRow, 'id' | 'planId'>>;
}> {
  const planningScope = input.planningScope === ENTERPRISE_SCOPE ? ENTERPRISE_SCOPE : STORE_GROUP_SCOPE;
  const selectedDepartments = [...new Set(input.departmentNumbers.map((n) => Math.trunc(Number(n))).filter((n) => n > 0))].sort((a, b) => a - b);
  if (selectedDepartments.length === 0) {
    throw new PurchasePlanningServiceError(400, 'NO_DEPARTMENTS', 'At least one department is required.');
  }
  const departments = await loadDepartments(selectedDepartments);
  const missing = selectedDepartments.filter((n) => !departments.has(String(n)));
  if (missing.length > 0) {
    throw new PurchasePlanningServiceError(404, 'DEPARTMENT_NOT_FOUND', `Department(s) not found: ${missing.join(', ')}`);
  }

  const [storeGroup, demandStoreNumbers, planningStoreNumbers] = await (async (): Promise<[StoreGroupRow, number[], number[]]> => {
    if (planningScope === ENTERPRISE_SCOPE) {
      const [groups, warehouseStoreNumbers] = await Promise.all([
        loadEnterpriseDemandStoreGroups(),
        withPlanningQuerySettings((db) => loadWarehouseStoreNumbers(db)),
      ]);
      const demandStores = uniqueSortedNumbers(groups.flatMap((group) => parseIntArray(group.storeNumbers)));
      const planningStores = uniqueSortedNumbers([...demandStores, ...warehouseStoreNumbers]);
      return [{
        code: ENTERPRISE_CODE,
        label: ENTERPRISE_LABEL,
        storeNumbers: demandStores,
      }, demandStores, planningStores];
    }

    const code = input.storeGroupCode?.trim();
    if (!code) throw new PurchasePlanningServiceError(400, 'NO_CHAIN', 'Store chain is required.');
    const group = await getStoreGroup(code);
    const storeNumbers = parseIntArray(group.storeNumbers);
    return [group, storeNumbers, storeNumbers];
  })();

  const fallbackYearMonth = shiftYearMonth(buildSeasonMonths(input.season, input.seasonYear)[0], -1);
  const latestDataYearMonth = await withPlanningQuerySettings((db) =>
    loadLatestDataYearMonth(demandStoreNumbers, fallbackYearMonth, db));
  const range = input.seasonMonths
    ? planningRangeForMonths({
      months: input.seasonMonths,
      latestDataYearMonth,
      eohMethod: input.eohMethod,
      coverMonths: input.coverMonths,
    })
    : planningRangeForSeason({
      season: input.season,
      seasonYear: input.seasonYear,
      latestDataYearMonth,
      eohMethod: input.eohMethod,
      coverMonths: input.coverMonths,
    });
  const [facts, positions] = await withPlanningQuerySettings(async (db) => {
    const loadedFacts = await loadMonthlyFacts({
      storeNumbers: demandStoreNumbers,
      departmentNumbers: selectedDepartments,
      fromYearMonth: range.historyFromYearMonth,
      toYearMonth: range.historyToYearMonth,
      includeUnmapped: false,
    }, db);
    const loadedPositions = await loadInventoryPositions({
      storeNumbers: planningStoreNumbers,
      departmentNumbers: selectedDepartments,
      includeUnmapped: false,
    }, db);
    return [loadedFacts, loadedPositions] as const;
  });

  return {
    planningScope,
    scopeLabel: planningScope === ENTERPRISE_SCOPE ? ENTERPRISE_LABEL : storeGroup.label ?? storeGroup.code,
    storeGroupCode: planningScope === ENTERPRISE_SCOPE ? null : storeGroup.code,
    storeGroup,
    seasonMonths: range.seasonMonths,
    historyFromYearMonth: range.historyFromYearMonth,
    historyToYearMonth: range.historyToYearMonth,
    selectedDepartments,
    rows: calculateRowsFromLoadedPlanningData({
      data: { facts, positions, departments },
      range,
      forecastMethod: input.forecastMethod,
      forecastParams: input.forecastParams,
      eohMethod: input.eohMethod,
      coverMonths: input.coverMonths,
      discountNormalization: input.discountNormalization,
    }),
  };
}

async function insertRows(planId: string, rows: Array<Omit<PurchasePlanSavedRow, 'id' | 'planId'>>, db: DbClient): Promise<void> {
  for (const row of rows) {
    await db.$executeRawUnsafe(
      `
        INSERT INTO app.purchase_plan_row (
          plan_id, department_key, department_number, department_label, year_month,
          baseline_boh, baseline_proj_sales, baseline_eoh_target, baseline_buy, baseline_eoh_actual,
          current_boh, current_proj_sales, current_eoh_target, current_buy, current_eoh_actual,
          on_hand, current_on_order, future_on_order, native_open_po, stock_position,
          normalization_factor, raw_proj_sales
        )
        VALUES (
          $1::uuid, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21, $22
        )
      `,
      planId,
      row.departmentKey,
      row.departmentNumber,
      row.departmentLabel,
      row.yearMonth,
      row.baselineBoh,
      row.baselineProjSales,
      row.baselineEohTarget,
      row.baselineBuy,
      row.baselineEohActual,
      row.currentBoh,
      row.currentProjSales,
      row.currentEohTarget,
      row.currentBuy,
      row.currentEohActual,
      row.onHand,
      row.currentOnOrder,
      row.futureOnOrder,
      row.nativeOpenPo,
      row.stockPosition,
      row.normalizationFactor,
      row.rawProjSales,
    );
  }
}

async function loadPlanHeader(id: string, db: DbClient = prisma): Promise<PurchasePlanHeader> {
  const rows = await db.$queryRawUnsafe<PlanHeaderRow[]>(
    `
      SELECT
        p.id::text AS id,
        p.label,
        p.status,
        COALESCE(p.planning_scope, 'store_group') AS "planningScope",
        p.scope_label AS "scopeLabel",
        p.store_group_code AS "storeGroupCode",
        sg.label AS "storeGroupLabel",
        p.season,
        p.season_year AS "seasonYear",
        p.season_months AS "seasonMonths",
        p.selected_departments AS "selectedDepartments",
        p.forecast_method AS "forecastMethod",
        p.eoh_method AS "eohMethod",
        p.cover_months AS "coverMonths",
        p.discount_normalization AS "discountNormalization",
        p.history_from_year_month AS "historyFromYearMonth",
        p.history_to_year_month AS "historyToYearMonth",
        p.created_by AS "createdBy",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        p.archived_at AS "archivedAt"
      FROM app.purchase_plan p
      LEFT JOIN app.store_group sg ON sg.code = p.store_group_code
      WHERE p.id = $1::uuid
      LIMIT 1
    `,
    id,
  );
  const row = rows[0];
  if (!row) throw new PurchasePlanningServiceError(404, 'PLAN_NOT_FOUND', 'Purchase plan not found.');
  return normalizeHeader(row);
}

async function loadRows(planId: string, db: DbClient = prisma, departmentKey?: string): Promise<PurchasePlanSavedRow[]> {
  const rows = await db.$queryRawUnsafe<SavedRowDb[]>(
    `
      SELECT
        r.id::text AS id,
        r.plan_id::text AS "planId",
        r.department_key AS "departmentKey",
        r.department_number AS "departmentNumber",
        r.department_label AS "departmentLabel",
        r.year_month AS "yearMonth",
        r.baseline_boh AS "baselineBoh",
        r.baseline_proj_sales AS "baselineProjSales",
        r.baseline_eoh_target AS "baselineEohTarget",
        r.baseline_buy AS "baselineBuy",
        r.baseline_eoh_actual AS "baselineEohActual",
        r.current_boh AS "currentBoh",
        r.current_proj_sales AS "currentProjSales",
        r.current_eoh_target AS "currentEohTarget",
        r.current_buy AS "currentBuy",
        r.current_eoh_actual AS "currentEohActual",
        r.on_hand AS "onHand",
        r.current_on_order AS "currentOnOrder",
        r.future_on_order AS "futureOnOrder",
        r.native_open_po AS "nativeOpenPo",
        r.stock_position AS "stockPosition",
        r.normalization_factor AS "normalizationFactor",
        r.raw_proj_sales AS "rawProjSales"
      FROM app.purchase_plan_row r
      JOIN app.purchase_plan p ON p.id = r.plan_id
      WHERE r.plan_id = $1::uuid
        AND ($2::text IS NULL OR r.department_key = $2::text)
        AND r.department_number = ANY(p.selected_departments)
      ORDER BY r.department_number NULLS LAST, r.department_key, r.year_month
    `,
    planId,
    departmentKey ?? null,
  );
  return rows.map(normalizeSavedRow);
}

async function loadAdjustments(planId: string, db: DbClient = prisma): Promise<PurchasePlanAdjustment[]> {
  const rows = await db.$queryRawUnsafe<AdjustmentDb[]>(
    `
      SELECT
        id::text AS id,
        plan_id::text AS "planId",
        department_key AS "departmentKey",
        kind,
        value,
        reason,
        applied_by AS "appliedBy",
        applied_at AS "appliedAt"
      FROM app.purchase_plan_adjustment
      WHERE plan_id = $1::uuid
      ORDER BY applied_at ASC, id ASC
    `,
    planId,
  );
  return rows.map(normalizeAdjustment);
}

async function updateCurrentRows(rows: PurchasePlanSavedRow[], db: DbClient): Promise<void> {
  for (const row of rows) {
    await db.$executeRawUnsafe(
      `
        UPDATE app.purchase_plan_row
        SET
          current_boh = $2,
          current_proj_sales = $3,
          current_eoh_target = $4,
          current_buy = $5,
          current_eoh_actual = $6,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      row.id,
      row.currentBoh,
      row.currentProjSales,
      row.currentEohTarget,
      row.currentBuy,
      row.currentEohActual,
    );
  }
}

type MonthlyRowUpdateValues = {
  currentProjSales?: number;
  currentEohTarget?: number;
  currentBuy?: number;
};

function hasUnitOverride(input: MonthlyRowUpdateValues, key: keyof MonthlyRowUpdateValues): boolean {
  return Object.prototype.hasOwnProperty.call(input, key) && input[key] != null;
}

function normalizedUnitOverride(input: MonthlyRowUpdateValues, key: keyof MonthlyRowUpdateValues): number | undefined {
  if (!hasUnitOverride(input, key)) return undefined;
  const value = Number(input[key]);
  if (!Number.isFinite(value) || value < 0) {
    throw new PurchasePlanningServiceError(400, 'INVALID_ROW_UPDATE_VALUE', 'Monthly plan values must be non-negative numbers.');
  }
  return Math.round(value);
}

function applyMonthlyRowUpdates(
  rows: PurchasePlanSavedRow[],
  updatesByRowId: Map<string, MonthlyRowUpdateValues>,
): PurchasePlanSavedRow[] {
  let runningBoh = rows[0]?.currentBoh ?? 0;
  return rows.map((row, index) => {
    const next: PurchasePlanSavedRow = {
      ...row,
      currentBoh: index === 0 ? row.currentBoh : runningBoh,
    };
    const update = updatesByRowId.get(row.id);

    if (update) {
      const currentProjSales = normalizedUnitOverride(update, 'currentProjSales');
      const currentEohTarget = normalizedUnitOverride(update, 'currentEohTarget');
      const currentBuy = normalizedUnitOverride(update, 'currentBuy');
      const shouldRecalculateBuy = currentBuy == null && (currentProjSales != null || currentEohTarget != null);
      if (currentProjSales != null) next.currentProjSales = currentProjSales;
      if (currentEohTarget != null) next.currentEohTarget = currentEohTarget;
      if (currentBuy != null) {
        next.currentBuy = currentBuy;
      } else if (shouldRecalculateBuy) {
        next.currentBuy = Math.max(0, next.currentProjSales + next.currentEohTarget - next.currentBoh);
      }
    }

    next.currentEohActual = next.currentBoh + next.currentBuy - next.currentProjSales;
    runningBoh = next.currentEohActual;
    return next;
  });
}

async function recordAudit(
  planId: string,
  action: string,
  actor: string,
  beforeJson: unknown,
  afterJson: unknown,
  db: DbClient,
): Promise<void> {
  await db.$executeRawUnsafe(
    `
      INSERT INTO app.purchase_plan_audit (plan_id, action, actor, before_json, after_json)
      VALUES ($1::uuid, $2, $3, $4::jsonb, $5::jsonb)
    `,
    planId,
    action,
    actor,
    JSON.stringify(beforeJson ?? null),
    JSON.stringify(afterJson ?? null),
  );
}

async function applyExistingAdjustmentRows(
  planId: string,
  adjustment: Pick<PurchasePlanAdjustment, 'departmentKey' | 'kind' | 'value'>,
  db: DbClient,
): Promise<void> {
  const rows = await loadRows(planId, db, adjustment.departmentKey);
  const next = applySeasonTotalAdjustment(rows, adjustment.kind, adjustment.value);
  await updateCurrentRows(next, db);
}

export async function createPurchasePlan(input: PurchasePlanCreateRequest): Promise<PurchasePlanDetailResponse> {
  const forecastMethod = input.forecast?.method ?? DEFAULT_FORECAST_METHOD;
  const eohMethod = input.eohMethod ?? DEFAULT_EOH_METHOD;
  const coverMonths = Math.max(1, Math.round(input.coverMonths ?? DEFAULT_COVER_MONTHS));
  const planningScope = input.planningScope === ENTERPRISE_SCOPE ? ENTERPRISE_SCOPE : STORE_GROUP_SCOPE;
  const calculation = await buildCalculatedRows({
    planningScope,
    storeGroupCode: input.storeGroupCode,
    season: input.season,
    seasonYear: input.seasonYear,
    seasonMonths: input.seasonMonths,
    departmentNumbers: input.departmentNumbers,
    forecastMethod,
    forecastParams: input.forecast ?? {},
    eohMethod,
    coverMonths,
    discountNormalization: input.discountNormalization ?? true,
  });
  const actor = input.createdBy?.trim() || 'system';
  const label = input.label?.trim() || defaultPlanLabel(calculation.scopeLabel, input.season, input.seasonYear);

  const planId = await prisma.$transaction(async (tx) => {
    const inserted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `
        INSERT INTO app.purchase_plan (
          store_group_code, planning_scope, scope_label, label, season, season_year, season_months, selected_departments,
          forecast_method, eoh_method, cover_months, discount_normalization,
          history_from_year_month, history_to_year_month, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::int[], $9, $10, $11, $12, $13, $14, $15)
        RETURNING id::text
      `,
      calculation.storeGroupCode,
      calculation.planningScope,
      calculation.scopeLabel,
      label,
      input.season,
      input.seasonYear,
      calculation.seasonMonths,
      calculation.selectedDepartments,
      forecastMethod,
      eohMethod,
      coverMonths,
      input.discountNormalization ?? true,
      calculation.historyFromYearMonth,
      calculation.historyToYearMonth,
      actor,
    );
    const id = inserted[0]?.id;
    if (!id) throw new Error('Purchase plan insert did not return an id.');
    await insertRows(id, calculation.rows, tx);
    await recordAudit(id, 'create', actor, null, { label, rows: calculation.rows.length }, tx);
    return id;
  });

  return getPurchasePlan(planId);
}

export async function listPurchasePlans(params: {
  status?: 'draft' | 'archived' | 'all';
  storeGroupCode?: string;
} = {}): Promise<PurchasePlanListItem[]> {
  const rows = await prisma.$queryRawUnsafe<Array<PlanHeaderRow & {
    departmentCount: unknown;
    baselineTotalBuy: unknown;
    currentTotalBuy: unknown;
  }>>(
    `
      SELECT
        p.id::text AS id,
        p.label,
        p.status,
        COALESCE(p.planning_scope, 'store_group') AS "planningScope",
        p.scope_label AS "scopeLabel",
        p.store_group_code AS "storeGroupCode",
        sg.label AS "storeGroupLabel",
        p.season,
        p.season_year AS "seasonYear",
        p.season_months AS "seasonMonths",
        p.selected_departments AS "selectedDepartments",
        p.forecast_method AS "forecastMethod",
        p.eoh_method AS "eohMethod",
        p.cover_months AS "coverMonths",
        p.discount_normalization AS "discountNormalization",
        p.history_from_year_month AS "historyFromYearMonth",
        p.history_to_year_month AS "historyToYearMonth",
        p.created_by AS "createdBy",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        p.archived_at AS "archivedAt",
        COUNT(DISTINCT r.department_key)::int AS "departmentCount",
        COALESCE(SUM(r.baseline_buy), 0)::int AS "baselineTotalBuy",
        COALESCE(SUM(r.current_buy), 0)::int AS "currentTotalBuy"
      FROM app.purchase_plan p
      LEFT JOIN app.store_group sg ON sg.code = p.store_group_code
      LEFT JOIN app.purchase_plan_row r ON r.plan_id = p.id
      WHERE ($1::text IS NULL OR p.status = $1::text)
        AND COALESCE(p.planning_scope, 'store_group') = 'enterprise'
        AND p.store_group_code IS NULL
        AND COALESCE(array_length(p.season_months, 1), 0) = $2::int
      GROUP BY p.id, sg.label
      ORDER BY p.updated_at DESC
    `,
    params.status && params.status !== 'all' ? params.status : null,
    ENTERPRISE_WORKBOOK_MONTHS,
  );
  return rows.map((row) => ({
    ...normalizeHeader(row),
    departmentCount: toNumber(row.departmentCount),
    baselineTotalBuy: toNumber(row.baselineTotalBuy),
    currentTotalBuy: toNumber(row.currentTotalBuy),
  }));
}

export async function getPurchasePlan(id: string): Promise<PurchasePlanDetailResponse> {
  const [plan, rows, adjustments] = await Promise.all([
    loadPlanHeader(id),
    loadRows(id),
    loadAdjustments(id),
  ]);
  return { plan, ...summarizeRows(rows, adjustments) };
}

export async function addPurchasePlanAdjustment(
  planId: string,
  input: PurchasePlanAdjustmentRequest,
): Promise<PurchasePlanDetailResponse> {
  const actor = input.appliedBy?.trim() || 'system';
  const reason = input.reason.trim();
  if (!reason) throw new PurchasePlanningServiceError(400, 'REASON_REQUIRED', 'Adjustment reason is required.');
  if (input.kind === 'absolute_total' && input.value < 0) {
    throw new PurchasePlanningServiceError(400, 'INVALID_ADJUSTMENT_VALUE', 'Absolute total must be non-negative.');
  }
  if (input.kind === 'percent_lift' && input.value < -100) {
    throw new PurchasePlanningServiceError(400, 'INVALID_ADJUSTMENT_VALUE', 'Percent lift cannot be less than -100.');
  }

  await prisma.$transaction(async (tx) => {
    const plan = await loadPlanHeader(planId, tx);
    if (plan.status === 'archived') {
      throw new PurchasePlanningServiceError(409, 'PLAN_ARCHIVED', 'Archived plans cannot be adjusted.');
    }
    const beforeRows = await loadRows(planId, tx, input.departmentKey);
    if (beforeRows.length === 0) {
      throw new PurchasePlanningServiceError(404, 'PLAN_DEPARTMENT_NOT_FOUND', 'Department is not in this plan.');
    }
    const afterRows = applySeasonTotalAdjustment(beforeRows, input.kind, input.value);
    await updateCurrentRows(afterRows, tx);
    await tx.$executeRawUnsafe(
      `
        INSERT INTO app.purchase_plan_adjustment (
          plan_id, department_key, kind, value, reason, applied_by, before_rows_json, after_rows_json
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
      `,
      planId,
      input.departmentKey,
      input.kind,
      input.value,
      reason,
      actor,
      JSON.stringify(beforeRows),
      JSON.stringify(afterRows),
    );
    await tx.$executeRawUnsafe(
      `UPDATE app.purchase_plan SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
      planId,
    );
    await recordAudit(planId, 'adjust', actor, beforeRows, afterRows, tx);
  });

  return getPurchasePlan(planId);
}

export async function updatePurchasePlanRow(
  planId: string,
  rowId: string,
  input: PurchasePlanRowUpdateRequest,
): Promise<PurchasePlanDetailResponse> {
  return updatePurchasePlanRows(planId, {
    rows: [{
      rowId,
      currentProjSales: input.currentProjSales,
      currentEohTarget: input.currentEohTarget,
      currentBuy: input.currentBuy,
    }],
    reason: input.reason,
    appliedBy: input.appliedBy,
  });
}

export async function updatePurchasePlanRows(
  planId: string,
  input: PurchasePlanRowsUpdateRequest,
): Promise<PurchasePlanDetailResponse> {
  const actor = input.appliedBy?.trim() || 'system';
  const reason = input.reason.trim();
  if (!reason) throw new PurchasePlanningServiceError(400, 'REASON_REQUIRED', 'Adjustment reason is required.');
  if (input.rows.length === 0) {
    throw new PurchasePlanningServiceError(400, 'NO_ROW_UPDATES', 'At least one monthly plan row is required.');
  }

  const updatesByRowId = new Map<string, MonthlyRowUpdateValues>();
  for (const row of input.rows) {
    const rowId = row.rowId.trim();
    if (!rowId) {
      throw new PurchasePlanningServiceError(400, 'INVALID_ROW_UPDATE_VALUE', 'Monthly plan row id is required.');
    }
    if (
      !hasUnitOverride(row, 'currentProjSales')
      && !hasUnitOverride(row, 'currentEohTarget')
      && !hasUnitOverride(row, 'currentBuy')
    ) {
      throw new PurchasePlanningServiceError(400, 'NO_ROW_UPDATES', 'At least one monthly plan value is required.');
    }
    if (updatesByRowId.has(rowId)) {
      throw new PurchasePlanningServiceError(400, 'DUPLICATE_ROW_UPDATE', 'Each monthly plan row can only be updated once.');
    }
    updatesByRowId.set(rowId, {
      currentProjSales: normalizedUnitOverride(row, 'currentProjSales'),
      currentEohTarget: normalizedUnitOverride(row, 'currentEohTarget'),
      currentBuy: normalizedUnitOverride(row, 'currentBuy'),
    });
  }

  await prisma.$transaction(async (tx) => {
    const plan = await loadPlanHeader(planId, tx);
    if (plan.status === 'archived') {
      throw new PurchasePlanningServiceError(409, 'PLAN_ARCHIVED', 'Archived plans cannot be adjusted.');
    }

    const planRows = await loadRows(planId, tx);
    const rowsById = new Map(planRows.map((row) => [row.id, row]));
    for (const rowId of updatesByRowId.keys()) {
      if (!rowsById.has(rowId)) {
        throw new PurchasePlanningServiceError(404, 'PLAN_ROW_NOT_FOUND', 'Monthly plan row is not in this plan.');
      }
    }

    const touchedDepartments = new Set(
      [...updatesByRowId.keys()].map((rowId) => rowsById.get(rowId)!.departmentKey),
    );
    const beforeRows = planRows.filter((row) => touchedDepartments.has(row.departmentKey));
    const afterRows: PurchasePlanSavedRow[] = [];
    for (const departmentKey of touchedDepartments) {
      const departmentRows = beforeRows.filter((row) => row.departmentKey === departmentKey);
      afterRows.push(...applyMonthlyRowUpdates(departmentRows, updatesByRowId));
    }

    await updateCurrentRows(afterRows, tx);
    await tx.$executeRawUnsafe(
      `UPDATE app.purchase_plan SET updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
      planId,
    );
    await recordAudit(
      planId,
      'worksheet_update',
      actor,
      { reason, updates: input.rows, rows: beforeRows },
      { reason, updates: input.rows, rows: afterRows },
      tx,
    );
  });

  return getPurchasePlan(planId);
}

export async function recalculatePurchasePlan(planId: string, actor = 'system'): Promise<PurchasePlanDetailResponse> {
  await prisma.$transaction(async (tx) => {
    const plan = await loadPlanHeader(planId, tx);
    if (plan.status === 'archived') {
      throw new PurchasePlanningServiceError(409, 'PLAN_ARCHIVED', 'Archived plans cannot be recalculated.');
    }
    const beforeRows = await loadRows(planId, tx);
    const calculation = await buildCalculatedRows({
      planningScope: plan.planningScope,
      storeGroupCode: plan.planningScope === ENTERPRISE_SCOPE ? undefined : plan.storeGroupCode,
      season: plan.season,
      seasonYear: plan.seasonYear,
      seasonMonths: plan.seasonMonths,
      departmentNumbers: plan.selectedDepartments,
      forecastMethod: plan.forecastMethod,
      forecastParams: {},
      eohMethod: plan.eohMethod,
      coverMonths: plan.coverMonths,
      discountNormalization: plan.discountNormalization,
    });
    await tx.$executeRawUnsafe(`DELETE FROM app.purchase_plan_row WHERE plan_id = $1::uuid`, planId);
    await insertRows(planId, calculation.rows, tx);
    const adjustments = await loadAdjustments(planId, tx);
    for (const adjustment of adjustments) {
      await applyExistingAdjustmentRows(planId, adjustment, tx);
    }
    await tx.$executeRawUnsafe(
      `
        UPDATE app.purchase_plan
        SET
          history_from_year_month = $2,
          history_to_year_month = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      planId,
      calculation.historyFromYearMonth,
      calculation.historyToYearMonth,
    );
    await recordAudit(planId, 'recalculate', actor, beforeRows, calculation.rows, tx);
  });
  return getPurchasePlan(planId);
}

export async function archivePurchasePlan(planId: string, actor = 'system'): Promise<PurchasePlanDetailResponse> {
  await prisma.$transaction(async (tx) => {
    const before = await loadPlanHeader(planId, tx);
    await tx.$executeRawUnsafe(
      `
        UPDATE app.purchase_plan
        SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `,
      planId,
    );
    await recordAudit(planId, 'archive', actor, before, { status: 'archived' }, tx);
  });
  return getPurchasePlan(planId);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function valueFromUnits(units: number, unitCostHnl: number): SeasonalPurchaseReportValue {
  return {
    units: Math.round(units),
    costHnl: roundMoney(Math.round(units) * unitCostHnl),
  };
}

function valueFromRaw(units: number, costHnl: number): SeasonalPurchaseReportValue {
  return {
    units: Math.round(units),
    costHnl: roundMoney(costHnl),
  };
}

function workbookLabel(
  departmentLabelText: string,
  seasonWindow: PurchasePlanSeasonWindowItem[],
): string {
  const first = seasonWindow[0]!;
  const last = seasonWindow[seasonWindow.length - 1]!;
  return `${ENTERPRISE_LABEL} ${departmentLabelText} ${first.seasonLabel} to ${last.seasonLabel}`;
}

function projectionMonthsFromWindow(seasonWindow: PurchasePlanSeasonWindowItem[]): string[] {
  return seasonWindow.flatMap((season) => season.months);
}

async function findReportWorkbook(params: {
  season: PurchasePlanSeason;
  seasonYear: number;
  departmentNumber: number;
}): Promise<ReportWorksheetRow | null> {
  const rows = await prisma.$queryRawUnsafe<ReportWorksheetRow[]>(
    `
      SELECT
        p.id::text AS id,
        p.label,
        COUNT(*) OVER() AS "matchCount"
      FROM app.purchase_plan p
      WHERE p.status = 'draft'
        AND COALESCE(p.planning_scope, 'store_group') = 'enterprise'
        AND p.store_group_code IS NULL
        AND COALESCE(array_length(p.season_months, 1), 0) = $1::int
        AND p.season = $2
        AND p.season_year = $3
        AND p.selected_departments = ARRAY[$4]::int[]
      ORDER BY p.updated_at DESC, p.created_at DESC
      LIMIT 1
    `,
    ENTERPRISE_WORKBOOK_MONTHS,
    params.season,
    params.seasonYear,
    params.departmentNumber,
  );
  return rows[0] ?? null;
}

async function ensureReportWorkbook(params: {
  seasonWindow: PurchasePlanSeasonWindowItem[];
  departmentNumber: number;
  departmentLabel: string;
  forecastMethod: ForecastMethod;
  forecastParams: ForecastParams;
  eohMethod: EohMethod;
  coverMonths: number;
  discountNormalization: boolean;
  createdBy: string;
}): Promise<{
  detail: PurchasePlanDetailResponse;
  autoCreated: boolean;
  duplicateSourceCount: number;
}> {
  const first = params.seasonWindow[0]!;
  const existing = await findReportWorkbook({
    season: first.season,
    seasonYear: first.seasonYear,
    departmentNumber: params.departmentNumber,
  });
  if (existing) {
    return {
      detail: await getPurchasePlan(existing.id),
      autoCreated: false,
      duplicateSourceCount: toNumber(existing.matchCount),
    };
  }

  const detail = await createPurchasePlan({
    planningScope: ENTERPRISE_SCOPE,
    season: first.season,
    seasonYear: first.seasonYear,
    seasonMonths: projectionMonthsFromWindow(params.seasonWindow),
    departmentNumbers: [params.departmentNumber],
    label: workbookLabel(params.departmentLabel, params.seasonWindow),
    forecast: { method: params.forecastMethod, ...params.forecastParams },
    eohMethod: params.eohMethod,
    coverMonths: params.coverMonths,
    discountNormalization: params.discountNormalization,
    createdBy: params.createdBy,
  });

  return { detail, autoCreated: true, duplicateSourceCount: 1 };
}

async function loadReportUnitCostHnl(params: {
  storeNumbers: number[];
  departmentNumber: number;
}, db: DbClient = prisma): Promise<number> {
  const rows = await db.$queryRawUnsafe<ReportUnitCostRow[]>(
    `
      SELECT
        COALESCE(
          SUM(GREATEST(COALESCE(h.on_hand, 0), 0) * COALESCE(h.average_cost, k.current_cost, 0))
            / NULLIF(SUM(GREATEST(COALESCE(h.on_hand, 0), 0)), 0),
          AVG(NULLIF(k.current_cost, 0)),
          0
        )::float8 AS "unitCostHnl"
      FROM app.sku k
      JOIN app.taxonomy_department d ON k.category_number BETWEEN d.beg_categ AND d.end_categ
      LEFT JOIN app.inventory_history_snapshot h
        ON h.sku_id = k.id
       AND h.store_id = ANY($1::int[])
      WHERE d.number = $2
    `,
    params.storeNumbers,
    params.departmentNumber,
  );
  return Math.max(0, toNumber(rows[0]?.unitCostHnl));
}

async function loadReportPoBuckets(params: {
  storeNumbers: number[];
  departmentNumber: number;
  seasonWindow: PurchasePlanSeasonWindowItem[];
}, db: DbClient = prisma): Promise<Map<string, SeasonalPurchaseReportValue>> {
  const projectionMonths = projectionMonthsFromWindow(params.seasonWindow);
  const firstMonth = projectionMonths[0]!;
  const lastMonth = projectionMonths[projectionMonths.length - 1]!;
  const rows = await db.$queryRawUnsafe<ReportPoBucketRow[]>(
    `
      WITH po_lines AS (
        SELECT
          po.status,
          to_char(
            date_trunc('month', COALESCE(po.planned_receipt_date, po.ship_date, po.order_date)),
            'YYYY-MM'
          ) AS year_month,
          GREATEST(pol.quantity_ordered - pol.quantity_received, 0)::int AS open_units,
          COALESCE(pol.estimated_landed_unit_cost_hnl, pol.commercial_unit_cost_hnl, pol.unit_cost, 0)::float8 AS unit_cost_hnl
        FROM app.purchase_order po
        JOIN app.purchase_order_line pol ON pol.po_id = po.id
        JOIN app.sku k ON k.id = pol.sku_id
        JOIN app.taxonomy_department d ON k.category_number BETWEEN d.beg_categ AND d.end_categ
        WHERE po.status IN ('DRAFT','SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED')
          AND po.ship_to_store_id = ANY($1::int[])
          AND d.number = $2
          AND GREATEST(pol.quantity_ordered - pol.quantity_received, 0) > 0
          AND to_char(date_trunc('month', COALESCE(po.planned_receipt_date, po.ship_date, po.order_date)), 'YYYY-MM') >= $3
          AND to_char(date_trunc('month', COALESCE(po.planned_receipt_date, po.ship_date, po.order_date)), 'YYYY-MM') <= $4
      )
      SELECT
        status,
        year_month AS "yearMonth",
        SUM(open_units)::int AS units,
        SUM(open_units * unit_cost_hnl)::float8 AS "costHnl"
      FROM po_lines
      GROUP BY status, year_month
      ORDER BY year_month ASC, status ASC
    `,
    params.storeNumbers,
    params.departmentNumber,
    firstMonth,
    lastMonth,
  );

  const bucketByMonth = new Map<string, PurchasePlanSeasonWindowItem>();
  for (const season of params.seasonWindow) {
    for (const month of season.months) bucketByMonth.set(month, season);
  }
  const out = new Map<string, SeasonalPurchaseReportValue>();
  for (const row of rows) {
    const season = bucketByMonth.get(row.yearMonth);
    if (!season) continue;
    const statusBucket = row.status === 'DRAFT' ? 'draftPos' : 'confirmedPos';
    const key = `${season.season}|${season.seasonYear}|${statusBucket}`;
    const current = out.get(key) ?? { units: 0, costHnl: 0 };
    out.set(key, {
      units: current.units + toNumber(row.units),
      costHnl: roundMoney(current.costHnl + toNumber(row.costHnl)),
    });
  }
  return out;
}

function buildWorkbookMetadata(params: {
  detail: PurchasePlanDetailResponse;
  autoCreated: boolean;
  duplicateSourceCount: number;
}): SeasonalPurchaseReportWorksheet {
  return {
    storeGroupCode: ENTERPRISE_CODE,
    storeGroupLabel: ENTERPRISE_LABEL,
    planId: params.detail.plan.id,
    planLabel: params.detail.plan.label,
    autoCreated: params.autoCreated,
    duplicateSourceCount: params.duplicateSourceCount,
  };
}

function rollupSeasonFromMonthlyRows(params: {
  season: PurchasePlanSeasonWindowItem;
  rows: PurchasePlanSavedRow[];
  unitCostHnl: number;
  poBuckets: Map<string, SeasonalPurchaseReportValue>;
  workbook: SeasonalPurchaseReportWorksheet;
}): SeasonalPurchaseReportResponse['seasons'][number] {
  const seasonRows = params.rows
    .filter((row) => params.season.months.includes(row.yearMonth))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  const firstRow = seasonRows[0];
  const lastRow = seasonRows[seasonRows.length - 1];
  const projectedBohUnits = firstRow?.currentBoh ?? 0;
  const projectedSalesUnits = seasonRows.reduce((sum, row) => sum + row.currentProjSales, 0);
  const plannedBuyUnits = seasonRows.reduce((sum, row) => sum + row.currentBuy, 0);
  const projectedEohUnits = lastRow?.currentEohActual ?? (projectedBohUnits - projectedSalesUnits + plannedBuyUnits);
  const draftPos = params.poBuckets.get(`${params.season.season}|${params.season.seasonYear}|draftPos`) ?? { units: 0, costHnl: 0 };
  const confirmedPos = params.poBuckets.get(`${params.season.season}|${params.season.seasonYear}|confirmedPos`) ?? { units: 0, costHnl: 0 };
  const openToBuyUnits = Math.max(0, plannedBuyUnits - draftPos.units - confirmedPos.units);
  const openToBuyCost = Math.max(0, (plannedBuyUnits * params.unitCostHnl) - draftPos.costHnl - confirmedPos.costHnl);

  return {
    season: params.season.season,
    seasonYear: params.season.seasonYear,
    seasonLabel: params.season.seasonLabel,
    months: params.season.months,
    planId: params.workbook.planId,
    planLabel: params.workbook.planLabel,
    autoCreated: params.workbook.autoCreated,
    duplicateSourceCount: params.workbook.duplicateSourceCount,
    worksheets: [params.workbook],
    projectedBoh: valueFromUnits(projectedBohUnits, params.unitCostHnl),
    projectedSales: valueFromUnits(projectedSalesUnits, params.unitCostHnl),
    baselineBuy: valueFromUnits(plannedBuyUnits, params.unitCostHnl),
    draftPos,
    confirmedPos,
    openToBuy: valueFromRaw(openToBuyUnits, openToBuyCost),
    projectedEoh: valueFromUnits(projectedEohUnits, params.unitCostHnl),
  };
}

export async function generateSeasonalPurchaseReport(
  input: PurchasePlanningSeasonalReportRequest,
): Promise<SeasonalPurchaseReportResponse> {
  const departmentNumber = Math.trunc(Number(input.departmentNumber));
  if (!Number.isInteger(departmentNumber) || departmentNumber <= 0) {
    throw new PurchasePlanningServiceError(400, 'INVALID_DEPARTMENT', 'Department number is required.');
  }

  const asOfYearMonth = resolveYearMonth(input.asOfYearMonth);
  const seasonWindow = buildSeasonWindowFromYearMonth(asOfYearMonth, 5);
  const firstSeason = seasonWindow[0]!;
  const lastSeason = seasonWindow[seasonWindow.length - 1]!;
  const projectionMonths = projectionMonthsFromWindow(seasonWindow);
  const forecastMethod = input.forecast?.method ?? DEFAULT_FORECAST_METHOD;
  const forecastParams: ForecastParams = input.forecast ?? {};
  const eohMethod = input.eohMethod ?? DEFAULT_EOH_METHOD;
  const coverMonths = Math.max(1, Math.round(input.coverMonths ?? DEFAULT_COVER_MONTHS));
  const discountNormalization = input.discountNormalization ?? true;
  const createdBy = input.createdBy?.trim() || 'seasonal-report';

  const [sourceStoreGroups, departments, warehouseStoreNumbers] = await Promise.all([
    loadEnterpriseDemandStoreGroups(),
    loadDepartments([departmentNumber]),
    withPlanningQuerySettings((db) => loadWarehouseStoreNumbers(db)),
  ]);
  const department = departments.get(String(departmentNumber));
  if (!department) {
    throw new PurchasePlanningServiceError(404, 'DEPARTMENT_NOT_FOUND', `Department not found: ${departmentNumber}`);
  }
  const demandStoreNumbers = uniqueSortedNumbers(sourceStoreGroups.flatMap((group) => parseIntArray(group.storeNumbers)));
  const planningStoreNumbers = uniqueSortedNumbers([...demandStoreNumbers, ...warehouseStoreNumbers]);

  const workbookResult = await ensureReportWorkbook({
    seasonWindow,
    departmentNumber,
    departmentLabel: department.label,
    forecastMethod,
    forecastParams,
    eohMethod,
    coverMonths,
    discountNormalization,
    createdBy,
  });
  const workbook = buildWorkbookMetadata(workbookResult);
  const worksheetRows = workbookResult.detail.departments
    .flatMap((summary) => summary.months)
    .filter((row) => row.departmentNumber === departmentNumber)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  const [unitCostHnl, poBuckets] = await withPlanningQuerySettings(async (db) => {
    const loadedUnitCostHnl = await loadReportUnitCostHnl({ storeNumbers: planningStoreNumbers, departmentNumber }, db);
    const loadedPoBuckets = await loadReportPoBuckets({ storeNumbers: planningStoreNumbers, departmentNumber, seasonWindow }, db);
    return [loadedUnitCostHnl, loadedPoBuckets] as const;
  });

  const warnings: string[] = [];
  if (warehouseStoreNumbers.length > 0) {
    warnings.push(`Warehouse stock and POs included from store(s): ${warehouseStoreNumbers.join(', ')}.`);
  }
  if (workbook.duplicateSourceCount > 1) {
    warnings.push(
      `${ENTERPRISE_LABEL} ${department.label} ${firstSeason.seasonLabel} has ${workbook.duplicateSourceCount} active monthly workbooks; using the most recently updated one.`,
    );
  }

  return {
    planningScope: ENTERPRISE_SCOPE,
    planningScopeLabel: ENTERPRISE_LABEL,
    storeGroupCode: ENTERPRISE_CODE,
    storeGroupLabel: ENTERPRISE_LABEL,
    storeGroupCodes: [ENTERPRISE_CODE],
    storeGroupLabels: [ENTERPRISE_LABEL],
    warehouseStoreNumbers,
    departmentNumber,
    departmentLabel: department.label,
    year: firstSeason.seasonYear,
    asOfYearMonth,
    startSeason: firstSeason.season,
    startSeasonYear: firstSeason.seasonYear,
    endSeason: lastSeason.season,
    endSeasonYear: lastSeason.seasonYear,
    projectionMonths,
    workbook,
    seasons: seasonWindow.map((season) => rollupSeasonFromMonthlyRows({
      season,
      rows: worksheetRows,
      unitCostHnl,
      poBuckets,
      workbook,
    })),
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

export async function comparePurchasePlan(planId: string): Promise<PurchasePlanCompareResponse> {
  const detail = await getPurchasePlan(planId);
  return {
    plan: detail.plan,
    departments: detail.departments.map((department) => ({
      departmentKey: department.departmentKey,
      departmentNumber: department.departmentNumber,
      departmentLabel: department.departmentLabel,
      baselineTotalBuy: department.baselineTotalBuy,
      currentTotalBuy: department.currentTotalBuy,
      deltaBuy: department.deltaBuy,
      deltaPct: department.baselineTotalBuy === 0 ? null : (department.deltaBuy / department.baselineTotalBuy) * 100,
    })),
    totals: detail.totals,
  };
}
