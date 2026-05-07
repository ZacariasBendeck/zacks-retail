import fs from 'node:fs';
import path from 'node:path';

jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

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

import { prisma } from '../src/db/prisma';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adapter = require('../src/services/salesReporting/ricsSalesReportAdapter');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { clearOnHandCache } = require('../src/services/salesReporting/ricsOnHandAtCostAdapter');

const mockQuery = prisma.$queryRawUnsafe as jest.Mock;

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
    D_SKU: 'SKU-NO',
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

function mockPrismaForKeywordMaster(): void {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM app.sales_history_ticket h') && sql.includes('app.sales_history_ticket_line')) {
      return [
        line({ H_Ticket: 1, D_SKU: 'SKU-PR', D_Extension: 100 }),
        line({ H_Ticket: 2, D_SKU: 'SKU-NO', D_Extension: 200 }),
      ];
    }
    if (sql.includes('FROM app.inventory_history_snapshot')) return [];
    if (sql.includes('WITH sku_scope')) {
      return [
        {
          SKU: 'SKU-PR',
          Season: null,
          GroupCode: null,
          StyleColor: null,
          Keywords: 'BASE PR',
          Category: 560,
          Vendor: 'VEND',
        },
        {
          SKU: 'SKU-NO',
          Season: null,
          GroupCode: null,
          StyleColor: null,
          Keywords: 'BASE',
          Category: 560,
          Vendor: 'VEND',
        },
      ];
    }
    return [];
  });
}

describe('getSalesAnalysis keyword criteria', () => {
  beforeEach(() => {
    adapter.clearCache();
    clearOnHandCache();
    mockSpecs = [];
    mockQuery.mockReset();
    mockPrismaForKeywordMaster();
    setMockRows([]);
  });

  it('filters SKU_DETAIL rows by raw keyword criteria', async () => {
    const report = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'SKU_DETAIL',
      storeOption: 'COMBINE',
      criteria: { keywordsRaw: 'PR' },
      printing: {},
      startDate: '2024-11-04',
      endDate: '2024-11-04',
    });

    expect(report.rows.map((r: { dimensionKey: string }) => r.dimensionKey)).toEqual(['SKU-PR']);
    const masterSql = mockQuery.mock.calls.find(([sql]) => String(sql).includes('WITH sku_scope'))?.[0];
    expect(masterSql).toContain('app.sku_keyword_override');
  });

  it('filters SKU_DETAIL rows by structured keyword criteria', async () => {
    const report = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'SKU_DETAIL',
      storeOption: 'COMBINE',
      criteria: { keywords: ['PR'] },
      printing: {},
      startDate: '2024-11-04',
      endDate: '2024-11-04',
    });

    expect(report.rows.map((r: { dimensionKey: string }) => r.dimensionKey)).toEqual(['SKU-PR']);
  });

  it('includes matching SKU master rows that have no sales in the period', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM app.sales_history_ticket h') && sql.includes('app.sales_history_ticket_line')) {
        return [
          line({
            H_Store: 20,
            H_Ticket: 1,
            D_SKU: 'SKU-SALE',
            D_Category: 567,
            D_Vendor: 'KNIN',
            D_Qty: 2,
            D_Extension: 100,
            D_Cost: 30,
          }),
        ];
      }
      if (sql.includes('FROM app.inventory_history_snapshot')) {
        return [
          {
            SKU: 'SKU-SALE',
            Store: 20,
            TotalOnHand: 2,
            Category: 567,
            Vendor: 'KNIN',
            Season: null,
            GroupCode: null,
            StyleColor: null,
            Keywords: null,
            CurrentCost: 30,
            BeginningInventoryValue: 120,
            ScopeIncluded: true,
          },
          {
            SKU: 'SKU-ZERO',
            Store: 20,
            TotalOnHand: 5,
            Category: 567,
            Vendor: 'KNIN',
            Season: null,
            GroupCode: null,
            StyleColor: null,
            Keywords: null,
            CurrentCost: 40,
            BeginningInventoryValue: 200,
            ScopeIncluded: true,
          },
          {
            SKU: 'SKU-EMPTY',
            Store: 20,
            TotalOnHand: 0,
            Category: 567,
            Vendor: 'KNIN',
            Season: null,
            GroupCode: null,
            StyleColor: null,
            Keywords: null,
            CurrentCost: 40,
            BeginningInventoryValue: 0,
            ScopeIncluded: false,
          },
        ];
      }
      if (sql.includes('WITH sku_scope')) {
        return [
          {
            SKU: 'SKU-SALE',
            Season: null,
            GroupCode: null,
            StyleColor: null,
            Keywords: null,
            Category: 567,
            Vendor: 'KNIN',
          },
          {
            SKU: 'SKU-ZERO',
            Season: null,
            GroupCode: null,
            StyleColor: null,
            Keywords: null,
            Category: 567,
            Vendor: 'KNIN',
          },
          {
            SKU: 'SKU-OTHER',
            Season: null,
            GroupCode: null,
            StyleColor: null,
            Keywords: null,
            Category: 567,
            Vendor: 'OTHR',
          },
        ];
      }
      return [];
    });

    const report = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'SKU_DETAIL',
      storeOption: 'COMBINE',
      criteria: { stores: [20], categories: [567], vendors: ['KNIN'] },
      printing: {},
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });

    expect(report.rows.map((r: { dimensionKey: string }) => r.dimensionKey)).toEqual(['SKU-SALE', 'SKU-ZERO']);
    const zeroSalesRow = report.rows.find((r: { dimensionKey: string }) => r.dimensionKey === 'SKU-ZERO');
    expect(zeroSalesRow.qty).toBe(0);
    expect(zeroSalesRow.netSales).toBe(0);
    expect(zeroSalesRow.unitsOnHand).toBe(5);
    expect(zeroSalesRow.onHandAtCost).toBe(200);
    expect(report.rows.find((r: { dimensionKey: string }) => r.dimensionKey === 'SKU-EMPTY')).toBeUndefined();
    const saleRow = report.rows.find((r: { dimensionKey: string }) => r.dimensionKey === 'SKU-SALE');
    expect(saleRow.turns).toBe(8);
    expect(saleRow.roiPct).toBe(5.33);
    expect(report.totals.netSales).toBe(100);
    expect(report.totals.unitsOnHand).toBe(7);
    expect(report.totals.onHandAtCost).toBe(260);
  });
});
