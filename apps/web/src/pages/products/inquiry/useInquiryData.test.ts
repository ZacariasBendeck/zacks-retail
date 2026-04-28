import { describe, expect, it } from 'vitest';
import { flattenInquiryPayload } from './useInquiryData';

describe('flattenInquiryPayload', () => {
  it('keeps the backend category name with the category number', () => {
    const result = flattenInquiryPayload({
      sku: '25604-RDPT',
      master: {
        description: 'VesMetPunSinFLEX A',
        brand: 'KNIN',
        vendorCode: 'KNIN',
        category: 567,
        categoryName: 'Zap T/Med',
        vendorSku: 'AUSHAN H201#4001',
        styleColor: 'ROJO/PT',
        status: 'ACTIVE',
        season: '25',
        sizeType: {
          code: 216,
          desc: 'Zap Cab-Dam 34-46 Sl',
          rowLabels: [],
          columnLabels: [],
        },
      },
      pricing: {
        retail: 0,
        markdown1: 0,
        markdown2: 0,
        avgCost: 0,
        currentCost: 0,
        listPrice: 0,
        currentSlot: 'RETAIL',
      },
      rollup: {
        week: { qty: 0, net: 0, markdown: 0, profit: 0 },
        month: { qty: 0, net: 0, markdown: 0, profit: 0 },
        season: { qty: 0, net: 0, markdown: 0, profit: 0 },
        year: { qty: 0, net: 0, markdown: 0, profit: 0 },
      },
      grids: {},
      pictureUrl: null,
    });

    expect(result.category).toEqual({ id: 567, name: 'Zap T/Med' });
    expect(result.vendorSku).toBe('AUSHAN H201#4001');
    expect(result.styleColor).toBe('ROJO/PT');
    expect(result.status).toBe('ACTIVE');
  });
});
