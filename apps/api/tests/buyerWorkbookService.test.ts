import {
  aggregateAttributeMix,
  calculateSellThroughPct,
  monthsForBuyerSeason,
  summarizeHistoricalTargets,
  type HistoricalMonthMetric,
} from '../src/services/purchasePlanning/buyerWorkbookService';

function month(partial: Partial<HistoricalMonthMetric>): HistoricalMonthMetric {
  return {
    yearMonth: '2025-08',
    quantitySold: 0,
    netSales: 0,
    profit: 0,
    beginningOnHand: 0,
    inventoryValue: 0,
    roiPct: null,
    turns: null,
    newSkuDistinctCount: 0,
    carryoverSkuDistinctCount: 0,
    newSkuUnitsSold: 0,
    carryoverSkuUnitsSold: 0,
    sellThroughPct: null,
    ...partial,
  };
}

describe('buyer workbook helpers', () => {
  it('builds six-month season windows', () => {
    expect(monthsForBuyerSeason('SPRING_SUMMER', 2026)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
    expect(monthsForBuyerSeason('FALL_WINTER', 2026)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
    ]);
  });

  it('averages historical new and carryover SKU targets', () => {
    const summary = summarizeHistoricalTargets([
      month({ quantitySold: 10, netSales: 100, beginningOnHand: 20, newSkuDistinctCount: 2, carryoverSkuDistinctCount: 8 }),
      month({ quantitySold: 14, netSales: 120, beginningOnHand: 30, newSkuDistinctCount: 4, carryoverSkuDistinctCount: 12 }),
    ]);

    expect(summary).toMatchObject({
      sampleMonths: 2,
      totalQuantitySold: 24,
      totalNetSales: 220,
      averageBeginningOnHand: 25,
      suggestedNewSkuCount: 3,
      suggestedCarryoverSkuCount: 10,
    });
  });

  it('keeps sell-through unavailable when inbound availability is unknown', () => {
    expect(calculateSellThroughPct({ unitsSold: 10, beginningInventory: 20, inboundUnits: null })).toBeNull();
    expect(calculateSellThroughPct({ unitsSold: 10, beginningInventory: 20, inboundUnits: undefined })).toBeNull();
    expect(calculateSellThroughPct({ unitsSold: 10, beginningInventory: 20, inboundUnits: 30 })).toBe(20);
  });

  it('aggregates attribute mix sales share and ROI without fabricating sell-through', () => {
    const mix = aggregateAttributeMix([
      {
        dimensionCode: 'color_family',
        dimensionLabel: 'Color Family',
        valueCode: 'black',
        valueLabel: 'Black',
        unitsSold: 30,
        netSales: 300,
        profit: 210,
        inventoryValue: 70,
        skuCount: 3,
      },
      {
        dimensionCode: 'color_family',
        dimensionLabel: 'Color Family',
        valueCode: 'blue',
        valueLabel: 'Blue',
        unitsSold: 10,
        netSales: 100,
        profit: 60,
        inventoryValue: null,
        roiPct: 125,
        skuCount: 1,
      },
    ]);

    expect(mix).toEqual([
      expect.objectContaining({
        dimensionCode: 'color_family',
        dimensionLabel: 'Color Family',
        totalUnitsSold: 40,
        values: [
          expect.objectContaining({ valueCode: 'black', salesPct: 75, roiPct: 300, sellThroughPct: null }),
          expect.objectContaining({ valueCode: 'blue', salesPct: 25, roiPct: 125, sellThroughPct: null }),
        ],
      }),
    ]);
  });
});
