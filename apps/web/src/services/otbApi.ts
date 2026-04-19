import { MOCK_SKUS } from '../mock/skuData'
import { ALLOWED_DEPARTMENTS } from '../constants/domain'
import type { Department, PaginationEnvelope } from '../types/sku'
import { appendDomainFilterContract, appendServerTableContract } from './domainFilterContract'
import type {
  CreateOtbMonthlyPlanPayload,
  OtbBudget,
  OtbBudgetListParams,
  OtbDepartmentSummary,
  OtbLine,
  OtbLineParams,
  OtbLineResponse,
  OtbMonthlyPlanParams,
  OtbMonthlyPlanResponse,
  OtbSummaryParams,
  OtbSummaryResponse,
  OtbTrendPoint,
  UpdateOtbMonthlyPlanPayload,
  OtbMonthlyPlanRow,
} from '../types/otb'

// OTB summary is available server-side via canonical read model.
const USE_MOCK_SUMMARY = import.meta.env.VITE_USE_MOCK_OTB_SUMMARY === 'true'
// OTB line endpoint is available; use live API by default and allow explicit mock opt-in.
const USE_MOCK_LINES = import.meta.env.VITE_USE_MOCK_OTB_LINES === 'true'

interface OtbSummaryRowApi {
  department: Department
  year: number
  month: number
  plannedBudget: number
  committedAmount: number
  receivedAmount: number
  remainingOtb: number
  utilizationPercent: number
  budgetExceeded: boolean
}

interface OtbApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

export class OtbApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'OtbApiError'
    this.status = status
    this.code = code
  }
}

async function throwOtbApiError(res: Response, fallbackMessage: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as OtbApiErrorBody
  const code = typeof body?.error?.code === 'string' ? body.error.code : undefined
  const message = typeof body?.error?.message === 'string' ? body.error.message : fallbackMessage
  throw new OtbApiError(message, res.status, code)
}

function createDepartmentSummary(): OtbDepartmentSummary[] {
  return ALLOWED_DEPARTMENTS.map((department) => {
    const skus = MOCK_SKUS.filter((sku) => sku.department === department)
    const budgetAmount = skus.reduce((sum, sku) => sum + sku.price * (8 + Math.floor(Math.random() * 10)), 0)
    const actualAmount = budgetAmount * (0.65 + Math.random() * 0.45)
    const committedAmount = budgetAmount * (0.1 + Math.random() * 0.2)
    const openToBuyAmount = budgetAmount - actualAmount - committedAmount
    const variancePct = budgetAmount === 0 ? 0 : ((actualAmount - budgetAmount) / budgetAmount) * 100
    return {
      department,
      budgetAmount: Math.round(budgetAmount * 100) / 100,
      actualAmount: Math.round(actualAmount * 100) / 100,
      committedAmount: Math.round(committedAmount * 100) / 100,
      openToBuyAmount: Math.round(openToBuyAmount * 100) / 100,
      variancePct: Math.round(variancePct * 100) / 100,
    }
  })
}

function createTrend(): OtbTrendPoint[] {
  const points: OtbTrendPoint[] = []
  for (let week = 1; week <= 12; week += 1) {
    const budgetAmount = 24000 + week * 1400
    const actualAmount = budgetAmount * (0.75 + Math.random() * 0.45)
    points.push({
      weekLabel: `W${week}`,
      budgetAmount: Math.round(budgetAmount),
      actualAmount: Math.round(actualAmount),
    })
  }
  return points
}

function createOtbLines(count: number): OtbLine[] {
  const lines: OtbLine[] = []
  for (let index = 0; index < count; index += 1) {
    const sku = MOCK_SKUS[index % MOCK_SKUS.length]
    if (!sku) continue
    const budgetUnits = 25 + Math.floor(Math.random() * 60)
    const actualUnits = Math.floor(budgetUnits * (0.55 + Math.random() * 0.55))
    const onOrderUnits = Math.floor(Math.random() * 20)
    lines.push({
      id: `${sku.id}-otb-${index}`,
      skuCode: sku.skuCode,
      style: sku.style,
      department: sku.department,
      category: sku.categoryId ?? 556,
      budgetUnits,
      actualUnits,
      onOrderUnits,
      openToBuyUnits: budgetUnits - actualUnits - onOrderUnits,
    })
  }
  return lines
}

