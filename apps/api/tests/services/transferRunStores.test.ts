jest.mock('../../src/db/prisma', () => ({
  prisma: {
    storeMaster: {
      findMany: jest.fn(),
    },
    stockLevel: {
      findMany: jest.fn(),
    },
    replenishmentTarget: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../src/db/prisma';
import { listTransferStores } from '../../src/services/transferRunService';

const mockStoreMasterFindMany = prisma.storeMaster.findMany as jest.MockedFunction<typeof prisma.storeMaster.findMany>;
const mockStockLevelFindMany = prisma.stockLevel.findMany as jest.MockedFunction<typeof prisma.stockLevel.findMany>;
const mockReplenishmentTargetFindMany = prisma.replenishmentTarget.findMany as jest.MockedFunction<typeof prisma.replenishmentTarget.findMany>;

describe('listTransferStores', () => {
  beforeEach(() => {
    mockStoreMasterFindMany.mockReset();
    mockStockLevelFindMany.mockReset();
    mockReplenishmentTargetFindMany.mockReset();
  });

  it('uses store master rows and real descriptions for transfer setup options', async () => {
    mockStoreMasterFindMany.mockResolvedValueOnce([
      { number: 2, description: 'UNLIMITED C. 2000' },
      { number: 7, description: 'UNLIMITED D. 2000' },
    ] as never);

    const stores = await listTransferStores();

    expect(stores).toEqual([
      { storeId: 2, storeLabel: '2 - UNLIMITED C. 2000' },
      { storeId: 7, storeLabel: '7 - UNLIMITED D. 2000' },
    ]);
    expect(mockStockLevelFindMany).not.toHaveBeenCalled();
    expect(mockReplenishmentTargetFindMany).not.toHaveBeenCalled();
  });

  it('falls back to stock and target store ids when store master is empty', async () => {
    mockStoreMasterFindMany.mockResolvedValue([] as never);
    mockStockLevelFindMany.mockResolvedValueOnce([{ storeId: 7 }, { storeId: 2 }] as never);
    mockReplenishmentTargetFindMany.mockResolvedValueOnce([{ storeId: 2 }, { storeId: 9 }] as never);

    const stores = await listTransferStores();

    expect(stores).toEqual([
      { storeId: 2, storeLabel: 'Store 2' },
      { storeId: 7, storeLabel: 'Store 7' },
      { storeId: 9, storeLabel: 'Store 9' },
    ]);
  });
});
