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

export async function analyzeImage(args: { file: File; family: string }): Promise<EnhancedAnalysisResult> {
  const formData = new FormData()
  formData.append('image', args.file)
  formData.append('family', args.family)

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

// ── SKU Lookup modal search ──────────────────────────────────────────────────

export type SkuLookupSort = 'SKU' | 'DESCRIPTION' | 'VENDOR' | 'STYLE_COLOR'

export interface SkuLookupRow {
  skuId: string
  skuCode: string
  description: string
  vendor: string
  category: string
  styleColor: string | null
  currentPrice: number | null
  /** `/rics-images/<filename>` URL for the SKU's picture, or null. */
  pictureUrl: string | null
}

export interface SkuLookupResult {
  rows: SkuLookupRow[]
  total: number
}

export interface SkuLookupQuery {
  q?: string
  descContains?: string
  wholeWord?: boolean
  /** Which column the `q` prefix matches against. Default: SKU. */
  searchField?: SkuLookupSort
  limit?: number
  offset?: number
  /** Filter to rows whose Season code matches exactly. */
  season?: string
  /** Filter to rows whose Vendor code matches exactly. */
  vendor?: string
  /** Filter to rows whose Category falls inside the Department's range. */
  department?: number
}

export async function searchSkusForLookup(query: SkuLookupQuery): Promise<SkuLookupResult> {
  const params = new URLSearchParams()
  if (query.q !== undefined) params.set('q', query.q)
  if (query.descContains) params.set('descContains', query.descContains)
  if (query.wholeWord) params.set('wholeWord', 'true')
  if (query.searchField) params.set('searchField', query.searchField)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.offset) params.set('offset', String(query.offset))
  if (query.season) params.set('season', query.season)
  if (query.vendor) params.set('vendor', query.vendor)
  if (query.department != null) params.set('department', String(query.department))

  const response = await fetch(`/api/v1/skus/search?${params.toString()}`)
  if (!response.ok) throw new SkuApiError(`SKU search failed: ${response.status}`, response.status)
  return response.json()
}

export interface SkuLookupFacets {
  seasons: string[]
  vendors: Array<{ code: string; label: string }>
  departments: Array<{ number: number; name: string }>
}

export async function fetchSkuLookupFacets(): Promise<SkuLookupFacets> {
  const response = await fetch('/api/v1/skus/lookup-facets')
  if (!response.ok) throw new SkuApiError(`Facet fetch failed: ${response.status}`, response.status)
  return response.json()
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
