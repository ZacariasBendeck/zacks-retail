/**
 * Product Families admin client — metadata edits, category mapping replace,
 * and attribute-rule management. Pairs with productsAttributesApi: both
 * surfaces write to the same `attribute_family_rule` rows, and hooks on both
 * sides invalidate `['product-families']` + `['products-attributes']` so the
 * two admin pages stay in sync after a mutation from either side.
 */
import type { ProductFamily } from '../types/sku'
import type { FamilyAttributeRuleRow } from '../types/productsAttributes'

export class FamiliesApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'FamiliesApiError'
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
    throw new FamiliesApiError(message, res.status, code)
  }
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

const BASE = '/api/v1/products/families'

export interface FamilyCategory {
  categoryNumber: number
  categoryDesc: string
  departmentNumber: number | null
  departmentDesc: string | null
  familyCode: string
}

export interface FamilyMetadataPatch {
  labelEs?: string
  descriptionEs?: string | null
  sortOrder?: number
}

export interface FamilyAttributeRuleInput {
  dimensionCode: string
  enabled: boolean
  isRequired: boolean
  sortOrder?: number
}

export const productFamiliesApi = {
  list(): Promise<ProductFamily[]> {
    return request<ProductFamily[]>(BASE)
  },
  categories(code: string): Promise<FamilyCategory[]> {
    return request<FamilyCategory[]>(`${BASE}/${encodeURIComponent(code)}/categories`)
  },
  attributeRules(code: string): Promise<FamilyAttributeRuleRow[]> {
    return request<FamilyAttributeRuleRow[]>(
      `${BASE}/${encodeURIComponent(code)}/attribute-rules`,
    )
  },

  updateMetadata(code: string, patch: FamilyMetadataPatch): Promise<ProductFamily> {
    return request<ProductFamily>(`${BASE}/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  replaceCategories(
    code: string,
    categories: number[],
    opts: { force?: boolean } = {},
  ): Promise<{ assigned: number; reassigned: number; removed: number }> {
    const q = opts.force ? '?force=true' : ''
    return request<{ assigned: number; reassigned: number; removed: number }>(
      `${BASE}/${encodeURIComponent(code)}/categories${q}`,
      { method: 'PUT', body: JSON.stringify({ categories }) },
    )
  },
  replaceAttributeRules(code: string, rules: FamilyAttributeRuleInput[]): Promise<{ updated: number }> {
    return request<{ updated: number }>(
      `${BASE}/${encodeURIComponent(code)}/attribute-rules`,
      { method: 'PUT', body: JSON.stringify({ rules }) },
    )
  },
  toggleAttributeRule(
    familyCode: string,
    dimensionCode: string,
    patch: { enabled?: boolean; isRequired?: boolean; sortOrder?: number },
  ): Promise<unknown> {
    return request(
      `${BASE}/${encodeURIComponent(familyCode)}/attribute-rules/${encodeURIComponent(dimensionCode)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    )
  },
  removeAttributeRule(familyCode: string, dimensionCode: string): Promise<void> {
    return request<void>(
      `${BASE}/${encodeURIComponent(familyCode)}/attribute-rules/${encodeURIComponent(dimensionCode)}`,
      { method: 'DELETE' },
    )
  },
}
