/**
 * Client for the purchase-planning module.
 *
 * Spec: docs/modules/purchase-planning.md
 * API: POST /api/v1/purchase-planning/projections
 */

export type PurchasePlanDimension = 'department' | 'category' | 'vendor';

export type PurchasePlanForecastMethod =
  | 'sameMonthLastYear'
  | 'trailingAverage'
  | 'yoyGrowth'
  | 'blendedMultiYear';

export type PurchasePlanEohMethod = 'forward' | 'seasonal';

export interface PurchasePlanRequest {
  dimension: PurchasePlanDimension;
  storeNumbers: number[];
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
