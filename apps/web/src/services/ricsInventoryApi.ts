/**
 * Client wrappers for the RICS-backed inventory read endpoints.
 * Server source: apps/api/src/routes/ricsInventoryRoutes.ts.
 */

// ─────────────────────── extended inquiry types ───────────────────────────

export type PriceSlot = 'LIST' | 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2';

export interface InquiryPricing {
  retail: number;
  markdown1: number;
  markdown2: number;
  avgCost: number;
  currentCost: number;
  listPrice: number;
  currentSlot: PriceSlot;
}

export interface InquiryRollupCell {
  qty: number;
  net: number;
  markdown: number;
  profit: number;
}

export interface InquiryRollup {
  week: InquiryRollupCell;
  month: InquiryRollupCell;
  season: InquiryRollupCell;
  year: InquiryRollupCell;
}

export interface InquirySizeGrid {
  columns: string[];
  rows: Array<{ label: string; cells: Array<{ value: number | null }> }>;
}

export interface InquiryGrids {
  onHand?: InquirySizeGrid;
  model?: InquirySizeGrid;
  max?: InquirySizeGrid;
  reorder?: InquirySizeGrid;
  short?: InquirySizeGrid;
  allStoresOnHand?: InquirySizeGrid;
  allStoresSummary?: InquirySizeGrid;
}

// ──────────────────────────────────────────────────────────────────────────

export interface InventoryCell {
  storeNumber: number
  rowLabel: string
  columnLabel: string
  onHand: number
  currentOnOrder: number
  futureOnOrder: number
  model: number
  maxQty: number
  reorder: number
  mtdSales: number
  stdSales: number
  ytdSales: number
  lySales: number
}

export interface InventoryInquiryStore {
  storeNumber: number
  storeName: string | null
  cells: InventoryCell[]
  totals: {
    onHand: number
    currentOnOrder: number
    futureOnOrder: number
    ytdSales: number
    lySales: number
  }
}

export interface InventoryInquiry {
  sku: string
  master: {
    description: string | null
    brand: string | null
    vendorCode: string | null
    category: number | null
    season: string | null
    retailPrice: number | null
    currentCost: number | null
    sizeType: {
      code: number | null
      desc: string | null
      rowLabels: string[]
      columnLabels: string[]
    }
  }
  stores: InventoryInquiryStore[]
  totals: InventoryInquiryStore['totals']
  pricing?: InquiryPricing
  rollup?: InquiryRollup
  grids?: InquiryGrids
  pictureUrl?: string | null
}

export interface FindBySizeResult {
  sku: string
  description: string | null
  brand: string | null
  sizeLabel: string
  matches: Array<{
    storeNumber: number
    storeName: string | null
    rowLabel: string
    onHand: number
  }>
  totalOnHand: number
}

export interface InventoryDetailReportRow {
  sku: string
  description: string | null
  brand: string | null
  vendorCode: string | null
  category: number | null
  styleColor: string | null
  season: string | null
  retailPrice: number | null
  currentCost: number | null
  totalOnHand: number
  totalCurrentOnOrder: number
  totalYtdSales: number
  totalLySales: number
  retailValue: number
  costValue: number
}

export interface InventoryDetailReportResponse {
  rows: InventoryDetailReportRow[]
  total: number
}

export interface InventoryDetailReportParams {
  storeNumber?: number
  vendorCode?: string
  categoryMin?: number
  categoryMax?: number
  season?: string
  limit?: number
}

export interface ChangeDetailRow {
  sku: string
  origSku: string | null
  store: number
  changeType: string
  date: string
  rowLabel: string
  columnLabel: string
  purchaseOrder: string | null
  otherStore: number | null
  quantity: number
  cost: number
  rmaNumber: string | null
}

export interface ChangeDetailResponse {
  rows: ChangeDetailRow[]
  total: number
}

export interface ChangeDetailParams {
  sku?: string
  store?: number
  changeType?: string
  fromDate?: string
  toDate?: string
  limit?: number
}

export interface TransferSummaryParams {
  fromDate: string
  toDate: string
  fromStoreNumbers?: number[]
  toStoreNumbers?: number[]
}

