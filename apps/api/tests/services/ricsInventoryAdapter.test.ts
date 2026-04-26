jest.mock('../../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

jest.mock('../../src/services/ricsProductAdapter', () => ({
  findIndexedMaster: jest.fn(),
  findNeighborSku: jest.fn(),
}));

jest.mock('../../src/services/salesReporting/ricsInquiryRollupAdapter', () => ({
  getInquirySalesRollup: jest.fn(),
}));

import { __test, type InventoryInquiryStore } from '../../src/services/ricsInventoryAdapter';

const {
  buildGrids,
  buildSummaryMetricsByStore,
  buildLegacyLastYearSalesByStore,
  buildInquiryRollupFromHistory,
} = __test;

describe('ricsInventoryAdapter inquiry grids', () => {
  const stores: InventoryInquiryStore[] = [
    {
      storeNumber: 21,
      storeName: 'Store 21',
      cells: [
        {
          storeNumber: 21,
          rowLabel: 'M',
          columnLabel: '7',
          onHand: 2,
          currentOnOrder: 1,
          futureOnOrder: 0,
          model: 5,
          maxQty: 7,
          reorder: 3,
          mtdSales: 1,
          stdSales: 2,
          ytdSales: 3,
          lySales: 4,
        },
        {
          storeNumber: 21,
          rowLabel: 'M',
          columnLabel: '8',
          onHand: 1,
          currentOnOrder: 0,
          futureOnOrder: 2,
          model: 2,
          maxQty: 4,
          reorder: 2,
          mtdSales: 0,
          stdSales: 1,
          ytdSales: 1,
          lySales: 2,
        },
      ],
      totals: { onHand: 3, currentOnOrder: 1, futureOnOrder: 2, ytdSales: 4, lySales: 6 },
    },
    {
      storeNumber: 24,
      storeName: 'Store 24',
      cells: [
        {
          storeNumber: 24,
          rowLabel: 'M',
          columnLabel: '7',
          onHand: 4,
          currentOnOrder: 0,
          futureOnOrder: 0,
          model: 4,
          maxQty: 6,
          reorder: 2,
          mtdSales: 2,
          stdSales: 3,
          ytdSales: 5,
          lySales: 6,
        },
        {
          storeNumber: 24,
          rowLabel: 'M',
          columnLabel: '8',
          onHand: 0,
          currentOnOrder: 3,
          futureOnOrder: 0,
          model: 3,
          maxQty: 5,
          reorder: 2,
          mtdSales: 1,
          stdSales: 1,
          ytdSales: 2,
          lySales: 1,
        },
      ],
      totals: { onHand: 4, currentOnOrder: 3, futureOnOrder: 0, ytdSales: 7, lySales: 7 },
    },
  ];

  const sizeType = {
    rows: ['M'],
    columns: ['7', '8'],
  } as any;

  it('keeps all-stores modes unscoped when a store-specific inquiry is requested', () => {
    const grids = buildGrids(
      stores,
      sizeType,
      buildSummaryMetricsByStore(stores),
      21,
      'M',
    );

    expect(grids.onHand?.rows).toEqual([
      { label: 'M', cells: [{ value: 2 }, { value: 1 }] },
    ]);
    expect(grids.allStoresOnHand?.rows).toEqual([
      { label: 'Store 21', cells: [{ value: 2 }, { value: 1 }] },
      { label: 'Store 24', cells: [{ value: 4 }, { value: 0 }] },
    ]);
  });

  it('derives short quantities as model minus on-hand', () => {
    const grids = buildGrids(
      stores,
      sizeType,
      buildSummaryMetricsByStore(stores),
      21,
      'M',
    );

    expect(grids.short?.rows).toEqual([
      { label: 'M', cells: [{ value: 3 }, { value: 1 }] },
    ]);
  });

  it('builds all-stores summary sales rows from inquiry cell totals', () => {
    const grids = buildGrids(
      stores,
      sizeType,
      buildSummaryMetricsByStore(stores),
      undefined,
      'M',
    );

    expect(grids.allStoresSummary).toEqual({
      columns: ['21', '24', 'TOT'],
      rows: expect.arrayContaining([
        { label: 'MTD Sales', cells: [{ value: 1 }, { value: 3 }, { value: 4 }] },
        { label: 'STD Sales', cells: [{ value: 3 }, { value: 4 }, { value: 7 }] },
        { label: 'YTD Sales', cells: [{ value: 4 }, { value: 7 }, { value: 11 }] },
        { label: 'L/Y Sales', cells: [{ value: 6 }, { value: 7 }, { value: 13 }] },
      ]),
    });
  });

  it('uses the summary metrics for all-stores one-row when the size type only has one row', () => {
    const summaryByStore = new Map([
      [21, { onHand: 3, currentOnOrder: 1, futureOnOrder: 2, mtdSales: 9, stdSales: 10, ytdSales: 11, lySales: 12 }],
      [24, { onHand: 4, currentOnOrder: 3, futureOnOrder: 0, mtdSales: 8, stdSales: 9, ytdSales: 10, lySales: 11 }],
    ]);

    const grids = buildGrids(
      stores,
      sizeType,
      summaryByStore,
      undefined,
      'M',
    );

    expect(grids.allStoresOneRow).toEqual({
      columns: ['21', '24', 'TOT'],
      rows: expect.arrayContaining([
        { label: 'MTD Sales', cells: [{ value: 9 }, { value: 8 }, { value: 17 }] },
        { label: 'STD Sales', cells: [{ value: 10 }, { value: 9 }, { value: 19 }] },
        { label: 'YTD Sales', cells: [{ value: 11 }, { value: 10 }, { value: 21 }] },
        { label: 'L/Y Sales', cells: [{ value: 12 }, { value: 11 }, { value: 23 }] },
      ]),
    });
  });

  it('reconstructs last-year sales from rolling history plus the LY carry field', () => {
    const lyByStore = buildLegacyLastYearSalesByStore(
      [
        {
          snapshotAsOf: new Date('2026-04-24T18:00:00.000Z'),
          storeId: 21,
          dateLastReceived: null,
          dateFirstReceived: null,
          lastPriceChangeAt: null,
          averageCost: 0,
          onHand: 0,
          currentOnOrder: 0,
          futureOnOrder: 0,
          modelQty: 0,
          weekQtySales: 0,
          weekDolSales: 0,
          weekProfit: 0,
          weekMarkdown: 0,
          monthQtySales: 0,
          monthDolSales: 0,
          monthProfit: 0,
          monthMarkdown: 0,
          seasonQtySales: 0,
          seasonDolSales: 0,
          seasonProfit: 0,
          seasonMarkdown: 0,
          yearQtySales: 0,
          yearDolSales: 0,
          yearProfit: 0,
          yearMarkdown: 0,
          lyYearQtySales: 2,
          lastMonthOnHand: 0,
          lastSeasonOnHand: 0,
          lastYearOnHand: 0,
          lastMonthInvValue: 0,
          trendWeek8BegOnHand: 0,
        },
      ],
      new Map([
        [21, [
          { yearMonth: '2025-09', qty: 4, sales: 0 },
          { yearMonth: '2025-12', qty: 6, sales: 0 },
          { yearMonth: '2026-01', qty: 3, sales: 0 },
        ]],
      ]),
    );

    expect(lyByStore.get(21)).toBe(12);
  });

  it('builds the inquiry rollup from inventory history snapshot fields', () => {
    const rollup = buildInquiryRollupFromHistory([
      {
        snapshotAsOf: new Date('2026-04-24T18:00:00.000Z'),
        storeId: 21,
        dateLastReceived: null,
        dateFirstReceived: null,
        lastPriceChangeAt: null,
        averageCost: 0,
        onHand: 0,
        currentOnOrder: 0,
        futureOnOrder: 0,
        modelQty: 0,
        weekQtySales: 1,
        weekDolSales: 10,
        weekProfit: 4,
        weekMarkdown: 1,
        monthQtySales: 2,
        monthDolSales: 20,
        monthProfit: 8,
        monthMarkdown: 2,
        seasonQtySales: 3,
        seasonDolSales: 30,
        seasonProfit: 12,
        seasonMarkdown: 3,
        yearQtySales: 4,
        yearDolSales: 40,
        yearProfit: 16,
        yearMarkdown: 4,
        lyYearQtySales: 0,
        lastMonthOnHand: 0,
        lastSeasonOnHand: 0,
        lastYearOnHand: 0,
        lastMonthInvValue: 0,
        trendWeek8BegOnHand: 0,
      },
      {
        snapshotAsOf: new Date('2026-04-24T18:00:00.000Z'),
        storeId: 24,
        dateLastReceived: null,
        dateFirstReceived: null,
        lastPriceChangeAt: null,
        averageCost: 0,
        onHand: 0,
        currentOnOrder: 0,
        futureOnOrder: 0,
        modelQty: 0,
        weekQtySales: 2,
        weekDolSales: 15,
        weekProfit: 5,
        weekMarkdown: 0,
        monthQtySales: 3,
        monthDolSales: 25,
        monthProfit: 9,
        monthMarkdown: 1,
        seasonQtySales: 4,
        seasonDolSales: 35,
        seasonProfit: 13,
        seasonMarkdown: 2,
        yearQtySales: 5,
        yearDolSales: 45,
        yearProfit: 17,
        yearMarkdown: 3,
        lyYearQtySales: 0,
        lastMonthOnHand: 0,
        lastSeasonOnHand: 0,
        lastYearOnHand: 0,
        lastMonthInvValue: 0,
        trendWeek8BegOnHand: 0,
      },
    ]);

    expect(rollup).toEqual({
      week: { qty: 3, net: 25, markdown: 1, profit: 9 },
      month: { qty: 5, net: 45, markdown: 3, profit: 17 },
      season: { qty: 7, net: 65, markdown: 5, profit: 25 },
      year: { qty: 9, net: 85, markdown: 7, profit: 33 },
    });
  });
});
