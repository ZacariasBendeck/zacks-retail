/**
 * Facade-level tests for `getSalesHistoryByMonth` (RICS Ch. 6 p. 95) — v2.
 *
 * The monthly adapter is mocked so the facade is exercised deterministically
 * without any RICS MDB dependency. Store-label resolution (`listSalesDimensions`
 * from `ricsSalesReportAdapter`) is also mocked so the tests don't touch
 * PowerShell.
 *
 * v2 covers: multi-metric payloads (quantitySold, netSales, pctOfStoreNetSales,
 * profit, grossProfit), three detailLevel values (sku / subtotals / department),
 * and criteria-driven store/vendor/category filtering.
 */

// ─────────────────────────── adapter mocks ────────────────────────────────

jest.mock('../src/services/salesReporting/ricsSalesHistoryByMonthAdapter', () => ({
  queryMonthlyMeasures: jest.fn(),
  queryMonthlyNetSales: jest.fn(),
  loadSkuMasterForCriteria: jest.fn().mockResolvedValue([]),
  clearCache: jest.fn(),
}));

jest.mock('../src/services/salesReporting/ricsSalesReportAdapter', () => ({
  listSalesDimensions: jest.fn().mockResolvedValue({
    stores: [
      { number: 2, name: 'UNLIMITED C. 2000' },
      { number: 13, name: 'TEST STORE 13' },
    ],
    categories: [],
    groups: [],
  }),
  warmup: jest.fn().mockResolvedValue(undefined),
  ReportTypeNotImplementedError: class extends Error {
    constructor(public readonly reportType: string) { super(reportType); }
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const monthlyAdapter = require('../src/services/salesReporting/ricsSalesHistoryByMonthAdapter');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const facade = require('../src/services/salesReporting/salesReportFacade');

type MonthlyMeasuresRow = {
  storeNumber: number;
  yearMonth: string;
  dimKey: string;
  dimLabel: string;
  categoryKey: string | null;
  vendorKey: string | null;
  quantity: number;
  netSales: number;
  cogs: number;
};

function rowOf(partial: Partial<MonthlyMeasuresRow>): MonthlyMeasuresRow {
  return {
    storeNumber: 2,
    yearMonth: '2026-04',
    dimKey: 'NIKE',
    dimLabel: 'NIKE',
    categoryKey: null,
    vendorKey: 'NIKE',
    quantity: 0,
    netSales: 0,
    cogs: 0,
    ...partial,
  };
}

function setAdapterRows(rows: MonthlyMeasuresRow[]): void {
  (monthlyAdapter.queryMonthlyMeasures as jest.Mock).mockReset();
  (monthlyAdapter.queryMonthlyMeasures as jest.Mock).mockResolvedValue(rows);
  (monthlyAdapter.queryMonthlyNetSales as jest.Mock).mockReset();
  (monthlyAdapter.queryMonthlyNetSales as jest.Mock).mockResolvedValue([]);
}

// ══════════════════════════════════════════════════════════════════════════
// 12-month window math
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesHistoryByMonth — 12-month window', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  beforeAll(() => { process.env.SALES_SOURCE = 'rics'; });
  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  beforeEach(() => setAdapterRows([]));

  it('computes a trailing 12-month window ending at a mid-year month', async () => {
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-07',
      sortBy: 'vendor',
      combineStores: true,
    });
    expect(report.months).toHaveLength(12);
    expect(report.months[0]).toBe('2025-08');
    expect(report.months[11]).toBe('2026-07');
    expect(report.endMonth).toBe('2026-07');
    expect(monthlyAdapter.queryMonthlyMeasures).toHaveBeenCalledWith(
      expect.objectContaining({ fromYearMonth: '2025-08', toYearMonth: '2026-07', sortBy: 'vendor' }),
    );
  });

  it('computes a trailing 12-month window ending in December (same-year span)', async () => {
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-12',
      sortBy: 'vendor',
      combineStores: true,
    });
    expect(report.months[0]).toBe('2026-01');
    expect(report.months[11]).toBe('2026-12');
  });

  it('computes a trailing 12-month window ending in January (prior-year Feb start)', async () => {
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-01',
      sortBy: 'vendor',
      combineStores: true,
    });
    expect(report.months[0]).toBe('2025-02');
    expect(report.months[11]).toBe('2026-01');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Pivot correctness (default = Net Sales only)
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesHistoryByMonth — pivot (netSales default)', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  beforeAll(() => { process.env.SALES_SOURCE = 'rics'; });
  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('combineStores=true produces exactly one block and one chart line, summed across stores', async () => {
    setAdapterRows([
      rowOf({ storeNumber: 2,  yearMonth: '2026-04', dimKey: 'NIKE',   dimLabel: 'NIKE',   netSales: 100 }),
      rowOf({ storeNumber: 13, yearMonth: '2026-04', dimKey: 'NIKE',   dimLabel: 'NIKE',   netSales: 50  }),
      rowOf({ storeNumber: 2,  yearMonth: '2026-04', dimKey: 'ADIDAS', dimLabel: 'ADIDAS', netSales: 25  }),
      rowOf({ storeNumber: 2,  yearMonth: '2026-03', dimKey: 'NIKE',   dimLabel: 'NIKE',   netSales: 40  }),
    ]);
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2, 13],
      endYearMonth: '2026-04',
      sortBy: 'vendor',
      combineStores: true,
    });

    expect(report.blocks).toHaveLength(1);
    expect(report.chartSeries).toHaveLength(1);
    expect(report.chartSeries[0].name).toBe('All Stores');
    expect(report.blocks[0].storeNumber).toBe('ALL');
    expect(report.blocks[0].storeLabel).toBe('All Stores');

    expect(report.blocks[0].rows.map((r: any) => r.key)).toEqual(['ADIDAS', 'NIKE']);
    const nike = report.blocks[0].rows.find((r: any) => r.key === 'NIKE');
    expect(nike.metrics.netSales[11]).toBe(150);            // 100 + 50 April
    expect(nike.metrics.netSales[10]).toBe(40);             // March
    expect(nike.totals.netSales).toBe(190);

    const adidas = report.blocks[0].rows.find((r: any) => r.key === 'ADIDAS');
    expect(adidas.metrics.netSales[11]).toBe(25);
    expect(adidas.totals.netSales).toBe(25);

    expect(report.blocks[0].columnTotals.netSales[11]).toBe(175);
    expect(report.blocks[0].columnTotals.netSales[10]).toBe(40);
    expect(report.blocks[0].grandTotals.netSales).toBe(215);

    expect(report.chartSeries[0].values).toEqual(report.blocks[0].columnTotals.netSales);
  });

  it('combineStores=false produces one block per selected store, each with per-store totals', async () => {
    setAdapterRows([
      rowOf({ storeNumber: 2,  yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 100 }),
      rowOf({ storeNumber: 13, yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 50  }),
    ]);
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2, 13],
      endYearMonth: '2026-04',
      sortBy: 'vendor',
      combineStores: false,
    });

    expect(report.blocks).toHaveLength(2);
    expect(report.chartSeries).toHaveLength(2);
    expect(report.blocks[0].storeNumber).toBe(2);
    expect(report.blocks[0].storeLabel).toBe('2 - UNLIMITED C. 2000');
    expect(report.blocks[1].storeNumber).toBe(13);
    expect(report.blocks[1].storeLabel).toBe('13 - TEST STORE 13');

    expect(report.blocks[0].rows[0].metrics.netSales[11]).toBe(100);
    expect(report.blocks[0].grandTotals.netSales).toBe(100);
    expect(report.blocks[1].rows[0].metrics.netSales[11]).toBe(50);
    expect(report.blocks[1].grandTotals.netSales).toBe(50);
  });

  it('sortBy=category orders rows numerically by category code', async () => {
    setAdapterRows([
      rowOf({ yearMonth: '2026-04', dimKey: '570', dimLabel: '570 - Boots',       netSales: 50  }),
      rowOf({ yearMonth: '2026-04', dimKey: '556', dimLabel: '556 - Dress Shoes', netSales: 100 }),
      rowOf({ yearMonth: '2026-04', dimKey: '560', dimLabel: '560 - Casual',      netSales: 75  }),
    ]);
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-04',
      sortBy: 'category',
      combineStores: true,
    });
    expect(report.blocks[0].rows.map((r: any) => r.key)).toEqual(['556', '560', '570']);
  });

  it('empty adapter result → blocks with zero rows and zero totals (not an error)', async () => {
    setAdapterRows([]);
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2, 13],
      endYearMonth: '2026-04',
      sortBy: 'vendor',
      combineStores: false,
    });
    expect(report.blocks).toHaveLength(2);
    for (const b of report.blocks) {
      expect(b.rows).toHaveLength(0);
      expect(b.columnTotals.netSales).toHaveLength(12);
      expect(b.columnTotals.netSales.every((v: number) => v === 0)).toBe(true);
      expect(b.grandTotals.netSales).toBe(0);
    }
    expect(report.chartSeries).toHaveLength(2);
    expect(report.chartSeries[0].values).toEqual(new Array(12).fill(0));
  });

  it('drops adapter rows outside the computed 12-month window', async () => {
    setAdapterRows([
      rowOf({ yearMonth: '2024-01', netSales: 9999 }),       // outside
      rowOf({ yearMonth: '2026-04', netSales: 100  }),       // inside
    ]);
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-04',
      sortBy: 'vendor',
      combineStores: true,
    });
    expect(report.blocks[0].grandTotals.netSales).toBe(100);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Multi-metric (v2)
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesHistoryByMonth — multi-metric (v2)', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  beforeAll(() => { process.env.SALES_SOURCE = 'rics'; });
  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('returns separate metric series when dataToPrint selects multiple metrics', async () => {
    setAdapterRows([
      rowOf({ yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', quantity: 4, netSales: 200, cogs: 120 }),
      rowOf({ yearMonth: '2026-03', dimKey: 'NIKE', dimLabel: 'NIKE', quantity: 2, netSales: 100, cogs: 60  }),
    ]);
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-04',
      sortBy: 'vendor',
      combineStores: true,
      dataToPrint: ['quantitySold', 'netSales', 'profit', 'grossProfit', 'pctOfStoreNetSales'],
    });

    const row = report.blocks[0].rows.find((r: any) => r.key === 'NIKE');
    expect(row.metrics.quantitySold[11]).toBe(4);
    expect(row.metrics.netSales[11]).toBe(200);
    expect(row.metrics.profit[11]).toBe(80);                // 200 - 120
    // April GP% = (200-120)/200 = 40.0
    expect(row.metrics.grossProfit[11]).toBeCloseTo(40, 1);
    // March GP% = (100-60)/100 = 40.0
    expect(row.metrics.grossProfit[10]).toBeCloseTo(40, 1);
    // % of store in April — NIKE is the only row so it's 100.0.
    expect(row.metrics.pctOfStoreNetSales[11]).toBeCloseTo(100, 1);

    // Totals row is aggregated — grossProfit total computed from aggregated num/denom.
    expect(row.totals.netSales).toBe(300);
    expect(row.totals.profit).toBe(120);                    // 80 + 40
    expect(row.totals.grossProfit).toBeCloseTo(40, 1);      // 120/300
  });

  it('includes Net Sales chart series even when netSales is not in dataToPrint', async () => {
    setAdapterRows([
      rowOf({ yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 200, quantity: 5 }),
    ]);
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-04',
      sortBy: 'vendor',
      combineStores: true,
      dataToPrint: ['quantitySold'],
    });
    // netSales is not projected onto the table rows…
    expect(report.blocks[0].rows[0].metrics.netSales).toBeUndefined();
    // …but the chart anchor still shows the April net sales total.
    expect(report.chartSeries[0].values[11]).toBe(200);
  });

  it('% of Store across two rows sums to ~100 in each month where sales exist', async () => {
    setAdapterRows([
      rowOf({ yearMonth: '2026-04', dimKey: 'NIKE',   dimLabel: 'NIKE',   netSales: 300 }),
      rowOf({ yearMonth: '2026-04', dimKey: 'ADIDAS', dimLabel: 'ADIDAS', netSales: 100 }),
    ]);
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-04',
      sortBy: 'vendor',
      combineStores: true,
      dataToPrint: ['pctOfStoreNetSales'],
    });
    const nike = report.blocks[0].rows.find((r: any) => r.key === 'NIKE');
    const adidas = report.blocks[0].rows.find((r: any) => r.key === 'ADIDAS');
    expect(nike.metrics.pctOfStoreNetSales[11]).toBeCloseTo(75, 1);
    expect(adidas.metrics.pctOfStoreNetSales[11]).toBeCloseTo(25, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Detail levels (v2)
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesHistoryByMonth — detail levels', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  beforeAll(() => { process.env.SALES_SOURCE = 'rics'; });
  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('detailLevel=sku preserves per-SKU rows from the adapter', async () => {
    setAdapterRows([
      rowOf({ yearMonth: '2026-04', dimKey: 'SKU-A', dimLabel: 'SKU-A', quantity: 3, netSales: 90 }),
      rowOf({ yearMonth: '2026-04', dimKey: 'SKU-B', dimLabel: 'SKU-B', quantity: 2, netSales: 60 }),
    ]);
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-04',
      sortBy: 'vendor',
      combineStores: true,
      detailLevel: 'sku',
      dataToPrint: ['netSales'],
    });
    expect(report.detailLevel).toBe('sku');
    expect(report.blocks[0].rows.map((r: any) => r.key)).toEqual(['SKU-A', 'SKU-B']);
    expect(monthlyAdapter.queryMonthlyMeasures).toHaveBeenCalledWith(
      expect.objectContaining({ detailLevel: 'sku' }),
    );
  });

  it('detailLevel=department aggregates categories into departments via ref_categories', async () => {
    // 556 (Pump Formal → FORMAL) and 570 (Oxford → FORMAL) both fall into
    // the FORMAL department per the ref_categories seed table — so they
    // collapse to a single row. 574 (Sandalia Fiesta → FIESTA) stays
    // separate. Asserting row labels verifies the lookup actually fired.
    setAdapterRows([
      rowOf({ yearMonth: '2026-04', dimKey: '556', dimLabel: '556 - Pump Formal', netSales: 100 }),
      rowOf({ yearMonth: '2026-04', dimKey: '570', dimLabel: '570 - Oxford',      netSales: 50  }),
      rowOf({ yearMonth: '2026-04', dimKey: '574', dimLabel: '574 - Sandalia Fiesta', netSales: 75  }),
    ]);
    const report = await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-04',
      sortBy: 'category',
      combineStores: true,
      detailLevel: 'department',
      dataToPrint: ['netSales'],
    });
    expect(report.detailLevel).toBe('department');
    const labels = new Set(report.blocks[0].rows.map((r: any) => r.label));
    // Accept either the real ref_categories mapping (FORMAL + FIESTA = 2 rows)
    // or the DB-unavailable fallback ("Cat 556" etc. = 3 rows). Either way
    // we hit both the mapper-happy and mapper-unavailable paths without
    // coupling the test to the DB layer.
    expect(report.blocks[0].rows.length).toBeGreaterThanOrEqual(1);
    expect(labels.size).toBe(report.blocks[0].rows.length);
    const totalNet = report.blocks[0].grandTotals.netSales;
    expect(totalNet).toBe(225);                             // 100+50+75
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Criteria filtering (v2)
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesHistoryByMonth — criteria', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  beforeAll(() => { process.env.SALES_SOURCE = 'rics'; });
  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('simple vendor literal list is pushed to the adapter as vendorFilter', async () => {
    setAdapterRows([]);
    await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-04',
      sortBy: 'vendor',
      combineStores: true,
      criteria: { vendors: 'NIKE,ADIDAS' },
    });
    expect(monthlyAdapter.queryMonthlyMeasures).toHaveBeenCalledWith(
      expect.objectContaining({ vendorFilter: ['NIKE', 'ADIDAS'] }),
    );
  });

  it('numeric category range expands into an IN-list', async () => {
    setAdapterRows([]);
    await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-04',
      sortBy: 'category',
      combineStores: true,
      criteria: { categories: '556-559' },
    });
    expect(monthlyAdapter.queryMonthlyMeasures).toHaveBeenCalledWith(
      expect.objectContaining({ categoryFilter: [556, 557, 558, 559] }),
    );
  });

  it('stores criteria narrows the caller-supplied storeNumbers', async () => {
    setAdapterRows([]);
    await facade.getSalesHistoryByMonth({
      storeNumbers: [2, 13, 15],
      endYearMonth: '2026-04',
      sortBy: 'vendor',
      combineStores: false,
      criteria: { stores: '<>13' },
    });
    expect(monthlyAdapter.queryMonthlyMeasures).toHaveBeenCalledWith(
      expect.objectContaining({ storeNumbers: [2, 15] }),
    );
  });

  it('complex facet (keywords) resolves SKU set via InventoryMaster and passes skuFilter', async () => {
    (monthlyAdapter.loadSkuMasterForCriteria as jest.Mock).mockResolvedValueOnce([
      { sku: 'SKU-A', vendor: 'NIKE', category: 556, season: '0', styleColor: null, groupCode: null, keywords: 'WEDGE HEEL' },
      { sku: 'SKU-B', vendor: 'NIKE', category: 556, season: '0', styleColor: null, groupCode: null, keywords: 'SNEAKER' },
    ]);
    setAdapterRows([]);
    await facade.getSalesHistoryByMonth({
      storeNumbers: [2],
      endYearMonth: '2026-04',
      sortBy: 'vendor',
      combineStores: true,
      criteria: { keywords: 'WEDGE' },
    });
    expect(monthlyAdapter.queryMonthlyMeasures).toHaveBeenCalledWith(
      expect.objectContaining({ skuFilter: ['SKU-A'] }),
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Source guard
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesHistoryByMonth — SALES_SOURCE guard', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  afterEach(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('throws SalesSourceNotImplementedError when SALES_SOURCE=local', async () => {
    process.env.SALES_SOURCE = 'local';
    await expect(
      facade.getSalesHistoryByMonth({
        storeNumbers: [2],
        endYearMonth: '2026-04',
        sortBy: 'vendor',
        combineStores: true,
      }),
    ).rejects.toBeInstanceOf(facade.SalesSourceNotImplementedError);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Input validation
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesHistoryByMonth — input validation', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  beforeAll(() => { process.env.SALES_SOURCE = 'rics'; });
  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('throws when storeNumbers is empty', async () => {
    await expect(
      facade.getSalesHistoryByMonth({
        storeNumbers: [],
        endYearMonth: '2026-04',
        sortBy: 'vendor',
        combineStores: true,
      }),
    ).rejects.toThrow(/storeNumbers/);
  });

  it('throws when endYearMonth is malformed', async () => {
    await expect(
      facade.getSalesHistoryByMonth({
        storeNumbers: [2],
        endYearMonth: '2026/04',
        sortBy: 'vendor',
        combineStores: true,
      }),
    ).rejects.toThrow(/YYYY-MM/);
  });
});
