/**
 * Client for the purchase-planning module.
 *
 * Spec: docs/modules/purchase-planning.md
 * API: POST /api/v1/purchase-planning/projections
 */

export type PurchasePlanDimension = 'department' | 'category' | 'vendor';

export type PurchasePlanForecastMethod =
  | 'holtWinters'
  | 'sameMonthLastYear'
  | 'trailingAverage'
  | 'yoyGrowth'
  | 'blendedMultiYear';

export type PurchasePlanEohMethod = 'forward' | 'seasonal';
export type PurchasePlanningSeason = 'spring' | 'summer' | 'fall' | 'winter';
export type PurchasePlanAdjustmentKind = 'percent_lift' | 'absolute_total';
export type PurchasePlanPlanningScope = 'store_group' | 'enterprise';
export type PurchasePlanPlanningDimension = 'department' | 'category';

export interface PurchasePlanRequest {
  dimension: PurchasePlanDimension;
  /** Empty / omitted = all stores (resolved server-side). */
  storeNumbers?: number[];
  forecast: {
    method: PurchasePlanForecastMethod;
    trailingMonths?: number;
    growthPct?: number;
    yearsToBlend?: 2 | 3;
  };
  eohMethod: PurchasePlanEohMethod;
  coverMonths?: number;
  asOfYearMonth?: string;
  filters?: {
    departmentsRaw?: string;
    categoriesRaw?: string;
    vendorsRaw?: string;
  };
}

export interface PurchasePlanRow {
  dimKey: string;
  dimLabel: string;
  yearMonth: string;
  boh: number;
  projSales: number;
  eohTarget: number;
  buy: number;
  eohActual: number;
}

export interface PurchasePlanTotals {
  dimKey: string;
  dimLabel: string;
  currentOnHand: number;
  totalBuy: number;
  totalProjSales: number;
  avgEohActual: number;
  hasHistory: boolean;
}

export interface PurchasePlanResponse {
  rows: PurchasePlanRow[];
  totals: PurchasePlanTotals[];
  meta: {
    asOfYearMonth: string;
    horizonYearMonths: string[];
    onHandAsOf: string;
    generatedAt: string;
    forecastMethod: PurchasePlanForecastMethod;
    eohMethod: PurchasePlanEohMethod;
    historyFromYearMonth: string;
    historyToYearMonth: string;
  };
}

export interface SavedPurchasePlanCreateRequest {
  planningScope?: PurchasePlanPlanningScope;
  planningDimension?: PurchasePlanPlanningDimension;
  storeGroupCode?: string;
  season: PurchasePlanningSeason;
  seasonYear: number;
  departmentNumbers: number[];
  categoryNumbers?: number[];
  label?: string;
  forecast?: {
    method?: PurchasePlanForecastMethod;
    trailingMonths?: number;
    growthPct?: number;
    yearsToBlend?: 2 | 3;
  };
  eohMethod?: PurchasePlanEohMethod;
  coverMonths?: number;
  discountNormalization?: boolean;
  createdBy?: string;
}

