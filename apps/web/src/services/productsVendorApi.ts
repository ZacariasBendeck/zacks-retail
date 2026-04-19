/**
 * Products vendor API client — wraps /api/v1/vendors/* endpoints.
 */

import type { Vendor, VendorInput, VendorStoreAccount } from '../types/productsVendor'

export class VendorApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'VendorApiError'
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
    throw new VendorApiError(message, res.status, code)
  }
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

const BASE = '/api/v1/products/vendors'

export const vendorsApi = {
  list(q?: string, limit?: number): Promise<Vendor[]> {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (limit) params.set('limit', String(limit))
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return request<Vendor[]>(`${BASE}${suffix}`)
  },
  get(code: string): Promise<Vendor> {
    return request<Vendor>(`${BASE}/${encodeURIComponent(code)}`)
  },
  skuCount(code: string): Promise<number> {
    return request<number>(`${BASE}/${encodeURIComponent(code)}/sku-count`)
  },
  skuCountsAll(): Promise<Record<string, number>> {
    return request<Record<string, number>>(`${BASE}/sku-counts`)
  },
  create(input: VendorInput): Promise<Vendor> {
    return request<Vendor>(BASE, { method: 'POST', body: JSON.stringify(input) })
  },
  update(code: string, patch: Partial<Omit<VendorInput, 'code'>>): Promise<Vendor> {
    return request<Vendor>(`${BASE}/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(code: string): Promise<void> {
    return request<void>(`${BASE}/${encodeURIComponent(code)}`, { method: 'DELETE' })
  },
  listStoreAccounts(code: string): Promise<VendorStoreAccount[]> {
    return request<VendorStoreAccount[]>(`${BASE}/${encodeURIComponent(code)}/store-accounts`)
  },
  upsertStoreAccount(
    code: string,
    storeId: number,
    accountNo: string,
  ): Promise<VendorStoreAccount> {
    return request<VendorStoreAccount>(
      `${BASE}/${encodeURIComponent(code)}/store-accounts/${storeId}`,
      { method: 'PUT', body: JSON.stringify({ accountNo }) },
    )
  },
  deleteStoreAccount(code: string, storeId: number): Promise<void> {
    return request<void>(
      `${BASE}/${encodeURIComponent(code)}/store-accounts/${storeId}`,
      { method: 'DELETE' },
    )
  },
}
