import request from 'supertest';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';

const VENDOR_ID = '00000000-0000-0000-0000-000000000001';
const SKU_ID_1 = '11111111-1111-1111-1111-111111111111';
const SKU_ID_2 = '22222222-2222-2222-2222-222222222222';
const SIZE_ID_1 = '33333333-3333-3333-3333-333333333333';
const SIZE_ID_2 = '44444444-4444-4444-4444-444444444444';
const INV_ID_1 = '55555555-5555-5555-5555-555555555555';
const INV_ID_2 = '66666666-6666-6666-6666-666666666666';

function seedTestData(): void {
  const db = getDb();

  db.prepare(
    "INSERT OR IGNORE INTO vendors (id, name, contact_email) VALUES (?, 'Test Vendor', 'vendor@test.com')"
  ).run(VENDOR_ID);

  // Get reference IDs
  const brand = db.prepare("SELECT id FROM ref_brands WHERE code = 'KISS'").get() as { id: number } | undefined;
  const color = db.prepare("SELECT id FROM ref_colors WHERE code = 'BK'").get() as { id: number } | undefined;
  const category = db.prepare('SELECT id FROM ref_categories WHERE rics_code = 560').get() as { id: number } | undefined;

  const brandId = brand?.id ?? null;
  const colorId = color?.id ?? null;
  const categoryId = category?.id ?? null;

  // Insert two active SKUs
  db.prepare(`
    INSERT INTO skus (id, sku_code, style, price, department, vendor_id, brand_id, color_id, category_id, active, web_description, material)
    VALUES (?, 'TEST-001', 'Elegant Pump', 89.99, 'FORMAL', ?, ?, ?, ?, 1, 'A stylish formal pump', 'Leather')
  `).run(SKU_ID_1, VENDOR_ID, brandId, colorId, categoryId);

  db.prepare(`
    INSERT INTO skus (id, sku_code, style, price, department, vendor_id, brand_id, color_id, category_id, active, web_description)
    VALUES (?, 'TEST-002', 'Beach Sandal', 45.00, 'SANDALIAS', ?, ?, ?, ?, 1, 'Comfortable beach sandal')
  `).run(SKU_ID_2, VENDOR_ID, brandId, colorId, categoryId);

  // Add sizes to SKU 1
  db.prepare('INSERT INTO sku_sizes (id, sku_id, size_label, sort_order, active) VALUES (?, ?, ?, 1, 1)').run(SIZE_ID_1, SKU_ID_1, '8');
  db.prepare('INSERT INTO sku_sizes (id, sku_id, size_label, sort_order, active) VALUES (?, ?, ?, 2, 1)').run(SIZE_ID_2, SKU_ID_1, '9');

  // Add inventory for sizes
  db.prepare('INSERT INTO inventory (id, sku_id, sku_size_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, ?, 5, 0)').run(INV_ID_1, SKU_ID_1, SIZE_ID_1);
  db.prepare('INSERT INTO inventory (id, sku_id, sku_size_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, ?, 0, 0)').run(INV_ID_2, SKU_ID_1, SIZE_ID_2);

  // Add aggregate inventory for SKU 2 (no sizes)
  db.prepare("INSERT INTO inventory (id, sku_id, quantity_on_hand, quantity_reserved) VALUES ('77777777-7777-7777-7777-777777777777', ?, 10, 0)").run(SKU_ID_2);
}

beforeEach(() => {
  resetDb();
  seedTestData();
});

afterAll(() => {
  resetDb();
});

// ── GET /api/public/products ───────────────────────────────────────

