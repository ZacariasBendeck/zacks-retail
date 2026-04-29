import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchOnHandByDepartment,
  fetchOnHandDrillDown,
  fetchSalesPerformanceByDepartment,
  fetchSalesPerformanceDrillDown,
  fetchTurnoverByDepartment,
  fetchTurnoverDrillDown,
  fetchAgingByDepartment,
  fetchAgingDrillDown,
  fetchAgingDimensions,
  fetchSellThroughByDepartment,
  fetchSellThroughDrillDown,
  fetchSalesByDay,
  fetchSalesByTime,
  fetchSalesBySku,
  fetchSalespersonSummary,
  fetchBestSellers,
  fetchSalesAnalysis,
  fetchSalesHierarchy,
  fetchSalesPivot,
  fetchStockStatus,
  fetchSalesDimensions,
  fetchSalesHistoryByMonth,
  fetchPurchaseOrderReport,
  fetchOpenPoByMonth,
  fetchPoCashProjection,
  type ReportDetailQuery,
  type SalesBySkuSortBy,
  type SalespersonSubtotalBy,
  type BestSellersDimension,
  type BestSellersMetric,
  type BestSellersPeriodFlag,
  type SalesAnalysisDimension,
  type SalesAnalysisReportType,
  type SalesAnalysisStoreOption,
  type SalesHierarchyStoreOption,
  type StockStatusSortBy,
  type StockStatusStoreOption,
  type StockStatusItemFilter,
  type SalesHistoryByMonthParams,
  type AgingQueryArgs,
  type PurchaseOrderReportQuery,
  type OpenPoByMonthQuery,
} from '../services/reportApi'

export function useOnHandByDepartment() {
  return useQuery({
    queryKey: ['report-on-hand-departments'],
    queryFn: fetchOnHandByDepartment,
  })
}

export function useOnHandDrillDown(
  department: string,
  category?: number,
  query?: ReportDetailQuery,
) {
  return useQuery({
    queryKey: ['report-on-hand-drilldown', department, category, query],
    queryFn: () => fetchOnHandDrillDown(department, category, query),
    enabled: !!department,
  })
}

export function useSalesPerformanceByDepartment(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['report-sales-departments', startDate, endDate],
    queryFn: () => fetchSalesPerformanceByDepartment(startDate, endDate),
    enabled: !!startDate && !!endDate,
  })
}

export function useSalesPerformanceDrillDown(
  startDate: string,
  endDate: string,
  department: string,
  category?: number,
  query?: ReportDetailQuery,
) {
  return useQuery({
    queryKey: ['report-sales-drilldown', startDate, endDate, department, category, query],
    queryFn: () => fetchSalesPerformanceDrillDown(startDate, endDate, department, category, query),
    enabled: !!startDate && !!endDate && !!department,
  })
}

export function useTurnoverByDepartment(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['report-turnover-departments', startDate, endDate],
    queryFn: () => fetchTurnoverByDepartment(startDate, endDate),
  })
}

export function useTurnoverDrillDown(
  department: string,
  startDate?: string,
  endDate?: string,
  category?: number,
  query?: ReportDetailQuery,
) {
  return useQuery({
    queryKey: ['report-turnover-drilldown', department, startDate, endDate, category, query],
    queryFn: () => fetchTurnoverDrillDown(department, startDate, endDate, category, query),
    enabled: !!department,
  })
}

export function useSellThroughByDepartment(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['report-sell-through-departments', startDate, endDate],
    queryFn: () => fetchSellThroughByDepartment(startDate, endDate),
  })
}

export function useSellThroughDrillDown(
  department: string,
  startDate?: string,
  endDate?: string,
  category?: number,
  query?: ReportDetailQuery,
) {
  return useQuery({
    queryKey: ['report-sell-through-drilldown', department, startDate, endDate, category, query],
    queryFn: () => fetchSellThroughDrillDown(department, startDate, endDate, category, query),
    enabled: !!department,
  })
}

export function useAgingByDepartment(args: AgingQueryArgs = {}) {
  return useQuery({
    queryKey: ['report-aging-departments', args],
    queryFn: () => fetchAgingByDepartment(args),
  })
}

