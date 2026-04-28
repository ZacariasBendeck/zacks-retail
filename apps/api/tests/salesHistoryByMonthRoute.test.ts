/**
 * Route-level integration tests for
 * `GET /api/v1/reports/rics-sales-history-by-month` — v2.
 *
 * The adapter is mocked at the `ricsSalesHistoryByMonthAdapter` boundary so
 * the route → facade → adapter pipeline is exercised end-to-end without any
 * RICS MDB dependency.
 */

// ─────────────────────────── adapter mocks ────────────────────────────────

jest.mock('../src/services/salesReporting/ricsSalesHistoryByMonthAdapter', () => ({
  queryMonthlyMeasures: jest.fn(),
  queryMonthlyNetSales: jest.fn(),
  queryMonthlyInventoryHistory: jest.fn().mockResolvedValue([]),
  queryMonthlyInventoryHistoryRollups: jest.fn().mockResolvedValue([]),
  loadSkuMasterForCriteria: jest.fn().mockResolvedValue([]),
  clearCache: jest.fn(),
}));

// Keep `listSalesDimensions` (used by the facade to resolve store labels)
// from reaching PowerShell. All other exports from the real adapter are kept
// because unrelated routes import them on module load.
jest.mock('../src/services/salesReporting/ricsSalesReportAdapter', () => {
  const actual = jest.requireActual('../src/services/salesReporting/ricsSalesReportAdapter');
  return {
    ...actual,
    listSalesDimensions: jest.fn().mockResolvedValue({
      stores: [
        { number: 2, name: 'UNLIMITED C. 2000' },
        { number: 13, name: 'TEST STORE 13' },
      ],
      categories: [],
      groups: [],
    }),
  };
});

import request from 'supertest';

type MonthlyMeasuresRow = {
  storeNumber: number;
  yearMonth: string;
  dimKey: string;
  dimLabel: string;
  categoryKey: string | null;
  vendorKey: string | null;
  pictureFileName?: string | null;
  quantity: number;
  netSales: number;
  cogs: number;
};

function measureRow(partial: Partial<MonthlyMeasuresRow>): MonthlyMeasuresRow {
  return {
    storeNumber: 2,
    yearMonth: '2026-04',
    dimKey: 'NIKE',
    dimLabel: 'NIKE',
    categoryKey: null,
    vendorKey: 'NIKE',
    pictureFileName: null,
    quantity: 0,
    netSales: 0,
    cogs: 0,
    ...partial,
  };
}

function setAdapterRows(rows: MonthlyMeasuresRow[]): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const monthlyAdapter = require('../src/services/salesReporting/ricsSalesHistoryByMonthAdapter');
  (monthlyAdapter.queryMonthlyMeasures as jest.Mock).mockReset();
  (monthlyAdapter.queryMonthlyMeasures as jest.Mock).mockResolvedValue(rows);
}

