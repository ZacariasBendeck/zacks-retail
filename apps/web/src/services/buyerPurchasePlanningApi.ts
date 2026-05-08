export type BuyerWorkbookSeason = 'SPRING_SUMMER' | 'FALL_WINTER'
export type BuyerWorkbookStatus = 'DRAFT' | 'ARCHIVED'
export type BuyerCategoryStatus =
  | 'NOT_STARTED'
  | 'HISTORY_REVIEWED'
  | 'CARRYOVER_REVIEW'
  | 'CARRYOVERS'
  | 'NEW_STYLES'
  | 'PO_LINKED'
  | 'COMPLETE'
export type PlannedStyleStatus = 'PLANNED' | 'SELECTED' | 'LINKED' | 'CANCELLED'
export type CarryoverDecision = 'UNREVIEWED' | 'WINNER' | 'MAYBE' | 'DROP'
export type CarryoverAvailability = 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE'

export interface HistoricalMonthMetric {
  yearMonth: string
  quantitySold: number
  netSales: number
  profit: number
  beginningOnHand: number
  inventoryValue: number
  roiPct: number | null
  turns: number | null
  newSkuDistinctCount: number
  carryoverSkuDistinctCount: number
  newSkuUnitsSold: number
  carryoverSkuUnitsSold: number
  sellThroughPct: number | null
}

export interface HistoricalTargetSummary {
  suggestedNewSkuCount: number
  suggestedCarryoverSkuCount: number
  sampleMonths: number
  totalQuantitySold: number
  totalNetSales: number
  averageBeginningOnHand: number
}

export interface AttributeMixRow {
  valueCode: string
  valueLabel: string
  unitsSold: number
  netSales: number
  profit: number
  salesPct: number
  roiPct: number | null
  sellThroughPct: number | null
  skuCount: number
}

export interface AttributeMixDimension {
  dimensionCode: string
  dimensionLabel: string
  totalUnitsSold: number
  totalNetSales: number
  totalProfit: number
  values: AttributeMixRow[]
}

export interface AttributePlanRow {
  id: string
  workbookId: string
  cardId: string
  dimensionCode: string
  dimensionLabel: string
  valueCode: string
  valueLabel: string
  plannedStyleCount: number
  plannedUnits: number
  notes: string | null
  updatedBy: string
  updatedAt: string
}

export interface CarryoverCandidateMetrics {
  unitsSold: number
  netSales: number
  profit: number
  grossProfitPct: number | null
  inventoryValue: number
  roiPct: number | null
  turns: number | null
  currentOnHand: number
  currentOnOrder: number
  futureOnOrder: number
  sellThroughPct: number | null
}

