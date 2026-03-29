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
  brand: string
  style: string
  color: string
  size: string
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
