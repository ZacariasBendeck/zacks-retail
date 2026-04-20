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
  | 'sameMonthLastYear'
  | 'trailingAverage'
  | 'yoyGrowth'
  | 'blendedMultiYear';

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
  storeNumbers: number[];
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
