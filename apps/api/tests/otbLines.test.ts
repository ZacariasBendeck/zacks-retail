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
let budgetId: string;

async function seedData() {
  const db = getDb();

  const vendor = await request(app).post('/api/v1/vendors').send({
    name: 'OTB Lines Vendor',
    contactEmail: 'otb@test.com',
    paymentTerms: 'NET_30',
    leadTimeDays: 14,
  });
  const vendorId = vendor.body.id;

  const sku1 = await request(app).post('/api/v1/skus').send({
    style: 'OTB Pump',
    price: 100.00,
    department: 'FORMAL',
    categoryId: getCategoryId(556),
    brandId: getBrandId('KISS'),
    colorId: getColorId('BK'),
    vendorId,
  });
  skuId1 = sku1.body.id;

  const sku2 = await request(app).post('/api/v1/skus').send({
    style: 'OTB Sandal',
    price: 65.00,
    department: 'FORMAL',
    categoryId: getCategoryId(558),
    brandId: getBrandId('FLEX'),
    colorId: getColorId('WH'),
    vendorId,
  });
  skuId2 = sku2.body.id;

  // Create OTB budget for April 2026
  const budgetRes = await request(app).post('/api/v1/otb-budgets').send({
    department: 'FORMAL',
    year: 2026,
    month: 4,
    plannedBudget: 50000.00,
  });
  budgetId = budgetRes.body.id;

  // Create SKU plan lines
  db.prepare(
    'INSERT INTO otb_sku_plan_lines (id, otb_budget_id, sku_id, budget_units) VALUES (?, ?, ?, ?)'
  ).run(uuidv4(), budgetId, skuId1, 80);
  db.prepare(
    'INSERT INTO otb_sku_plan_lines (id, otb_budget_id, sku_id, budget_units) VALUES (?, ?, ?, ?)'
  ).run(uuidv4(), budgetId, skuId2, 50);

  // Add some sales in April 2026
  db.prepare(
    'INSERT INTO sales_transactions (id, sku_id, quantity, unit_price, sold_at) VALUES (?, ?, ?, ?, ?)'
  ).run(uuidv4(), skuId1, 10, 100.00, '2026-04-02T10:00:00Z');
  db.prepare(
    'INSERT INTO sales_transactions (id, sku_id, quantity, unit_price, sold_at) VALUES (?, ?, ?, ?, ?)'
  ).run(uuidv4(), skuId1, 5, 100.00, '2026-04-05T10:00:00Z');
  db.prepare(
    'INSERT INTO sales_transactions (id, sku_id, quantity, unit_price, sold_at) VALUES (?, ?, ?, ?, ?)'
  ).run(uuidv4(), skuId2, 20, 65.00, '2026-04-03T10:00:00Z');

  // Create a PO with open order quantities in April 2026
  const poRes = await request(app).post('/api/v1/purchase-orders').send({
    vendorId,
    lineItems: [
      { skuId: skuId1, quantity: 12, unitCost: 40.00 },
      { skuId: skuId2, quantity: 8, unitCost: 25.00 },
    ],
  });
  const poId = poRes.body.id;
  // Submit so it counts as committed (status SUBMITTED)
  await request(app).patch(`/api/v1/purchase-orders/${poId}/submit`).send({});
}

beforeEach(async () => {
  resetDb();
  await seedData();
});

afterAll(() => {
  resetDb();
});

describe('GET /api/v1/otb/lines', () => {
  it('returns paginated OTB lines with correct envelope', async () => {
    const res = await request(app).get('/api/v1/otb/lines?year=2026&month=4');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toHaveProperty('page', 1);
    expect(res.body.pagination.totalItems).toBe(2);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns correct row fields', async () => {
    const res = await request(app).get('/api/v1/otb/lines?year=2026&month=4');
    const row = res.body.data[0];
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('skuCode');
    expect(row).toHaveProperty('style');
    expect(row).toHaveProperty('department');
    expect(row).toHaveProperty('category');
    expect(row).toHaveProperty('budgetUnits');
    expect(row).toHaveProperty('actualUnits');
    expect(row).toHaveProperty('onOrderUnits');
    expect(row).toHaveProperty('openToBuyUnits');
  });

  it('computes openToBuyUnits = budgetUnits - actualUnits - onOrderUnits', async () => {
    const res = await request(app).get('/api/v1/otb/lines?year=2026&month=4&sort=skuCode&order=asc');
    expect(res.status).toBe(200);

    for (const row of res.body.data) {
      expect(row.openToBuyUnits).toBe(row.budgetUnits - row.actualUnits - row.onOrderUnits);
    }
  });

  it('defaults to sort by openToBuyUnits asc', async () => {
    const res = await request(app).get('/api/v1/otb/lines?year=2026&month=4');
    const otb = res.body.data.map((r: any) => r.openToBuyUnits);
    for (let i = 1; i < otb.length; i++) {
      expect(otb[i]).toBeGreaterThanOrEqual(otb[i - 1]);
    }
  });

  it('filters by department', async () => {
    const res = await request(app).get('/api/v1/otb/lines?year=2026&month=4&department=FORMAL');
    expect(res.status).toBe(200);
    expect(res.body.data.every((r: any) => r.department === 'FORMAL')).toBe(true);
  });

  it('returns empty for non-existent period', async () => {
    const res = await request(app).get('/api/v1/otb/lines?year=2025&month=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.totalItems).toBe(0);
  });

  it('filters by style (case-insensitive)', async () => {
    const res = await request(app).get('/api/v1/otb/lines?year=2026&month=4&style=pump');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].style.toLowerCase()).toContain('pump');
  });

  it('paginates correctly', async () => {
    const res = await request(app).get('/api/v1/otb/lines?year=2026&month=4&pageSize=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  it('rejects invalid sort field', async () => {
    const res = await request(app).get('/api/v1/otb/lines?sort=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects month out of range', async () => {
    const res = await request(app).get('/api/v1/otb/lines?month=13');
    expect(res.status).toBe(400);
  });

  it('rejects category out of range', async () => {
    const res = await request(app).get('/api/v1/otb/lines?category=100');
    expect(res.status).toBe(400);
  });

  it('sorts by budgetUnits desc', async () => {
    const res = await request(app).get('/api/v1/otb/lines?year=2026&month=4&sort=budgetUnits&order=desc');
    expect(res.status).toBe(200);
    const units = res.body.data.map((r: any) => r.budgetUnits);
    for (let i = 1; i < units.length; i++) {
      expect(units[i]).toBeLessThanOrEqual(units[i - 1]);
    }
  });

  it('reflects actual sales in actualUnits', async () => {
    const res = await request(app).get('/api/v1/otb/lines?year=2026&month=4&sort=skuCode&order=asc');
    expect(res.status).toBe(200);
    // At least one row should have actualUnits > 0 from our seeded sales
    const hasActuals = res.body.data.some((r: any) => r.actualUnits > 0);
    expect(hasActuals).toBe(true);
  });

  it('reflects open PO quantities in onOrderUnits', async () => {
    const res = await request(app).get('/api/v1/otb/lines?year=2026&month=4&sort=skuCode&order=asc');
    expect(res.status).toBe(200);
    // At least one row should have onOrderUnits > 0 from our submitted PO
    const hasOrders = res.body.data.some((r: any) => r.onOrderUnits > 0);
    expect(hasOrders).toBe(true);
  });
});
