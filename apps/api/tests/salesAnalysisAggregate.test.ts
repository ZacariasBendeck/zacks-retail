jest.mock('../src/db/prisma', () => ({
  prisma: {
    $executeRawUnsafe: jest.fn(async () => 0),
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../src/db/prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adapter = require('../src/services/salesReporting/ricsSalesReportAdapter');

const mockQuery = prisma.$queryRawUnsafe as jest.Mock;

describe('getSalesAnalysis aggregate sales source', () => {
  beforeEach(() => {
    adapter.clearCache();
    jest.clearAllMocks();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM app.sales_history_ticket h') && sql.includes('GROUP BY 1, 2, 3, 4, 5')) {
        return [
          {
            H_Store: 1,
            D_SKU: 'SKU-A',
            D_Category: 11,
            D_Vendor: 'V1',
            D_PriceBucket: '100-125',
            D_Qty: 250001,
            D_Extension: 500000,
            D_Cogs: 300000,
          },
        ];
      }
      if (sql.includes('FROM app.inventory_history_snapshot h')) {
        return [
          {
            SKU: 'SKU-A',
            Store: 1,
            TotalOnHand: 10,
            CurrentCost: 50,
            BeginningInventoryValue: 400,
            AverageInventoryValueSum: 1200,
            AverageInventoryMonthCount: 2,
            PriorYearOnHandAtCost: 0,
            ScopeIncluded: true,
            Season: null,
            GroupCode: null,
            StyleColor: null,
            Keywords: null,
            Category: 11,
            Vendor: 'V1',
            BuyerCode: null,
          },
        ];
      }
      return [];
    });
  });

  it('uses uncapped SQL aggregates and the aggregate COGS value', async () => {
    const report = await adapter.getSalesAnalysis({
      dimension: 'CATEGORY',
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: { categories: [11] },
      printing: {},
      startDate: '2025-05-01',
      endDate: '2026-04-30',
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].qty).toBe(250001);
    expect(report.rows[0].netSales).toBe(500000);
    expect(report.rows[0].cogs).toBe(300000);
    expect(report.rows[0].grossProfit).toBe(200000);

    const aggregateCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('FROM app.sales_history_ticket h') &&
      String(sql).includes('GROUP BY 1, 2, 3, 4, 5'),
    );
    expect(aggregateCall).toBeDefined();
    expect(String(aggregateCall?.[0])).not.toContain('LIMIT 250000');
    expect(aggregateCall?.[1]).toBe('2025-05-01');
    expect(aggregateCall?.[2]).toBe('2026-05-01');
    expect(aggregateCall?.[3]).toEqual([11]);
  });
});
