import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import {
  OtbBudget,
  OtbBudgetRow,
  OtbBudgetAuditRow,
  OtbBudgetAudit,
  OtbSummary,
  BudgetCheckResult,
  Department,
  rowToOtbBudget,
  rowToOtbBudgetAudit,
} from '../models/otbBudget';
import { PaginationEnvelope } from '../models/sku';
import { getPurchasingContract } from '../contracts/purchasingContract';

type DbValue = null | number | bigint | string;

export function createOtbBudget(data: {
  department: Department;
  year: number;
  month: number;
  plannedBudget: number;
  notes?: string | null;
  createdBy?: string;
}): OtbBudget | { error: string } {
  const db = getDb();
  const id = uuidv4();

  // Check for duplicate department+year+month
  const existing = db.prepare(
    'SELECT id FROM otb_budgets WHERE department = ? AND year = ? AND month = ?'
  ).get(data.department, data.year, data.month);
  if (existing) {
    return { error: 'DUPLICATE_BUDGET' };
  }

  db.prepare(
    `INSERT INTO otb_budgets (id, department, year, month, planned_budget, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.department, data.year, data.month, data.plannedBudget, data.notes ?? null, data.createdBy ?? 'system');

  return getOtbBudgetById(id)!;
}

export function getOtbBudgetById(id: string): OtbBudget | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM otb_budgets WHERE id = ?').get(id) as unknown as OtbBudgetRow | undefined;
  return row ? rowToOtbBudget(row) : null;
}

export function updateOtbBudget(
  id: string,
  data: { plannedBudget?: number; notes?: string | null; changedBy?: string }
): OtbBudget | null | { error: string } {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM otb_budgets WHERE id = ?').get(id) as unknown as OtbBudgetRow | undefined;
  if (!existing) return null;

  const changedBy = data.changedBy ?? 'system';

  db.exec('BEGIN');
  try {
    // Audit trail for each changed field
    if (data.plannedBudget !== undefined && data.plannedBudget !== existing.planned_budget) {
      db.prepare(
        `INSERT INTO otb_budget_audit (id, otb_budget_id, field_changed, old_value, new_value, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), id, 'planned_budget', String(existing.planned_budget), String(data.plannedBudget), changedBy);

      db.prepare('UPDATE otb_budgets SET planned_budget = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(data.plannedBudget, id);
    }

    if (data.notes !== undefined && data.notes !== existing.notes) {
      db.prepare(
        `INSERT INTO otb_budget_audit (id, otb_budget_id, field_changed, old_value, new_value, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), id, 'notes', existing.notes, data.notes, changedBy);

      db.prepare('UPDATE otb_budgets SET notes = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(data.notes ?? null, id);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getOtbBudgetById(id)!;
}

const OTB_SORT_MAP: Record<string, string> = {
  department: 'department',
  year: 'year',
  month: 'month',
  plannedBudget: 'planned_budget',
  createdAt: 'created_at',
};

export function listOtbBudgets(params: {
  page: number;
  pageSize: number;
  sort?: string;
  order?: 'asc' | 'desc';
  department?: Department;
  year?: number;
  month?: number;
}): PaginationEnvelope<OtbBudget> {
  const db = getDb();
  const conditions: string[] = [];
  const values: DbValue[] = [];

  if (params.department) {
    conditions.push('department = ?');
    values.push(params.department);
  }
  if (params.year) {
    conditions.push('year = ?');
    values.push(params.year);
  }
  if (params.month) {
    conditions.push('month = ?');
    values.push(params.month);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM otb_budgets ${whereClause}`).get(...values) as unknown as { cnt: number };
  const totalItems = countRow.cnt;

  const sortCol = OTB_SORT_MAP[params.sort ?? 'year'] || 'year';
  const sortDir = params.order === 'desc' ? 'DESC' : 'ASC';

  const offset = (params.page - 1) * params.pageSize;
  const rows = db.prepare(
    `SELECT * FROM otb_budgets ${whereClause} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`
  ).all(...values, params.pageSize, offset) as unknown as OtbBudgetRow[];

  return {
    data: rows.map(rowToOtbBudget),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / params.pageSize),
    },
  };
}

export function getOtbBudgetAudit(budgetId: string): OtbBudgetAudit[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM otb_budget_audit WHERE otb_budget_id = ? ORDER BY created_at DESC'
  ).all(budgetId) as unknown as OtbBudgetAuditRow[];
  return rows.map(rowToOtbBudgetAudit);
}

/**
 * OTB Summary: for each department+month, shows planned budget vs committed (open PO value) vs received.
 * Committed = sum of PO line totals for POs in SUBMITTED, CONFIRMED, or PARTIALLY_RECEIVED status.
 * Received = sum of (quantity_received * unit_cost) for POs in any receiving state.
 * Remaining OTB = planned - committed.
 *
 * Cross-module data is consumed through the governed purchasing contract adapter (ZAI-137/ZAI-145).
 */
