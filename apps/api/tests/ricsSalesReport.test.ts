/**
 * Unit tests for the sales-reporting adapter. The MDB-access layer
 * (`accessOleDb`) is mocked so tests run on any machine — no RICS DBs needed.
 *
 * The mock returns shaped rows for each of the 4 MDBs the adapter reads
 * (sales / store / salesperson / inventory-quantity + purchase-detail). Each
 * test seeds a specific set of rows via `setMockRows(...)` and then asserts
 * on the report shape the adapter produces.
 *
 * Integration tests that hit real MDBs are gated on their presence; CI skips
 * them.
 */

import fs from 'node:fs';
import path from 'node:path';

// ─────────────────────────── fs.existsSync mock ───────────────────────────
// The adapter guards every PS call with `fs.existsSync(dbPath)`. For unit
// tests we want that to ALWAYS return true so the mocked runPowerShellJson
// is reached.
jest.spyOn(fs, 'existsSync').mockImplementation(() => true);

// ─────────────────────────── accessOleDb mock ─────────────────────────────
// Each SELECT hits a `buildSelectScript` call — we match on the script's SQL
// body to pick which mock rowset to return.

type Rowset = unknown[];
type MockSpec = { match: (sql: string) => boolean; rows: Rowset };

let mockSpecs: MockSpec[] = [];

function setMockRows(specs: MockSpec[]): void {
  mockSpecs = specs;
}

