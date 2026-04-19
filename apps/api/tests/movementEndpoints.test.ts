import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';

function getRefId(table: string, offset = 0): number | null {
  const db = getDb();
  const row = db.prepare(`SELECT id FROM ${table} LIMIT 1 OFFSET ?`).get(offset) as { id: number } | undefined;
  return row ? row.id : null;
}

function getCategoryId(ricsCode: number): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(ricsCode) as { id: number } | undefined;
  return row ? row.id : null;
}

let vendorId: string;
let skuId: string;
let skuId2: string;
let locationId: string;

beforeEach(async () => {
  resetDb();

  const vendor = await request(app).post('/api/v1/vendors').send({
    name: 'Movement Test Vendor',
    contactEmail: 'movement@test.com',
    paymentTerms: 'NET_30',
    leadTimeDays: 14,
  });
  vendorId = vendor.body.id;

  const catId = getCategoryId(560);
  const brandId = getRefId('ref_brands');
  const colorId = getRefId('ref_colors');

  const sku1 = await request(app).post('/api/v1/skus').send({
    style: 'Movement Test A',
    price: 100,
    department: 'FORMAL',
    categoryId: catId,
    vendorId,
    brandId,
    colorId,
  });
  skuId = sku1.body.id;

  const sku2 = await request(app).post('/api/v1/skus').send({
    style: 'Movement Test B',
    price: 200,
    department: 'CASUAL',
    categoryId: catId,
    vendorId,
    brandId,
    colorId,
  });
  skuId2 = sku2.body.id;

  // Get the default location
  const db = getDb();
  const loc = db.prepare("SELECT id FROM inventory_locations LIMIT 1").get() as { id: string } | undefined;
  locationId = loc?.id ?? '';

  // Seed movements via mutations (triggers auto-create ledger rows)
  await request(app).post('/api/v1/inventory/mutations/receive').send({
    skuId,
    quantityDelta: 50,
    reasonCode: 'Initial stock',
    categoryCode: 560,
    sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-T001' },
    actorId: uuidv4(),
    idempotencyKey: uuidv4(),
  });

  await request(app).post('/api/v1/inventory/mutations/adjust').send({
    skuId,
    quantityDelta: -5,
    reasonCode: 'Damage writeoff',
    categoryCode: 560,
    sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-T001' },
    actorId: uuidv4(),
  });

  await request(app).post('/api/v1/inventory/mutations/receive').send({
    skuId: skuId2,
    quantityDelta: 30,
    reasonCode: 'Replenishment',
    categoryCode: 560,
    sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-T002' },
    actorId: uuidv4(),
    idempotencyKey: uuidv4(),
  });
});

afterAll(() => {
  resetDb();
});

// ── Timeline Endpoint ────────────────────────────────────────────

