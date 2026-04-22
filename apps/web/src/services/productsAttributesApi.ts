import type {
  AttributeCoverageRow,
  AttributeDimension,
  SetSkuAttributesInput,
  SkuAttributes,
} from '../types/productsAttributes'

export class AttributesApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'AttributesApiError'
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
    throw new AttributesApiError(message, res.status, code)
  }
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

const BASE = '/api/v1/products'

export const productsAttributesApi = {
  listDimensions(withCounts = false): Promise<AttributeDimension[]> {
    const q = withCounts ? '?withCounts=true' : ''
    return request<AttributeDimension[]>(`${BASE}/attributes/dimensions${q}`)
  },
  getForSku(code: string): Promise<SkuAttributes> {
    return request<SkuAttributes>(`${BASE}/skus/${encodeURIComponent(code)}/attributes`)
  },
  setForSku(code: string, input: SetSkuAttributesInput): Promise<SkuAttributes> {
    return request<SkuAttributes>(`${BASE}/skus/${encodeURIComponent(code)}/attributes`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  },
  coverage(): Promise<AttributeCoverageRow[]> {
    return request<AttributeCoverageRow[]>(`${BASE}/attributes/coverage`)
  },
}
