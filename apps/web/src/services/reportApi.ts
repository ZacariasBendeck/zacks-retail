import {
  appendDomainFilterContract,
  appendServerTableContract,
  type DomainFilterContract,
  type DomainFilterContractOptions,
} from './domainFilterContract'

export interface DepartmentOnHand {
  department: string
  totalSkus: number
  totalUnits: number
  totalCostValue: number
}

export interface CategoryOnHand {
  category: number
  department: string
  totalSkus: number
  totalUnits: number
  totalCostValue: number
}

export interface OnHandDetail {
  skuId: string
  skuCode: string
  brand: string
  style: string
  color: string
  size: string
  price: number
  category: number
  department: string
  quantityOnHand: number
  costValue: number
}

export interface OnHandDepartmentResponse {
  departments: DepartmentOnHand[]
}

export interface ReportDetailQuery {
  page?: number
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
}

export interface ReportPagination {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

interface ReportApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

export class ReportApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ReportApiError'
    this.status = status
    this.code = code
  }
}

async function throwReportApiError(res: Response, fallbackMessage: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as ReportApiErrorBody
  const code = typeof body?.error?.code === 'string' ? body.error.code : undefined
  const message = typeof body?.error?.message === 'string' ? body.error.message : fallbackMessage
  throw new ReportApiError(message, res.status, code)
}

function appendReportDomainFilters(
  params: URLSearchParams,
  contract: DomainFilterContract,
  options?: DomainFilterContractOptions,
): void {
  appendDomainFilterContract(params, contract, {
    requireDepartmentForCategory: true,
    ...options,
  })
}

export interface OnHandDrillDownResponse {
  department: string
  categories: CategoryOnHand[]
  details: OnHandDetail[]
  pagination: ReportPagination
}

export async function fetchOnHandByDepartment(): Promise<OnHandDepartmentResponse> {
  const res = await fetch('/api/v1/reports/on-hand')
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch on-hand report: ${res.status}`)
  }
  return res.json()
}

export async function fetchOnHandDrillDown(
  department: string,
  category?: number,
  query?: ReportDetailQuery,
): Promise<OnHandDrillDownResponse> {
  const params = new URLSearchParams()
  appendReportDomainFilters(params, { department, category })
  appendServerTableContract(params, query)
  const res = await fetch(`/api/v1/reports/on-hand?${params}`)
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch on-hand drill-down: ${res.status}`)
  }
  return res.json()
}

// ── Sales Performance Report ──────────────────────────────────────

export interface SalesDepartmentSummary {
  department: string
  totalUnitsSold: number
  totalRevenue: number
  avgSellingPrice: number
}

export interface SalesCategorySummary {
  category: number
  department: string
  totalUnitsSold: number
  totalRevenue: number
  avgSellingPrice: number
}

export interface SalesDetail {
  skuId: string
  skuCode: string
  brand: string
  style: string
  color: string
  size: string
  department: string
  category: number
  totalUnitsSold: number
  totalRevenue: number
  avgSellingPrice: number
}

export interface SalesDepartmentResponse {
  startDate: string
  endDate: string
  departments: SalesDepartmentSummary[]
}

export interface SalesDrillDownResponse {
  startDate: string
  endDate: string
  department: string
  categories: SalesCategorySummary[]
  details: SalesDetail[]
  pagination: ReportPagination
}

export async function fetchSalesPerformanceByDepartment(
  startDate: string,
  endDate: string,
): Promise<SalesDepartmentResponse> {
  const params = new URLSearchParams({ startDate, endDate })
  const res = await fetch(`/api/v1/reports/sales-performance?${params}`)
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch sales report: ${res.status}`)
  }
  return res.json()
}

export async function fetchSalesPerformanceDrillDown(
  startDate: string,
  endDate: string,
  department: string,
  category?: number,
  query?: ReportDetailQuery,
): Promise<SalesDrillDownResponse> {
  const params = new URLSearchParams({ startDate, endDate })
  appendReportDomainFilters(params, { department, category })
  appendServerTableContract(params, query)
  const res = await fetch(`/api/v1/reports/sales-performance?${params}`)
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch sales drill-down: ${res.status}`)
  }
  return res.json()
}

