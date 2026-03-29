import type { PaginationEnvelope, Sku, SkuCreatePayload, SkuUpdatePayload, SkuListParams, Vendor } from '../types/sku'
import { MOCK_SKUS } from '../mock/skuData'

const USE_MOCK = true

function filterAndSort(params: SkuListParams): PaginationEnvelope<Sku> {
  let filtered = [...MOCK_SKUS]

  if (params.active !== undefined) {
    filtered = filtered.filter((s) => s.active === params.active)
  } else {
    filtered = filtered.filter((s) => s.active)
  }

  if (params.department) filtered = filtered.filter((s) => s.department === params.department)
  if (params.category) filtered = filtered.filter((s) => s.category === params.category)
  if (params.brand) filtered = filtered.filter((s) => s.brand === params.brand)
  if (params.vendorId) filtered = filtered.filter((s) => s.vendorId === params.vendorId)
  if (params.size) filtered = filtered.filter((s) => s.size === params.size)
  if (params.minPrice != null) filtered = filtered.filter((s) => s.price >= params.minPrice!)
  if (params.maxPrice != null) filtered = filtered.filter((s) => s.price <= params.maxPrice!)

  if (params.q) {
    const q = params.q.toLowerCase()
    filtered = filtered.filter(
      (s) =>
        s.brand.toLowerCase().includes(q) ||
        s.style.toLowerCase().includes(q) ||
        s.color.toLowerCase().includes(q) ||
        s.skuCode.toLowerCase().includes(q) ||
        (s.barcode && s.barcode.includes(q)),
    )
  }

  const sortField = params.sort ?? 'brand'
  const sortOrder = params.order ?? 'asc'
  filtered.sort((a, b) => {
    const aVal = a[sortField as keyof Sku]
    const bVal = b[sortField as keyof Sku]
    if (aVal == null || bVal == null) return 0
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortOrder === 'asc' ? cmp : -cmp
  })

  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 50
  const totalItems = filtered.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const start = (page - 1) * pageSize
  const data = filtered.slice(start, start + pageSize)

  return { data, pagination: { page, pageSize, totalItems, totalPages } }
}

export async function fetchSkus(params: SkuListParams): Promise<PaginationEnvelope<Sku>> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200))
    return filterAndSort(params)
  }

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') searchParams.set(key, String(value))
  }
  const res = await fetch(`/api/v1/skus?${searchParams}`)
  if (!res.ok) throw new Error(`Failed to fetch SKUs: ${res.status}`)
  return res.json()
}

export async function fetchSku(skuId: string): Promise<Sku> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 150))
    const sku = MOCK_SKUS.find((s) => s.id === skuId)
    if (!sku) throw new Error('SKU not found')
    return sku
  }

  const res = await fetch(`/api/v1/skus/${skuId}`)
  if (!res.ok) throw new Error(`Failed to fetch SKU: ${res.status}`)
  return res.json()
}

export async function createSku(payload: SkuCreatePayload): Promise<Sku> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300))
    const newSku: Sku = {
      id: crypto.randomUUID(),
      skuCode: `${payload.department.slice(0, 3)}-${payload.brand.slice(0, 3).toUpperCase()}-${payload.color.slice(0, 3).toUpperCase()}-${payload.size}-${String(MOCK_SKUS.length + 1).padStart(3, '0')}`,
      ...payload,
      barcode: payload.barcode ?? null,
      description: payload.description ?? null,
      active: payload.active ?? true,
      currentStock: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    MOCK_SKUS.unshift(newSku)
    return newSku
  }

  const res = await fetch('/api/v1/skus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 409) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? 'Duplicate barcode')
  }
  if (!res.ok) throw new Error(`Failed to create SKU: ${res.status}`)
  return res.json()
}

export async function updateSku(skuId: string, payload: SkuUpdatePayload): Promise<Sku> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200))
    const sku = MOCK_SKUS.find((s) => s.id === skuId)
    if (!sku) throw new Error('SKU not found')
    Object.assign(sku, payload, { updatedAt: new Date().toISOString() })
    return sku
  }

  const res = await fetch(`/api/v1/skus/${skuId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 409) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? 'Duplicate barcode')
  }
  if (!res.ok) throw new Error(`Failed to update SKU: ${res.status}`)
  return res.json()
}

const MOCK_VENDORS: Vendor[] = [
  { id: 'v-001', name: 'Calzados Elegante S.A.' },
  { id: 'v-002', name: 'Distribuidora Norte' },
  { id: 'v-003', name: 'ImportShoes LLC' },
  { id: 'v-004', name: 'Footwear Global Corp' },
  { id: 'v-005', name: 'Zapatos del Sur' },
  { id: 'v-006', name: 'Premium Leather Co.' },
  { id: 'v-007', name: 'Urban Sole Distributors' },
  { id: 'v-008', name: 'Classic Footwear Ltd.' },
]

export async function fetchVendors(): Promise<Vendor[]> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 100))
    return MOCK_VENDORS
  }

  const res = await fetch('/api/v1/vendors')
  if (!res.ok) throw new Error(`Failed to fetch vendors: ${res.status}`)
  const body = await res.json()
  return Array.isArray(body) ? body : body.data
}

export async function deactivateSku(skuId: string): Promise<void> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 150))
    const sku = MOCK_SKUS.find((s) => s.id === skuId)
    if (sku) sku.active = false
    return
  }

  const res = await fetch(`/api/v1/skus/${skuId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to deactivate SKU: ${res.status}`)
}
