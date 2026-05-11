jest.mock('../../../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

import { prisma } from '../../../src/db/prisma';
import {
  calculateMatchingSetTicketCounts,
  queryMatchingSetSalesHistory,
} from '../../../src/services/products/matchingSetSalesHistoryService';

const mockQuery = prisma.$queryRawUnsafe as jest.Mock;

describe('calculateMatchingSetTicketCounts', () => {
  test.each([
    [{ jacketQty: 1, pantQty: 1, vestQty: 0 }, { core2PieceSets: 1, threePieceSets: 0, jacketOnlyQty: 0, pantOnlyQty: 0, vestExtraQty: 0 }],
    [{ jacketQty: 1, pantQty: 1, vestQty: 1 }, { core2PieceSets: 1, threePieceSets: 1, jacketOnlyQty: 0, pantOnlyQty: 0, vestExtraQty: 0 }],
    [{ jacketQty: 1, pantQty: 2, vestQty: 0 }, { core2PieceSets: 1, threePieceSets: 0, jacketOnlyQty: 0, pantOnlyQty: 1, vestExtraQty: 0 }],
    [{ jacketQty: 0, pantQty: 2, vestQty: 0 }, { core2PieceSets: 0, threePieceSets: 0, jacketOnlyQty: 0, pantOnlyQty: 2, vestExtraQty: 0 }],
    [{ jacketQty: 1, pantQty: 1, vestQty: 2 }, { core2PieceSets: 1, threePieceSets: 1, jacketOnlyQty: 0, pantOnlyQty: 0, vestExtraQty: 1 }],
  ])('derives set counts for %j', (input, expected) => {
    expect(calculateMatchingSetTicketCounts(input)).toEqual(expected);
  });
});

describe('queryMatchingSetSalesHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns mapped summary, size rows, totals, and uses gross sales quantities separately from returns', async () => {
    mockQuery
      .mockResolvedValueOnce([
        {
          salesMonth: '2026-01',
          storeId: 1,
          setId: '00000000-0000-4000-8000-000000000001',
          setCode: 'MS-2026-000001',
          descriptionEs: 'Navy suit',
          vendorId: 'ACME',
          vendorName: 'Acme',
          vendorStyle: 'ST100',
          materialCode: 'WOOL',
          materialLabel: 'Wool',
          sharedColorCode: 'NVY',
          sharedColorLabel: 'Navy',
          season: '26',
          chainId: 'main',
          chainLabel: 'Main',
          core2PieceSets: 2,
          threePieceSets: 1,
          vestAttachmentRate: '0.5000',
          jacketUnitsSold: 2,
          pantUnitsSold: 3,
          vestUnitsSold: 1,
          jacketOnlyQty: 0,
          pantOnlyQty: 1,
          vestExtraQty: 0,
          jacketReturnUnits: 1,
          pantReturnUnits: 0,
          vestReturnUnits: 0,
          totalReturnUnits: 1,
          netSales: '1000.50',
          grossMargin: '420.25',
        },
      ])
      .mockResolvedValueOnce([
        {
          salesMonth: '2026-01',
          storeId: 1,
          setId: '00000000-0000-4000-8000-000000000001',
          setCode: 'MS-2026-000001',
          roleCode: 'pant',
          roleLabelEs: 'Pantalon',
          sizeLabel: '34',
          columnLabel: '',
          rowLabel: '34',
          unitsSold: 3,
          returnUnits: 0,
          netSales: '300',
          grossMargin: '120',
        },
      ])
      .mockResolvedValueOnce([
        {
          skuId: '10000000-0000-4000-8000-000000000001',
          skuCode: 'JKT-1',
          roleCode: 'jacket',
          roleLabelEs: 'Saco',
          quantityRatio: '1',
          unitCost: '100',
        },
        {
          skuId: '10000000-0000-4000-8000-000000000002',
          skuCode: 'PNT-1',
          roleCode: 'pant',
          roleLabelEs: 'Pantalon',
          quantityRatio: '1.2',
          unitCost: '50',
        },
        {
          skuId: '10000000-0000-4000-8000-000000000003',
          skuCode: 'VST-1',
          roleCode: 'vest',
          roleLabelEs: 'Chaleco',
          quantityRatio: '0.5',
          unitCost: '30',
        },
      ])
      .mockResolvedValueOnce([
        {
          skuId: '10000000-0000-4000-8000-000000000001',
          columnLabel: '',
          rowLabel: '40',
          qty: 2,
        },
        {
          skuId: '10000000-0000-4000-8000-000000000002',
          columnLabel: '',
          rowLabel: '34',
          qty: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          skuId: '10000000-0000-4000-8000-000000000002',
          columnLabel: '',
          rowLabel: '34',
          qty: 3,
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await queryMatchingSetSalesHistory({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      setId: '00000000-0000-4000-8000-000000000001',
      chainId: 'main',
      storeNumbers: [1, 1, 2],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.storeNumbers).toEqual([1, 2]);
    expect(result.value.rows[0]).toMatchObject({
      core2PieceSets: 2,
      threePieceSets: 1,
      vestAttachmentRate: 0.5,
      pantOnlyQty: 1,
      jacketReturnUnits: 1,
      netSales: 1000.5,
      grossMargin: 420.25,
    });
    expect(result.value.sizeRows[0]).toMatchObject({
      roleCode: 'pant',
      sizeLabel: '34',
      unitsSold: 3,
      returnUnits: 0,
    });
    expect(result.value.totals).toMatchObject({
      core2PieceSets: 2,
      threePieceSets: 1,
      vestAttachmentRate: 0.5,
      totalReturnUnits: 1,
      netSales: 1000.5,
      grossMargin: 420.25,
    });
    expect(result.value.monthlyRows[0]).toMatchObject({
      salesMonth: '2026-01',
      storeId: null,
      core2PieceSets: 2,
      threePieceSets: 1,
    });
    expect(result.value.buyingGuidance).toMatchObject({
      historicalSalesRatio: { label: '1 : 1.5 : 0.5' },
      demandReorderUnits: 4,
      demandReorderCost: 200,
    });
    expect(result.value.buyingGuidance?.roles.find((role) => role.roleCode === 'pant')).toMatchObject({
      demandReorderQty: 4,
      action: 'BUY_MORE',
    });
    expect(result.value.buyingGuidance?.sizeActions[0]).toMatchObject({
      roleCode: 'pant',
      sizeLabel: '34',
      action: 'BUY_MORE',
      demandReorderQty: 4,
    });

    const summarySql = String(mockQuery.mock.calls[0][0]);
    expect(summarySql).toContain('GREATEST(l.quantity, 0) AS sold_qty');
    expect(summarySql).toContain('GREATEST(-l.quantity, 0) AS return_qty');
    expect(summarySql).toContain('SUM(LEAST(jacket_qty, pant_qty)) AS core_2_piece_sets');
    expect(summarySql).toContain('SUM(LEAST(jacket_qty, pant_qty, vest_qty)) AS three_piece_sets');
    expect(mockQuery.mock.calls[0].slice(1)).toEqual([
      '2026-01-01',
      '2026-01-31',
      '00000000-0000-4000-8000-000000000001',
      'main',
      [1, 2],
    ]);
  });

  it('rejects inverted date ranges before querying', async () => {
    const result = await queryMatchingSetSalesHistory({
      startDate: '2026-02-01',
      endDate: '2026-01-31',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ConstraintViolation');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