describe('GET /api/v1/inventory/movements/timeline', () => {
  it('returns non-404 and cursor-paginated envelope', async () => {
    const res = await request(app).get('/api/v1/inventory/movements/timeline');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('nextCursor');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('appliedSort');
    expect(res.body).toHaveProperty('appliedFilters');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('returns correct fields for each movement row', async () => {
    const res = await request(app).get('/api/v1/inventory/movements/timeline');

    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('skuId');
    expect(item).toHaveProperty('locationId');
    expect(item).toHaveProperty('movementType');
    expect(item).toHaveProperty('quantityDelta');
    expect(item).toHaveProperty('movementAt');
    expect(item).toHaveProperty('createdAt');
  });

  it('filters by skuId', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/movements/timeline')
      .query({ skuId });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    for (const item of res.body.data) {
      expect(item.skuId).toBe(skuId);
    }
    expect(res.body.appliedFilters.skuId).toBe(skuId);
  });

  it('filters by movementType', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/movements/timeline')
      .query({ movementType: 'adjustment' });

    expect(res.status).toBe(200);
    for (const item of res.body.data) {
      expect(item.movementType).toBe('adjustment');
    }
  });

  it('filters by date range', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/movements/timeline')
      .query({ fromDate: '2020-01-01', toDate: '2099-12-31' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('supports sort and order', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/movements/timeline')
      .query({ sort: 'quantityDelta', order: 'asc' });

    expect(res.status).toBe(200);
    expect(res.body.appliedSort).toEqual({ field: 'quantityDelta', order: 'asc' });
    const deltas = res.body.data.map((d: any) => d.quantityDelta);
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]).toBeGreaterThanOrEqual(deltas[i - 1]);
    }
  });

  it('supports cursor-based pagination with small limit', async () => {
    const page1 = await request(app)
      .get('/api/v1/inventory/movements/timeline')
      .query({ limit: 2 });

    expect(page1.status).toBe(200);
    expect(page1.body.data.length).toBe(2);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app)
      .get('/api/v1/inventory/movements/timeline')
      .query({ limit: 2, cursor: page1.body.nextCursor });

    expect(page2.status).toBe(200);
    expect(page2.body.data.length).toBeGreaterThanOrEqual(1);

    // Ensure no overlap between pages
    const page1Ids = page1.body.data.map((d: any) => d.id);
    const page2Ids = page2.body.data.map((d: any) => d.id);
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
  });

  it('rejects invalid movementType with 400', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/movements/timeline')
      .query({ movementType: 'invalid_type' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid sort field with 400', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/movements/timeline')
      .query({ sort: 'badField' });

    expect(res.status).toBe(400);
  });
});

// ── Reconciliation Endpoint ─────────────────────────────────────

describe('GET /api/v1/inventory/movements/reconciliation', () => {
  it('returns non-404 and cursor-paginated envelope', async () => {
    const res = await request(app).get('/api/v1/inventory/movements/reconciliation');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('nextCursor');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('appliedSort');
    expect(res.body).toHaveProperty('appliedFilters');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('returns correct aggregation fields', async () => {
    const res = await request(app).get('/api/v1/inventory/movements/reconciliation');

    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(item).toHaveProperty('skuId');
    expect(item).toHaveProperty('locationId');
    expect(item).toHaveProperty('expectedQuantityDelta');
    expect(item).toHaveProperty('movementRowCount');
    expect(item).toHaveProperty('firstMovementAt');
    expect(item).toHaveProperty('lastMovementAt');
  });

  it('filters by skuId', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/movements/reconciliation')
      .query({ skuId });

    expect(res.status).toBe(200);
    for (const item of res.body.data) {
      expect(item.skuId).toBe(skuId);
    }
    // SKU had +50 and -5 adjustments = net 45
    expect(res.body.data[0].expectedQuantityDelta).toBe(45);
    expect(res.body.data[0].movementRowCount).toBe(2);
  });

  it('supports sort and order', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/movements/reconciliation')
      .query({ sort: 'expectedQuantityDelta', order: 'desc' });

    expect(res.status).toBe(200);
    expect(res.body.appliedSort).toEqual({ field: 'expectedQuantityDelta', order: 'desc' });
    const deltas = res.body.data.map((d: any) => d.expectedQuantityDelta);
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]).toBeLessThanOrEqual(deltas[i - 1]);
    }
  });

  it('supports cursor-based pagination with small limit', async () => {
    const page1 = await request(app)
      .get('/api/v1/inventory/movements/reconciliation')
      .query({ limit: 1 });

    expect(page1.status).toBe(200);
    expect(page1.body.data.length).toBe(1);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app)
      .get('/api/v1/inventory/movements/reconciliation')
      .query({ limit: 1, cursor: page1.body.nextCursor });

    expect(page2.status).toBe(200);
    expect(page2.body.data.length).toBeGreaterThanOrEqual(1);

    // Ensure no overlap between pages (different sku+location combos)
    const page1Keys = page1.body.data.map((d: any) => `${d.skuId}|${d.locationId}`);
    const page2Keys = page2.body.data.map((d: any) => `${d.skuId}|${d.locationId}`);
    for (const key of page2Keys) {
      expect(page1Keys).not.toContain(key);
    }
  });

  it('rejects invalid sort with 400', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/movements/reconciliation')
      .query({ sort: 'invalidField' });

    expect(res.status).toBe(400);
  });
});
