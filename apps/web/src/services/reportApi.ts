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
  appendReportDomainFilters(params, { department, category }, { allowAnyDepartment: true })
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
  appendReportDomainFilters(params, { department, category }, { allowAnyDepartment: true })
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
  appendReportDomainFilters(params, { department, category }, { allowAnyDepartment: true })
  return `/api/v1/reports/sell-through?${params}`
}

// ── Inventory Aging Report ──────────────────────────────────────

/**
 * Bucket-boundary preset for the aging report. The page-header Radio.Group
 * picks one of these and threads it through every API call so summary,
 * drill-down, and exports stay in sync.
 *
 * Thresholds (last value is the "flagged" boundary):
 *   30_60_90    →  0-30 / 31-60 / 61-90 / 90+
 *   60_120_180  →  0-60 / 61-120 / 121-180 / 180+
 *   90_180_270  →  0-90 / 91-180 / 181-270 / 270+
 */
export type AgingBucketScheme = '30_60_90' | '60_120_180' | '90_180_270'

export const AGING_BUCKET_SCHEMES: Record<
  AgingBucketScheme,
  { labels: [string, string, string, string]; flagThreshold: number }
> = {
  '30_60_90': { labels: ['0-30', '31-60', '61-90', '90+'], flagThreshold: 90 },
  '60_120_180': { labels: ['0-60', '61-120', '121-180', '180+'], flagThreshold: 180 },
  '90_180_270': { labels: ['0-90', '91-180', '181-270', '270+'], flagThreshold: 270 },
}

/**
 * Dimension to group the top-level summary by. Each picks a different
 * grouping column on the back end (department description, sector
 * description, vendor short_name, buyer code from the receiving PO, or
 * store description).
 */
export type AgingGroupBy = 'department' | 'sector' | 'vendor' | 'buyer' | 'store'

export const AGING_GROUP_BY_LABELS: Record<AgingGroupBy, string> = {
  department: 'Department',
  sector: 'Sector',
  vendor: 'Vendor',
  buyer: 'Buyer',
  store: 'Store',
}

export interface AgingBucket {
  bucket: string
  totalSkus: number
  totalUnits: number
  totalCostValue: number
}

export interface AgingGroupSummary {
  groupKey: string
  groupLabel: string
  // Backward-compat alias the API still emits — equal to `groupLabel`.
  department: string
  buckets: AgingBucket[]
  totalSkus: number
  totalUnits: number
  totalCostValue: number
  flaggedUnits: number
  flaggedValue: number
}

// Old name kept so existing imports do not break — same shape.
export type AgingDepartmentSummary = AgingGroupSummary

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
  pictureFileName: string | null
  discountCode: string | null
}

export interface AgingDepartmentResponse {
  groupBy: AgingGroupBy
  bucketScheme: AgingBucketScheme
  departments: AgingGroupSummary[]
  groups: AgingGroupSummary[]
}

export interface AgingDrillDownResponse {
  groupBy: AgingGroupBy
  groupKey: string
  bucketScheme: AgingBucketScheme
  department?: string
  details: AgingDetail[]
}

export interface AgingDimensionsResponse {
  stores: { number: number; name: string | null }[]
  chains: { code: string; label: string }[]
  buyers: { code: string; label: string }[]
  sectors: { number: number; name: string }[]
  departments: { number: number; name: string }[]
}

export interface AgingQueryArgs {
  groupBy?: AgingGroupBy
  bucketScheme?: AgingBucketScheme
  /** Stores selected directly OR derived from a chain selection on the page. */
  stores?: number[]
  /** Criteria multi-select filters. */
  buyers?: string[]
  sectors?: number[]
  departments?: number[]
}

