import request from 'supertest';
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

let vendorId: string;
let skuId1: string;
let skuId2: string;

async function seedVendorAndSkus() {
  const vendor = await request(app).post('/api/v1/vendors').send({
    name: 'Test Vendor Adjustments',
    contactEmail: 'test@adjustments.com',
    paymentTerms: 'NET_30',
    leadTimeDays: 14,
  });
  vendorId = vendor.body.id;

  const sku1 = await request(app).post('/api/v1/skus').send({
    style: 'Adjustment Test Pump',
    price: 89.99,
    department: 'FORMAL',
    categoryId: getCategoryId(556),
    brandId: getBrandId('KISS'),
    colorId: getColorId('BK'),
    vendorId,
  });
  skuId1 = sku1.body.id;

  const sku2 = await request(app).post('/api/v1/skus').send({
    style: 'Adjustment Test Sandal',
    price: 59.99,
    department: 'SANDALIAS',
    categoryId: getCategoryId(560),
    brandId: getBrandId('FLEX'),
    colorId: getColorId('WH'),
    vendorId,
  });
  skuId2 = sku2.body.id;

  // Seed initial stock via the SKU-scoped adjustment endpoint
  const db = getDb();
  db.prepare("UPDATE inventory SET quantity_on_hand = 50, updated_at = datetime('now') WHERE sku_id = ?").run(skuId1);
  db.prepare("UPDATE inventory SET quantity_on_hand = 30, updated_at = datetime('now') WHERE sku_id = ?").run(skuId2);
}

beforeEach(async () => {
  resetDb();
  await seedVendorAndSkus();
});

afterAll(() => {
  resetDb();
});

// ── GET /api/v1/locations ───────────────────────────────────────────

describe('GET /api/v1/locations', () => {
  it('returns seeded locations', async () => {
    const res = await request(app).get('/api/v1/locations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('name');
  });
});

// ── POST /api/v1/inventory/adjustments ──────────────────────────────

describe('POST /api/v1/inventory/adjustments', () => {
  it('creates a RECEIPT adjustment', async () => {
    const res = await request(app).post('/api/v1/inventory/adjustments').send({
      type: 'RECEIPT',
      toLocationId: 'loc-01',
      lineItems: [
        { skuId: skuId1, quantity: 10 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('RECEIPT');
    expect(res.body.toLocationId).toBe('loc-01');
    expect(res.body.toLocationName).toBe('Almacen Principal');
    expect(res.body.lineItems).toHaveLength(1);
    expect(res.body.lineItems[0].skuId).toBe(skuId1);
    expect(res.body.lineItems[0].skuCode).toBeDefined();
    expect(res.body.lineItems[0].quantity).toBe(10);
    expect(res.body.createdAt).toBeDefined();
  });

  it('creates a TRANSFER adjustment with from/to locations', async () => {
    const res = await request(app).post('/api/v1/inventory/adjustments').send({
      type: 'TRANSFER',
      fromLocationId: 'loc-01',
      toLocationId: 'loc-02',
      lineItems: [
        { skuId: skuId1, quantity: -5 },
        { skuId: skuId2, quantity: -3 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('TRANSFER');
    expect(res.body.fromLocationId).toBe('loc-01');
    expect(res.body.fromLocationName).toBe('Almacen Principal');
    expect(res.body.toLocationId).toBe('loc-02');
    expect(res.body.toLocationName).toBe('Tienda Centro');
    expect(res.body.lineItems).toHaveLength(2);
  });

  it('creates a DAMAGE adjustment with reason', async () => {
    const res = await request(app).post('/api/v1/inventory/adjustments').send({
      type: 'DAMAGE',
      reason: 'Water damage during transport',
      lineItems: [
        { skuId: skuId1, quantity: -2 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('DAMAGE');
    expect(res.body.reason).toBe('Water damage during transport');
  });

  it('rejects DAMAGE/SHRINKAGE when stock would go below zero', async () => {
    const res = await request(app).post('/api/v1/inventory/adjustments').send({
      type: 'SHRINKAGE',
      reason: 'Missing from shelf',
      lineItems: [
        { skuId: skuId1, quantity: -999 },
      ],
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('rejects invalid SKU', async () => {
    const res = await request(app).post('/api/v1/inventory/adjustments').send({
      type: 'RECEIPT',
      toLocationId: 'loc-01',
      lineItems: [
        { skuId: '00000000-0000-0000-0000-000000000000', quantity: 5 },
      ],
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SKU_NOT_FOUND');
  });

  it('rejects invalid location', async () => {
    const res = await request(app).post('/api/v1/inventory/adjustments').send({
      type: 'RECEIPT',
      toLocationId: 'loc-nonexistent',
      lineItems: [
        { skuId: skuId1, quantity: 5 },
      ],
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LOCATION_NOT_FOUND');
  });

  it('rejects empty line items', async () => {
    const res = await request(app).post('/api/v1/inventory/adjustments').send({
      type: 'RECEIPT',
      toLocationId: 'loc-01',
      lineItems: [],
    });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/inventory/adjustments ───────────────────────────────

describe('GET /api/v1/inventory/adjustments', () => {
  beforeEach(async () => {
    // Create some adjustments
    await request(app).post('/api/v1/inventory/adjustments').send({
      type: 'RECEIPT',
      toLocationId: 'loc-01',
      lineItems: [{ skuId: skuId1, quantity: 10 }],
    });
    await request(app).post('/api/v1/inventory/adjustments').send({
      type: 'DAMAGE',
      reason: 'Broken heel',
      lineItems: [{ skuId: skuId2, quantity: -1 }],
    });
  });

  it('lists adjustments with pagination', async () => {
    const res = await request(app).get('/api/v1/inventory/adjustments');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.pagination).toBeDefined();
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.totalItems).toBe(2);
  });

  it('filters by type', async () => {
    const res = await request(app).get('/api/v1/inventory/adjustments?type=DAMAGE');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].type).toBe('DAMAGE');
  });
});

// ── GET /api/v1/inventory/adjustments/:id ───────────────────────────

describe('GET /api/v1/inventory/adjustments/:id', () => {
  it('returns a single adjustment by ID', async () => {
    const created = await request(app).post('/api/v1/inventory/adjustments').send({
      type: 'RETURN',
      toLocationId: 'loc-01',
      lineItems: [{ skuId: skuId1, quantity: 3 }],
    });

    const res = await request(app).get(`/api/v1/inventory/adjustments/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.type).toBe('RETURN');
    expect(res.body.lineItems).toHaveLength(1);
  });

  it('returns 404 for nonexistent adjustment', async () => {
    const res = await request(app).get('/api/v1/inventory/adjustments/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});
