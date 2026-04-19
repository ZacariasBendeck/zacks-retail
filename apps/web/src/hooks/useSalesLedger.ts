import { useQuery } from '@tanstack/react-query'
import { fetchSalesLedger } from '../services/salesLedgerApi'
import type { SalesLedgerParams } from '../types/salesLedger'

export function useSalesLedger(params: SalesLedgerParams) {
  return useQuery({
    queryKey: ['sales-ledger', params],
    queryFn: () => fetchSalesLedger(params),
    placeholderData: (prev) => prev,
  })
}
