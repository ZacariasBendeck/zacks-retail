import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  commitBalancingTransferRunV2,
  createBalancingTransferRunV2,
  fetchBalancingTransferRunPreviewV2,
} from '../services/transferRunApiV2'
import type { CreateBalancingTransferRunV2Payload } from '../types/transferRunsV2'

export function useBalancingTransferRunPreviewV2(id: string | undefined) {
  return useQuery({
    queryKey: ['balancing-transfer-run-v2', id],
    queryFn: () => fetchBalancingTransferRunPreviewV2(id!),
    enabled: !!id,
  })
}

export function useCreateBalancingTransferRunV2() {
  return useMutation({
    mutationFn: (payload: CreateBalancingTransferRunV2Payload) => createBalancingTransferRunV2(payload),
  })
}

export function useCommitBalancingTransferRunV2() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => commitBalancingTransferRunV2(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ['balancing-transfer-run-v2', id] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })
      queryClient.invalidateQueries({ queryKey: ['manual-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['manual-returns'] })
    },
  })
}
