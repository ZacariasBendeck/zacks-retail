import {
  buildDepartmentSeasonalityRows,
  calculateSeasonalityIndexes,
  forecastSeasonalDemand,
  lastCompletedYearMonth,
} from '../src/services/seasonalityIndexService';

describe('seasonality index math', () => {
  it('normalizes monthly sales around a 1.00 average', () => {
    const { averageMonthlyQty, indexes } = calculateSeasonalityIndexes([
      0, 50, 50, 25, 50, 75, 50, 50, 50, 50, 50, 100,
    ]);

    expect(averageMonthlyQty).toBeCloseTo(50);
    expect(indexes[3]).toBe(0.5);
    expect(indexes[5]).toBe(1.5);
    expect(indexes[11]).toBe(2);
  });

  it('falls back to neutral indexes when history is empty', () => {
    const { averageMonthlyQty, indexes } = calculateSeasonalityIndexes(new Array(12).fill(0));

    expect(averageMonthlyQty).toBe(0);
    expect(indexes).toEqual(new Array(12).fill(1));
  });

  it('defaults seasonality history to the last completed month', () => {
    expect(lastCompletedYearMonth(new Date('2026-04-29T18:00:00.000Z'))).toBe('2026-03');
  });

  it('builds department rows with raw sales and indexes', () => {
    const rows = buildDepartmentSeasonalityRows([
      { departmentNumber: 5, departmentLabel: '5 - Shoes', yearMonth: '2026-04', quantity: 20 },
      { departmentNumber: 5, departmentLabel: '5 - Shoes', yearMonth: '2026-06', quantity: 40 },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].totalSalesQty).toBe(60);
    expect(rows[0].months[3].rawSalesQty).toBe(20);
    expect(rows[0].months[5].rawSalesQty).toBe(40);
  });

  it('de-seasonalizes history and re-seasonalizes forecast months', () => {
    const indexes = new Map<number, number>([
      [4, 0.5],
      [5, 1],
      [6, 2],
    ]);
    const forecast = forecastSeasonalDemand(
      [
        { yearMonth: '2026-04', quantity: 10 },
        { yearMonth: '2026-05', quantity: 20 },
      ],
      indexes,
      ['2026-05', '2026-06'],
    );

    // April 10 / 0.5 = 20, May 20 / 1 = 20, baseline = 20.
    // Forecast May + Jun = 20*1 + 20*2 = 60.
    expect(forecast.activeMonths).toBe(2);
    expect(forecast.baselineMonthlyQty).toBe(20);
    expect(forecast.forecastQty).toBe(60);
  });
});
