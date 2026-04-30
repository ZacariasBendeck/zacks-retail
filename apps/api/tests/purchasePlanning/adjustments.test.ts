import { distributeSeasonTotal, applySeasonTotalAdjustment } from '../../src/services/purchasePlanning/adjustments';
import type { PurchasePlanSavedRow } from '../../src/services/purchasePlanning/types';

function row(yearMonth: string, proj: number, buy: number): PurchasePlanSavedRow {
  return {
    id: yearMonth,
    planId: 'plan-1',
    departmentKey: '5',
    departmentNumber: 5,
    departmentLabel: '5 - Shoes',
    yearMonth,
    baselineBoh: 0,
    baselineProjSales: proj,
    baselineEohTarget: 0,
    baselineBuy: buy,
    baselineEohActual: 0,
    currentBoh: 0,
    currentProjSales: proj,
    currentEohTarget: 0,
    currentBuy: buy,
    currentEohActual: 0,
    onHand: 0,
    currentOnOrder: 0,
    futureOnOrder: 0,
    nativeOpenPo: 0,
    stockPosition: 0,
    normalizationFactor: 1,
    rawProjSales: proj,
  };
}

describe('season total adjustments', () => {
  it('distributes an absolute season total by forecast share', () => {
    const rows = distributeSeasonTotal([
      row('2026-02', 10, 0),
      row('2026-03', 20, 0),
      row('2026-04', 30, 0),
    ], 60);

    expect(rows.map((r) => r.currentBuy)).toEqual([10, 20, 30]);
  });

  it('applies a percent lift to the current season total', () => {
    const rows = applySeasonTotalAdjustment([
      row('2026-02', 10, 10),
      row('2026-03', 10, 10),
      row('2026-04', 10, 10),
    ], 'percent_lift', 50);

    expect(rows.reduce((sum, r) => sum + r.currentBuy, 0)).toBe(45);
  });
});