describe('GET /api/public/products', () => {
  it('returns paginated product list', async () => {
    const res = await request(app).get('/api/public/products');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.totalItems).toBe(2);
  });

  it('returns product cards with expected fields', async () => {
    const res = await request(app).get('/api/public/products');
    const product = res.body.data[0];
    expect(product).toHaveProperty('id');
    expect(product).toHaveProperty('name');
    expect(product).toHaveProperty('brand');
    expect(product).toHaveProperty('price');
    expect(product).toHaveProperty('mainImage');
    expect(product).toHaveProperty('colorSwatches');
    expect(product).toHaveProperty('department');
  });

  it('filters by department', async () => {
    const res = await request(app).get('/api/public/products?department=FORMAL');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].department).toBe('FORMAL');
  });

  it('filters by price range', async () => {
    const res = await request(app).get('/api/public/products?minPrice=50&maxPrice=100');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].price).toBe(89.99);
  });

  it('filters by size label', async () => {
    const res = await request(app).get('/api/public/products?sizeLabel=8');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(SKU_ID_1);
  });

  it('sorts by price ascending', async () => {
    const res = await request(app).get('/api/public/products?sort=price&order=asc');
    expect(res.status).toBe(200);
    expect(res.body.data[0].price).toBeLessThanOrEqual(res.body.data[1].price);
  });

  it('sorts by price descending', async () => {
    const res = await request(app).get('/api/public/products?sort=price&order=desc');
    expect(res.status).toBe(200);
    expect(res.body.data[0].price).toBeGreaterThanOrEqual(res.body.data[1].price);
  });

  it('paginates correctly', async () => {
    const res = await request(app).get('/api/public/products?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination.totalPages).toBe(2);
    expect(res.body.pagination.totalItems).toBe(2);
  });

  it('searches by query string', async () => {
    const res = await request(app).get('/api/public/products?q=Elegant');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Elegant Pump');
  });

  it('returns empty for non-matching filters', async () => {
    const res = await request(app).get('/api/public/products?minPrice=1000');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
    expect(res.body.pagination.totalItems).toBe(0);
  });

  it('rejects invalid sort value', async () => {
    const res = await request(app).get('/api/public/products?sort=invalid');
    expect(res.status).toBe(400);
  });

  it('rejects page less than 1', async () => {
    const res = await request(app).get('/api/public/products?page=0');
    expect(res.status).toBe(400);
  });
});

// ── GET /api/public/products/:id ───────────────────────────────────

describe('GET /api/public/products/:productId', () => {
  it('returns product detail with all fields', async () => {
    const res = await request(app).get(`/api/public/products/${SKU_ID_1}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(SKU_ID_1);
    expect(res.body.name).toBe('Elegant Pump');
    expect(res.body.price).toBe(89.99);
    expect(res.body.description).toBe('A stylish formal pump');
    expect(res.body.availableSizes).toBeInstanceOf(Array);
    expect(res.body.availableSizes.length).toBe(2);
    expect(res.body.specs).toBeDefined();
  });

  it('includes size stock availability', async () => {
    const res = await request(app).get(`/api/public/products/${SKU_ID_1}`);
    const size8 = res.body.availableSizes.find((s: any) => s.label === '8');
    const size9 = res.body.availableSizes.find((s: any) => s.label === '9');
    expect(size8.inStock).toBe(true);
    expect(size9.inStock).toBe(false);
  });

  it('returns 404 for non-existent product', async () => {
    const res = await request(app).get('/api/public/products/99999999-9999-9999-9999-999999999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await request(app).get('/api/public/products/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });
});

// ── GET /api/public/products/facets ────────────────────────────────

describe('GET /api/public/products/facets', () => {
  it('returns all facet categories', async () => {
    const res = await request(app).get('/api/public/products/facets');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('brands');
    expect(res.body).toHaveProperty('colors');
    expect(res.body).toHaveProperty('sizes');
    expect(res.body).toHaveProperty('categories');
    expect(res.body).toHaveProperty('departments');
    expect(res.body).toHaveProperty('materials');
    expect(res.body).toHaveProperty('priceRange');
  });

  it('returns correct department counts', async () => {
    const res = await request(app).get('/api/public/products/facets');
    const formal = res.body.departments.find((d: any) => d.name === 'FORMAL');
    const sandalias = res.body.departments.find((d: any) => d.name === 'SANDALIAS');
    expect(formal.count).toBe(1);
    expect(sandalias.count).toBe(1);
  });

  it('returns correct price range', async () => {
    const res = await request(app).get('/api/public/products/facets');
    expect(res.body.priceRange.min).toBe(45);
    expect(res.body.priceRange.max).toBe(89.99);
  });

  it('returns size facets from sku_sizes', async () => {
    const res = await request(app).get('/api/public/products/facets');
    expect(res.body.sizes.length).toBeGreaterThanOrEqual(1);
    const size8 = res.body.sizes.find((s: any) => s.label === '8');
    expect(size8).toBeDefined();
    expect(size8.count).toBe(1);
  });
});
