/**
 * Route tests for the SKU extended-attributes endpoints.
 *
 *   GET  /api/v1/products/attributes/dimensions
 *   GET  /api/v1/products/attributes/coverage
 *   GET  /api/v1/products/skus/:code/attributes
 *   PUT  /api/v1/products/skus/:code/attributes
 */

import request from 'supertest';
import { Err, Ok } from '../../../src/repositories/rics/repoResult';

const replaceMock = jest.fn();
const bulkAssignMock = jest.fn();
const findCodesMock = jest.fn();

jest.mock('../../../src/repositories/products/AttributesRepository', () => {
  const DIMS_WITH_COUNTS = [
    {
      code: 'buyer',
      labelEs: 'Comprador',
      sortOrder: 10,
      isMultiValue: false,
      values: [
        { code: 'zb', labelEs: 'Zacarias Bendeck', sortOrder: 10, skuCount: 50 },
        { code: 'ab', labelEs: 'AB', sortOrder: 20, skuCount: 75 },
      ],
    },
    {
      code: 'discount_type',
      labelEs: 'Tipo de Descuento',
      sortOrder: 40,
      isMultiValue: true,
      values: [{ code: 'pct_50', labelEs: '50% off', sortOrder: 150, skuCount: 12 }],
    },
  ];
  const DIMS_BARE = DIMS_WITH_COUNTS.map((d) => ({
    ...d,
    values: d.values.map(({ skuCount: _skip, ...rest }) => rest),
  }));
  const SKU_ATTRS = {
    skuCode: 'ZB12345',
    byDimension: {
      buyer: {
        isMultiValue: false,
        values: [
          {
            code: 'zb',
            labelEs: 'Zacarias Bendeck',
            assignedBy: 'seed:keyword:abc',
            assignedAt: '2026-04-22T10:14:33.000Z',
          },
        ],
      },
      discount_type: { isMultiValue: true, values: [] },
    },
  };
  const COVERAGE = [
    {
      dimensionCode: 'buyer',
      labelEs: 'Comprador',
      totalSkus: 200000,
      classifiedSkus: 182916,
      coveragePct: 91.5,
      bySource: { keyword: 182916, excel: 0, operator: 0 },
    },
  ];
  return {
    AttributesRepository: {
      listDimensionsWithValues: jest.fn(async (opts: { withCounts?: boolean }) =>
        Ok(opts?.withCounts ? DIMS_WITH_COUNTS : DIMS_BARE)
      ),
      getSkuAttributes: jest.fn(async (sku: string) =>
        sku === 'MISSING'
          ? Err({ kind: 'NotFound', message: `SKU '${sku}' not found.` })
          : Ok(SKU_ATTRS)
      ),
      replaceSkuAttributes: (...args: unknown[]) => replaceMock(...args),
      findSkuCodesByAttributeFilters: (...args: unknown[]) => findCodesMock(...args),
      getCoverage: jest.fn(async () => Ok(COVERAGE)),
      bulkAssign: (...args: unknown[]) => bulkAssignMock(...args),
    },
  };
});

jest.mock('../../../src/services/products/auditLog', () => ({
  auditLog: { record: jest.fn(async () => undefined) },
  createAuditLogger: () => ({ record: jest.fn(async () => undefined) }),
}));

// SKU list route depends on SkuRepository — stub it so unrelated list-route
// tests in the file don't touch Access.
jest.mock('../../../src/repositories/rics/SkuRepository', () => ({
  SkuRepository: {
    findAll: jest.fn(async () => Ok([])),
    findByCode: jest.fn(async () => Ok(null)),
    create: jest.fn(async () => Ok({})),
    update: jest.fn(async () => Ok({})),
    delete: jest.fn(async () => Ok(undefined)),
    countByVendor: jest.fn(async () => Ok(0)),
    countByCategory: jest.fn(async () => Ok(0)),
  },
}));

import app from '../../../src/app';

beforeEach(() => {
  replaceMock.mockReset();
  bulkAssignMock.mockReset();
  findCodesMock.mockReset();
});