function appendAgingArgs(params: URLSearchParams, args: AgingQueryArgs = {}): void {
  if (args.groupBy) params.set('groupBy', args.groupBy)
  params.set('bucketScheme', args.bucketScheme ?? '30_60_90')
  if (args.stores && args.stores.length > 0) {
    params.set('stores', args.stores.join(','))
  }
  if (args.buyers && args.buyers.length > 0) {
    params.set('buyers', args.buyers.join(','))
  }
  if (args.sectors && args.sectors.length > 0) {
    params.set('sectors', args.sectors.join(','))
  }
  if (args.departments && args.departments.length > 0) {
    params.set('departments', args.departments.join(','))
  }
}

export async function fetchAgingByDepartment(
  args: AgingQueryArgs = {},
): Promise<AgingDepartmentResponse> {
  const params = new URLSearchParams()
  appendAgingArgs(params, args)
  const res = await fetch(`/api/v1/reports/inventory-aging?${params}`)
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch aging report: ${res.status}`)
  }
  return res.json()
}

export async function fetchAgingDrillDown(
  groupKey: string,
  category?: number,
  args: AgingQueryArgs = {},
): Promise<AgingDrillDownResponse> {
  const params = new URLSearchParams({ groupKey })
  appendAgingArgs(params, args)
  if (category != null) params.set('category', String(category))
  const res = await fetch(`/api/v1/reports/inventory-aging?${params}`)
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch aging drill-down: ${res.status}`)
  }
  return res.json()
}

export async function fetchAgingDimensions(): Promise<AgingDimensionsResponse> {
  const res = await fetch('/api/v1/reports/inventory-aging/dimensions')
  if (!res.ok) {
    await throwReportApiError(res, `Failed to fetch aging dimensions: ${res.status}`)
  }
  return res.json()
}

export function getAgingCsvUrl(
  groupKey?: string,
  category?: number,
  args: AgingQueryArgs = {},
): string {
  const params = new URLSearchParams({ format: 'csv' })
  appendAgingArgs(params, args)
  if (groupKey) params.set('groupKey', groupKey)
  if (category != null) params.set('category', String(category))
  return `/api/v1/reports/inventory-aging?${params}`
}

