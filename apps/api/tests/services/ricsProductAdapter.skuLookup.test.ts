jest.mock('../../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
    seasonOverlay: {
      findMany: jest.fn(),
    },
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
const mockSeasonFindMany = prisma.seasonOverlay.findMany as jest.MockedFunction<
  typeof prisma.seasonOverlay.findMany
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
  mockSeasonFindMany.mockReset();
  mockSeasonFindMany.mockResolvedValue([] as never);
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

  it('supports SKU contains and prefix lookup modes', async () => {
    mockQuery.mockImplementation(async (sql: any) => {
      const text = String(sql);
      if (text.includes('FROM app.sku s') && text.includes('ORDER BY s.code')) {
        return [
          { ...INDEX_ROW, SKU: '6017-130-BKPU' },
          { ...INDEX_ROW, SKU: 'ABC-6017-130-BKPU' },
        ] as never;
      }
      throw new Error(`Unexpected SQL in test: ${text}`);
    });

    const contains = await searchSkusForLookup({ q: '6017', skuMatchMode: 'contains' });
    expect(contains.rows.map((row) => row.skuCode)).toEqual([
      '6017-130-BKPU',
      'ABC-6017-130-BKPU',
    ]);

    const prefix = await searchSkusForLookup({ q: '6017', skuMatchMode: 'prefix' });
    expect(prefix.rows.map((row) => row.skuCode)).toEqual(['6017-130-BKPU']);
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
    mockSeasonFindMany.mockResolvedValue([{ code: 'A', description: 'NAV 25' }] as never);

    const facets = await getSkuLookupFacets();

    expect(facets.seasons).toEqual([{ code: 'A', name: 'NAV 25', label: 'A - NAV 25' }]);
    expect(facets.vendors).toEqual([{ code: 'MAXF', label: 'MAXF — Max Factor' }]);
    expect(facets.departments).toEqual([{ number: 9, name: 'Dept 9' }]);
  });

  it('narrows lookup facets from the other selected filters', async () => {
    const rows = [
      { ...INDEX_ROW, SKU: '00', Vendor: 'MAXF', Category: 929, Season: 'A' },
      { ...INDEX_ROW, SKU: '01', Vendor: 'ACME', Category: 929, Season: 'B' },
      { ...INDEX_ROW, SKU: '02', Vendor: 'ACME', Category: 557, Season: 'A' },
      { ...INDEX_ROW, SKU: '03', Vendor: 'ZETA', Category: 557, Season: 'C' },
    ];
    mockQuery.mockImplementation(async (sql: any) => {
      const text = String(sql);
      if (text.includes('FROM app.sku s') && text.includes('ORDER BY s.code')) {
        return rows as never;
      }
      if (text.includes('FROM app.taxonomy_department')) {
        return [
          { Number: 5, Desc: 'Dept 5', BegCateg: 500, EndCateg: 599 },
          { Number: 9, Desc: 'Dept 9', BegCateg: 900, EndCateg: 999 },
        ] as never;
      }
      if (text.includes('FULL OUTER JOIN app.vendor_overlay')) {
        return [
          { Code: 'MAXF', 'Short Name': 'Max Factor', 'Manu Name': 'Max Factor SA' },
          { Code: 'ACME', 'Short Name': 'Acme', 'Manu Name': 'Acme SA' },
          { Code: 'ZETA', 'Short Name': 'Zeta', 'Manu Name': 'Zeta SA' },
        ] as never;
      }
      throw new Error(`Unexpected SQL in test: ${text}`);
    });

    const seasonA = await getSkuLookupFacets({ season: 'A' });
    expect(seasonA.vendors.map((vendor) => vendor.code)).toEqual(['ACME', 'MAXF']);
    expect(seasonA.departments.map((department) => department.number)).toEqual([5, 9]);

    const vendorAcme = await getSkuLookupFacets({ vendor: 'ACME' });
    expect(vendorAcme.seasons.map((season) => season.code)).toEqual(['A', 'B']);
    expect(vendorAcme.departments.map((department) => department.number)).toEqual([5, 9]);

    const department5 = await getSkuLookupFacets({ department: 5 });
    expect(department5.seasons.map((season) => season.code)).toEqual(['A', 'C']);
    expect(department5.vendors.map((vendor) => vendor.code)).toEqual(['ACME', 'ZETA']);

    const combined = await getSkuLookupFacets({ season: 'A', vendor: 'ACME' });
    expect(combined.departments).toEqual([{ number: 5, name: 'Dept 5' }]);
  });
});
