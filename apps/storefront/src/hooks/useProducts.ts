import { useQuery } from '@tanstack/react-query'
import { fetchProducts, fetchProduct } from '@/services/productApi'
import type { ProductListParams } from '@/types/product'

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => fetchProducts(params),
    placeholderData: (prev) => prev,
  })
}

export function useProduct(id: number) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(id),
    enabled: id > 0,
  })
}
