import type { ProductDetail, ProductListParams, ProductListResponse, Facets } from '@/types/product'

export async function fetchProducts(params: ProductListParams): Promise<ProductListResponse> {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue
    searchParams.set(key, String(value))
  }
  const res = await fetch(`/api/public/products?${searchParams}`)
  if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`)
  return res.json()
}

export async function fetchProduct(id: string): Promise<ProductDetail> {
  const res = await fetch(`/api/public/products/${id}`)
  if (!res.ok) throw new Error(`Failed to fetch product: ${res.status}`)
  return res.json()
}

export async function fetchFacets(params?: Pick<ProductListParams, 'q' | 'categoryId' | 'department' | 'brandId' | 'colorId' | 'minPrice' | 'maxPrice'>): Promise<Facets> {
  const searchParams = new URLSearchParams()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === '') continue
      searchParams.set(key, String(value))
    }
  }
  const res = await fetch(`/api/public/products/facets?${searchParams}`)
  if (!res.ok) throw new Error(`Failed to fetch facets: ${res.status}`)
  return res.json()
}
