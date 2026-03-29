import type { PaginationEnvelope, Sku, SkuCreatePayload, SkuUpdatePayload, SkuListParams, Vendor, ImageAnalysisResult, EnhancedAnalysisResult, ReferenceDataMap } from '../types/sku'

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
  if (res.status === 409) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? 'Duplicate barcode')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Failed to create SKU: ${res.status}`)
  }
  return res.json()
}

export async function updateSku(skuId: string, payload: SkuUpdatePayload): Promise<Sku> {
  const res = await fetch(`/api/v1/skus/${skuId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 409) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? 'Duplicate barcode')
  }
  if (!res.ok) throw new Error(`Failed to update SKU: ${res.status}`)
  return res.json()
}

export async function fetchVendors(): Promise<Vendor[]> {
  const res = await fetch('/api/v1/vendors')
  if (!res.ok) throw new Error(`Failed to fetch vendors: ${res.status}`)
  const body = await res.json()
  return Array.isArray(body) ? body : body.data
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

  const data = await res.json()

  // Support both current (flat) and future (enhanced { raw, mapped }) response formats
  if (data.raw) {
    return data as EnhancedAnalysisResult
  }
  return { raw: data as ImageAnalysisResult }
}

export async function fetchAllReferenceData(): Promise<ReferenceDataMap> {
  const res = await fetch('/api/v1/skus/reference/all')
  if (!res.ok) throw new Error(`Failed to fetch reference data: ${res.status}`)
  return res.json()
}

export async function searchSkus(query: string): Promise<Sku[]> {
  if (!query.trim()) return []
  const params = new URLSearchParams({ q: query.trim(), pageSize: '50', sort: 'skuCode', order: 'asc' })
  const res = await fetch(`/api/v1/skus?${params}`)
  if (!res.ok) return []
  const body: PaginationEnvelope<Sku> = await res.json()
  return body.data
}

export async function lookupSkuByCode(code: string): Promise<Sku | null> {
  const res = await fetch(`/api/v1/skus/lookup?code=${encodeURIComponent(code)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Lookup failed: ${res.status}`)
  return res.json()
}