// ══════════════════════════════════════════════════════════════════════════
// JSON happy paths
// ══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/rics-sales-history-by-month (JSON)', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  let app: any;

  beforeAll(async () => {
    process.env.SALES_SOURCE = 'rics';
    jest.resetModules();
    app = (await import('../src/app')).default;
  });

  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('returns a valid pivot response with combineStores=true by default', async () => {
    setAdapterRows([
      measureRow({ storeNumber: 2,  yearMonth: '2026-04', dimKey: 'NIKE',   dimLabel: 'NIKE',   netSales: 100 }),
      measureRow({ storeNumber: 13, yearMonth: '2026-04', dimKey: 'NIKE',   dimLabel: 'NIKE',   netSales: 50  }),
      measureRow({ storeNumber: 2,  yearMonth: '2026-03', dimKey: 'ADIDAS', dimLabel: 'ADIDAS', netSales: 25  }),
    ]);

    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2,13&endMonth=2026-04',
    );
    expect(res.status).toBe(200);
    expect(res.body.sortBy).toBe('vendor');
    expect(res.body.endMonth).toBe('2026-04');
    expect(res.body.combineStores).toBe(true);
    expect(res.body.months).toHaveLength(12);
    expect(res.body.months[0]).toBe('2025-05');
    expect(res.body.months[11]).toBe('2026-04');
    expect(res.body.detailLevel).toBe('subtotals');
    expect(res.body.dataToPrint).toEqual(['netSales']);
    expect(res.body.blocks).toHaveLength(1);
    expect(res.body.blocks[0].storeNumber).toBe('ALL');
    expect(res.body.blocks[0].storeLabel).toBe('All Stores');

    const nike = res.body.blocks[0].rows.find((r: any) => r.key === 'NIKE');
    expect(nike.metrics.netSales[11]).toBe(150);
    expect(nike.totals.netSales).toBe(150);
  });

  it('respects combineStores=false and returns one block per store in order', async () => {
    setAdapterRows([
      measureRow({ storeNumber: 2,  yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 100 }),
      measureRow({ storeNumber: 13, yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 50  }),
    ]);

    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2,13&endMonth=2026-04&combineStores=false',
    );
    expect(res.status).toBe(200);
    expect(res.body.combineStores).toBe(false);
    expect(res.body.blocks).toHaveLength(2);
    expect(res.body.blocks[0].storeNumber).toBe(2);
    expect(res.body.blocks[1].storeNumber).toBe(13);
  });

  it('accepts multiple metrics via dataToPrint and returns each as a metric block', async () => {
    setAdapterRows([
      measureRow({ yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', quantity: 4, netSales: 200, cogs: 120 }),
    ]);
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2&endMonth=2026-04&dataToPrint=netSales,profit,grossProfit,quantitySold',
    );
    expect(res.status).toBe(200);
    expect(res.body.dataToPrint).toEqual(['netSales', 'profit', 'grossProfit', 'quantitySold']);
    const nike = res.body.blocks[0].rows[0];
    expect(nike.metrics.quantitySold[11]).toBe(4);
    expect(nike.metrics.profit[11]).toBe(80);
    expect(nike.metrics.grossProfit[11]).toBeCloseTo(40, 1);
  });

  it('accepts detailLevel=sku and propagates to the adapter', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const monthlyAdapter = require('../src/services/salesReporting/ricsSalesHistoryByMonthAdapter');
    setAdapterRows([
      measureRow({ yearMonth: '2026-04', dimKey: 'SKU-A', dimLabel: 'SKU-A', netSales: 100 }),
    ]);
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2&endMonth=2026-04&detailLevel=sku',
    );
    expect(res.status).toBe(200);
    expect(res.body.detailLevel).toBe('sku');
    expect((monthlyAdapter.queryMonthlyMeasures as jest.Mock).mock.calls.at(-1)?.[0]).toMatchObject({
      detailLevel: 'sku',
    });
  });

  it('passes criteria facets through to the adapter', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const monthlyAdapter = require('../src/services/salesReporting/ricsSalesHistoryByMonthAdapter');
    setAdapterRows([]);
    await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2,13&endMonth=2026-04&critVendors=NIKE,ADIDAS&critCategories=556-559',
    );
    expect((monthlyAdapter.queryMonthlyMeasures as jest.Mock).mock.calls.at(-1)?.[0]).toMatchObject({
      vendorFilter: ['NIKE', 'ADIDAS'],
      categoryFilter: [556, 557, 558, 559],
    });
  });

  it('echoes deferredMetrics so the UI can surface Phase-2 notices', async () => {
    setAdapterRows([]);
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2&endMonth=2026-04&deferredMetrics=beginningOnHand,roiPct,turns',
    );
    expect(res.status).toBe(200);
    expect(res.body.deferredMetrics).toEqual(['beginningOnHand', 'roiPct', 'turns']);
  });
});

