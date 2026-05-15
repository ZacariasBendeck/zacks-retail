/**
 * Types for the purchase-planning module.
 *
 * Spec: docs/modules/purchase-planning.md
 *
 * These types are the API contract between the facade, the pure compute
 * functions, and the route layer. Keeping them in one file means the pure
 * `forecast.ts` and `compute.ts` files have no RICS imports and can be unit
 * tested in isolation.
 */

export type Dimension = 'department' | 'category' | 'vendor';

export type ForecastMethod =
  | 'holtWinters'
  | 'sameMonthLastYear'
  | 'trailingAverage'
  | 'yoyGrowth'
  | 'blendedMultiYear'
  | 'constrainedDemand';

export interface ForecastParams {
  /** Used when method='trailingAverage'. Default 6. */
  trailingMonths?: number;
  /** Used when method='yoyGrowth'. Signed percent (e.g. 10 = +10%, -5 = -5%). */
  growthPct?: number;
  /** Used when method='blendedMultiYear'. Default 2. */
  yearsToBlend?: 2 | 3;
}

export type EohMethod = 'forward' | 'seasonal';

export interface HistoryPoint {
  dimKey: string;
  /** 'YYYY-MM' — the month the sale occurred. */
  yearMonth: string;
  /** Units sold, net of returns. */
  qty: number;
  netSales?: number;
  referenceRetail?: number;
  beginningOnHand?: number;
}

export interface ProjectedPoint {
  dimKey: string;
  /** 'YYYY-MM' — the forward month the projection applies to. */
  yearMonth: string;
  projQty: number;
}

export interface PlanRow {
  dimKey: string;
  dimLabel: string;
  yearMonth: string;
  boh: number;
  projSales: number;
  eohTarget: number;
  buy: number;
  eohActual: number;
  stockPosition?: number;
  onHand?: number;
  currentOnOrder?: number;
  futureOnOrder?: number;
  nativeOpenPo?: number;
  normalizationFactor?: number | null;
  rawProjSales?: number | null;
}

export interface PlanTotals {
  dimKey: string;
  dimLabel: string;
  currentOnHand: number;
  totalBuy: number;
  totalProjSales: number;
  avgEohActual: number;
  hasHistory: boolean;
}

export interface PlanRequest {
  dimension: Dimension;
  /** When empty or omitted, the facade resolves to every store known to RICS. */
  storeNumbers?: number[];
  forecast: {
    method: ForecastMethod;
  } & ForecastParams;
  eohMethod: EohMethod;
  coverMonths?: number;
  asOfYearMonth?: string;
  filters?: {
    departmentsRaw?: string;
    categoriesRaw?: string;
    vendorsRaw?: string;
  };
}

export interface PlanResponse {
  rows: PlanRow[];
  totals: PlanTotals[];
  meta: {
    asOfYearMonth: string;
    horizonYearMonths: string[];
    onHandAsOf: string;
    generatedAt: string;
    forecastMethod: ForecastMethod;
    eohMethod: EohMethod;
    historyFromYearMonth: string;
    historyToYearMonth: string;
  };
}

export type PurchasePlanSeason = 'spring' | 'summer' | 'fall' | 'winter';
export type SavedPlanStatus = 'draft' | 'archived';
export type PurchasePlanAdjustmentKind = 'percent_lift' | 'absolute_total';
export type PurchasePlanPlanningScope = 'store_group' | 'enterprise';
export type PurchasePlanPlanningDimension = 'department' | 'category';

export interface InventoryPosition {
  onHand: number;
  currentOnOrder: number;
  futureOnOrder: number;
  nativeOpenPo: number;
}

export interface PurchasePlanCreateRequest {
  planningScope?: PurchasePlanPlanningScope;
  planningDimension?: PurchasePlanPlanningDimension;
  storeGroupCode?: string;
  season: PurchasePlanSeason;
  seasonYear: number;
  seasonMonths?: string[];
  departmentNumbers: number[];
  categoryNumbers?: number[];
  label?: string;
  forecast?: {
    method?: ForecastMethod;
  } & ForecastParams;
  eohMethod?: EohMethod;
  coverMonths?: number;
  discountNormalization?: boolean;
  createdBy?: string;
}

export interface PurchasePlanningSeasonalReportRequest {
  departmentNumber: number;
  asOfYearMonth?: string;
  forecast?: {
    method?: ForecastMethod;
  } & ForecastParams;
  eohMethod?: EohMethod;
  coverMonths?: number;
  discountNormalization?: boolean;
  createdBy?: string;
}