export function useAgingDrillDown(
  groupKey: string,
  category?: number,
  args: AgingQueryArgs = {},
) {
  return useQuery({
    queryKey: ['report-aging-drilldown', groupKey, category, args],
    queryFn: () => fetchAgingDrillDown(groupKey, category, args),
    enabled: !!groupKey,
  })
}

export function useAgingDimensions() {
  return useQuery({
    queryKey: ['report-aging-dimensions'],
    queryFn: fetchAgingDimensions,
    staleTime: 5 * 60 * 1000,
  })
}

// Re-export so callers can keep importing AgingBucketScheme through the hook module.
export type { AgingBucketScheme } from '../services/reportApi'

// ─────────────────────────── Sales Reporting (RICS-backed) ────────────────
//
// Every hook:
//   (a) is gated by `enabled: !!args` — the page keeps `args` null until the
//       user clicks "Run Report".
//   (b) forwards TanStack Query's `signal` into `fetch`, so a `Stop` button
//       can call `queryClient.cancelQueries({ queryKey })` to abort mid-flight.

export type SalesByDayArgs = {
  storeNumbers: number[]
  startDate: string
  endDate: string
  comparisonOffsetDays?: number
  combineStores?: boolean
}
export function useSalesByDay(args: SalesByDayArgs | null) {
  return useQuery({
    queryKey: ['sales-by-day', args] as const,
    queryFn: ({ signal }) =>
      fetchSalesByDay(
        args!.storeNumbers,
        args!.startDate,
        args!.endDate,
        args!.comparisonOffsetDays ?? 364,
        args!.combineStores ?? false,
        signal,
      ),
    enabled: !!args,
  })
}

export type SalesByTimeArgs = {
  startDate: string
  endDate: string
  compareStartDate?: string
  compareEndDate?: string
  stores?: number[]
  pctOfTotal?: boolean
}
export function useSalesByTime(args: SalesByTimeArgs | null) {
  return useQuery({
    queryKey: ['sales-by-time', args] as const,
    queryFn: ({ signal }) => fetchSalesByTime({ ...args!, signal }),
    enabled: !!args,
  })
}

export type SalesBySkuArgs = {
  startDate: string
  endDate: string
  stores?: number[]
  sortBy?: SalesBySkuSortBy
  includeReturns?: boolean
  skus?: string[]
}
export function useSalesBySku(args: SalesBySkuArgs | null) {
  return useQuery({
    queryKey: ['sales-by-sku', args] as const,
    queryFn: ({ signal }) => fetchSalesBySku({ ...args!, signal }),
    enabled: !!args,
  })
}

export type SalespersonSummaryArgs = {
  startDate: string
  endDate: string
  stores?: number[]
  subtotalBy?: SalespersonSubtotalBy
  combineStores?: boolean
  cashierSummary?: boolean
}
export function useSalespersonSummary(args: SalespersonSummaryArgs | null) {
  return useQuery({
    queryKey: ['salesperson-summary', args] as const,
    queryFn: ({ signal }) => fetchSalespersonSummary({ ...args!, signal }),
    enabled: !!args,
  })
}

export type BestSellersArgs = {
  dimension: BestSellersDimension
  metric: BestSellersMetric
  period?: BestSellersPeriodFlag
  lastNMonths?: number
  stores?: number[]
  combineStores?: boolean
  topN?: number
}
export function useBestSellers(args: BestSellersArgs | null) {
  return useQuery({
    queryKey: ['best-sellers', args] as const,
    queryFn: ({ signal }) => fetchBestSellers({ ...args!, signal }),
    enabled: !!args,
  })
}

export type SalesAnalysisArgs = {
  dimension: SalesAnalysisDimension
  reportType: SalesAnalysisReportType
  storeOption?: SalesAnalysisStoreOption
  startDate?: string
  endDate?: string
  stores?: number[]
  categories?: number[]
  vendors?: string[]
  seasons?: string[]
  skus?: string[]
  styleColor?: string
  groups?: string[]
  keywords?: string[]
  storesRaw?: string
  categoriesRaw?: string
  vendorsRaw?: string
  seasonsRaw?: string
  skusRaw?: string
  groupsRaw?: string
  keywordsRaw?: string
  styleColorRaw?: string
  wtd?: boolean
  mtd?: boolean
  std?: boolean
  ytd?: boolean
  priorYear?: boolean
  /** Opt-in per-SKU attribute columns. ReportViewerPage sets this; the
   *  inline builder preview does not, to keep payloads small. */
  includeAttributes?: boolean
}
export function useSalesAnalysis(args: SalesAnalysisArgs | null) {
  return useQuery({
    queryKey: ['sales-analysis', args] as const,
    queryFn: ({ signal }) => fetchSalesAnalysis({ ...args!, signal }),
    enabled: !!args,
  })
}

