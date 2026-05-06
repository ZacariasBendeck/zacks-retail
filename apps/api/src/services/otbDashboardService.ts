import { prisma } from '../db/prisma';
import { PaginationEnvelope } from '../models/sku';

const ENTERPRISE_SCOPE = 'enterprise';
const ENTERPRISE_CODE = 'enterprise';
const ENTERPRISE_LABEL = 'Enterprise-wide';

export type OtbDashboardPlanStatus = 'draft' | 'all';
export type OtbDashboardSortField =
  | 'yearMonth'
  | 'departmentNumber'
  | 'departmentLabel'
  | 'plannedBuyUnits'
  | 'projectedSalesUnits'
  | 'currentOnOrderUnits'
  | 'futureOnOrderUnits'
  | 'nativeOpenPoUnits'
  | 'committedUnits'
  | 'stockPositionUnits'
  | 'openToBuyUnits';

export interface OtbDashboardPlan {
  id: string;
  label: string;
  status: string;
  planningScope: 'enterprise' | 'store_group';
  planningScopeLabel: string;
  storeGroupCode: string;
  storeGroupLabel: string | null;
  season: string;
  seasonYear: number;
  seasonMonths: string[];
  selectedDepartments: number[];
  rowCount: number;
  plannedBuyUnits: number;
  updatedAt: string;
  createdAt: string;
}

export interface OtbDashboardTrendPoint {
  periodLabel: string;
  plannedBuyUnits: number;
  projectedSalesUnits: number;
  committedUnits: number;
  stockPositionUnits: number;
  openToBuyUnits: number;
  rowCount: number;
}

export interface OtbDashboardSummary {
  planId: string;
  year?: number;
  month?: number;
  departmentNumber?: number;
  totals: {
    plannedBuyUnits: number;
    projectedSalesUnits: number;
    committedUnits: number;
    stockPositionUnits: number;
    openToBuyUnits: number;
    rowCount: number;
  };
  trend: OtbDashboardTrendPoint[];
  generatedAt: string;
}

export interface OtbDashboardRow {
  id: string;
  planId: string;
  planLabel: string;
  planningScope: 'enterprise' | 'store_group';
  planningScopeLabel: string;
  storeGroupCode: string;
  storeGroupLabel: string | null;
  departmentKey: string;
  departmentNumber: number | null;
  departmentLabel: string;
  yearMonth: string;
  plannedBuyUnits: number;
  projectedSalesUnits: number;
  currentOnOrderUnits: number;
  futureOnOrderUnits: number;
  nativeOpenPoUnits: number;
  committedUnits: number;
  stockPositionUnits: number;
  openToBuyUnits: number;
}

export interface OtbDashboardFilterParams {
  planId: string;
  year?: number;
  month?: number;
  departmentNumber?: number;
}

export interface OtbDashboardRowsParams extends OtbDashboardFilterParams {
  page: number;
  pageSize: number;
  sort: OtbDashboardSortField;
  order: 'asc' | 'desc';
}

interface PlanHeaderDb {
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
  rowCount: unknown;
  plannedBuyUnits: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface PlanStatusDb {
  id: string;
  status: string;
  archivedAt: Date | string | null;
}

interface TrendDb {
  periodLabel: string;
  plannedBuyUnits: unknown;
  projectedSalesUnits: unknown;
  committedUnits: unknown;
  stockPositionUnits: unknown;
  openToBuyUnits: unknown;
  rowCount: unknown;
}

interface DashboardRowDb {
  id: string;
  planId: string;
  planLabel: string;
  planningScope: string | null;
  scopeLabel: string | null;
  storeGroupCode: string | null;
  storeGroupLabel: string | null;
  departmentKey: string;
  departmentNumber: number | null;
  departmentLabel: string | null;
  yearMonth: string;
  plannedBuyUnits: unknown;
  projectedSalesUnits: unknown;
  currentOnOrderUnits: unknown;
  futureOnOrderUnits: unknown;
  nativeOpenPoUnits: unknown;
  committedUnits: unknown;
  stockPositionUnits: unknown;
  openToBuyUnits: unknown;
}

export class OtbDashboardServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'OtbDashboardServiceError';
    this.status = status;
    this.code = code;
  }
}

