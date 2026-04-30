import type {
  AttributeCoverageRow,
  AttributeDimension,
  AttributeDimensionValue,
  AttributeFamilyRule,
  AttributeMacroRuleSet,
  AttributeMacroRuleSummary,
  SetSkuAttributesInput,
  SkuAttributes,
} from '../types/productsAttributes'

export interface DimensionInput {
  code: string
  labelEs: string
  descriptionEs?: string | null
  sortOrder: number
  isMultiValue: boolean
  familyCode?: string | null
}

export interface DimensionPatch {
  labelEs?: string
  descriptionEs?: string | null
  sortOrder?: number
  isMultiValue?: boolean
}

export interface ValueInput {
  code: string
  labelEs: string
  descriptionEs?: string | null
  sortOrder: number
}

export interface ValuePatch {
  labelEs?: string
  descriptionEs?: string | null
  sortOrder?: number
  isActive?: boolean
}

export type FamilyRulesReplaceInput =
  | { universal: true }
  | {
      universal: false
      rules: { familyCode: string; enabled: boolean; isRequired: boolean; sortOrder?: number }[]
    }

export interface MacroRulesReplaceInput {
  rules: { sourceValueCode: string; targetValueCode: string | null }[]
}

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
  listDimensionsForSkus(skuCodes: string[], withCounts = false): Promise<AttributeDimension[]> {
    return request<AttributeDimension[]>(`${BASE}/attributes/dimensions/for-skus`, {
      method: 'POST',
      body: JSON.stringify({ skuCodes, withCounts }),
    })
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
  listMacroRules(): Promise<AttributeMacroRuleSummary[]> {
    return request<AttributeMacroRuleSummary[]>(`${BASE}/attributes/macros`)
  },
  getMacroRuleSet(
    sourceDimensionCode: string,
    targetDimensionCode: string,
  ): Promise<AttributeMacroRuleSet> {
    return request<AttributeMacroRuleSet>(
      `${BASE}/attributes/macros/${encodeURIComponent(sourceDimensionCode)}/${encodeURIComponent(targetDimensionCode)}`,
    )
  },
  replaceMacroRules(
    sourceDimensionCode: string,
    targetDimensionCode: string,
    input: MacroRulesReplaceInput,
  ): Promise<AttributeMacroRuleSet> {
    return request<AttributeMacroRuleSet>(
      `${BASE}/attributes/macros/${encodeURIComponent(sourceDimensionCode)}/${encodeURIComponent(targetDimensionCode)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    )
  },

  // ──────────────── Dimension CRUD ────────────────
  createDimension(input: DimensionInput): Promise<AttributeDimension> {
    return request<AttributeDimension>(`${BASE}/attributes/dimensions`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateDimension(code: string, patch: DimensionPatch): Promise<AttributeDimension> {
    return request<AttributeDimension>(`${BASE}/attributes/dimensions/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  deleteDimension(code: string): Promise<void> {
    return request<void>(`${BASE}/attributes/dimensions/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    })
  },
  reorderDimensions(entries: { code: string; sortOrder: number }[]): Promise<{ updated: number }> {
    return request<{ updated: number }>(`${BASE}/attributes/dimensions/reorder`, {
      method: 'POST',
      body: JSON.stringify({ entries }),
    })
  },

  // ──────────────── Family rules (dim side) ────────────────
  getFamilyRules(dimensionCode: string): Promise<AttributeFamilyRule[]> {
    return request<AttributeFamilyRule[]>(
      `${BASE}/attributes/dimensions/${encodeURIComponent(dimensionCode)}/family-rules`,
    )
  },
  replaceFamilyRules(dimensionCode: string, input: FamilyRulesReplaceInput): Promise<AttributeFamilyRule[]> {
    return request<AttributeFamilyRule[]>(
      `${BASE}/attributes/dimensions/${encodeURIComponent(dimensionCode)}/family-rules`,
      { method: 'PUT', body: JSON.stringify(input) },
    )
  },

  // ──────────────── Value CRUD ────────────────
  createValue(dimensionCode: string, input: ValueInput): Promise<AttributeDimensionValue> {
    return request<AttributeDimensionValue>(
      `${BASE}/attributes/dimensions/${encodeURIComponent(dimensionCode)}/values`,
      { method: 'POST', body: JSON.stringify(input) },
    )
  },
  updateValue(id: number, patch: ValuePatch): Promise<AttributeDimensionValue> {
    return request<AttributeDimensionValue>(`${BASE}/attributes/values/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  deleteValue(id: number): Promise<void> {
    return request<void>(`${BASE}/attributes/values/${id}`, { method: 'DELETE' })
  },
  deactivateValue(id: number): Promise<AttributeDimensionValue> {
    return request<AttributeDimensionValue>(`${BASE}/attributes/values/${id}/deactivate`, {
      method: 'POST',
    })
  },
  mergeValues(sourceId: number, targetId: number): Promise<{ moved: number }> {
    return request<{ moved: number }>(
      `${BASE}/attributes/values/${sourceId}/merge-into/${targetId}`,
      { method: 'POST' },
    )
  },
  reorderValues(
    dimensionCode: string,
    entries: { valueId: number; sortOrder: number }[],
  ): Promise<{ updated: number }> {
    return request<{ updated: number }>(
      `${BASE}/attributes/dimensions/${encodeURIComponent(dimensionCode)}/values/reorder`,
      { method: 'POST', body: JSON.stringify({ entries }) },
    )
  },
}
