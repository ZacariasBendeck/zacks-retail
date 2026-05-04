jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../src/db/prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adapter = require('../src/services/salesReporting/ricsSalesHistoryByMonthAdapter');

describe('queryMonthlySkuLifecycleCounts', () => {
  beforeEach(() => {
    (prisma.$queryRawUnsafe as jest.Mock).mockReset();
  });

  it('queries owned inventory history and encodes the new/carryover classification rules', async () => {
    (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValueOnce([
      {
        StoreNumber: 0,
        Y: 2026,
        M: 4,
        DimKey: 'NIKE',
        Vendor: 'NIKE',
        Category: 556,
        PictureFileName: null,
        NewStoreCount: 4,
        CarryoverStoreCount: 9,
        NewDistinctCount: 3,
        CarryoverDistinctCount: 7,
        NewUnitsSold: 11,
        CarryoverUnitsSold: 22,
      },
    ]);

    const rows = await adapter.queryMonthlySkuLifecycleCounts({
      storeNumbers: [2, 13],
      fromYearMonth: '2025-05',
      toYearMonth: '2026-04',
      sortBy: 'vendor',
      detailLevel: 'subtotals',
      combineStores: true,
      vendorFilter: ['NIKE'],
      categoryFilter: [556],
    });

    const [sql, ...sqlParams] = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0];
    expect(sql).toContain('FROM app.inventory_history_snapshot');
    expect(sql).toContain('JOIN app.inventory_history_month');
    expect(sql).toContain('MIN(date_first_received) AS first_received');
    expect(sql).toContain('m.qty_on_hand > 0');
    expect(sql).toContain('s.on_hand > 0');
    expect(sql).toContain('m.qty_sales');
    expect(sql).toContain('s.month_qty_sales');
    expect(sql).toContain("m.year_month <> to_char(s.snapshot_as_of, 'YYYY-MM')");
    expect(sql).toContain('WHEN stock_active.first_received IS NULL THEN false');
    expect(sql).toContain('WHEN sales_active.first_received IS NULL THEN false');
    expect(sql).toContain(') BETWEEN 0 AND 3');
    expect(sql).toContain('FROM stock_classified c');
    expect(sql).toContain('FROM sales_classified c');
    expect(sql).toContain('COUNT(DISTINCT CASE WHEN c.is_new THEN c.sku END)');
    expect(sql).toContain('COUNT(DISTINCT CASE WHEN c.is_new THEN NULL ELSE c.sku END)');
    expect(sql).toContain('SUM(CASE WHEN c.is_new THEN c.qty_sales ELSE 0 END)');
    expect(sql).toContain('FULL OUTER JOIN sales_agg sa');
    expect(sql).not.toContain('rics_mirror');
    expect(sqlParams).toEqual([
      '2025-05',
      '2026-04',
      [2, 13],
      ['NIKE'],
      [556],
    ]);
    expect(rows).toEqual([
      {
        storeNumber: 0,
        yearMonth: '2026-04',
        dimKey: 'NIKE',
        dimLabel: 'NIKE',
        categoryKey: '556',
        vendorKey: 'NIKE',
        pictureFileName: null,
        newSkuStoreCount: 4,
        carryoverSkuStoreCount: 9,
        newSkuDistinctCount: 3,
        carryoverSkuDistinctCount: 7,
        newSkuUnitsSold: 11,
        carryoverSkuUnitsSold: 22,
      },
    ]);
  });
});