export function isOtbDashboardServiceError(err: unknown): err is OtbDashboardServiceError {
  return err instanceof OtbDashboardServiceError;
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

function toUnits(value: unknown): number {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function toIso(value: Date | string | null): string {
  if (value == null) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseIntArray(value: number[] | string[] | null): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item))
    .sort((a, b) => a - b);
}

function normalizePlanningScope(value: string | null): 'enterprise' | 'store_group' {
  return value === ENTERPRISE_SCOPE ? 'enterprise' : 'store_group';
}

function planningScopeLabel(
  planningScope: 'enterprise' | 'store_group',
  scopeLabel: string | null,
  storeGroupLabel: string | null,
  storeGroupCode: string | null,
): string {
  const explicit = scopeLabel?.trim();
  if (explicit) return explicit;
  if (planningScope === ENTERPRISE_SCOPE) return ENTERPRISE_LABEL;
  return storeGroupLabel?.trim() || storeGroupCode?.trim() || 'Chain';
}

function storeGroupCodeFor(planningScope: 'enterprise' | 'store_group', storeGroupCode: string | null): string {
  return storeGroupCode ?? (planningScope === ENTERPRISE_SCOPE ? ENTERPRISE_CODE : '');
}

function storeGroupLabelFor(planningScope: 'enterprise' | 'store_group', storeGroupLabel: string | null): string | null {
  return planningScope === ENTERPRISE_SCOPE ? ENTERPRISE_LABEL : storeGroupLabel;
}

function normalizePlan(row: PlanHeaderDb): OtbDashboardPlan {
  const planningScope = normalizePlanningScope(row.planningScope);
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    planningScope,
    planningScopeLabel: planningScopeLabel(planningScope, row.scopeLabel, row.storeGroupLabel, row.storeGroupCode),
    storeGroupCode: storeGroupCodeFor(planningScope, row.storeGroupCode),
    storeGroupLabel: storeGroupLabelFor(planningScope, row.storeGroupLabel),
    season: row.season,
    seasonYear: Number(row.seasonYear),
    seasonMonths: row.seasonMonths ?? [],
    selectedDepartments: parseIntArray(row.selectedDepartments),
    rowCount: toUnits(row.rowCount),
    plannedBuyUnits: toUnits(row.plannedBuyUnits),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function normalizeTrendPoint(row: TrendDb): OtbDashboardTrendPoint {
  return {
    periodLabel: row.periodLabel,
    plannedBuyUnits: toUnits(row.plannedBuyUnits),
    projectedSalesUnits: toUnits(row.projectedSalesUnits),
    committedUnits: toUnits(row.committedUnits),
    stockPositionUnits: toUnits(row.stockPositionUnits),
    openToBuyUnits: toUnits(row.openToBuyUnits),
    rowCount: toUnits(row.rowCount),
  };
}

function normalizeDashboardRow(row: DashboardRowDb): OtbDashboardRow {
  const planningScope = normalizePlanningScope(row.planningScope);
  return {
    id: row.id,
    planId: row.planId,
    planLabel: row.planLabel,
    planningScope,
    planningScopeLabel: planningScopeLabel(planningScope, row.scopeLabel, row.storeGroupLabel, row.storeGroupCode),
    storeGroupCode: storeGroupCodeFor(planningScope, row.storeGroupCode),
    storeGroupLabel: storeGroupLabelFor(planningScope, row.storeGroupLabel),
    departmentKey: row.departmentKey,
    departmentNumber: row.departmentNumber == null ? null : Number(row.departmentNumber),
    departmentLabel: row.departmentLabel?.trim() || 'Unmapped',
    yearMonth: row.yearMonth,
    plannedBuyUnits: toUnits(row.plannedBuyUnits),
    projectedSalesUnits: toUnits(row.projectedSalesUnits),
    currentOnOrderUnits: toUnits(row.currentOnOrderUnits),
    futureOnOrderUnits: toUnits(row.futureOnOrderUnits),
    nativeOpenPoUnits: toUnits(row.nativeOpenPoUnits),
    committedUnits: toUnits(row.committedUnits),
    stockPositionUnits: toUnits(row.stockPositionUnits),
    openToBuyUnits: toUnits(row.openToBuyUnits),
  };
}

async function requireUsablePlan(planId: string): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<PlanStatusDb[]>(
    `
      SELECT
        id::text AS id,
        status,
        archived_at AS "archivedAt"
      FROM app.purchase_plan
      WHERE id = $1::uuid
      LIMIT 1
    `,
    planId,
  );
  const row = rows[0];
  if (!row) {
    throw new OtbDashboardServiceError(404, 'PLAN_NOT_FOUND', 'Purchase plan not found.');
  }
  if (row.status === 'archived' || row.archivedAt != null) {
    throw new OtbDashboardServiceError(409, 'PLAN_ARCHIVED', 'Archived purchase plans cannot be used on the OTB dashboard.');
  }
}

