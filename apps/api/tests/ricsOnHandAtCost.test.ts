/**
 * Unit tests for the on-hand-at-cost adapter used by the Sales Analysis
 * ROI/Turns columns. The MDB-access layer (`accessOleDb`) is mocked so
 * tests run on any machine — no RICS DBs needed.
 *
 * The mock matches on the SQL script body to pick the right rowset for
 * each of the two MDBs the adapter reads (RIINVQUA, RIINVMAS).
 */

import fs from 'node:fs';
import path from 'node:path';

// The adapter guards every PS call with `fs.existsSync(dbPath)`. For unit
// tests we want that to ALWAYS return true so the mocked runPowerShellJson
// is reached.
jest.spyOn(fs, 'existsSync').mockImplementation(() => true);

type MockSpec = { match: (sql: string) => boolean; rows: unknown[] };
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
const { getOnHandAtCostByDimension } = require('../src/services/salesReporting/ricsOnHandAtCostAdapter');

const sqlMatches = (needle: string) => (sql: string) => sql.includes(needle);

describe('getOnHandAtCostByDimension', () => {
  beforeEach(() => {
    mockSpecs = [];
  });

  it('groups by category for CATEGORY_SUMMARY', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'A', Store: 2, TotalOnHand: 10 },
          { SKU: 'A', Store: 16, TotalOnHand: 5 },
          { SKU: 'B', Store: 2, TotalOnHand: 3 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'A', Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
          { SKU: 'B', Category: 556, CurrentCost: 50, Vendor: 'V1', Season: null },
        ],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: {},
    });

    expect(map.get('556')).toBeCloseTo(1650, 2);
  });

  it('groups by store when storeOption !== COMBINE', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'A', Store: 2, TotalOnHand: 10 },
          { SKU: 'A', Store: 16, TotalOnHand: 5 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [{ SKU: 'A', Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null }],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'SEPARATE',
      criteria: {},
    });

    expect(map.get('556|2')).toBeCloseTo(1000, 2);
    expect(map.get('556|16')).toBeCloseTo(500, 2);
  });

  it('applies structured category filter', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'A', Store: 2, TotalOnHand: 10 },
          { SKU: 'B', Store: 2, TotalOnHand: 10 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'A', Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
          { SKU: 'B', Category: 600, CurrentCost: 100, Vendor: 'V1', Season: null },
        ],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categories: [556] },
    });

    expect(map.get('556')).toBeCloseTo(1000, 2);
    expect(map.has('600')).toBe(false);
  });

  it('applies categoriesRaw range', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'A', Store: 2, TotalOnHand: 10 },
          { SKU: 'B', Store: 2, TotalOnHand: 10 },
          { SKU: 'C', Store: 2, TotalOnHand: 10 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'A', Category: 560, CurrentCost: 100, Vendor: 'V1', Season: null },
          { SKU: 'B', Category: 599, CurrentCost: 100, Vendor: 'V1', Season: null },
          { SKU: 'C', Category: 700, CurrentCost: 100, Vendor: 'V1', Season: null },
        ],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categoriesRaw: '556-599' },
    });

    expect(map.get('560')).toBeCloseTo(1000, 2);
    expect(map.get('599')).toBeCloseTo(1000, 2);
    expect(map.has('700')).toBe(false);
  });

  it('returns empty map for RIINVMAS-dependent report types not yet wired', async () => {
    const map = await getOnHandAtCostByDimension({
      reportType: 'GROUP_SUMMARY',
      storeOption: 'COMBINE',
      criteria: {},
    });
    expect(map.size).toBe(0);
  });

  it('groups by vendor code for VENDOR_SUMMARY', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'A', Store: 2, TotalOnHand: 10 },
          { SKU: 'B', Store: 2, TotalOnHand: 5 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'A', Category: 1, CurrentCost: 100, Vendor: 'NIKE', Season: null },
          { SKU: 'B', Category: 2, CurrentCost: 100, Vendor: 'NIKE', Season: null },
        ],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'VENDOR_SUMMARY',
      storeOption: 'COMBINE',
      criteria: {},
    });
    expect(map.get('NIKE')).toBeCloseTo(1500, 2);
  });

  it('groups by SKU for SKU_DETAIL', async () => {
    setMockRows([
      {
        match: sqlMatches('FROM [Inventory Quantities]'),
        rows: [
          { SKU: 'KISS001-BK', Store: 2, TotalOnHand: 10 },
          { SKU: 'KISS002-BK', Store: 2, TotalOnHand: 5 },
        ],
      },
      {
        match: sqlMatches('FROM [InventoryMaster]'),
        rows: [
          { SKU: 'KISS001-BK', Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
          { SKU: 'KISS002-BK', Category: 556, CurrentCost: 80, Vendor: 'V1', Season: null },
        ],
      },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'SKU_DETAIL',
      storeOption: 'COMBINE',
      criteria: {},
    });
    expect(map.get('KISS001-BK')).toBeCloseTo(1000, 2);
    expect(map.get('KISS002-BK')).toBeCloseTo(400, 2);
  });
});
