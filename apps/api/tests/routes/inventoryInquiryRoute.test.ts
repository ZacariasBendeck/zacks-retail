/**
 * Route-level tests for GET /api/v1/inventory/inquiry/:sku
 *
 * The `getInventoryInquiry` adapter function is mocked so these tests run
 * without a live RICS MDB connection. Tests verify the extended payload
 * (pricing, rollup, grids, pictureUrl) is correctly returned at the route boundary.
 */

// ── mock the adapter before app import ──────────────────────────────────────
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
  ChangeDetailQueryTooBroadError: class extends Error {
    name = 'ChangeDetailQueryTooBroadError';
  },
  TransferSummaryInputError: class extends Error {
    name = 'TransferSummaryInputError';
  },
}));

jest.mock('../../src/services/skuInquiryRecommendationService', () => ({
  analyzeSkuInquiryRecommendation: jest.fn(),
}));

import request from 'supertest';

const MOCK_SKU = 'ZN02-NDPT';

const mockInquiry = {
  sku: MOCK_SKU,
  master: {
    description: 'Test Product',
    brand: 'TestBrand',
    vendorCode: 'TBR',
    category: 1,
    season: 'SS26',
    retailPrice: 1499.0,
    currentCost: 750.0,
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
        {
          storeNumber: 2,
          rowLabel: 'M',
          columnLabel: '7',
          onHand: 2,
          currentOnOrder: 0,
          futureOnOrder: 0,
          model: 1,
          maxQty: 3,
          reorder: 1,
          mtdSales: 0,
          stdSales: 0,
          ytdSales: 1,
          lySales: 2,
        },
        {
          storeNumber: 2,
          rowLabel: 'M',
          columnLabel: '7.5',
          onHand: 0,
          currentOnOrder: 0,
          futureOnOrder: 0,
          model: 1,
          maxQty: 3,
          reorder: 1,
          mtdSales: 0,
          stdSales: 0,
          ytdSales: 0,
          lySales: 1,
        },
        {
          storeNumber: 2,
          rowLabel: 'M',
          columnLabel: '8',
          onHand: 3,
          currentOnOrder: 0,
          futureOnOrder: 0,
          model: 2,
          maxQty: 4,
          reorder: 2,
          mtdSales: 0,
          stdSales: 0,
          ytdSales: 2,
          lySales: 1,
        },
      ],
      totals: {
        onHand: 5,
        currentOnOrder: 0,
        futureOnOrder: 0,
        ytdSales: 3,
        lySales: 4,
      },
    },
  ],
  totals: {
    onHand: 5,
    currentOnOrder: 0,
    futureOnOrder: 0,
    ytdSales: 3,
    lySales: 4,
  },
  pricing: {
    retail: 1499.0,
    markdown1: 1199.0,
    markdown2: 999.0,
    avgCost: 0,
    currentCost: 750.0,
    listPrice: 1699.0,
    currentSlot: 'RETAIL' as const,
  },
  rollup: {
    week: { qty: 0, net: 0, markdown: 0, profit: 0 },
    month: { qty: 0, net: 0, markdown: 0, profit: 0 },
    season: { qty: 0, net: 0, markdown: 0, profit: 0 },
    year: { qty: 0, net: 0, markdown: 0, profit: 0 },
  },
  grids: {
    onHand: {
      columns: ['7', '7.5', '8'],
      rows: [
        {
          label: 'UNLIMITED C. 2000',
          cells: [{ value: 2 }, { value: 0 }, { value: 3 }],
        },
      ],
    },
    model: {
      columns: ['7', '7.5', '8'],
      rows: [
        {
          label: 'UNLIMITED C. 2000',
          cells: [{ value: 1 }, { value: 1 }, { value: 2 }],
        },
      ],
    },
  },
  pictureUrl: '/rics-images/ZN02-NDPT.jpg',
};

