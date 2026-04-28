/**
 * Route-level tests for GET /api/v1/skus/search
 *
 * The `searchSkusForLookup` adapter function is mocked so these tests run
 * without a live RICS MDB connection.
 */

import type { SkuLookupRow } from '../../src/services/ricsProductAdapter';

// ── mock the adapter before app import ──────────────────────────────────────
jest.mock('../../src/services/ricsProductAdapter', () => {
  const actual = jest.requireActual('../../src/services/ricsProductAdapter');
  return {
    ...actual,
    searchSkusForLookup: jest.fn(),
    getSkuLookupFacets: jest.fn(),
  };
});

import request from 'supertest';
import { getSkuLookupFacets, searchSkusForLookup } from '../../src/services/ricsProductAdapter';

const mockSearch = searchSkusForLookup as jest.MockedFunction<typeof searchSkusForLookup>;
const mockFacets = getSkuLookupFacets as jest.MockedFunction<typeof getSkuLookupFacets>;

const FIXTURE_ROWS: SkuLookupRow[] = [
  {
    skuId: 'ZN02-NDPT',
    skuCode: 'ZN02-NDPT',
    description: 'SandPt Shoe Blue',
    vendor: 'VEND01',
    category: '10',
    styleColor: null,
    currentPrice: 1200,
  },
  {
    skuId: 'ZN02-ABCD',
    skuCode: 'ZN02-ABCD',
    description: 'Another ZN02 Item',
    vendor: 'VEND02',
    category: '10',
    styleColor: 'BLK',
    currentPrice: 800,
  },
];

describe('GET /api/v1/skus/search', () => {
  let app: any;

  beforeAll(async () => {
    app = (await import('../../src/app')).default;
  });

  beforeEach(() => {
    mockSearch.mockReset();
    mockFacets.mockReset();
  });

  it('returns 400 when q is missing and no descContains', async () => {
    const res = await request(app).get('/api/v1/skus/search');
    expect(res.status).toBe(400);
  });

  it('returns rows matching the SKU prefix', async () => {
    mockSearch.mockResolvedValue({ rows: FIXTURE_ROWS, total: 2 });

    const res = await request(app).get('/api/v1/skus/search?q=ZN02');
    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skuCode: expect.stringMatching(/^ZN02/) }),
      ])
    );
    expect(typeof res.body.total).toBe('number');
  });

  it('applies descContains filter', async () => {
    const sandptRows: SkuLookupRow[] = [FIXTURE_ROWS[0]];
    mockSearch.mockResolvedValue({ rows: sandptRows, total: 1 });

    const res = await request(app).get(
      '/api/v1/skus/search?q=&descContains=SandPt'
    );
    expect(res.status).toBe(200);
    res.body.rows.forEach((r: { description: string }) => {
      expect(r.description.toLowerCase()).toContain('sandpt');
    });
  });

  it('supports sort=DESCRIPTION', async () => {
    const sortedRows: SkuLookupRow[] = [
      { ...FIXTURE_ROWS[1], description: 'Another ZN02 Item' },
      { ...FIXTURE_ROWS[0], description: 'SandPt Shoe Blue' },
    ];
    mockSearch.mockResolvedValue({ rows: sortedRows, total: 2 });

    const res = await request(app).get(
      '/api/v1/skus/search?q=&sort=DESCRIPTION&limit=5'
    );
    expect(res.status).toBe(200);
    const descriptions = res.body.rows.map((r: { description: string }) => r.description);
    const sorted = [...descriptions].sort((a: string, b: string) => a.localeCompare(b));
    expect(descriptions).toEqual(sorted);
  });

  it('passes selected Season, Vendor, and Department to lookup facets', async () => {
    mockFacets.mockResolvedValue({
      seasons: [{ code: 'A', name: 'NAV 25', label: 'A - NAV 25' }],
      vendors: [{ code: 'MAXF', label: 'MAXF' }],
      departments: [{ number: 9, name: 'Dept 9' }],
    });

    const res = await request(app).get('/api/v1/skus/lookup-facets?season=A&vendor=MAXF&department=9');

    expect(res.status).toBe(200);
    expect(mockFacets).toHaveBeenCalledWith({
      season: 'A',
      vendor: 'MAXF',
      department: 9,
    });
  });
});