export function getOtbSummary(params: {
  year: number;
  month?: number;
  department?: Department;
}): OtbSummary[] {
  const db = getDb();
  const purchasing = getPurchasingContract();

  // Query OTB budgets (own module table)
  const conditions: string[] = ['b.year = ?'];
  const values: DbValue[] = [params.year];

  if (params.month) {
    conditions.push('b.month = ?');
    values.push(params.month);
  }
  if (params.department) {
    conditions.push('b.department = ?');
    values.push(params.department);
  }

  const whereClause = conditions.join(' AND ');
  const budgetRows = db.prepare(
    `SELECT * FROM otb_budgets b WHERE ${whereClause} ORDER BY b.month ASC, b.department ASC`
  ).all(...values) as unknown as OtbBudgetRow[];

  // Fetch committed and received totals via governed purchasing contract
  const committedData = purchasing.getCommittedByDepartmentPeriod(params.year, params.month, params.department);
  const receivedData = purchasing.getReceivedByDepartmentPeriod(params.year, params.month, params.department);

  // Index by department+month for O(1) lookup
  const committedMap = new Map<string, number>();
  for (const c of committedData) {
    committedMap.set(`${c.department}:${c.month}`, c.totalAmount);
  }
  const receivedMap = new Map<string, number>();
  for (const r of receivedData) {
    receivedMap.set(`${r.department}:${r.month}`, r.totalAmount);
  }

  return budgetRows.map((b) => {
    const committedAmount = committedMap.get(`${b.department}:${b.month}`) ?? 0;
    const receivedAmount = receivedMap.get(`${b.department}:${b.month}`) ?? 0;
    const remainingOtb = b.planned_budget - committedAmount;
    const utilizationPercent = b.planned_budget > 0
      ? Math.round((committedAmount / b.planned_budget) * 10000) / 100
      : 0;
    return {
      department: b.department,
      year: b.year,
      month: b.month,
      plannedBudget: b.planned_budget,
      committedAmount,
      receivedAmount,
      remainingOtb,
      utilizationPercent,
      budgetExceeded: committedAmount > b.planned_budget,
    };
  });
}

/**
 * Check the budget impact of a purchase order against OTB budgets.
 * Groups PO line totals by department (via SKU) and checks against the
 * OTB budget for the PO's creation month. Returns per-department results.
 *
 * Cross-module data is consumed through the governed purchasing contract adapter (ZAI-137/ZAI-145).
 */
export function checkBudgetImpact(poId: string): BudgetCheckResult[] | { error: string } {
  const db = getDb();
  const purchasing = getPurchasingContract();

  // Get PO metadata via governed contract
  const po = purchasing.getPoMeta(poId);
  if (!po) return { error: 'PO_NOT_FOUND' };

  const poYear = new Date(po.createdAt).getFullYear();
  const poMonth = new Date(po.createdAt).getMonth() + 1;

  // Get PO line totals grouped by department via governed contract
  const poLinesByDept = purchasing.getPoLineTotalsByDepartment(poId);

  const results: BudgetCheckResult[] = [];

  for (const line of poLinesByDept) {
    // Get budget for this department/month (OTB's own table)
    const budget = db.prepare(
      'SELECT * FROM otb_budgets WHERE department = ? AND year = ? AND month = ?'
    ).get(line.department, poYear, poMonth) as unknown as OtbBudgetRow | undefined;

    // If no budget is configured for this department/month, skip — nothing to check
    if (!budget) continue;

    const plannedBudget = budget.planned_budget;

    // Get current committed amount excluding this PO, via governed contract
    const currentCommitted = purchasing.getCommittedExcludingPo(line.department, poYear, poMonth, poId);
    const projectedCommitted = currentCommitted + line.totalAmount;
    const remainingAfter = plannedBudget - projectedCommitted;
    const exceedsBudget = projectedCommitted > plannedBudget;
    const overageAmount = exceedsBudget ? projectedCommitted - plannedBudget : 0;

    results.push({
      department: line.department as Department,
      year: poYear,
      month: poMonth,
      plannedBudget,
      currentCommitted,
      poAmount: line.totalAmount,
      projectedCommitted,
      remainingAfter,
      exceedsBudget,
      overageAmount,
    });
  }

  return results;
}

export function deleteOtbBudget(id: string): boolean {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM otb_budgets WHERE id = ?').get(id);
  if (!existing) return false;

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM otb_budget_audit WHERE otb_budget_id = ?').run(id);
    db.prepare('DELETE FROM otb_budgets WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return true;
}
