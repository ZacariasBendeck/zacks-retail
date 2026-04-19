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
  if (f.vendor) p.set('vendor', f.vendor)
  if (f.category != null) p.set('category', String(f.category))
  if (f.season) p.set('season', f.season)
  if (f.group) p.set('group', f.group)
  if (f.keyword) p.set('keyword', f.keyword)
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
}
