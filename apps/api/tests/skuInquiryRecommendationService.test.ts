const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  })),
}));

jest.mock('../src/services/ricsInventoryFacade', () => ({
  getInventoryInquiry: jest.fn(),
  getInquiryInfo: jest.fn(),
  getInquiryTrend: jest.fn(),
  getInquiryOpenPoRows: jest.fn(),
}));

import {
  analyzeSkuInquiryRecommendation,
  clearSkuInquiryRecommendationCache,
  clearSkuInquiryRecommendationPromptCache,
} from '../src/services/skuInquiryRecommendationService';
import {
  getInquiryInfo,
  getInquiryOpenPoRows,
  getInquiryTrend,
  getInventoryInquiry,
} from '../src/services/ricsInventoryFacade';

const mockInquiry = {
  sku: 'HG202508-BKPU',
  master: {
    description: 'Test Shoe',
    brand: 'KHAN',
    vendorCode: 'KHAN',
    category: 557,
    season: 'NAV 25',
    sizeType: {
      code: 3,
      desc: 'Zap Dam-Cab 5-14 SC',
      rowLabels: [''],
      columnLabels: ['050', '060', '070'],
    },
  },
  stores: [
    {
      storeNumber: 99,
      storeName: 'BODEGA GENERAL',
      cells: [
        {
          columnLabel: '050',
          onHand: 5,
          model: 0,
          ytdSales: 0,
          lySales: 0,
        },
      ],
      totals: {
        onHand: 5,
        currentOnOrder: 0,
        futureOnOrder: 0,
      },
    },
  ],
  totals: {
    onHand: 5,
    currentOnOrder: 0,
    futureOnOrder: 0,
  },
  pricing: {
    retail: 378.26,
    markdown1: 189.13,
    markdown2: 0,
    avgCost: 120,
    currentCost: 120,
    listPrice: 435,
    currentSlot: 'LIST',
  },
  rollup: {
    week: { qty: 1, net: 378.26, markdown: 0, profit: 100 },
    month: { qty: 2, net: 756.52, markdown: 0, profit: 200 },
    season: { qty: 3, net: 1134.78, markdown: 0, profit: 300 },
    year: { qty: 4, net: 1513.04, markdown: 0, profit: 400 },
  },
  grids: {},
};

describe('skuInquiryRecommendationService', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    clearSkuInquiryRecommendationCache();
    clearSkuInquiryRecommendationPromptCache();
    mockCreate.mockReset();
    (getInventoryInquiry as jest.Mock).mockReset();
    (getInquiryInfo as jest.Mock).mockReset();
    (getInquiryTrend as jest.Mock).mockReset();
    (getInquiryOpenPoRows as jest.Mock).mockReset();
    (getInventoryInquiry as jest.Mock).mockResolvedValue(mockInquiry);
    (getInquiryInfo as jest.Mock).mockResolvedValue(null);
    (getInquiryTrend as jest.Mock).mockResolvedValue(null);
    (getInquiryOpenPoRows as jest.Mock).mockResolvedValue([]);
  });

  afterAll(() => {
    if (originalKey == null) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it('returns the structured JSON payload when Claude emits text output', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: 'Increase the model now and buy ahead of the lead-time window.',
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
                title: 'Raise model at store 29',
                details: 'Increase size 070 model at store 29 by 1.',
                targetStoreNumber: 29,
                size: '070',
                quantity: 1,
              },
            ],
            reasons: ['Chain stock is heavy overall.'],
            watchouts: ['Store 32 is closed for renovations.'],
            questions: [],
          }),
        },
      ],
    });

    const result = await analyzeSkuInquiryRecommendation('HG202508-BKPU', {
      notes: 'Store 32 is closed for renovations.',
    });

    expect(result).toEqual(
      expect.objectContaining({
        styleTag: 'WINNER',
        decision: 'BUY',
        confidence: 'HIGH',
        buyPlan: expect.objectContaining({
          shouldBuy: true,
          quantity: 24,
        }),
        actions: [
          expect.objectContaining({
            type: 'MODEL_INCREASE',
            targetStoreNumber: 29,
            size: '070',
          }),
        ],
      }),
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 1200,
        messages: [
          expect.objectContaining({
            role: 'user',
            content: expect.not.stringContaining('\n  "sku"'),
          }),
        ],
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('caches duplicate SKU and notes recommendations inside the API process', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: 'Hold inventory as-is.',
            styleTag: 'OK',
            decision: 'HOLD',
            urgency: 'LOW',
            confidence: 'HIGH',
            baselineRisk: {
              daysUntilModelRisk: null,
              estimatedModelRiskDate: null,
              basis: 'Chain inventory remains above model.',
            },
            buyPlan: {
              shouldBuy: false,
              quantity: null,
              orderByDate: null,
              estimatedArrivalDate: null,
              leadTimeDays: 90,
              basis: 'No buy is needed.',
            },
            actions: [],
            reasons: ['No size is below model.'],
            watchouts: [],
            questions: [],
          }),
        },
      ],
    });

    const first = await analyzeSkuInquiryRecommendation('HG202508-BKPU', {
      notes: 'No special context.',
    });
    const second = await analyzeSkuInquiryRecommendation('hg202508-bkpu', {
      notes: 'No special context.',
    });

    expect(first).toEqual(second);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(getInventoryInquiry).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent identical recommendations', async () => {
    let resolveResponse: (value: unknown) => void = () => {};
    mockCreate.mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );

    const first = analyzeSkuInquiryRecommendation('HG202508-BKPU', {
      notes: 'Same notes.',
    });
    const second = analyzeSkuInquiryRecommendation('HG202508-BKPU', {
      notes: 'Same notes.',
    });

    resolveResponse({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: 'Investigate the demand signal.',
            styleTag: 'OK',
            decision: 'INVESTIGATE',
            urgency: 'MEDIUM',
            confidence: 'LOW',
            baselineRisk: {
              daysUntilModelRisk: null,
              estimatedModelRiskDate: null,
              basis: 'AI needs cleaner demand data.',
            },
            buyPlan: {
              shouldBuy: false,
              quantity: null,
              orderByDate: null,
              estimatedArrivalDate: null,
              leadTimeDays: 90,
              basis: 'Do not buy until the demand signal is verified.',
            },
            actions: [],
            reasons: [],
            watchouts: ['Demand signal is unclear.'],
            questions: ['Confirm whether a promotion affected sales.'],
          }),
        },
      ],
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(getInventoryInquiry).toHaveBeenCalledTimes(1);
  });

  it('times out stalled AI requests', async () => {
    jest.useFakeTimers();
    try {
      mockCreate.mockImplementation(
        (_params, options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }),
      );

      const request = analyzeSkuInquiryRecommendation('HG202508-BKPU', {
        notes: 'No special context.',
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const assertion = expect(request).rejects.toThrow(
        'AI recommendation timed out after 45000ms',
      );
      await jest.advanceTimersByTimeAsync(45_000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});
