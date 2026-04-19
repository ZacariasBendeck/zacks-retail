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
      create: jest.fn(async (input: any) =>
        input.code === 'DUPE'
          ? Err({ kind: 'DuplicatePrimaryKey', message: 'already exists' })
          : Ok({ ...base, code: input.code, name: input.name, mailName: input.mailName }),
      ),
      update: jest.fn(async (code: string) => Ok({ ...base, code })),
      delete: jest.fn(async () => Ok(undefined)),
      findStoreAccounts: jest.fn(async (code: string) =>
        Ok([{ code, storeId: 1, accountNo: 'ACCT', dateLastChanged: null }]),
      ),
      upsertStoreAccount: jest.fn(async (code: string, storeId: number, accountNo: string) =>
        Ok({ code, storeId, accountNo, dateLastChanged: null }),
      ),
      deleteStoreAccount: jest.fn(async () => Ok(undefined)),
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

describe('POST /api/v1/products/vendors', () => {
  it('returns 201 on create', async () => {
    const res = await request(app)
      .post('/api/v1/products/vendors')
      .send({ code: 'NEW1', name: 'ACME New', mailName: 'ACME' });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('NEW1');
  });

  it('maps DuplicatePrimaryKey to 409', async () => {
    const res = await request(app)
      .post('/api/v1/products/vendors')
      .send({ code: 'DUPE', name: 'dupe', mailName: 'dupe' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_PRIMARY_KEY');
  });

  it('rejects EDI half-populated with 422', async () => {
    const res = await request(app)
      .post('/api/v1/products/vendors')
      .send({ code: 'NEW2', name: 'n', mailName: 'm', qualifierId: '01' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONSTRAINT_VIOLATION');
  });
});

describe('PATCH /api/v1/products/vendors/:code', () => {
  it('returns 200 on update', async () => {
    const res = await request(app)
      .patch('/api/v1/products/vendors/ABCD')
      .send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ABCD');
  });
});

describe('DELETE /api/v1/products/vendors/:code', () => {
  it('returns 204 on successful delete', async () => {
    const res = await request(app).delete('/api/v1/products/vendors/ABCD');
    expect(res.status).toBe(204);
  });

  it('returns 422 when SKUs reference the vendor', async () => {
    const res = await request(app).delete('/api/v1/products/vendors/INUSE');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONSTRAINT_VIOLATION');
  });

  it('returns 503 when Access is down', async () => {
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

  it('PUT 200 on valid upsert', async () => {
    const res = await request(app)
      .put('/api/v1/products/vendors/ABCD/store-accounts/1')
      .send({ accountNo: 'ACCT-9' });
    expect(res.status).toBe(200);
    expect(res.body.accountNo).toBe('ACCT-9');
  });

  it('DELETE 204 on valid delete', async () => {
    const res = await request(app).delete('/api/v1/products/vendors/ABCD/store-accounts/1');
    expect(res.status).toBe(204);
  });

  it('DELETE 400 on non-integer storeId', async () => {
    const res = await request(app).delete('/api/v1/products/vendors/ABCD/store-accounts/abc');
    expect(res.status).toBe(400);
  });
});
