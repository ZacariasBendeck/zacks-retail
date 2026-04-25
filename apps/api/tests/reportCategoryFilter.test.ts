import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';

function getCategoryId(ricsCode: number): number {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(ricsCode) as { id: number } | undefined;
  if (!row) throw new Error(`Missing ref category for code ${ricsCode}`);
  return row.id;
}

function getBrandId(code: string): number {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_brands WHERE code = ?').get(code) as { id: number } | undefined;
  if (!row) throw new Error(`Missing ref brand for code ${code}`);
  return row.id;
}

function getColorId(code: string): number {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_colors WHERE code = ?').get(code) as { id: number } | undefined;
  if (!row) throw new Error(`Missing ref color for code ${code}`);
  return row.id;
}

function seedSkuForReportCategory(ricsCode: number, department: string): void {
  const db = getDb();
  const vendorId = randomUUID();
  const skuId = randomUUID();
  const inventoryId = randomUUID();
  const categoryId = getCategoryId(ricsCode);
  const brandId = getBrandId('KISS');
  const colorId = getColorId('BK');
  const style = `Report Test Style ${ricsCode}`;

  db.prepare(`
    INSERT INTO vendors (id, name, payment_terms, lead_time_days)
    VALUES (?, ?, 'NET_30', 15)
  `).run(vendorId, 'Report Test Vendor');

  db.prepare(`
    INSERT INTO skus (id, sku_code, style, price, category_id, department, vendor_id, brand_id, color_id, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(skuId, `TEST-${ricsCode}`, style, 99.99, categoryId, department, vendorId, brandId, colorId);

  db.prepare(`
    INSERT INTO inventory (id, sku_id, quantity_on_hand, quantity_reserved)
    VALUES (?, ?, 12, 0)
  `).run(inventoryId, skuId);
}

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  resetDb();
});

describe('Report category filters', () => {
  it('rejects category values outside canonical RICS domain', async () => {
    const invalidCode = 555;
    const requests = [
      request(app).get(`/api/v1/reports/on-hand?category=${invalidCode}`),
      request(app).get(`/api/v1/reports/sales-performance?startDate=2026-01-01&endDate=2026-01-31&category=${invalidCode}`),
      request(app).get(`/api/v1/reports/inventory-turnover?category=${invalidCode}`),
      // Inventory aging and sell-through accept the full RICS category range
      // (1..999) because they now read from app-owned Postgres data, not the
      // women's-shoe MVP slice in SQLite. The other reports above still gate
      // on 556..599.
    ];

    const responses = await Promise.all(requests);
    for (const res of responses) {
      expect(res.status).toBe(400);
      expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
    }
  });

  it('uses RICS category code for report drilldown filters and payloads', async () => {
    seedSkuForReportCategory(560, 'SANDALIAS');

    const drilldown = await request(app).get('/api/v1/reports/on-hand?department=SANDALIAS');
    expect(drilldown.status).toBe(200);
    expect(Array.isArray(drilldown.body.categories)).toBe(true);
    expect(drilldown.body.categories.some((c: any) => c.category === 560)).toBe(true);
    expect(drilldown.body.details.every((d: any) => d.category === 560)).toBe(true);

    const filtered = await request(app).get('/api/v1/reports/on-hand?department=SANDALIAS&category=560');
    expect(filtered.status).toBe(200);
    expect(filtered.body.details.length).toBeGreaterThan(0);
    expect(filtered.body.details.every((d: any) => d.category === 560)).toBe(true);
  });
});