function buildRowWhere(params: OtbDashboardFilterParams): { whereSql: string; values: unknown[] } {
  const values: unknown[] = [params.planId];
  const conditions = ['r.plan_id = $1::uuid'];

  if (params.year != null) {
    values.push(params.year);
    conditions.push(`substring(r.year_month, 1, 4)::int = $${values.length}::int`);
  }
  if (params.month != null) {
    values.push(params.month);
    conditions.push(`substring(r.year_month, 6, 2)::int = $${values.length}::int`);
  }
  if (params.departmentNumber != null) {
    values.push(params.departmentNumber);
    conditions.push(`r.department_number = $${values.length}::int`);
  }

  return { whereSql: conditions.join(' AND '), values };
}

const COMMITTED_UNITS_SQL = '(COALESCE(r.current_on_order, 0) + COALESCE(r.future_on_order, 0) + COALESCE(r.native_open_po, 0))';
const OPEN_TO_BUY_UNITS_SQL = `(COALESCE(r.current_buy, 0) - ${COMMITTED_UNITS_SQL})`;

const SORT_SQL: Record<OtbDashboardSortField, string> = {
  yearMonth: 'r.year_month',
  departmentNumber: 'r.department_number',
  departmentLabel: 'r.department_label',
  plannedBuyUnits: 'r.current_buy',
  projectedSalesUnits: 'r.current_proj_sales',
  currentOnOrderUnits: 'r.current_on_order',
  futureOnOrderUnits: 'r.future_on_order',
  nativeOpenPoUnits: 'r.native_open_po',
  committedUnits: COMMITTED_UNITS_SQL,
  stockPositionUnits: 'r.stock_position',
  openToBuyUnits: OPEN_TO_BUY_UNITS_SQL,
};

