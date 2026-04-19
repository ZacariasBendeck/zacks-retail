/**
 * Products taxonomy API client — wraps /api/v1/taxonomy/* endpoints.
 * The backend returns the repository's domain types directly; errors come
 * back as `{ error: { code, message } }` with HTTP status encoding the kind
 * (404/409/422/503).
 */

import type {
  Category,
  CategoryInput,
  Department,
  DepartmentInput,
  Group,
  GroupInput,
  Keyword,
  KeywordInput,
  NrfCodeCell,
  PromotionCode,
  PromotionCodeInput,
  ReturnCode,
  ReturnCodeInput,
  Season,
  SeasonInput,
  Sector,
  SectorInput,
  SizeType,
  SizeTypeInput,
} from '../types/productsTaxonomy'

export class TaxonomyApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'TaxonomyApiError'
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
      // ignore parse failure; use fallback message
    }
    throw new TaxonomyApiError(message, res.status, code)
  }
  if (res.status === 204) {
    return undefined as unknown as T
  }
  return res.json() as Promise<T>
}

const BASE = '/api/v1/taxonomy'

// Resolve Category → Department → Sector
export interface TaxonomyResolution {
  category: number
  department: Department | null
  sector: Sector | null
}

export const resolveApi = {
  forCategory: (n: number) =>
    request<TaxonomyResolution>(`${BASE}/resolve?category=${encodeURIComponent(String(n))}`),
}

// Departments
export const departmentsApi = {
  list: () => request<Department[]>(`${BASE}/departments`),
  get: (n: number) => request<Department>(`${BASE}/departments/${n}`),
  create: (input: DepartmentInput) =>
    request<Department>(`${BASE}/departments`, { method: 'POST', body: JSON.stringify(input) }),
  update: (n: number, patch: Partial<Omit<DepartmentInput, 'number'>>) =>
    request<Department>(`${BASE}/departments/${n}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (n: number) => request<void>(`${BASE}/departments/${n}`, { method: 'DELETE' }),
}

// Categories
export const categoriesApi = {
  list: () => request<Category[]>(`${BASE}/categories`),
  get: (n: number) => request<Category>(`${BASE}/categories/${n}`),
  create: (input: CategoryInput) =>
    request<Category>(`${BASE}/categories`, { method: 'POST', body: JSON.stringify(input) }),
  update: (n: number, patch: Partial<Omit<CategoryInput, 'number'>>) =>
    request<Category>(`${BASE}/categories/${n}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (n: number) => request<void>(`${BASE}/categories/${n}`, { method: 'DELETE' }),
}

// Groups
export const groupsApi = {
  list: () => request<Group[]>(`${BASE}/groups`),
  get: (code: string) => request<Group>(`${BASE}/groups/${encodeURIComponent(code)}`),
  create: (input: GroupInput) =>
    request<Group>(`${BASE}/groups`, { method: 'POST', body: JSON.stringify(input) }),
  update: (code: string, patch: Partial<Omit<GroupInput, 'code'>>) =>
    request<Group>(`${BASE}/groups/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  remove: (code: string) =>
    request<void>(`${BASE}/groups/${encodeURIComponent(code)}`, { method: 'DELETE' }),
}

// Keywords
export const keywordsApi = {
  list: () => request<Keyword[]>(`${BASE}/keywords`),
  get: (keyword: string) => request<Keyword>(`${BASE}/keywords/${encodeURIComponent(keyword)}`),
  create: (input: KeywordInput) =>
    request<Keyword>(`${BASE}/keywords`, { method: 'POST', body: JSON.stringify(input) }),
  update: (keyword: string, patch: Partial<Omit<KeywordInput, 'keyword'>>) =>
    request<Keyword>(`${BASE}/keywords/${encodeURIComponent(keyword)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  remove: (keyword: string) =>
    request<void>(`${BASE}/keywords/${encodeURIComponent(keyword)}`, { method: 'DELETE' }),
}

// Sectors
export const sectorsApi = {
  list: () => request<Sector[]>(`${BASE}/sectors`),
  get: (n: number) => request<Sector>(`${BASE}/sectors/${n}`),
  create: (input: SectorInput) =>
    request<Sector>(`${BASE}/sectors`, { method: 'POST', body: JSON.stringify(input) }),
  update: (n: number, patch: Partial<Omit<SectorInput, 'number'>>) =>
    request<Sector>(`${BASE}/sectors/${n}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (n: number) => request<void>(`${BASE}/sectors/${n}`, { method: 'DELETE' }),
}

// Seasons (read-only in Phase 1; create/update/delete will 503)
export const seasonsApi = {
  list: () => request<Season[]>(`${BASE}/seasons`),
  get: (code: string) => request<Season>(`${BASE}/seasons/${encodeURIComponent(code)}`),
  create: (input: SeasonInput) =>
    request<Season>(`${BASE}/seasons`, { method: 'POST', body: JSON.stringify(input) }),
  update: (code: string, patch: Partial<Omit<SeasonInput, 'code'>>) =>
    request<Season>(`${BASE}/seasons/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  remove: (code: string) =>
    request<void>(`${BASE}/seasons/${encodeURIComponent(code)}`, { method: 'DELETE' }),
}

// Return codes
export const returnCodesApi = {
  list: () => request<ReturnCode[]>(`${BASE}/return-codes`),
  get: (n: number) => request<ReturnCode>(`${BASE}/return-codes/${n}`),
  create: (input: ReturnCodeInput) =>
    request<ReturnCode>(`${BASE}/return-codes`, { method: 'POST', body: JSON.stringify(input) }),
  update: (n: number, patch: Partial<Omit<ReturnCodeInput, 'code'>>) =>
    request<ReturnCode>(`${BASE}/return-codes/${n}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  remove: (n: number) => request<void>(`${BASE}/return-codes/${n}`, { method: 'DELETE' }),
}

// Promotion codes
export const promotionCodesApi = {
  list: () => request<PromotionCode[]>(`${BASE}/promotion-codes`),
  get: (code: string) =>
    request<PromotionCode>(`${BASE}/promotion-codes/${encodeURIComponent(code)}`),
  create: (input: PromotionCodeInput) =>
    request<PromotionCode>(`${BASE}/promotion-codes`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (code: string, patch: Partial<Omit<PromotionCodeInput, 'code'>>) =>
    request<PromotionCode>(`${BASE}/promotion-codes/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  remove: (code: string) =>
    request<void>(`${BASE}/promotion-codes/${encodeURIComponent(code)}`, { method: 'DELETE' }),
}

// Size types
export const sizeTypesApi = {
  list: () => request<SizeType[]>(`${BASE}/size-types`),
  get: (n: number) => request<SizeType>(`${BASE}/size-types/${n}`),
  create: (input: SizeTypeInput) =>
    request<SizeType>(`${BASE}/size-types`, { method: 'POST', body: JSON.stringify(input) }),
  update: (n: number, patch: Partial<Omit<SizeTypeInput, 'code'>>) =>
    request<SizeType>(`${BASE}/size-types/${n}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (n: number) => request<void>(`${BASE}/size-types/${n}`, { method: 'DELETE' }),
}

// NRF codes (read-only lookup)
export const nrfCodesApi = {
  lookup: (sizeTypeCode: number, rowLabel?: number, columnPosition?: number) => {
    const p = new URLSearchParams()
    p.set('sizeTypeCode', String(sizeTypeCode))
    if (rowLabel != null) p.set('rowLabel', String(rowLabel))
    if (columnPosition != null) p.set('columnPosition', String(columnPosition))
    return request<NrfCodeCell[]>(`${BASE}/nrf-codes?${p.toString()}`)
  },
}