export interface CarryoverCandidate {
  id: string
  workbookId: string
  cardId: string
  storeId: number
  categoryNumber: number
  skuId: string | null
  skuCode: string
  skuDescription: string | null
  color: string | null
  metrics: CarryoverCandidateMetrics
  decision: CarryoverDecision
  availability: CarryoverAvailability
  unavailableReason: string | null
  carryoverLineId: string | null
  replacementStyleId: string | null
  notes: string | null
  reviewedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface BuyerChecklistSeasonPlan {
  buyingSeason: BuyerWorkbookSeason
  seasonYear: number
  workbookId: string | null
  cardId: string | null
  status: BuyerCategoryStatus | null
  updatedAt: string | null
}

export interface BuyerChecklistCategoryRow {
  buyerCode: string | null
  buyerLabel: string | null
  categoryNumber: number
  categoryLabel: string
  departmentNumber: number | null
  departmentLabel: string
  last12MonthsSales: number
  last12MonthsUnits: number
  currentInventoryUnits: number
  currentInventoryValue: number
  departmentOtbUnits: number | null
  currentSeason: BuyerChecklistSeasonPlan
  nextSeason: BuyerChecklistSeasonPlan
  followingSeason: BuyerChecklistSeasonPlan
  action: 'START_REVIEW' | 'CONTINUE'
}

export interface BuyerWorkbookListItem {
  id: string
  label: string
  status: BuyerWorkbookStatus
  buyingSeason: BuyerWorkbookSeason
  seasonYear: number
  seasonMonths: string[]
  seedStoreId: number
  targetStoreIds: number[]
  buyer: string
  cardCount: number
  completeCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface BuyerCategoryCard {
  id: string
  workbookId: string
  departmentNumber: number | null
  departmentLabel: string
  categoryNumber: number
  categoryLabel: string
  status: BuyerCategoryStatus
  seedStoreId: number
  targetStoreIds: number[]
  suggestedNewSkuCount: number
  suggestedCarryoverSkuCount: number
  targetNewSkuCount: number
  targetCarryoverSkuCount: number
  replacementStyleTargetCount: number
  additionalNewStyleTargetCount: number
  totalNewStyleTargetCount: number
  history: {
    months: HistoricalMonthMetric[]
    summary: HistoricalTargetSummary
  }
  attributeMix: AttributeMixDimension[]
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface StoreCategoryPlan {
  id: string
  workbookId: string
  cardId: string
  storeId: number
  copiedFromStoreId: number | null
  status: 'DRAFT' | 'COPIED' | 'EDITED'
  targetNewSkuCount: number
  targetCarryoverSkuCount: number
  notes: string | null
}

export interface CarryoverLine {
  id: string
  workbookId: string
  cardId: string
  storeId: number | null
  skuId: string | null
  skuCode: string
  skuDescription: string | null
  color: string | null
  sizeCells: Array<{
    rowLabel?: string | null
    columnLabel?: string | null
    sizeLabel?: string | null
    quantity?: number
    plannedQty?: number
    recommendedQty?: number
    onHand?: number
    currentOnOrder?: number
    futureOnOrder?: number
    modelQty?: number
    modelShort?: number
    skuSalesQty?: number
    forecastDemandQty?: number
  }>
  totalQuantity: number
  source: 'SEED' | 'COPY' | 'MANUAL' | 'REORDER_PLANNER'
  unavailable: boolean
  unavailableReason: string | null
  replacementStyleId: string | null
  carryoverCandidateId: string | null
  notes: string | null
}

export interface PlannedStyle {
  id: string
  workbookId: string
  cardId: string
  replacementForCarryoverLineId: string | null
  replacementForCarryoverCandidateId: string | null
  vendorCode: string | null
  vendorName: string | null
  workingStyle: string | null
  description: string | null
  color: string | null
  colorFamily: string | null
  attributes: Record<string, unknown>
  quotedUnitCost: number | null
  targetNewSkuCount: number
  targetUnits: number
  status: PlannedStyleStatus
  linkedSkuId: string | null
  linkedSkuCode: string | null
  notes: string | null
}

export interface BuyerPoLink {
  id: string
  workbookId: string
  cardId: string
  carryoverLineId: string | null
  plannedStyleId: string | null
  poId: string
  poNumber: string
  poLineId: string | null
  quantity: number
  notes: string | null
  linkedBy: string
  linkedAt: string
}

export interface BuyerWorkbookDetail {
  workbook: Omit<BuyerWorkbookListItem, 'cardCount' | 'completeCount'>
  cards: BuyerCategoryCard[]
  storePlans: StoreCategoryPlan[]
  carryoverCandidates: CarryoverCandidate[]
  carryovers: CarryoverLine[]
  plannedStyles: PlannedStyle[]
  attributePlans: AttributePlanRow[]
  poLinks: BuyerPoLink[]
}

export interface StoreCategoryCarryingRow {
  storeId: number
  storeLabel: string
  categoryNumber: number
  categoryLabel: string
  carries: boolean
  suggestedCarries: boolean
  stockSkuCount: number
  stockUnits: number
  modelSkuCount: number
  modelUnits: number
  source: 'SEED' | 'CHAIN' | 'MANUAL'
  chainCode: string | null
  note: string | null
  updatedBy: string
  updatedAt: string
}

export interface BuyerWorkbookCreateRequest {
  label?: string
  buyingSeason: BuyerWorkbookSeason
  seasonYear: number
  seedStoreId: number
  targetStoreIds?: number[]
  categoryNumbers?: number[]
  departmentNumbers?: number[]
  buyer?: string
  createdBy?: string
}

export interface BuyerCarryoverCreateRequest {
  storeId?: number | null
  skuCode: string
  skuDescription?: string | null
  color?: string | null
  sizeCells?: CarryoverLine['sizeCells']
  totalQuantity?: number | null
  notes?: string | null
  actor?: string
}

export interface BuyerPlannedStyleRequest {
  replacementForCarryoverLineId?: string | null
  replacementForCarryoverCandidateId?: string | null
  vendorCode?: string | null
  vendorName?: string | null
  workingStyle?: string | null
  description?: string | null
  color?: string | null
  colorFamily?: string | null
  attributes?: Record<string, unknown>
  quotedUnitCost?: number | null
  targetNewSkuCount?: number | null
  targetUnits?: number | null
  notes?: string | null
  actor?: string
}

export interface BuyerNewStyleTargetsRequest {
  replacementStyleTargetCount?: number
  additionalNewStyleTargetCount?: number
  totalNewStyleTargetCount?: number
  actor?: string
}

export interface BuyerAttributePlanRequest {
  rows: Array<{
    dimensionCode: string
    dimensionLabel: string
    valueCode: string
    valueLabel: string
    plannedStyleCount?: number | null
    plannedUnits?: number | null
    notes?: string | null
  }>
  actor?: string
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = (body as { error?: { message?: string } })?.error?.message
      ?? `Buyer purchase planning request failed (${res.status})`
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) search.set(key, String(value))
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

export async function fetchBuyerWorkbooks(params: {
  status?: BuyerWorkbookStatus | 'all'
} = {}): Promise<BuyerWorkbookListItem[]> {
  const res = await fetch(`/api/v1/purchase-planning/buyer-workbooks${qs({ status: params.status })}`)
  const body = await parseJsonOrThrow<{ workbooks: BuyerWorkbookListItem[] }>(res)
  return body.workbooks
}

export async function fetchBuyerChecklistCategories(params: {
  buyer?: string
  buyingSeason?: BuyerWorkbookSeason
  seasonYear?: number
} = {}): Promise<BuyerChecklistCategoryRow[]> {
  const res = await fetch(`/api/v1/purchase-planning/buyer-checklist/categories${qs(params)}`)
  const body = await parseJsonOrThrow<{ rows: BuyerChecklistCategoryRow[] }>(res)
  return body.rows
}

export async function createBuyerWorkbook(input: BuyerWorkbookCreateRequest): Promise<BuyerWorkbookDetail> {
  const res = await fetch('/api/v1/purchase-planning/buyer-workbooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function fetchBuyerWorkbook(id: string): Promise<BuyerWorkbookDetail> {
  const res = await fetch(`/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(id)}`)
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function updateBuyerCategoryCard(
  workbookId: string,
  cardId: string,
  input: {
    status?: BuyerCategoryStatus
    targetNewSkuCount?: number
    targetCarryoverSkuCount?: number
    notes?: string | null
    actor?: string
  },
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/cards/${encodeURIComponent(cardId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function addBuyerCarryoverLine(
  workbookId: string,
  cardId: string,
  input: BuyerCarryoverCreateRequest,
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/cards/${encodeURIComponent(cardId)}/carryovers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function updateBuyerCarryoverLine(
  workbookId: string,
  lineId: string,
  input: {
    sizeCells?: CarryoverLine['sizeCells']
    totalQuantity?: number | null
    notes?: string | null
    actor?: string
  },
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/carryovers/${encodeURIComponent(lineId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function fetchBuyerCarryoverCandidates(
  workbookId: string,
  cardId: string,
): Promise<CarryoverCandidate[]> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/cards/${encodeURIComponent(cardId)}/carryover-candidates`,
  )
  const body = await parseJsonOrThrow<{ candidates: CarryoverCandidate[] }>(res)
  return body.candidates
}

export async function updateBuyerCarryoverCandidate(
  workbookId: string,
  candidateId: string,
  input: {
    decision?: CarryoverDecision
    availability?: CarryoverAvailability
    notes?: string | null
    actor?: string
  },
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/carryover-candidates/${encodeURIComponent(candidateId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function createBuyerCarryoverModelLine(
  workbookId: string,
  candidateId: string,
  input: { actor?: string } = {},
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/carryover-candidates/${encodeURIComponent(candidateId)}/create-model-line`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function flagBuyerCarryoverCandidateUnavailable(
  workbookId: string,
  candidateId: string,
  input: { reason: string; actor?: string },
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/carryover-candidates/${encodeURIComponent(candidateId)}/unavailable`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function copyBuyerSeedModel(
  workbookId: string,
  cardId: string,
  input: { targetStoreIds?: number[]; actor?: string } = {},
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/cards/${encodeURIComponent(cardId)}/copy-model`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function flagBuyerCarryoverUnavailable(
  workbookId: string,
  lineId: string,
  input: { reason: string; actor?: string },
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/carryovers/${encodeURIComponent(lineId)}/unavailable`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function addBuyerPlannedStyle(
  workbookId: string,
  cardId: string,
  input: BuyerPlannedStyleRequest,
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/cards/${encodeURIComponent(cardId)}/planned-styles`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function updateBuyerNewStyleTargets(
  workbookId: string,
  cardId: string,
  input: BuyerNewStyleTargetsRequest,
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/cards/${encodeURIComponent(cardId)}/new-style-targets`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function updateBuyerAttributePlan(
  workbookId: string,
  cardId: string,
  input: BuyerAttributePlanRequest,
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/cards/${encodeURIComponent(cardId)}/attribute-plan`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function updateBuyerPlannedStyle(
  workbookId: string,
  styleId: string,
  input: Omit<BuyerPlannedStyleRequest, 'replacementForCarryoverLineId'> & {
    status?: PlannedStyleStatus
    linkedSkuId?: string | null
    linkedSkuCode?: string | null
  },
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/planned-styles/${encodeURIComponent(styleId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function deleteBuyerPlannedStyle(
  workbookId: string,
  styleId: string,
  actor = 'buyer',
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/planned-styles/${encodeURIComponent(styleId)}${qs({ actor })}`,
    { method: 'DELETE' },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function linkBuyerPurchaseOrder(
  workbookId: string,
  input: {
    cardId: string
    carryoverLineId?: string | null
    plannedStyleId?: string | null
    poId: string
    poLineId?: string | null
    quantity?: number | null
    notes?: string | null
    linkedBy?: string
  },
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(`/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/po-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function unlinkBuyerPurchaseOrder(
  workbookId: string,
  linkId: string,
  actor = 'buyer',
): Promise<BuyerWorkbookDetail> {
  const res = await fetch(
    `/api/v1/purchase-planning/buyer-workbooks/${encodeURIComponent(workbookId)}/po-links/${encodeURIComponent(linkId)}${qs({ actor })}`,
    { method: 'DELETE' },
  )
  return parseJsonOrThrow<BuyerWorkbookDetail>(res)
}

export async function fetchStoreCategoryCarrying(categoryNumber: number): Promise<StoreCategoryCarryingRow[]> {
  const res = await fetch(`/api/v1/purchase-planning/store-category-carrying${qs({ categoryNumber })}`)
  const body = await parseJsonOrThrow<{ rows: StoreCategoryCarryingRow[] }>(res)
  return body.rows
}

export async function bulkUpdateStoreCategoryCarrying(input: {
  categoryNumber: number
  storeIds?: number[]
  chainCode?: string | null
  carries: boolean
  exceptions?: Array<{ storeId: number; carries: boolean; note?: string | null }>
  note?: string | null
  updatedBy?: string
}): Promise<StoreCategoryCarryingRow[]> {
  const res = await fetch('/api/v1/purchase-planning/store-category-carrying/bulk', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await parseJsonOrThrow<{ rows: StoreCategoryCarryingRow[] }>(res)
  return body.rows
}
