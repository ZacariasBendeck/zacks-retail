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
    inventorySalesCell: {
      findMany: jest.fn(),
    },
    balancingTransferRun: {
      create: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
  },
}));

import { prisma } from '../../src/db/prisma';
import {
  createBalancingTransferRun,
  parseRicsKeywordExclusions,
  parseRicsNumberSelection,
  parseRicsSeasonSelection,
} from '../../src/services/transferRunService';
import type { CreateBalancingTransferRunInput } from '../../src/models/transferRuns';

const mockStoreMasterFindMany = prisma.storeMaster.findMany as jest.MockedFunction<typeof prisma.storeMaster.findMany>;
const mockSkuFindMany = prisma.sku.findMany as jest.MockedFunction<typeof prisma.sku.findMany>;
const mockStockLevelFindMany = prisma.stockLevel.findMany as jest.MockedFunction<typeof prisma.stockLevel.findMany>;
const mockReplenishmentTargetFindMany = prisma.replenishmentTarget.findMany as jest.MockedFunction<typeof prisma.replenishmentTarget.findMany>;
const mockInventorySalesCellFindMany = prisma.inventorySalesCell.findMany as jest.MockedFunction<typeof prisma.inventorySalesCell.findMany>;
const mockBalancingTransferRunCreate = prisma.balancingTransferRun.create as jest.MockedFunction<typeof prisma.balancingTransferRun.create>;
const mockQueryRawUnsafe = prisma.$queryRawUnsafe as jest.MockedFunction<typeof prisma.$queryRawUnsafe>;

const SKU = {
  id: '00000000-0000-0000-0000-000000000001',
  code: 'SKU-1',
  provisionalCode: 'SKU-1',
  descriptionRics: 'Test shoe',
  vendorId: 'V1',
  categoryNumber: 500,
  season: 'A',
  styleColor: 'BLACK',
  groupCode: 'G1',
  keywords: '',
  currentCost: 50,
  retailPrice: 90,
  listPrice: 90,
  currentPriceSlot: 'RETAIL',
  perks: null,
};

function ricsInput(overrides: Partial<CreateBalancingTransferRunInput> = {}): CreateBalancingTransferRunInput {
  return {
    algorithmMode: 'RICS_MIMIC',
    balancingMethod: 'OVER_UNDER_MODELS',
    performanceMetric: 'TURNS',
    salesPeriod: 'MONTH',
    sortOrder: 'SKU',
    tieBreakKind: 'ABSOLUTE',
    tieBreakValue: 0,
    transferDoublesToLowerPriority: false,
    stripStoresBelowSizeCount: null,
    criteria: {
      ricsStoreSelection: '1,2',
      ricsCategorySelection: '500',
      ricsSeasonSelection: 'A',
      ricsKeywordExclusions: '<>DST',
    },
    ...overrides,
  };
}

function mockStoreMaster(storeIds: number[]): void {
  const rows = storeIds.map((number) => ({
    number,
    description: number === 99 ? 'Warehouse' : `Store ${number}`,
    city: 'TEGUCIGALPA',
    region: 1,
  }));
  mockStoreMasterFindMany.mockResolvedValueOnce(rows as never);
  mockStoreMasterFindMany.mockResolvedValueOnce(rows as never);
}

function mockStoredRun(): void {
  mockBalancingTransferRunCreate.mockImplementation(async (args) => {
    const data = args.data;
    return {
      id: 'run-1',
      status: data.status,
      balancingMethod: data.balancingMethod,
      performanceMetric: data.performanceMetric,
      salesPeriod: data.salesPeriod,
      tieBreakKind: data.tieBreakKind,
      tieBreakValue: data.tieBreakValue,
      transferDoublesToLowerPriority: data.transferDoublesToLowerPriority,
      stripStoresBelowSizeCount: data.stripStoresBelowSizeCount,
      inTransitPos: data.inTransitPos,
      requestedBy: data.requestedBy,
      createdAt: new Date('2026-04-29T00:00:00.000Z'),
      previewedAt: data.previewedAt,
      committedAt: null,
      generatedTransferIds: [],
      criteriaJson: data.criteriaJson,
      exceptionsJson: data.exceptionsJson,
    } as never;
  });
}

