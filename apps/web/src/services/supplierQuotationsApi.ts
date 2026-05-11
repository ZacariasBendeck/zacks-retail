import type { PurchaseOrder } from '../types/purchaseOrder'

export class SupplierQuotationsApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'SupplierQuotationsApiError'
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
    throw new SupplierQuotationsApiError(message, res.status, code)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const BASE = '/api/v1/purchasing/supplier-quotations'

export type SupplierQuotationStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'CONVERTED'
export type SupplierQuotationDecisionStatus = 'NEW' | 'ACCEPTED' | 'REJECTED' | 'HOLD'
export type SupplierQuotationRelationType = 'SIMILAR' | 'SAME_ELEMENT' | 'REPLACEMENT' | 'COORDINATE' | 'CARRYOVER'
export type SupplierQuotationTargetType = 'SKU' | 'MATCHING_SET' | 'QUOTE_LINE'

export interface SupplierQuotationListFilters {
  q?: string | null
  status?: SupplierQuotationStatus | 'ALL' | null
  vendorCode?: string | null
  buyer?: string | null
  pageSize?: number
}

export interface SupplierQuotationListItem {
  id: string
  quoteNumber: string
  vendorCode: string
  vendorName: string | null
  buyer: string | null
  season: string | null
  chainId: string | null
  chainLabel: string | null
  sourceCurrency: 'HNL' | 'USD' | 'CNY'
  quoteDate: string
  validUntil: string | null
  status: SupplierQuotationStatus
  lineCount: number
  acceptedLineCount: number
  acceptedCostHnl: number
  updatedAt: string
}

export interface SupplierQuotationLine {
  id: string
  quotationId: string
  lineSequence: number
  linkedSkuId: string | null
  linkedSkuCode: string | null
  linkedSkuProvisionalCode: string | null
  supplierStyle: string
  supplierColorCode: string | null
  supplierColorName: string | null
  description: string | null
  familyCode: string | null
  familyLabelEs: string | null
  categoryNumber: number | null
  categoryDescription: string | null
  colorFamilyValueId: number | null
  colorFamilyCode: string | null
  colorFamilyLabelEs: string | null
  materialValueId: number | null
  materialCode: string | null
  materialLabelEs: string | null
  styleElementValueId: number | null
  styleElementCode: string | null
  styleElementLabelEs: string | null
  keywords: string | null
  imageUrl: string | null
  moqQty: number | null
  quotedQty: number | null
  unitCost: number
  estimatedLandedUnitCostHnl: number | null
  targetRetailHnl: number | null
  marginPct: number | null
  plannedReceiptDate: string | null
  decisionStatus: SupplierQuotationDecisionStatus
  decisionReason: string | null
  decisionAt: string | null
  decisionBy: string | null
  createdAt: string
  updatedAt: string
}

export interface SupplierQuotationRelation {
  id: string
  sourceLineId: string
  relationType: SupplierQuotationRelationType
  targetType: SupplierQuotationTargetType
  targetId: string
  note: string | null
  title: string
  subtitle: string | null
  createdAt: string
  createdBy: string
}

export interface SupplierQuotation extends SupplierQuotationListItem {
  fxRate: number
  fxDate: string
  incotermCode: string | null
  incotermPlace: string | null
  paymentTerms: string | null
  leadTimeDays: number | null
  sourceDocumentRef: string | null
  notes: string | null
  createdAt: string
  createdBy: string
  updatedBy: string
  lines: SupplierQuotationLine[]
  relations: SupplierQuotationRelation[]
}

export interface SupplierQuotationInput {
  vendorCode?: string | null
  buyer?: string | null
  season?: string | null
  chainId?: string | null
  sourceCurrency?: 'HNL' | 'USD' | 'CNY' | null
  fxRate?: number | null
  fxDate?: string | null
  incotermCode?: string | null
  incotermPlace?: string | null
  paymentTerms?: string | null
  quoteDate?: string | null
  validUntil?: string | null
  leadTimeDays?: number | null
  sourceDocumentRef?: string | null
  notes?: string | null
}

