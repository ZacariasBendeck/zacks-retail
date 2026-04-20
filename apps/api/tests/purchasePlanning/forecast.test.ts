import { forecast, shiftYearMonth } from '../../src/services/purchasePlanning/forecast';
import type { HistoryPoint } from '../../src/services/purchasePlanning/types';

function buildHistory(dimKey: string, rows: Array<[string, number]>): HistoryPoint[] {
  return rows.map(([yearMonth, qty]) => ({ dimKey, yearMonth, qty }));
}

describe('shiftYearMonth', () => {
  it('shifts within the same year', () => {
    expect(shiftYearMonth('2026-04', 3)).toBe('2026-07');
  });
  it('rolls forward across a year boundary', () => {
    expect(shiftYearMonth('2026-11', 3)).toBe('2027-02');
  });
  it('rolls backward across a year boundary', () => {
    expect(shiftYearMonth('2026-02', -3)).toBe('2025-11');
  });
  it('handles -12 exactly one year back', () => {
    expect(shiftYearMonth('2026-04', -12)).toBe('2025-04');
  });
});

describe('forecast — sameMonthLastYear', () => {
  it('returns the prior-year qty for the same calendar month', () => {
    const history = buildHistory('VEND-A', [
      ['2025-01', 100],
      ['2025-02', 80],
      ['2025-03', 90],
    ]);
    const horizon = ['2026-01', '2026-02', '2026-03'];
    const out = forecast(history, 'sameMonthLastYear', {}, horizon);
    expect(out).toEqual([
      { dimKey: 'VEND-A', yearMonth: '2026-01', projQty: 100 },
      { dimKey: 'VEND-A', yearMonth: '2026-02', projQty: 80 },
      { dimKey: 'VEND-A', yearMonth: '2026-03', projQty: 90 },
    ]);
  });

  it('projects 0 when there is no prior-year data', () => {
    const history = buildHistory('VEND-B', [['2025-06', 50]]);
    const out = forecast(history, 'sameMonthLastYear', {}, ['2026-01', '2026-06']);
    expect(out.find((r) => r.yearMonth === '2026-01')?.projQty).toBe(0);
    expect(out.find((r) => r.yearMonth === '2026-06')?.projQty).toBe(50);
  });
});

describe('forecast — trailingAverage', () => {
  it('averages the last N months anchored to one year before the horizon month', () => {
    // For horizon 2026-04 with N=3, the anchor is 2025-04 (horizon - 12).
    // We walk back 3 months: 2025-04, 2025-03, 2025-02.
    const history = buildHistory('CAT-1', [
      ['2025-02', 60],
      ['2025-03', 90],
      ['2025-04', 120],
      ['2025-05', 999], // should NOT be included
    ]);
    const out = forecast(
      history,
      'trailingAverage',
      { trailingMonths: 3 },
      ['2026-04'],
    );
    expect(out[0].projQty).toBeCloseTo((60 + 90 + 120) / 3);
  });

  it('handles N=6 with partial history gracefully (only existing months count)', () => {
    const history = buildHistory('CAT-2', [
      ['2025-03', 30],
      ['2025-04', 60],
    ]);
    const out = forecast(
      history,
      'trailingAverage',
      { trailingMonths: 6 },
      ['2026-04'],
    );
    // Anchor = 2025-04; walk back 6 months including 2025-04 itself;
    // only 2025-04 and 2025-03 have data. Average = (60 + 30) / 2 = 45.
    expect(out[0].projQty).toBe(45);
  });

  it('defaults trailingMonths to 6 when omitted', () => {
    const history: HistoryPoint[] = [];
    // Pushes a single dimKey via the on-hand-only path by including it in history.
    history.push({ dimKey: 'D', yearMonth: '2024-11', qty: 10 });
    history.push({ dimKey: 'D', yearMonth: '2024-12', qty: 20 });
    history.push({ dimKey: 'D', yearMonth: '2025-01', qty: 30 });
    history.push({ dimKey: 'D', yearMonth: '2025-02', qty: 40 });
    history.push({ dimKey: 'D', yearMonth: '2025-03', qty: 50 });
    history.push({ dimKey: 'D', yearMonth: '2025-04', qty: 60 });
    const out = forecast(history, 'trailingAverage', {}, ['2026-04']);
    // Anchor 2025-04; back 6: 2025-04..2024-11. Sum = 60+50+40+30+20+10 = 210; /6 = 35.
    expect(out[0].projQty).toBe(35);
  });
});

