/**
 * Route tests for /api/v1/taxonomy/*.
 *
 * Covers:
 *  - happy path for each entity's list endpoint
 *  - 404 mapping on NotFound
 *  - 422 mapping on ConstraintViolation
 *  - 409 mapping on DuplicatePrimaryKey
 *  - 503 mapping on AccessConnectionError (seasons write path)
 *  - input-validation guards (non-integer path params → 400)
 *
 * Every repository is mocked — no MDB is opened. Tests run on CI.
 */

import request from 'supertest';
import { Err, Ok } from '../../../src/repositories/rics/repoResult';

jest.mock('../../../src/repositories/rics/DepartmentRepository', () => ({
  DepartmentRepository: {
    list: jest.fn(async () => Ok([{ number: 1, description: 'DEPT', begCateg: 1, endCateg: 10, dateLastChanged: null }])),
    getByNumber: jest.fn(async (n: number) =>
      n === 1
        ? Ok({ number: 1, description: 'DEPT', begCateg: 1, endCateg: 10, dateLastChanged: null })
        : Err({ kind: 'NotFound', message: `Department ${n} not found.` }),
    ),
    create: jest.fn(async (input: { number: number }) =>
      input.number === 99
        ? Err({ kind: 'DuplicatePrimaryKey', message: 'Department 99 already exists.' })
        : input.number > 999
          ? Err({ kind: 'ConstraintViolation', message: 'out of range' })
          : Ok({
              number: input.number,
              description: 'new',
              begCateg: 1,
              endCateg: 10,
              dateLastChanged: null,
            }),
    ),
    update: jest.fn(async () =>
      Ok({ number: 1, description: 'updated', begCateg: 1, endCateg: 10, dateLastChanged: null }),
    ),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/CategoryRepository', () => ({
  CategoryRepository: {
    list: jest.fn(async () => Ok([])),
    getByNumber: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () => Ok({ number: 5, description: 'c', dateLastChanged: null })),
    update: jest.fn(async () => Ok({ number: 5, description: 'c', dateLastChanged: null })),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/GroupRepository', () => ({
  GroupRepository: {
    list: jest.fn(async () => Ok([])),
    getByCode: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () => Ok({ code: 'ABC', description: 'g', dateLastChanged: null })),
    update: jest.fn(async () => Ok({ code: 'ABC', description: 'g', dateLastChanged: null })),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/KeywordRepository', () => ({
  KeywordRepository: {
    list: jest.fn(async () => Ok([])),
    getByKeyword: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async (input: { keyword: string }) =>
      input.keyword.length > 10
        ? Err({ kind: 'ConstraintViolation', message: 'keyword too long' })
        : Ok({ keyword: input.keyword, description: 'k', dateLastChanged: null }),
    ),
    update: jest.fn(async () => Ok({ keyword: 'ZTEST1', description: 'k', dateLastChanged: null })),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/NrfCodeRepository', () => ({
  NrfCodeRepository: {
    listForSizeType: jest.fn(async () => Ok([])),
    lookup: jest.fn(async () => Ok([])),
  },
}));

jest.mock('../../../src/repositories/rics/PromotionCodeRepository', () => ({
  PromotionCodeRepository: {
    list: jest.fn(async () => Ok([])),
    getByCode: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () =>
      Ok({ code: 'PROMO1', description: 'p', date: null, pieces: null, cost: null, dateLastChanged: null }),
    ),
    update: jest.fn(async () =>
      Ok({ code: 'PROMO1', description: 'p', date: null, pieces: null, cost: null, dateLastChanged: null }),
    ),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/ReturnCodeRepository', () => ({
  ReturnCodeRepository: {
    list: jest.fn(async () => Ok([])),
    getByCode: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () => Ok({ code: 1, description: 'r', trackable: true, dateLastChanged: null })),
    update: jest.fn(async () => Ok({ code: 1, description: 'r', trackable: true, dateLastChanged: null })),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/SeasonRepository', () => ({
  SeasonRepository: {
    list: jest.fn(async () => Ok([{ code: 'A', description: null, skuCount: 42 }])),
    getByCode: jest.fn(async (code: string) =>
      code === 'A' ? Ok({ code: 'A', description: null, skuCount: 42 }) : Err({ kind: 'NotFound', message: 'not found' }),
    ),
    create: jest.fn(async () =>
      Err({ kind: 'AccessConnectionError', message: 'Season master is not writable in Phase 1.' }),
    ),
    update: jest.fn(async () =>
      Err({ kind: 'AccessConnectionError', message: 'Season master is not writable in Phase 1.' }),
    ),
    delete: jest.fn(async () =>
      Err({ kind: 'AccessConnectionError', message: 'Season master is not writable in Phase 1.' }),
    ),
  },
}));

jest.mock('../../../src/repositories/rics/SectorRepository', () => ({
  SectorRepository: {
    list: jest.fn(async () => Ok([])),
    getByNumber: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () => Ok({ number: 1, description: 's', begDept: 1, endDept: 2, dateLastChanged: null })),
    update: jest.fn(async () => Ok({ number: 1, description: 's', begDept: 1, endDept: 2, dateLastChanged: null })),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

jest.mock('../../../src/repositories/rics/SizeTypeRepository', () => ({
  SizeTypeRepository: {
    list: jest.fn(async () => Ok([])),
    getByCode: jest.fn(async () => Err({ kind: 'NotFound', message: 'not found' })),
    create: jest.fn(async () =>
      Ok({
        code: 1,
        description: 's',
        columnDescription: 'C',
        rowDescription: 'R',
        tableType: null,
        columns: ['1'],
        rows: [],
        maxColumns: 1,
        maxRows: 0,
        dateLastChanged: null,
      }),
    ),
    update: jest.fn(async () =>
      Ok({
        code: 1,
        description: 's',
        columnDescription: 'C',
        rowDescription: 'R',
        tableType: null,
        columns: ['1'],
        rows: [],
        maxColumns: 1,
        maxRows: 0,
        dateLastChanged: null,
      }),
    ),
    delete: jest.fn(async () => Ok(undefined)),
  },
}));

// Import the app AFTER all mocks are in place.
import app from '../../../src/app';

describe('GET /api/v1/taxonomy/departments', () => {
  it('returns the list on 200', async () => {
    const res = await request(app).get('/api/v1/taxonomy/departments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].number).toBe(1);
  });
});

describe('GET /api/v1/taxonomy/departments/:number', () => {
  it('returns 200 for a found record', async () => {
    const res = await request(app).get('/api/v1/taxonomy/departments/1');
    expect(res.status).toBe(200);
    expect(res.body.number).toBe(1);
  });

  it('returns 404 when the department does not exist', async () => {
    const res = await request(app).get('/api/v1/taxonomy/departments/9999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 on a non-integer path parameter', async () => {
    const res = await request(app).get('/api/v1/taxonomy/departments/abc');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARAM');
  });
});

describe('POST /api/v1/taxonomy/departments', () => {
  it('returns 201 on create', async () => {
    const res = await request(app)
      .post('/api/v1/taxonomy/departments')
      .send({ number: 42, description: 'ZTEST_DEPT', begCateg: 1, endCateg: 10 });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe(42);
  });

  it('maps DuplicatePrimaryKey to 409', async () => {
    const res = await request(app)
      .post('/api/v1/taxonomy/departments')
      .send({ number: 99, description: 'dup', begCateg: 1, endCateg: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_PRIMARY_KEY');
  });

  it('maps ConstraintViolation to 422', async () => {
    const res = await request(app)
      .post('/api/v1/taxonomy/departments')
      .send({ number: 1234, description: 'bad', begCateg: 1, endCateg: 10 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONSTRAINT_VIOLATION');
  });
});

describe('DELETE /api/v1/taxonomy/departments/:number', () => {
  it('returns 204 on success', async () => {
    const res = await request(app).delete('/api/v1/taxonomy/departments/1');
    expect(res.status).toBe(204);
  });
});

describe('Seasons (read-only in Phase 1)', () => {
  it('GET /seasons returns the derived list', async () => {
    const res = await request(app).get('/api/v1/taxonomy/seasons');
    expect(res.status).toBe(200);
    expect(res.body[0].code).toBe('A');
  });

  it('POST /seasons returns 503 with a clear message', async () => {
    const res = await request(app)
      .post('/api/v1/taxonomy/seasons')
      .send({ code: 'X', description: 'test' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ACCESS_CONNECTION_ERROR');
    expect(res.body.error.message).toMatch(/not writable/i);
  });
});

describe('Keywords', () => {
  it('GET /keywords/:keyword returns 404 when missing', async () => {
    const res = await request(app).get('/api/v1/taxonomy/keywords/ZNOPE');
    expect(res.status).toBe(404);
  });

  it('POST /keywords maps ConstraintViolation to 422', async () => {
    const res = await request(app)
      .post('/api/v1/taxonomy/keywords')
      .send({ keyword: 'TOOLONG123456', description: 'x' });
    expect(res.status).toBe(422);
  });
});

describe('Size types', () => {
  it('GET /size-types returns 200', async () => {
    const res = await request(app).get('/api/v1/taxonomy/size-types');
    expect(res.status).toBe(200);
  });

  it('POST /size-types/:code returns 400 on non-integer code', async () => {
    const res = await request(app).patch('/api/v1/taxonomy/size-types/abc').send({});
    expect(res.status).toBe(400);
  });
});

describe('NRF codes (read-only)', () => {
  it('GET /nrf-codes requires sizeTypeCode', async () => {
    const res = await request(app).get('/api/v1/taxonomy/nrf-codes');
    expect(res.status).toBe(400);
  });

  it('GET /nrf-codes?sizeTypeCode=10 returns 200', async () => {
    const res = await request(app).get('/api/v1/taxonomy/nrf-codes?sizeTypeCode=10');
    expect(res.status).toBe(200);
  });
});