describe('GET /api/v1/reports/rics-sales-history-by-month (CSV)', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  let app: any;

  beforeAll(async () => {
    process.env.SALES_SOURCE = 'rics';
    jest.resetModules();
    app = (await import('../src/app')).default;
  });

  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('emits a multi-metric CSV when combineStores=true and dataToPrint selects >1 metric', async () => {
    setAdapterRows([
      measureRow({ yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', quantity: 4, netSales: 200, cogs: 120 }),
    ]);
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2,13&endMonth=2026-04&dataToPrint=netSales,profit&format=csv',
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/rics-sales-history-by-month-2026-04\.csv/);
    const csv = res.text;
    expect(csv).toContain('Sales History by Month');
    expect(csv).toContain('All Stores');
    expect(csv).toContain('Net Sales');
    expect(csv).toContain('Profit');
    expect(csv).toContain('NIKE');
    expect(csv).toContain('200.00');
    expect(csv).toContain('80.00');                        // profit
  });

  it('emits per-store sections when combineStores=false', async () => {
    setAdapterRows([
      measureRow({ storeNumber: 2,  yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 100 }),
      measureRow({ storeNumber: 13, yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 50  }),
    ]);
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2,13&endMonth=2026-04&combineStores=false&format=csv',
    );
    expect(res.status).toBe(200);
    const csv = res.text;
    expect(csv).toContain('2 - UNLIMITED C. 2000');
    expect(csv).toContain('13 - TEST STORE 13');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// XLSX export
// ══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/rics-sales-history-by-month (XLSX)', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  let app: any;

  beforeAll(async () => {
    process.env.SALES_SOURCE = 'rics';
    jest.resetModules();
    app = (await import('../src/app')).default;
  });

  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('emits a binary XLSX with the expected content-type and extension', async () => {
    setAdapterRows([
      measureRow({ yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', quantity: 4, netSales: 200, cogs: 120 }),
    ]);
    // supertest doesn't parse the XLSX MIME by default — register a binary
    // buffer parser so `res.body` ends up as a Node Buffer we can inspect.
    const res = await request(app)
      .get(
        '/api/v1/reports/rics-sales-history-by-month?stores=2&endMonth=2026-04&format=xlsx&dataToPrint=netSales,profit',
      )
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /openxmlformats-officedocument\.spreadsheetml\.sheet/,
    );
    expect(res.headers['content-disposition']).toMatch(/rics-sales-history-by-month-2026-04\.xlsx/);
    const buf = res.body as Buffer;
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    // PK magic bytes — XLSX is a zip-based format.
    expect(buf.slice(0, 2).toString('hex')).toBe('504b');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Validation errors
// ══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/rics-sales-history-by-month (validation)', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  let app: any;

  beforeAll(async () => {
    process.env.SALES_SOURCE = 'rics';
    jest.resetModules();
    app = (await import('../src/app')).default;
  });

  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('returns 400 when stores is missing', async () => {
    const res = await request(app).get('/api/v1/reports/rics-sales-history-by-month?endMonth=2026-04');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when endMonth has the wrong format', async () => {
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2&endMonth=bad-month',
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when sortBy is not vendor or category', async () => {
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2&endMonth=2026-04&sortBy=brand',
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when detailLevel is invalid', async () => {
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2&endMonth=2026-04&detailLevel=blahblah',
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 501 when SALES_SOURCE is not 'rics'
// ══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/reports/rics-sales-history-by-month (source=local → 501)', () => {
  const ORIGINAL_SOURCE = process.env.SALES_SOURCE;
  let app: any;

  beforeAll(async () => {
    process.env.SALES_SOURCE = 'local';
    jest.resetModules();
    app = (await import('../src/app')).default;
  });

  afterAll(() => {
    if (ORIGINAL_SOURCE === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = ORIGINAL_SOURCE;
  });

  it('returns 501 with SALES_SOURCE_NOT_IMPLEMENTED when SALES_SOURCE=local', async () => {
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2&endMonth=2026-04',
    );
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('SALES_SOURCE_NOT_IMPLEMENTED');
  });
});
