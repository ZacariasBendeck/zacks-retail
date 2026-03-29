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

/** Look up a reference ID by table and field value. */
function getRefId(table: string, field: string, value: string | number): number | null {
  const db = getDb();
  const row = db.prepare(`SELECT id FROM ${table} WHERE ${field} = ?`).get(value) as { id: number } | undefined;
  return row ? row.id : null;
}

function getBrandId(code: string): number | null { return getRefId('ref_brands', 'code', code); }
function getColorId(code: string): number | null { return getRefId('ref_colors', 'code', code); }
function getCategoryId(ricsCode: number): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(ricsCode) as { id: number } | undefined;
  return row ? row.id : null;
}

function makeValidSku() {
  return {
    style: 'Air Max',
    price: 129.99,
    department: 'FORMAL' as const,
    vendorId: VENDOR_ID,
    brandId: getBrandId('KISS'),
    colorId: getColorId('BK'),
    categoryId: getCategoryId(560),
    sizes: ['9'],
  };
}

beforeEach(() => {
  resetDb();
  seedVendor();
});

afterAll(() => {
  resetDb();
});

describe('POST /api/v1/skus', () => {
  it('creates a SKU with valid data', async () => {
    const validSku = makeValidSku();
    const res = await request(app).post('/api/v1/skus').send(validSku);
    expect(res.status).toBe(201);
    expect(res.body.brandId).toBe(validSku.brandId);
    expect(res.body.skuCode).toMatch(/^FORMAL-KISS-BK-\d{3}$/);
    expect(res.body.active).toBe(true);
    expect(res.body.currentStock).toBe(0);
  });

  it('rejects missing required fields', async () => {
    const res = await request(app).post('/api/v1/skus').send({ brandId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid department', async () => {
    const validSku = makeValidSku();
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, department: 'INVALID' });
    expect(res.status).toBe(400);
  });

  it('rejects negative price', async () => {
    const validSku = makeValidSku();
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, price: -10 });
    expect(res.status).toBe(400);
  });

  it('rejects price with more than 2 decimal places', async () => {
    const validSku = makeValidSku();
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, price: 19.999 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts price with exactly 2 decimal places', async () => {
    const validSku = makeValidSku();
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, price: 19.99 });
    expect(res.status).toBe(201);
    expect(res.body.price).toBe(19.99);
  });

  it('accepts whole-dollar price', async () => {
    const validSku = makeValidSku();
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, price: 20.00 });
    expect(res.status).toBe(201);
    expect(res.body.price).toBe(20);
  });

  it('returns 409 for duplicate barcode', async () => {
    const validSku = makeValidSku();
    await request(app).post('/api/v1/skus').send({ ...validSku, barcode: 'UPC-001' });
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, barcode: 'UPC-001', style: 'Different' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_BARCODE');
  });

  it('creates a SKU with optional heelType and material', async () => {
    const validSku = makeValidSku();
    const res = await request(app).post('/api/v1/skus').send({
      ...validSku,
      heelType: 'Stiletto',
      material: 'Leather',
    });
    expect(res.status).toBe(201);
    expect(res.body.heelType).toBe('Stiletto');
    expect(res.body.material).toBe('Leather');
  });

  it('creates a SKU without heelType and material (defaults to null)', async () => {
    const validSku = makeValidSku();
    const res = await request(app).post('/api/v1/skus').send(validSku);
    expect(res.status).toBe(201);
    expect(res.body.heelType).toBeNull();
    expect(res.body.material).toBeNull();
  });

  it('rejects invalid vendorId', async () => {
    const validSku = makeValidSku();
    const res = await request(app)
      .post('/api/v1/skus')
      .send({ ...validSku, vendorId: '00000000-0000-0000-0000-000000000099' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_VENDOR');
  });

  it('auto-creates inventory record with on_hand=0 and reserved=0', async () => {
    const validSku = makeValidSku();
    const created = await request(app).post('/api/v1/skus').send(validSku);
    expect(created.status).toBe(201);
    expect(created.body.currentStock).toBe(0);

    // Verify inventory record exists via GET
    const fetched = await request(app).get(`/api/v1/skus/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.currentStock).toBe(0);

    // Verify directly in DB
    const db = getDb();
    const inv = db.prepare('SELECT * FROM inventory WHERE sku_id = ?').get(created.body.id) as any;
    expect(inv).toBeTruthy();
    expect(inv.quantity_on_hand).toBe(0);
    expect(inv.quantity_reserved).toBe(0);
  });

  it('generates incrementing SKU code sequences (001, 002)', async () => {
    const validSku = makeValidSku();
    const sku1 = await request(app).post('/api/v1/skus').send(validSku);
    const sku2 = await request(app).post('/api/v1/skus').send(validSku);
    expect(sku1.status).toBe(201);
    expect(sku2.status).toBe(201);
    expect(sku1.body.skuCode).toMatch(/-001$/);
    expect(sku2.body.skuCode).toMatch(/-002$/);
  });
});

describe('GET /api/v1/skus/:skuId', () => {
  it('returns a SKU by ID', async () => {
    const validSku = makeValidSku();
    const created = await request(app).post('/api/v1/skus').send(validSku);
    const res = await request(app).get(`/api/v1/skus/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.currentStock).toBe(0);
  });

  it('returns 404 for missing SKU', async () => {
    const res = await request(app).get('/api/v1/skus/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid UUID param on GET', async () => {
    const res = await request(app).get('/api/v1/skus/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });
});

describe('PATCH /api/v1/skus/:skuId', () => {
  it('updates SKU fields', async () => {
    const validSku = makeValidSku();
    const created = await request(app).post('/api/v1/skus').send(validSku);
    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({ price: 149.99 });
    expect(res.status).toBe(200);
    expect(res.body.price).toBe(149.99);
    expect(res.body.skuCode).toBe(created.body.skuCode); // immutable
  });

  it('rejects skuCode in PATCH body (immutable field)', async () => {
    const validSku = makeValidSku();
    const created = await request(app).post('/api/v1/skus').send(validSku);
    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({ skuCode: 'HACKED-CODE' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty PATCH body', async () => {
    const validSku = makeValidSku();
    const created = await request(app).post('/api/v1/skus').send(validSku);
    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMPTY_BODY');
  });

  it('returns 400 for invalid UUID param on PATCH', async () => {
    const res = await request(app).patch('/api/v1/skus/not-a-uuid').send({ price: 50 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('updates heelType and material', async () => {
    const validSku = makeValidSku();
    const created = await request(app).post('/api/v1/skus').send(validSku);
    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({
      heelType: 'Block',
      material: 'Suede',
    });
    expect(res.status).toBe(200);
    expect(res.body.heelType).toBe('Block');
    expect(res.body.material).toBe('Suede');
  });

  it('rejects price with more than 2 decimal places on update', async () => {
    const validSku = makeValidSku();
    const created = await request(app).post('/api/v1/skus').send(validSku);
    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({ price: 19.999 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts price with exactly 2 decimal places on update', async () => {
    const validSku = makeValidSku();
    const created = await request(app).post('/api/v1/skus').send(validSku);
    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({ price: 19.99 });
    expect(res.status).toBe(200);
    expect(res.body.price).toBe(19.99);
  });

  it('returns 404 for missing SKU', async () => {
    const res = await request(app).patch('/api/v1/skus/00000000-0000-0000-0000-000000000099').send({ price: 50 });
    expect(res.status).toBe(404);
  });

  it('returns 409 for duplicate barcode on update', async () => {
    const validSku = makeValidSku();
    const sku1 = await request(app).post('/api/v1/skus').send({ ...validSku, barcode: 'BC-1' });
    const sku2 = await request(app).post('/api/v1/skus').send({ ...validSku, barcode: 'BC-2', style: 'Other' });
    const res = await request(app).patch(`/api/v1/skus/${sku2.body.id}`).send({ barcode: 'BC-1' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/v1/skus/:skuId', () => {
  it('soft-deletes a SKU', async () => {
    const validSku = makeValidSku();
    const created = await request(app).post('/api/v1/skus').send(validSku);
    const res = await request(app).delete(`/api/v1/skus/${created.body.id}`);
    expect(res.status).toBe(204);

    const fetched = await request(app).get(`/api/v1/skus/${created.body.id}`);
    expect(fetched.body.active).toBe(false);
  });

  it('returns 404 for missing SKU', async () => {
    const res = await request(app).delete('/api/v1/skus/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid UUID param on DELETE', async () => {
    const res = await request(app).delete('/api/v1/skus/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });
});

describe('GET /api/v1/skus (list, search, filter)', () => {
  let kissId: number;
  let flexId: number;
  let reveId: number;
  let cat560Id: number;
  let cat565Id: number;

  beforeEach(async () => {
    kissId = getBrandId('KISS')!;
    flexId = getBrandId('FLEX')!;
    reveId = getBrandId('REVE')!;
    cat560Id = getCategoryId(560)!;
    cat565Id = getCategoryId(565)!;
    const bkId = getColorId('BK')!;
    const rdId = getColorId('RD')!;
    const beId = getColorId('BE')!;

    // Create a variety of SKUs for search/filter testing
    const skus = [
      { style: 'Air Max', department: 'FORMAL', price: 120, brandId: kissId, colorId: bkId, categoryId: cat560Id, sizes: ['8'], vendorId: VENDOR_ID },
      { style: 'Dunk Low', department: 'CASUAL', price: 110, brandId: kissId, colorId: rdId, categoryId: cat565Id, sizes: ['9'], vendorId: VENDOR_ID },
      { style: 'Samba', department: 'CASUAL', price: 100, brandId: flexId, colorId: bkId, categoryId: cat565Id, sizes: ['8'], vendorId: VENDOR_ID },
      { style: 'Gazelle', department: 'FIESTA', price: 90, brandId: flexId, colorId: beId, categoryId: getCategoryId(570), sizes: ['7'], vendorId: VENDOR_ID },
      { style: 'Suede', department: 'BOOTS', price: 85, brandId: reveId, colorId: bkId, categoryId: getCategoryId(580), sizes: ['10'], vendorId: VENDOR_ID },
      { style: 'RS-X', department: 'COMFORT', price: 130, brandId: reveId, colorId: rdId, categoryId: getCategoryId(590), sizes: ['9.5'], vendorId: VENDOR_ID },
    ];
    for (const sku of skus) {
      await request(app).post('/api/v1/skus').send(sku);
    }
  });

  it('returns all active SKUs with default pagination', async () => {
    const res = await request(app).get('/api/v1/skus');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(6);
    expect(res.body.pagination.totalItems).toBe(6);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.pageSize).toBe(50);
  });

  it('paginates results', async () => {
    const res = await request(app).get('/api/v1/skus?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.totalItems).toBe(6);
    expect(res.body.pagination.totalPages).toBe(3);
  });

  it('filters by brandId', async () => {
    const res = await request(app).get(`/api/v1/skus?brandId=${kissId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((s: any) => s.brandId === kissId)).toBe(true);
  });

  it('filters by department', async () => {
    const res = await request(app).get('/api/v1/skus?department=CASUAL');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((s: any) => s.department === 'CASUAL')).toBe(true);
  });

  it('filters by categoryId', async () => {
    const res = await request(app).get(`/api/v1/skus?categoryId=${cat565Id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('filters by price range', async () => {
    const res = await request(app).get('/api/v1/skus?minPrice=100&maxPrice=120');
    expect(res.status).toBe(200);
    expect(res.body.data.every((s: any) => s.price >= 100 && s.price <= 120)).toBe(true);
    expect(res.body.data.length).toBe(3);
  });

  it('performs full-text search with q parameter', async () => {
    const res = await request(app).get('/api/v1/skus?q=air');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    // Should match "Air Max" via style field
  });

  it('combines multiple filters', async () => {
    const res = await request(app).get(`/api/v1/skus?brandId=${kissId}&department=CASUAL`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].style).toBe('Dunk Low');
  });

  it('sorts by price ascending', async () => {
    const res = await request(app).get('/api/v1/skus?sort=price&order=asc');
    expect(res.status).toBe(200);
    const prices = res.body.data.map((s: any) => s.price);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  it('sorts by price descending', async () => {
    const res = await request(app).get('/api/v1/skus?sort=price&order=desc');
    expect(res.status).toBe(200);
    const prices = res.body.data.map((s: any) => s.price);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
    }
  });

  it('hides inactive SKUs by default', async () => {
    const all = await request(app).get('/api/v1/skus');
    const firstId = all.body.data[0].id;
    await request(app).delete(`/api/v1/skus/${firstId}`);

    const res = await request(app).get('/api/v1/skus');
    expect(res.body.data.length).toBe(5);

    const withInactive = await request(app).get('/api/v1/skus?active=false');
    expect(withInactive.body.data.length).toBe(1);
  });

  it('rejects pageSize > 200', async () => {
    const res = await request(app).get('/api/v1/skus?pageSize=500');
    expect(res.status).toBe(400);
  });

  it('rejects invalid sort field', async () => {
    const res = await request(app).get('/api/v1/skus?sort=invalidField');
    expect(res.status).toBe(400);
  });
});
