import { useQuery } from '@tanstack/react-query'
import { fetchSalesLedger } from '../services/salesLedgerApi'
import type { SalesLedgerParams } from '../types/salesLedger'

export function useSalesLedger(params: SalesLedgerParams | null, runId: number | null) {
  return useQuery({
    queryKey: ['sales-ledger', runId, params],
    queryFn: () => fetchSalesLedger(params as SalesLedgerParams),
    enabled: params != null && runId != null,
    placeholderData: (prev) => prev,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
