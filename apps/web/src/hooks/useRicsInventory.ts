import { useQuery } from '@tanstack/react-query'
import {
  fetchInventoryInquiry,
  fetchFindBySize,
  fetchInventoryDetailReport,
  fetchChangeDetail,
  fetchTransferSummary,
  fetchRecommendedTransfers,
  fetchSkuStoreRollup,
  fetchSkuStoreCellRollup,
  type InventoryDetailReportParams,
  type ChangeDetailParams,
  type TransferSummaryParams,
  type RecommendedTransferParams,
  type SkuStoreRollupParams,
} from '../services/ricsInventoryApi'

// PowerShell+OLEDB spawns are slow but results are stable within a session;
// the server caches dimension tables for 5 min, so the same stale-time here
// lines up with when we'd actually pick up new data.
const STALE_TIME = 60_000

export function useInventoryInquiry(sku: string | null) {
  return useQuery({
    queryKey: ['rics-inv-inquiry', sku],
    queryFn: () => fetchInventoryInquiry(sku as string),
    enabled: !!sku,
    staleTime: STALE_TIME,
  })
}

export function useFindBySize(sku: string | null, size: string | null) {
  return useQuery({
    queryKey: ['rics-inv-find-by-size', sku, size],
    queryFn: () => fetchFindBySize(sku as string, size as string),
    enabled: !!sku && !!size,
    staleTime: STALE_TIME,
  })
}

export function useInventoryDetailReport(
  params: InventoryDetailReportParams | null,
) {
  return useQuery({
    queryKey: ['rics-inv-detail-report', params],
    queryFn: () => fetchInventoryDetailReport(params as InventoryDetailReportParams),
    enabled: !!params,
    staleTime: STALE_TIME,
  })
}

export function useChangeDetail(params: ChangeDetailParams | null) {
  return useQuery({
    queryKey: ['rics-inv-change-detail', params],
    queryFn: () => fetchChangeDetail(params as ChangeDetailParams),
    enabled: !!params,
    staleTime: STALE_TIME,
    retry: false, // a too-broad 400 shouldn't retry
  })
}

export function useTransferSummary(params: TransferSummaryParams | null) {
  return useQuery({
    queryKey: ['rics-inv-transfer-summary', params],
    queryFn: () => fetchTransferSummary(params as TransferSummaryParams),
    enabled: !!params,
    staleTime: STALE_TIME,
    retry: false,
  })
}

// Heavy scans — a single run can span minutes of PowerShell-OLEDB round-trips.
// Hold the result indefinitely within the session; never auto-refetch on focus,
// reconnect, or mount. The operator re-runs explicitly by submitting the form.
const HEAVY_SCAN_OPTS = {
  staleTime: Infinity,
  gcTime: 30 * 60 * 1000, // keep in cache 30 min even after no observers
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
  retry: false,
} as const

export function useRecommendedTransfers(params: RecommendedTransferParams | null) {
  return useQuery({
    queryKey: ['rics-inv-recommended-transfers', params],
    queryFn: () => fetchRecommendedTransfers(params as RecommendedTransferParams),
    enabled: !!params,
    ...HEAVY_SCAN_OPTS,
  })
}

export function useSkuStoreRollup(params: SkuStoreRollupParams | null) {
  return useQuery({
    queryKey: ['rics-inv-sku-store-rollup', params],
    queryFn: () => fetchSkuStoreRollup(params as SkuStoreRollupParams),
    enabled: !!params,
    ...HEAVY_SCAN_OPTS,
  })
}

export function useSkuStoreCellRollup(params: SkuStoreRollupParams | null) {
  return useQuery({
    queryKey: ['rics-inv-sku-store-cell-rollup', params],
    queryFn: () => fetchSkuStoreCellRollup(params as SkuStoreRollupParams),
    enabled: !!params,
    ...HEAVY_SCAN_OPTS,
  })
}
