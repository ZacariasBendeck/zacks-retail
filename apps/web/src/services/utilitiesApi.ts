/**
 * Utilities API client — batch-change operations, SKU criteria lookup, history, undo.
 *
 * Mirrors the backend contract in docs/dev/specs/2026-04-21-utilities-batch-change-design.md.
 */

export class UtilitiesApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'UtilitiesApiError'
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
      // ignore
    }
    throw new UtilitiesApiError(message, res.status, code)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

// ─────────── types mirrored from apps/api/src/services/utilities/types.ts ───────────

export interface SkuCriteria {
  skus?: string[]
  categories?: number[]
  vendors?: string[]
  seasons?: string[]
  stylesColors?: string[]
  groups?: string[]
  keywords?: string[]
  attributes?: Record<string, string[]>
  onlyFuturePriceChanges?: boolean
  onlyWtdSales?: boolean
}

export type BatchOperationType =
  | 'CHANGE_KEYWORDS_ADD'
  | 'CHANGE_KEYWORDS_REMOVE'
  | 'CHANGE_CATEGORY'
  | 'CHANGE_VENDOR'
  | 'CHANGE_SEASON'
  | 'CHANGE_GROUP_CODE'
  | 'CHANGE_SKU_ATTRIBUTE'
  | 'CHANGE_SIZE_COLUMN'
  | 'CHANGE_SIZE_TYPE_STRUCTURE'

export type AttributeChange =
  | { type: 'CHANGE_KEYWORDS_ADD'; keyword: string }
  | { type: 'CHANGE_KEYWORDS_REMOVE'; keyword: string }
  | { type: 'CHANGE_CATEGORY'; category: number }
  | { type: 'CHANGE_VENDOR'; vendor: string }
  | { type: 'CHANGE_SEASON'; season: string }
  | { type: 'CHANGE_GROUP_CODE'; groupCode: string }
  | {
      type: 'CHANGE_SKU_ATTRIBUTE'
      dimensionCode: string
      valueCodes: string[]
      mode: 'REPLACE' | 'ADD' | 'REMOVE'
    }

export interface EffectiveSku {
  sku: string
  category: number | null
  vendor: string | null
  season: string | null
  groupCode: string | null
  styleColor: string | null
  keywords: string[]
  retailPrice: number | null
  description: string | null
}

export interface LookupResult {
  count: number
  skus: string[]
  sample: EffectiveSku[]
}

export interface BatchOperation {
  id: string
  actor: string
  operationType: BatchOperationType
  criteriaJson: SkuCriteria
  changeJson: AttributeChange
  affectedCount: number
  startedAt: string
  completedAt: string | null
  undoneAt: string | null
}

export interface BatchOperationItem {
  id: string
  batchId: string
  ricsSkuCode: string
  beforeJson: Record<string, unknown> | null
  afterJson: Record<string, unknown> | null
}

export interface BatchOperationWithItems extends BatchOperation {
  items: BatchOperationItem[]
}

export interface ApplyBatchChangeResult {
  batchId: string | null
  affectedCount: number
  preview: string[]
}

// ─────────── clients ───────────

export const skuLookupApi = {
  lookup: (criteria: SkuCriteria, sampleLimit = 20) =>
    request<LookupResult>('/api/v1/products/skus/lookup', {
      method: 'POST',
      body: JSON.stringify({ ...criteria, sampleLimit }),
    }),
}

export const utilitiesApi = {
  applyBatchChange: (
    input: { operationType: BatchOperationType; criteria: SkuCriteria; change: AttributeChange },
    opts: { dryRun?: boolean } = {},
  ) => {
    const qs = opts.dryRun ? '?dryRun=1' : ''
    return request<ApplyBatchChangeResult>(`/api/v1/utilities/batch${qs}`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  listBatchOperations: (params: { limit?: number; offset?: number; operationType?: BatchOperationType } = {}) => {
    const qs = new URLSearchParams()
    if (params.limit != null) qs.set('limit', String(params.limit))
    if (params.offset != null) qs.set('offset', String(params.offset))
    if (params.operationType) qs.set('operationType', params.operationType)
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return request<{ total: number; rows: BatchOperation[] }>(`/api/v1/utilities/batch${query}`)
  },

  getBatchOperation: (id: string) =>
    request<BatchOperationWithItems>(`/api/v1/utilities/batch/${encodeURIComponent(id)}`),

  undoBatchOperation: (id: string) =>
    request<{ reversed: number }>(`/api/v1/utilities/batch/${encodeURIComponent(id)}/undo`, { method: 'POST' }),
}