export async function listOtbDashboardPlans(params: { status?: OtbDashboardPlanStatus } = {}): Promise<OtbDashboardPlan[]> {
  const status = params.status === 'draft' ? 'draft' : null;
  const rows = await prisma.$queryRawUnsafe<PlanHeaderDb[]>(
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
        COUNT(r.id)::int AS "rowCount",
        COALESCE(SUM(r.current_buy), 0)::int AS "plannedBuyUnits",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt"
      FROM app.purchase_plan p
      LEFT JOIN app.store_group sg ON sg.code = p.store_group_code
      LEFT JOIN app.purchase_plan_row r ON r.plan_id = p.id
      WHERE ($1::text IS NULL OR p.status = $1::text)
        AND COALESCE(p.status, 'draft') <> 'archived'
        AND p.archived_at IS NULL
      GROUP BY p.id, sg.label
      ORDER BY p.updated_at DESC, p.created_at DESC
    `,
    status,
  );
  return rows.map(normalizePlan);
}

export async function getOtbDashboardSummary(params: OtbDashboardFilterParams): Promise<OtbDashboardSummary> {
  await requireUsablePlan(params.planId);
  const { whereSql, values } = buildRowWhere(params);
  const rows = await prisma.$queryRawUnsafe<TrendDb[]>(
    `
      SELECT
        r.year_month AS "periodLabel",
        COALESCE(SUM(r.current_buy), 0)::int AS "plannedBuyUnits",
        COALESCE(SUM(r.current_proj_sales), 0)::int AS "projectedSalesUnits",
        COALESCE(SUM(${COMMITTED_UNITS_SQL}), 0)::int AS "committedUnits",
        COALESCE(SUM(r.stock_position), 0)::int AS "stockPositionUnits",
        COALESCE(SUM(${OPEN_TO_BUY_UNITS_SQL}), 0)::int AS "openToBuyUnits",
        COUNT(*)::int AS "rowCount"
      FROM app.purchase_plan_row r
      WHERE ${whereSql}
      GROUP BY r.year_month
      ORDER BY r.year_month ASC
    `,
    ...values,
  );

  const trend = rows.map(normalizeTrendPoint);
  const totals = trend.reduce(
    (acc, point) => ({
      plannedBuyUnits: acc.plannedBuyUnits + point.plannedBuyUnits,
      projectedSalesUnits: acc.projectedSalesUnits + point.projectedSalesUnits,
      committedUnits: acc.committedUnits + point.committedUnits,
      stockPositionUnits: acc.stockPositionUnits + point.stockPositionUnits,
      openToBuyUnits: acc.openToBuyUnits + point.openToBuyUnits,
      rowCount: acc.rowCount + point.rowCount,
    }),
    {
      plannedBuyUnits: 0,
      projectedSalesUnits: 0,
      committedUnits: 0,
      stockPositionUnits: 0,
      openToBuyUnits: 0,
      rowCount: 0,
    },
  );

  return {
    planId: params.planId,
    year: params.year,
    month: params.month,
    departmentNumber: params.departmentNumber,
    totals,
    trend,
    generatedAt: new Date().toISOString(),
  };
}

export async function listOtbDashboardRows(
  params: OtbDashboardRowsParams,
): Promise<PaginationEnvelope<OtbDashboardRow>> {
  await requireUsablePlan(params.planId);
  const { whereSql, values } = buildRowWhere(params);
  const countRows = await prisma.$queryRawUnsafe<Array<{ totalItems: unknown }>>(
    `
      SELECT COUNT(*)::int AS "totalItems"
      FROM app.purchase_plan_row r
      WHERE ${whereSql}
    `,
    ...values,
  );
  const totalItems = toUnits(countRows[0]?.totalItems);
  const offset = (params.page - 1) * params.pageSize;
  const sortSql = SORT_SQL[params.sort] ?? SORT_SQL.openToBuyUnits;
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';
  const dataValues = [...values, params.pageSize, offset];
  const rows = await prisma.$queryRawUnsafe<DashboardRowDb[]>(
    `
      SELECT
        r.id::text AS id,
        r.plan_id::text AS "planId",
        p.label AS "planLabel",
        COALESCE(p.planning_scope, 'store_group') AS "planningScope",
        p.scope_label AS "scopeLabel",
        p.store_group_code AS "storeGroupCode",
        sg.label AS "storeGroupLabel",
        r.department_key AS "departmentKey",
        r.department_number AS "departmentNumber",
        r.department_label AS "departmentLabel",
        r.year_month AS "yearMonth",
        COALESCE(r.current_buy, 0)::int AS "plannedBuyUnits",
        COALESCE(r.current_proj_sales, 0)::int AS "projectedSalesUnits",
        COALESCE(r.current_on_order, 0)::int AS "currentOnOrderUnits",
        COALESCE(r.future_on_order, 0)::int AS "futureOnOrderUnits",
        COALESCE(r.native_open_po, 0)::int AS "nativeOpenPoUnits",
        ${COMMITTED_UNITS_SQL}::int AS "committedUnits",
        COALESCE(r.stock_position, 0)::int AS "stockPositionUnits",
        ${OPEN_TO_BUY_UNITS_SQL}::int AS "openToBuyUnits"
      FROM app.purchase_plan_row r
      JOIN app.purchase_plan p ON p.id = r.plan_id
      LEFT JOIN app.store_group sg ON sg.code = p.store_group_code
      WHERE ${whereSql}
      ORDER BY ${sortSql} ${sortDir} NULLS LAST,
        r.department_number ASC NULLS LAST,
        r.department_key ASC,
        r.year_month ASC,
        r.id ASC
      LIMIT $${values.length + 1}::int
      OFFSET $${values.length + 2}::int
    `,
    ...dataValues,
  );

  return {
    data: rows.map(normalizeDashboardRow),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages: Math.max(Math.ceil(totalItems / params.pageSize), 1),
    },
  };
}
