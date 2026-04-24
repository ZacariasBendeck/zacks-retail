import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createManualReceipt,
  fetchManualReceipt,
  fetchManualReceiptContext,
  fetchManualReceipts,
  fetchManualReceiptStores,
} from '../services/manualReceiptApi'
import type {
  CreateManualReceiptPayload,
  ManualReceiptContextQuery,
  ManualReceiptListParams,
} from '../types/manualReceipt'

export function useManualReceiptStores() {
  return useQuery({
    queryKey: ['manual-receipts', 'stores'],
    queryFn: fetchManualReceiptStores,
    staleTime: 5 * 60 * 1000,
  })
}

export function useManualReceipts(params: ManualReceiptListParams) {
  return useQuery({
    queryKey: ['manual-receipts', params],
    queryFn: () => fetchManualReceipts(params),
    placeholderData: (prev) => prev,
  })
}

export function useManualReceipt(id: string | undefined) {
  return useQuery({
    queryKey: ['manual-receipts', 'detail', id],
    queryFn: () => fetchManualReceipt(id!),
    enabled: !!id,
  })
}

export function useManualReceiptContext() {
  return useMutation({
    mutationFn: (query: ManualReceiptContextQuery) => fetchManualReceiptContext(query),
  })
}

export function useCreateManualReceipt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateManualReceiptPayload) => createManualReceipt(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manual-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
    },
  })
}
