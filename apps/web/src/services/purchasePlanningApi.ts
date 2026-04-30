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
  storeGroupCode: string;
  season: PurchasePlanningSeason;
  seasonYear: number;
  departmentNumbers: number[];
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
  storeGroupCode: string;
  storeGroupLabel: string | null;
  season: PurchasePlanningSeason;
  seasonYear: number;
  seasonMonths: string[];
  selectedDepartments: number[];
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
  storeGroupCode: string;
  departmentNumber: number;
  year: number;
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

export interface SeasonalPurchaseReportSeason {
  season: PurchasePlanningSeason;
  seasonYear: number;
  seasonLabel: string;
  months: string[];
  planId: string;
  planLabel: string;
  autoCreated: boolean;
  duplicateSourceCount: number;
  projectedBoh: SeasonalPurchaseReportValue;
  projectedSales: SeasonalPurchaseReportValue;
  baselineBuy: SeasonalPurchaseReportValue;
  draftPos: SeasonalPurchaseReportValue;
  confirmedPos: SeasonalPurchaseReportValue;
  openToBuy: SeasonalPurchaseReportValue;
  projectedEoh: SeasonalPurchaseReportValue;
}

export interface SeasonalPurchaseReportResponse {
  storeGroupCode: string;
  storeGroupLabel: string | null;
  departmentNumber: number;
  departmentLabel: string;
  year: number;
  seasons: SeasonalPurchaseReportSeason[];
  warnings: string[];
  generatedAt: string;
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
