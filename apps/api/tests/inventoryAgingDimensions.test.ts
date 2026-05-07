import { prisma } from '../src/db/prisma';
import { getAgingDimensions } from '../src/services/reports/inventoryAgingPg';

jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

const mockQueryRawUnsafe = prisma.$queryRawUnsafe as jest.Mock;

describe('getAgingDimensions', () => {
  beforeEach(() => {
    mockQueryRawUnsafe.mockReset();
    mockQueryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes('FROM app.store_master sm')) {
        return Promise.resolve([
          { number: 1, name: 'STORE 1' },
          { number: 99, name: 'WAREHOUSE' },
        ]);
      }
      if (sql.includes('FROM app.store_group sg')) {
        return Promise.resolve([]);
      }
      if (sql.includes('FROM app.purchase_order_legacy po')) {
        return Promise.resolve([]);
      }
      if (sql.includes('FROM app.taxonomy_sector')) {
        return Promise.resolve([]);
      }
      if (sql.includes('FROM app.taxonomy_department')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
  });

  it('loads stores from store_master so zero-stock stores and warehouses stay selectable', async () => {
    const dims = await getAgingDimensions();

    expect(dims.stores).toEqual([
      { number: 1, name: 'STORE 1' },
      { number: 99, name: 'WAREHOUSE' },
    ]);
    const storeQuery = mockQueryRawUnsafe.mock.calls.find(([sql]) =>
      String(sql).includes('FROM app.store_master sm'),
    )?.[0] as string;
    expect(storeQuery).not.toContain('app.stock_level');
  });
});