export interface TransferSummaryCell {
  fromStore: number
  fromStoreName: string | null
  toStore: number
  toStoreName: string | null
  quantity: number
  cost: number
  transferEvents: number
}

export interface TransferSummaryMonth {
  month: string
  cells: TransferSummaryCell[]
  totalQuantity: number
  totalCost: number
  totalEvents: number
}

export interface TransferSummaryReport {
  fromDate: string
  toDate: string
  months: TransferSummaryMonth[]
  matrix: TransferSummaryCell[]
  stores: Array<{ number: number; name: string | null }>
  grandTotalQuantity: number
  grandTotalCost: number
  grandTotalEvents: number
}

export type RecommendedTransferRule =
  | 'OVER_UNDER_MODELS'
  | 'UNEVEN_DOUBLES'
  | 'TURNOVER_VARIANCE'

export interface RecommendedTransferParams {
  rule: RecommendedTransferRule
  turnoverRatioThreshold?: number
  includeSkusWithoutModels?: boolean
  storeNumbers?: number[]
  vendorCode?: string
  categoryMin?: number
  categoryMax?: number
  season?: string
  limit?: number
}

export interface RecommendedTransferRow {
  sku: string
  description: string | null
  brand: string | null
  category: number | null
  vendorCode: string | null
  fromStore: number
  fromStoreName: string | null
  toStore: number
  toStoreName: string | null
  suggestedQuantity: number
  reason: string
  fromOnHand: number
  toOnHand: number
  fromModel: number
  toModel: number
  fromYtd: number
  toYtd: number
}

export interface RecommendedTransferResponse {
  rows: RecommendedTransferRow[]
  total: number
}

export interface SkuStoreRollupParams {
  storeNumbers?: number[]
  vendorCode?: string
  categoryMin?: number
  categoryMax?: number
  season?: string
  skus?: string[]
  limit?: number
}

export interface SkuStoreRollupRow {
  sku: string
  store: number
  storeName: string | null
  description: string | null
  brand: string | null
  vendorCode: string | null
  category: number | null
  season: string | null
  onHand: number
  model: number
  maxQty: number
  reorder: number
  currentOnOrder: number
  mtdSales: number
  stdSales: number
  ytdSales: number
  lySales: number
}

export interface SkuStoreRollupResponse {
  rows: SkuStoreRollupRow[]
  total: number
}

export interface SkuStoreCellRow {
  sku: string
  store: number
  storeName: string | null
  rowLabel: string
  columnLabel: string
  description: string | null
  brand: string | null
  vendorCode: string | null
  category: number | null
  season: string | null
  sizeTypeCode: number | null
  sizeTypeDesc: string | null
  onHand: number
  model: number
  maxQty: number
  reorder: number
  currentOnOrder: number
  futureOnOrder: number
  mtdSales: number
  stdSales: number
  ytdSales: number
  lySales: number
}

export interface SkuStoreCellRollupResponse {
  rows: SkuStoreCellRow[]
  total: number
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    let detail: string | undefined
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      detail = body?.error?.message
    } catch {
      // fall through
    }
    throw new Error(detail || `Request failed (${res.status})`)
  }
  return (await res.json()) as T
}

export function fetchInventoryInquiry(sku: string): Promise<InventoryInquiry> {
  return fetchJson<InventoryInquiry>(`/api/v1/inventory/inquiry/${encodeURIComponent(sku)}`)
}

export function fetchFindBySize(sku: string, size: string): Promise<FindBySizeResult> {
  const qs = new URLSearchParams({ sku, size })
  return fetchJson<FindBySizeResult>(`/api/v1/inventory/find-by-size?${qs}`)
}

export function fetchInventoryDetailReport(
  params: InventoryDetailReportParams,
): Promise<InventoryDetailReportResponse> {
  const qs = new URLSearchParams()
  if (params.storeNumber != null) qs.set('storeNumber', String(params.storeNumber))
  if (params.vendorCode) qs.set('vendorCode', params.vendorCode)
  if (params.categoryMin != null) qs.set('categoryMin', String(params.categoryMin))
  if (params.categoryMax != null) qs.set('categoryMax', String(params.categoryMax))
  if (params.season) qs.set('season', params.season)
  if (params.limit != null) qs.set('limit', String(params.limit))
  return fetchJson<InventoryDetailReportResponse>(`/api/v1/inventory/detail-report?${qs}`)
}

