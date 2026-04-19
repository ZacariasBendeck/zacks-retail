export type MonthIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type MonthlyArray = (number | null)[]; // length 12, indexed 0 = January of fiscal_year

export interface OtbPlanRowDbRow {
  id: string;
  store_id: string;
  category_id: string;
  fiscal_year: number;
  pct_change_ly_to_cy: number | null;
  pct_change_cy_to_ny: number | null;
  planned_turnover_1h: number | null;
  planned_turnover_2h: number | null;
  planned_gp_pct: number | null;
  ly_sales_m01: number | null; ly_sales_m02: number | null; ly_sales_m03: number | null;
  ly_sales_m04: number | null; ly_sales_m05: number | null; ly_sales_m06: number | null;
  ly_sales_m07: number | null; ly_sales_m08: number | null; ly_sales_m09: number | null;
  ly_sales_m10: number | null; ly_sales_m11: number | null; ly_sales_m12: number | null;
  planned_sales_m01: number | null; planned_sales_m02: number | null; planned_sales_m03: number | null;
  planned_sales_m04: number | null; planned_sales_m05: number | null; planned_sales_m06: number | null;
  planned_sales_m07: number | null; planned_sales_m08: number | null; planned_sales_m09: number | null;
  planned_sales_m10: number | null; planned_sales_m11: number | null; planned_sales_m12: number | null;
  markdown_pct_m01: number | null; markdown_pct_m02: number | null; markdown_pct_m03: number | null;
  markdown_pct_m04: number | null; markdown_pct_m05: number | null; markdown_pct_m06: number | null;
  markdown_pct_m07: number | null; markdown_pct_m08: number | null; markdown_pct_m09: number | null;
  markdown_pct_m10: number | null; markdown_pct_m11: number | null; markdown_pct_m12: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OtbPlanRow {
  id: string;
  storeId: string;
  categoryId: string;
  fiscalYear: number;
  pctChangeLyToCy: number | null;
  pctChangeCyToNy: number | null;
  plannedTurnover1h: number | null;
  plannedTurnover2h: number | null;
  plannedGpPct: number | null;
  lySales: MonthlyArray;
  plannedSales: MonthlyArray;
  markdownPct: MonthlyArray;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtbPlanRowAuditDbRow {
  id: string;
  otb_plan_row_id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  created_at: string;
}

export interface OtbPlanRowAudit {
  id: string;
  otbPlanRowId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
}

export const MONTH_COLUMN_SUFFIXES = [
  'm01', 'm02', 'm03', 'm04', 'm05', 'm06',
  'm07', 'm08', 'm09', 'm10', 'm11', 'm12',
] as const;

function monthlyFromRow(row: OtbPlanRowDbRow, prefix: 'ly_sales' | 'planned_sales' | 'markdown_pct'): MonthlyArray {
  return MONTH_COLUMN_SUFFIXES.map((suffix) => (row as unknown as Record<string, number | null>)[`${prefix}_${suffix}`] ?? null);
}

export function rowToOtbPlanRow(row: OtbPlanRowDbRow): OtbPlanRow {
  return {
    id: row.id,
    storeId: row.store_id,
    categoryId: row.category_id,
    fiscalYear: row.fiscal_year,
    pctChangeLyToCy: row.pct_change_ly_to_cy,
    pctChangeCyToNy: row.pct_change_cy_to_ny,
    plannedTurnover1h: row.planned_turnover_1h,
    plannedTurnover2h: row.planned_turnover_2h,
    plannedGpPct: row.planned_gp_pct,
    lySales: monthlyFromRow(row, 'ly_sales'),
    plannedSales: monthlyFromRow(row, 'planned_sales'),
    markdownPct: monthlyFromRow(row, 'markdown_pct'),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToOtbPlanRowAudit(row: OtbPlanRowAuditDbRow): OtbPlanRowAudit {
  return {
    id: row.id,
    otbPlanRowId: row.otb_plan_row_id,
    fieldChanged: row.field_changed,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedBy: row.changed_by,
    createdAt: row.created_at,
  };
}

export type OtbEntryMethod = 'CHANGE_OVER_LAST_YEAR' | 'FIXED_MONTHLY_MIX';

export interface CompanySettingDbRow {
  key: string;
  value: string;
  updated_by: string;
  updated_at: string;
}