export interface SupplierQuotationLineInput {
  linkedSkuId?: string | null
  supplierStyle?: string | null
  supplierColorCode?: string | null
  supplierColorName?: string | null
  description?: string | null
  familyCode?: string | null
  categoryNumber?: number | null
  colorFamilyValueId?: number | null
  materialValueId?: number | null
  styleElementValueId?: number | null
  keywords?: string | null
  imageUrl?: string | null
  moqQty?: number | null
  quotedQty?: number | null
  unitCost?: number | null
  estimatedLandedUnitCostHnl?: number | null
  targetRetailHnl?: number | null
  plannedReceiptDate?: string | null
}

export interface SupplierQuotationSimilarityCandidate {
  targetType: SupplierQuotationTargetType
  targetId: string
  relationType: SupplierQuotationRelationType | null
  manual: boolean
  score: number
  signals: string[]
  title: string
  subtitle: string | null
  vendorCode: string | null
  vendorName: string | null
  unitCost: number | null
  retailPrice: number | null
  imageUrl: string | null
}

export interface SupplierQuotationConvertResult {
  purchaseOrders: PurchaseOrder[]
  createdSkuIds: string[]
}

function params(filters?: SupplierQuotationListFilters): string {
  const p = new URLSearchParams()
  if (filters?.q) p.set('q', filters.q)
  if (filters?.status) p.set('status', filters.status)
  if (filters?.vendorCode) p.set('vendorCode', filters.vendorCode)
  if (filters?.buyer) p.set('buyer', filters.buyer)
  if (filters?.pageSize) p.set('pageSize', String(filters.pageSize))
  const q = p.toString()
  return q ? `?${q}` : ''
}

export const supplierQuotationsApi = {
  list(filters?: SupplierQuotationListFilters): Promise<SupplierQuotationListItem[]> {
    return request<SupplierQuotationListItem[]>(`${BASE}${params(filters)}`)
  },
  get(id: string): Promise<SupplierQuotation> {
    return request<SupplierQuotation>(`${BASE}/${encodeURIComponent(id)}`)
  },
  create(input: SupplierQuotationInput): Promise<SupplierQuotation> {
    return request<SupplierQuotation>(BASE, { method: 'POST', body: JSON.stringify(input) })
  },
  update(id: string, input: SupplierQuotationInput): Promise<SupplierQuotation> {
    return request<SupplierQuotation>(`${BASE}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  archive(id: string): Promise<SupplierQuotation> {
    return request<SupplierQuotation>(`${BASE}/${encodeURIComponent(id)}/archive`, { method: 'POST' })
  },
  addLine(id: string, input: SupplierQuotationLineInput): Promise<SupplierQuotationLine> {
    return request<SupplierQuotationLine>(`${BASE}/${encodeURIComponent(id)}/lines`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateLine(lineId: string, input: SupplierQuotationLineInput): Promise<SupplierQuotationLine> {
    return request<SupplierQuotationLine>(`${BASE}/lines/${encodeURIComponent(lineId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  deleteLine(lineId: string): Promise<void> {
    return request<void>(`${BASE}/lines/${encodeURIComponent(lineId)}`, { method: 'DELETE' })
  },
  decideLine(lineId: string, input: { decisionStatus: SupplierQuotationDecisionStatus; reason?: string | null }): Promise<SupplierQuotationLine> {
    return request<SupplierQuotationLine>(`${BASE}/lines/${encodeURIComponent(lineId)}/decision`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  similarity(lineId: string): Promise<SupplierQuotationSimilarityCandidate[]> {
    return request<SupplierQuotationSimilarityCandidate[]>(`${BASE}/lines/${encodeURIComponent(lineId)}/similarity`)
  },
  addRelation(lineId: string, input: { relationType: SupplierQuotationRelationType; targetType: SupplierQuotationTargetType; targetId: string; note?: string | null }): Promise<SupplierQuotationRelation> {
    return request<SupplierQuotationRelation>(`${BASE}/lines/${encodeURIComponent(lineId)}/relations`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  removeRelation(relationId: string): Promise<void> {
    return request<void>(`${BASE}/relations/${encodeURIComponent(relationId)}`, { method: 'DELETE' })
  },
  convertToPo(id: string): Promise<SupplierQuotationConvertResult> {
    return request<SupplierQuotationConvertResult>(`${BASE}/${encodeURIComponent(id)}/convert-to-po`, {
      method: 'POST',
    })
  },
}
