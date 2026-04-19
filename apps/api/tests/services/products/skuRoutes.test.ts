/**
 * Route tests for /api/v1/products/skus/*.
 */

import request from 'supertest';
import { Err, Ok } from '../../../src/repositories/rics/repoResult';

jest.mock('../../../src/repositories/rics/SkuRepository', () => {
  const base = {
    code: 'ABC001',
    vendorSku: null,
    category: 100,
    vendor: 'ACME',
    sizeType: null,
    description: 'Widget',
    styleColor: null,
    season: null,
    location: null,
    listPrice: null,
    retailPrice: 19.99,
    mdPrice1: null,
    mdPrice2: null,
    currentPriceSlot: 'RETAIL',
    currentCost: null,
    oversizeColumn: null,
    oversizeAmount: null,
    perks: null,
    manufacturer: null,
    labelCode: null,
    colorCode: null,
    comment: null,
    groupCode: null,
    keywords: [],
    pictureFileName: null,
    coupon: false,
    lastPriceChange: null,
    status: null,
    dateLastChanged: null,
    orderMultiple: null,
    orderUom: null,
    longColor: null,
    boldDesc: null,
    paraDesc: null,
    catalogSku: null,
    bulletText: [],
    pictureName01: null,
    pictureName02: null,
    sizeText: null,
    webFileName: null,
  };
  return {
    SkuRepository: {
      findAll: jest.fn(async () => Ok([base])),
      findByCode: jest.fn(async (code: string) =>
        code === 'ABC001' ? Ok(base) : Err({ kind: 'NotFound', message: 'missing' }),
      ),
      create: jest.fn(async (input: any) =>
        input.code === 'DUPE'
          ? Err({ kind: 'DuplicatePrimaryKey', message: 'already exists' })
          : Ok({ ...base, code: input.code, description: input.description }),
      ),
      update: jest.fn(async (code: string) => Ok({ ...base, code })),
      delete: jest.fn(async (code: string) =>
        code === 'MISSING' ? Err({ kind: 'NotFound', message: 'missing' }) : Ok(undefined),
      ),
      countByVendor: jest.fn(async () => Ok(0)),
      countByCategory: jest.fn(async () => Ok(0)),
    },
  };
});

jest.mock('../../../src/services/products/auditLog', () => ({
  auditLog: { record: jest.fn(async () => undefined) },
  createAuditLogger: () => ({ record: jest.fn(async () => undefined) }),
}));

import app from '../../../src/app';

describe('GET /api/v1/products/skus', () => {
  it('returns an array', async () => {
    const res = await request(app).get('/api/v1/products/skus');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].code).toBe('ABC001');
  });

  it('accepts filter query params without error', async () => {
    const res = await request(app).get('/api/v1/products/skus?vendor=ACME&category=100');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/products/skus/:code', () => {
  it('returns 200 for an existing SKU', async () => {
    const res = await request(app).get('/api/v1/products/skus/ABC001');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ABC001');
  });

  it('returns 404 for a missing SKU', async () => {
    const res = await request(app).get('/api/v1/products/skus/ZZZ');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/v1/products/skus', () => {
  it('returns 201 on create', async () => {
    const res = await request(app)
      .post('/api/v1/products/skus')
      .send({ code: 'NEW1', category: 100, vendor: 'ACME', description: 'X', retailPrice: 5 });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('NEW1');
  });

  it('maps DuplicatePrimaryKey to 409', async () => {
    const res = await request(app)
      .post('/api/v1/products/skus')
      .send({ code: 'DUPE', category: 100, vendor: 'ACME', description: 'X', retailPrice: 5 });
    expect(res.status).toBe(409);
  });

  it('maps validation error (empty code) to 422', async () => {
    const res = await request(app)
      .post('/api/v1/products/skus')
      .send({ code: '', category: 100, vendor: 'ACME', description: 'X', retailPrice: 5 });
    expect(res.status).toBe(422);
  });

  it('maps validation error (missing vendor) to 422', async () => {
    const res = await request(app)
      .post('/api/v1/products/skus')
      .send({ code: 'OK1', category: 100, description: 'X', retailPrice: 5 });
    expect(res.status).toBe(422);
  });
});

describe('PATCH /api/v1/products/skus/:code', () => {
  it('returns 200 on update', async () => {
    const res = await request(app)
      .patch('/api/v1/products/skus/ABC001')
      .send({ description: 'Updated' });
    expect(res.status).toBe(200);
  });

  it('rejects rename (code in body) with 422', async () => {
    const res = await request(app)
      .patch('/api/v1/products/skus/ABC001')
      .send({ code: 'RENAMED', description: 'X' });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/v1/products/skus/:code', () => {
  it('returns 204 on successful delete', async () => {
    const res = await request(app).delete('/api/v1/products/skus/ABC001');
    expect(res.status).toBe(204);
  });

  it('returns 404 when SKU does not exist', async () => {
    const res = await request(app).delete('/api/v1/products/skus/MISSING');
    expect(res.status).toBe(404);
  });
});
