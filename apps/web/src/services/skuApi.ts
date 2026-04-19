import type {
  PaginationEnvelope,
  Sku,
  SkuCreatePayload,
  SkuUpdatePayload,
  SkuListParams,
  Vendor,
  EnhancedAnalysisResult,
  ReferenceDataMap,
  SizeLabelItem,
  StyleColorLink,
  StyleColorListParams,
} from '../types/sku'

export class SkuApiError extends Error {
  status: number
  code?: string
  details?: Record<string, string>[]

  constructor(message: string, status: number, code?: string, details?: Record<string, string>[]) {
    super(message)
    this.name = 'SkuApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function throwSkuApiError(res: Response, fallbackMessage: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  const code = typeof body?.error?.code === 'string' ? body.error.code : undefined
  const message = typeof body?.error?.message === 'string' ? body.error.message : fallbackMessage
  const details = Array.isArray(body?.error?.details) ? body.error.details as Record<string, string>[] : undefined
  throw new SkuApiError(message, res.status, code, details)
}

export async function fetchSkus(params: SkuListParams): Promise<PaginationEnvelope<Sku>> {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') searchParams.set(key, String(value))
  }
  const res = await fetch(`/api/v1/skus?${searchParams}`)
  if (!res.ok) throw new Error(`Failed to fetch SKUs: ${res.status}`)
  return res.json()
}

export async function fetchSku(skuId: string): Promise<Sku> {
  const res = await fetch(`/api/v1/skus/${skuId}`)
  if (!res.ok) throw new Error(`Failed to fetch SKU: ${res.status}`)
  return res.json()
}

export async function createSku(payload: SkuCreatePayload): Promise<Sku> {
  const res = await fetch('/api/v1/skus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await throwSkuApiError(res, `Failed to create SKU: ${res.status}`)
  }
  return res.json()
}

export async function updateSku(skuId: string, payload: SkuUpdatePayload): Promise<Sku> {
  const res = await fetch(`/api/v1/skus/${skuId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwSkuApiError(res, `Failed to update SKU: ${res.status}`)
  return res.json()
}

export async function fetchVendors(): Promise<Vendor[]> {
  const params = new URLSearchParams({
    page: '1',
    pageSize: '200',
    sort: 'name',
    order: 'asc',
  })
  const res = await fetch(`/api/v1/vendors?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch vendors: ${res.status}`)
  const body: PaginationEnvelope<Vendor> = await res.json()
  return body.data
}

export async function deactivateSku(skuId: string): Promise<void> {
  const res = await fetch(`/api/v1/skus/${skuId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to deactivate SKU: ${res.status}`)
}

export async function analyzeImage(file: File): Promise<EnhancedAnalysisResult> {
  const formData = new FormData()
  formData.append('image', file)

  const res = await fetch('/api/v1/skus/analyze-image', {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? `Image analysis failed: ${res.status}`)
  }

  return res.json()
}

export async function fetchAllReferenceData(): Promise<ReferenceDataMap> {
  const res = await fetch('/api/v1/skus/reference/all')
  if (!res.ok) throw new Error(`Failed to fetch reference data: ${res.status}`)
  return res.json()
}

export async function searchSkus(query: string): Promise<Sku[]> {
  if (!query.trim()) return []
  const params = new URLSearchParams({ q: query.trim(), pageSize: '50', sort: 'style', order: 'asc' })
  const res = await fetch(`/api/v1/skus?${params}`)
  if (!res.ok) return []
  const body: PaginationEnvelope<Sku> = await res.json()
  return body.data
}

export interface SkuAutocompleteItem {
  skuCode: string
  style: string
  brandName: string
}

export async function autocompleteSkus(query: string): Promise<SkuAutocompleteItem[]> {
  if (!query.trim()) return []
  const res = await fetch(`/api/v1/skus/autocomplete?q=${encodeURIComponent(query.trim())}`)
  if (!res.ok) return []
  return res.json()
}

export async function lookupSkuByCode(code: string): Promise<Sku | null> {
  const res = await fetch(`/api/v1/skus/lookup?code=${encodeURIComponent(code)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Lookup failed: ${res.status}`)
  return res.json()
}

export async function fetchSizeLabels(sizeTypeId: number): Promise<SizeLabelItem[]> {
  const res = await fetch(`/api/v1/skus/size-types/${sizeTypeId}/sizes`)
  if (!res.ok) throw new Error(`Failed to fetch size labels: ${res.status}`)
  return res.json()
}

export async function fetchStyleColors(params: StyleColorListParams = {}): Promise<StyleColorLink[]> {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') searchParams.set(key, String(value))
  }
  const query = searchParams.toString()
  const res = await fetch(`/api/v1/skus/style-colors${query ? `?${query}` : ''}`)
  if (!res.ok) throw new Error(`Failed to fetch style colors: ${res.status}`)
  return res.json()
}
