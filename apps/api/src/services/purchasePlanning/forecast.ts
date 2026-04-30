/**
 * Pure forecasting functions for the purchase-planning module.
 *
 * No RICS imports, no I/O. Given historical monthly sales points and a method
 * descriptor, project the next N months of sales per dimKey.
 *
 * Spec: docs/modules/purchase-planning.md §"Forecast methods"
 */

import type {
  ForecastMethod,
  ForecastParams,
  HistoryPoint,
  ProjectedPoint,
} from './types';

const DEFAULT_TRAILING_MONTHS = 6;
const DEFAULT_YEARS_TO_BLEND: 2 | 3 = 2;
const HOLT_WINTERS_PERIOD = 12;
const HOLT_WINTERS_MIN_POINTS = 18;

/**
 * Produce a projection point for every (dimKey × horizon month) pair.
 *
 * Any dimKey present in `history` appears in the output; dimKeys with zero
 * history still produce zero-qty projection points for every horizon month
 * so the downstream plan grid has a full rectangle.
 */
export function forecast(
  history: HistoryPoint[],
  method: ForecastMethod,
  params: ForecastParams,
  horizonYearMonths: string[],
): ProjectedPoint[] {
  const byDim = indexHistory(history);
  const dimKeys = [...byDim.keys()].sort();

  const out: ProjectedPoint[] = [];
  for (const dimKey of dimKeys) {
    const series = byDim.get(dimKey)!;
    for (const ym of horizonYearMonths) {
      const projQty = projectOne(series, method, params, ym);
      out.push({ dimKey, yearMonth: ym, projQty });
    }
  }
  return out;
}

function projectOne(
  series: Map<string, number>,
  method: ForecastMethod,
  params: ForecastParams,
  horizonYm: string,
): number {
  switch (method) {
    case 'holtWinters':
      return Math.max(0, holtWinters(series, horizonYm));
    case 'sameMonthLastYear':
      return Math.max(0, sameMonthLastYear(series, horizonYm));
    case 'trailingAverage': {
      const n = Math.max(1, Math.round(params.trailingMonths ?? DEFAULT_TRAILING_MONTHS));
      return Math.max(0, trailingAverage(series, horizonYm, n));
    }
    case 'yoyGrowth': {
      const pct = Number(params.growthPct ?? 0);
      const base = sameMonthLastYear(series, horizonYm);
      return Math.max(0, base * (1 + pct / 100));
    }
    case 'blendedMultiYear': {
      const years = params.yearsToBlend === 3 ? 3 : DEFAULT_YEARS_TO_BLEND;
      return Math.max(0, blendedMultiYear(series, horizonYm, years));
    }
    default:
      // Exhaustive check — TypeScript will error if a case is missing.
      return assertNever(method);
  }
}

function sameMonthLastYear(series: Map<string, number>, horizonYm: string): number {
  const prior = shiftYearMonth(horizonYm, -12);
  return series.get(prior) ?? 0;
}

function trailingAverage(series: Map<string, number>, horizonYm: string, n: number): number {
  let sum = 0;
  let count = 0;
  // Walk backwards starting from (horizonYm - 12), because the first horizon
  // month is the month "after" the last closed month in history. We anchor
  // the trailing window to one year before `horizonYm` so that each horizon
  // month samples the trailing N months of its same-year-ago neighborhood,
  // matching what a buyer running this in Apr-2026 to plan Apr-2027 would
  // want: "average of the 6 months ending Apr-2026".
  const anchor = shiftYearMonth(horizonYm, -12);
  for (let i = 0; i < n; i++) {
    const ym = shiftYearMonth(anchor, -i);
    const qty = series.get(ym);
    if (qty != null) {
      sum += qty;
      count += 1;
    }
  }
  if (count === 0) return 0;
  return sum / count;
}

function blendedMultiYear(
  series: Map<string, number>,
  horizonYm: string,
  years: 2 | 3,
): number {
  let sum = 0;
  let count = 0;
  for (let k = 1; k <= years; k++) {
    const ym = shiftYearMonth(horizonYm, -12 * k);
    const qty = series.get(ym);
    if (qty != null) {
      sum += qty;
      count += 1;
    }
  }
  if (count === 0) return 0;
  return sum / count;
}

function holtWinters(series: Map<string, number>, horizonYm: string): number {
  const points = [...series.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yearMonth, value]) => ({ yearMonth, value: Math.max(0, Number(value) || 0) }));

  if (points.length < HOLT_WINTERS_MIN_POINTS) {
    return blendedMultiYear(series, horizonYm, DEFAULT_YEARS_TO_BLEND) || trailingAverage(series, horizonYm, DEFAULT_TRAILING_MONTHS);
  }

  const firstSeason = points.slice(0, HOLT_WINTERS_PERIOD);
  const secondSeason = points.slice(HOLT_WINTERS_PERIOD, HOLT_WINTERS_PERIOD * 2);
  const firstAvg = average(firstSeason.map((p) => p.value));
  const secondAvg = secondSeason.length === HOLT_WINTERS_PERIOD
    ? average(secondSeason.map((p) => p.value))
    : firstAvg;

  let level = firstAvg;
  let trend = (secondAvg - firstAvg) / HOLT_WINTERS_PERIOD;
  const seasonals = new Array<number>(HOLT_WINTERS_PERIOD).fill(0);
  for (let i = 0; i < HOLT_WINTERS_PERIOD; i++) {
    const values = points.filter((p) => Number(p.yearMonth.slice(5, 7)) === i + 1).map((p) => p.value);
    seasonals[i] = average(values) - firstAvg;
  }

  const alpha = 0.35;
  const beta = 0.10;
  const gamma = 0.25;

  for (let i = 0; i < points.length; i++) {
    const observed = points[i].value;
    const monthIndex = Number(points[i].yearMonth.slice(5, 7)) - 1;
    const prevLevel = level;
    const seasonal = seasonals[monthIndex] ?? 0;
    level = alpha * (observed - seasonal) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonals[monthIndex] = gamma * (observed - level) + (1 - gamma) * seasonal;
  }

  const lastMonth = points[points.length - 1].yearMonth;
  const steps = Math.max(1, monthsBetween(lastMonth, horizonYm));
  const horizonMonthIndex = Number(horizonYm.slice(5, 7)) - 1;
  return level + steps * trend + (seasonals[horizonMonthIndex] ?? 0);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function monthsBetween(fromYm: string, toYm: string): number {
  const fromYear = Number(fromYm.slice(0, 4));
  const fromMonth = Number(fromYm.slice(5, 7));
  const toYear = Number(toYm.slice(0, 4));
  const toMonth = Number(toYm.slice(5, 7));
  return (toYear * 12 + (toMonth - 1)) - (fromYear * 12 + (fromMonth - 1));
}

/** Returns a Map<dimKey, Map<'YYYY-MM', qty>>. Collapses duplicate rows by sum. */
function indexHistory(history: HistoryPoint[]): Map<string, Map<string, number>> {
  const byDim = new Map<string, Map<string, number>>();
  for (const h of history) {
    let inner = byDim.get(h.dimKey);
    if (!inner) {
      inner = new Map();
      byDim.set(h.dimKey, inner);
    }
    inner.set(h.yearMonth, (inner.get(h.yearMonth) ?? 0) + h.qty);
  }
  return byDim;
}

/** Shift a 'YYYY-MM' string by a signed number of months. */
export function shiftYearMonth(ym: string, deltaMonths: number): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const total = year * 12 + (month - 1) + deltaMonths;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
}

function assertNever(x: never): never {
  throw new Error(`Unexpected forecast method: ${String(x)}`);
}
