import type { Department } from './sku'

export interface DepartmentSummary {
  department: Department
  totalSkus: number
  totalUnits: number
  totalValue: number
  averagePrice: number
  salesThisMonth: number
  turnoverRate: number
}

export interface DashboardKpis {
  totalOnHandUnits: number
  totalOnHandValue: number
  salesThisMonth: number
  averageTurnover: number
  openPoCount: number
}

export interface LowStockItem {
  id: string
  skuCode: string
  brand: string | null
  style: string
  color: string | null
  department: Department
  currentStock: number
  location?: string
}

export interface LowStockResponse {
  data: LowStockItem[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export type InventoryBalanceSortField = 'quantityOnHand' | 'updatedAt' | 'skuCode' | 'department'

export interface InventoryBalanceListParams {
  limit?: number
  cursor?: string
  sort?: InventoryBalanceSortField
  order?: 'asc' | 'desc'
  department?: Department
  brandId?: number
  categoryId?: number
  active?: boolean
  q?: string
}

export interface InventoryBalanceRow {
  inventoryId: string
  skuId: string
  skuCode: string
  style: string
  department: Department
  brandId: number | null
  brandName: string | null
  categoryId: number | null
  quantityOnHand: number
  quantityReserved: number
  quantityAvailable: number
  version: number
  updatedAt: string
}

export interface CursorEnvelope<T> {
  data: T[]
  nextCursor: string | null
  limit: number
  appliedSort: {
    field: string
    order: string
  }
  appliedFilters: Record<string, string | number | boolean>
}
