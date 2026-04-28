import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  assignStoreChain,
  createStoreChain,
  fetchStoreById,
  fetchStoreChains,
  fetchStores,
  updateStoreChain,
} from '../services/storeApi'

export function useStores() {
  return useQuery({
    queryKey: ['stores'],
    queryFn: fetchStores,
    staleTime: 5 * 60_000,
  })
}

export function useStore(id: number | null) {
  return useQuery({
    queryKey: ['stores', 'detail', id],
    queryFn: () => fetchStoreById(id!),
    enabled: id != null,
    staleTime: 5 * 60_000,
  })
}

export function useStoreChains() {
  return useQuery({
    queryKey: ['store-chains'],
    queryFn: fetchStoreChains,
    staleTime: 5 * 60_000,
  })
}

export function useAssignStoreChain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ storeId, chainId }: { storeId: number; chainId: string | null }) =>
      assignStoreChain(storeId, chainId),
    onSuccess: (_store, variables) => {
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['stores', 'detail', variables.storeId] })
      qc.invalidateQueries({ queryKey: ['store-chains'] })
    },
  })
}

export function useCreateStoreChain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createStoreChain,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-chains'] })
    },
  })
}

export function useUpdateStoreChain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { label?: string; active?: boolean; sortOrder?: number } }) =>
      updateStoreChain(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['store-chains'] })
    },
  })
}