export function getSalesPerformanceCsvUrl(
  startDate: string,
  endDate: string,
  department?: string,
  category?: number,
): string {
  const params = new URLSearchParams({ startDate, endDate, format: 'csv' })
  appendReportDomainFilters(params, { department, category })
  return `/api/v1/reports/sales-performance?${params}`
}

export function getSalesPerformanceXlsxUrl(
  startDate: string,
  endDate: string,
  department?: string,
  category?: number,
): string {
  const params = new URLSearchParams({ startDate, endDate, format: 'xlsx' })
  appendReportDomainFilters(params, { department, category })
  return `/api/v1/reports/sales-performance?${params}`
}

// ── Inventory Turnover Report ────────────────────────────────────

export interface DepartmentTurnover {
  department: string
  totalSkus: number
  totalCogs: number
  totalInventoryValue: number
  turnoverRatio: number
}

export interface CategoryTurnover {
  category: number
  department: string
  totalSkus: number
  totalCogs: number
  totalInventoryValue: number
  turnoverRatio: number
}

export interface TurnoverDetail {
  skuId: string
  skuCode: string
  brand: string
  style: string
  color: string
  size: string
  price: number
  category: number
  department: string
  quantityOnHand: number
  inventoryValue: number
  cogs: number
  turnoverRatio: number
}

export interface TurnoverDepartmentResponse {
  startDate: string | null
  endDate: string | null
  departments: DepartmentTurnover[]
}

export interface TurnoverDrillDownResponse {
  startDate: string | null
  endDate: string | null
  department: string
  categories: CategoryTurnover[]
  details: TurnoverDetail[]
  pagination: ReportPagination
}

export async function fetchTurnoverByDepartment(
  startDate?: string,
  endDate?: string,
): Promise<TurnoverDepartmentResponse> {
  const params = new URLSearchParams()
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const qs = params.toString()
  const res = await fetch(`/api/v1/reports/inventory-turnover${qs ? '?' + qs : ''}`)
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch turnover report: ${res.status}`)
  }
  return res.json()
}

export async function fetchTurnoverDrillDown(
  department: string,
  startDate?: string,
  endDate?: string,
  category?: number,
  query?: ReportDetailQuery,
): Promise<TurnoverDrillDownResponse> {
  const params = new URLSearchParams()
  appendReportDomainFilters(params, { department, category })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  appendServerTableContract(params, query)
  const res = await fetch(`/api/v1/reports/inventory-turnover?${params}`)
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch turnover drill-down: ${res.status}`)
  }
  return res.json()
}

export function getTurnoverCsvUrl(
  startDate?: string,
  endDate?: string,
  department?: string,
  category?: number,
): string {
  const params = new URLSearchParams({ format: 'csv' })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  appendReportDomainFilters(params, { department, category })
  return `/api/v1/reports/inventory-turnover?${params}`
}

export function getTurnoverXlsxUrl(
  startDate?: string,
  endDate?: string,
  department?: string,
  category?: number,
): string {
  const params = new URLSearchParams({ format: 'xlsx' })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  appendReportDomainFilters(params, { department, category })
  return `/api/v1/reports/inventory-turnover?${params}`
}

// ── Sell-Through Analysis Report ────────────────────────────────

export interface SellThroughDepartmentSummary {
  department: string
  totalStyles: number
  totalUnitsSold: number
  totalUnitsReceived: number
  sellThroughPct: number
}

export interface SellThroughCategorySummary {
  category: number
  department: string
  totalStyles: number
  totalUnitsSold: number
  totalUnitsReceived: number
  sellThroughPct: number
}

export interface SellThroughDetail {
  skuId: string
  skuCode: string
  brand: string
  style: string
  color: string
  size: string
  price: number
  category: number
  department: string
  unitsSold: number
  unitsReceived: number
  sellThroughPct: number
}

export interface SellThroughDepartmentResponse {
  startDate: string | null
  endDate: string | null
  departments: SellThroughDepartmentSummary[]
}

export interface SellThroughDrillDownResponse {
  startDate: string | null
  endDate: string | null
  department: string
  categories: SellThroughCategorySummary[]
  details: SellThroughDetail[]
  pagination: ReportPagination
}

