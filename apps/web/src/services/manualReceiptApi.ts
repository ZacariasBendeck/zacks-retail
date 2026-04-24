import type {
  CreateManualReceiptPayload,
  ManualReceiptContext,
  ManualReceiptContextQuery,
  ManualReceiptListEnvelope,
  ManualReceiptListParams,
  ManualReceiptRecord,
  ManualReceiptStoreOption,
} from '../types/manualReceipt'

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

export async function fetchManualReceiptStores(): Promise<ManualReceiptStoreOption[]> {
  const res = await fetch('/api/v1/inventory/manual-receipts/stores')
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch manual receipt stores: ${res.status}`)
  }
  return res.json()
}

export async function fetchManualReceiptContext(
  query: ManualReceiptContextQuery,
): Promise<ManualReceiptContext> {
  const searchParams = buildSearchParams({
    storeId: query.storeId,
    skuCode: query.skuCode,
    upc: query.upc,
  })
  const res = await fetch(`/api/v1/inventory/manual-receipts/context?${searchParams}`)
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch manual receipt context: ${res.status}`)
  }
  return res.json()
}

export async function fetchManualReceipts(
  params: ManualReceiptListParams,
): Promise<ManualReceiptListEnvelope> {
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
  const res = await fetch(`/api/v1/inventory/manual-receipts?${searchParams}`)
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch manual receipts: ${res.status}`)
  }
  return res.json()
}

export async function fetchManualReceipt(id: string): Promise<ManualReceiptRecord> {
  const res = await fetch(`/api/v1/inventory/manual-receipts/${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch manual receipt: ${res.status}`)
  }
  return res.json()
}

export async function createManualReceipt(
  payload: CreateManualReceiptPayload,
): Promise<ManualReceiptRecord> {
  const res = await fetch('/api/v1/inventory/manual-receipts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await parseApiError(res, `Failed to create manual receipt: ${res.status}`)
  }
  return res.json()
}
