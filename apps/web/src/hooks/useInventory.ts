import { useQuery } from '@tanstack/react-query'
import { fetchInventorySummary, fetchLowStock, fetchDashboardKpis } from '../services/inventoryApi'

const REFRESH_INTERVAL = 60_000 // 60s auto-refresh

export function useDashboardKpis() {
  return useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: fetchDashboardKpis,
    refetchInterval: REFRESH_INTERVAL,
  })
}

export function useInventorySummary() {
  return useQuery({
    queryKey: ['inventory-summary'],
    queryFn: fetchInventorySummary,
    refetchInterval: REFRESH_INTERVAL,
  })
}

export function useLowStock(threshold: number, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ['low-stock', threshold, page, pageSize],
    queryFn: () => fetchLowStock(threshold, page, pageSize),
    placeholderData: (prev) => prev,
    refetchInterval: REFRESH_INTERVAL,
  })
}
