// Minimal SKU shape the cashier UI needs — enough to render search results.
// Mirrors the camelCase fields returned by GET /api/v1/skus.

export type Department = 'FORMAL' | 'CASUAL' | 'FIESTA' | 'SANDALIAS' | 'BOOTS' | 'COMFORT'

export interface Sku {
  id: string
  skuCode: string
  style: string
  price: number
  department: Department
  barcode: string | null
  currentStock?: number
}

export interface PaginationEnvelope<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export interface SkuSearchParams {
  q?: string
  page?: number
  pageSize?: number
}