describe('RICS mimic balancing transfer logic', () => {
  beforeEach(() => {
    mockStoreMasterFindMany.mockReset();
    mockSkuFindMany.mockReset();
    mockStockLevelFindMany.mockReset();
    mockReplenishmentTargetFindMany.mockReset();
    mockInventorySalesCellFindMany.mockReset();
    mockBalancingTransferRunCreate.mockReset();
    mockQueryRawUnsafe.mockReset();
    mockStoredRun();
  });

  it('parses RICS store, category, season, and keyword expressions', () => {
    expect(parseRicsNumberSelection('2,5-7,99')).toEqual([2, 5, 6, 7, 99]);
    expect(parseRicsNumberSelection('7-5,2,2')).toEqual([2, 5, 6, 7]);
    expect(parseRicsSeasonSelection('Q-Z,1-3,A')).toEqual([
      '1',
      '2',
      '3',
      'A',
      'Q',
      'R',
      'S',
      'T',
      'U',
      'V',
      'W',
      'X',
      'Y',
      'Z',
    ]);
    expect(parseRicsKeywordExclusions('<>DST,<>VER26*')).toEqual(['DST', 'VER26*']);
  });

  it('emits negative M-T-D sales skips and no transfer lines for that SKU', async () => {
    mockStoreMaster([1, 2]);
    mockSkuFindMany.mockResolvedValueOnce([SKU] as never);
    mockStockLevelFindMany.mockResolvedValueOnce([
      { skuId: SKU.id, storeId: 1, rowLabel: '', columnLabel: '8', onHand: 3 },
      { skuId: SKU.id, storeId: 2, rowLabel: '', columnLabel: '8', onHand: 0 },
    ] as never);
    mockReplenishmentTargetFindMany.mockResolvedValueOnce([
      { skuId: SKU.id, storeId: 1, rowLabel: '', columnLabel: '8', modelQty: 1, maxQty: 2, reorderQty: 1 },
      { skuId: SKU.id, storeId: 2, rowLabel: '', columnLabel: '8', modelQty: 1, maxQty: 2, reorderQty: 1 },
    ] as never);
    mockInventorySalesCellFindMany.mockResolvedValueOnce([
      { skuId: SKU.id, storeId: 1, rowLabel: '', columnLabel: '8', mtdSales: -1 },
      { skuId: SKU.id, storeId: 2, rowLabel: '', columnLabel: '8', mtdSales: 0 },
    ] as never);

    const preview = await createBalancingTransferRun(ricsInput(), 'tester');

    expect(preview.algorithmMode).toBe('RICS_MIMIC');
    expect(preview.lines).toHaveLength(0);
    expect(preview.summary.negativeMtdSalesSkipCount).toBe(1);
    expect(preview.negativeMtdSalesSkips).toEqual([
      expect.objectContaining({
        skuCode: SKU.code,
        negativeStores: [
          expect.objectContaining({
            storeId: 1,
            totalMtdSales: -1,
            negativeCells: [{ rowLabel: '', columnLabel: '8', mtdSales: -1 }],
          }),
        ],
      }),
    ]);
  });

  it('uses the current RICS donor order, including warehouse 99 before other no-model donors', async () => {
    mockStoreMaster([1, 2, 99]);
    mockSkuFindMany.mockResolvedValueOnce([SKU] as never);
    mockStockLevelFindMany.mockResolvedValueOnce([
      { skuId: SKU.id, storeId: 1, rowLabel: '', columnLabel: '8', onHand: 0 },
      { skuId: SKU.id, storeId: 2, rowLabel: '', columnLabel: '8', onHand: 1 },
      { skuId: SKU.id, storeId: 99, rowLabel: '', columnLabel: '8', onHand: 1 },
    ] as never);
    mockReplenishmentTargetFindMany.mockResolvedValueOnce([
      { skuId: SKU.id, storeId: 1, rowLabel: '', columnLabel: '8', modelQty: 1, maxQty: 2, reorderQty: 1 },
      { skuId: SKU.id, storeId: 2, rowLabel: '', columnLabel: '8', modelQty: 0, maxQty: 0, reorderQty: 1 },
      { skuId: SKU.id, storeId: 99, rowLabel: '', columnLabel: '8', modelQty: 0, maxQty: 0, reorderQty: 1 },
    ] as never);
    mockInventorySalesCellFindMany.mockResolvedValueOnce([
      { skuId: SKU.id, storeId: 1, rowLabel: '', columnLabel: '8', mtdSales: 0 },
      { skuId: SKU.id, storeId: 2, rowLabel: '', columnLabel: '8', mtdSales: 0 },
      { skuId: SKU.id, storeId: 99, rowLabel: '', columnLabel: '8', mtdSales: 0 },
    ] as never);

    const preview = await createBalancingTransferRun(
      ricsInput({ criteria: { ricsStoreSelection: '1,2,99', ricsCategorySelection: '500', ricsSeasonSelection: 'A' } }),
      'tester',
    );

    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0]).toEqual(expect.objectContaining({
      fromStoreId: 99,
      toStoreId: 1,
      suggestedQuantity: 1,
    }));
  });

  it('uses the current RICS receiver order by higher month-to-date turns', async () => {
    mockStoreMaster([1, 2, 3]);
    mockSkuFindMany.mockResolvedValueOnce([SKU] as never);
    mockStockLevelFindMany.mockResolvedValueOnce([
      { skuId: SKU.id, storeId: 1, rowLabel: '', columnLabel: '8', onHand: 1 },
      { skuId: SKU.id, storeId: 2, rowLabel: '', columnLabel: '8', onHand: 1 },
      { skuId: SKU.id, storeId: 3, rowLabel: '', columnLabel: '8', onHand: 1 },
    ] as never);
    mockReplenishmentTargetFindMany.mockResolvedValueOnce([
      { skuId: SKU.id, storeId: 1, rowLabel: '', columnLabel: '8', modelQty: 2, maxQty: 3, reorderQty: 1 },
      { skuId: SKU.id, storeId: 2, rowLabel: '', columnLabel: '8', modelQty: 0, maxQty: 0, reorderQty: 1 },
      { skuId: SKU.id, storeId: 3, rowLabel: '', columnLabel: '8', modelQty: 2, maxQty: 3, reorderQty: 1 },
    ] as never);
    mockInventorySalesCellFindMany.mockResolvedValueOnce([
      { skuId: SKU.id, storeId: 1, rowLabel: '', columnLabel: '8', mtdSales: 1 },
      { skuId: SKU.id, storeId: 2, rowLabel: '', columnLabel: '8', mtdSales: 0 },
      { skuId: SKU.id, storeId: 3, rowLabel: '', columnLabel: '8', mtdSales: 5 },
    ] as never);

    const preview = await createBalancingTransferRun(
      ricsInput({ criteria: { ricsStoreSelection: '1,2,3', ricsCategorySelection: '500', ricsSeasonSelection: 'A' } }),
      'tester',
    );

    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0]).toEqual(expect.objectContaining({
      fromStoreId: 2,
      toStoreId: 3,
      suggestedQuantity: 1,
    }));
  });

  it('keeps default APP_LEGACY runs on the existing sales-history metric path', async () => {
    mockStoreMaster([1, 2]);
    mockSkuFindMany.mockResolvedValueOnce([SKU] as never);
    mockStockLevelFindMany.mockResolvedValueOnce([
      { skuId: SKU.id, storeId: 1, rowLabel: '', columnLabel: '8', onHand: 2 },
      { skuId: SKU.id, storeId: 2, rowLabel: '', columnLabel: '8', onHand: 0 },
    ] as never);
    mockReplenishmentTargetFindMany.mockResolvedValueOnce([] as never);
    mockQueryRawUnsafe.mockResolvedValueOnce([] as never);

    const preview = await createBalancingTransferRun({
      balancingMethod: 'WITHOUT_CONSIDERING_MODELS',
      performanceMetric: 'ROI',
      salesPeriod: 'YEAR',
      sortOrder: 'SKU',
      tieBreakKind: 'ABSOLUTE',
      tieBreakValue: 0,
      transferDoublesToLowerPriority: false,
      stripStoresBelowSizeCount: null,
      criteria: {
        storeIds: [1, 2],
        skuCodes: [SKU.code],
      },
    }, 'tester');

    expect(preview.algorithmMode).toBe('APP_LEGACY');
    expect(mockInventorySalesCellFindMany).not.toHaveBeenCalled();
    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0]).toEqual(expect.objectContaining({ fromStoreId: 1, toStoreId: 2 }));
  });
});
