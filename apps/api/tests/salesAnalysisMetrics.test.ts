import { computeRoiTurnsGp } from '../src/services/salesReporting/metrics';

describe('computeRoiTurnsGp', () => {
  it('returns all nulls when everything is zero', () => {
    expect(
      computeRoiTurnsGp({
        netSales: 0,
        cogs: 0,
        grossProfit: 0,
        onHandAtCost: 0,
        periodDays: 30,
      }),
    ).toEqual({ gpPct: null, turns: null, roiPct: null });
  });

  it('returns null GP% when netSales is zero', () => {
    const m = computeRoiTurnsGp({
      netSales: 0,
      cogs: 0,
      grossProfit: 0,
      onHandAtCost: 1000,
      periodDays: 30,
    });
    expect(m.gpPct).toBeNull();
    expect(m.turns).toBe(0);       // cogs=0 → 0 turns
    expect(m.roiPct).toBe(0);      // grossProfit=0 → 0 ROI
  });

  it('returns null Turns and ROI when onHandAtCost is zero', () => {
    const m = computeRoiTurnsGp({
      netSales: 1000,
      cogs: 400,
      grossProfit: 600,
      onHandAtCost: 0,
      periodDays: 30,
    });
    expect(m.gpPct).toBeCloseTo(60.0, 1);
    expect(m.turns).toBeNull();
    expect(m.roiPct).toBeNull();
  });

  it('returns null when periodDays is zero or negative', () => {
    const m = computeRoiTurnsGp({
      netSales: 1000,
      cogs: 400,
      grossProfit: 600,
      onHandAtCost: 1000,
      periodDays: 0,
    });
    expect(m.turns).toBeNull();
    expect(m.roiPct).toBeNull();
  });

  it('annualizes a typical 30-day period', () => {
    // 30-day window: COGS=1,000, GP=500, inventory=5,000 at cost
    // Turns  = (1000 * 365/30) / 5000 ≈ 2.433
    // ROI%   = (500  * 365/30) / 5000 ≈ 1.217  (× per year)
    // GP%    = 500 / 1500 ≈ 33.3%
    const m = computeRoiTurnsGp({
      netSales: 1500,
      cogs: 1000,
      grossProfit: 500,
      onHandAtCost: 5000,
      periodDays: 30,
    });
    expect(m.gpPct).toBeCloseTo(33.3, 1);
    expect(m.turns).toBeCloseTo(2.433, 2);
    expect(m.roiPct).toBeCloseTo(1.217, 2);
  });

  it('can use average inventory value and a monthly annualizer for RICS MTD columns', () => {
    const m = computeRoiTurnsGp({
      netSales: 6226.08,
      cogs: 2425.68,
      grossProfit: 3800.4,
      onHandAtCost: 1886.64,
      inventoryValueForTurnsRoi: (2156.16 + 1886.64) / 2,
      annualizer: 12,
      periodDays: 30,
    });

    expect(m.turns).toBe(14.4);
    expect(m.roiPct).toBe(22.56);
  });

  it('matches the screenshot reference row (Sector 5 MTD)', () => {
    // From the user's RICS screenshot, Sector 5 ZAPATO MUJER MTD:
    //   Sales=1,075,817.11  Profit=603,482.36  GP=56.1%  onHand value=62,805,409.97
    //   (period ~15 days = MTD mid-April).
    const periodDays = 15;
    const m = computeRoiTurnsGp({
      netSales: 1_075_817.11,
      cogs: 472_334.75,
      grossProfit: 603_482.36,
      onHandAtCost: 62_805_409.97,
      periodDays,
    });
    expect(m.gpPct).toBeCloseTo(56.1, 1);
    const expectedRoi = (603_482.36 * (365 / 15)) / 62_805_409.97;
    // round2() floor for tolerance: precision 2 (< 0.005 diff) matches the
    // helper's 2-decimal rounding; precision 3 would require unrounded output.
    expect(m.roiPct).toBeCloseTo(expectedRoi, 2);
  });
});
