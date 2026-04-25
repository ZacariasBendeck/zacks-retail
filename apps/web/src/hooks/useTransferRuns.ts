import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  commitAutoTransferRun,
  commitBalancingTransferRun,
  createAutoTransferRun,
  createBalancingTransferRun,
  fetchAutoTransferRunPreview,
  fetchBalancingTransferRunPreview,
  fetchTransferStores,
} from '../services/transferRunApi'
import type {
  CreateAutoTransferRunPayload,
  CreateBalancingTransferRunPayload,
} from '../types/transferRuns'

export function useTransferStores() {
  return useQuery({
    queryKey: ['transfer-stores'],
    queryFn: fetchTransferStores,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAutoTransferRunPreview(id: string | undefined) {
  return useQuery({
    queryKey: ['auto-transfer-run', id],
    queryFn: () => fetchAutoTransferRunPreview(id!),
    enabled: !!id,
  })
}

export function useCreateAutoTransferRun() {
  return useMutation({
    mutationFn: (payload: CreateAutoTransferRunPayload) => createAutoTransferRun(payload),
  })
}

export function useCommitAutoTransferRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => commitAutoTransferRun(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ['auto-transfer-run', id] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })
      queryClient.invalidateQueries({ queryKey: ['manual-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['manual-returns'] })
    },
  })
}

export function useBalancingTransferRunPreview(id: string | undefined) {
  return useQuery({
    queryKey: ['balancing-transfer-run', id],
    queryFn: () => fetchBalancingTransferRunPreview(id!),
    enabled: !!id,
  })
}

export function useCreateBalancingTransferRun() {
  return useMutation({
    mutationFn: (payload: CreateBalancingTransferRunPayload) => createBalancingTransferRun(payload),
  })
}

export function useCommitBalancingTransferRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => commitBalancingTransferRun(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ['balancing-transfer-run', id] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })
      queryClient.invalidateQueries({ queryKey: ['manual-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['manual-returns'] })
    },
  })
}
