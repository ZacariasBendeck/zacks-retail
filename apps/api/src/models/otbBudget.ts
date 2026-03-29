export type Department = 'FORMAL' | 'CASUAL' | 'FIESTA' | 'SANDALIAS' | 'BOOTS' | 'COMFORT';

export interface OtbBudgetRow {
  id: string;
  department: Department;
  year: number;
  month: number;
  planned_budget: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OtbBudgetAuditRow {
  id: string;
  otb_budget_id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  created_at: string;
}

export interface OtbBudget {
  id: string;
  department: Department;
  year: number;
  month: number;
  plannedBudget: number;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtbBudgetAudit {
  id: string;
  otbBudgetId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
}

export interface OtbSummary {
  department: Department;
  year: number;
  month: number;
  plannedBudget: number;
  committedAmount: number;
  receivedAmount: number;
  remainingOtb: number;
  utilizationPercent: number;
  budgetExceeded: boolean;
}

export interface BudgetCheckResult {
  department: Department;
  year: number;
  month: number;
  plannedBudget: number;
  currentCommitted: number;
  poAmount: number;
  projectedCommitted: number;
  remainingAfter: number;
  exceedsBudget: boolean;
  overageAmount: number;
}

export function rowToOtbBudget(row: OtbBudgetRow): OtbBudget {
  return {
    id: row.id,
    department: row.department,
    year: row.year,
    month: row.month,
    plannedBudget: row.planned_budget,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToOtbBudgetAudit(row: OtbBudgetAuditRow): OtbBudgetAudit {
  return {
    id: row.id,
    otbBudgetId: row.otb_budget_id,
    fieldChanged: row.field_changed,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedBy: row.changed_by,
    createdAt: row.created_at,
  };
}
