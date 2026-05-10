import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  manualReportQueryKey,
  manualReportQueryOptions,
  type ManualReportRun,
} from './useManualReportRun'
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
  fetchSeasonalityIndex,
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
  type SharedReportCriteriaParams,
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
} & SharedReportCriteriaParams
export function useSalesByDay(run: ManualReportRun<SalesByDayArgs> | null) {
  return useQuery({
    queryKey: manualReportQueryKey('sales-by-day', run),
    queryFn: ({ signal }) =>
      fetchSalesByDay(
        run!.args.storeNumbers,
        run!.args.startDate,
        run!.args.endDate,
        run!.args.comparisonOffsetDays ?? 364,
        run!.args.combineStores ?? false,
        signal,
        run!.args,
      ),
    enabled: !!run,
    ...manualReportQueryOptions,
  })
}

export type SalesByTimeArgs = {
  startDate: string
  endDate: string
  compareStartDate?: string
  compareEndDate?: string
  stores?: number[]
  pctOfTotal?: boolean
} & SharedReportCriteriaParams
export function useSalesByTime(run: ManualReportRun<SalesByTimeArgs> | null) {
  return useQuery({
    queryKey: manualReportQueryKey('sales-by-time', run),
    queryFn: ({ signal }) => fetchSalesByTime({ ...run!.args, signal }),
    enabled: !!run,
    ...manualReportQueryOptions,
  })
}

export type SalesBySkuArgs = {
  startDate: string
  endDate: string
  stores?: number[]
  sortBy?: SalesBySkuSortBy
  includeReturns?: boolean
  skus?: string[]
} & SharedReportCriteriaParams
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
} & SharedReportCriteriaParams
export function useSalespersonSummary(run: ManualReportRun<SalespersonSummaryArgs> | null) {
  return useQuery({
    queryKey: manualReportQueryKey('salesperson-summary', run),
    queryFn: ({ signal }) => fetchSalespersonSummary({ ...run!.args, signal }),
    enabled: !!run,
    ...manualReportQueryOptions,
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
} & SharedReportCriteriaParams
export function useBestSellers(run: ManualReportRun<BestSellersArgs> | null) {
  return useQuery({
    queryKey: manualReportQueryKey('best-sellers', run),
    queryFn: ({ signal }) => fetchBestSellers({ ...run!.args, signal }),
    enabled: !!run,
    ...manualReportQueryOptions,
  })
}

export type SalesAnalysisArgs = {
  dimension: SalesAnalysisDimension
  reportType: SalesAnalysisReportType
  storeOption?: SalesAnalysisStoreOption
  startDate?: string
  endDate?: string
  stores?: number[]
  chains?: string[]
  sectors?: number[]
  departments?: number[]
  categories?: number[]
  vendors?: string[]
  seasons?: string[]
  skus?: string[]
  styleColor?: string
  groups?: string[]
  keywords?: string[]
  buyers?: string[]
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
  includeOnOrder?: boolean
  showPercentOfTotal?: boolean
}
export function useSalesAnalysis(run: ManualReportRun<SalesAnalysisArgs> | null) {
  return useQuery({
    queryKey: manualReportQueryKey('sales-analysis', run),
    queryFn: ({ signal }) => fetchSalesAnalysis({ ...run!.args, signal }),
    enabled: !!run,
    ...manualReportQueryOptions,
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
} & SharedReportCriteriaParams
export function useSalesHierarchy(run: ManualReportRun<SalesHierarchyArgs> | null) {
  return useQuery({
    queryKey: manualReportQueryKey('sales-hierarchy', run),
    queryFn: ({ signal }) => fetchSalesHierarchy({ ...run!.args, signal }),
    enabled: !!run,
    ...manualReportQueryOptions,
  })
}

export type SalesPivotArgs = {
  startDate: string
  endDate: string
  stores?: number[]
  variant: import('../services/reportApi').SalesPivotVariant
  levels?: import('../services/reportApi').SalesPivotLevels
} & SharedReportCriteriaParams
export function useSalesPivot(run: ManualReportRun<SalesPivotArgs> | null) {
  return useQuery({
    queryKey: manualReportQueryKey('sales-pivot', run),
    queryFn: ({ signal }) => fetchSalesPivot({ ...run!.args, signal }),
    enabled: !!run,
    ...manualReportQueryOptions,
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
export function useStockStatus(run: ManualReportRun<StockStatusArgs> | null) {
  return useQuery({
    queryKey: manualReportQueryKey('stock-status', run),
    queryFn: ({ signal }) => fetchStockStatus({ ...run!.args, signal }),
    enabled: !!run,
    ...manualReportQueryOptions,
  })
}

// Populates the Stores / Categories / Groups dropdowns on the Criteria panel.
// Small payload, cached 5 min server-side; the client-side cache sits under
// `staleTime` for 5 min too so tab-switching doesn't re-hit the API.
export function useSalesDimensions() {
  return useQuery({
    queryKey: ['sales-dimensions', 'sector-department-names'] as const,
    queryFn: ({ signal }) => fetchSalesDimensions(signal),
    staleTime: 5 * 60 * 1000,
  })
}

// Sales History by Month (RICS Ch. 6 p. 95). A blank store selection means
// all stores, matching the other sales-reporting screens.
// `placeholderData: keepPreviousData` gives the chart/table a stable frame
// while re-fetching on filter tweaks (matches the pattern the other sales
// reporting pages rely on for perceived responsiveness).
export function useSalesHistoryByMonth(run: ManualReportRun<SalesHistoryByMonthParams> | null) {
  return useQuery({
    queryKey: manualReportQueryKey('sales-history-by-month', run),
    queryFn: ({ signal }) => fetchSalesHistoryByMonth(run!.args, signal),
    enabled: !!run,
    ...manualReportQueryOptions,
  })
}

export function useSeasonalityIndex(args: { endMonth?: string; department?: number } = {}) {
  return useQuery({
    queryKey: ['seasonality-index', args] as const,
    queryFn: ({ signal }) => fetchSeasonalityIndex({ ...args, signal }),
    staleTime: 5 * 60 * 1000,
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