jest.mock('../src/services/accessOleDb', () => {
  const actual = jest.requireActual('../src/services/accessOleDb');
  return {
    ...actual,
    ricsDbPath: (f: string) => path.join('/fake', f),
    getOrRecoverPassword: () => 'fake-password',
    runPowerShellJson: <T,>(script: string): T => {
      for (const spec of mockSpecs) {
        if (spec.match(script)) {
          return spec.rows as unknown as T;
        }
      }
      return [] as unknown as T;
    },
    buildSelectScript: (_db: string, _pw: string, sql: string) => sql,
    buildListTablesScript: (_db: string, _pw: string) => '',
    buildListColumnsScript: (_db: string, _pw: string, _t: string) => '',
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adapter = require('../src/services/salesReporting/ricsSalesReportAdapter');

const sqlMatches = (needle: string) => (sql: string): boolean => sql.includes(needle);

// ─────────────────────────── fixtures ─────────────────────────────────────

const STORE_ROWS = [
  { Number: 2, Desc: 'UNLIMITED C. 2000' },
  { Number: 13, Desc: 'TEST STORE 13' },
  { Number: 16, Desc: 'STORE 16' },
];

const SALESPERSON_ROWS = [
  { Code: 'GAMU', Name: 'Gamaliel' },
  { Code: 'PONK', Name: 'Ponciano K.' },
];

function dateMs(isoDate: string, hour = 12): string {
  return `/Date(${Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
    hour,
  )})/`;
}

// Helper to build a ticket-line raw row (matches the SELECT column names in
// loadTicketLines).
function line(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    H_Store: 2,
    H_Ticket: 100,
    H_RealDate: dateMs('2024-11-04', 10),
    H_Cashier: 'PONK',
    H_Posted: 'Y',
    D_SKU: 'SKU-A',
    D_Column: '090',
    D_Row: 'M',
    D_Qty: 1,
    D_Extension: 100,
    D_Perks: 0,
    D_SalesPerson: 'GAMU',
    D_Category: 560,
    D_Vendor: 'VEND',
    D_Cost: 40,
    D_ReturnCode: 0,
    D_RealPrice: 100,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Sales by Day (refactor contract regression)
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesByDay (refactor contract)', () => {
  beforeEach(() => {
    adapter.clearCache();
  });

  it('returns 7 rows with weekday names and comparison windows for a 1-week range', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ H_RealDate: dateMs('2024-11-04'), D_Extension: 100 }),
          line({ H_RealDate: dateMs('2024-11-05'), D_Extension: 200 }),
        ],
      },
    ]);
    const report = await adapter.getSalesByDay({
      storeNumber: 2,
      startDate: '2024-11-04',
      endDate: '2024-11-10',
      comparisonOffsetDays: 364,
    });
    expect(report.storeNumber).toBe(2);
    expect(report.storeName).toBe('UNLIMITED C. 2000');
    expect(report.storeLabel).toBe('2 - UNLIMITED C. 2000');
    expect(report.rows).toHaveLength(7);
    expect(report.rows[0].date).toBe('2024-11-04');
    expect(report.rows[0].dayName).toBe('Monday');
    expect(report.rows[0].netSales).toBe(100);
    expect(report.rows[1].netSales).toBe(200);
    expect(report.rows[2].netSales).toBe(0);
    expect(report.weeklyTotals.netSales).toBe(300);
    expect(report.comparisonStartDate).toBe('2023-11-06');
    expect(report.comparisonOffsetDays).toBe(364);
  });

  it('emits pctChange=null when comparedNetSales is zero', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [line({ H_RealDate: dateMs('2024-11-04'), D_Extension: 100 })],
      },
    ]);
    const report = await adapter.getSalesByDay({
      storeNumber: 2,
      startDate: '2024-11-04',
      endDate: '2024-11-04',
    });
    expect(report.rows[0].pctChange).toBeNull();
    expect(report.weeklyTotals.pctChange).toBeNull();
    expect(report.weeklyTotals.dollarChange).toBe(100);
  });

  it('throws when startDate > endDate', async () => {
    await expect(
      adapter.getSalesByDay({ storeNumber: 2, startDate: '2024-11-10', endDate: '2024-11-04' }),
    ).rejects.toThrow('startDate must be <= endDate');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Sales by Time (p. 41)
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesByTime', () => {
  beforeEach(() => {
    adapter.clearCache();
  });

  it('buckets by hour-of-day and computes ticket counts', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ H_RealDate: dateMs('2024-11-04', 10), H_Ticket: 1, D_Qty: 2, D_Extension: 100 }),
          line({ H_RealDate: dateMs('2024-11-04', 10), H_Ticket: 1, D_Qty: 1, D_Extension: 50 }), // same ticket
          line({ H_RealDate: dateMs('2024-11-04', 10), H_Ticket: 2, D_Qty: 1, D_Extension: 30 }),
          line({ H_RealDate: dateMs('2024-11-04', 14), H_Ticket: 3, D_Qty: 1, D_Extension: 75 }),
        ],
      },
    ]);
    const report = await adapter.getSalesByTime({
      startDate: '2024-11-04',
      endDate: '2024-11-04',
    });
    expect(report.rangeA).toHaveLength(24);
    expect(report.rangeA[10].tickets).toBe(2);     // tickets 1 and 2
    expect(report.rangeA[10].qty).toBe(4);         // 2+1+1
    expect(report.rangeA[10].dollars).toBe(180);   // 100+50+30
    expect(report.rangeA[14].tickets).toBe(1);
    expect(report.rangeA[14].dollars).toBe(75);
    expect(report.totalsA.tickets).toBe(3);
    expect(report.totalsA.qty).toBe(5);
    expect(report.totalsA.dollars).toBe(255);
    expect(report.rangeB).toBeNull();
  });

  it('computes pctOfTotal when requested', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ H_RealDate: dateMs('2024-11-04', 10), H_Ticket: 1, D_Extension: 100 }),
          line({ H_RealDate: dateMs('2024-11-04', 14), H_Ticket: 2, D_Extension: 300 }),
        ],
      },
    ]);
    const report = await adapter.getSalesByTime({
      startDate: '2024-11-04',
      endDate: '2024-11-04',
      printPctOfTotal: true,
    });
    expect(report.rangeA[10].pctOfTotal).toBe(25);
    expect(report.rangeA[14].pctOfTotal).toBe(75);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Sales by SKU (p. 43)
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesBySku', () => {
  beforeEach(() => {
    adapter.clearCache();
  });

  it('aggregates by SKU with size-grid cells', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ D_SKU: 'SKU-A', D_Column: '090', D_Row: 'M', D_Qty: 2, D_Extension: 200 }),
          line({ D_SKU: 'SKU-A', D_Column: '100', D_Row: 'M', D_Qty: 1, D_Extension: 100 }),
          line({ D_SKU: 'SKU-B', D_Column: '090', D_Row: 'L', D_Qty: 3, D_Extension: 150 }),
        ],
      },
    ]);
    const report = await adapter.getSalesBySku({
      startDate: '2024-11-04',
      endDate: '2024-11-10',
    });
    expect(report.rows).toHaveLength(2);
    const a = report.rows.find((r: any) => r.sku === 'SKU-A');
    expect(a).toBeDefined();
    expect(a.qty).toBe(3);
    expect(a.dollars).toBe(300);
    expect(a.cells).toHaveLength(2);
    expect(a.cells.find((c: any) => c.columnLabel === '090').qty).toBe(2);
    expect(report.totals.qty).toBe(6);
    expect(report.totals.dollars).toBe(450);
  });

  it('filters out returns when includeReturns=false', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ D_SKU: 'SKU-A', D_Qty: 2, D_Extension: 200, D_ReturnCode: 0 }),
          line({ D_SKU: 'SKU-A', D_Qty: -1, D_Extension: -100, D_ReturnCode: 1 }),  // return
        ],
      },
    ]);
    const r1 = await adapter.getSalesBySku({
      startDate: '2024-11-04',
      endDate: '2024-11-04',
      includeReturns: true,
    });
    expect(r1.totals.dollars).toBe(100);   // 200 - 100
    expect(r1.totals.returnsQty).toBe(1);

    adapter.clearCache();
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ D_SKU: 'SKU-A', D_Qty: 2, D_Extension: 200, D_ReturnCode: 0 }),
          line({ D_SKU: 'SKU-A', D_Qty: -1, D_Extension: -100, D_ReturnCode: 1 }),
        ],
      },
    ]);
    const r2 = await adapter.getSalesBySku({
      startDate: '2024-11-04',
      endDate: '2024-11-04',
      includeReturns: false,
    });
    expect(r2.totals.dollars).toBe(200);
    expect(r2.totals.returnsQty).toBe(0);
  });

  it('sorts by CATEGORY_SKU vs VENDOR_SKU vs SKU', async () => {
    const rowsFixture = [
      line({ D_SKU: 'ZZ', D_Category: 100, D_Vendor: 'AAA', D_Extension: 50 }),
      line({ D_SKU: 'AA', D_Category: 200, D_Vendor: 'ZZZ', D_Extension: 50 }),
      line({ D_SKU: 'MM', D_Category: 150, D_Vendor: 'MMM', D_Extension: 50 }),
    ];
    for (const sortBy of ['SKU', 'CATEGORY_SKU', 'VENDOR_SKU'] as const) {
      adapter.clearCache();
      setMockRows([
        { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
        {
          match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
          rows: rowsFixture,
        },
      ]);
      const rep = await adapter.getSalesBySku({
        startDate: '2024-11-04',
        endDate: '2024-11-04',
        sortBy,
      });
      if (sortBy === 'SKU') {
        expect(rep.rows.map((r: any) => r.sku)).toEqual(['AA', 'MM', 'ZZ']);
      } else if (sortBy === 'CATEGORY_SKU') {
        expect(rep.rows.map((r: any) => r.sku)).toEqual(['ZZ', 'MM', 'AA']);    // 100 < 150 < 200
      } else {
        expect(rep.rows.map((r: any) => r.sku)).toEqual(['ZZ', 'MM', 'AA']);    // AAA < MMM < ZZZ
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Salesperson Summary (p. 42)
// ══════════════════════════════════════════════════════════════════════════

describe('getSalespersonSummary', () => {
  beforeEach(() => {
    adapter.clearCache();
  });

  it('groups by salesperson and hydrates names', async () => {
    setMockRows([
      { match: sqlMatches('FROM [Salespeople]'), rows: SALESPERSON_ROWS },
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ D_SalesPerson: 'GAMU', D_Qty: 2, D_Extension: 200, D_Perks: 10 }),
          line({ D_SalesPerson: 'GAMU', D_Qty: 1, D_Extension: 150, D_Perks: 5 }),
          line({ D_SalesPerson: 'PONK', D_Qty: 3, D_Extension: 300, D_Perks: 20 }),
        ],
      },
    ]);
    const report = await adapter.getSalespersonSummary({
      startDate: '2024-11-04',
      endDate: '2024-11-10',
      combineStores: true,
    });
    expect(report.salespeople).toHaveLength(2);
    expect(report.salespeople[0].salespersonCode).toBe('GAMU');   // sorted by dollars desc: 350 > 300? Yes
    expect(report.salespeople[0].salespersonName).toBe('Gamaliel');
    expect(report.salespeople[0].dollars).toBe(350);
    expect(report.salespeople[0].perks).toBe(15);
    expect(report.grandTotal.dollars).toBe(650);
  });

  it('adds subtotals when subtotalBy=VENDOR', async () => {
    setMockRows([
      { match: sqlMatches('FROM [Salespeople]'), rows: SALESPERSON_ROWS },
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ D_SalesPerson: 'GAMU', D_Vendor: 'VEND-A', D_Qty: 1, D_Extension: 100 }),
          line({ D_SalesPerson: 'GAMU', D_Vendor: 'VEND-B', D_Qty: 2, D_Extension: 200 }),
        ],
      },
    ]);
    const report = await adapter.getSalespersonSummary({
      startDate: '2024-11-04',
      endDate: '2024-11-10',
      subtotalBy: 'VENDOR',
      combineStores: true,
    });
    expect(report.salespeople[0].subtotals).toHaveLength(2);
    const byVendor = Object.fromEntries(
      report.salespeople[0].subtotals.map((s: any) => [s.key, s.dollars]),
    );
    expect(byVendor['VEND-A']).toBe(100);
    expect(byVendor['VEND-B']).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Best Sellers (p. 93)
// ══════════════════════════════════════════════════════════════════════════

describe('getBestSellers', () => {
  beforeEach(() => {
    adapter.clearCache();
  });

  it('ranks SKUs by NET_SALES and respects topN', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ D_SKU: 'A', D_Extension: 100, D_Qty: 1, D_Cost: 40 }),
          line({ D_SKU: 'B', D_Extension: 500, D_Qty: 5, D_Cost: 50 }),
          line({ D_SKU: 'C', D_Extension: 250, D_Qty: 2, D_Cost: 80 }),
        ],
      },
    ]);
    const report = await adapter.getBestSellers({
      dimension: 'SKU',
      metric: 'NET_SALES',
      period: 'YTD',
      topN: 2,
    });
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0].rank).toBe(1);
    expect(report.rows[0].key).toBe('B');
    expect(report.rows[0].netSales).toBe(500);
    expect(report.rows[0].profit).toBe(250);                // 500 - (50 * 5)
    expect(report.rows[1].key).toBe('C');
  });

  it('groups by STORE dimension with combineStores=false', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ H_Store: 2, D_Extension: 100 }),
          line({ H_Store: 2, D_Extension: 200 }),
          line({ H_Store: 13, D_Extension: 50 }),
        ],
      },
    ]);
    const report = await adapter.getBestSellers({
      dimension: 'STORE',
      metric: 'NET_SALES',
      period: 'YTD',
    });
    expect(report.rows[0].key).toBe('2');
    expect(report.rows[0].label).toBe('UNLIMITED C. 2000');
    expect(report.rows[0].netSales).toBe(300);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Sales Analysis (p. 88)
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesAnalysis', () => {
  beforeEach(() => {
    adapter.clearCache();
  });

  it('groups by CATEGORY with COMBINE store option and computes GP%', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ H_Store: 2, D_Category: 560, D_Qty: 1, D_Extension: 100, D_Cost: 40 }),
          line({ H_Store: 13, D_Category: 560, D_Qty: 2, D_Extension: 200, D_Cost: 50 }),
          line({ H_Store: 2, D_Category: 570, D_Qty: 1, D_Extension: 75, D_Cost: 25 }),
        ],
      },
    ]);
    const report = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: {},
      printing: { ytd: true },
      startDate: '2024-11-04',
      endDate: '2024-11-10',
    });
    expect(report.rows).toHaveLength(2);
    const row560 = report.rows.find((r: any) => r.dimensionKey === '560');
    expect(row560.netSales).toBe(300);
    expect(row560.cogs).toBe(140);              // 40*1 + 50*2
    expect(row560.grossProfit).toBe(160);
    expect(row560.gpPct).toBe(53.3);            // 160/300
    expect(row560.storeNumber).toBeNull();
    expect(report.totals.netSales).toBe(375);
  });

  it('applies category + vendor filters', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ D_Category: 560, D_Vendor: 'VEND-A', D_Extension: 100 }),
          line({ D_Category: 570, D_Vendor: 'VEND-A', D_Extension: 100 }),
          line({ D_Category: 560, D_Vendor: 'VEND-B', D_Extension: 100 }),
        ],
      },
    ]);
    const report = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categories: [560], vendors: ['VEND-A'] },
      printing: { ytd: true },
      startDate: '2024-11-04',
      endDate: '2024-11-04',
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].dimensionKey).toBe('560');
    expect(report.rows[0].netSales).toBe(100);
  });

  it('DEPT_SUMMARY returns rows in numeric order by dept number, not alphabetical by label', async () => {
    // Dept labels are chosen so that alphabetical-by-label order
    // (ACCESORIOS, MUJER, ZAPATO) disagrees with numeric-by-key order
    // (1, 3, 5). The adapter must sort by dimensionKey, not dimensionLabel.
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      { match: sqlMatches('FROM [Salespeople]'), rows: SALESPERSON_ROWS },
      {
        match: sqlMatches('FROM [Departments]'),
        rows: [
          // Numeric order: 1, 3, 5. Alphabetical label order: 3, 1, 5.
          { Number: 5, Desc: 'ZAPATO MUJER', BegCateg: 550, EndCateg: 599 },
          { Number: 1, Desc: 'MUJER',        BegCateg: 100, EndCateg: 199 },
          { Number: 3, Desc: 'ACCESORIOS',   BegCateg: 300, EndCateg: 399 },
        ],
      },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ H_Ticket: 1, D_Category: 560, D_Extension: 100, D_Cost: 50 }),
          line({ H_Ticket: 2, D_Category: 150, D_Extension: 100, D_Cost: 50 }),
          line({ H_Ticket: 3, D_Category: 350, D_Extension: 100, D_Cost: 50 }),
        ],
      },
    ]);

    const report = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'DEPT_SUMMARY',
      storeOption: 'COMBINE',
      criteria: {},
      printing: {},
      startDate: '2024-11-04',
      endDate: '2024-11-04',
    });

    expect(report.rows.map((r: { dimensionKey: string }) => r.dimensionKey))
      .toEqual(['1', '3', '5']);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Stock Status (p. 96)