export function fetchChangeDetail(params: ChangeDetailParams): Promise<ChangeDetailResponse> {
  const qs = new URLSearchParams()
  if (params.sku) qs.set('sku', params.sku)
  if (params.store != null) qs.set('store', String(params.store))
  if (params.changeType) qs.set('changeType', params.changeType)
  if (params.fromDate) qs.set('fromDate', params.fromDate)
  if (params.toDate) qs.set('toDate', params.toDate)
  if (params.limit != null) qs.set('limit', String(params.limit))
  return fetchJson<ChangeDetailResponse>(`/api/v1/inventory/change-detail?${qs}`)
}

export function fetchTransferSummary(
  params: TransferSummaryParams,
): Promise<TransferSummaryReport> {
  const qs = new URLSearchParams()
  qs.set('fromDate', params.fromDate)
  qs.set('toDate', params.toDate)
  if (params.fromStoreNumbers?.length) qs.set('fromStoreNumbers', params.fromStoreNumbers.join(','))
  if (params.toStoreNumbers?.length) qs.set('toStoreNumbers', params.toStoreNumbers.join(','))
  return fetchJson<TransferSummaryReport>(`/api/v1/inventory/transfer-summary?${qs}`)
}

export function fetchRecommendedTransfers(
  params: RecommendedTransferParams,
): Promise<RecommendedTransferResponse> {
  const qs = new URLSearchParams()
  qs.set('rule', params.rule)
  if (params.turnoverRatioThreshold != null)
    qs.set('turnoverRatioThreshold', String(params.turnoverRatioThreshold))
  if (params.includeSkusWithoutModels) qs.set('includeSkusWithoutModels', 'true')
  if (params.storeNumbers?.length) qs.set('storeNumbers', params.storeNumbers.join(','))
  if (params.vendorCode) qs.set('vendorCode', params.vendorCode)
  if (params.categoryMin != null) qs.set('categoryMin', String(params.categoryMin))
  if (params.categoryMax != null) qs.set('categoryMax', String(params.categoryMax))
  if (params.season) qs.set('season', params.season)
  if (params.limit != null) qs.set('limit', String(params.limit))
  return fetchJson<RecommendedTransferResponse>(
    `/api/v1/inventory/recommended-transfers?${qs}`,
  )
}

export function fetchSkuStoreRollup(
  params: SkuStoreRollupParams,
): Promise<SkuStoreRollupResponse> {
  const qs = new URLSearchParams()
  if (params.storeNumbers?.length) qs.set('storeNumbers', params.storeNumbers.join(','))
  if (params.vendorCode) qs.set('vendorCode', params.vendorCode)
  if (params.categoryMin != null) qs.set('categoryMin', String(params.categoryMin))
  if (params.categoryMax != null) qs.set('categoryMax', String(params.categoryMax))
  if (params.season) qs.set('season', params.season)
  if (params.skus?.length) qs.set('skus', params.skus.join(','))
  if (params.limit != null) qs.set('limit', String(params.limit))
  return fetchJson<SkuStoreRollupResponse>(`/api/v1/inventory/sku-store-rollup?${qs}`)
}

export function fetchSkuStoreCellRollup(
  params: SkuStoreRollupParams,
): Promise<SkuStoreCellRollupResponse> {
  const qs = new URLSearchParams()
  if (params.storeNumbers?.length) qs.set('storeNumbers', params.storeNumbers.join(','))
  if (params.vendorCode) qs.set('vendorCode', params.vendorCode)
  if (params.categoryMin != null) qs.set('categoryMin', String(params.categoryMin))
  if (params.categoryMax != null) qs.set('categoryMax', String(params.categoryMax))
  if (params.season) qs.set('season', params.season)
  if (params.skus?.length) qs.set('skus', params.skus.join(','))
  if (params.limit != null) qs.set('limit', String(params.limit))
  return fetchJson<SkuStoreCellRollupResponse>(`/api/v1/inventory/sku-store-cell-rollup?${qs}`)
}
