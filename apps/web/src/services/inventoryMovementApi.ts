import { ALLOWED_DEPARTMENTS } from '../constants/domain'
import type {
  MovementReconciliationParams,
  MovementReconciliationResponse,
  MovementReconciliationRow,
  MovementTimelineParams,
  MovementTimelineResponse,
  MovementTimelineRow,
  MovementType,
  SourceDocumentRef,
  SourceDocumentType,
} from '../types/inventoryMovement'
import type { Department } from '../types/sku'

const TIMELINE_ENDPOINT = '/api/v1/inventory/movements/timeline'
const RECONCILIATION_ENDPOINT = '/api/v1/inventory/movements/reconciliation'

/**
 * Single source of truth for movement/reconciliation contract mapping.
 * Supports both canonical camelCase and DB-aligned snake_case alias payloads.
 */
type RawRecord = Record<string, unknown>

function pickString(raw: RawRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

function pickNumber(raw: RawRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function normalizeDepartment(value: string | undefined): Department | undefined {
  if (!value) return undefined
  const match = ALLOWED_DEPARTMENTS.find((dept) => dept === value)
  return match
}

const warnedUnknownMovementTypes = new Set<string>()

function normalizeMovementType(value: string | undefined): MovementType {
  switch (value) {
    case 'sale':
    case 'po_receipt':
    case 'transfer_in':
    case 'transfer_out':
    case 'adjustment':
      return value
    default:
      if (value && !warnedUnknownMovementTypes.has(value)) {
        console.warn(
          `[inventoryMovementApi] Unknown movement type "${value}" received from API, defaulting to "adjustment".`,
        )
        warnedUnknownMovementTypes.add(value)
      }
      return 'adjustment'
  }
}

function deriveSourceDocumentRef(raw: RawRecord): SourceDocumentRef | undefined {
  const explicitType = pickString(raw, ['sourceDocumentType', 'source_document_type'])
  const explicitId = pickString(raw, ['sourceDocumentId', 'source_document_id'])
  const explicitNumber = pickString(raw, ['sourceDocumentNumber', 'source_document_number'])
  if (explicitType && explicitId && isSourceDocumentType(explicitType)) {
    return {
      sourceDocumentType: explicitType,
      sourceDocumentId: explicitId,
      sourceDocumentNumber: explicitNumber ?? null,
    }
  }

  const sourceCandidates: Array<{ type: SourceDocumentType; keys: string[] }> = [
    { type: 'sale', keys: ['sourceSaleId', 'source_sale_id'] },
    { type: 'po_receipt', keys: ['sourcePoReceiptLineId', 'source_po_receipt_line_id'] },
    { type: 'transfer', keys: ['sourceTransferLineId', 'source_transfer_line_id'] },
    { type: 'adjustment', keys: ['sourceAdjustmentLineId', 'source_adjustment_line_id'] },
  ]

  for (const candidate of sourceCandidates) {
    const id = pickString(raw, candidate.keys)
    if (id) {
      return {
        sourceDocumentType: candidate.type,
        sourceDocumentId: id,
        sourceDocumentNumber: explicitNumber ?? null,
      }
    }
  }

  return undefined
}

function isSourceDocumentType(value: string): value is SourceDocumentType {
  return value === 'sale' || value === 'po_receipt' || value === 'transfer' || value === 'adjustment'
}

function mapPagination(raw: RawRecord): MovementTimelineResponse['pagination'] {
  const pagination = (raw.pagination ?? {}) as RawRecord
  const page = pickNumber(pagination, ['page']) ?? 1
  const pageSize = pickNumber(pagination, ['pageSize', 'page_size']) ?? 25
  const totalItems = pickNumber(pagination, ['totalItems', 'total_items']) ?? 0
  const totalPages = pickNumber(pagination, ['totalPages', 'total_pages']) ?? 1
  return { page, pageSize, totalItems, totalPages }
}

export function mapMovementTimelineRow(rawInput: unknown): MovementTimelineRow {
  const raw = (rawInput ?? {}) as RawRecord
  const skuId = pickString(raw, ['skuId', 'sku_id']) ?? ''
  const locationId = pickString(raw, ['locationId', 'location_id']) ?? ''
  const movementAt = pickString(raw, ['movementAt', 'movement_at']) ?? ''
  const sourceRef = deriveSourceDocumentRef(raw)

  return {
    id: pickString(raw, ['id']) ?? `${skuId}:${locationId}:${movementAt}`,
    skuId,
    skuCode: pickString(raw, ['skuCode', 'sku_code']) ?? skuId,
    locationId,
    locationCode: pickString(raw, ['locationCode', 'location_code']) ?? locationId,
    locationName: pickString(raw, ['locationName', 'location_name']) ?? null,
    movementType: normalizeMovementType(pickString(raw, ['movementType', 'movement_type'])),
    quantityDelta: pickNumber(raw, ['quantityDelta', 'quantity_delta']) ?? 0,
    unitCostSnapshot: pickNumber(raw, ['unitCostSnapshot', 'unit_cost_snapshot']) ?? null,
    movementAt,
    macroDepartment: normalizeDepartment(
      pickString(raw, ['macroDepartment', 'macro_department', 'department']),
    ) ?? null,
    category: pickNumber(raw, ['category', 'categoryId', 'category_id']) ?? null,
    sourceDocumentType: sourceRef?.sourceDocumentType,
    sourceDocumentId: sourceRef?.sourceDocumentId,
    sourceDocumentNumber: sourceRef?.sourceDocumentNumber ?? null,
  }
}

export function mapMovementReconciliationRow(rawInput: unknown): MovementReconciliationRow {
  const raw = (rawInput ?? {}) as RawRecord
  const skuId = pickString(raw, ['skuId', 'sku_id']) ?? ''
  const locationId = pickString(raw, ['locationId', 'location_id']) ?? ''
  const sourceRef = deriveSourceDocumentRef(raw)

  return {
    id: pickString(raw, ['id']) ?? `${skuId}:${locationId}`,
    skuId,
    skuCode: pickString(raw, ['skuCode', 'sku_code']) ?? skuId,
    locationId,
    locationCode: pickString(raw, ['locationCode', 'location_code']) ?? locationId,
    locationName: pickString(raw, ['locationName', 'location_name']) ?? null,
    expectedStockDelta:
      pickNumber(raw, ['expectedStockDelta', 'expected_stock_delta', 'expectedQuantityDelta']) ?? 0,
    movementRowCount: pickNumber(raw, ['movementRowCount', 'movement_row_count']) ?? 0,
    firstMovementAt: pickString(raw, ['firstMovementAt', 'first_movement_at']) ?? null,
    lastMovementAt: pickString(raw, ['lastMovementAt', 'last_movement_at']) ?? null,
    macroDepartment: normalizeDepartment(
      pickString(raw, ['macroDepartment', 'macro_department', 'department']),
    ) ?? null,
    category: pickNumber(raw, ['category', 'categoryId', 'category_id']) ?? null,
    sourceDocumentType: sourceRef?.sourceDocumentType,
    sourceDocumentId: sourceRef?.sourceDocumentId,
    sourceDocumentNumber: sourceRef?.sourceDocumentNumber ?? null,
  }
}

function appendCommonParams(
  searchParams: URLSearchParams,
  params: {
    page?: number
    pageSize?: number
    sort?: string
    order?: 'asc' | 'desc'
    startDate?: string
    endDate?: string
    skuCode?: string
    locationId?: string
    categoryMin?: number
    categoryMax?: number
  },
): void {
  if (params.page != null) searchParams.set('page', String(params.page))
  if (params.pageSize != null) searchParams.set('pageSize', String(params.pageSize))
  if (params.sort) searchParams.set('sort', params.sort)
  if (params.order) searchParams.set('order', params.order)
  if (params.startDate) searchParams.set('startDate', params.startDate)
  if (params.endDate) searchParams.set('endDate', params.endDate)
  if (params.skuCode) searchParams.set('skuCode', params.skuCode)
  if (params.locationId) searchParams.set('locationId', params.locationId)
  if (params.categoryMin != null) searchParams.set('categoryMin', String(params.categoryMin))
  if (params.categoryMax != null) searchParams.set('categoryMax', String(params.categoryMax))
}

function appendListParams(searchParams: URLSearchParams, key: string, values?: string[]): void {
  if (!values || values.length === 0) return
  for (const value of values) {
    if (value) searchParams.append(key, value)
  }
}

export function buildMovementTimelineQueryParams(params: MovementTimelineParams): URLSearchParams {
  const searchParams = new URLSearchParams()
  appendCommonParams(searchParams, params)
  appendListParams(searchParams, 'movementType', params.movementTypes)
  appendListParams(searchParams, 'macroDepartment', params.macroDepartments)
  return searchParams
}

export function buildMovementReconciliationQueryParams(
  params: MovementReconciliationParams,
): URLSearchParams {
  const searchParams = new URLSearchParams()
  appendCommonParams(searchParams, params)
  appendListParams(searchParams, 'macroDepartment', params.macroDepartments)
  return searchParams
}

export async function fetchMovementTimeline(
  params: MovementTimelineParams,
): Promise<MovementTimelineResponse> {
  const response = await fetch(`${TIMELINE_ENDPOINT}?${buildMovementTimelineQueryParams(params)}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch movement timeline: ${response.status}`)
  }
  const payload = (await response.json()) as RawRecord
  const rows = Array.isArray(payload.data) ? payload.data : []
  return {
    data: rows.map((row) => mapMovementTimelineRow(row)),
    pagination: mapPagination(payload),
  }
}

export async function fetchMovementReconciliation(
  params: MovementReconciliationParams,
): Promise<MovementReconciliationResponse> {
  const response = await fetch(
    `${RECONCILIATION_ENDPOINT}?${buildMovementReconciliationQueryParams(params)}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch movement reconciliation: ${response.status}`)
  }
  const payload = (await response.json()) as RawRecord
  const rows = Array.isArray(payload.data) ? payload.data : []
  return {
    data: rows.map((row) => mapMovementReconciliationRow(row)),
    pagination: mapPagination(payload),
  }
}
