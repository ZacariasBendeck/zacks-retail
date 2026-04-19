import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import {
  MONTH_COLUMN_SUFFIXES,
  MonthlyArray,
  OtbPlanRow,
  OtbPlanRowAudit,
  OtbPlanRowAuditDbRow,
  OtbPlanRowDbRow,
  rowToOtbPlanRow,
  rowToOtbPlanRowAudit,
} from '../models/otbPlanRow';

type DbValue = null | number | string;

export type OtbPlanRowError =
  | { code: 'NOT_FOUND' }
  | { code: 'DUPLICATE_KEY'; storeId: string; categoryId: string; fiscalYear: number }
  | { code: 'INVALID_MONTHLY_ARRAY_LENGTH'; field: string; expected: 12; actual: number }
  | { code: 'INVALID_GP_PCT'; value: number };

export interface CreateOtbPlanRowInput {
  storeId: string;
  categoryId: string;
  fiscalYear: number;
  pctChangeLyToCy?: number | null;
  pctChangeCyToNy?: number | null;
  plannedTurnover1h?: number | null;
  plannedTurnover2h?: number | null;
  plannedGpPct?: number | null;
  lySales?: MonthlyArray;
  plannedSales?: MonthlyArray;
  markdownPct?: MonthlyArray;
  createdBy?: string;
}

export interface UpdateOtbPlanRowInput {
  pctChangeLyToCy?: number | null;
  pctChangeCyToNy?: number | null;
  plannedTurnover1h?: number | null;
  plannedTurnover2h?: number | null;
  plannedGpPct?: number | null;
  lySales?: MonthlyArray;
  plannedSales?: MonthlyArray;
  markdownPct?: MonthlyArray;
  changedBy?: string;
}

export interface ListParams {
  page: number;
  pageSize: number;
  storeId?: string;
  categoryId?: string;
  fiscalYear?: number;
}

export interface ListResult {
  items: OtbPlanRow[];
  total: number;
  page: number;
  pageSize: number;
}

function validateMonthlyArray(arr: MonthlyArray | undefined, field: string): OtbPlanRowError | null {
  if (arr === undefined) return null;
  if (arr.length !== 12) {
    return { code: 'INVALID_MONTHLY_ARRAY_LENGTH', field, expected: 12, actual: arr.length };
  }
  return null;
}

function fillMonthlyColumns(values: MonthlyArray | undefined, prefix: 'ly_sales' | 'planned_sales' | 'markdown_pct'): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (let i = 0; i < 12; i++) {
    out[`${prefix}_${MONTH_COLUMN_SUFFIXES[i]}`] = values?.[i] ?? null;
  }
  return out;
}

export function createOtbPlanRow(input: CreateOtbPlanRowInput): OtbPlanRow | OtbPlanRowError {
  for (const [field, arr] of [['lySales', input.lySales], ['plannedSales', input.plannedSales], ['markdownPct', input.markdownPct]] as const) {
    const err = validateMonthlyArray(arr, field);
    if (err) return err;
  }
  if (input.plannedGpPct !== undefined && input.plannedGpPct !== null && (input.plannedGpPct < -100 || input.plannedGpPct > 100)) {
    return { code: 'INVALID_GP_PCT', value: input.plannedGpPct };
  }

  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM otb_plan_rows WHERE store_id = ? AND category_id = ? AND fiscal_year = ?'
  ).get(input.storeId, input.categoryId, input.fiscalYear);
  if (existing) {
    return { code: 'DUPLICATE_KEY', storeId: input.storeId, categoryId: input.categoryId, fiscalYear: input.fiscalYear };
  }

  const id = uuidv4();
  const lyCols = fillMonthlyColumns(input.lySales, 'ly_sales');
  const plannedCols = fillMonthlyColumns(input.plannedSales, 'planned_sales');
  const markdownCols = fillMonthlyColumns(input.markdownPct, 'markdown_pct');
  const monthlyColNames = [...Object.keys(lyCols), ...Object.keys(plannedCols), ...Object.keys(markdownCols)];
  const monthlyColValues = [...Object.values(lyCols), ...Object.values(plannedCols), ...Object.values(markdownCols)];

  const sql = `
    INSERT INTO otb_plan_rows (
      id, store_id, category_id, fiscal_year,
      pct_change_ly_to_cy, pct_change_cy_to_ny,
      planned_turnover_1h, planned_turnover_2h, planned_gp_pct,
      ${monthlyColNames.join(', ')},
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${monthlyColNames.map(() => '?').join(', ')}, ?)
  `;
  db.prepare(sql).run(
    id, input.storeId, input.categoryId, input.fiscalYear,
    input.pctChangeLyToCy ?? null, input.pctChangeCyToNy ?? null,
    input.plannedTurnover1h ?? null, input.plannedTurnover2h ?? null, input.plannedGpPct ?? null,
    ...monthlyColValues,
    input.createdBy ?? 'system',
  );

  return getOtbPlanRow(id) as OtbPlanRow;
}

export function getOtbPlanRow(id: string): OtbPlanRow | { code: 'NOT_FOUND' } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM otb_plan_rows WHERE id = ?').get(id) as OtbPlanRowDbRow | undefined;
  return row ? rowToOtbPlanRow(row) : { code: 'NOT_FOUND' };
}

export function listOtbPlanRows(params: ListParams): ListResult {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.storeId) { conditions.push('store_id = ?'); values.push(params.storeId); }
  if (params.categoryId) { conditions.push('category_id = ?'); values.push(params.categoryId); }
  if (params.fiscalYear) { conditions.push('fiscal_year = ?'); values.push(params.fiscalYear); }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM otb_plan_rows ${whereClause}`).get(...values) as { cnt: number };
  const total = countRow.cnt;
  const offset = (params.page - 1) * params.pageSize;
  const rows = db.prepare(
    `SELECT * FROM otb_plan_rows ${whereClause} ORDER BY store_id ASC, category_id ASC, fiscal_year DESC LIMIT ? OFFSET ?`
  ).all(...values, params.pageSize, offset) as OtbPlanRowDbRow[];

  return { items: rows.map(rowToOtbPlanRow), total, page: params.page, pageSize: params.pageSize };
}

export function deleteOtbPlanRow(id: string): { ok: true } | { code: 'NOT_FOUND' } {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM otb_plan_rows WHERE id = ?').get(id);
  if (!existing) return { code: 'NOT_FOUND' };
  db.prepare('DELETE FROM otb_plan_rows WHERE id = ?').run(id);
  return { ok: true };
}

export function getOtbPlanRowAudit(otbPlanRowId: string): OtbPlanRowAudit[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM otb_plan_row_audit WHERE otb_plan_row_id = ? ORDER BY created_at DESC'
  ).all(otbPlanRowId) as OtbPlanRowAuditDbRow[];
  return rows.map(rowToOtbPlanRowAudit);
}
