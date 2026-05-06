export type InventoryCloseRunStatus = 'RUNNING' | 'DRY_RUN' | 'SUCCEEDED' | 'FAILED'
export type InventoryCloseValidationStatus = 'PASSED' | 'FAILED' | null

export interface InventoryMonthCloseValidationSummary {
  unpromotedPosTickets: number
  salesCellMismatchCount: number
  salesCellMismatchQtyAbs: number
}

export interface InventoryWeekCloseValidationSummary {
  unpromotedPosTickets: number
  weekSalesMismatchCount: number
  weekSalesMismatchQtyAbs: number
}

export interface InventoryMonthCloseResult {
  runId: string
  closeMonth: string
  targetSlot: number
  snapshotAsOf: string
  companyTimeZone: string
  dryRun: boolean
  status: 'DRY_RUN' | 'SUCCEEDED'
  snapshotsScanned: number
  monthsUpserted: number
  snapshotsUpdated: number
  nonzeroMtdCellsBefore: number
  salesCellsReset: number
  totalQtySales: number
  totalNetSales: number
  totalProfit: number
  inventoryValueTotal: number
  validation: InventoryMonthCloseValidationSummary
}

export interface InventoryWeekCloseResult {
  runId: string
  weekEndingDate: string
  weekStartDate: string
  snapshotAsOf: string
  companyTimeZone: string
  dryRun: boolean
  status: 'DRY_RUN' | 'SUCCEEDED'
  snapshotsScanned: number
  trendRowsWritten: number
  snapshotsUpdated: number
  totalWeekQtySales: number
  totalWeekNetSales: number
  totalWeekProfit: number
  validation: InventoryWeekCloseValidationSummary
}

export interface InventoryMonthCloseRun {
  id: string
  yearMonth: string
  targetSlot: number
  snapshotAsOf: string | null
  closedBy: string
  dryRun: boolean
  status: InventoryCloseRunStatus
  validationStatus: InventoryCloseValidationStatus
  snapshotsScanned: number
  monthsUpserted: number
  snapshotsUpdated: number
  nonzeroMtdCellsBefore: number
  salesCellsReset: number
  unpromotedPosTickets: number
  salesCellMismatchCount: number
  salesCellMismatchQtyAbs: number
  totalQtySales: number
  totalNetSales: number
  totalProfit: number
  inventoryValueTotal: number
  errorText: string | null
  startedAt: string | null
  finishedAt: string | null
}

export interface InventoryClosedMonth {
  yearMonth: string
  runId: string
  targetSlot: number
  snapshotAsOf: string | null
  closedBy: string
  closedAt: string | null
  snapshotsClosed: number
  monthRowsClosed: number
  salesCellsReset: number
  totalQtySales: number
  totalNetSales: number
  totalProfit: number
  inventoryValueTotal: number
}

export interface InventoryWeekCloseRun {
  id: string
  weekEndingDate: string | null
  weekStartDate: string | null
  snapshotAsOf: string | null
  closedBy: string
  dryRun: boolean
  status: InventoryCloseRunStatus
  validationStatus: InventoryCloseValidationStatus
  snapshotsScanned: number
  trendRowsWritten: number
  snapshotsUpdated: number
  unpromotedPosTickets: number
  weekSalesMismatchCount: number
  weekSalesMismatchQtyAbs: number
  totalWeekQtySales: number
  totalWeekNetSales: number
  totalWeekProfit: number
  errorText: string | null
  startedAt: string | null
  finishedAt: string | null
}

export interface InventoryClosedWeek {
  weekEndingDate: string | null
  runId: string
  weekStartDate: string | null
  snapshotAsOf: string | null
  closedBy: string
  closedAt: string | null
  snapshotsClosed: number
  trendRowsClosed: number
  totalWeekQtySales: number
  totalWeekNetSales: number
  totalWeekProfit: number
}

export interface InventoryCloseSummary {
  monthRuns: InventoryMonthCloseRun[]
  closedMonths: InventoryClosedMonth[]
  weekRuns: InventoryWeekCloseRun[]
  closedWeeks: InventoryClosedWeek[]
}

export class InventoryCloseApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'InventoryCloseApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    let code: string | undefined
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      code = body?.error?.code
      if (body?.error?.message) message = body.error.message
    } catch {
      // Keep the generic status message if the response was not JSON.
    }
    throw new InventoryCloseApiError(message, res.status, code)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const inventoryCloseApi = {
  getSummary: (limit = 20) =>
    request<InventoryCloseSummary>(`/api/v1/operations/inventory-close/summary?limit=${limit}`),

  runMonthClose: (args: { closeMonth: string; dryRun: boolean }) =>
    request<InventoryMonthCloseResult>('/api/v1/operations/inventory-close/month', {
      method: 'POST',
      body: JSON.stringify(args),
    }),

  runWeekClose: (args: { weekEndingDate: string; dryRun: boolean }) =>
    request<InventoryWeekCloseResult>('/api/v1/operations/inventory-close/week', {
      method: 'POST',
      body: JSON.stringify(args),
    }),
}
