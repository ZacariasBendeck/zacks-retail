import type {
  OtbDashboardFilterParams,
  OtbDashboardPlansParams,
  OtbDashboardPlansResponse,
  OtbDashboardRowsParams,
  OtbDashboardRowsResponse,
  OtbDashboardSummary,
} from '../types/otbDashboard'

interface OtbDashboardApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

export class OtbDashboardApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'OtbDashboardApiError'
    this.status = status
    this.code = code
  }
}

async function throwOtbDashboardApiError(res: Response, fallbackMessage: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as OtbDashboardApiErrorBody
  const code = typeof body?.error?.code === 'string' ? body.error.code : undefined
  const message = typeof body?.error?.message === 'string' ? body.error.message : fallbackMessage
  throw new OtbDashboardApiError(message, res.status, code)
}

function appendDashboardFilters(searchParams: URLSearchParams, params: OtbDashboardFilterParams) {
  searchParams.set('planId', params.planId)
  if (params.year != null) searchParams.set('year', String(params.year))
  if (params.month != null) searchParams.set('month', String(params.month))
  if (params.departmentNumber != null) searchParams.set('departmentNumber', String(params.departmentNumber))
}

export async function fetchOtbDashboardPlans(
  params: OtbDashboardPlansParams = {},
): Promise<OtbDashboardPlansResponse> {
  const searchParams = new URLSearchParams()
  if (params.status) searchParams.set('status', params.status)
  const query = searchParams.toString()
  const res = await fetch(`/api/v1/otb/dashboard/plans${query ? `?${query}` : ''}`)
  if (!res.ok) {
    await throwOtbDashboardApiError(res, `Failed to fetch saved OTB plans: ${res.status}`)
  }
  return res.json()
}

export async function fetchOtbDashboardSummary(
  params: OtbDashboardFilterParams,
): Promise<OtbDashboardSummary> {
  const searchParams = new URLSearchParams()
  appendDashboardFilters(searchParams, params)
  const res = await fetch(`/api/v1/otb/dashboard/summary?${searchParams}`)
  if (!res.ok) {
    await throwOtbDashboardApiError(res, `Failed to fetch saved OTB summary: ${res.status}`)
  }
  return res.json()
}

export async function fetchOtbDashboardRows(
  params: OtbDashboardRowsParams,
): Promise<OtbDashboardRowsResponse> {
  const searchParams = new URLSearchParams()
  appendDashboardFilters(searchParams, params)
  if (params.page != null) searchParams.set('page', String(params.page))
  if (params.pageSize != null) searchParams.set('pageSize', String(params.pageSize))
  if (params.sort) searchParams.set('sort', params.sort)
  if (params.order) searchParams.set('order', params.order)
  const res = await fetch(`/api/v1/otb/dashboard/rows?${searchParams}`)
  if (!res.ok) {
    await throwOtbDashboardApiError(res, `Failed to fetch saved OTB rows: ${res.status}`)
  }
  return res.json()
}
