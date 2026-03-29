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

const validSku = {
  brand: 'Nike',
  style: 'Air Max',
  color: 'Black',
  size: '9',
  price: 129.99,
  category: 560,
  department: 'FORMAL',
  vendorId: VENDOR_ID,
};

beforeEach(() => {
  resetDb();
  seedVendor();
});

afterAll(() => {
  resetDb();
});

describe('POST /api/v1/skus', () => {
  it('creates a SKU with valid data', async () => {
    const res = await request(app).post('/api/v1/skus').send(validSku);
    expect(res.status).toBe(201);
    expect(res.body.brand).toBe('Nike');
    expect(res.body.skuCode).toMatch(/^FORMAL-NIKE-BLA-9-\d{3}$/);
    expect(res.body.active).toBe(true);
    expect(res.body.currentStock).toBe(0);
  });

  it('rejects missing required fields', async () => {
    const res = await request(app).post('/api/v1/skus').send({ brand: 'Nike' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid category', async () => {
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, category: 100 });
    expect(res.status).toBe(400);
  });

  it('rejects invalid department', async () => {
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, department: 'INVALID' });
    expect(res.status).toBe(400);
  });

  it('rejects negative price', async () => {
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, price: -10 });
    expect(res.status).toBe(400);
  });

  it('rejects price with more than 2 decimal places', async () => {
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, price: 19.999 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts price with exactly 2 decimal places', async () => {
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, price: 19.99 });
    expect(res.status).toBe(201);
    expect(res.body.price).toBe(19.99);
  });

  it('accepts whole-dollar price', async () => {
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, price: 20.00 });
    expect(res.status).toBe(201);
    expect(res.body.price).toBe(20);
  });

  it('returns 409 for duplicate barcode', async () => {
    await request(app).post('/api/v1/skus').send({ ...validSku, barcode: 'UPC-001' });
    const res = await request(app).post('/api/v1/skus').send({ ...validSku, barcode: 'UPC-001', style: 'Different' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_BARCODE');
  });

  it('creates a SKU with optional heelType and material', async () => {
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
    const res = await request(app).post('/api/v1/skus').send(validSku);
    expect(res.status).toBe(201);
    expect(res.body.heelType).toBeNull();
    expect(res.body.material).toBeNull();
  });

  it('rejects invalid vendorId', async () => {
    const res = await request(app)
      .post('/api/v1/skus')
      .send({ ...validSku, vendorId: '00000000-0000-0000-0000-000000000099' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_VENDOR');
  });
});

describe('GET /api/v1/skus/:skuId', () => {
  it('returns a SKU by ID', async () => {
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
});

describe('PATCH /api/v1/skus/:skuId', () => {
  it('updates SKU fields', async () => {
    const created = await request(app).post('/api/v1/skus').send(validSku);
    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({ price: 149.99 });
    expect(res.status).toBe(200);
    expect(res.body.price).toBe(149.99);
    expect(res.body.skuCode).toBe(created.body.skuCode); // immutable
  });

  it('updates heelType and material', async () => {
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
    const created = await request(app).post('/api/v1/skus').send(validSku);
    const res = await request(app).patch(`/api/v1/skus/${created.body.id}`).send({ price: 19.999 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts price with exactly 2 decimal places on update', async () => {
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
    const sku1 = await request(app).post('/api/v1/skus').send({ ...validSku, barcode: 'BC-1' });
    const sku2 = await request(app).post('/api/v1/skus').send({ ...validSku, barcode: 'BC-2', style: 'Other' });
    const res = await request(app).patch(`/api/v1/skus/${sku2.body.id}`).send({ barcode: 'BC-1' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/v1/skus/:skuId', () => {
  it('soft-deletes a SKU', async () => {
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
});

describe('GET /api/v1/skus (list, search, filter)', () => {
  beforeEach(async () => {
    // Create a variety of SKUs for search/filter testing
    const skus = [
      { ...validSku, brand: 'Nike', style: 'Air Max', department: 'FORMAL', price: 120, size: '8', category: 560 },
      { ...validSku, brand: 'Nike', style: 'Dunk Low', department: 'CASUAL', price: 110, size: '9', category: 565 },
      { ...validSku, brand: 'Adidas', style: 'Samba', department: 'CASUAL', price: 100, size: '8', category: 565 },
      { ...validSku, brand: 'Adidas', style: 'Gazelle', department: 'FIESTA', price: 90, size: '7', category: 570 },
      { ...validSku, brand: 'Puma', style: 'Suede', department: 'BOOTS', price: 85, size: '10', category: 580 },
      { ...validSku, brand: 'Puma', style: 'RS-X', department: 'COMFORT', price: 130, size: '9.5', category: 590 },
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

  it('filters by brand', async () => {
    const res = await request(app).get('/api/v1/skus?brand=Nike');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((s: any) => s.brand === 'Nike')).toBe(true);
  });

  it('filters by department', async () => {
    const res = await request(app).get('/api/v1/skus?department=CASUAL');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((s: any) => s.department === 'CASUAL')).toBe(true);
  });

  it('filters by category', async () => {
    const res = await request(app).get('/api/v1/skus?category=565');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('filters by size', async () => {
    const res = await request(app).get('/api/v1/skus?size=8');
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
    // Should match "Air Max" via style field match in sku_code
  });

  it('combines multiple filters', async () => {
    const res = await request(app).get('/api/v1/skus?brand=Nike&department=CASUAL');
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
