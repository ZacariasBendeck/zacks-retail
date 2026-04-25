import type {
  CustomerKpiFilterOptions,
  CustomerKpiListEnvelope,
  CustomerKpiListParams,
  CustomerMetrics,
  CustomerMetricsSummary,
} from '../types/customerKpi'

export class CustomerKpiApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'CustomerKpiApiError'
    this.status = status
    this.code = code
  }
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  const code = typeof body?.error?.code === 'string' ? body.error.code : undefined
  const message = typeof body?.error?.message === 'string' ? body.error.message : fallback
  throw new CustomerKpiApiError(message, res.status, code)
}

export async function fetchCustomerMetricsSummary(): Promise<CustomerMetricsSummary> {
  const res = await fetch('/api/v1/customers/metrics/summary')
  if (!res.ok) await throwApiError(res, 'Failed to fetch customer KPI summary')
  return res.json()
}

export async function fetchCustomerKpiList(
  params: CustomerKpiListParams,
): Promise<CustomerKpiListEnvelope> {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    search.set(k, String(v))
  }
  const res = await fetch(`/api/v1/customers/metrics/list?${search}`)
  if (!res.ok) await throwApiError(res, 'Failed to fetch customer KPI list')
  return res.json()
}

export async function fetchCustomerKpiFilterOptions(): Promise<CustomerKpiFilterOptions> {
  const res = await fetch('/api/v1/customers/metrics/options')
  if (!res.ok) await throwApiError(res, 'Failed to fetch customer KPI filter options')
  return res.json()
}

export async function fetchCustomerMetrics(customerId: string): Promise<CustomerMetrics> {
  const res = await fetch(`/api/v1/customers/${customerId}/metrics`)
  if (!res.ok) await throwApiError(res, 'Failed to fetch customer metrics')
  return res.json()
}

export async function recomputeCustomerMetrics(customerId: string): Promise<CustomerMetrics> {
  const res = await fetch(`/api/v1/customers/${customerId}/recompute-metrics`, {
    method: 'POST',
  })
  if (!res.ok) await throwApiError(res, 'Failed to recompute customer metrics')
  return res.json()
}

export async function recomputeAllCustomerMetrics(batchSize = 1000): Promise<{
  processedCustomers: number
  failedCustomers: number
  durationMs: number
}> {
  const res = await fetch('/api/v1/customers/recompute-metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_size: batchSize }),
  })
  if (!res.ok) await throwApiError(res, 'Failed to recompute customer metrics')
  return res.json()
}
