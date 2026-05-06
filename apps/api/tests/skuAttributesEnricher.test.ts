jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

jest.mock('../src/services/products/onHandTotalsService', () => ({
  getOnHandTotals: jest.fn(),
}));

jest.mock('../src/services/ricsImageUrl', () => ({
  buildRicsImageUrl: (fileName: string | null) => (fileName ? `/api/rics-images/${fileName}` : null),
}));

import { prisma } from '../src/db/prisma';
import { getOnHandTotals } from '../src/services/products/onHandTotalsService';
import { loadSkuAttributesBySku } from '../src/services/salesReporting/skuAttributesEnricher';

const mockQuery = prisma.$queryRawUnsafe as jest.Mock;
const mockGetOnHandTotals = getOnHandTotals as jest.Mock;

describe('loadSkuAttributesBySku', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetOnHandTotals.mockReset();
  });

  it('returns picture-report enrichment fields and computes age by report end date', async () => {
    mockQuery
      .mockResolvedValueOnce([
        {
          sku_code: '6608-BKPU',
          description: 'Zap Deport Mujer',
          vendor_code: 'AGO',
          manufacturer: 'AGO Tianfu',
          category_number: 216,
          category_desc: 'Zap Deport Mujer',
          department_number: 5,
          department_desc: 'ZAPATO MUJER',
          season: 'A',
          group_code: 'IBL',
          style_color: 'PLAN/BK',
          current_price: 907,
          current_cost: 172.11,
          picture_file_name: '6608-BKPU.jpg',
          keywords: 'IBL ZB C2523 2D50',
          size_type: 216,
          label_code: 'H',
          color_code: 'N/BK',
          discount_code: '10',
        },
      ])
      .mockResolvedValueOnce([
        {
          sku_code: '6608-BKPU',
          store_id: 2,
          date_first_received: new Date('2026-01-01T00:00:00.000Z'),
          date_last_received: new Date('2026-03-01T00:00:00.000Z'),
        },
        {
          sku_code: '6608-BKPU',
          store_id: 13,
          date_first_received: new Date('2026-02-01T00:00:00.000Z'),
          date_last_received: new Date('2026-04-01T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([]);
    mockGetOnHandTotals.mockResolvedValue(new Map([['6608-BKPU', 37]]));

    const attrs = await loadSkuAttributesBySku(['6608-BKPU'], {
      storeNumbers: [2, 13],
      reportEndDate: '2026-04-01',
    });

    const row = attrs.get('6608-BKPU');
    expect(row).toMatchObject({
      description: 'Zap Deport Mujer',
      vendorCode: 'AGO',
      categoryNumber: 216,
      sizeType: 216,
      keywords: 'IBL ZB C2523 2D50',
      labelCode: 'H',
      colorCode: 'N/BK',
      discountCode: '10',
      pictureUrl: '/api/rics-images/6608-BKPU.jpg',
      unitsOnHand: 37,
      dateFirstReceived: '2026-01-01',
      dateLastReceived: '2026-04-01',
      ageDays: 90,
    });
    expect(row?.ageDaysByStore).toEqual({ '2': 90, '13': 59 });
  });
});
