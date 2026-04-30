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
  total?: number;
}

export interface InquiryGrids {
  onHand?: InquirySizeGrid;
  onOrderCurrent?: InquirySizeGrid;
  onOrderFuture?: InquirySizeGrid;
  model?: InquirySizeGrid;
  max?: InquirySizeGrid;
  reorder?: InquirySizeGrid;
  short?: InquirySizeGrid;
  mtdSales?: InquirySizeGrid;
  stdSales?: InquirySizeGrid;
  ytdSales?: InquirySizeGrid;
  lySales?: InquirySizeGrid;
  singleColumn?: InquirySizeGrid;
  allStoresOnHand?: InquirySizeGrid;
  allStoresOneRow?: InquirySizeGrid;
  allStoresSummary?: InquirySizeGrid;
}

export interface InquiryTrendColumn {
  label: string;
  availWeek: number | null;
  availPeriod: number | null;
  recTranAdj: number | null;
  sales: number | null;
  stWeekly: number | null;
  stPeriod: number | null;
  periodReset: boolean;
}

export interface InquiryTrend {
  scopeLabel: string;
  columns: InquiryTrendColumn[];
}

export interface InquiryOpenPoRow {
  poNumber: string;
  storeId: number;
  orderClass: 'AT_ONCE' | 'FUTURE';
  dueDate: string | null;
  rowLabel: string;
  columnLabel: string;
  orderedQty: number;
  receivedQty: number;
  openQty: number;
}

export interface InquiryPurchaseOrderHistoryRow {
  poNumber: string;
  shipStore: number | null;
  vendorCode: string | null;
  buyer: string | null;
  orderDate: string | null;
  dueDate: string | null;
  lastReceivedAt: string | null;
  orderType: string | null;
  legacyStatus: string | null;
  current: boolean | null;
  orderedQty: number;
  receivedQty: number;
  openQty: number;
  lineCount: number;
}

export interface InquiryInfoMonth {
  label: string;
  qty: number;
  sales: number;
}

export interface InquiryInfoMetricCell {
  gpPct: number | null;
  roi: number | null;
  turns: number | null;
}

export interface InquiryInfoDetail {
  scopeLabel: string;
  seasonCode: string | null;
  seasonDescription: string | null;
  labelCode: string | null;
  groupCode: string | null;
  groupDescription: string | null;
  firstReceivedAt: string | null;
  lastMarkdownAt: string | null;
  perks: number | null;
  keywords: string | null;
  comment: string | null;
  prior12Months: InquiryInfoMonth[];
  totals: {
    qty: number;
    sales: number;
  };
  metrics: {
    mtd: InquiryInfoMetricCell;
    std: InquiryInfoMetricCell;
    ytd: InquiryInfoMetricCell;
  };
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
    categoryName: string | null
    season: string | null
    retailPrice: number | null
    currentCost: number | null
    sizeType: {
      code: number | null
      desc: string | null
      rowLabels: string[]
      columnLabels: string[]
    }
    vendorSku?: string | null
    styleColor?: string | null
    status?: string | null
  }
  stores: InventoryInquiryStore[]
  totals: InventoryInquiryStore['totals']
  pricing?: InquiryPricing
  rollup?: InquiryRollup
  grids?: InquiryGrids
  pictureUrl?: string | null
}

export type FindBySizeSort = 'SKU' | 'DESCRIPTION' | 'VENDOR' | 'CATEGORY'

export interface FindBySizeParams {
  seedSku?: string
  sizeTypeCode?: number
  columnLabel?: string
  rowLabel?: string
  restrictToSizeType?: boolean
  vendorCode?: string
  category?: number
  styleColor?: string
  storeNumbers?: number[]
  sort?: FindBySizeSort
  separateByStore?: boolean
  limit?: number
}

export interface FindBySizeRow {
  sku: string
  description: string | null
  brand: string | null
  vendorCode: string | null
  category: number | null
  styleColor: string | null
  sizeTypeCode: number | null
  sizeTypeDesc: string | null
  totalOnHand: number
  storeCount: number
  storeNumber: number | null
  storeName: string | null
}

