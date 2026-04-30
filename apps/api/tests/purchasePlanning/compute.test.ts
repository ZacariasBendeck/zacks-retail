import { computePlan, computePlanWithInventoryPosition } from '../../src/services/purchasePlanning/compute';
import type { ProjectedPoint } from '../../src/services/purchasePlanning/types';

function makeProj(dimKey: string, rows: Array<[string, number]>): ProjectedPoint[] {
  return rows.map(([yearMonth, projQty]) => ({ dimKey, yearMonth, projQty }));
}

function monthRange(startYm: string, count: number): string[] {
  const out: string[] = [];
  const y = Number(startYm.slice(0, 4));
  const m = Number(startYm.slice(5, 7));
  for (let i = 0; i < count; i++) {
    const total = y * 12 + (m - 1) + i;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    out.push(`${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`);
  }
  return out;
}

describe('computePlan — forward EOH', () => {
  it('computes BOH rollover and Buy across a 3-month horizon', () => {
    // Projection for VEND-A: 30, 40, 50 units per month.
    const proj = makeProj('VEND-A', [
      ['2026-05', 30],
      ['2026-06', 40],
      ['2026-07', 50],
    ]);
    const onHand = new Map<string, number>([['VEND-A', 100]]);
    const horizon = ['2026-05', '2026-06', '2026-07'];
    const rows = computePlan(proj, onHand, horizon, {
      eohMethod: 'forward',
      coverMonths: 1,
    });

    // Month 1 (May): BOH=100, ProjSales=30, EOH_Target = next 1 month projection = 40.
    //   Buy = max(0, 30 + 40 - 100) = 0. EOH_Actual = 100 + 0 - 30 = 70.
    // Month 2 (Jun): BOH=70, ProjSales=40, EOH_Target = 50.
    //   Buy = max(0, 40 + 50 - 70) = 20. EOH_Actual = 70 + 20 - 40 = 50.
    // Month 3 (Jul): BOH=50, ProjSales=50, EOH_Target extrapolates past horizon.
    //   The projection has no 2026-08 and no 2025-08 entry, so forward cover = 0.
    //   Buy = max(0, 50 + 0 - 50) = 0. EOH_Actual = 50 + 0 - 50 = 0.
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      yearMonth: '2026-05', boh: 100, projSales: 30, eohTarget: 40, buy: 0, eohActual: 70,
    });
    expect(rows[1]).toMatchObject({
      yearMonth: '2026-06', boh: 70, projSales: 40, eohTarget: 50, buy: 20, eohActual: 50,
    });
    expect(rows[2]).toMatchObject({
      yearMonth: '2026-07', boh: 50, projSales: 50, eohTarget: 0, buy: 0, eohActual: 0,
    });
  });

  it('clamps Buy at zero when BOH is more than enough to cover', () => {
    const proj = makeProj('V', [['2026-05', 10], ['2026-06', 10]]);
    const onHand = new Map<string, number>([['V', 1000]]);
    const rows = computePlan(proj, onHand, ['2026-05', '2026-06'], {
      eohMethod: 'forward',
      coverMonths: 1,
    });
    expect(rows[0].buy).toBe(0);
    expect(rows[1].buy).toBe(0);
  });

  it('sums multiple forward months for the EOH target', () => {
    const proj = makeProj('V', [
      ['2026-05', 10],
      ['2026-06', 20],
      ['2026-07', 30],
      ['2026-08', 40],
    ]);
    const onHand = new Map<string, number>([['V', 0]]);
    const rows = computePlan(proj, onHand, ['2026-05', '2026-06', '2026-07', '2026-08'], {
      eohMethod: 'forward',
      coverMonths: 3,
    });
    // Month 1 (May): target = 20 + 30 + 40 = 90.
    //   Buy = 10 + 90 - 0 = 100. EOH_Actual = 0 + 100 - 10 = 90.
    expect(rows[0].eohTarget).toBe(90);
    expect(rows[0].buy).toBe(100);
    expect(rows[0].eohActual).toBe(90);
  });

  it('treats a missing dimKey in onHand as zero BOH for month 1', () => {
    const proj = makeProj('V', [['2026-05', 10], ['2026-06', 10]]);
    const onHand = new Map<string, number>(); // no entry for V
    const rows = computePlan(proj, onHand, ['2026-05', '2026-06'], {
      eohMethod: 'forward',
      coverMonths: 1,
    });
    expect(rows[0].boh).toBe(0);
    expect(rows[0].buy).toBe(10 + 10 - 0); // 20
  });
});

