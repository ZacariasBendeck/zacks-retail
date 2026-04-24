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

const { buildGrids } = __test;

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
          currentOnOrder: 0,
          futureOnOrder: 0,
          model: 5,
          maxQty: 7,
          reorder: 3,
          mtdSales: 0,
          stdSales: 0,
          ytdSales: 0,
          lySales: 0,
        },
        {
          storeNumber: 21,
          rowLabel: 'M',
          columnLabel: '8',
          onHand: 1,
          currentOnOrder: 0,
          futureOnOrder: 0,
          model: 2,
          maxQty: 4,
          reorder: 2,
          mtdSales: 0,
          stdSales: 0,
          ytdSales: 0,
          lySales: 0,
        },
      ],
      totals: { onHand: 3, currentOnOrder: 0, futureOnOrder: 0, ytdSales: 0, lySales: 0 },
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
          mtdSales: 0,
          stdSales: 0,
          ytdSales: 0,
          lySales: 0,
        },
        {
          storeNumber: 24,
          rowLabel: 'M',
          columnLabel: '8',
          onHand: 0,
          currentOnOrder: 0,
          futureOnOrder: 0,
          model: 3,
          maxQty: 5,
          reorder: 2,
          mtdSales: 0,
          stdSales: 0,
          ytdSales: 0,
          lySales: 0,
        },
      ],
      totals: { onHand: 4, currentOnOrder: 0, futureOnOrder: 0, ytdSales: 0, lySales: 0 },
    },
  ];

  it('keeps all-stores modes unscoped when a store-specific inquiry is requested', () => {
    const grids = buildGrids(stores, ['7', '8'], 21);

    expect(grids.onHand?.rows).toEqual([
      { label: 'Store 21', cells: [{ value: 2 }, { value: 1 }] },
    ]);
    expect(grids.allStoresOnHand?.rows).toEqual([
      { label: 'Store 21', cells: [{ value: 2 }, { value: 1 }] },
      { label: 'Store 24', cells: [{ value: 4 }, { value: 0 }] },
    ]);
    expect(grids.allStoresSummary?.rows).toEqual([
      { label: 'On Hand', cells: [{ value: 6 }, { value: 1 }] },
    ]);
  });

  it('derives short quantities as model minus on-hand without going negative', () => {
    const grids = buildGrids(stores, ['7', '8'], 21);

    expect(grids.short?.rows).toEqual([
      { label: 'Store 21', cells: [{ value: 3 }, { value: 1 }] },
    ]);
  });
});
