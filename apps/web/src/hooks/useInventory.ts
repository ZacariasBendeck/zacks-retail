import { useQuery } from '@tanstack/react-query'
import { fetchInventorySummary, fetchLowStock } from '../services/inventoryApi'

export function useInventorySummary() {
  return useQuery({
    queryKey: ['inventory-summary'],
    queryFn: fetchInventorySummary,
  })
}

export function useLowStock(threshold: number, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ['low-stock', threshold, page, pageSize],
    queryFn: () => fetchLowStock(threshold, page, pageSize),
    placeholderData: (prev) => prev,
  })
}
