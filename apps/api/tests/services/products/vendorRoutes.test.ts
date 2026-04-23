/**
 * Route tests for /api/v1/products/vendors/*.
 *
 * Covers happy paths, error mapping, and input validation guards. The
 * underlying VendorRepository is mocked — no MDB opened.
 */

import request from 'supertest';
import { Err, Ok } from '../../../src/repositories/rics/repoResult';

jest.mock('../../../src/repositories/rics/VendorRepository', () => {
  const base = {
    code: 'ABCD',
    name: 'ACME',
    mailName: 'ACME Inc.',
    addr1: null,
    addr2: null,
    city: null,
    state: null,
    zip: null,
    phone: null,
    fax: null,
    contact: null,
    terms: null,
    shipInst: null,
    comment: null,
    manuCode: null,
    manuName: null,
    qualifierId: null,
    qualifierCode: null,
    colorCode: false,
    longComment: null,
    email: null,
    dateLastChanged: null,
  };
  return {
    VendorRepository: {
      findAll: jest.fn(async () => Ok([base])),
      findByCode: jest.fn(async (code: string) =>
        code === 'ABCD' ? Ok(base) : Err({ kind: 'NotFound', message: 'missing' }),
      ),
      // Writes return WriteNotSupported — MDB endpoint removed 2026-04-23.
      create: jest.fn(async () => Err({ kind: 'WriteNotSupported', message: 'writes disabled' })),
      update: jest.fn(async () => Err({ kind: 'WriteNotSupported', message: 'writes disabled' })),
      delete: jest.fn(async () => Err({ kind: 'WriteNotSupported', message: 'writes disabled' })),
      findStoreAccounts: jest.fn(async (code: string) =>
        Ok([{ code, storeId: 1, accountNo: 'ACCT', dateLastChanged: null }]),
      ),
      upsertStoreAccount: jest.fn(async () =>
        Err({ kind: 'WriteNotSupported', message: 'writes disabled' }),
      ),
      deleteStoreAccount: jest.fn(async () =>
        Err({ kind: 'WriteNotSupported', message: 'writes disabled' }),
      ),
      countSkusUsingVendor: jest.fn(async (code: string) =>
        code === 'INUSE' ? Ok(5) : code === 'DOWN' ? Err({ kind: 'AccessConnectionError', message: 'down' }) : Ok(0),
      ),
      countSkusPerVendor: jest.fn(async () => Ok({ ABCD: 0 })),
    },
  };
});

// Stub the audit logger so no Postgres is touched.
jest.mock('../../../src/services/products/auditLog', () => ({
  auditLog: { record: jest.fn(async () => undefined) },
  createAuditLogger: () => ({ record: jest.fn(async () => undefined) }),
}));

import app from '../../../src/app';

describe('GET /api/v1/products/vendors', () => {
  it('returns an array on happy path', async () => {
    const res = await request(app).get('/api/v1/products/vendors');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].code).toBe('ABCD');
  });

  it('passes through the q search param', async () => {
    const res = await request(app).get('/api/v1/products/vendors?q=acme');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/products/vendors/sku-counts', () => {
  it('returns aggregated counts', async () => {
    const res = await request(app).get('/api/v1/products/vendors/sku-counts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ABCD: 0 });
  });
});

describe('GET /api/v1/products/vendors/:code', () => {
  it('returns 200 for an existing vendor', async () => {
    const res = await request(app).get('/api/v1/products/vendors/ABCD');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ABCD');
  });

  it('returns 404 for a missing vendor', async () => {
    const res = await request(app).get('/api/v1/products/vendors/MISSING');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/v1/products/vendors (writes disabled 2026-04-23)', () => {
  it('returns 501 WRITE_NOT_SUPPORTED because writes were removed with the MDB endpoint', async () => {
    const res = await request(app)
      .post('/api/v1/products/vendors')
      .send({ code: 'NEW1', name: 'ACME New', mailName: 'ACME' });
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('WRITE_NOT_SUPPORTED');
  });

  it('still rejects EDI half-populated with 422 before reaching the repo', async () => {
    const res = await request(app)
      .post('/api/v1/products/vendors')
      .send({ code: 'NEW2', name: 'n', mailName: 'm', qualifierId: '01' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONSTRAINT_VIOLATION');
  });
});

describe('PATCH /api/v1/products/vendors/:code (writes disabled)', () => {
  it('returns 501 WRITE_NOT_SUPPORTED', async () => {
    const res = await request(app)
      .patch('/api/v1/products/vendors/ABCD')
      .send({ name: 'Renamed' });
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('WRITE_NOT_SUPPORTED');
  });
});

describe('DELETE /api/v1/products/vendors/:code (writes disabled)', () => {
  it('returns 501 when the SKU-reference guard passes (writes disabled downstream)', async () => {
    const res = await request(app).delete('/api/v1/products/vendors/ABCD');
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('WRITE_NOT_SUPPORTED');
  });

  it('still returns 422 when SKUs reference the vendor (guard runs before the write)', async () => {
    const res = await request(app).delete('/api/v1/products/vendors/INUSE');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONSTRAINT_VIOLATION');
  });

  it('propagates AccessConnectionError from the SKU-count probe as 503', async () => {
    const res = await request(app).delete('/api/v1/products/vendors/DOWN');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ACCESS_CONNECTION_ERROR');
  });
});

describe('store accounts', () => {
  it('GET returns an array', async () => {
    const res = await request(app).get('/api/v1/products/vendors/ABCD/store-accounts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('PUT 400 on non-integer storeId', async () => {
    const res = await request(app)
      .put('/api/v1/products/vendors/ABCD/store-accounts/abc')
      .send({ accountNo: 'X' });
    expect(res.status).toBe(400);
  });

  it('PUT 400 on missing accountNo', async () => {
    const res = await request(app).put('/api/v1/products/vendors/ABCD/store-accounts/1').send({});
    expect(res.status).toBe(400);
  });

  it('PUT returns 501 when payload is valid (writes disabled 2026-04-23)', async () => {
    const res = await request(app)
      .put('/api/v1/products/vendors/ABCD/store-accounts/1')
      .send({ accountNo: 'ACCT-9' });
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('WRITE_NOT_SUPPORTED');
  });

  it('DELETE returns 501 when payload is valid (writes disabled)', async () => {
    const res = await request(app).delete('/api/v1/products/vendors/ABCD/store-accounts/1');
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('WRITE_NOT_SUPPORTED');
  });

  it('DELETE 400 on non-integer storeId', async () => {
    const res = await request(app).delete('/api/v1/products/vendors/ABCD/store-accounts/abc');
    expect(res.status).toBe(400);
  });
});
