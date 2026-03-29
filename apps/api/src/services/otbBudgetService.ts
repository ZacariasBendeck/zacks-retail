import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import {
  OtbBudget,
  OtbBudgetRow,
  OtbBudgetAuditRow,
  OtbBudgetAudit,
  OtbSummary,
  Department,
  rowToOtbBudget,
  rowToOtbBudgetAudit,
} from '../models/otbBudget';
import { PaginationEnvelope } from '../models/sku';

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

export function listOtbBudgets(params: {
  page: number;
  pageSize: number;
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

  const offset = (params.page - 1) * params.pageSize;
  const rows = db.prepare(
    `SELECT * FROM otb_budgets ${whereClause} ORDER BY year DESC, month DESC, department ASC LIMIT ? OFFSET ?`
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
 */
export function getOtbSummary(params: {
  year: number;
  month?: number;
  department?: Department;
}): OtbSummary[] {
  const db = getDb();

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

  // Get budgets with committed and received amounts from POs
  // PO lines are matched to departments via SKU department
  // Committed statuses: SUBMITTED, CONFIRMED, PARTIALLY_RECEIVED (open orders)
  // Received: actual cost of goods received
  const rows = db.prepare(`
    SELECT
      b.department,
      b.year,
      b.month,
      b.planned_budget,
      COALESCE(committed.total, 0) as committed_amount,
      COALESCE(received.total, 0) as received_amount
    FROM otb_budgets b
    LEFT JOIN (
      SELECT
        s.department,
        strftime('%Y', po.created_at) as yr,
        CAST(strftime('%m', po.created_at) AS INTEGER) as mo,
        SUM(pol.quantity_ordered * pol.unit_cost) as total
      FROM purchase_order_lines pol
      JOIN purchase_orders po ON po.id = pol.po_id
      JOIN skus s ON s.id = pol.sku_id
      WHERE po.status IN ('SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED')
      GROUP BY s.department, yr, mo
    ) committed ON committed.department = b.department
      AND CAST(committed.yr AS INTEGER) = b.year
      AND committed.mo = b.month
    LEFT JOIN (
      SELECT
        s.department,
        strftime('%Y', po.created_at) as yr,
        CAST(strftime('%m', po.created_at) AS INTEGER) as mo,
        SUM(pol.quantity_received * pol.unit_cost) as total
      FROM purchase_order_lines pol
      JOIN purchase_orders po ON po.id = pol.po_id
      JOIN skus s ON s.id = pol.sku_id
      WHERE po.status IN ('PARTIALLY_RECEIVED','RECEIVED','CLOSED')
      GROUP BY s.department, yr, mo
    ) received ON received.department = b.department
      AND CAST(received.yr AS INTEGER) = b.year
      AND received.mo = b.month
    WHERE ${whereClause}
    ORDER BY b.month ASC, b.department ASC
  `).all(...values) as unknown as {
    department: Department;
    year: number;
    month: number;
    planned_budget: number;
    committed_amount: number;
    received_amount: number;
  }[];

  return rows.map((r) => ({
    department: r.department,
    year: r.year,
    month: r.month,
    plannedBudget: r.planned_budget,
    committedAmount: r.committed_amount,
    receivedAmount: r.received_amount,
    remainingOtb: r.planned_budget - r.committed_amount,
  }));
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
