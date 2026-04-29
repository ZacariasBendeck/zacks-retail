/**
 * Unit tests for the on-hand-at-cost adapter used by the Sales Analysis
 * ROI/Turns columns. The Prisma raw-query layer is mocked so tests run on
 * any machine - no Postgres connection needed.
 */

jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  getOnHandAtCostByDimension,
  getOnHandInventoryByDimension,
  clearOnHandCache,
} = require('../src/services/salesReporting/ricsOnHandAtCostAdapter');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../src/db/prisma');

function setMockRows(rows: unknown[]): void {
  (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValueOnce(rows);
}

describe('getOnHandAtCostByDimension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearOnHandCache();
  });

  it('groups by category for CATEGORY_SUMMARY', async () => {
    setMockRows([
      { SKU: 'A', Store: 2, TotalOnHand: 10, Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
      { SKU: 'A', Store: 16, TotalOnHand: 5, Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
      { SKU: 'B', Store: 2, TotalOnHand: 3, Category: 556, CurrentCost: 50, Vendor: 'V1', Season: null },
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
      { SKU: 'A', Store: 2, TotalOnHand: 10, Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
      { SKU: 'A', Store: 16, TotalOnHand: 5, Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
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
      { SKU: 'A', Store: 2, TotalOnHand: 10, Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
      { SKU: 'B', Store: 2, TotalOnHand: 10, Category: 600, CurrentCost: 100, Vendor: 'V1', Season: null },
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
      { SKU: 'A', Store: 2, TotalOnHand: 10, Category: 560, CurrentCost: 100, Vendor: 'V1', Season: null },
      { SKU: 'B', Store: 2, TotalOnHand: 10, Category: 599, CurrentCost: 100, Vendor: 'V1', Season: null },
      { SKU: 'C', Store: 2, TotalOnHand: 10, Category: 700, CurrentCost: 100, Vendor: 'V1', Season: null },
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

  it('groups by season for SEASON_SUMMARY', async () => {
    setMockRows([
      { SKU: 'A', Store: 2, TotalOnHand: 10, Category: 1, CurrentCost: 100, Vendor: 'V1', Season: '1' },
      { SKU: 'B', Store: 2, TotalOnHand: 5, Category: 2, CurrentCost: 100, Vendor: 'V2', Season: '1' },
      { SKU: 'C', Store: 2, TotalOnHand: 3, Category: 2, CurrentCost: 100, Vendor: 'V2', Season: '2' },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'SEASON_SUMMARY',
      storeOption: 'COMBINE',
      criteria: {},
    });
    expect(map.get('1')).toBeCloseTo(1500, 2);
    expect(map.get('2')).toBeCloseTo(300, 2);
  });

  it('groups by vendor code for VENDOR_SUMMARY', async () => {
    setMockRows([
      { SKU: 'A', Store: 2, TotalOnHand: 10, Category: 1, CurrentCost: 100, Vendor: 'NIKE', Season: null },
      { SKU: 'B', Store: 2, TotalOnHand: 5, Category: 2, CurrentCost: 100, Vendor: 'NIKE', Season: null },
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
      { SKU: 'KISS001-BK', Store: 2, TotalOnHand: 10, Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
      { SKU: 'KISS002-BK', Store: 2, TotalOnHand: 5, Category: 556, CurrentCost: 80, Vendor: 'V1', Season: null },
    ]);

    const map = await getOnHandAtCostByDimension({
      reportType: 'SKU_DETAIL',
      storeOption: 'COMBINE',
      criteria: {},
    });
    expect(map.get('KISS001-BK')).toBeCloseTo(1000, 2);
    expect(map.get('KISS002-BK')).toBeCloseTo(400, 2);
  });

  it('returns on-hand units and weighted unit cost', async () => {
    setMockRows([
      { SKU: 'A', Store: 2, TotalOnHand: 10, Category: 556, CurrentCost: 100, Vendor: 'V1', Season: null },
      { SKU: 'B', Store: 2, TotalOnHand: 5, Category: 556, CurrentCost: 80, Vendor: 'V1', Season: null },
    ]);

    const map = await getOnHandInventoryByDimension({
      reportType: 'CATEGORY_SUMMARY',
      storeOption: 'COMBINE',
      criteria: {},
    });

    expect(map.get('556')).toMatchObject({
      unitsOnHand: 15,
      onHandAtCost: 1400,
    });
    expect(map.get('556')?.inventoryUnitCost).toBeCloseTo(93.33, 2);
  });
});