describe('computePlan — seasonal EOH', () => {
  /**
   * Build a projection for V where the target month has `projSales` units
   * and Dec has `decProj` units. When the target month IS Dec, the two
   * collapse (projSales wins — Dec's own projection doubles as its decProj).
   */
  function seasonalPlan(monthNum: number, projSales: number, decProj: number) {
    const ym = `2026-${String(monthNum).padStart(2, '0')}`;
    const proj: ProjectedPoint[] = [{ dimKey: 'V', yearMonth: ym, projQty: projSales }];
    if (monthNum !== 12) {
      proj.push({ dimKey: 'V', yearMonth: '2026-12', projQty: decProj });
    }
    const horizon = monthRange('2026-01', 12);
    return computePlan(proj, new Map([['V', 0]]), horizon, {
      eohMethod: 'seasonal',
    }).find((r) => r.yearMonth === ym)!;
  }

  it('uses the ×8 multiplier for Feb–Aug', () => {
    for (const m of [2, 3, 4, 5, 6, 7, 8]) {
      const row = seasonalPlan(m, 10, 100);
      expect(row.eohTarget).toBe(80); // 10 * 8, no Christmas build-up
    }
  });

  it('adds Dec × 0.75 for Sep and Oct', () => {
    const sep = seasonalPlan(9, 10, 100);
    const oct = seasonalPlan(10, 10, 100);
    expect(sep.eohTarget).toBe(80 + 75); // 10*8 + 100*0.75
    expect(oct.eohTarget).toBe(80 + 75);
  });

  it('adds Dec × 0.25 for Nov', () => {
    const nov = seasonalPlan(11, 10, 100);
    expect(nov.eohTarget).toBe(80 + 25); // 10*8 + 100*0.25
  });

  it('uses the ×5 multiplier for Dec and Jan (drawdown)', () => {
    const dec = seasonalPlan(12, 10, 100); // decProj ignored — Dec's own projSales is its decProj
    const jan = seasonalPlan(1, 10, 100);
    expect(dec.eohTarget).toBe(50); // 10 * 5
    expect(jan.eohTarget).toBe(50);
  });

  it('zero Dec projection leaves the build-up branches at their base ×8 value', () => {
    const sep = seasonalPlan(9, 25, 0);
    expect(sep.eohTarget).toBe(200); // 25 * 8 + 0 * 0.75
  });
});

describe('computePlan — multi-dim, full running walk', () => {
  it('produces a row rectangle sorted by dimKey, with independent running BOH per dim', () => {
    const proj: ProjectedPoint[] = [
      { dimKey: 'A', yearMonth: '2026-05', projQty: 10 },
      { dimKey: 'A', yearMonth: '2026-06', projQty: 10 },
      { dimKey: 'B', yearMonth: '2026-05', projQty: 100 },
      { dimKey: 'B', yearMonth: '2026-06', projQty: 100 },
    ];
    const onHand = new Map<string, number>([
      ['A', 50],
      ['B', 5],
    ]);
    const rows = computePlan(proj, onHand, ['2026-05', '2026-06'], {
      eohMethod: 'forward',
      coverMonths: 1,
    });

    // A: month 1 BOH=50, proj=10, target=10, buy=0, eoh=40.
    //    month 2 BOH=40, proj=10, target=0 (no future), buy=0, eoh=30.
    // B: month 1 BOH=5,  proj=100, target=100, buy=195, eoh=100.
    //    month 2 BOH=100, proj=100, target=0, buy=0, eoh=0.
    expect(rows.map((r) => `${r.dimKey}/${r.yearMonth}/${r.boh}/${r.buy}/${r.eohActual}`)).toEqual([
      'A/2026-05/50/0/40',
      'A/2026-06/40/0/30',
      'B/2026-05/5/195/100',
      'B/2026-06/100/0/0',
    ]);
  });

  it('emits a row rectangle for dimKeys that only appear in onHand (no history)', () => {
    const proj: ProjectedPoint[] = [];
    const onHand = new Map<string, number>([['V', 20]]);
    const rows = computePlan(proj, onHand, ['2026-05'], {
      eohMethod: 'forward',
      coverMonths: 1,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dimKey: 'V', boh: 20, projSales: 0, buy: 0, eohActual: 20,
    });
  });
});

describe('computePlanWithInventoryPosition', () => {
  it('starts the plan from on-hand plus on-order and native open POs', () => {
    const proj = makeProj('D', [['2026-02', 40], ['2026-03', 20]]);
    const rows = computePlanWithInventoryPosition(
      proj,
      new Map([['D', { onHand: 10, currentOnOrder: 15, futureOnOrder: 20, nativeOpenPo: 5 }]]),
      ['2026-02', '2026-03'],
      { eohMethod: 'forward', coverMonths: 1 },
    );

    expect(rows[0]).toMatchObject({
      boh: 50,
      stockPosition: 50,
      onHand: 10,
      currentOnOrder: 15,
      futureOnOrder: 20,
      nativeOpenPo: 5,
      buy: 10,
    });
  });

  it('projects season-start BOH by consuming forecast demand before the horizon', () => {
    const proj = makeProj('D', [
      ['2026-05', 20],
      ['2026-06', 30],
      ['2026-11', 40],
      ['2026-12', 10],
    ]);
    const rows = computePlanWithInventoryPosition(
      proj,
      new Map([['D', { onHand: 100, currentOnOrder: 0, futureOnOrder: 0, nativeOpenPo: 0 }]]),
      ['2026-11', '2026-12'],
      {
        eohMethod: 'forward',
        coverMonths: 1,
        preHorizonYearMonths: ['2026-05', '2026-06'],
      },
    );

    expect(rows[0]).toMatchObject({
      yearMonth: '2026-11',
      boh: 50,
      stockPosition: 100,
      buy: 0,
      eohActual: 10,
    });
    expect(rows[1]).toMatchObject({
      yearMonth: '2026-12',
      boh: 10,
    });
  });
});
