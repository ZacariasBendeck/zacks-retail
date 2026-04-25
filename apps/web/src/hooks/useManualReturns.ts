import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createManualReturn,
  fetchManualReturn,
  fetchManualReturnContext,
  fetchManualReturns,
  fetchManualReturnStores,
} from '../services/manualReturnApi'
import type {
  CreateManualReturnPayload,
  ManualReturnContextQuery,
  ManualReturnListParams,
} from '../types/manualReturn'

export function useManualReturnStores() {
  return useQuery({
    queryKey: ['manual-returns', 'stores'],
    queryFn: fetchManualReturnStores,
    staleTime: 5 * 60 * 1000,
  })
}

export function useManualReturns(params: ManualReturnListParams) {
  return useQuery({
    queryKey: ['manual-returns', params],
    queryFn: () => fetchManualReturns(params),
    placeholderData: (prev) => prev,
  })
}

export function useManualReturn(id: string | undefined) {
  return useQuery({
    queryKey: ['manual-returns', 'detail', id],
    queryFn: () => fetchManualReturn(id!),
    enabled: !!id,
  })
}

export function useManualReturnContext() {
  return useMutation({
    mutationFn: (query: ManualReturnContextQuery) => fetchManualReturnContext(query),
  })
}

export function useCreateManualReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateManualReturnPayload) => createManualReturn(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manual-returns'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
    },
  })
}
