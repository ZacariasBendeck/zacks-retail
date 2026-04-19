import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { productsSkuApi } from '../services/productsSkuApi'
import type { SkuInput, SkuListFilters } from '../types/productsSku'

// SKU list over Access is the most expensive read in the admin (~25k rows +
// PowerShell spawn). Keep cached for 10 min; mutations invalidate.
const LIST_STALE_MS = 10 * 60 * 1000

export function useProductsSkus(filter?: SkuListFilters) {
  return useQuery({
    queryKey: ['products-skus', 'list', filter ?? {}],
    queryFn: () => productsSkuApi.list(filter),
    staleTime: LIST_STALE_MS,
  })
}

export function useProductsSku(code: string | undefined) {
  return useQuery({
    queryKey: ['products-skus', 'detail', code],
    queryFn: () => productsSkuApi.get(code!),
    enabled: !!code,
    staleTime: LIST_STALE_MS,
  })
}

export function useCreateProductsSku() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SkuInput) => productsSkuApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products-skus'] }),
  })
}

export function useUpdateProductsSku() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: Partial<Omit<SkuInput, 'code'>> }) =>
      productsSkuApi.update(code, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products-skus'] }),
  })
}

export function useDeleteProductsSku() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => productsSkuApi.remove(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products-skus'] }),
  })
}
