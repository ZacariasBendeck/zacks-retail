import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchReplenishmentTarget,
  updateReplenishmentTargetStore,
} from '../services/replenishmentTargetApi'
import type { UpdateReplenishmentTargetPayload } from '../types/replenishmentTarget'

export function useReplenishmentTarget(skuCode: string | null) {
  return useQuery({
    queryKey: ['replenishment-targets', skuCode],
    queryFn: () => fetchReplenishmentTarget(skuCode as string),
    enabled: !!skuCode,
    staleTime: 60_000,
  })
}

export function useUpdateReplenishmentTargetStore() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      skuCode,
      storeId,
      payload,
    }: {
      skuCode: string
      storeId: number
      payload: UpdateReplenishmentTargetPayload
    }) => updateReplenishmentTargetStore(skuCode, storeId, payload),
    onSuccess: (record) => {
      queryClient.setQueryData(['replenishment-targets', record.skuCode], record)
      queryClient.invalidateQueries({ queryKey: ['replenishment-targets'] })
      queryClient.invalidateQueries({ queryKey: ['rics-inv-inquiry'] })
    },
  })
}
