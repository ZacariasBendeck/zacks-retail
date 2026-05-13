jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

import { __test } from '../src/services/reorderPlannerService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../src/db/prisma');

const sku = {
  id: '11111111-1111-1111-1111-111111111111',
  sku_code: '25605-BEPT',
  vendor_id: 'VENDOR1',
  category_number: 566,
  size_type: 1,
  order_multiple: null,
  current_cost: 12,
  retail_price: 24,
  description: 'Sample SKU',
  sku_state: 'ACTIVE',
};

describe('reorder planner sales query construction', () => {
  beforeEach(() => {
    (prisma.$queryRawUnsafe as jest.Mock).mockReset();
  });

  it('loads monthly SKU sales through sku_id without normalized sku_code filters', async () => {
    (prisma.$queryRawUnsafe as jest.Mock)
      .mockResolvedValueOnce([
        { store_id: 16, year_month: '2026-04', column_label: '7', row_label: '', qty: 2 },
      ])
      .mockResolvedValueOnce([]);

    await __test.loadSkuMonthlySalesByStoreAndSize(sku, [16]);

    const [sql, ...params] = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0];
    expect(sql).toContain('WHERE l.sku_id = ANY($1::uuid[])');
    expect(sql).toContain('AND t.store_id = ANY($2::int[])');
    expect(sql).not.toContain('UPPER(');
    expect(sql).not.toContain(' OR ');
    expect(params).toEqual([[sku.id], [16]]);
  });

  it('uses an exact sku_code fallback for legacy rows without sku_id', async () => {
    (prisma.$queryRawUnsafe as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { store_id: 16, year_month: '2026-04', column_label: '7', row_label: '', qty: 2 },
      ]);

    await __test.loadSkuMonthlySalesByStoreAndSize(sku, [16]);

    const [idSql] = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0];
    const [fallbackSql, ...fallbackParams] = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[1];
    expect(idSql).toContain('WHERE l.sku_id = ANY($1::uuid[])');
    expect(fallbackSql).toContain('WHERE l.sku_id IS NULL');
    expect(fallbackSql).toContain('AND l.sku_code = ANY($1::text[])');
    expect(fallbackSql).not.toContain('UPPER(');
    expect(fallbackSql).not.toContain(' OR ');
    expect(fallbackParams).toEqual([[sku.sku_code], [16]]);
  });

  it('loads replacement demand source sales with the primary SKU ids and codes', async () => {
    (prisma.$queryRawUnsafe as jest.Mock)
      .mockResolvedValueOnce([
        { store_id: 16, year_month: '2026-04', column_label: '7', row_label: '', qty: 2 },
      ])
      .mockResolvedValueOnce([
        { store_id: 16, year_month: '2026-04', column_label: '8', row_label: '', qty: 3 },
      ]);

    await __test.loadSkuMonthlySalesByStoreAndSize(sku, [16], [
      { skuId: '22222222-2222-2222-2222-222222222222', skuCode: 'OLD-BEPT', description: null },
    ]);

    const [, ...idParams] = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0];
    const [, ...fallbackParams] = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[1];
    expect(idParams).toEqual([
      [sku.id, '22222222-2222-2222-2222-222222222222'],
      [16],
    ]);
    expect(fallbackParams).toEqual([[sku.sku_code, 'OLD-BEPT'], [16]]);
  });

  it('aggregates one preloaded sales set into chain-scoped totals', () => {
    const rows = [
      { store_id: 16, year_month: '2026-04', column_label: '7', row_label: '', qty: 2 },
      { store_id: 17, year_month: '2026-04', column_label: '7', row_label: '', qty: 3 },
      { store_id: 16, year_month: '2026-04', column_label: '8', row_label: '', qty: 4 },
    ];

    expect(__test.aggregateSkuMonthlySalesBySize(rows, [16])).toEqual([
      { year_month: '2026-04', column_label: '7', row_label: '', qty: 2 },
      { year_month: '2026-04', column_label: '8', row_label: '', qty: 4 },
    ]);
  });
});