const MOCK_SUMMARY = createDepartmentSummary()
const MOCK_TREND = createTrend()
const MOCK_LINES = createOtbLines(2400)

function compareOtbLines(left: OtbLine, right: OtbLine, sortField: string, direction: 'asc' | 'desc') {
  const multiplier = direction === 'asc' ? 1 : -1
  const a = (left as unknown as Record<string, unknown>)[sortField]
  const b = (right as unknown as Record<string, unknown>)[sortField]

  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * multiplier
  }
  return String(a ?? '').localeCompare(String(b ?? '')) * multiplier
}

export async function fetchOtbSummary(params: OtbSummaryParams = {}): Promise<OtbSummaryResponse> {
  if (USE_MOCK_SUMMARY) {
    await new Promise((resolve) => setTimeout(resolve, 160))
    return {
      summary: MOCK_SUMMARY,
      trend: MOCK_TREND,
    }
  }

  const year = params.year ?? new Date().getFullYear()
  const searchParams = new URLSearchParams({ year: String(year) })
  if (params.month != null) searchParams.set('month', String(params.month))
  appendDomainFilterContract(searchParams, { department: params.department })

  const res = await fetch(`/api/v1/otb-budgets/summary?${searchParams}`)
  if (!res.ok) {
    await throwOtbApiError(res, `Failed to fetch OTB summary: ${res.status}`)
  }

  const rows = await res.json() as OtbSummaryRowApi[]
  if (!Array.isArray(rows) || rows.length === 0) {
    return { summary: [], trend: [] }
  }

  const latestMonth = rows.reduce((max, row) => Math.max(max, row.month), 1)
  const latestRows = rows.filter((row) => row.month === latestMonth)

  const summary: OtbDepartmentSummary[] = ALLOWED_DEPARTMENTS.map((department) => {
    const row = latestRows.find((entry) => entry.department === department)
    const budgetAmount = row?.plannedBudget ?? 0
    const actualAmount = row?.receivedAmount ?? 0
    const committedAmount = row?.committedAmount ?? 0
    const openToBuyAmount = row?.remainingOtb ?? 0
    const variancePct = budgetAmount === 0 ? 0 : ((actualAmount - budgetAmount) / budgetAmount) * 100

    return {
      department,
      budgetAmount: Math.round(budgetAmount * 100) / 100,
      actualAmount: Math.round(actualAmount * 100) / 100,
      committedAmount: Math.round(committedAmount * 100) / 100,
      openToBuyAmount: Math.round(openToBuyAmount * 100) / 100,
      variancePct: Math.round(variancePct * 100) / 100,
    }
  })

  const monthMap = new Map<number, { budgetAmount: number; actualAmount: number }>()
  for (const row of rows) {
    const existing = monthMap.get(row.month) ?? { budgetAmount: 0, actualAmount: 0 }
    existing.budgetAmount += row.plannedBudget
    existing.actualAmount += row.receivedAmount
    monthMap.set(row.month, existing)
  }

  const trend: OtbTrendPoint[] = [...monthMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([month, amounts]) => ({
      weekLabel: `M${String(month).padStart(2, '0')}`,
      budgetAmount: Math.round(amounts.budgetAmount * 100) / 100,
      actualAmount: Math.round(amounts.actualAmount * 100) / 100,
    }))

  return { summary, trend }
}