export interface PurchasePlanAdjustmentRequest {
  departmentKey: string;
  kind: PurchasePlanAdjustmentKind;
  value: number;
  reason: string;
  appliedBy?: string;
}

export interface PurchasePlanRowUpdateRequest {
  currentProjSales?: number;
  currentEohTarget?: number;
  currentBuy?: number;
  reason: string;
  appliedBy?: string;
}

export interface PurchasePlanRowsUpdateRequest {
  rows: Array<{
    rowId: string;
    currentProjSales?: number;
    currentEohTarget?: number;
    currentBuy?: number;
  }>;
  reason: string;
  appliedBy?: string;
}

export type PurchasePlanRecalculateMode = 'overwrite' | 'preserve_user';

export interface PurchasePlanRecalculateRequest {
  actor?: string;
  forecast?: {
    method?: ForecastMethod;
  } & ForecastParams;
  mode?: PurchasePlanRecalculateMode;
}

export interface PurchasePlanHeader {
  id: string;
  label: string;
  status: SavedPlanStatus;
  planningScope: PurchasePlanPlanningScope;
  planningDimension: PurchasePlanPlanningDimension;
  planningScopeLabel: string;
  storeGroupCode: string;
  storeGroupLabel: string | null;
  season: PurchasePlanSeason;
  seasonYear: number;
  seasonMonths: string[];
  selectedDepartments: number[];
  selectedCategories: number[];
  forecastMethod: ForecastMethod;
  eohMethod: EohMethod;
  coverMonths: number;
  discountNormalization: boolean;
  historyFromYearMonth: string;
  historyToYearMonth: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface PurchasePlanSavedRow {
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

export interface PurchasePlanDepartmentSummary {
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
  months: PurchasePlanSavedRow[];
}

export interface PurchasePlanAdjustment {
  id: string;
  planId: string;
  departmentKey: string;
  kind: PurchasePlanAdjustmentKind;
  value: number;
  reason: string;
  appliedBy: string;
  appliedAt: string;
}

export interface PurchasePlanDetailResponse {
  plan: PurchasePlanHeader;
  departments: PurchasePlanDepartmentSummary[];
  adjustments: PurchasePlanAdjustment[];
  totals: {
    baselineTotalBuy: number;
    currentTotalBuy: number;
    deltaBuy: number;
    totalProjSales: number;
  };
}

export type PurchasePlanSalesTrendDirection =
  | 'increasing'
  | 'decreasing'
  | 'flat'
  | 'insufficient_history';

export type PurchasePlanSalesTrendConfidence = 'high' | 'medium' | 'low';

export interface PurchasePlanSalesTrendWindow {
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

export interface PurchasePlanSalesTrendSummary {
  historyFromYearMonth: string;
  historyToYearMonth: string;
  sampleMonths: number;
  last12: PurchasePlanSalesTrendWindow;
  recent6: PurchasePlanSalesTrendWindow;
  recent3: PurchasePlanSalesTrendWindow;
  monthlySlopeUnits: number | null;
  monthlySlopePct: number | null;
  direction: PurchasePlanSalesTrendDirection;
  confidence: PurchasePlanSalesTrendConfidence;
  suggestedProjectionPct: number;
  volatilityPct: number | null;
  notes: string[];
}

export interface PurchasePlanListItem extends PurchasePlanHeader {
  departmentCount: number;
  baselineTotalBuy: number;
  currentTotalBuy: number;
}

export interface PurchasePlanCompareResponse {
  plan: PurchasePlanHeader;
  departments: Array<{
    departmentKey: string;
    departmentNumber: number | null;
    departmentLabel: string;
    baselineTotalBuy: number;
    currentTotalBuy: number;
    deltaBuy: number;
    deltaPct: number | null;
  }>;
  totals: PurchasePlanDetailResponse['totals'];
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

export interface SeasonalPurchaseReportColumn {
  season: PurchasePlanSeason;
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
  startSeason: PurchasePlanSeason;
  startSeasonYear: number;
  endSeason: PurchasePlanSeason;
  endSeasonYear: number;
  projectionMonths: string[];
  workbook: SeasonalPurchaseReportWorksheet;
  seasons: SeasonalPurchaseReportColumn[];
  warnings: string[];
  generatedAt: string;
}
