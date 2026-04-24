import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';
import { prisma } from '../src/db/prisma';
import {
  cleanupMirroredInventoryState,
  cleanupMirroredInventoryStateByLegacySkuCodes,
  ensureInventoryAuditLogTablePresent,
} from './utils/postgresInventoryTestHelpers';

jest.setTimeout(30000);

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
let mirroredSkuIds: string[] = [];
let mirroredLegacySkuCodes: string[] = [];

function seedLegacyVendor(): string {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    "INSERT INTO vendors (id, name, contact_email, payment_terms, lead_time_days, active) VALUES (?, ?, ?, 'NET_30', 14, 1)"
  ).run(id, 'Test Vendor Adjustments', 'test@adjustments.com');
  return id;
}

async function seedOnHandViaMutation(skuId: string, quantityDelta: number, sourceId: string): Promise<void> {
  const response = await request(app).post('/api/v1/inventory/mutations/receive').send({
    skuId,
    quantityDelta,
    reasonCode: 'Test setup',
    categoryCode: 560,
    sourceDocumentRef: { type: 'INITIAL_IMPORT', id: sourceId },
    actorId: uuidv4(),
    idempotencyKey: uuidv4(),
  });

  if (response.status !== 200) {
    throw new Error(`Failed to seed on-hand for ${skuId}: ${response.status}`);
  }
}

async function seedVendorAndSkus() {
  vendorId = seedLegacyVendor();

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
  mirroredLegacySkuCodes = [sku1.body.skuCode, sku2.body.skuCode].filter(Boolean);
  await cleanupMirroredInventoryStateByLegacySkuCodes(mirroredLegacySkuCodes);
  mirroredSkuIds = [skuId1, skuId2];

  await seedOnHandViaMutation(skuId1, 50, `SETUP-${skuId1}`);
  await seedOnHandViaMutation(skuId2, 30, `SETUP-${skuId2}`);
}

beforeEach(async () => {
  await ensureInventoryAuditLogTablePresent();
  await cleanupMirroredInventoryStateByLegacySkuCodes(mirroredLegacySkuCodes);
  await cleanupMirroredInventoryState(mirroredSkuIds);
  mirroredSkuIds = [];
  mirroredLegacySkuCodes = [];
  resetDb();
  await seedVendorAndSkus();
});

afterAll(async () => {
  await ensureInventoryAuditLogTablePresent();
  await cleanupMirroredInventoryStateByLegacySkuCodes(mirroredLegacySkuCodes);
  await cleanupMirroredInventoryState(mirroredSkuIds);
  await prisma.$disconnect();
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
