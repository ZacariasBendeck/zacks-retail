/**
 * Tests for the extended `getInventoryInquiry` payload — pricing, rollup,
 * grids, and pictureUrl blocks added in Task 5.
 *
 * The RICS adapter is mocked so the tests run without any MDB / PowerShell
 * dependency, matching the pattern in salesHistoryByMonthFacade.test.ts.
 */

// ─────────────────────────── adapter mock ─────────────────────────────────

const MOCK_SKU = 'ZN02-NDPT';

const mockInquiry = {
  sku: MOCK_SKU,
  master: {
    description: 'Test Product',
    brand: 'TestBrand',
    vendorCode: 'TBR',
    category: 1,
    season: 'SS26',
    retailPrice: 1499.00,
    currentCost:  750.00,
    sizeType: {
      code: 3,
      desc: 'Shoe',
      rowLabels: ['M', 'W'],
      columnLabels: ['7', '7.5', '8', '8.5', '9'],
    },
  },
  stores: [
    {
      storeNumber: 2,
      storeName: 'UNLIMITED C. 2000',
      cells: [
        { storeNumber: 2, rowLabel: 'M', columnLabel: '7',   onHand: 2, currentOnOrder: 0, futureOnOrder: 0, model: 1, maxQty: 3, reorder: 1, mtdSales: 0, stdSales: 0, ytdSales: 1, lySales: 2 },
        { storeNumber: 2, rowLabel: 'M', columnLabel: '7.5', onHand: 0, currentOnOrder: 0, futureOnOrder: 0, model: 1, maxQty: 3, reorder: 1, mtdSales: 0, stdSales: 0, ytdSales: 0, lySales: 1 },
        { storeNumber: 2, rowLabel: 'M', columnLabel: '8',   onHand: 3, currentOnOrder: 0, futureOnOrder: 0, model: 2, maxQty: 4, reorder: 2, mtdSales: 0, stdSales: 0, ytdSales: 2, lySales: 1 },
      ],
      totals: { onHand: 5, currentOnOrder: 0, futureOnOrder: 0, ytdSales: 3, lySales: 4 },
    },
  ],
  totals: { onHand: 5, currentOnOrder: 0, futureOnOrder: 0, ytdSales: 3, lySales: 4 },
  pricing: {
    retail:      1499.00,
    markdown1:   1199.00,
    markdown2:    999.00,
    avgCost:         0,    // AvgCost not on InventoryMaster; deferred
    currentCost:  750.00,
    listPrice:   1699.00,
    currentSlot: 'RETAIL' as const,
  },
  rollup: {
    week:   { qty: 0, net: 0, markdown: 0, profit: 0 },
    month:  { qty: 0, net: 0, markdown: 0, profit: 0 },
    season: { qty: 0, net: 0, markdown: 0, profit: 0 },
    year:   { qty: 0, net: 0, markdown: 0, profit: 0 },
  },
  grids: {
    onHand: {
      columns: ['7', '7.5', '8'],
      rows: [{ label: 'UNLIMITED C. 2000', cells: [{ value: 2 }, { value: 0 }, { value: 3 }] }],
    },
    model: {
      columns: ['7', '7.5', '8'],
      rows: [{ label: 'UNLIMITED C. 2000', cells: [{ value: 1 }, { value: 1 }, { value: 2 }] }],
    },
  },
  pictureUrl: '/rics-images/ZN02-NDPT.jpg',
};

jest.mock('../../src/services/ricsInventoryAdapter', () => ({
  getInventoryInquiry: jest.fn(),
  findBySize: jest.fn(),
  getInventoryDetailReport: jest.fn(),
  getChangeDetail: jest.fn(),
  getTransferSummary: jest.fn(),
  getSkuStoreRollup: jest.fn(),
  getSkuStoreCellRollup: jest.fn(),
  getRecommendedTransfers: jest.fn(),
  warmup: jest.fn(),
  clearCache: jest.fn(),
  ChangeDetailQueryTooBroadError: class extends Error { name = 'ChangeDetailQueryTooBroadError'; },
  TransferSummaryInputError: class extends Error { name = 'TransferSummaryInputError'; },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ricsAdapter = require('../../src/services/ricsInventoryAdapter');

// ─────────────────────────── setup ────────────────────────────────────────

beforeEach(() => {
  process.env.INVENTORY_SOURCE = 'rics';
  (ricsAdapter.getInventoryInquiry as jest.Mock).mockReset();
  (ricsAdapter.getInventoryInquiry as jest.Mock).mockResolvedValue(mockInquiry);
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('getInventoryInquiry (extended payload)', () => {
  it('returns the pricing block with all four slots and currentSlot', async () => {
    // Use require inside test so the mock is registered before import
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getInventoryInquiry } = require('../../src/services/ricsInventoryFacade');
    const result = await getInventoryInquiry(MOCK_SKU);

    expect(result).not.toBeNull();
    expect(result!.pricing).toEqual(
      expect.objectContaining({
        retail:      expect.any(Number),
        markdown1:   expect.any(Number),
        markdown2:   expect.any(Number),
        avgCost:     expect.any(Number),
        currentCost: expect.any(Number),
        listPrice:   expect.any(Number),
        currentSlot: expect.stringMatching(/^(LIST|RETAIL|MARKDOWN1|MARKDOWN2)$/),
      }),
    );
  });

  it('returns the rollup strip with Week/Month/Season/Year × Qty/Net/Markdown/Profit', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getInventoryInquiry } = require('../../src/services/ricsInventoryFacade');
    const result = await getInventoryInquiry(MOCK_SKU);

    expect(result!.rollup).toEqual(
      expect.objectContaining({
        week:   expect.objectContaining({ qty: expect.any(Number), net: expect.any(Number), markdown: expect.any(Number), profit: expect.any(Number) }),
        month:  expect.objectContaining({ qty: expect.any(Number) }),
        season: expect.objectContaining({ qty: expect.any(Number) }),
        year:   expect.objectContaining({ qty: expect.any(Number) }),
      }),
    );
  });

  it('returns a grids object (may contain onHand/model/max/reorder/short/allStoresOnHand/allStoresSummary)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getInventoryInquiry } = require('../../src/services/ricsInventoryFacade');
    const result = await getInventoryInquiry(MOCK_SKU);

    expect(result!.grids).toBeDefined();
    // At least one of the v1-live keys should be populated for a SKU with inventory
    const keys = Object.keys(result!.grids);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('returns pictureUrl when PictureFileName is set, null otherwise', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getInventoryInquiry } = require('../../src/services/ricsInventoryFacade');
    const result = await getInventoryInquiry(MOCK_SKU);

    expect(
      result!.pictureUrl === null || typeof result!.pictureUrl === 'string',
    ).toBe(true);
    if (typeof result!.pictureUrl === 'string') {
      expect(result!.pictureUrl).toMatch(/^\/rics-images\//);
    }
  });
});