export interface SavedPurchasePlanHeader {
  id: string;
  label: string;
  status: 'draft' | 'archived';
  planningScope: PurchasePlanPlanningScope;
  planningDimension: PurchasePlanPlanningDimension;
  planningScopeLabel: string;
  storeGroupCode: string;
  storeGroupLabel: string | null;
  season: PurchasePlanningSeason;
  seasonYear: number;
  seasonMonths: string[];
  selectedDepartments: number[];
  selectedCategories: number[];
  forecastMethod: PurchasePlanForecastMethod;
  eohMethod: PurchasePlanEohMethod;
  coverMonths: number;
  discountNormalization: boolean;
  historyFromYearMonth: string;
  historyToYearMonth: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface SavedPurchasePlanRow {
  id: string;
  planId: string;
  departmentKey: string;
  departmentNumber: number | null;
  departmentLabel: string;
  yearMonth: string;
  baselineBoh: number;
  baselineProjSales: number;
  baselineEohTarget: number;
  baselineBuy: number;
  baselineEohActual: number;
  currentBoh: number;
  currentProjSales: number;
  currentEohTarget: number;
  currentBuy: number;
  currentEohActual: number;
  onHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  nativeOpenPo: number;
  stockPosition: number;
  normalizationFactor: number | null;
  rawProjSales: number | null;
  lastYearSalesUnits?: number | null;
  lastYearBeginningOnHand?: number | null;
  lastYearNextMonthBeginningOnHand?: number | null;
  yearBeforeLastSalesUnits?: number | null;
  yearBeforeLastBeginningOnHand?: number | null;
}

export interface SavedPurchasePlanDepartment {
  departmentKey: string;
  departmentNumber: number | null;
  departmentLabel: string;
  baselineTotalBuy: number;
  currentTotalBuy: number;
  deltaBuy: number;
  totalProjSales: number;
  currentOnHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  nativeOpenPo: number;
  hasHistory: boolean;
  months: SavedPurchasePlanRow[];
}

export interface SavedPurchasePlanAdjustment {
  id: string;
  planId: string;
  departmentKey: string;
  kind: PurchasePlanAdjustmentKind;
  value: number;
  reason: string;
  appliedBy: string;
  appliedAt: string;
}

export interface SavedPurchasePlanDetail {
  plan: SavedPurchasePlanHeader;
  departments: SavedPurchasePlanDepartment[];
  adjustments: SavedPurchasePlanAdjustment[];
  totals: {
    baselineTotalBuy: number;
    currentTotalBuy: number;
    deltaBuy: number;
    totalProjSales: number;
  };
}

export type SavedPurchasePlanSalesTrendDirection =
  | 'increasing'
  | 'decreasing'
  | 'flat'
  | 'insufficient_history';

export type SavedPurchasePlanSalesTrendConfidence = 'high' | 'medium' | 'low';

export interface SavedPurchasePlanSalesTrendWindow {
  label: string;
  currentFromYearMonth: string | null;
  currentToYearMonth: string | null;
  comparisonFromYearMonth: string | null;
  comparisonToYearMonth: string | null;
  currentUnits: number;
  comparisonUnits: number;
  changeUnits: number;
  changePct: number | null;
}

export interface SavedPurchasePlanSalesTrendSummary {
  historyFromYearMonth: string;
  historyToYearMonth: string;
  sampleMonths: number;
  last12: SavedPurchasePlanSalesTrendWindow;
  recent6: SavedPurchasePlanSalesTrendWindow;
  recent3: SavedPurchasePlanSalesTrendWindow;
  monthlySlopeUnits: number | null;
  monthlySlopePct: number | null;
  direction: SavedPurchasePlanSalesTrendDirection;
  confidence: SavedPurchasePlanSalesTrendConfidence;
  suggestedProjectionPct: number;
  volatilityPct: number | null;
  notes: string[];
}

export interface SavedPurchasePlanListItem extends SavedPurchasePlanHeader {
  departmentCount: number;
  baselineTotalBuy: number;
  currentTotalBuy: number;
}

export interface SavedPurchasePlanAdjustmentRequest {
  departmentKey: string;
  kind: PurchasePlanAdjustmentKind;
  value: number;
  reason: string;
  appliedBy?: string;
}

export interface SavedPurchasePlanRowUpdateRequest {
  currentProjSales?: number;
  currentEohTarget?: number;
  currentBuy?: number;
  reason: string;
  appliedBy?: string;
}

export interface SavedPurchasePlanRowsUpdateRequest {
  rows: Array<{
    rowId: string;
    currentProjSales?: number;
    currentEohTarget?: number;
    currentBuy?: number;
  }>;
  reason: string;
  appliedBy?: string;
}

export interface SavedPurchasePlanCompare {
  plan: SavedPurchasePlanHeader;
  departments: Array<{
    departmentKey: string;
    departmentNumber: number | null;
    departmentLabel: string;
    baselineTotalBuy: number;
    currentTotalBuy: number;
    deltaBuy: number;
    deltaPct: number | null;
  }>;
  totals: SavedPurchasePlanDetail['totals'];
}

export interface SeasonalPurchaseReportRequest {
  departmentNumber: number;
  asOfYearMonth?: string;
  forecast?: {
    method?: PurchasePlanForecastMethod;
    trailingMonths?: number;
    growthPct?: number;
    yearsToBlend?: 2 | 3;
  };
  eohMethod?: PurchasePlanEohMethod;
  coverMonths?: number;
  discountNormalization?: boolean;
  createdBy?: string;
}

export interface SeasonalPurchaseReportValue {
  units: number;
  costHnl: number;
}

export interface SeasonalPurchaseReportWorksheet {
  storeGroupCode: string;
  storeGroupLabel: string | null;
  planId: string;
  planLabel: string;
  autoCreated: boolean;
  duplicateSourceCount: number;
}

export interface SeasonalPurchaseReportSeason {
  season: PurchasePlanningSeason;
  seasonYear: number;
  seasonLabel: string;
  months: string[];
  planId: string;
  planLabel: string;
  autoCreated: boolean;
  duplicateSourceCount: number;
  worksheets: SeasonalPurchaseReportWorksheet[];
  projectedBoh: SeasonalPurchaseReportValue;
  projectedSales: SeasonalPurchaseReportValue;
  baselineBuy: SeasonalPurchaseReportValue;
  draftPos: SeasonalPurchaseReportValue;
  confirmedPos: SeasonalPurchaseReportValue;
  openToBuy: SeasonalPurchaseReportValue;
  projectedEoh: SeasonalPurchaseReportValue;
}

export interface SeasonalPurchaseReportResponse {
  planningScope: PurchasePlanPlanningScope;
  planningScopeLabel: string;
  storeGroupCode: string;
  storeGroupLabel: string | null;
  storeGroupCodes: string[];
  storeGroupLabels: string[];
  warehouseStoreNumbers: number[];
  departmentNumber: number;
  departmentLabel: string;
  year: number;
  asOfYearMonth: string;
  startSeason: PurchasePlanningSeason;
  startSeasonYear: number;
  endSeason: PurchasePlanningSeason;
  endSeasonYear: number;
  projectionMonths: string[];
  workbook: SeasonalPurchaseReportWorksheet;
  seasons: SeasonalPurchaseReportSeason[];
  warnings: string[];
  generatedAt: string;
}

export interface PurchasePlanV3Value {
  units: number;
}

export interface PurchasePlanV3WarehouseDetail {
  skuCode: string;
  skuDescription: string | null;
  startingWarehouseOnHand: number;
  eligibleStoreGroupCodes: string[];
  allocatedUnits: number;
  remainingUnits: number;
  reason: 'eligible_credit' | 'no_chain_tag' | 'no_selected_chain_need';
}

export interface PurchasePlanV3SeasonRow {
  id?: string;
  planId?: string;
  storeGroupCode: string;
  storeGroupLabel: string;
  season: PurchasePlanningSeason;
  seasonYear: number;
  seasonLabel: string;
  seasonMonths: string[];
  projectedBoh: PurchasePlanV3Value;
  projectedSales: PurchasePlanV3Value;
  eohTarget: PurchasePlanV3Value;
  baselineBuy: PurchasePlanV3Value;
  chainOnHand: PurchasePlanV3Value;
  currentOnOrder: PurchasePlanV3Value;
  futureOnOrder: PurchasePlanV3Value;
  nativeOpenPo: PurchasePlanV3Value;
  stockPosition: PurchasePlanV3Value;
  warehouseEligible: PurchasePlanV3Value;
  warehousePlanningCredit: PurchasePlanV3Value;
  warehouseUnallocated: PurchasePlanV3Value;
  totalAvailableForPlan: PurchasePlanV3Value;
  recommendedBuy: PurchasePlanV3Value;
  projectedEoh: PurchasePlanV3Value;
  warehouseDetails: PurchasePlanV3WarehouseDetail[];
}

export interface PurchasePlanV3Header {
  id: string;
  label: string;
  status: 'draft' | 'archived';
  storeGroupCodes: string[];
  departmentNumber: number;
  departmentLabel: string;
  year: number;
  forecastMethod: PurchasePlanForecastMethod;
  eohMethod: PurchasePlanEohMethod;
  coverMonths: number;
  discountNormalization: boolean;
  historyFromYearMonth: string;
  historyToYearMonth: string;
  warehouseStoreNumbers: number[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface PurchasePlanV3Report {
  plan?: PurchasePlanV3Header;
  storeGroups: Array<{ code: string; label: string; storeNumbers: number[] }>;
  departmentNumber: number;
  departmentLabel: string;
  year: number;
  forecastMethod: PurchasePlanForecastMethod;
  eohMethod: PurchasePlanEohMethod;
  coverMonths: number;
  discountNormalization: boolean;
  historyFromYearMonth: string;
  historyToYearMonth: string;
  warehouseStoreNumbers: number[];
  seasons: Array<{
    season: PurchasePlanningSeason;
    seasonYear: number;
    seasonLabel: string;
    months: string[];
    rows: PurchasePlanV3SeasonRow[];
  }>;
  totals: {
    projectedSales: PurchasePlanV3Value;
    baselineBuy: PurchasePlanV3Value;
    warehousePlanningCredit: PurchasePlanV3Value;
    recommendedBuy: PurchasePlanV3Value;
    warehouseUnallocated: PurchasePlanV3Value;
  };
  warnings: string[];
  generatedAt: string;
}

export interface PurchasePlanV3Request {
  storeGroupCodes?: string[];
  departmentNumber: number;
  year: number;
  label?: string;
  forecast?: {
    method?: PurchasePlanForecastMethod;
    trailingMonths?: number;
    growthPct?: number;
    yearsToBlend?: 2 | 3;
  };
  eohMethod?: PurchasePlanEohMethod;
  coverMonths?: number;
  discountNormalization?: boolean;
  createdBy?: string;
}

export interface PurchasePlanV3ListItem extends PurchasePlanV3Header {
  rowCount: number;
  recommendedBuy: number;
  warehousePlanningCredit: number;
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Purchase planning request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function postPurchasePlan(
  request: PurchasePlanRequest,
  signal?: AbortSignal,
): Promise<PurchasePlanResponse> {
  const res = await fetch('/api/v1/purchase-planning/projections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Purchase plan request failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function fetchSavedPurchasePlans(params: {
  status?: 'draft' | 'archived' | 'all';
  storeGroupCode?: string;
} = {}): Promise<SavedPurchasePlanListItem[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.storeGroupCode) qs.set('storeGroupCode', params.storeGroupCode);
  const res = await fetch(`/api/v1/purchase-planning/plans${qs.toString() ? `?${qs}` : ''}`);
  const body = await parseJsonOrThrow<{ plans: SavedPurchasePlanListItem[] }>(res);
  return body.plans;
}

export async function fetchSavedPurchasePlan(id: string): Promise<SavedPurchasePlanDetail> {
  const res = await fetch(`/api/v1/purchase-planning/plans/${encodeURIComponent(id)}`);
  return parseJsonOrThrow<SavedPurchasePlanDetail>(res);
}

export async function createSavedPurchasePlan(
  request: SavedPurchasePlanCreateRequest,
): Promise<SavedPurchasePlanDetail> {
  const res = await fetch('/api/v1/purchase-planning/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parseJsonOrThrow<SavedPurchasePlanDetail>(res);
}

export async function addSavedPurchasePlanAdjustment(
  id: string,
  request: SavedPurchasePlanAdjustmentRequest,
): Promise<SavedPurchasePlanDetail> {
  const res = await fetch(`/api/v1/purchase-planning/plans/${encodeURIComponent(id)}/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parseJsonOrThrow<SavedPurchasePlanDetail>(res);
}

export async function updateSavedPurchasePlanRow(
  id: string,
  rowId: string,
  request: SavedPurchasePlanRowUpdateRequest,
): Promise<SavedPurchasePlanDetail> {
  const res = await fetch(`/api/v1/purchase-planning/plans/${encodeURIComponent(id)}/rows/${encodeURIComponent(rowId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parseJsonOrThrow<SavedPurchasePlanDetail>(res);
}

export async function updateSavedPurchasePlanRows(
  id: string,
  request: SavedPurchasePlanRowsUpdateRequest,
): Promise<SavedPurchasePlanDetail> {
  const res = await fetch(`/api/v1/purchase-planning/plans/${encodeURIComponent(id)}/rows`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parseJsonOrThrow<SavedPurchasePlanDetail>(res);
}

export async function recalculateSavedPurchasePlan(id: string, actor?: string): Promise<SavedPurchasePlanDetail> {
  const res = await fetch(`/api/v1/purchase-planning/plans/${encodeURIComponent(id)}/recalculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor }),
  });
  return parseJsonOrThrow<SavedPurchasePlanDetail>(res);
}

export async function archiveSavedPurchasePlan(id: string, actor?: string): Promise<SavedPurchasePlanDetail> {
  const res = await fetch(`/api/v1/purchase-planning/plans/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor }),
  });
  return parseJsonOrThrow<SavedPurchasePlanDetail>(res);
}

export async function compareSavedPurchasePlan(id: string): Promise<SavedPurchasePlanCompare> {
  const res = await fetch(`/api/v1/purchase-planning/plans/${encodeURIComponent(id)}/compare`);
  return parseJsonOrThrow<SavedPurchasePlanCompare>(res);
}

export async function generateSeasonalPurchaseReport(
  request: SeasonalPurchaseReportRequest,
): Promise<SeasonalPurchaseReportResponse> {
  const res = await fetch('/api/v1/purchase-planning/seasonal-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parseJsonOrThrow<SeasonalPurchaseReportResponse>(res);
}

export async function generatePurchasePlanV3Report(
  request: PurchasePlanV3Request,
): Promise<PurchasePlanV3Report> {
  const res = await fetch('/api/v1/purchase-planning/v3/seasonal-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parseJsonOrThrow<PurchasePlanV3Report>(res);
}

export async function createPurchasePlanV3(
  request: PurchasePlanV3Request,
): Promise<PurchasePlanV3Report> {
  const res = await fetch('/api/v1/purchase-planning/v3/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parseJsonOrThrow<PurchasePlanV3Report>(res);
}

export async function fetchPurchasePlanV3Plans(params: {
  status?: 'draft' | 'archived' | 'all';
} = {}): Promise<PurchasePlanV3ListItem[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  const res = await fetch(`/api/v1/purchase-planning/v3/plans${qs.toString() ? `?${qs}` : ''}`);
  const body = await parseJsonOrThrow<{ plans: PurchasePlanV3ListItem[] }>(res);
  return body.plans;
}

export async function fetchPurchasePlanV3(id: string): Promise<PurchasePlanV3Report> {
  const res = await fetch(`/api/v1/purchase-planning/v3/plans/${encodeURIComponent(id)}`);
  return parseJsonOrThrow<PurchasePlanV3Report>(res);
}

export async function archivePurchasePlanV3(id: string, actor?: string): Promise<PurchasePlanV3Report> {
  const res = await fetch(`/api/v1/purchase-planning/v3/plans/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor }),
  });
  return parseJsonOrThrow<PurchasePlanV3Report>(res);
}
