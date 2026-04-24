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
  ).all(...values, params.pageSize, offset) as unknown as OtbPlanRowDbRow[];

  return { items: rows.map(rowToOtbPlanRow), total, page: params.page, pageSize: params.pageSize };
}

export function deleteOtbPlanRow(id: string): { ok: true } | { code: 'NOT_FOUND' } {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM otb_plan_rows WHERE id = ?').get(id);
  if (!existing) return { code: 'NOT_FOUND' };
  db.prepare('DELETE FROM otb_plan_rows WHERE id = ?').run(id);
  return { ok: true };
}

const SCALAR_PATCH_COLUMNS = {
  pctChangeLyToCy: 'pct_change_ly_to_cy',
  pctChangeCyToNy: 'pct_change_cy_to_ny',
  plannedTurnover1h: 'planned_turnover_1h',
  plannedTurnover2h: 'planned_turnover_2h',
  plannedGpPct: 'planned_gp_pct',
} as const;

type ScalarPatchKey = keyof typeof SCALAR_PATCH_COLUMNS;

export function updateOtbPlanRow(id: string, patch: UpdateOtbPlanRowInput): OtbPlanRow | OtbPlanRowError {
  for (const [field, arr] of [['lySales', patch.lySales], ['plannedSales', patch.plannedSales], ['markdownPct', patch.markdownPct]] as const) {
    const err = validateMonthlyArray(arr, field);
    if (err) return err;
  }
  if (patch.plannedGpPct !== undefined && patch.plannedGpPct !== null && (patch.plannedGpPct < -100 || patch.plannedGpPct > 100)) {
    return { code: 'INVALID_GP_PCT', value: patch.plannedGpPct };
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM otb_plan_rows WHERE id = ?').get(id) as OtbPlanRowDbRow | undefined;
  if (!existing) return { code: 'NOT_FOUND' };

  const changedBy = patch.changedBy ?? 'system';
  const sets: string[] = [];
  const values: DbValue[] = [];
  const auditWrites: Array<[string, string | null, string | null]> = [];

  for (const key of Object.keys(SCALAR_PATCH_COLUMNS) as ScalarPatchKey[]) {
    const patchVal = patch[key];
    if (patchVal === undefined) continue;
    const col = SCALAR_PATCH_COLUMNS[key];
    const oldVal = (existing as unknown as Record<string, number | null>)[col];
    const newVal = patchVal;
    if (oldVal === newVal) continue;
    sets.push(`${col} = ?`);
    values.push(newVal);
    auditWrites.push([col, oldVal === null || oldVal === undefined ? null : String(oldVal), newVal === null ? null : String(newVal)]);
  }

  for (const [field, prefix] of [
    ['lySales', 'ly_sales'],
    ['plannedSales', 'planned_sales'],
    ['markdownPct', 'markdown_pct'],
  ] as const) {
    const arr = patch[field];
    if (!arr) continue;
    for (let i = 0; i < 12; i++) {
      const col = `${prefix}_${MONTH_COLUMN_SUFFIXES[i]}`;
      const oldVal = (existing as unknown as Record<string, number | null>)[col];
      const newVal = arr[i] ?? null;
      if (oldVal === newVal) continue;
      sets.push(`${col} = ?`);
      values.push(newVal);
      auditWrites.push([col, oldVal === null || oldVal === undefined ? null : String(oldVal), newVal === null ? null : String(newVal)]);
    }
  }

  if (sets.length === 0) {
    return rowToOtbPlanRow(existing);
  }

  db.exec('BEGIN');
  try {
    for (const [field, oldStr, newStr] of auditWrites) {
      db.prepare(
        `INSERT INTO otb_plan_row_audit (id, otb_plan_row_id, field_changed, old_value, new_value, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), id, field, oldStr, newStr, changedBy);
    }
    sets.push(`updated_at = datetime('now')`);
    db.prepare(`UPDATE otb_plan_rows SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getOtbPlanRow(id) as OtbPlanRow;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function recalculatePlannedSales(id: string, changedBy = 'system'): OtbPlanRow | OtbPlanRowError {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM otb_plan_rows WHERE id = ?').get(id) as OtbPlanRowDbRow | undefined;
  if (!existing) return { code: 'NOT_FOUND' };

  const pct = existing.pct_change_ly_to_cy;
  if (pct === null || pct === undefined) {
    return rowToOtbPlanRow(existing);
  }

  const updates: string[] = [];
  const values: DbValue[] = [];
  const auditWrites: Array<[string, string | null, string | null]> = [];

  for (let i = 0; i < 12; i++) {
    const suffix = MONTH_COLUMN_SUFFIXES[i];
    const lyCol = `ly_sales_${suffix}`;
    const plannedCol = `planned_sales_${suffix}`;
    const ly = (existing as unknown as Record<string, number | null>)[lyCol];
    const oldPlanned = (existing as unknown as Record<string, number | null>)[plannedCol];
    if (ly === null || ly === undefined) continue;
    const newPlanned = round2(ly * (1 + pct / 100));
    if (oldPlanned === newPlanned) continue;
    updates.push(`${plannedCol} = ?`);
    values.push(newPlanned);
    auditWrites.push([plannedCol, oldPlanned === null || oldPlanned === undefined ? null : String(oldPlanned), String(newPlanned)]);
  }

  if (updates.length === 0) return rowToOtbPlanRow(existing);

  db.exec('BEGIN');
  try {
    for (const [field, oldStr, newStr] of auditWrites) {
      db.prepare(
        `INSERT INTO otb_plan_row_audit (id, otb_plan_row_id, field_changed, old_value, new_value, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), id, field, oldStr, newStr, changedBy);
    }
    updates.push(`updated_at = datetime('now')`);
    db.prepare(`UPDATE otb_plan_rows SET ${updates.join(', ')} WHERE id = ?`).run(...values, id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getOtbPlanRow(id) as OtbPlanRow;
}

export function copyOtbPlanRow(
  sourceId: string,
  targetStoreId: string,
  targetCategoryId: string,
  changedBy = 'system',
): OtbPlanRow | OtbPlanRowError {
  const source = getOtbPlanRow(sourceId);
  if ('code' in source) return source;

  return createOtbPlanRow({
    storeId: targetStoreId,
    categoryId: targetCategoryId,
    fiscalYear: source.fiscalYear,
    pctChangeLyToCy: source.pctChangeLyToCy,
    pctChangeCyToNy: source.pctChangeCyToNy,
    plannedTurnover1h: source.plannedTurnover1h,
    plannedTurnover2h: source.plannedTurnover2h,
    plannedGpPct: source.plannedGpPct,
    lySales: source.lySales,
    plannedSales: source.plannedSales,
    markdownPct: source.markdownPct,
    createdBy: changedBy,
  });
}

export function getOtbPlanRowAudit(otbPlanRowId: string): OtbPlanRowAudit[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM otb_plan_row_audit WHERE otb_plan_row_id = ? ORDER BY created_at DESC'
  ).all(otbPlanRowId) as unknown as OtbPlanRowAuditDbRow[];
  return rows.map(rowToOtbPlanRowAudit);
}