describe('GET /api/v1/products/attributes/dimensions', () => {
  it('returns dims without counts by default', async () => {
    const res = await request(app).get('/api/v1/products/attributes/dimensions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].code).toBe('buyer');
    expect(res.body[0].values[0].skuCount).toBeUndefined();
  });

  it('returns counts when withCounts=true', async () => {
    const res = await request(app).get('/api/v1/products/attributes/dimensions?withCounts=true');
    expect(res.status).toBe(200);
    expect(res.body[0].values[0].skuCount).toBe(50);
  });
});

describe('GET /api/v1/products/attributes/coverage', () => {
  it('returns per-dim coverage rows', async () => {
    const res = await request(app).get('/api/v1/products/attributes/coverage');
    expect(res.status).toBe(200);
    expect(res.body[0].dimensionCode).toBe('buyer');
    expect(res.body[0].coveragePct).toBe(91.5);
  });
});

describe('GET /api/v1/products/skus/:code/attributes', () => {
  it('returns uniform by_dimension even for unclassified dims', async () => {
    const res = await request(app).get('/api/v1/products/skus/ZB12345/attributes');
    expect(res.status).toBe(200);
    expect(res.body.skuCode).toBe('ZB12345');
    expect(res.body.byDimension.buyer.values[0].code).toBe('zb');
    expect(res.body.byDimension.discount_type.values).toEqual([]);
  });

  it('returns 404 for an unknown SKU', async () => {
    const res = await request(app).get('/api/v1/products/skus/MISSING/attributes');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/products/skus/:code/attributes', () => {
  it('atomic-replaces operator + excel rows and returns the fresh set', async () => {
    replaceMock.mockResolvedValue(Ok({ previous: [], next: [{ code: 'zb', labelEs: 'Z', assignedBy: 'u', assignedAt: '2026-04-22T00:00:00.000Z' }] }));
    const res = await request(app)
      .put('/api/v1/products/skus/ZB12345/attributes')
      .send({ assignments: [{ dimension_code: 'buyer', value_code: 'zb' }] });
    expect(res.status).toBe(200);
    expect(replaceMock).toHaveBeenCalledWith(
      'ZB12345',
      [{ dimensionCode: 'buyer', valueCode: 'zb' }],
      expect.any(String)
    );
  });

  it('422 on malformed assignment row', async () => {
    const res = await request(app)
      .put('/api/v1/products/skus/ZB12345/attributes')
      .send({ assignments: [{ dimension_code: 'buyer' /* no value_code */ }] });
    expect(res.status).toBe(422);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('422 when repo reports a value-belongs-to-wrong-dim violation', async () => {
    replaceMock.mockResolvedValue(
      Err({ kind: 'ConstraintViolation', message: "Value 'pct_50' does not belong to dimension 'buyer'." })
    );
    const res = await request(app)
      .put('/api/v1/products/skus/ZB12345/attributes')
      .send({ assignments: [{ dimension_code: 'buyer', value_code: 'pct_50' }] });
    expect(res.status).toBe(422);
  });

  it('404 when repo reports SKU not found', async () => {
    replaceMock.mockResolvedValue(Err({ kind: 'NotFound', message: 'missing' }));
    const res = await request(app)
      .put('/api/v1/products/skus/MISSING/attributes')
      .send({ assignments: [] });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/products/skus (attr.* filter)', () => {
  it('translates attr.<dim>=<value>[,<v>] into an attributesService call', async () => {
    findCodesMock.mockResolvedValue(Ok(new Set(['ZB001'])));
    const res = await request(app).get(
      '/api/v1/products/skus?attr.buyer=zb,ab&attr.discount_type=pct_50'
    );
    expect(res.status).toBe(200);
    expect(findCodesMock).toHaveBeenCalledWith([
      { dimensionCode: 'buyer', valueCodes: ['zb', 'ab'] },
      { dimensionCode: 'discount_type', valueCodes: ['pct_50'] },
    ]);
  });

  it('returns empty list without invoking attributesService when no attr filters present', async () => {
    const res = await request(app).get('/api/v1/products/skus?vendor=ACME');
    expect(res.status).toBe(200);
    expect(findCodesMock).not.toHaveBeenCalled();
  });
});
