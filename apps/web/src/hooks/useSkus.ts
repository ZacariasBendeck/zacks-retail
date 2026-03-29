import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchSkus, fetchSku, createSku, updateSku, deactivateSku, fetchVendors, analyzeImage, fetchAllReferenceData, lookupSkuByCode, searchSkus } from '../services/skuApi'
import type { SkuListParams, SkuCreatePayload, SkuUpdatePayload } from '../types/sku'

export function useSkus(params: SkuListParams) {
  return useQuery({
    queryKey: ['skus', params],
    queryFn: () => fetchSkus(params),
    placeholderData: (prev) => prev,
  })
}

export function useSku(skuId: string | undefined) {
  return useQuery({
    queryKey: ['sku', skuId],
    queryFn: () => fetchSku(skuId!),
    enabled: !!skuId,
  })
}

export function useCreateSku() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: SkuCreatePayload) => createSku(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skus'] })
    },
  })
}

export function useUpdateSku() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ skuId, payload }: { skuId: string; payload: SkuUpdatePayload }) =>
      updateSku(skuId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['skus'] })
      queryClient.invalidateQueries({ queryKey: ['sku', variables.skuId] })
    },
  })
}

export function useDeactivateSku() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deactivateSku,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skus'] })
    },
  })
}

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: fetchVendors,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAnalyzeImage() {
  return useMutation({
    mutationFn: analyzeImage,
  })
}

export function useReferenceData() {
  return useQuery({
    queryKey: ['referenceData'],
    queryFn: fetchAllReferenceData,
    staleTime: 10 * 60 * 1000,
  })
}

export function useLookupSku() {
  return useMutation({
    mutationFn: (code: string) => lookupSkuByCode(code),
  })
}

export function useSearchSkus(query: string) {
  return useQuery({
    queryKey: ['skus', 'search', query],
    queryFn: () => searchSkus(query),
    enabled: query.trim().length >= 1,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })
}
