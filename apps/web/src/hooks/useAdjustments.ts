import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchLocations,
  fetchAdjustments,
  fetchAdjustment,
  createAdjustment,
} from '../services/adjustmentApi'
import type { AdjustmentListParams, CreateAdjustmentPayload } from '../types/adjustment'

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: fetchLocations,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdjustments(params: AdjustmentListParams) {
  return useQuery({
    queryKey: ['adjustments', params],
    queryFn: () => fetchAdjustments(params),
    placeholderData: (prev) => prev,
  })
}

export function useAdjustment(id: string | undefined) {
  return useQuery({
    queryKey: ['adjustment', id],
    queryFn: () => fetchAdjustment(id!),
    enabled: !!id,
  })
}

export function useCreateAdjustment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateAdjustmentPayload) => createAdjustment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
    },
  })
}
