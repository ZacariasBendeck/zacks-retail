import type { HistoryPoint } from './types';

const DISCOUNT_RATIO_THRESHOLD = 0.80;
const MIN_NORMALIZATION_FACTOR = 0.25;

export interface NormalizedHistoryPoint extends HistoryPoint {
  rawQty: number;
  normalizationFactor: number;
}

export function normalizeDiscountDistortedHistory(
  history: HistoryPoint[],
  enabled: boolean,
): NormalizedHistoryPoint[] {
  return history.map((point) => {
    const rawQty = Math.max(0, Number(point.qty) || 0);
    const netSales = Math.max(0, Number(point.netSales ?? 0));
    const referenceRetail = Math.max(0, Number(point.referenceRetail ?? 0));
    const realizedRatio = rawQty > 0 && referenceRetail > 0 ? netSales / referenceRetail : 1;
    const normalizationFactor = enabled && realizedRatio < DISCOUNT_RATIO_THRESHOLD
      ? Math.max(MIN_NORMALIZATION_FACTOR, realizedRatio / DISCOUNT_RATIO_THRESHOLD)
      : 1;

    return {
      ...point,
      qty: rawQty * normalizationFactor,
      rawQty,
      normalizationFactor,
    };
  });
}

export function summarizeNormalizationByDimMonth(
  points: NormalizedHistoryPoint[],
): Map<string, number> {
  const bucket = new Map<string, { weighted: number; raw: number }>();
  for (const point of points) {
    const key = `${point.dimKey}|${point.yearMonth}`;
    const current = bucket.get(key) ?? { weighted: 0, raw: 0 };
    current.weighted += point.rawQty * point.normalizationFactor;
    current.raw += point.rawQty;
    bucket.set(key, current);
  }
  const out = new Map<string, number>();
  for (const [key, value] of bucket) {
    out.set(key, value.raw > 0 ? value.weighted / value.raw : 1);
  }
  return out;
}
