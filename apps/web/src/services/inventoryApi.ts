import type { Department } from '../types/sku'
import type { DepartmentSummary, LowStockResponse } from '../types/inventory'
import { MOCK_SKUS } from '../mock/skuData'

const USE_MOCK = true

const DEPARTMENTS: Department[] = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT']
const LOCATIONS = ['Almacen Principal', 'Tienda Centro', 'Tienda Norte', 'Tienda Sur', 'Bodega']

function buildMockSummary(): DepartmentSummary[] {
  return DEPARTMENTS.map((dept) => {
    const deptSkus = MOCK_SKUS.filter((s) => s.department === dept && s.active)
    const totalUnits = deptSkus.reduce((sum, s) => sum + (s.currentStock ?? 0), 0)
    const totalValue = deptSkus.reduce((sum, s) => sum + s.price * (s.currentStock ?? 0), 0)
    return {
      department: dept,
      totalSkus: deptSkus.length,
      totalUnits,
      totalValue: Math.round(totalValue * 100) / 100,
      averagePrice: deptSkus.length > 0
        ? Math.round((deptSkus.reduce((s, sk) => s + sk.price, 0) / deptSkus.length) * 100) / 100
        : 0,
    }
  })
}

function buildMockLowStock(threshold: number, page: number, pageSize: number): LowStockResponse {
  const lowStock = MOCK_SKUS
    .filter((s) => s.active && (s.currentStock ?? 0) <= threshold && (s.currentStock ?? 0) >= 0)
    .sort((a, b) => (a.currentStock ?? 0) - (b.currentStock ?? 0))
    .map((s) => ({
      id: s.id,
      skuCode: s.skuCode,
      brand: s.brand,
      style: s.style,
      color: s.color,
      size: s.size,
      department: s.department,
      currentStock: s.currentStock ?? 0,
      location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
    }))

  const totalItems = lowStock.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const start = (page - 1) * pageSize
  return {
    data: lowStock.slice(start, start + pageSize),
    pagination: { page, pageSize, totalItems, totalPages },
  }
}

export async function fetchInventorySummary(): Promise<DepartmentSummary[]> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200))
    return buildMockSummary()
  }

  const res = await fetch('/api/v1/inventory/summary?groupBy=department')
  if (!res.ok) throw new Error(`Failed to fetch inventory summary: ${res.status}`)
  return res.json()
}

export async function fetchLowStock(
  threshold: number,
  page = 1,
  pageSize = 25,
): Promise<LowStockResponse> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 150))
    return buildMockLowStock(threshold, page, pageSize)
  }

  const params = new URLSearchParams({
    threshold: String(threshold),
    page: String(page),
    pageSize: String(pageSize),
  })
  const res = await fetch(`/api/v1/inventory/low-stock?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch low-stock items: ${res.status}`)
  return res.json()
}
