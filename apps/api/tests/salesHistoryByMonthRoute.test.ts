/**
 * Route-level integration tests for
 * `GET /api/v1/reports/rics-sales-history-by-month`.
 *
 * The adapter is mocked at the `ricsSalesHistoryByMonthAdapter` boundary so
 * the route → facade → adapter pipeline is exercised end-to-end without any
 * RICS MDB dependency. Follows the same pattern the sibling
 * `rics-sales-by-day-store` integration tests use.
 */

// ─────────────────────────── adapter mocks ────────────────────────────────

jest.mock('../src/services/salesReporting/ricsSalesHistoryByMonthAdapter', () => ({
  queryMonthlyNetSales: jest.fn(),
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

type MonthlyNetSalesRow = {
  storeNumber: number;
  yearMonth: string;
  dimKey: string;
  dimLabel: string;
  netSales: number;
};

/**
 * Re-require the adapter module each call so we write to the instance the
 * facade is actually using (which is loaded AFTER `jest.resetModules()` in
 * each describe's `beforeAll`).
 */
function setAdapterRows(rows: MonthlyNetSalesRow[]): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const monthlyAdapter = require('../src/services/salesReporting/ricsSalesHistoryByMonthAdapter');
  (monthlyAdapter.queryMonthlyNetSales as jest.Mock).mockReset();
  (monthlyAdapter.queryMonthlyNetSales as jest.Mock).mockResolvedValue(rows);
}

// ══════════════════════════════════════════════════════════════════════════
// JSON and CSV happy paths
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
      { storeNumber: 2, yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 100 },
      { storeNumber: 13, yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 50 },
      { storeNumber: 2, yearMonth: '2026-03', dimKey: 'ADIDAS', dimLabel: 'ADIDAS', netSales: 25 },
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
    expect(res.body.blocks).toHaveLength(1);
    expect(res.body.blocks[0].storeNumber).toBe('ALL');
    expect(res.body.blocks[0].storeLabel).toBe('All Stores');
    expect(res.body.chartSeries).toHaveLength(1);

    const nike = res.body.blocks[0].rows.find((r: any) => r.key === 'NIKE');
    expect(nike.monthValues[11]).toBe(150);
    expect(nike.total).toBe(150);
  });

  it('respects combineStores=false and returns one block per store in order', async () => {
    setAdapterRows([
      { storeNumber: 2, yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 100 },
      { storeNumber: 13, yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 50 },
    ]);

    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2,13&endMonth=2026-04&combineStores=false',
    );
    expect(res.status).toBe(200);
    expect(res.body.combineStores).toBe(false);
    expect(res.body.blocks).toHaveLength(2);
    expect(res.body.blocks[0].storeNumber).toBe(2);
    expect(res.body.blocks[1].storeNumber).toBe(13);
    expect(res.body.chartSeries).toHaveLength(2);
  });

  it('accepts sortBy=category', async () => {
    setAdapterRows([
      { storeNumber: 2, yearMonth: '2026-04', dimKey: '556', dimLabel: '556 - Dress Shoes', netSales: 100 },
    ]);
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2&endMonth=2026-04&sortBy=category',
    );
    expect(res.status).toBe(200);
    expect(res.body.sortBy).toBe('category');
    expect(res.body.blocks[0].rows[0].key).toBe('556');
    expect(res.body.blocks[0].rows[0].label).toBe('556 - Dress Shoes');
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

  it('emits a single-section CSV when combineStores=true', async () => {
    setAdapterRows([
      { storeNumber: 2, yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 100 },
      { storeNumber: 13, yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 50 },
    ]);
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2,13&endMonth=2026-04&format=csv',
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/rics-sales-history-by-month-2026-04\.csv/);
    const csv = res.text;
    expect(csv).toContain('Sales History by Month');
    expect(csv).toContain('All Stores');
    expect(csv).toContain('NIKE');
    expect(csv).toContain('Totals');
    expect(csv).toContain('150.00');                        // combined April value
    // Only one store-label banner when combined.
    expect(csv.match(/All Stores/g)?.length ?? 0).toBe(1);
  });

  it('emits per-store sections when combineStores=false', async () => {
    setAdapterRows([
      { storeNumber: 2, yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 100 },
      { storeNumber: 13, yearMonth: '2026-04', dimKey: 'NIKE', dimLabel: 'NIKE', netSales: 50 },
    ]);
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-history-by-month?stores=2,13&endMonth=2026-04&combineStores=false&format=csv',
    );
    expect(res.status).toBe(200);
    const csv = res.text;
    expect(csv).toContain('2 - UNLIMITED C. 2000');
    expect(csv).toContain('13 - TEST STORE 13');
    // Each section has its own Totals line → expect 2 total rows.
    expect(csv.match(/^Totals,/gm)?.length ?? 0).toBe(2);
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
