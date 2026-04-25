import type {
  CreateManualReturnPayload,
  ManualReturnContext,
  ManualReturnContextQuery,
  ManualReturnListEnvelope,
  ManualReturnListParams,
  ManualReturnRecord,
  ManualReturnStoreOption,
} from '../types/manualReturn'

function buildSearchParams(params: Record<string, string | number | undefined>): URLSearchParams {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue
    searchParams.set(key, String(value))
  }
  return searchParams
}

async function parseApiError(response: Response, fallback: string): Promise<Error> {
  const err = await response.json().catch(() => ({}))
  return new Error(err?.error?.message ?? err?.message ?? fallback)
}

export async function fetchManualReturnStores(): Promise<ManualReturnStoreOption[]> {
  const res = await fetch('/api/v1/inventory/manual-returns/stores')
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch manual return stores: ${res.status}`)
  }
  return res.json()
}

export async function fetchManualReturnContext(
  query: ManualReturnContextQuery,
): Promise<ManualReturnContext> {
  const searchParams = buildSearchParams({
    storeId: query.storeId,
    skuCode: query.skuCode,
    upc: query.upc,
  })
  const res = await fetch(`/api/v1/inventory/manual-returns/context?${searchParams}`)
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch manual return context: ${res.status}`)
  }
  return res.json()
}

export async function fetchManualReturns(
  params: ManualReturnListParams,
): Promise<ManualReturnListEnvelope> {
  const searchParams = buildSearchParams({
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
    sort: params.sort ?? 'movementAt',
    order: params.order ?? 'desc',
    storeId: params.storeId,
    skuId: params.skuId,
    fromDate: params.fromDate,
    toDate: params.toDate,
  })
  const res = await fetch(`/api/v1/inventory/manual-returns?${searchParams}`)
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch manual returns: ${res.status}`)
  }
  return res.json()
}

export async function fetchManualReturn(id: string): Promise<ManualReturnRecord> {
  const res = await fetch(`/api/v1/inventory/manual-returns/${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch manual return: ${res.status}`)
  }
  return res.json()
}

export async function createManualReturn(
  payload: CreateManualReturnPayload,
): Promise<ManualReturnRecord> {
  const res = await fetch('/api/v1/inventory/manual-returns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await parseApiError(res, `Failed to create manual return: ${res.status}`)
  }
  return res.json()
}
