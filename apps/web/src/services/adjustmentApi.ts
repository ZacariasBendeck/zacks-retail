import type {
  Adjustment,
  AdjustmentListParams,
  AdjustmentType,
  CreateAdjustmentPayload,
  Location,
} from '../types/adjustment'
import type { PaginationEnvelope } from '../types/sku'
import { MOCK_SKUS } from '../mock/skuData'

const USE_MOCK = true

const MOCK_LOCATIONS: Location[] = [
  { id: 'loc-01', name: 'Almacen Principal' },
  { id: 'loc-02', name: 'Tienda Centro' },
  { id: 'loc-03', name: 'Tienda Norte' },
  { id: 'loc-04', name: 'Tienda Sur' },
  { id: 'loc-05', name: 'Bodega' },
]

const ADJUSTMENT_TYPES: AdjustmentType[] = [
  'RECEIPT', 'TRANSFER', 'MANUAL_ADJUST', 'RETURN', 'DAMAGE', 'SHRINKAGE',
]

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function generateMockAdjustments(count: number): Adjustment[] {
  const adjustments: Adjustment[] = []
  for (let i = 0; i < count; i++) {
    const type = randomItem(ADJUSTMENT_TYPES)
    const sku = randomItem(MOCK_SKUS)
    const fromLoc = type === 'TRANSFER' ? randomItem(MOCK_LOCATIONS) : null
    let toLoc: Location | null = null
    if (type === 'TRANSFER') {
      toLoc = randomItem(MOCK_LOCATIONS.filter((l) => l.id !== fromLoc?.id))
    } else if (type === 'RECEIPT' || type === 'RETURN') {
      toLoc = randomItem(MOCK_LOCATIONS)
    }

    const needsReason = ['MANUAL_ADJUST', 'DAMAGE', 'SHRINKAGE'].includes(type)
    const reasons = [
      'Physical count correction',
      'Water damage during transport',
      'Missing from shelf',
      'Customer return - defective',
      'Cycle count variance',
    ]

    adjustments.push({
      id: crypto.randomUUID(),
      type,
      fromLocationId: fromLoc?.id ?? null,
      fromLocationName: fromLoc?.name ?? null,
      toLocationId: toLoc?.id ?? null,
      toLocationName: toLoc?.name ?? null,
      reason: needsReason ? randomItem(reasons) : null,
      lineItems: [
        {
          skuId: sku.id,
          skuCode: sku.skuCode,
          brand: sku.style,
          quantity: type === 'DAMAGE' || type === 'SHRINKAGE'
            ? -(Math.floor(Math.random() * 5) + 1)
            : Math.floor(Math.random() * 20) + 1,
        },
      ],
      createdBy: 'admin@benlow.com',
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
  }
  return adjustments.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

const MOCK_ADJUSTMENTS = generateMockAdjustments(80)

export async function fetchLocations(): Promise<Location[]> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 100))
    return MOCK_LOCATIONS
  }
  const res = await fetch('/api/v1/locations')
  if (!res.ok) throw new Error(`Failed to fetch locations: ${res.status}`)
  return res.json()
}

export async function fetchAdjustments(
  params: AdjustmentListParams,
): Promise<PaginationEnvelope<Adjustment>> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200))
    let filtered = [...MOCK_ADJUSTMENTS]

    if (params.type) filtered = filtered.filter((a) => a.type === params.type)
    if (params.fromDate) {
      filtered = filtered.filter((a) => a.createdAt >= params.fromDate!)
    }
    if (params.toDate) {
      filtered = filtered.filter((a) => a.createdAt <= params.toDate!)
    }

    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 25
    const totalItems = filtered.length
    const totalPages = Math.ceil(totalItems / pageSize)
    const start = (page - 1) * pageSize

    return {
      data: filtered.slice(start, start + pageSize),
      pagination: { page, pageSize, totalItems, totalPages },
    }
  }

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') searchParams.set(key, String(value))
  }
  const res = await fetch(`/api/v1/inventory/adjustments?${searchParams}`)
  if (!res.ok) throw new Error(`Failed to fetch adjustments: ${res.status}`)
  return res.json()
}

export async function fetchAdjustment(id: string): Promise<Adjustment> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 100))
    const adj = MOCK_ADJUSTMENTS.find((a) => a.id === id)
    if (!adj) throw new Error('Adjustment not found')
    return adj
  }
  const res = await fetch(`/api/v1/inventory/adjustments/${id}`)
  if (!res.ok) throw new Error(`Failed to fetch adjustment: ${res.status}`)
  return res.json()
}

export async function createAdjustment(payload: CreateAdjustmentPayload): Promise<Adjustment> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300))
    const lineItems = payload.lineItems.map((li) => {
      const sku = MOCK_SKUS.find((s) => s.id === li.skuId)
      return { ...li, skuCode: sku?.skuCode, brand: sku?.style }
    })
    const fromLoc = MOCK_LOCATIONS.find((l) => l.id === payload.fromLocationId)
    const toLoc = MOCK_LOCATIONS.find((l) => l.id === payload.toLocationId)

    const adj: Adjustment = {
      id: crypto.randomUUID(),
      type: payload.type,
      fromLocationId: payload.fromLocationId ?? null,
      fromLocationName: fromLoc?.name ?? null,
      toLocationId: payload.toLocationId ?? null,
      toLocationName: toLoc?.name ?? null,
      reason: payload.reason ?? null,
      lineItems,
      createdBy: 'admin@benlow.com',
      createdAt: new Date().toISOString(),
    }
    MOCK_ADJUSTMENTS.unshift(adj)
    return adj
  }

  const res = await fetch('/api/v1/inventory/adjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 409) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? 'Stock would go below zero')
  }
  if (!res.ok) throw new Error(`Failed to create adjustment: ${res.status}`)
  return res.json()
}
