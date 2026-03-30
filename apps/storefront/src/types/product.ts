// Types aligned with the real public product API responses

export interface ProductCard {
  id: string
  name: string
  brand: string | null
  price: number
  mainImage: string | null
  rating: number | null
  colorSwatches: ColorSwatch[]
  department: string
  style: string
}

export interface ColorSwatch {
  colorId: number
  name: string
  code: string
}

export interface ProductDetail {
  id: string
  skuCode: string
  name: string
  brand: string | null
  price: number
  department: string
  style: string
  description: string | null
  material: string | null
  heelType: string | null
  mainImage: string | null
  rating: number | null
  category: string | null
  color: string | null
  availableSizes: { id: string; label: string; inStock: boolean }[]
  availableColors: ColorSwatch[]
  specs: Record<string, string | null>
}

export interface Facets {
  brands: { id: number; name: string; count: number }[]
  colors: { id: number; name: string; count: number }[]
  sizes: { label: string; count: number }[]
  categories: { id: number; name: string; count: number }[]
  departments: { name: string; count: number }[]
  materials: { name: string; count: number }[]
  priceRange: { min: number; max: number }
}

export interface ProductListParams {
  page?: number
  limit?: number
  sort?: 'price' | 'newest' | 'name'
  order?: 'asc' | 'desc'
  q?: string
  categoryId?: number
  department?: string
  brandId?: number
  colorId?: number
  sizeLabel?: string
  minPrice?: number
  maxPrice?: number
  materialId?: number
  shoeTypeId?: number
}

export interface ProductListResponse {
  data: ProductCard[]
  pagination: {
    page: number
    limit: number
    totalItems: number
    totalPages: number
  }
}
