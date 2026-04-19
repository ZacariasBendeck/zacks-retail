export type MonthlyArray = (number | null)[];

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

export interface OtbPlanRowAudit {
  id: string;
  otbPlanRowId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
}

export interface OtbPlanRowListParams {
  page?: number;
  pageSize?: number;
  storeId?: string;
  categoryId?: string;
  fiscalYear?: number;
}

export interface OtbPlanRowListResult {
  items: OtbPlanRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateOtbPlanRowPayload {
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

export type UpdateOtbPlanRowPayload = Partial<Omit<CreateOtbPlanRowPayload, 'storeId' | 'categoryId' | 'fiscalYear'>> & { changedBy?: string };

export type OtbEntryMethod = 'CHANGE_OVER_LAST_YEAR' | 'FIXED_MONTHLY_MIX';
