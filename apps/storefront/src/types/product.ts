export interface Product {
  id: number
  sku_number: string
  brand: string
  name: string
  price: number
  original_price?: number
  rating: number
  review_count: number
  image_url: string
  images: string[]
  colors: ProductColor[]
  sizes: string[]
  category: string
  category_path: string[]
  department: string
  material?: string
  style?: string
  description?: string
  web_description?: string
  specifications?: Record<string, string>
}

export interface ProductColor {
  id: number
  name: string
  code: string
  hex?: string
  swatch_url?: string
}

export interface FacetValue {
  value: string
  label: string
  count: number
}

export interface Facets {
  brands: FacetValue[]
  sizes: FacetValue[]
  colors: FacetValue[]
  price_ranges: FacetValue[]
  categories: FacetValue[]
  materials: FacetValue[]
  styles: FacetValue[]
}

export interface ProductListParams {
  page?: number
  pageSize?: number
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'rating'
  q?: string
  category?: string
  brand?: string[]
  size?: string[]
  color?: string[]
  price_min?: number
  price_max?: number
  material?: string[]
  style?: string[]
}

export interface ProductListResponse {
  data: Product[]
  facets: Facets
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}