export async function fetchOtbLines(params: OtbLineParams): Promise<OtbLineResponse> {
  if (USE_MOCK_LINES) {
    await new Promise((resolve) => setTimeout(resolve, 160))
    let lines = [...MOCK_LINES]

    if (params.department) {
      lines = lines.filter((line) => line.department === params.department)
    }
    if (params.category != null) {
      lines = lines.filter((line) => line.category === params.category)
    }
    if (params.skuCode) {
      const skuNeedle = params.skuCode.toLowerCase()
      lines = lines.filter((line) => line.skuCode.toLowerCase().includes(skuNeedle))
    }
    if (params.style) {
      const styleNeedle = params.style.toLowerCase()
      lines = lines.filter((line) => line.style.toLowerCase().includes(styleNeedle))
    }
    const sort = params.sort ?? 'openToBuyUnits'
    const order = params.order ?? 'asc'
    lines.sort((a, b) => compareOtbLines(a, b, sort, order))

    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 50
    const totalItems = lines.length
    const start = (page - 1) * pageSize

    return {
      data: lines.slice(start, start + pageSize),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(Math.ceil(totalItems / pageSize), 1),
      },
    }
  }

  const searchParams = new URLSearchParams()
  appendServerTableContract(searchParams, {
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    order: params.order,
  })
  if (params.year != null) searchParams.set('year', String(params.year))
  if (params.month != null) searchParams.set('month', String(params.month))
  appendDomainFilterContract(searchParams, {
    department: params.department,
    category: params.category,
  })
  if (params.skuCode) searchParams.set('skuCode', params.skuCode)
  if (params.style) searchParams.set('style', params.style)
  const res = await fetch(`/api/v1/otb/lines?${searchParams}`)
  if (!res.ok) {
    await throwOtbApiError(res, `Failed to fetch OTB lines: ${res.status}`)
  }
  return res.json()
}

export async function fetchOtbBudgets(
  params: OtbBudgetListParams,
): Promise<PaginationEnvelope<OtbBudget>> {
  const searchParams = new URLSearchParams()
  appendServerTableContract(searchParams, {
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    order: params.order,
  })
  appendDomainFilterContract(searchParams, { department: params.department })
  if (params.year != null) searchParams.set('year', String(params.year))
  if (params.month != null) searchParams.set('month', String(params.month))
  const res = await fetch(`/api/v1/otb-budgets?${searchParams}`)
  if (!res.ok) {
    await throwOtbApiError(res, `Failed to fetch OTB budgets: ${res.status}`)
  }
  return res.json()
}

export async function fetchOtbMonthlyPlans(
  params: OtbMonthlyPlanParams,
): Promise<OtbMonthlyPlanResponse> {
  const searchParams = new URLSearchParams()
  appendServerTableContract(searchParams, {
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    order: params.order,
  })
  appendDomainFilterContract(searchParams, { department: params.department })
  if (params.year != null) searchParams.set('year', String(params.year))
  if (params.month != null) searchParams.set('month', String(params.month))
  if (params.skuId) searchParams.set('skuId', params.skuId)
  if (params.style) searchParams.set('style', params.style)
  const res = await fetch(`/api/v1/otb/monthly-plans?${searchParams}`)
  if (!res.ok) {
    await throwOtbApiError(res, `Failed to fetch OTB monthly plans: ${res.status}`)
  }
  return res.json()
}

export async function createOtbMonthlyPlan(
  payload: CreateOtbMonthlyPlanPayload,
): Promise<OtbMonthlyPlanRow> {
  const res = await fetch('/api/v1/otb/monthly-plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await throwOtbApiError(res, `Failed to create OTB monthly plan: ${res.status}`)
  }
  return res.json()
}

export async function updateOtbMonthlyPlan(
  planId: string,
  payload: UpdateOtbMonthlyPlanPayload,
): Promise<OtbMonthlyPlanRow> {
  const res = await fetch(`/api/v1/otb/monthly-plans/${planId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await throwOtbApiError(res, `Failed to update OTB monthly plan: ${res.status}`)
  }
  return res.json()
}

export async function deleteOtbMonthlyPlan(planId: string): Promise<void> {
  const res = await fetch(`/api/v1/otb/monthly-plans/${planId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    await throwOtbApiError(res, `Failed to delete OTB monthly plan: ${res.status}`)
  }
}
