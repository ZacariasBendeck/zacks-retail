import type { Sku, SkuInput, SkuListFilters } from '../types/productsSku'

export class SkuApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'SkuApiError'
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
      /* ignore */
    }
    throw new SkuApiError(message, res.status, code)
  }
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

const BASE = '/api/v1/products/skus'

function buildParams(f?: SkuListFilters): string {
  if (!f) return ''
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.sku) p.set('sku', f.sku)
  if (f.vendor) p.set('vendor', f.vendor)
  if (f.category != null) p.set('category', String(f.category))
  if (f.season) p.set('season', f.season)
  if (f.group) p.set('group', f.group)
  if (f.keyword) p.set('keyword', f.keyword)
  // Multi-value filters — sent comma-separated; backend accepts either
  // comma-separated OR repeated-key shapes.
  if (f.vendors && f.vendors.length > 0) p.set('vendors', f.vendors.join(','))
  if (f.sectors && f.sectors.length > 0) p.set('sectors', f.sectors.join(','))
  if (f.departments && f.departments.length > 0) p.set('departments', f.departments.join(','))
  if (f.categories && f.categories.length > 0)
    p.set('categories', f.categories.join(','))
  if (f.seasons && f.seasons.length > 0) p.set('seasons', f.seasons.join(','))
  if (f.groups && f.groups.length > 0) p.set('groups', f.groups.join(','))
  if (f.keywords && f.keywords.length > 0) p.set('keywords', f.keywords.join(','))
  if (f.styleColor) p.set('styleColor', f.styleColor)
  if (f.description) p.set('description', f.description)
  if (f.attributes) {
    for (const [dim, vals] of Object.entries(f.attributes)) {
      if (vals && vals.length > 0) {
        p.set(`attr.${dim}`, vals.join(','))
      }
    }
  }
  if (f.limit != null) p.set('limit', String(f.limit))
  if (f.offset != null) p.set('offset', String(f.offset))
  return p.toString() ? `?${p.toString()}` : ''
}

export const productsSkuApi = {
  list(filter?: SkuListFilters): Promise<Sku[]> {
    return request<Sku[]>(`${BASE}${buildParams(filter)}`)
  },
  get(code: string): Promise<Sku> {
    return request<Sku>(`${BASE}/${encodeURIComponent(code)}`)
  },
  create(input: SkuInput): Promise<Sku> {
    return request<Sku>(BASE, { method: 'POST', body: JSON.stringify(input) })
  },
  update(code: string, patch: Partial<Omit<SkuInput, 'code'>>): Promise<Sku> {
    return request<Sku>(`${BASE}/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(code: string): Promise<void> {
    return request<void>(`${BASE}/${encodeURIComponent(code)}`, { method: 'DELETE' })
  },
  /**
   * Batch on-hand totals — one aggregate query across rics_mirror.inventory_quantities.
   * Returns a Record<sku, total>; SKUs with no inventory row are included with total=0.
   */
  onHandTotals(skuCodes: string[]): Promise<Record<string, number>> {
    return request<Record<string, number>>(`${BASE}/on-hand-totals`, {
      method: 'POST',
      body: JSON.stringify({ skus: skuCodes }),
    })
  },
}
