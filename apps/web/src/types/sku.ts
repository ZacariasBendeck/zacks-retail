export type Department = 'FORMAL' | 'CASUAL' | 'FIESTA' | 'SANDALIAS' | 'BOOTS' | 'COMFORT'

export interface Sku {
  id: string
  skuCode: string
  brand: string
  style: string
  color: string
  size: string
  price: number
  category: number
  department: Department
  vendorId: string
  barcode: string | null
  description: string | null
  active: boolean
  currentStock?: number
  createdAt: string
  updatedAt: string
}

export interface SkuListParams {
  page?: number
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  brand?: string
  department?: Department
  category?: number
  vendorId?: string
  active?: boolean
  q?: string
  minPrice?: number
  maxPrice?: number
  size?: string
}

export interface SkuCreatePayload {
  brand: string
  style: string
  color: string
  size: string
  price: number
  category: number
  department: Department
  vendorId: string
  barcode?: string | null
  description?: string | null
  active?: boolean
}

export type SkuUpdatePayload = Partial<SkuCreatePayload>

export interface ImageAnalysisResult {
  shoe_type: string | null
  heel_height: string | null
  heel_shape: string | null
  toe_shape: string | null
  color_family: string | null
  upper_material: string | null
  finish: string | null
  pattern: string | null
  occasion: string | null
  department: string | null
  color: string | null
  description: string | null
}

export interface Vendor {
  id: string
  name: string
  contactEmail?: string | null
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
