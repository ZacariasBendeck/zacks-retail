import type { Department, PaginationEnvelope } from './sku'

export interface OtbDepartmentSummary {
  department: Department
  budgetAmount: number
  actualAmount: number
  committedAmount: number
  openToBuyAmount: number
  variancePct: number
}

export interface OtbTrendPoint {
  weekLabel: string
  budgetAmount: number
  actualAmount: number
}

export interface OtbLine {
  id: string
  skuCode: string
  style: string
  department: Department
  category: number | null
  budgetUnits: number
  actualUnits: number
  onOrderUnits: number
  openToBuyUnits: number
}

export interface OtbSummaryResponse {
  summary: OtbDepartmentSummary[]
  trend: OtbTrendPoint[]
}

export interface OtbSummaryParams {
  year?: number
  month?: number
  department?: Department
}

export interface OtbLineParams {
  page?: number
  pageSize?: number
  year?: number
  month?: number
  department?: Department
  category?: number
  skuCode?: string
  style?: string
  sort?: string
  order?: 'asc' | 'desc'
}

export type OtbLineResponse = PaginationEnvelope<OtbLine>

export interface OtbBudget {
  id: string
  department: Department
  year: number
  month: number
  plannedBudget: number
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface OtbBudgetListParams {
  page?: number
  pageSize?: number
  sort?: 'department' | 'year' | 'month' | 'plannedBudget' | 'createdAt'
  order?: 'asc' | 'desc'
  department?: Department
  year?: number
  month?: number
}

export interface OtbMonthlyPlanRow {
  id: string
  otbBudgetId: string
  macroDepartment: Department
  year: number
  month: number
  planMonth: string
  skuId: string
  skuSizeId: string
  sizeLabel: string
  brandId: string | null
  style: string
  colorId: string | null
  categoryId: string | null
  budgetAmount: number
  committedAmount: number
  receivedAmount: number
  remainingToCommitAmount: number
  remainingToReceiveAmount: number
  budgetVsReceivedVarianceAmount: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface OtbMonthlyPlanParams {
  page?: number
  pageSize?: number
  sort?:
    | 'planMonth'
    | 'macroDepartment'
    | 'style'
    | 'sizeLabel'
    | 'budgetAmount'
    | 'committedAmount'
    | 'receivedAmount'
    | 'remainingToCommitAmount'
    | 'remainingToReceiveAmount'
    | 'budgetVsReceivedVarianceAmount'
    | 'updatedAt'
  order?: 'asc' | 'desc'
  year?: number
  month?: number
  department?: Department
  skuId?: string
  style?: string
}

export interface CreateOtbMonthlyPlanPayload {
  otbBudgetId: string
  skuId: string
  skuSizeId: string
  budgetAmount: number
  committedAmount?: number
  receivedAmount?: number
  notes?: string
}

export interface UpdateOtbMonthlyPlanPayload {
  budgetAmount?: number
  committedAmount?: number
  receivedAmount?: number
  notes?: string | null
}

export type OtbMonthlyPlanResponse = PaginationEnvelope<OtbMonthlyPlanRow>
