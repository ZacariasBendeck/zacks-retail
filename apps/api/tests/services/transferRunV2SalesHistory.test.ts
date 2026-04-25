jest.mock('../../src/db/prisma', () => ({
  prisma: {
    storeMaster: {
      findMany: jest.fn(),
    },
    sku: {
      findMany: jest.fn(),
    },
    stockLevel: {
      findMany: jest.fn(),
    },
    replenishmentTarget: {
      findMany: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
  },
}));

import { prisma } from '../../src/db/prisma';
import { buildBalancingPreviewV2 } from '../../src/services/transferRunV2/buildPreview';
import { loadBalancingFactsV2 } from '../../src/services/transferRunV2/loadFacts';

const mockStoreMasterFindMany = prisma.storeMaster.findMany as jest.MockedFunction<typeof prisma.storeMaster.findMany>;
const mockSkuFindMany = prisma.sku.findMany as jest.MockedFunction<typeof prisma.sku.findMany>;
const mockStockLevelFindMany = prisma.stockLevel.findMany as jest.MockedFunction<typeof prisma.stockLevel.findMany>;
const mockReplenishmentTargetFindMany = prisma.replenishmentTarget.findMany as jest.MockedFunction<typeof prisma.replenishmentTarget.findMany>;
const mockQueryRawUnsafe = prisma.$queryRawUnsafe as jest.MockedFunction<typeof prisma.$queryRawUnsafe>;

describe('transferRunV2 sales history sourcing', () => {
  beforeEach(() => {
    mockStoreMasterFindMany.mockReset();
    mockSkuFindMany.mockReset();
    mockStockLevelFindMany.mockReset();
    mockReplenishmentTargetFindMany.mockReset();
    mockQueryRawUnsafe.mockReset();
  });

  it('uses imported sales-history tickets for balancing demand and suppresses the missing-sales warning', async () => {
    mockStoreMasterFindMany.mockResolvedValueOnce([
      { number: 1, description: 'One', region: 1 },
      { number: 2, description: 'Two', region: 1 },
    ] as never);
    mockSkuFindMany.mockResolvedValueOnce([
      {
        id: 'sku-1',
        code: 'SKU-1',
        provisionalCode: 'SKU-1',
        descriptionRics: 'Test shoe',
        vendorId: 'V1',
        categoryNumber: 100,
        season: 'FA',
        styleColor: 'BLACK',
        groupCode: 'G1',
        keywords: null,
        currentCost: 50,
        retailPrice: 90,
        listPrice: 90,
        currentPriceSlot: 'RETAIL',
        perks: null,
        sizeType: 1,
      },
    ] as never);
    mockStockLevelFindMany.mockResolvedValueOnce([
      {
        skuId: 'sku-1',
        storeId: 1,
        rowLabel: 'A',
        columnLabel: '7',
        onHand: 0,
        lastMovementAt: null,
        lastReceivedAt: null,
      },
      {
        skuId: 'sku-1',
        storeId: 2,
        rowLabel: 'A',
        columnLabel: '7',
        onHand: 4,
        lastMovementAt: null,
        lastReceivedAt: null,
      },
    ] as never);
    mockReplenishmentTargetFindMany.mockResolvedValueOnce([
      {
        skuId: 'sku-1',
        storeId: 1,
        rowLabel: 'A',
        columnLabel: '7',
        modelQty: 1,
        maxQty: 3,
        reorderQty: 1,
      },
      {
        skuId: 'sku-1',
        storeId: 2,
        rowLabel: 'A',
        columnLabel: '7',
        modelQty: 1,
        maxQty: 3,
        reorderQty: 1,
      },
    ] as never);
    mockQueryRawUnsafe.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM app.sales_history_ticket_line l') && text.includes('"netMovementQty"')) {
        return [
          {
            skuId: 'sku-1',
            storeId: 1,
            netMovementQty: -4,
            positiveMovementQty: 0,
            netSoldUnits: 4,
            netRevenue: 360,
            netCost: 200,
          },
          {
            skuId: 'sku-1',
            storeId: 2,
            netMovementQty: -1,
            positiveMovementQty: 0,
            netSoldUnits: 1,
            netRevenue: 90,
            netCost: 50,
          },
        ] as never;
      }
      if (text.includes('FROM app.sales_history_ticket_line l') && text.includes('t.store_id AS "storeId"') && text.includes('"soldUnits"')) {
        return [
          { skuId: 'sku-1', storeId: 1, rowLabel: 'A', columnLabel: '7', soldUnits: 4 },
          { skuId: 'sku-1', storeId: 2, rowLabel: 'A', columnLabel: '7', soldUnits: 1 },
        ] as never;
      }
      if (text.includes('FROM app.sales_history_ticket_line l') && text.includes('GROUP BY l.sku_id, COALESCE(l.row_label')) {
        return [
          { skuId: 'sku-1', rowLabel: 'A', columnLabel: '7', soldUnits: 5 },
        ] as never;
      }
      if (text.includes('JOIN app.sku s ON s.id = l.sku_id')) {
        return [
          { categoryNumber: 100, sizeType: 1, rowLabel: 'A', columnLabel: '7', soldUnits: 12 },
        ] as never;
      }
      if (text.includes('FROM app.transfer_line tl')) {
        return [] as never;
      }
      throw new Error(`Unexpected SQL in test: ${text}`);
    });

    const facts = await loadBalancingFactsV2({
      balancingMethod: 'WITHOUT_CONSIDERING_MODELS',
      performanceMetric: 'ROI',
      salesPeriod: 'MONTH',
      tieBreakKind: 'ABSOLUTE',
      tieBreakValue: 0,
      criteria: {
        storeIds: [1, 2],
        skuCodes: ['SKU-1'],
      },
    });
    const preview = buildBalancingPreviewV2(facts);
    const sqlTexts = mockQueryRawUnsafe.mock.calls.map(([sql]) => String(sql));
    const decisionPasses = preview.lines.map((line) => line.decisionContext.decisionPass);

    expect(facts.storeCellSales.get('sku-1:1:A:7')).toBe(4);
    expect(facts.metricAggregates.get('sku-1:1')?.netSoldUnits).toBe(4);
    expect(preview.lines.length).toBeGreaterThan(0);
    expect(decisionPasses).toContain('SERVICE_RESCUE');
    expect(preview.exceptions.some((exception) => exception.code === 'BALANCING_NO_SALES_HISTORY')).toBe(false);
    expect(sqlTexts.some((text) => text.includes('stock_movement'))).toBe(false);
    expect(sqlTexts.filter((text) => text.includes('sales_history_ticket_line')).length).toBeGreaterThanOrEqual(4);
  });
});
