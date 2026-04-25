jest.mock('../../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

jest.mock('../../src/services/accessOleDb', () => ({
  ricsDbPath: jest.fn((fileName: string) => fileName),
  getOrRecoverPassword: jest.fn(() => 'secret'),
  runPowerShellJson: jest.fn(),
  buildSelectScript: jest.fn(() => 'SELECT 1'),
}));

import {
  clearCache,
  getSkuLookupFacets,
  searchSkusForLookup,
} from '../../src/services/ricsProductAdapter';
import { prisma } from '../../src/db/prisma';
import { runPowerShellJson } from '../../src/services/accessOleDb';

const mockQuery = prisma.$queryRawUnsafe as jest.MockedFunction<
  typeof prisma.$queryRawUnsafe
>;
const mockRunPowerShell = runPowerShellJson as jest.MockedFunction<
  typeof runPowerShellJson
>;

const INDEX_ROW = {
  SKU: '00',
  Desc: 'BolsaRegalo LA FEMME',
  Vendor: 'MAXF',
  Manufacturer: null,
  Category: 929,
  StyleColor: 'GRAN/BLAN',
  VendorSKU: null,
  SizeType: null,
  Season: 'A',
  LabelCode: null,
  GroupCode: null,
  PictureFileName: null,
  ListPrice: 20,
  RetailPrice: 17.86,
  MarkDownPrice1: null,
  MarkDownPrice2: null,
  CurrentPrice: 2,
  CurrentCost: 10,
  LastPriceChange: '2026-04-25T00:00:00',
  Perks: null,
  Comment: null,
  Status: null,
};

beforeEach(() => {
  clearCache();
  mockQuery.mockReset();
  mockRunPowerShell.mockReset();
  delete process.env.SKU_LOOKUP_SOURCE;
});

describe('ricsProductAdapter SKU lookup', () => {
  it('uses app.sku for lookup warmup even if SKU_LOOKUP_SOURCE=mdb is set', async () => {
    process.env.SKU_LOOKUP_SOURCE = 'mdb';

    mockQuery.mockImplementation(async (sql: any) => {
      const text = String(sql);
      if (text.includes('FROM app.sku s') && text.includes('ORDER BY s.code')) {
        return [INDEX_ROW] as never;
      }
      throw new Error(`Unexpected SQL in test: ${text}`);
    });

    const result = await searchSkusForLookup({ q: '00', limit: 5 });

    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      skuCode: '00',
      description: 'BolsaRegalo LA FEMME',
      vendor: 'MAXF',
      category: '929',
      currentPrice: 17.86,
    });
    expect(mockRunPowerShell).not.toHaveBeenCalled();
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes('FROM app.sku s')),
    ).toBe(true);
  });

  it('falls back to app.vendor when vendor overlay metadata is unavailable', async () => {
    mockQuery.mockImplementation(async (sql: any) => {
      const text = String(sql);
      if (text.includes('FROM app.sku s') && text.includes('ORDER BY s.code')) {
        return [INDEX_ROW] as never;
      }
      if (text.includes('FROM app.taxonomy_department')) {
        return [
          { Number: 9, Desc: 'Dept 9', BegCateg: 900, EndCateg: 999 },
        ] as never;
      }
      if (text.includes('FULL OUTER JOIN app.vendor_overlay')) {
        throw new Error('relation "app.vendor_overlay" does not exist');
      }
      if (text.includes('FROM app.vendor') && !text.includes('FULL OUTER JOIN')) {
        return [
          { Code: 'MAXF', 'Short Name': 'Max Factor', 'Manu Name': 'Max Factor SA' },
        ] as never;
      }
      throw new Error(`Unexpected SQL in test: ${text}`);
    });

    const facets = await getSkuLookupFacets();

    expect(facets.seasons).toEqual(['A']);
    expect(facets.vendors).toEqual([{ code: 'MAXF', label: 'MAXF — Max Factor' }]);
    expect(facets.departments).toEqual([{ number: 9, name: 'Dept 9' }]);
  });
});