describe('forecast — yoyGrowth', () => {
  it('applies a positive growth factor to same-month-last-year', () => {
    const history = buildHistory('V', [['2025-04', 100]]);
    const out = forecast(history, 'yoyGrowth', { growthPct: 10 }, ['2026-04']);
    expect(out[0].projQty).toBeCloseTo(110);
  });

  it('applies a negative growth factor', () => {
    const history = buildHistory('V', [['2025-04', 100]]);
    const out = forecast(history, 'yoyGrowth', { growthPct: -5 }, ['2026-04']);
    expect(out[0].projQty).toBeCloseTo(95);
  });

  it('clamps to 0 when growthPct is steeply negative', () => {
    const history = buildHistory('V', [['2025-04', 100]]);
    const out = forecast(history, 'yoyGrowth', { growthPct: -150 }, ['2026-04']);
    expect(out[0].projQty).toBe(0);
  });

  it('defaults growthPct to 0 when omitted (behaves like sameMonthLastYear)', () => {
    const history = buildHistory('V', [['2025-04', 77]]);
    const out = forecast(history, 'yoyGrowth', {}, ['2026-04']);
    expect(out[0].projQty).toBe(77);
  });
});

describe('forecast — blendedMultiYear', () => {
  it('averages same-month across 2 prior years by default', () => {
    const history = buildHistory('V', [
      ['2024-04', 80],
      ['2025-04', 120],
    ]);
    const out = forecast(history, 'blendedMultiYear', {}, ['2026-04']);
    expect(out[0].projQty).toBe(100);
  });

  it('averages across 3 prior years when configured', () => {
    const history = buildHistory('V', [
      ['2023-04', 60],
      ['2024-04', 80],
      ['2025-04', 100],
    ]);
    const out = forecast(
      history,
      'blendedMultiYear',
      { yearsToBlend: 3 },
      ['2026-04'],
    );
    expect(out[0].projQty).toBe(80);
  });

  it('falls back silently when 3 years are requested but only 2 exist', () => {
    const history = buildHistory('V', [
      ['2024-04', 80],
      ['2025-04', 120],
      // no 2023-04 row
    ]);
    const out = forecast(
      history,
      'blendedMultiYear',
      { yearsToBlend: 3 },
      ['2026-04'],
    );
    expect(out[0].projQty).toBe(100); // average of the two available years
  });

  it('returns 0 when no prior-year data exists at all', () => {
    const history = buildHistory('V', [['2025-06', 100]]); // wrong month
    const out = forecast(history, 'blendedMultiYear', {}, ['2026-04']);
    expect(out[0].projQty).toBe(0);
  });
});

describe('forecast — multi-dim', () => {
  it('produces a full rectangle (dimKey × horizon) in deterministic order', () => {
    const history: HistoryPoint[] = [
      { dimKey: 'B', yearMonth: '2025-04', qty: 50 },
      { dimKey: 'A', yearMonth: '2025-04', qty: 10 },
      { dimKey: 'A', yearMonth: '2025-05', qty: 20 },
    ];
    const horizon = ['2026-04', '2026-05'];
    const out = forecast(history, 'sameMonthLastYear', {}, horizon);
    // Dimensions come back sorted; each gets both horizon months.
    expect(out.map((r) => `${r.dimKey}/${r.yearMonth}/${r.projQty}`)).toEqual([
      'A/2026-04/10',
      'A/2026-05/20',
      'B/2026-04/50',
      'B/2026-05/0',
    ]);
  });
});
