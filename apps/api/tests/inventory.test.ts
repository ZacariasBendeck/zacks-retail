import request from 'supertest';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';

const VENDOR_ID = '00000000-0000-0000-0000-000000000001';

function seedVendor(): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO vendors (id, name, contact_email) VALUES (?, 'Test Vendor', 'vendor@test.com')"
  ).run(VENDOR_ID);
}

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

const validSku = {
  style: 'Air Max',
  price: 129.99,
  department: 'FORMAL',
  vendorId: VENDOR_ID,
  get categoryId() { return getCategoryId(560); },
  get brandId() { return getBrandId('KISS'); },
  get colorId() { return getColorId('BK'); },
};

let createdSkuId: string;

beforeEach(async () => {
  resetDb();
  seedVendor();
  const res = await request(app).post('/api/v1/skus').send(validSku);
  createdSkuId = res.body.id;
});

afterAll(() => {
  resetDb();
});

describe('GET /api/v1/skus/:skuId/inventory', () => {
  it('returns current stock level for a SKU', async () => {
    const res = await request(app).get(`/api/v1/skus/${createdSkuId}/inventory`);
    expect(res.status).toBe(200);
    expect(res.body.skuId).toBe(createdSkuId);
    expect(res.body.quantityOnHand).toBe(0);
    expect(res.body.quantityReserved).toBe(0);
    expect(res.body.quantityAvailable).toBe(0);
  });

  it('returns 404 for missing SKU', async () => {
    const res = await request(app).get('/api/v1/skus/00000000-0000-0000-0000-000000000099/inventory');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/skus/:skuId/inventory/adjustments', () => {
  it('adds stock with a positive adjustment', async () => {
    const res = await request(app)
      .post(`/api/v1/skus/${createdSkuId}/inventory/adjustments`)
      .send({ adjustment: 50, reason: 'Initial stock receipt' });

    expect(res.status).toBe(200);
    expect(res.body.inventory.quantityOnHand).toBe(50);
    expect(res.body.auditEntry.adjustment).toBe(50);
    expect(res.body.auditEntry.reason).toBe('Initial stock receipt');
    expect(res.body.auditEntry.resultingBalance).toBe(50);
    expect(res.body.auditEntry.performedBy).toBe('system');
  });

  it('removes stock with a negative adjustment', async () => {
    await request(app)
      .post(`/api/v1/skus/${createdSkuId}/inventory/adjustments`)
      .send({ adjustment: 100, reason: 'Restock' });

    const res = await request(app)
      .post(`/api/v1/skus/${createdSkuId}/inventory/adjustments`)
      .send({ adjustment: -30, reason: 'Sold 30 units' });

    expect(res.status).toBe(200);
    expect(res.body.inventory.quantityOnHand).toBe(70);
    expect(res.body.auditEntry.adjustment).toBe(-30);
    expect(res.body.auditEntry.resultingBalance).toBe(70);
  });

  it('records performedBy when provided', async () => {
    const res = await request(app)
      .post(`/api/v1/skus/${createdSkuId}/inventory/adjustments`)
      .send({ adjustment: 10, reason: 'Manual count', performedBy: 'john.doe' });

    expect(res.status).toBe(200);
    expect(res.body.auditEntry.performedBy).toBe('john.doe');
  });

  it('rejects adjustment that would bring quantity below zero', async () => {
    const res = await request(app)
      .post(`/api/v1/skus/${createdSkuId}/inventory/adjustments`)
      .send({ adjustment: -1, reason: 'Should fail' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('rejects zero adjustment', async () => {
    const res = await request(app)
      .post(`/api/v1/skus/${createdSkuId}/inventory/adjustments`)
      .send({ adjustment: 0, reason: 'No change' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing reason', async () => {
    const res = await request(app)
      .post(`/api/v1/skus/${createdSkuId}/inventory/adjustments`)
      .send({ adjustment: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-integer adjustment', async () => {
    const res = await request(app)
      .post(`/api/v1/skus/${createdSkuId}/inventory/adjustments`)
      .send({ adjustment: 10.5, reason: 'Partial?' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for missing SKU', async () => {
    const res = await request(app)
      .post('/api/v1/skus/00000000-0000-0000-0000-000000000099/inventory/adjustments')
      .send({ adjustment: 10, reason: 'Test' });

    expect(res.status).toBe(404);
  });

  it('allows adjustment down to exactly zero', async () => {
    await request(app)
      .post(`/api/v1/skus/${createdSkuId}/inventory/adjustments`)
      .send({ adjustment: 25, reason: 'Add stock' });

    const res = await request(app)
      .post(`/api/v1/skus/${createdSkuId}/inventory/adjustments`)
      .send({ adjustment: -25, reason: 'Remove all stock' });

    expect(res.status).toBe(200);
    expect(res.body.inventory.quantityOnHand).toBe(0);
  });
});

describe('GET /api/v1/skus/:skuId/inventory/audit-log', () => {
  beforeEach(async () => {
    const adjustments = [
      { adjustment: 100, reason: 'Initial receipt' },
      { adjustment: -20, reason: 'Sold 20 pairs' },
      { adjustment: 50, reason: 'Restock from vendor' },
      { adjustment: -5, reason: 'Damaged goods' },
    ];
    for (const adj of adjustments) {
      await request(app)
        .post(`/api/v1/skus/${createdSkuId}/inventory/adjustments`)
        .send(adj);
    }
  });

  it('returns audit log entries in descending order', async () => {
    const res = await request(app).get(`/api/v1/skus/${createdSkuId}/inventory/audit-log`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(4);
    expect(res.body.pagination.totalItems).toBe(4);

    // Most recent first
    expect(res.body.data[0].reason).toBe('Damaged goods');
    expect(res.body.data[3].reason).toBe('Initial receipt');
  });

  it('shows correct resulting balances', async () => {
    const res = await request(app).get(`/api/v1/skus/${createdSkuId}/inventory/audit-log`);
    const balances = res.body.data.map((e: any) => e.resultingBalance);
    // Most recent first: 125 (100-20+50-5), 130 (100-20+50), 80 (100-20), 100
    expect(balances).toEqual([125, 130, 80, 100]);
  });

  it('each entry has timestamp, performedBy, adjustment, reason, and resultingBalance', async () => {
    const res = await request(app).get(`/api/v1/skus/${createdSkuId}/inventory/audit-log`);
    const entry = res.body.data[0];
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('skuId');
    expect(entry).toHaveProperty('adjustment');
    expect(entry).toHaveProperty('reason');
    expect(entry).toHaveProperty('resultingBalance');
    expect(entry).toHaveProperty('performedBy');
    expect(entry).toHaveProperty('createdAt');
  });

  it('paginates audit log', async () => {
    const res = await request(app).get(`/api/v1/skus/${createdSkuId}/inventory/audit-log?page=1&pageSize=2`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.totalItems).toBe(4);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  it('returns 404 for missing SKU', async () => {
    const res = await request(app).get('/api/v1/skus/00000000-0000-0000-0000-000000000099/inventory/audit-log');
    expect(res.status).toBe(404);
  });

  it('returns empty audit log for SKU with no adjustments', async () => {
    // Create a fresh SKU
    const newSku = await request(app).post('/api/v1/skus').send({ ...validSku, style: 'Fresh', brandId: getBrandId('FLEX'), colorId: getColorId('WH') });
    const res = await request(app).get(`/api/v1/skus/${newSku.body.id}/inventory/audit-log`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
    expect(res.body.pagination.totalItems).toBe(0);
  });
});
