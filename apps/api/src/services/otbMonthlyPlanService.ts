import { randomUUID } from 'crypto';
import { getDb } from '../db/database';
import { PaginationEnvelope } from '../models/sku';

// ── DTOs ────────────────────────────────────────────────────────────

export interface OtbMonthlyPlanRow {
  id: string;
  otbBudgetId: string;
  macroDepartment: string;
  year: number;
  month: number;
  planMonth: string;
  skuId: string;
  skuSizeId: string;
  sizeLabel: string;
  brandId: string | null;
  style: string;
  colorId: string | null;
  categoryId: string | null;
  budgetAmount: number;
  committedAmount: number;
  receivedAmount: number;
  remainingToCommitAmount: number;
  remainingToReceiveAmount: number;
  budgetVsReceivedVarianceAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOtbMonthlyPlanInput {
  otbBudgetId: string;
  skuId: string;
  skuSizeId: string;
  budgetAmount: number;
  committedAmount?: number;
  receivedAmount?: number;
  notes?: string;
}

export interface UpdateOtbMonthlyPlanInput {
  budgetAmount?: number;
  committedAmount?: number;
  receivedAmount?: number;
  notes?: string;
}

export interface OtbMonthlyPlanListParams {
  page: number;
  pageSize: number;
  sort?: string;
  order?: 'asc' | 'desc';
  year?: number;
  month?: number;
  department?: string;
  skuId?: string;
  style?: string;
}

type DbValue = null | number | bigint | string;

// ── Column mapping ──────────────────────────────────────────────────

const SORT_MAP: Record<string, string> = {
  planMonth: 'plan_month',
  macroDepartment: 'macro_department',
  style: 'style',
  sizeLabel: 'size_label',
  budgetAmount: 'budget_amount',
  committedAmount: 'committed_amount',
  receivedAmount: 'received_amount',
  remainingToCommitAmount: 'remaining_to_commit_amount',
  remainingToReceiveAmount: 'remaining_to_receive_amount',
  budgetVsReceivedVarianceAmount: 'budget_vs_received_variance_amount',
  updatedAt: 'updated_at',
};

// ── Helpers ─────────────────────────────────────────────────────────

function mapViewRow(r: any): OtbMonthlyPlanRow {
  return {
    id: r.id,
    otbBudgetId: r.otb_budget_id,
    macroDepartment: r.macro_department,
    year: r.year,
    month: r.month,
    planMonth: r.plan_month,
    skuId: r.sku_id,
    skuSizeId: r.sku_size_id,
    sizeLabel: r.size_label,
    brandId: r.brand_id,
    style: r.style,
    colorId: r.color_id,
    categoryId: r.category_id,
    budgetAmount: r.budget_amount,
    committedAmount: r.committed_amount,
    receivedAmount: r.received_amount,
    remainingToCommitAmount: r.remaining_to_commit_amount,
    remainingToReceiveAmount: r.remaining_to_receive_amount,
    budgetVsReceivedVarianceAmount: r.budget_vs_received_variance_amount,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── CRUD ────────────────────────────────────────────────────────────

export function createMonthlyPlan(input: CreateOtbMonthlyPlanInput): OtbMonthlyPlanRow | { error: string; message: string } {
  const db = getDb();
  const id = randomUUID();
  const committed = input.committedAmount ?? 0;
  const received = input.receivedAmount ?? 0;

  try {
    db.prepare(`
      INSERT INTO otb_monthly_department_sku_plan
        (id, otb_budget_id, sku_id, sku_size_id, budget_amount, committed_amount, received_amount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.otbBudgetId, input.skuId, input.skuSizeId, input.budgetAmount, committed, received, input.notes ?? null);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint failed')) {
      return { error: 'DUPLICATE_PLAN_LINE', message: 'A plan line already exists for this budget and SKU size.' };
    }
    if (e.message?.includes('sku_size_id must belong to sku_id')) {
      return { error: 'SKU_SIZE_MISMATCH', message: 'The sku_size_id does not belong to the given sku_id.' };
    }
    if (e.message?.includes('department must match')) {
      return { error: 'DEPARTMENT_MISMATCH', message: 'The OTB budget department does not match the SKU department.' };
    }
    if (e.message?.includes('RICS 556-599')) {
      return { error: 'CATEGORY_GUARDRAIL', message: 'SKU category must be in RICS range 556-599.' };
    }
    throw e;
  }

  return getMonthlyPlanById(id)!;
}

export function getMonthlyPlanById(id: string): OtbMonthlyPlanRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM v_otb_monthly_department_sku_plan WHERE id = ?').get(id) as any;
  return row ? mapViewRow(row) : null;
}

export function updateMonthlyPlan(id: string, input: UpdateOtbMonthlyPlanInput): OtbMonthlyPlanRow | null | { error: string; message: string } {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM otb_monthly_department_sku_plan WHERE id = ?').get(id) as any;
  if (!existing) return null;

  const sets: string[] = [];
  const values: DbValue[] = [];

  if (input.budgetAmount !== undefined) {
    sets.push('budget_amount = ?');
    values.push(input.budgetAmount);
  }
  if (input.committedAmount !== undefined) {
    sets.push('committed_amount = ?');
    values.push(input.committedAmount);
  }
  if (input.receivedAmount !== undefined) {
    sets.push('received_amount = ?');
    values.push(input.receivedAmount);
  }
  if (input.notes !== undefined) {
    sets.push('notes = ?');
    values.push(input.notes);
  }

  if (sets.length === 0) return getMonthlyPlanById(id);

  sets.push("updated_at = datetime('now')");
  values.push(id);

  try {
    db.prepare(`UPDATE otb_monthly_department_sku_plan SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  } catch (e: any) {
    if (e.message?.includes('CHECK constraint failed')) {
      return { error: 'CONSTRAINT_VIOLATION', message: 'Financial amounts must satisfy: 0 <= received <= committed <= budget.' };
    }
    throw e;
  }

  return getMonthlyPlanById(id)!;
}

export function deleteMonthlyPlan(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM otb_monthly_department_sku_plan WHERE id = ?').run(id);
  return result.changes > 0;
}

// ── List (server-side table) ────────────────────────────────────────

export function listMonthlyPlans(params: OtbMonthlyPlanListParams): PaginationEnvelope<OtbMonthlyPlanRow> {
  const db = getDb();

  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.year != null) {
    conditions.push('year = ?');
    values.push(params.year);
  }
  if (params.month != null) {
    conditions.push('month = ?');
    values.push(params.month);
  }
  if (params.department) {
    conditions.push('macro_department = ?');
    values.push(params.department);
  }
  if (params.skuId) {
    conditions.push('sku_id = ?');
    values.push(params.skuId);
  }
  if (params.style) {
    conditions.push('LOWER(style) LIKE ?');
    values.push(`%${params.style.toLowerCase()}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(
    `SELECT COUNT(*) as cnt FROM v_otb_monthly_department_sku_plan ${whereClause}`
  ).get(...values) as unknown as { cnt: number };
  const totalItems = countRow.cnt;

  const sortCol = SORT_MAP[params.sort ?? 'updatedAt'] || 'updated_at';
  const sortDir = params.order === 'asc' ? 'ASC' : 'DESC';
  const offset = (params.page - 1) * params.pageSize;

  const rows = db.prepare(`
    SELECT * FROM v_otb_monthly_department_sku_plan
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `).all(...values, params.pageSize, offset) as any[];

  return {
    data: rows.map(mapViewRow),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages: Math.max(Math.ceil(totalItems / params.pageSize), 1),
    },
  };
}
