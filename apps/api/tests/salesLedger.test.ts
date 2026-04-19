import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';

function getCategoryId(ricsCode: number): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(ricsCode) as { id: number } | undefined;
  return row ? row.id : null;
}

function getBrandId(code: string): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_brands WHERE code = ?').get(code) as { id: number } | undefined;
  return row ? row.id : null;
}

function getColorId(code: string): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_colors WHERE code = ?').get(code) as { id: number } | undefined;
  return row ? row.id : null;
}

let skuId1: string;
let skuId2: string;

async function seedData() {
  const vendor = await request(app).post('/api/v1/vendors').send({
    name: 'Sales Ledger Vendor',
    contactEmail: 'sales@test.com',
    paymentTerms: 'NET_30',
    leadTimeDays: 14,
  });
  const vendorId = vendor.body.id;

  const sku1 = await request(app).post('/api/v1/skus').send({
    style: 'Ledger Pump',
    price: 120.00,
    department: 'FORMAL',
    categoryId: getCategoryId(556),
    brandId: getBrandId('KISS'),
    colorId: getColorId('BK'),
    vendorId,
  });
  skuId1 = sku1.body.id;

  const sku2 = await request(app).post('/api/v1/skus').send({
    style: 'Ledger Sandal',
    price: 75.00,
    department: 'CASUAL',
    categoryId: getCategoryId(565),
    brandId: getBrandId('FLEX'),
    colorId: getColorId('WH'),
    vendorId,
  });
  skuId2 = sku2.body.id;

  // Insert sales transactions directly
  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO sales_transactions (id, sku_id, quantity, unit_price, sold_at) VALUES (?, ?, ?, ?, ?)'
  );
  insert.run(uuidv4(), skuId1, 3, 120.00, '2026-04-01T10:00:00Z');
  insert.run(uuidv4(), skuId1, 2, 115.00, '2026-04-02T14:00:00Z');
  insert.run(uuidv4(), skuId2, 5, 75.00, '2026-04-03T09:00:00Z');
  insert.run(uuidv4(), skuId2, 1, 70.00, '2026-03-28T11:00:00Z');
}

beforeEach(async () => {
  resetDb();
  await seedData();
});

afterAll(() => {
  resetDb();
});

describe('GET /api/v1/sales/ledger', () => {
  it('returns paginated sales ledger with correct envelope', async () => {
    const res = await request(app).get('/api/v1/sales/ledger');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toHaveProperty('page', 1);
    expect(res.body.pagination).toHaveProperty('pageSize', 50);
    expect(res.body.pagination).toHaveProperty('totalItems', 4);
    expect(res.body.pagination).toHaveProperty('totalPages', 1);
    expect(res.body.data).toHaveLength(4);
  });

  it('returns correct row fields', async () => {
    const res = await request(app).get('/api/v1/sales/ledger');
    const row = res.body.data[0];
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('saleDate');
    expect(row).toHaveProperty('channel', 'STORE');
    expect(row).toHaveProperty('skuCode');
    expect(row).toHaveProperty('style');
    expect(row).toHaveProperty('department');
    expect(row).toHaveProperty('category');
    expect(row).toHaveProperty('unitsSold');
    expect(row).toHaveProperty('netRevenue');
  });

  it('defaults to sort by saleDate desc', async () => {
    const res = await request(app).get('/api/v1/sales/ledger');
    const dates = res.body.data.map((r: any) => r.saleDate);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1] >= dates[i]).toBe(true);
    }
  });

  it('sorts by unitsSold asc', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?sort=unitsSold&order=asc');
    expect(res.status).toBe(200);
    const units = res.body.data.map((r: any) => r.unitsSold);
    for (let i = 1; i < units.length; i++) {
      expect(units[i]).toBeGreaterThanOrEqual(units[i - 1]);
    }
  });

  it('filters by department', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?department=FORMAL');
    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBe(2);
    expect(res.body.data.every((r: any) => r.department === 'FORMAL')).toBe(true);
  });

  it('filters by date range (inclusive)', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?startDate=2026-04-01&endDate=2026-04-02');
    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBe(2);
  });

  it('filters by skuCode (case-insensitive contains)', async () => {
    const db = getDb();
    const sku = db.prepare('SELECT sku_code FROM skus WHERE id = ?').get(skuId1) as { sku_code: string };
    const fragment = sku.sku_code.substring(0, 4);
    const res = await request(app).get(`/api/v1/sales/ledger?skuCode=${fragment}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('filters by style (case-insensitive contains)', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?style=pump');
    expect(res.status).toBe(200);
    expect(res.body.data.every((r: any) => r.style.toLowerCase().includes('pump'))).toBe(true);
  });

  it('paginates correctly', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.totalPages).toBe(2);

    const res2 = await request(app).get('/api/v1/sales/ledger?page=2&pageSize=2');
    expect(res2.status).toBe(200);
    expect(res2.body.data).toHaveLength(2);
  });

  it('rejects invalid sort field', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?sort=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid department', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?department=INVALID');
    expect(res.status).toBe(400);
  });

  it('rejects category out of range', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?category=100');
    expect(res.status).toBe(400);
  });

  it('rejects pageSize over 200', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?pageSize=201');
    expect(res.status).toBe(400);
  });

  it('computes netRevenue correctly', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?department=FORMAL&sort=saleDate&order=asc');
    expect(res.status).toBe(200);
    const first = res.body.data[0];
    // 3 units * $120 = $360
    expect(first.unitsSold).toBe(3);
    expect(first.netRevenue).toBe(360.00);
  });

  it('returns empty data for no matches', async () => {
    const res = await request(app).get('/api/v1/sales/ledger?department=BOOTS');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.totalItems).toBe(0);
    expect(res.body.pagination.totalPages).toBe(1);
  });
});
