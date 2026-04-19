/**
 * Tests for the *Raw criteria-grammar filtering in the Sales Analysis adapter.
 *
 * Verifies that `applyAnalysisCriteria` honors `storesRaw`/`categoriesRaw`/
 * `vendorsRaw`/`skusRaw` according to the merge rules spec'd in
 * docs/modules/sales-reporting.md §2:
 *
 *   - grammar-only: match what G matches (ranges, wildcards, exclusions).
 *   - structured + grammar inclusions: union, then grammar exclusions narrow.
 *   - structured + exclusion-only grammar: narrow structured picks; do not
 *     widen to the universe.
 *
 * Mocking mirrors ricsSalesReport.test.ts: the accessOleDb layer is stubbed so
 * no real MDB is required.
 */

import fs from 'node:fs';
import path from 'node:path';

// fs.existsSync always true so guards in the adapter don't short-circuit.
jest.spyOn(fs, 'existsSync').mockImplementation(() => true);

type MockSpec = { match: (sql: string) => boolean; rows: unknown[] };
let mockSpecs: MockSpec[] = [];
function setMockRows(specs: MockSpec[]): void {
  mockSpecs = specs;
}
beforeEach(() => {
  mockSpecs = [];
});

jest.mock('../src/services/accessOleDb', () => {
  const actual = jest.requireActual('../src/services/accessOleDb');
  return {
    ...actual,
    ricsDbPath: (f: string) => path.join('/fake', f),
    getOrRecoverPassword: () => 'fake-password',
    runPowerShellJson: <T,>(script: string): T => {
      for (const spec of mockSpecs) {
        if (spec.match(script)) return spec.rows as unknown as T;
      }
      return [] as unknown as T;
    },
    buildSelectScript: (_db: string, _pw: string, sql: string) => sql,
    buildListTablesScript: () => '',
    buildListColumnsScript: () => '',
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

// Empty inventory mocks so the on-hand-at-cost adapter call inside
// getSalesAnalysis doesn't blow up on missing rowsets.
const EMPTY_INVENTORY_MOCKS: MockSpec[] = [
  { match: sqlMatches('FROM [Inventory Quantities]'), rows: [] },
  { match: sqlMatches('FROM [InventoryMaster]'), rows: [] },
];

// ══════════════════════════════════════════════════════════════════════════
// getSalesAnalysis — criteriaGrammar (storesRaw / categoriesRaw / vendorsRaw / skusRaw)
// ══════════════════════════════════════════════════════════════════════════

describe('getSalesAnalysis — *Raw grammar filtering', () => {
  beforeEach(() => {
    adapter.clearCache();
  });

  it('categoriesRaw: "556-599" keeps only rows in that range', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      { match: sqlMatches('FROM [Salespeople]'), rows: SALESPERSON_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ H_Ticket: 1, D_Category: 560, D_Extension: 100 }),
          line({ H_Ticket: 2, D_Category: 700, D_Extension: 200 }),
        ],
      },
      ...EMPTY_INVENTORY_MOCKS,
    ]);

    const report = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categoriesRaw: '556-599' },
      printing: {},
      startDate: '2024-11-04',
      endDate: '2024-11-04',
    });

    expect(report.rows.map((r: { dimensionKey: string }) => r.dimensionKey)).toEqual(['560']);
  });

  it('categoriesRaw exclusion narrows structured picks (does not widen to universe)', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      { match: sqlMatches('FROM [Salespeople]'), rows: SALESPERSON_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ H_Ticket: 1, D_Category: 560, D_Extension: 100 }),
          line({ H_Ticket: 2, D_Category: 570, D_Extension: 200 }),
        ],
      },
      ...EMPTY_INVENTORY_MOCKS,
    ]);

    const report = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categories: [560, 570], categoriesRaw: '<>570' },
      printing: {},
      startDate: '2024-11-04',
      endDate: '2024-11-04',
    });

    expect(report.rows.map((r: { dimensionKey: string }) => r.dimensionKey)).toEqual(['560']);
  });

  it('categoriesRaw inclusion unions with structured picks', async () => {
    setMockRows([
      { match: sqlMatches('FROM [StoreMaster]'), rows: STORE_ROWS },
      { match: sqlMatches('FROM [Salespeople]'), rows: SALESPERSON_ROWS },
      {
        match: (sql) => sql.includes('FROM TicketHeader h INNER JOIN TicketDetail d'),
        rows: [
          line({ H_Ticket: 1, D_Category: 100, D_Extension: 10 }),
          line({ H_Ticket: 2, D_Category: 560, D_Extension: 20 }),
          line({ H_Ticket: 3, D_Category: 999, D_Extension: 30 }),
        ],
      },
      ...EMPTY_INVENTORY_MOCKS,
    ]);

    const report = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categories: [100], categoriesRaw: '556-599' },
      printing: {},
      startDate: '2024-11-04',
      endDate: '2024-11-04',
    });

    const keys = report.rows.map((r: { dimensionKey: string }) => r.dimensionKey).sort();
    expect(keys).toEqual(['100', '560']);
  });
});