// ══════════════════════════════════════════════════════════════════════════

describe('getStockStatus', () => {
  beforeEach(() => {
    adapter.clearCache();
  });

  it('computes short and critical from model - onHand [- onOrder]', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'SKU-A', Store: 2, TotalOnHand: 3, TotalOnOrder: 2, TotalModel: 10 },
          { SKU: 'SKU-B', Store: 2, TotalOnHand: 5, TotalOnOrder: 0, TotalModel: 5 },
          { SKU: 'SKU-C', Store: 2, TotalOnHand: 0, TotalOnOrder: 0, TotalModel: 3 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'SKU-A', Desc: 'Alpha', Vendor: 'VEND', Category: 560, RetailPrice: 100, CurrentCost: 40 },
          { SKU: 'SKU-B', Desc: 'Bravo', Vendor: 'VEND', Category: 560, RetailPrice: 80, CurrentCost: 30 },
          { SKU: 'SKU-C', Desc: 'Charlie', Vendor: 'VEND', Category: 560, RetailPrice: 50, CurrentCost: 20 },
        ],
      },
    ]);
    const report = await adapter.getStockStatus({
      sortBy: 'CATEGORY',
      storeOption: 'SEPARATE',
      itemFilter: 'ALL',
    });
    expect(report.rows).toHaveLength(3);
    const a = report.rows.find((r: any) => r.sku === 'SKU-A');
    expect(a.short).toBe(7);                // 10 - 3
    expect(a.critical).toBe(5);             // 10 - 3 - 2
    expect(a.retailValue).toBe(300);         // 100 * 3
    const b = report.rows.find((r: any) => r.sku === 'SKU-B');
    expect(b.short).toBe(0);
    expect(b.critical).toBe(0);
  });

  it('filters by ONLY_CRITICAL', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'SKU-A', Store: 2, TotalOnHand: 3, TotalOnOrder: 2, TotalModel: 10 },  // critical=5
          { SKU: 'SKU-B', Store: 2, TotalOnHand: 5, TotalOnOrder: 0, TotalModel: 5 },   // critical=0
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'SKU-A', Desc: 'Alpha', Vendor: 'VEND', Category: 560, RetailPrice: 100, CurrentCost: 40 },
          { SKU: 'SKU-B', Desc: 'Bravo', Vendor: 'VEND', Category: 560, RetailPrice: 80, CurrentCost: 30 },
        ],
      },
    ]);
    const report = await adapter.getStockStatus({
      sortBy: 'CATEGORY',
      storeOption: 'SEPARATE',
      itemFilter: 'ONLY_CRITICAL',
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].sku).toBe('SKU-A');
  });

  it('combines stores when storeOption=COMBINE', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'SKU-A', Store: 2, TotalOnHand: 3, TotalOnOrder: 0, TotalModel: 10 },
          { SKU: 'SKU-A', Store: 13, TotalOnHand: 5, TotalOnOrder: 2, TotalModel: 8 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'SKU-A', Desc: 'Alpha', Vendor: 'VEND', Category: 560, RetailPrice: 100, CurrentCost: 40 },
        ],
      },
    ]);
    const report = await adapter.getStockStatus({
      sortBy: 'CATEGORY',
      storeOption: 'COMBINE',
      itemFilter: 'ALL',
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].onHand).toBe(8);     // 3+5
    expect(report.rows[0].onOrder).toBe(2);
    expect(report.rows[0].storeNumber).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Route-level: SALES_SOURCE=local → 501
