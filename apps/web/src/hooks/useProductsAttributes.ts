import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { productsAttributesApi } from '../services/productsAttributesApi'
import type { SetSkuAttributesInput } from '../types/productsAttributes'

const CATALOG_STALE_MS = 5 * 60 * 1000

export function useAttributeDimensions(withCounts = false) {
  return useQuery({
    queryKey: ['products-attributes', 'dimensions', { withCounts }],
    queryFn: () => productsAttributesApi.listDimensions(withCounts),
    staleTime: CATALOG_STALE_MS,
  })
}

export function useSkuAttributes(code: string | undefined) {
  return useQuery({
    queryKey: ['products-attributes', 'sku', code],
    queryFn: () => productsAttributesApi.getForSku(code!),
    enabled: !!code,
    staleTime: CATALOG_STALE_MS,
  })
}

export function useSetSkuAttributes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, input }: { code: string; input: SetSkuAttributesInput }) =>
      productsAttributesApi.setForSku(code, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['products-attributes', 'sku', vars.code] })
      qc.invalidateQueries({ queryKey: ['products-attributes', 'dimensions'] })
      qc.invalidateQueries({ queryKey: ['products-skus'] })
    },
  })
}

export function useAttributeCoverage() {
  return useQuery({
    queryKey: ['products-attributes', 'coverage'],
    queryFn: () => productsAttributesApi.coverage(),
    staleTime: CATALOG_STALE_MS,
  })
}
