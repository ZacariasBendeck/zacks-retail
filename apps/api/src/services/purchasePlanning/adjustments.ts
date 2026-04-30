import type { PurchasePlanAdjustmentKind, PurchasePlanSavedRow } from './types';

export function distributeSeasonTotal(
  rows: PurchasePlanSavedRow[],
  targetTotal: number,
): PurchasePlanSavedRow[] {
  const cleanTarget = Math.max(0, Math.round(targetTotal));
  if (rows.length === 0) return [];

  const weights = rows.map((row) => Math.max(0, row.currentProjSales));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const effectiveWeights = weightTotal > 0
    ? weights
    : rows.map((row) => Math.max(0, row.currentBuy));
  const effectiveTotal = effectiveWeights.reduce((sum, value) => sum + value, 0);
  const finalWeights = effectiveTotal > 0 ? effectiveWeights : rows.map(() => 1);
  const finalTotal = finalWeights.reduce((sum, value) => sum + value, 0);

  const allocations = finalWeights.map((weight) => Math.floor((cleanTarget * weight) / finalTotal));
  let remainder = cleanTarget - allocations.reduce((sum, value) => sum + value, 0);
  for (let i = 0; remainder > 0 && i < allocations.length; i++, remainder--) {
    allocations[i] += 1;
  }

  let runningBoh = rows[0].currentBoh;
  return rows.map((row, index) => {
    const currentBuy = allocations[index] ?? 0;
    const currentEohActual = runningBoh + currentBuy - row.currentProjSales;
    const next = {
      ...row,
      currentBoh: runningBoh,
      currentBuy,
      currentEohActual,
    };
    runningBoh = currentEohActual;
    return next;
  });
}

export function applySeasonTotalAdjustment(
  rows: PurchasePlanSavedRow[],
  kind: PurchasePlanAdjustmentKind,
  value: number,
): PurchasePlanSavedRow[] {
  const currentTotal = rows.reduce((sum, row) => sum + row.currentBuy, 0);
  const targetTotal = kind === 'percent_lift'
    ? currentTotal * (1 + value / 100)
    : value;
  return distributeSeasonTotal(rows, targetTotal);
}
