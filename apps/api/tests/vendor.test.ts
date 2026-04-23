/**
 * Vendor route tests — legacy /api/v1/vendors is now a read-only projection
 * over rics_mirror.vendor_master. Writes return 501. Reads hit Prisma's
 * $queryRawUnsafe against Postgres.
 *
 * These tests mock the Prisma client so they stay self-contained (no real
 * Postgres required). Column mapping assertions verify the legacy Vendor
 * shape is preserved for the one remaining frontend consumer.
 */

jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/db/prisma';

// Narrow the mock so TS is happy with mockResolvedValueOnce.
const mockQuery = prisma.$queryRawUnsafe as jest.MockedFunction<
  typeof prisma.$queryRawUnsafe
>;

const RICS_ROW_1 = {
  code: '03EV',
  short_name: '03 EVERLY',
  mail_name: '03 EVERLY',
  e_mail: 'info@03everly.com',
  phone: '213-765-5333',
  date_last_changed: new Date('2010-11-19T07:36:00Z'),
};

const RICS_ROW_2 = {
  code: '1004',
  short_name: '1004 by JHL',
  mail_name: '1004 by JHL Mode',
  e_mail: null,
  phone: null,
  date_last_changed: new Date('2010-11-18T08:00:40Z'),
};

beforeEach(() => {
  mockQuery.mockReset();
});

// ──────────────────────── Write endpoints → 501 ────────────────────────

describe('POST /api/v1/vendors', () => {
  it('returns 501 because writes moved to /api/v1/products/vendors', async () => {
    const res = await request(app).post('/api/v1/vendors').send({
      name: 'Whatever',
      contactEmail: 'x@x.com',
      paymentTerms: 'NET_30',
      leadTimeDays: 10,
    });
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('WRITE_NOT_SUPPORTED');
    expect(res.body.error.message).toMatch(/\/api\/v1\/products\/vendors/);
    // no DB query should have been issued
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/vendors/:vendorId', () => {
  it('returns 501', async () => {
    const res = await request(app)
      .patch('/api/v1/vendors/03EV')
      .send({ name: 'Renamed' });
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('WRITE_NOT_SUPPORTED');
  });
});

describe('DELETE /api/v1/vendors/:vendorId', () => {
  it('returns 501', async () => {
    const res = await request(app).delete('/api/v1/vendors/03EV');
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('WRITE_NOT_SUPPORTED');
  });
});

// ─────────────────────────── Read: GET by code ───────────────────────────

describe('GET /api/v1/vendors/:vendorId', () => {
  it('returns the vendor when rics_mirror has the code', async () => {
    mockQuery.mockResolvedValueOnce([RICS_ROW_1] as never);

    const res = await request(app).get('/api/v1/vendors/03EV');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: '03EV',
      name: '03 EVERLY',
      contactEmail: 'info@03everly.com',
      phone: '213-765-5333',
      paymentTerms: null,
      leadTimeDays: null,
      active: true,
    });
    expect(res.body.createdAt).toBe('2010-11-19T07:36:00.000Z');
    expect(res.body.updatedAt).toBe('2010-11-19T07:36:00.000Z');

    // SQL + params check — prove it hit vendor_master with the right filter
    const call = mockQuery.mock.calls[0];
    expect(call[0]).toMatch(/FROM rics_mirror\.vendor_master/);
    expect(call[0]).toMatch(/WHERE code = \$1/);
    expect(call[1]).toBe('03EV');
  });

  it('returns 404 when the code does not exist', async () => {
    mockQuery.mockResolvedValueOnce([] as never);

    const res = await request(app).get('/api/v1/vendors/NOPE');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('falls back to mail_name when short_name is null', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        ...RICS_ROW_2,
        short_name: null,
      },
    ] as never);

    const res = await request(app).get('/api/v1/vendors/1004');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('1004 by JHL Mode'); // mail_name
  });

  it('falls back to code when both short_name and mail_name are blank', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        code: 'Z999',
        short_name: '   ',
        mail_name: '',
        e_mail: null,
        phone: null,
        date_last_changed: null,
      },
    ] as never);

    const res = await request(app).get('/api/v1/vendors/Z999');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Z999');
    // null date falls back to epoch
    expect(res.body.createdAt).toBe('1970-01-01T00:00:00.000Z');
  });
});

// ─────────────────────────── Read: GET list ───────────────────────────

describe('GET /api/v1/vendors (list)', () => {
  it('returns paginated vendors sorted by name', async () => {
    // listVendors issues two queries — COUNT then SELECT. Queue both responses in order.
    mockQuery
      .mockResolvedValueOnce([{ total: 2n }] as never)
      .mockResolvedValueOnce([RICS_ROW_1, RICS_ROW_2] as never);

    const res = await request(app).get('/api/v1/vendors');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe('03EV');
    expect(res.body.data[1].id).toBe('1004');
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 50,
      totalItems: 2,
      totalPages: 1,
    });
  });

  it('paginates correctly when totalItems exceeds pageSize', async () => {
    mockQuery
      .mockResolvedValueOnce([{ total: 5n }] as never)
      .mockResolvedValueOnce([RICS_ROW_1, RICS_ROW_2] as never);

    const res = await request(app).get('/api/v1/vendors?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBe(5);
    expect(res.body.pagination.totalPages).toBe(3);

    // Second query should have applied LIMIT 2 OFFSET 0
    const listCall = mockQuery.mock.calls[1];
    expect(listCall[0]).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
    // LIMIT = pageSize (2), OFFSET = (page-1)*pageSize (0)
    expect(listCall.slice(-2)).toEqual([2, 0]);
  });

  it('applies the search filter via LOWER LIKE', async () => {
    mockQuery
      .mockResolvedValueOnce([{ total: 1n }] as never)
      .mockResolvedValueOnce([RICS_ROW_1] as never);

    const res = await request(app).get('/api/v1/vendors?q=Everly');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const countCall = mockQuery.mock.calls[0];
    // First positional arg is the %everly% pattern (lowercased)
    expect(countCall[1]).toBe('%everly%');
    expect(countCall[0]).toMatch(/LOWER\(COALESCE\(short_name,''\)\) LIKE \$1/);
  });

  it('defaults pagination and sort when no params given', async () => {
    mockQuery
      .mockResolvedValueOnce([{ total: 0n }] as never)
      .mockResolvedValueOnce([] as never);

    await request(app).get('/api/v1/vendors');
    const listCall = mockQuery.mock.calls[1];
    expect(listCall[0]).toMatch(/ORDER BY short_name ASC/);
  });

  it('sorts by createdAt when requested', async () => {
    mockQuery
      .mockResolvedValueOnce([{ total: 0n }] as never)
      .mockResolvedValueOnce([] as never);

    await request(app).get('/api/v1/vendors?sort=createdAt&order=desc');
    const listCall = mockQuery.mock.calls[1];
    expect(listCall[0]).toMatch(/ORDER BY date_last_changed DESC/);
  });
});