// ══════════════════════════════════════════════════════════════════════════

describe('salesReportRoutes (facade 501)', () => {
  let request: any, app: any, originalSource: string | undefined;
  beforeAll(async () => {
    originalSource = process.env.SALES_SOURCE;
    process.env.SALES_SOURCE = 'local';
    // Re-require the app AFTER env mutation so the facade picks it up.
    jest.resetModules();
    request = (await import('supertest')).default;
    app = (await import('../src/app')).default;
  });
  afterAll(() => {
    if (originalSource === undefined) delete process.env.SALES_SOURCE;
    else process.env.SALES_SOURCE = originalSource;
  });

  it('returns 501 from /api/v1/reports/sales/by-day when SALES_SOURCE=local', async () => {
    const res = await request(app).get(
      '/api/v1/reports/sales/by-day?store=2&startDate=2024-11-04&endDate=2024-11-10',
    );
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('SALES_SOURCE_NOT_IMPLEMENTED');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Integration: real MDB (skipped when DB absent)
// ══════════════════════════════════════════════════════════════════════════

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MDB_AVAILABLE = fs.existsSync(path.join(REPO_ROOT, 'Rics Databases', 'RITRNSSV.MDB'));
const describeIfMdb = MDB_AVAILABLE ? describe : describe.skip;

describeIfMdb('sales-reporting integration (real MDB)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('legacy /api/v1/reports/rics-sales-by-day-store returns JSON shape', async () => {
    process.env.SALES_SOURCE = 'rics';
    const request = (await import('supertest')).default;
    const app = (await import('../src/app')).default;
    const res = await request(app).get(
      '/api/v1/reports/rics-sales-by-day-store?store=2&startDate=2024-11-04&endDate=2024-11-10',
    );
    expect(res.status).toBe(200);
    expect(res.body.storeNumber).toBe(2);
    expect(res.body.rows).toHaveLength(7);
    expect(res.body.weeklyTotals).toBeDefined();
  }, 30_000);
});