const mockFindBySize = {
  seedSku: '349101-BKPT',
  columnLabel: '080',
  rowLabel: 'M',
  sizeTypeCode: 3,
  sizeTypeDesc: 'Women Dress',
  restrictToSizeType: true,
  separateByStore: true,
  sort: 'DESCRIPTION',
  rows: [
    {
      sku: '349101-BKPT',
      description: 'Pump',
      brand: 'Nina',
      vendorCode: 'NINA',
      category: 560,
      styleColor: 'BLACK PATENT',
      sizeTypeCode: 3,
      sizeTypeDesc: 'Women Dress',
      totalOnHand: 4,
      storeCount: 1,
      storeNumber: 2,
      storeName: 'UNLIMITED C. 2000',
    },
  ],
  totalMatches: 1,
  totalOnHand: 4,
};

describe('GET /api/v1/inventory/inquiry/:sku', () => {
  let app: any;
  let ricsAdapter: any;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
  });

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ricsAdapter = require('../../src/services/ricsInventoryAdapter');
    (ricsAdapter.getInventoryInquiry as jest.Mock).mockReset();
    (ricsAdapter.getInventoryInquiry as jest.Mock).mockResolvedValue(
      mockInquiry
    );
    process.env.INVENTORY_SOURCE = 'rics';
  });

  it('returns the full extended payload with pricing, rollup, grids, pictureUrl', async () => {
    const res = await request(app).get(
      `/api/v1/inventory/inquiry/${MOCK_SKU}`
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        sku: MOCK_SKU,
        pricing: expect.any(Object),
        rollup: expect.any(Object),
        grids: expect.any(Object),
      })
    );
    expect(
      res.body.pictureUrl === null || typeof res.body.pictureUrl === 'string'
    ).toBe(true);
  });

  it('includes all pricing slots and currentSlot', async () => {
    const res = await request(app).get(
      `/api/v1/inventory/inquiry/${MOCK_SKU}`
    );

    expect(res.status).toBe(200);
    expect(res.body.pricing).toEqual(
      expect.objectContaining({
        retail: expect.any(Number),
        markdown1: expect.any(Number),
        markdown2: expect.any(Number),
        avgCost: expect.any(Number),
        currentCost: expect.any(Number),
        listPrice: expect.any(Number),
        currentSlot: expect.stringMatching(/^(LIST|RETAIL|MARKDOWN1|MARKDOWN2)$/),
      })
    );
  });

  it('includes rollup with Week/Month/Season/Year', async () => {
    const res = await request(app).get(
      `/api/v1/inventory/inquiry/${MOCK_SKU}`
    );

    expect(res.status).toBe(200);
    expect(res.body.rollup).toEqual(
      expect.objectContaining({
        week: expect.objectContaining({
          qty: expect.any(Number),
          net: expect.any(Number),
          markdown: expect.any(Number),
          profit: expect.any(Number),
        }),
        month: expect.any(Object),
        season: expect.any(Object),
        year: expect.any(Object),
      })
    );
  });

  it('includes grids object with grid definitions', async () => {
    const res = await request(app).get(
      `/api/v1/inventory/inquiry/${MOCK_SKU}`
    );

    expect(res.status).toBe(200);
    expect(res.body.grids).toBeDefined();
    expect(typeof res.body.grids).toBe('object');
  });

  it('passes storeId through to the adapter when the route is store-scoped', async () => {
    const res = await request(app).get(
      `/api/v1/inventory/inquiry/${MOCK_SKU}?storeId=21`
    );

    expect(res.status).toBe(200);
    expect(ricsAdapter.getInventoryInquiry).toHaveBeenCalledWith(MOCK_SKU, 21, undefined);
  });

  it('returns 404 when adapter returns null', async () => {
    (ricsAdapter.getInventoryInquiry as jest.Mock).mockResolvedValue(null);

    const res = await request(app).get('/api/v1/inventory/inquiry/NONEXIST');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/inventory/inquiry/:sku/ai-recommendation', () => {
  let app: any;
  let recommendationService: any;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
  });

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    recommendationService = require('../../src/services/skuInquiryRecommendationService');
    (recommendationService.analyzeSkuInquiryRecommendation as jest.Mock).mockReset();
    (recommendationService.analyzeSkuInquiryRecommendation as jest.Mock).mockResolvedValue({
      summary: 'Increase the model and buy ahead of lead time.',
      styleTag: 'WINNER',
      decision: 'BUY',
      urgency: 'MEDIUM',
      confidence: 'HIGH',
      baselineRisk: {
        daysUntilModelRisk: 45,
        estimatedModelRiskDate: '2026-06-10',
        basis: 'Month pace would consume excess above model in 45 days.',
      },
      buyPlan: {
        shouldBuy: true,
        quantity: 24,
        orderByDate: '2026-03-12',
        estimatedArrivalDate: '2026-06-10',
        leadTimeDays: 90,
        basis: 'Buying 24 units preserves baseline coverage through the lead-time window.',
      },
      actions: [
        {
          type: 'MODEL_INCREASE',
          priority: 1,
          title: 'Raise the size 070 model at store 29',
          details: 'Increase the size 070 model at store 29 by 1.',
          targetStoreNumber: 29,
          targetStoreName: 'Unlimited GaleriasSP',
          size: '070',
          quantity: 1,
        },
      ],
      reasons: ['Chain stock is heavy overall and the shortage is distributional.'],
      watchouts: ['Do not replenish stores called out as closed in operator notes.'],
      questions: [],
    });
  });

  it('returns a structured AI recommendation and forwards operator notes', async () => {
    const res = await request(app)
      .post(`/api/v1/inventory/inquiry/${MOCK_SKU}/ai-recommendation`)
      .send({ notes: 'Store 32 is closed for renovations.' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        summary: expect.any(String),
        styleTag: 'WINNER',
        decision: 'BUY',
        actions: expect.any(Array),
      }),
    );
    expect(recommendationService.analyzeSkuInquiryRecommendation).toHaveBeenCalledWith(
      MOCK_SKU,
      { notes: 'Store 32 is closed for renovations.' },
    );
  });

  it('returns 404 when the AI service reports the SKU is missing', async () => {
    (recommendationService.analyzeSkuInquiryRecommendation as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/inventory/inquiry/NONEXIST/ai-recommendation')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SKU_NOT_FOUND');
  });

  it('returns ANALYSIS_FAILED when the AI service throws a general error', async () => {
    (recommendationService.analyzeSkuInquiryRecommendation as jest.Mock).mockRejectedValue(
      new Error('AI recommendation response could not be parsed'),
    );

    const res = await request(app)
      .post(`/api/v1/inventory/inquiry/${MOCK_SKU}/ai-recommendation`)
      .send({});

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('ANALYSIS_FAILED');
  });
});