export type SalesHierarchyArgs = {
  storeOption?: SalesHierarchyStoreOption
  startDate: string
  endDate: string
  stores?: number[]
  categories?: number[]
  vendors?: string[]
  seasons?: string[]
  skus?: string[]
  styleColor?: string
  groups?: string[]
  keywords?: string[]
  storesRaw?: string
  categoriesRaw?: string
  vendorsRaw?: string
  seasonsRaw?: string
  skusRaw?: string
  groupsRaw?: string
  keywordsRaw?: string
  styleColorRaw?: string
  priorYear?: boolean
  includeAttributes?: boolean
}
export function useSalesHierarchy(args: SalesHierarchyArgs | null) {
  return useQuery({
    queryKey: ['sales-hierarchy', args] as const,
    queryFn: ({ signal }) => fetchSalesHierarchy({ ...args!, signal }),
    enabled: !!args,
  })
}

export type SalesPivotArgs = {
  startDate: string
  endDate: string
  stores?: number[]
  variant: import('../services/reportApi').SalesPivotVariant
  levels?: import('../services/reportApi').SalesPivotLevels
  chains?: string[]
  sectors?: number[]
  departments?: number[]
  seasons?: string[]
  buyers?: string[]
}
export function useSalesPivot(args: SalesPivotArgs | null) {
  return useQuery({
    queryKey: ['sales-pivot', args] as const,
    queryFn: ({ signal }) => fetchSalesPivot({ ...args!, signal }),
    enabled: !!args,
  })
}

export type StockStatusArgs = {
  sortBy?: StockStatusSortBy
  storeOption?: StockStatusStoreOption
  itemFilter?: StockStatusItemFilter
  vendors?: string[]
  categories?: number[]
  seasons?: string[]
  skus?: string[]
}
export function useStockStatus(args: StockStatusArgs | null) {
  return useQuery({
    queryKey: ['stock-status', args] as const,
    queryFn: ({ signal }) => fetchStockStatus({ ...args!, signal }),
    enabled: !!args,
  })
}

// Populates the Stores / Categories / Groups dropdowns on the Criteria panel.
// Small payload, cached 5 min server-side; the client-side cache sits under
// `staleTime` for 5 min too so tab-switching doesn't re-hit the API.
export function useSalesDimensions() {
  return useQuery({
    queryKey: ['sales-dimensions'] as const,
    queryFn: ({ signal }) => fetchSalesDimensions(signal),
    staleTime: 5 * 60 * 1000,
  })
}

// Sales History by Month (RICS Ch. 6 p. 95). Fires only when ≥1 store is
// selected — the page guards the empty state locally, but we also guard
// here so a mis-wired caller can't blow up the backend with `stores=`.
// `placeholderData: keepPreviousData` gives the chart/table a stable frame
// while re-fetching on filter tweaks (matches the pattern the other sales
// reporting pages rely on for perceived responsiveness).
export function useSalesHistoryByMonth(params: SalesHistoryByMonthParams | null) {
  return useQuery({
    queryKey: ['sales-history-by-month', params] as const,
    queryFn: ({ signal }) => fetchSalesHistoryByMonth(params!, signal),
    enabled: !!params && params.stores.length > 0,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function usePurchaseOrderReport(query: PurchaseOrderReportQuery) {
  return useQuery({
    queryKey: ['purchase-order-report', query] as const,
    queryFn: () => fetchPurchaseOrderReport(query),
    placeholderData: keepPreviousData,
  })
}

export function useOpenPoByMonth(query: OpenPoByMonthQuery) {
  return useQuery({
    queryKey: ['open-po-by-month', query] as const,
    queryFn: () => fetchOpenPoByMonth(query),
    placeholderData: keepPreviousData,
  })
}

export function usePoCashProjection() {
  return useQuery({
    queryKey: ['po-cash-projection'] as const,
    queryFn: fetchPoCashProjection,
    placeholderData: keepPreviousData,
  })
}