export async function fetchSellThroughByDepartment(
  startDate?: string,
  endDate?: string,
): Promise<SellThroughDepartmentResponse> {
  const params = new URLSearchParams()
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const qs = params.toString()
  const res = await fetch(`/api/v1/reports/sell-through${qs ? '?' + qs : ''}`)
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch sell-through report: ${res.status}`)
  }
  return res.json()
}

export async function fetchSellThroughDrillDown(
  department: string,
  startDate?: string,
  endDate?: string,
  category?: number,
  query?: ReportDetailQuery,
): Promise<SellThroughDrillDownResponse> {
  const params = new URLSearchParams()
  appendReportDomainFilters(params, { department, category })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  appendServerTableContract(params, query)
  const res = await fetch(`/api/v1/reports/sell-through?${params}`)
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch sell-through drill-down: ${res.status}`)
  }
  return res.json()
}

export function getSellThroughCsvUrl(
  startDate?: string,
  endDate?: string,
  department?: string,
  category?: number,
): string {
  const params = new URLSearchParams({ format: 'csv' })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  appendReportDomainFilters(params, { department, category })
  return `/api/v1/reports/sell-through?${params}`
}

export function getSellThroughXlsxUrl(
  startDate?: string,
  endDate?: string,
  department?: string,
  category?: number,
): string {
  const params = new URLSearchParams({ format: 'xlsx' })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  appendReportDomainFilters(params, { department, category })
  return `/api/v1/reports/sell-through?${params}`
}

// ── Inventory Aging Report ──────────────────────────────────────

export interface AgingBucket {
  bucket: string
  totalSkus: number
  totalUnits: number
  totalCostValue: number
}

export interface AgingDepartmentSummary {
  department: string
  buckets: AgingBucket[]
  totalSkus: number
  totalUnits: number
  totalCostValue: number
  flaggedUnits: number
  flaggedValue: number
}

export interface AgingDetail {
  skuId: string
  skuCode: string
  brand: string
  style: string
  color: string
  size: string
  price: number
  category: number
  department: string
  quantityOnHand: number
  costValue: number
  daysOnHand: number
  agingBucket: string
  flagged: boolean
  lastReceivedAt: string | null
}

export interface AgingDepartmentResponse {
  departments: AgingDepartmentSummary[]
}

export interface AgingDrillDownResponse {
  department: string
  details: AgingDetail[]
}

export async function fetchAgingByDepartment(): Promise<AgingDepartmentResponse> {
  const res = await fetch('/api/v1/reports/inventory-aging')
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch aging report: ${res.status}`)
  }
  return res.json()
}

export async function fetchAgingDrillDown(
  department: string,
  category?: number,
): Promise<AgingDrillDownResponse> {
  const params = new URLSearchParams()
  appendReportDomainFilters(params, { department, category })
  const res = await fetch(`/api/v1/reports/inventory-aging?${params}`)
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch aging drill-down: ${res.status}`)
  }
  return res.json()
}

export function getAgingCsvUrl(department?: string, category?: number): string {
  const params = new URLSearchParams({ format: 'csv' })
  appendReportDomainFilters(params, { department, category })
  return `/api/v1/reports/inventory-aging?${params}`
}

export function getAgingXlsxUrl(department?: string, category?: number): string {
  const params = new URLSearchParams({ format: 'xlsx' })
  appendReportDomainFilters(params, { department, category })
  return `/api/v1/reports/inventory-aging?${params}`
}

export function getOnHandCsvUrl(department?: string, category?: number): string {
  const params = new URLSearchParams({ format: 'csv' })
  appendReportDomainFilters(params, { department, category })
  return `/api/v1/reports/on-hand?${params}`
}

export function getOnHandXlsxUrl(department?: string, category?: number): string {
  const params = new URLSearchParams({ format: 'xlsx' })
  appendReportDomainFilters(params, { department, category })
  return `/api/v1/reports/on-hand?${params}`
}

// ══════════════════════════════════════════════════════════════════════════
// Sales Reporting (Phase 1 + Phase 2, RICS-backed)
// ══════════════════════════════════════════════════════════════════════════

// ── Dimensions (populates Criteria dropdowns) ────────────────────────────

