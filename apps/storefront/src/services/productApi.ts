import type { Product, ProductListParams, ProductListResponse } from '@/types/product'
import { mockFetchProducts, mockFetchProduct } from './mockData'

const USE_MOCK = true

export async function fetchProducts(params: ProductListParams): Promise<ProductListResponse> {
  if (USE_MOCK) {
    return Promise.resolve(mockFetchProducts(params))
  }
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue
    if (Array.isArray(value)) {
      for (const v of value) searchParams.append(key, String(v))
    } else {
      searchParams.set(key, String(value))
    }
  }
  const res = await fetch(`/api/public/products?${searchParams}`)
  if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`)
  return res.json()
}

export async function fetchProduct(id: number): Promise<Product> {
  if (USE_MOCK) {
    const product = mockFetchProduct(id)
    if (!product) throw new Error('Product not found')
    return Promise.resolve(product)
  }
  const res = await fetch(`/api/public/products/${id}`)
  if (!res.ok) throw new Error(`Failed to fetch product: ${res.status}`)
  return res.json()
}
