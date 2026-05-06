import type { PaginationEnvelope } from './sku'

export type OtbDashboardPlanStatus = 'draft' | 'all'
export type OtbDashboardRowSort =
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
  | 'openToBuyUnits'

export interface OtbDashboardPlan {
  id: string
  label: string
  status: string
  planningScope: 'enterprise' | 'store_group'
  planningScopeLabel: string
  storeGroupCode: string
  storeGroupLabel: string | null
  season: string
  seasonYear: number
  seasonMonths: string[]
  selectedDepartments: number[]
  rowCount: number
  plannedBuyUnits: number
  createdAt: string
  updatedAt: string
}

export interface OtbDashboardTrendPoint {
  periodLabel: string
  plannedBuyUnits: number
  projectedSalesUnits: number
  committedUnits: number
  stockPositionUnits: number
  openToBuyUnits: number
  rowCount: number
}

export interface OtbDashboardSummary {
  planId: string
  year?: number
  month?: number
  departmentNumber?: number
  totals: {
    plannedBuyUnits: number
    projectedSalesUnits: number
    committedUnits: number
    stockPositionUnits: number
    openToBuyUnits: number
    rowCount: number
  }
  trend: OtbDashboardTrendPoint[]
  generatedAt: string
}

export interface OtbDashboardRow {
  id: string
  planId: string
  planLabel: string
  planningScope: 'enterprise' | 'store_group'
  planningScopeLabel: string
  storeGroupCode: string
  storeGroupLabel: string | null
  departmentKey: string
  departmentNumber: number | null
  departmentLabel: string
  yearMonth: string
  plannedBuyUnits: number
  projectedSalesUnits: number
  currentOnOrderUnits: number
  futureOnOrderUnits: number
  nativeOpenPoUnits: number
  committedUnits: number
  stockPositionUnits: number
  openToBuyUnits: number
}

export interface OtbDashboardPlansParams {
  status?: OtbDashboardPlanStatus
}

export interface OtbDashboardFilterParams {
  planId: string
  year?: number
  month?: number
  departmentNumber?: number
}

export interface OtbDashboardRowsParams extends OtbDashboardFilterParams {
  page?: number
  pageSize?: number
  sort?: OtbDashboardRowSort
  order?: 'asc' | 'desc'
}

export interface OtbDashboardPlansResponse {
  plans: OtbDashboardPlan[]
}

export type OtbDashboardRowsResponse = PaginationEnvelope<OtbDashboardRow>