export function getAgingXlsxUrl(
  groupKey?: string,
  category?: number,
  args: AgingQueryArgs = {},
): string {
  const params = new URLSearchParams({ format: 'xlsx' })
  appendAgingArgs(params, args)
  if (groupKey) params.set('groupKey', groupKey)
  if (category != null) params.set('category', String(category))
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
export interface SalesSectorDim { number: number; name: string | null }
export interface SalesDepartmentDim { number: number; name: string | null }
export interface SalesSeasonDim { code: string; description: string | null }
export interface SalesBuyerDim { code: string; label: string | null }
export interface SalesDimensionsResponse {
  stores: SalesStoreDim[]
  categories: SalesCategoryDim[]
  groups: SalesGroupDim[]
  sectors: SalesSectorDim[]
  departments: SalesDepartmentDim[]
  seasons: SalesSeasonDim[]
  buyers: SalesBuyerDim[]
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
  profit: number
  comparedToDate: string
  comparedNetSales: number
  comparedProfit: number
  dollarChange: number
  profitChange: number
  pctChange: number | null
}

export interface SalesTotals {
  netSales: number
  profit: number
  comparedNetSales: number
  comparedProfit: number
  dollarChange: number
  profitChange: number
  pctChange: number | null
}

export interface SalesByDayStoreBreakdown {
  storeNumber: number
  storeName: string | null
  storeLabel: string
  rows: SalesByDayRow[]
  totals: SalesTotals
}

export interface SalesByDayCombinedBlock {
  storeLabel: string
  rows: SalesByDayRow[]
  totals: SalesTotals
}

export interface SalesByDayReport {
  storeNumbers: number[]
  combineStores: boolean
  startDate: string
  endDate: string
  comparisonOffsetDays: number
  comparisonStartDate: string
  comparisonEndDate: string
  storeBreakdowns: SalesByDayStoreBreakdown[]
  combined: SalesByDayCombinedBlock | null
}

function buildSalesByDayParams(
  storeNumbers: number[],
  startDate: string,
  endDate: string,
  comparisonOffsetDays: number,
  combineStores: boolean,
  format?: 'csv' | 'xlsx',
): URLSearchParams {
  const params = new URLSearchParams({
    startDate,
    endDate,
    comparisonOffsetDays: String(comparisonOffsetDays),
    combineStores: String(combineStores),
  })
  if (storeNumbers.length) params.set('stores', storeNumbers.join(','))
  if (format) params.set('format', format)
  return params
}

export async function fetchSalesByDay(
  storeNumbers: number[],
  startDate: string,
  endDate: string,
  comparisonOffsetDays = 364,
  combineStores = false,
  signal?: AbortSignal,
): Promise<SalesByDayReport> {
  const params = buildSalesByDayParams(storeNumbers, startDate, endDate, comparisonOffsetDays, combineStores)
  const res = await fetch(`/api/v1/reports/sales/by-day?${params}`, { signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch sales by day: ${res.status}`)
  return res.json()
}

export function getSalesByDayCsvUrl(
  storeNumbers: number[],
  startDate: string,
  endDate: string,
  comparisonOffsetDays = 364,
  combineStores = false,
): string {
  const params = buildSalesByDayParams(storeNumbers, startDate, endDate, comparisonOffsetDays, combineStores, 'csv')
  return `/api/v1/reports/sales/by-day?${params}`
}

export function getSalesByDayXlsxUrl(
  storeNumbers: number[],
  startDate: string,
  endDate: string,
  comparisonOffsetDays = 364,
  combineStores = false,
): string {
  const params = buildSalesByDayParams(storeNumbers, startDate, endDate, comparisonOffsetDays, combineStores, 'xlsx')
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

/**
 * Per-SKU attribute columns attached to SKU_DETAIL rows when the caller
 * asks for them via `includeAttributes=true`. The inline builder-page preview
 * does not ask for these (keeps the payload small); the fullscreen viewer
 * does, and renders whichever columns the operator has toggled on.
 */
export interface SkuAttributeColumns {
  description: string | null
  vendorCode: string | null
  /** RICS `inventory_master.manufacturer` — the private-label brand / parent
   *  company name, distinct from the trading vendor code. Shown in the
   *  viewer as the "Company" column, default-hidden. */
  manufacturer: string | null
  categoryNumber: number | null
  categoryDesc: string | null
  departmentNumber: number | null
  departmentDesc: string | null
  styleColor: string | null
  currentPrice: number | null
  currentCost: number | null
  unitsOnHand: number | null
  pictureUrl: string | null
  /** Operator-assigned extended attributes keyed by dimension code. */
  extended: Record<string, string>
}

export interface SalesAnalysisRow {
  dimensionKey: string
  dimensionLabel: string | null
  storeNumber: number | null
  qty: number
  netSales: number
  cogs: number
  grossProfit: number
  gpPct: number | null
  onHandAtCost: number
  turns: number | null
  roiPct: number | null
  priorYearNetSales: number | null
  pyPctChange: number | null
  /** Present only when the endpoint was called with includeAttributes=true. */
  attributes?: SkuAttributeColumns
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
    onHandAtCost: number
    gpPct: number | null
    turns: number | null
    roiPct: number | null
    priorYearNetSales: number | null
  }
  periodDays: number
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
  /** Request per-SKU attribute columns (description / color / extended). SKU_DETAIL only. */
  includeAttributes?: boolean
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
  if (args.storesRaw) params.set('storesRaw', args.storesRaw)
  if (args.categoriesRaw) params.set('categoriesRaw', args.categoriesRaw)
  if (args.vendorsRaw) params.set('vendorsRaw', args.vendorsRaw)
  if (args.seasonsRaw) params.set('seasonsRaw', args.seasonsRaw)
  if (args.skusRaw) params.set('skusRaw', args.skusRaw)
  if (args.groupsRaw) params.set('groupsRaw', args.groupsRaw)
  if (args.keywordsRaw) params.set('keywordsRaw', args.keywordsRaw)
  if (args.styleColorRaw) params.set('styleColorRaw', args.styleColorRaw)
  if (args.wtd) params.set('wtd', 'true')
  if (args.mtd) params.set('mtd', 'true')
  if (args.std) params.set('std', 'true')
  if (args.ytd) params.set('ytd', 'true')
  if (args.priorYear) params.set('priorYear', 'true')
  if (args.includeAttributes) params.set('includeAttributes', 'true')
  const res = await fetch(`/api/v1/reports/sales/sales-analysis?${params}`, { signal: args.signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch sales analysis: ${res.status}`)
  return res.json()
}

// ── Sales Hierarchy Drill-Down (Dept → Cat → SKU) ────────────────────────

export type SalesHierarchyStoreOption = 'SEPARATE' | 'COMBINE'

export interface SalesHierarchyNode {
  level: 'store' | 'department' | 'category' | 'sku'
  key: string
  label: string
  storeNumber: number | null
  qty: number
  netSales: number
  cogs: number
  grossProfit: number
  gpPct: number | null
  onHandAtCost: number
  turns: number | null
  roiPct: number | null
  priorYearNetSales: number | null
  pyPctChange: number | null
  attributes?: SkuAttributeColumns
  children?: SalesHierarchyNode[]
}

export interface SalesHierarchyReport {
  storeOption: SalesHierarchyStoreOption
  priorYear: boolean
  startDate: string
  endDate: string
  periodDays: number
  roots: SalesHierarchyNode[]
  totals: {
    qty: number
    netSales: number
    cogs: number
    grossProfit: number
    onHandAtCost: number
    gpPct: number | null
    turns: number | null
    roiPct: number | null
    priorYearNetSales: number | null
  }
}

export async function fetchSalesHierarchy(args: {
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
  signal?: AbortSignal
}): Promise<SalesHierarchyReport> {
  const params = new URLSearchParams({
    storeOption: args.storeOption ?? 'COMBINE',
    startDate: args.startDate,
    endDate: args.endDate,
  })
  if (args.stores?.length) params.set('stores', args.stores.join(','))
  if (args.categories?.length) params.set('categories', args.categories.join(','))
  if (args.vendors?.length) params.set('vendors', args.vendors.join(','))
  if (args.seasons?.length) params.set('seasons', args.seasons.join(','))
  if (args.skus?.length) params.set('skus', args.skus.join(','))
  if (args.styleColor) params.set('styleColor', args.styleColor)
  if (args.groups?.length) params.set('groups', args.groups.join(','))
  if (args.keywords?.length) params.set('keywords', args.keywords.join(','))
  if (args.storesRaw) params.set('storesRaw', args.storesRaw)
  if (args.categoriesRaw) params.set('categoriesRaw', args.categoriesRaw)
  if (args.vendorsRaw) params.set('vendorsRaw', args.vendorsRaw)
  if (args.seasonsRaw) params.set('seasonsRaw', args.seasonsRaw)
  if (args.skusRaw) params.set('skusRaw', args.skusRaw)
  if (args.groupsRaw) params.set('groupsRaw', args.groupsRaw)
  if (args.keywordsRaw) params.set('keywordsRaw', args.keywordsRaw)
  if (args.styleColorRaw) params.set('styleColorRaw', args.styleColorRaw)
  if (args.priorYear) params.set('priorYear', 'true')
  if (args.includeAttributes) params.set('includeAttributes', 'true')
  const res = await fetch(`/api/v1/reports/sales/hierarchy-drill-down?${params}`, { signal: args.signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch sales hierarchy: ${res.status}`)
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

// ── Sales Pivot (three variants) ─────────────────────────────────────────
//
// One endpoint, three interchangeable hierarchies selected by `variant`:
//   department                 Sector → Dept → Category → SKU
//   department-separate-store  Store → Sector → Dept → Category → SKU
//   buyer                      Buyer → Dept → Category → SKU
// The response shape is unified — identity fields not applicable to the
// chosen variant are null. The client builds the tree based on `variant`.

export type SalesPivotVariant =
  | 'department'
  | 'department-separate-store'
  | 'buyer'
  | 'buyer-vendor'
  | 'buyer-vendor-separate-store'
  | 'custom'

/** Dimensions selectable in the Custom Pivot builder. `category` is valid
 *  only at level 3 (narrowest grouping above SKU); level 1 and 2 take the
 *  other seven. */
export type PivotDimension =
  | 'buyer'
  | 'sector'
  | 'department'
  | 'season'
  | 'group'
  | 'vendor'
  | 'store'
  | 'category'

export interface SalesPivotLeafRow {
  storeNumber: number | null
  storeName: string | null
  buyerCode: string | null
  buyerLabel: string | null
  vendorCode: string | null
  vendorLabel: string | null
  sector: number | null
  sectorDesc: string | null
  dept: number | null
  deptDesc: string | null
  categ: number | null
  categDesc: string | null
  season: string | null
  seasonDesc: string | null
  groupCode: string | null
  groupDesc: string | null
  sku: string
  skuDescription: string | null
  onHandQty: number
  onHandCostVal: number
  qtyTY: number
  netSalesTY: number
  profitTY: number
  qtyLY: number
  netSalesLY: number
  profitLY: number
}

export interface SalesPivotTotals {
  onHandQty: number
  onHandCostVal: number
  qtyTY: number
  netSalesTY: number
  profitTY: number
  qtyLY: number
  netSalesLY: number
  profitLY: number
}

export interface SalesPivotReport {
  variant: SalesPivotVariant
  /** Present when variant === 'custom'. The three hierarchy dimensions. */
  levels?: [PivotDimension, PivotDimension, PivotDimension]
  startDate: string
  endDate: string
  currentYear: number
  priorYear: number
  storeNumbers: number[]
  rows: SalesPivotLeafRow[]
  totals: SalesPivotTotals
}

export async function fetchSalesPivot(args: {
  startDate: string
  endDate: string
  stores?: number[]
  variant: SalesPivotVariant
  /** Required when variant === 'custom'. */
  levels?: [PivotDimension, PivotDimension, PivotDimension]
  /** Criteria filters — variant='custom' only. */
  sectors?: number[]
  departments?: number[]
  seasons?: string[]
  buyers?: string[]
  signal?: AbortSignal
}): Promise<SalesPivotReport> {
  const params = new URLSearchParams({
    startDate: args.startDate,
    endDate: args.endDate,
    variant: args.variant,
  })
  if (args.stores?.length) params.set('stores', args.stores.join(','))
  if (args.variant === 'custom' && args.levels) {
    params.set('level1', args.levels[0])
    params.set('level2', args.levels[1])
    params.set('level3', args.levels[2])
    if (args.sectors?.length) params.set('sectors', args.sectors.join(','))
    if (args.departments?.length) params.set('departments', args.departments.join(','))
    if (args.seasons?.length) params.set('seasons', args.seasons.join(','))
    if (args.buyers?.length) params.set('buyers', args.buyers.join(','))
  }
  const res = await fetch(`/api/v1/reports/sales/sales-pivot?${params}`, { signal: args.signal })
  if (!res.ok) await throwReportApiError(res, `Failed to fetch sales pivot: ${res.status}`)
  return res.json()
}

// ── Sales History by Month (v2) ──────────────────────────────────────────
//
// RICS Ch. 6 p. 95. 12-month trailing window with multiple metrics, three
// detail levels, and seven criteria facets (each a RICS-grammar string).
//
// The endpoint is served by the RICS adapter in Phase 1 and responds 501
// when SALES_SOURCE !== 'rics'.

export type SalesHistoryByMonthSortBy = 'vendor' | 'category'
export type SalesHistoryByMonthDetailLevel = 'sku' | 'subtotals' | 'department'

/** Metric keys the API emits for every selected metric. v2.1 added
 *  beginningOnHand / roiPct / turns once RIINVHIS was indexed. */
export type SalesHistoryByMonthMetricKey =
  | 'quantitySold'
  | 'netSales'
  | 'pctOfStoreNetSales'
  | 'profit'
  | 'grossProfit'
  | 'beginningOnHand'
  | 'roiPct'
  | 'turns'

/** Retained for backward compatibility with callers that passed
 *  `deferredMetrics` on the query string. v2.1 ships every previously
 *  deferred metric, so the union members here are the same as the shipped
 *  metric keys and no metric is actually deferred. */
export type SalesHistoryByMonthDeferredMetricKey =
  | 'beginningOnHand'
  | 'roiPct'
  | 'turns'

export interface SalesHistoryByMonthCriteria {
  stores?: string
  categories?: string
  vendors?: string
  seasons?: string
  styleColors?: string
  groups?: string
  keywords?: string
}

export interface SalesHistoryByMonthRow {
  key: string
  label: string
  /** Per-metric 12-month grid. Undefined for metrics not in dataToPrint. */
  metrics: Partial<Record<SalesHistoryByMonthMetricKey, number[]>>
  totals: Partial<Record<SalesHistoryByMonthMetricKey, number>>
}

export interface SalesHistoryByMonthBlock {
  storeNumber: number | 'ALL'
  storeLabel: string
  rows: SalesHistoryByMonthRow[]
  columnTotals: Partial<Record<SalesHistoryByMonthMetricKey, number[]>>
  grandTotals: Partial<Record<SalesHistoryByMonthMetricKey, number>>
}

export interface SalesHistoryByMonthChartSeries {
  name: string
  values: number[]                                    // always Net Sales
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
  detailLevel: SalesHistoryByMonthDetailLevel
  dataToPrint: SalesHistoryByMonthMetricKey[]
  deferredMetrics: SalesHistoryByMonthDeferredMetricKey[]
  criteria: SalesHistoryByMonthCriteria
  blocks: SalesHistoryByMonthBlock[]
  chartSeries: SalesHistoryByMonthChartSeries[]
}

export interface SalesHistoryByMonthParams {
  stores: number[]
  endMonth: string
  sortBy?: SalesHistoryByMonthSortBy
  combineStores?: boolean
  detailLevel?: SalesHistoryByMonthDetailLevel
  dataToPrint?: SalesHistoryByMonthMetricKey[]
  deferredMetrics?: SalesHistoryByMonthDeferredMetricKey[]
  criteria?: SalesHistoryByMonthCriteria
}

function buildSalesHistoryByMonthParams(
  params: SalesHistoryByMonthParams,
  format?: 'csv' | 'xlsx',
): URLSearchParams {
  const qs = new URLSearchParams({
    stores: params.stores.join(','),
    endMonth: params.endMonth,
    sortBy: params.sortBy ?? 'vendor',
    combineStores: String(params.combineStores ?? true),
    detailLevel: params.detailLevel ?? 'subtotals',
  })
  if (params.dataToPrint && params.dataToPrint.length > 0) {
    qs.set('dataToPrint', params.dataToPrint.join(','))
  }
  if (params.deferredMetrics && params.deferredMetrics.length > 0) {
    qs.set('deferredMetrics', params.deferredMetrics.join(','))
  }
  const c = params.criteria ?? {}
  if (c.stores)       qs.set('critStores', c.stores)
  if (c.categories)   qs.set('critCategories', c.categories)
  if (c.vendors)      qs.set('critVendors', c.vendors)
  if (c.seasons)      qs.set('critSeasons', c.seasons)
  if (c.styleColors)  qs.set('critStyleColors', c.styleColors)
  if (c.groups)       qs.set('critGroups', c.groups)
  if (c.keywords)     qs.set('critKeywords', c.keywords)
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

export function getSalesHistoryByMonthXlsxUrl(params: SalesHistoryByMonthParams): string {
  const qs = buildSalesHistoryByMonthParams(params, 'xlsx')
  return `/api/v1/reports/rics-sales-history-by-month?${qs}`
}
