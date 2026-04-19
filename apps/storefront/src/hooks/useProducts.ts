import { useQuery } from '@tanstack/react-query'
import { fetchProducts, fetchProduct, fetchFacets } from '@/services/productApi'
import type { ProductListParams } from '@/types/product'

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => fetchProducts(params),
    placeholderData: (prev) => prev,
  })
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(id),
    enabled: !!id,
  })
}

export function useFacets(params?: Parameters<typeof fetchFacets>[0]) {
  return useQuery({
    queryKey: ['facets', params],
    queryFn: () => fetchFacets(params),
    placeholderData: (prev) => prev,
  })
}