export interface SalesStoreDim {
  number: number
  name: string | null
}
export interface SalesCategoryDim {
  number: number
  desc: string | null
}
export interface SalesGroupDim {
  code: string
  desc: string | null
}
export interface SalesDimensionsResponse {
  stores: SalesStoreDim[]
  categories: SalesCategoryDim[]
  groups: SalesGroupDim[]
}

export async function fetchSalesDimensions(signal?: AbortSignal): Promise<SalesDimensionsResponse> {
  const res = await fetch('/api/v1/reports/sales/dimensions', { signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch sales dimensions: ${res.status}`)
  return res.json()
}

// ── Sales by Day ─────────────────────────────────────────────────────────

export interface SalesByDayRow {
  date: string
  dayName: string
  netSales: number
  comparedToDate: string
  comparedNetSales: number
  dollarChange: number
  pctChange: number | null
}

export interface SalesTotals {
  netSales: number
  comparedNetSales: number
  dollarChange: number
  pctChange: number | null
}

export interface SalesByDayReport {
  storeNumber: number
  storeName: string | null
  storeLabel: string
  startDate: string
  endDate: string
  comparisonOffsetDays: number
  comparisonStartDate: string
  comparisonEndDate: string
  rows: SalesByDayRow[]
  weeklyTotals: SalesTotals
  storeTotals: SalesTotals
}

export async function fetchSalesByDay(
  storeNumber: number,
  startDate: string,
  endDate: string,
  comparisonOffsetDays = 364,
  signal?: AbortSignal,
): Promise<SalesByDayReport> {
  const params = new URLSearchParams({
    store: String(storeNumber),
    startDate,
    endDate,
    comparisonOffsetDays: String(comparisonOffsetDays),
  })
  const res = await fetch(`/api/v1/reports/sales/by-day?${params}`, { signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch sales by day: ${res.status}`)
  return res.json()
}

export function getSalesByDayCsvUrl(
  storeNumber: number,
  startDate: string,
  endDate: string,
  comparisonOffsetDays = 364,
): string {
  const params = new URLSearchParams({
    store: String(storeNumber),
    startDate,
    endDate,
    comparisonOffsetDays: String(comparisonOffsetDays),
    format: 'csv',
  })
  return `/api/v1/reports/sales/by-day?${params}`
}

export function getSalesByDayXlsxUrl(
  storeNumber: number,
  startDate: string,
  endDate: string,
  comparisonOffsetDays = 364,
): string {
  const params = new URLSearchParams({
    store: String(storeNumber),
    startDate,
    endDate,
    comparisonOffsetDays: String(comparisonOffsetDays),
    format: 'xlsx',
  })
  return `/api/v1/reports/sales/by-day?${params}`
}

// ── Sales by Time ────────────────────────────────────────────────────────

export interface SalesHourlyBucket {
  hour: number
  tickets: number
  qty: number
  dollars: number
  pctOfTotal: number | null
}

export interface SalesByTimeReport {
  startDate: string
  endDate: string
  compareStartDate: string | null
  compareEndDate: string | null
  storeNumbers: number[]
  rangeA: SalesHourlyBucket[]
  rangeB: SalesHourlyBucket[] | null
  totalsA: { tickets: number; qty: number; dollars: number }
  totalsB: { tickets: number; qty: number; dollars: number } | null
}

export async function fetchSalesByTime(args: {
  startDate: string
  endDate: string
  compareStartDate?: string
  compareEndDate?: string
  stores?: number[]
  pctOfTotal?: boolean
  signal?: AbortSignal
}): Promise<SalesByTimeReport> {
  const params = new URLSearchParams({ startDate: args.startDate, endDate: args.endDate })
  if (args.compareStartDate) params.set('compareStartDate', args.compareStartDate)
  if (args.compareEndDate) params.set('compareEndDate', args.compareEndDate)
  if (args.stores?.length) params.set('stores', args.stores.join(','))
  if (args.pctOfTotal) params.set('pctOfTotal', 'true')
  const res = await fetch(`/api/v1/reports/sales/by-time?${params}`, { signal: args.signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch sales by time: ${res.status}`)
  return res.json()
}

// ── Sales by SKU ─────────────────────────────────────────────────────────

export type SalesBySkuSortBy = 'SKU' | 'CATEGORY_SKU' | 'VENDOR_SKU'

export interface SalesBySkuSizeCell {
  columnLabel: string
  rowLabel: string
  qty: number
  dollars: number
}

export interface SalesBySkuRow {
  sku: string
  category: number | null
  vendor: string | null
  qty: number
  dollars: number
  returnsQty: number
  returnsDollars: number
  cells: SalesBySkuSizeCell[]
}

export interface SalesBySkuReport {
  startDate: string
  endDate: string
  storeNumbers: number[]
  sortBy: SalesBySkuSortBy
  includeReturns: boolean
  rows: SalesBySkuRow[]
  totals: { qty: number; dollars: number; returnsQty: number; returnsDollars: number }
}

export async function fetchSalesBySku(args: {
  startDate: string
  endDate: string
  stores?: number[]
  sortBy?: SalesBySkuSortBy
  includeReturns?: boolean
  skus?: string[]
  signal?: AbortSignal
}): Promise<SalesBySkuReport> {
  const params = new URLSearchParams({ startDate: args.startDate, endDate: args.endDate })
  if (args.stores?.length) params.set('stores', args.stores.join(','))
  if (args.sortBy) params.set('sortBy', args.sortBy)
  if (args.includeReturns !== undefined) params.set('includeReturns', String(args.includeReturns))
  if (args.skus?.length) params.set('skus', args.skus.join(','))
  const res = await fetch(`/api/v1/reports/sales/by-sku?${params}`, { signal: args.signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch sales by SKU: ${res.status}`)
  return res.json()
}

// ── Salesperson Summary ──────────────────────────────────────────────────

export type SalespersonSubtotalBy = 'DEPARTMENT' | 'VENDOR'

export interface SalespersonSubtotal {
  key: string
  label: string
  qty: number
  dollars: number
  perks: number
}

export interface SalespersonSummaryRow {
  salespersonCode: string
  salespersonName: string | null
  storeNumber: number
  qty: number
  dollars: number
  perks: number
  subtotals: SalespersonSubtotal[]
}

export interface CashierRow {
  cashierCode: string
  cashierName: string | null
  storeNumber: number
  tickets: number
  dollars: number
}

export interface SalespersonSummaryReport {
  startDate: string
  endDate: string
  storeNumbers: number[]
  subtotalBy: SalespersonSubtotalBy | null
  combineStores: boolean
  salespeople: SalespersonSummaryRow[]
  cashierSummary: CashierRow[] | null
  grandTotal: { qty: number; dollars: number; perks: number }
}

export async function fetchSalespersonSummary(args: {
  startDate: string
  endDate: string
  stores?: number[]
  subtotalBy?: SalespersonSubtotalBy
  combineStores?: boolean
  cashierSummary?: boolean
  signal?: AbortSignal
}): Promise<SalespersonSummaryReport> {
  const params = new URLSearchParams({ startDate: args.startDate, endDate: args.endDate })
  if (args.stores?.length) params.set('stores', args.stores.join(','))
  if (args.subtotalBy) params.set('subtotalBy', args.subtotalBy)
  if (args.combineStores) params.set('combineStores', 'true')
  if (args.cashierSummary) params.set('cashierSummary', 'true')
  const res = await fetch(`/api/v1/reports/sales/salesperson-summary?${params}`, { signal: args.signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch salesperson summary: ${res.status}`)
  return res.json()
}

// ── Best Sellers ─────────────────────────────────────────────────────────

export type BestSellersDimension = 'SKU' | 'VENDOR' | 'CATEGORY' | 'STORE'
export type BestSellersMetric = 'QTY' | 'NET_SALES' | 'PROFIT'
export type BestSellersPeriodFlag = 'WTD' | 'MTD' | 'STD' | 'YTD'

export interface BestSellerRow {
  rank: number
  key: string
  label: string | null
  qty: number
  netSales: number
  profit: number
  profitPct: number | null
}

export interface BestSellersReport {
  dimension: BestSellersDimension
  metric: BestSellersMetric
  period: BestSellersPeriodFlag | { lastNMonths: number }
  startDate: string
  endDate: string
  storeNumbers: number[]
  combineStores: boolean
  rows: BestSellerRow[]
  totals: { qty: number; netSales: number; profit: number }
}

export async function fetchBestSellers(args: {
  dimension: BestSellersDimension
  metric: BestSellersMetric
  period?: BestSellersPeriodFlag
  lastNMonths?: number
  stores?: number[]
  combineStores?: boolean
  topN?: number
  signal?: AbortSignal
}): Promise<BestSellersReport> {
  const params = new URLSearchParams({ dimension: args.dimension, metric: args.metric })
  if (args.period) params.set('period', args.period)
  if (args.lastNMonths) params.set('lastNMonths', String(args.lastNMonths))
  if (args.stores?.length) params.set('stores', args.stores.join(','))
  if (args.combineStores) params.set('combineStores', 'true')
  if (args.topN) params.set('topN', String(args.topN))
  const res = await fetch(`/api/v1/reports/sales/best-sellers?${params}`, { signal: args.signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch best sellers: ${res.status}`)
  return res.json()
}

// ── Sales Analysis ───────────────────────────────────────────────────────

export type SalesAnalysisDimension = 'CATEGORY' | 'VENDOR' | 'SEASON' | 'GROUP'
export type SalesAnalysisReportType =
  | 'SKU_DETAIL'
  | 'CATEGORY_SUMMARY'
  | 'DEPT_SUMMARY'
  | 'STYLE_COLOR_SUMMARY'
  | 'VENDOR_SUMMARY'
  | 'PRICE_POINT_SUMMARY'
  | 'SEASON_SUMMARY'
  | 'GROUP_SUMMARY'
  | 'SECTOR_SUMMARY'
export type SalesAnalysisStoreOption = 'SEPARATE' | 'COMPARE' | 'COMBINE'

export interface SalesAnalysisRow {
  dimensionKey: string
  dimensionLabel: string | null
  storeNumber: number | null
  qty: number
  netSales: number
  cogs: number
  grossProfit: number
  gpPct: number | null
  priorYearNetSales: number | null
  pyPctChange: number | null
}

export interface SalesAnalysisReport {
  dimension: SalesAnalysisDimension
  reportType: SalesAnalysisReportType
  storeOption: SalesAnalysisStoreOption
  rows: SalesAnalysisRow[]
  totals: {
    qty: number
    netSales: number
    cogs: number
    grossProfit: number
    priorYearNetSales: number | null
  }
}

export async function fetchSalesAnalysis(args: {
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
  wtd?: boolean
  mtd?: boolean
  std?: boolean
  ytd?: boolean
  priorYear?: boolean
  signal?: AbortSignal
}): Promise<SalesAnalysisReport> {
  const params = new URLSearchParams({
    dimension: args.dimension,
    reportType: args.reportType,
    storeOption: args.storeOption ?? 'SEPARATE',
  })
  if (args.startDate) params.set('startDate', args.startDate)
  if (args.endDate) params.set('endDate', args.endDate)
  if (args.stores?.length) params.set('stores', args.stores.join(','))
  if (args.categories?.length) params.set('categories', args.categories.join(','))
  if (args.vendors?.length) params.set('vendors', args.vendors.join(','))
  if (args.seasons?.length) params.set('seasons', args.seasons.join(','))
  if (args.skus?.length) params.set('skus', args.skus.join(','))
  if (args.styleColor) params.set('styleColor', args.styleColor)
  if (args.groups?.length) params.set('groups', args.groups.join(','))
  if (args.keywords?.length) params.set('keywords', args.keywords.join(','))
  if (args.wtd) params.set('wtd', 'true')
  if (args.mtd) params.set('mtd', 'true')
  if (args.std) params.set('std', 'true')
  if (args.ytd) params.set('ytd', 'true')
  if (args.priorYear) params.set('priorYear', 'true')
  const res = await fetch(`/api/v1/reports/sales/sales-analysis?${params}`, { signal: args.signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch sales analysis: ${res.status}`)
  return res.json()
}

// ── Stock Status ─────────────────────────────────────────────────────────

export type StockStatusSortBy = 'CATEGORY' | 'VENDOR'
export type StockStatusStoreOption = 'SEPARATE' | 'COMBINE'
export type StockStatusItemFilter =
  | 'ALL'
  | 'ONLY_SHORT'
  | 'ONLY_CRITICAL'
  | 'ONLY_ON_ORDER'
  | 'ONLY_NEGATIVE_OH'
  | 'ONLY_WITH_MODELS'

export interface StockStatusRow {
  sku: string
  description: string | null
  vendorCode: string | null
  category: number | null
  storeNumber: number
  onHand: number
  onOrder: number
  model: number
  short: number
  critical: number
  retailValue: number
  costValue: number
}

export interface StockStatusReport {
  sortBy: StockStatusSortBy
  storeOption: StockStatusStoreOption
  itemFilter: StockStatusItemFilter
  rows: StockStatusRow[]
  totals: {
    onHand: number
    onOrder: number
    model: number
    short: number
    critical: number
    retailValue: number
    costValue: number
  }
}

export async function fetchStockStatus(args: {
  sortBy?: StockStatusSortBy
  storeOption?: StockStatusStoreOption
  itemFilter?: StockStatusItemFilter
  vendors?: string[]
  categories?: number[]
  seasons?: string[]
  skus?: string[]
  signal?: AbortSignal
}): Promise<StockStatusReport> {
  const params = new URLSearchParams({
    sortBy: args.sortBy ?? 'CATEGORY',
    storeOption: args.storeOption ?? 'SEPARATE',
    itemFilter: args.itemFilter ?? 'ALL',
  })
  if (args.vendors?.length) params.set('vendors', args.vendors.join(','))
  if (args.categories?.length) params.set('categories', args.categories.join(','))
  if (args.seasons?.length) params.set('seasons', args.seasons.join(','))
  if (args.skus?.length) params.set('skus', args.skus.join(','))
  const res = await fetch(`/api/v1/reports/sales/stock-status?${params}`, { signal: args.signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch stock status: ${res.status}`)
  return res.json()
}

// ── Sales History by Month ───────────────────────────────────────────────
//
// RICS Ch. 6 p. 95. Returns a 12-month window ending at the requested
// endMonth, pivoted by Vendor or Category. The endpoint is served by the
// RICS adapter in Phase 1 and responds 501 when SALES_SOURCE !== 'rics'.

export type SalesHistoryByMonthSortBy = 'vendor' | 'category'

export interface SalesHistoryByMonthRow {
  key: string
  label: string
  monthValues: number[]
  total: number
}

export interface SalesHistoryByMonthBlock {
  storeNumber: number | 'ALL'
  storeLabel: string
  rows: SalesHistoryByMonthRow[]
  columnTotals: number[]
  grandTotal: number
}

export interface SalesHistoryByMonthChartSeries {
  name: string
  values: number[]
}

export interface SalesHistoryByMonthStoreRef {
  number: number
  label: string
}

export interface SalesHistoryByMonthReport {
  sortBy: SalesHistoryByMonthSortBy
  endMonth: string
  months: string[]
  combineStores: boolean
  stores: SalesHistoryByMonthStoreRef[]
  blocks: SalesHistoryByMonthBlock[]
  chartSeries: SalesHistoryByMonthChartSeries[]
}

export interface SalesHistoryByMonthParams {
  stores: number[]
  endMonth: string
  sortBy?: SalesHistoryByMonthSortBy
  combineStores?: boolean
}

function buildSalesHistoryByMonthParams(
  params: SalesHistoryByMonthParams,
  format?: 'csv',
): URLSearchParams {
  const qs = new URLSearchParams({
    stores: params.stores.join(','),
    endMonth: params.endMonth,
    sortBy: params.sortBy ?? 'vendor',
    combineStores: String(params.combineStores ?? true),
  })
  if (format) qs.set('format', format)
  return qs
}

export async function fetchSalesHistoryByMonth(
  params: SalesHistoryByMonthParams,
  signal?: AbortSignal,
): Promise<SalesHistoryByMonthReport> {
  const qs = buildSalesHistoryByMonthParams(params)
  const res = await fetch(`/api/v1/reports/rics-sales-history-by-month?${qs}`, { signal })
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch sales history by month: ${res.status}`)
  }
  return res.json()
}

export function getSalesHistoryByMonthCsvUrl(params: SalesHistoryByMonthParams): string {
  const qs = buildSalesHistoryByMonthParams(params, 'csv')
  return `/api/v1/reports/rics-sales-history-by-month?${qs}`
}