describe('GET /api/v1/inventory/find-by-size', () => {
  let app: any;
  let ricsAdapter: any;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
  });

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ricsAdapter = require('../../src/services/ricsInventoryAdapter');
    (ricsAdapter.findBySize as jest.Mock).mockReset();
    (ricsAdapter.findBySize as jest.Mock).mockResolvedValue(mockFindBySize);
    process.env.INVENTORY_SOURCE = 'rics';
  });

  it('passes the widened size-search filters through to the facade', async () => {
    const res = await request(app).get(
      '/api/v1/inventory/find-by-size?seedSku=349101-BKPT&sizeTypeCode=3&columnLabel=080&rowLabel=M&restrictToSizeType=true&vendorCode=NINA&category=560&styleColor=BLACK&storeNumbers=1,2&sort=DESCRIPTION&separateByStore=true&limit=750',
    );

    expect(res.status).toBe(200);
    expect(ricsAdapter.findBySize).toHaveBeenCalledWith(
      expect.objectContaining({
        seedSku: '349101-BKPT',
        sizeTypeCode: 3,
        columnLabel: '080',
        rowLabel: 'M',
        restrictToSizeType: true,
        vendorCode: 'NINA',
        category: 560,
        styleColor: 'BLACK',
        storeNumbers: [1, 2],
        sort: 'DESCRIPTION',
        separateByStore: true,
        limit: 750,
      }),
    );
    expect(res.body).toEqual(expect.objectContaining({ totalMatches: 1, totalOnHand: 4 }));
  });

  it('requires at least one size label', async () => {
    const res = await request(app).get('/api/v1/inventory/find-by-size?vendorCode=NINA');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_PARAMS');
  });
});
