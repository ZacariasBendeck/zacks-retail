import request from 'supertest';
import { prisma } from '../src/db/prisma';
import app from '../src/app';

jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

const mockQueryRawUnsafe = prisma.$queryRawUnsafe as jest.Mock;

const rawRows = [
  {
    id: 'line-1',
    sold_at: new Date('2026-04-09T01:57:53.000Z'),
    store_id: 20,
    store_name: 'Magic Shoes',
    channel: 'store',
    sku_code: '901BNV',
    style: 'PU/AZUL',
    department: 'CARTERAS MONED MARCA',
    category: 261,
    units_sold: 1,
    net_revenue: 520.87,
  },
  {
    id: 'line-2',
    sold_at: new Date('2026-04-09T01:53:26.000Z'),
    store_id: 41,
    store_name: 'La Femme City TGU',
    channel: 'store',
    sku_code: 'ZK48-GNPT',
    style: 'PT/GN',
    department: 'ZAP. TACON MUJER',
    category: 568,
    units_sold: 1,
    net_revenue: 691.3,
  },
];

function mockLedgerQuery(totalItems = rawRows.length, rows = rawRows): void {
  mockQueryRawUnsafe.mockImplementation((sql: string) => {
    if (sql.includes('COUNT(*)')) return Promise.resolve([{ cnt: totalItems }]);
    return Promise.resolve(rows);
  });
}

beforeEach(() => {
  mockQueryRawUnsafe.mockReset();
  mockLedgerQuery();
});

describe('GET /api/v1/sales/ledger', () => {
  it('returns paginated sales ledger rows from the Postgres sales-history surface', async () => {
    const res = await request(app).get('/api/v1/sales/ledger');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      pageSize: 50,
      totalItems: 2,
      totalPages: 1,
    });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({
      id: 'line-1',
      saleDate: '2026-04-09T01:57:53.000Z',
      storeId: 20,
      storeName: 'Magic Shoes',
      storeLabel: '20 - Magic Shoes',
      channel: 'STORE',
      skuCode: '901BNV',
      style: 'PU/AZUL',
      department: 'CARTERAS MONED MARCA',
      category: 261,
      unitsSold: 1,
      netRevenue: 520.87,
    });
    expect(String(mockQueryRawUnsafe.mock.calls[0][0])).toContain('app.sales_history_ticket');
    expect(String(mockQueryRawUnsafe.mock.calls[0][0])).toContain("t.status = 'completed'");
  });

  it('passes the store filter through as the first report filter', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?storeId=20');

    expect(res.status).toBe(200);
    expect(String(mockQueryRawUnsafe.mock.calls[0][0])).toContain('t.store_id = $1::int');
    expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe(20);
  });

  it('accepts real RICS category numbers outside the old shoe-only range', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?category=261');

    expect(res.status).toBe(200);
    expect(String(mockQueryRawUnsafe.mock.calls[0][0])).toContain('cat.category_number = $1::int');
    expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe(261);
  });

  it('supports sorting by store', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?sort=storeId&order=asc');

    expect(res.status).toBe(200);
    expect(String(mockQueryRawUnsafe.mock.calls[1][0])).toContain('ORDER BY t.store_id ASC');
  });

  it('filters by channel using the normalized report channel', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?channel=STORE');

    expect(res.status).toBe(200);
    expect(String(mockQueryRawUnsafe.mock.calls[0][0])).toContain(
      "UPPER(COALESCE(NULLIF(BTRIM(t.channel), ''), 'store')) = $1",
    );
    expect(mockQueryRawUnsafe.mock.calls[0][1]).toBe('STORE');
  });

  it('paginates with limit and offset parameters', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?page=2&pageSize=25');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 2, pageSize: 25 });
    expect(mockQueryRawUnsafe.mock.calls[1].at(-2)).toBe(25);
    expect(mockQueryRawUnsafe.mock.calls[1].at(-1)).toBe(25);
  });

  it('rejects invalid sort fields', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?sort=invalid');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects categories outside the RICS code range', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?category=1000');

    expect(res.status).toBe(400);
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it('returns empty data for no matches', async () => {
    mockLedgerQuery(0, []);

    const res = await request(app).get('/api/v1/sales/ledger?department=NOPE');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.totalItems).toBe(0);
    expect(res.body.pagination.totalPages).toBe(1);
  });

  it('returns a structured error when the database query fails', async () => {
    mockQueryRawUnsafe.mockRejectedValueOnce(new Error('database unavailable'));

    const res = await request(app).get('/api/v1/sales/ledger');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SALES_LEDGER_QUERY_FAILED');
  });
});