export interface FindBySizeResult {
  seedSku: string | null
  columnLabel: string | null
  rowLabel: string | null
  sizeTypeCode: number | null
  sizeTypeDesc: string | null
  restrictToSizeType: boolean
  separateByStore: boolean
  sort: FindBySizeSort
  rows: FindBySizeRow[]
  totalMatches: number
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
  /** When true, union in SKU sales rows from ticket_detail as `changeType = 'SAL'`. */
  includeSales?: boolean
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

export interface ReorderPlannerDefaults {
  scope: 'SKU' | 'VENDOR' | 'DEFAULT'
  scopeKey: string | null
  leadTimeDays: number
  orderCycleDays: number
  moqQty: number
  updatedAt: string | null
  updatedBy: string | null
}

export interface ReorderPlanSizeLine {
  rowLabel: string
  columnLabel: string
  sizeLabel: string
  onHand: number
  currentOnOrder: number
  futureOnOrder: number
  onOrder: number
  modelQty: number
  modelShort: number
  skuSalesQty: number
  categorySalesQty: number
  previousOrderQty: number
  curvePct: number
  curveSource: 'SKU_SALES' | 'CATEGORY_SALES' | 'MODEL' | 'PREVIOUS_ORDER' | 'NONE'
  forecastDemandQty: number
  baselineMonthlyDemand: number
  activeDemandMonths: number
  projectedSales: number
  recommendedQty: number
}

export interface ReorderCasePackCell {
  rowLabel: string
  columnLabel: string
  sizeLabel: string
  quantity: number
}

export interface ReorderCasePackSuggestion {
  code: string
  description: string | null
  multiplier: number
  unitsPerPack: number
  totalUnits: number
  autoApply: boolean
  overbuyQty: number
  overbuyLimitQty: number
  supplierUsed: boolean
  supplierUsageCount: number
  supplierLastUsedAt: string | null
  sameSkuPreviousPack: boolean
  shortageQty: number
  excessQty: number
  differenceQty: number
  sizeCells: ReorderCasePackCell[]
}

export interface ReorderPlanChain {
  chainId: string | null
  chainLabel: string
  source: 'TOTAL' | 'MATCHING_SET' | 'STORE_MODEL' | 'FALLBACK'
  storeNumbers: number[]
  storeCount: number
  totals: {
    onHand: number
    currentOnOrder: number
    futureOnOrder: number
    modelQty: number
    modelShort: number
    skuSalesQty: number
    categorySalesQty: number
    previousOrderQty: number
    forecastDemandQty: number
    projectedSales: number
    recommendedQty: number
  }
  previousOrder: {
    poNumber: string | null
    orderDate: string | null
    source: 'NATIVE' | 'LEGACY' | null
    casePackId: string | null
    casePackMultiplier: number | null
  }
  casePackSuggestion: ReorderCasePackSuggestion | null
  sizeLines: ReorderPlanSizeLine[]
}

export interface ReorderPlan {
  sku: {
    id: string
    code: string
    description: string | null
    vendorCode: string | null
    category: number | null
    sizeTypeCode: number | null
    orderMultiple: number | null
    unitCost: number
    retailPrice: number
  }
  planning: {
    analysisDate: string
    leadTimeDays: number
    orderCycleDays: number
    coverageDays: number
    moqQty: number
    salesLookbackDays: number
    forecastMonths: string[]
    forecastStartMonth: string
    seasonalityHistoryEndMonth: string
  }
  seasonality: {
    basis: 'DEPARTMENT_ALL_STORES'
    departmentNumber: number | null
    departmentLabel: string | null
    averageMonthlyQty: number
    sampleMonths: number
    indexes: Array<{ month: number; label: string; index: number; rawSalesQty: number }>
  }
  vendorDraftPo: {
    poId: string
    poNumber: string
    updatedAt: string
    lineCount: number
    totalQuantity: number
  } | null
  defaults: ReorderPlannerDefaults
  chains: ReorderPlanChain[]
  warnings: string[]
}

export interface ReorderPlanParams {
  leadTimeDays?: number
  orderCycleDays?: number
  moqQty?: number
}

export interface ReorderDefaultsInput extends ReorderPlanParams {
  scopeType?: 'SKU' | 'VENDOR'
  updatedBy?: string
}

export interface CreateReorderDraftPoInput extends ReorderPlanParams {
  chainId?: string | null
  chainLabel?: string | null
  casePackId?: string | null
  casePackMultiplier?: number | null
  createdBy?: string
  sizeCells: Array<{ rowLabel: string; columnLabel: string; quantity: number }>
}

export interface CreateReorderDraftPoResult {
  poId: string
  poNumber: string
  totalQuantity: number
  mode: 'CREATED' | 'APPENDED'
  appendedToExistingPo: boolean
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
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

export function fetchInquiryTrend(sku: string, storeId?: number): Promise<InquiryTrend> {
  const qs = new URLSearchParams()
  if (storeId != null) qs.set('storeId', String(storeId))
  return fetchJson<InquiryTrend>(`/api/v1/inventory/inquiry/${encodeURIComponent(sku)}/trend?${qs}`)
}

export function fetchInquiryInfo(sku: string, storeId?: number): Promise<InquiryInfoDetail> {
  const qs = new URLSearchParams()
  if (storeId != null) qs.set('storeId', String(storeId))
  return fetchJson<InquiryInfoDetail>(`/api/v1/inventory/inquiry/${encodeURIComponent(sku)}/info?${qs}`)
}

export function fetchInquiryOpenPos(
  sku: string,
  storeId?: number,
): Promise<{ rows: InquiryOpenPoRow[]; total: number }> {
  const qs = new URLSearchParams()
  if (storeId != null) qs.set('storeId', String(storeId))
  return fetchJson<{ rows: InquiryOpenPoRow[]; total: number }>(
    `/api/v1/inventory/inquiry/${encodeURIComponent(sku)}/open-pos?${qs}`
  )
}

export function fetchInquiryPurchaseOrderHistory(
  sku: string,
  storeId?: number,
): Promise<{ rows: InquiryPurchaseOrderHistoryRow[]; total: number }> {
  const qs = new URLSearchParams()
  if (storeId != null) qs.set('storeId', String(storeId))
  return fetchJson<{ rows: InquiryPurchaseOrderHistoryRow[]; total: number }>(
    `/api/v1/inventory/inquiry/${encodeURIComponent(sku)}/po-history?${qs}`
  )
}

export function fetchFindBySize(params: FindBySizeParams): Promise<FindBySizeResult> {
  const qs = new URLSearchParams()
  if (params.seedSku) qs.set('seedSku', params.seedSku)
  if (params.sizeTypeCode != null) qs.set('sizeTypeCode', String(params.sizeTypeCode))
  if (params.columnLabel) qs.set('columnLabel', params.columnLabel)
  if (params.rowLabel) qs.set('rowLabel', params.rowLabel)
  if (params.restrictToSizeType != null) qs.set('restrictToSizeType', String(params.restrictToSizeType))
  if (params.vendorCode) qs.set('vendorCode', params.vendorCode)
  if (params.category != null) qs.set('category', String(params.category))
  if (params.styleColor) qs.set('styleColor', params.styleColor)
  if (params.storeNumbers?.length) qs.set('storeNumbers', params.storeNumbers.join(','))
  if (params.sort) qs.set('sort', params.sort)
  if (params.separateByStore != null) qs.set('separateByStore', String(params.separateByStore))
  if (params.limit != null) qs.set('limit', String(params.limit))
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
  if (params.includeSales) qs.set('includeSales', 'true')
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

export function fetchInquiryReorderPlan(
  sku: string,
  params: ReorderPlanParams = {},
): Promise<ReorderPlan> {
  const qs = new URLSearchParams()
  if (params.leadTimeDays != null) qs.set('leadTimeDays', String(params.leadTimeDays))
  if (params.orderCycleDays != null) qs.set('orderCycleDays', String(params.orderCycleDays))
  if (params.moqQty != null) qs.set('moqQty', String(params.moqQty))
  const suffix = qs.toString() ? `?${qs}` : ''
  return fetchJson<ReorderPlan>(`/api/v1/inventory/inquiry/${encodeURIComponent(sku)}/reorder-plan${suffix}`)
}

export function saveInquiryReorderDefaults(
  sku: string,
  input: ReorderDefaultsInput,
): Promise<ReorderPlannerDefaults> {
  return fetchJson<ReorderPlannerDefaults>(
    `/api/v1/inventory/inquiry/${encodeURIComponent(sku)}/reorder-defaults`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
}

export function createInquiryReorderDraftPo(
  sku: string,
  input: CreateReorderDraftPoInput,
): Promise<CreateReorderDraftPoResult> {
  return fetchJson<CreateReorderDraftPoResult>(
    `/api/v1/inventory/inquiry/${encodeURIComponent(sku)}/reorder-plan/draft-po`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
}
