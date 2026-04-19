import request from 'supertest';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';

function getCategoryId(ricsCode: number): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(ricsCode) as { id: number } | undefined;
  return row ? row.id : null;
}

function getFirstBrandId(): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_brands LIMIT 1').get() as { id: number } | undefined;
  return row ? row.id : null;
}

function getColorId(offset: number): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_colors LIMIT 1 OFFSET ?').get(offset) as { id: number } | undefined;
  return row ? row.id : null;
}

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  resetDb();
});

// ── Helper: seed vendors ──────────────────────────────────────────
async function seedVendors(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const res = await request(app).post('/api/v1/vendors').send({
      name: `Vendor ${String.fromCharCode(65 + i)}`,
      contactEmail: `vendor${String.fromCharCode(97 + i)}@test.com`,
      paymentTerms: 'NET_30',
      leadTimeDays: (count - i) * 5,
    });
    ids.push(res.body.id);
  }
  return ids;
}

// ── Helper: seed SKUs ──────────────────────────────────────────────
async function seedSkus(vendorId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  const catId = getCategoryId(560);
  const brandId = getFirstBrandId();
  for (let i = 0; i < count; i++) {
    const colorId = getColorId(i);
    const res = await request(app).post('/api/v1/skus').send({
      style: `Style ${String.fromCharCode(65 + i)}`,
      price: 50 + i * 10,
      department: 'FORMAL',
      categoryId: catId,
      vendorId,
      brandId,
      colorId,
    });
    ids.push(res.body.id);
  }
  return ids;
}

// ── VENDOR LIST: sort, order, pagination bounds ───────────────────
describe('GET /api/v1/vendors — server-side table contract', () => {
  beforeEach(async () => {
    await seedVendors(5);
  });

  it('sorts by name ASC (default)', async () => {
    const res = await request(app).get('/api/v1/vendors');
    expect(res.status).toBe(200);
    const names = res.body.data.map((v: any) => v.name);
    expect(names).toEqual([...names].sort());
  });

  it('sorts by name DESC', async () => {
    const res = await request(app).get('/api/v1/vendors?sort=name&order=desc');
    expect(res.status).toBe(200);
    const names = res.body.data.map((v: any) => v.name);
    expect(names).toEqual([...names].sort().reverse());
  });

  it('sorts by leadTimeDays ASC', async () => {
    const res = await request(app).get('/api/v1/vendors?sort=leadTimeDays&order=asc');
    expect(res.status).toBe(200);
    const ltds = res.body.data.map((v: any) => v.leadTimeDays);
    for (let i = 1; i < ltds.length; i++) {
      expect(ltds[i]).toBeGreaterThanOrEqual(ltds[i - 1]);
    }
  });

  it('returns stable pagination metadata', async () => {
    const res = await request(app).get('/api/v1/vendors?page=2&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination).toMatchObject({
      page: 2,
      pageSize: 2,
      totalItems: 5,
      totalPages: 3,
    });
  });

  it('returns empty data for page beyond total', async () => {
    const res = await request(app).get('/api/v1/vendors?page=99');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
    expect(res.body.pagination.totalItems).toBe(5);
  });

  it('rejects invalid sort field', async () => {
    const res = await request(app).get('/api/v1/vendors?sort=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid order value', async () => {
    const res = await request(app).get('/api/v1/vendors?order=random');
    expect(res.status).toBe(400);
  });

  it('rejects page < 1', async () => {
    const res = await request(app).get('/api/v1/vendors?page=0');
    expect(res.status).toBe(400);
  });

  it('rejects pageSize > 200', async () => {
    const res = await request(app).get('/api/v1/vendors?pageSize=201');
    expect(res.status).toBe(400);
  });
});

// ── PURCHASE ORDER LIST: sort, order ──────────────────────────────
describe('GET /api/v1/purchase-orders — sort/order', () => {
  let vendorId: string;

  beforeEach(async () => {
    const vendor = await request(app).post('/api/v1/vendors').send({ name: 'Test Vendor', contactEmail: 'test@vendor.com', paymentTerms: 'NET_30', leadTimeDays: 14 });
    vendorId = vendor.body.id;
    const catId = getCategoryId(560);
    const brandId = getFirstBrandId();

    // Create 3 SKUs
    const skuIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const colorId = getColorId(i);
      const sku = await request(app).post('/api/v1/skus').send({
        style: `PO Style ${i}`,
        price: 100 + i * 10,
        department: 'FORMAL',
        categoryId: catId,
        vendorId,
        brandId,
        colorId,
      });
      skuIds.push(sku.body.id);
    }

    // Create 3 POs
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/v1/purchase-orders').send({
        vendorId,
        lineItems: [{ skuId: skuIds[i], quantity: 10, unitCost: 50 }],
        notes: `PO note ${i}`,
      });
    }
  });

  it('sorts by poNumber ASC', async () => {
    const res = await request(app).get('/api/v1/purchase-orders?sort=poNumber&order=asc');
    expect(res.status).toBe(200);
    const poNumbers = res.body.data.map((po: any) => po.poNumber);
    expect(poNumbers).toEqual([...poNumbers].sort());
  });

  it('sorts by createdAt DESC (default)', async () => {
    const res = await request(app).get('/api/v1/purchase-orders');
    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBe(3);
  });

  it('rejects invalid sort field', async () => {
    const res = await request(app).get('/api/v1/purchase-orders?sort=badField');
    expect(res.status).toBe(400);
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/v1/purchase-orders?status=DRAFT');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    res.body.data.forEach((po: any) => expect(po.status).toBe('DRAFT'));
  });

  it('returns empty for non-matching status filter', async () => {
    const res = await request(app).get('/api/v1/purchase-orders?status=CLOSED');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });
});

// ── OTB BUDGET LIST: sort/order ───────────────────────────────────
describe('GET /api/v1/otb-budgets — sort/order', () => {
  beforeEach(async () => {
    const depts = ['FORMAL', 'CASUAL', 'BOOTS'] as const;
    for (const dept of depts) {
      await request(app).post('/api/v1/otb-budgets').send({
        department: dept,
        year: 2026,
        month: 3,
        plannedBudget: dept === 'FORMAL' ? 50000 : dept === 'CASUAL' ? 30000 : 20000,
      });
    }
  });

  it('sorts by plannedBudget ASC', async () => {
    const res = await request(app).get('/api/v1/otb-budgets?sort=plannedBudget&order=asc');
    expect(res.status).toBe(200);
    const budgets = res.body.data.map((b: any) => b.plannedBudget);
    for (let i = 1; i < budgets.length; i++) {
      expect(budgets[i]).toBeGreaterThanOrEqual(budgets[i - 1]);
    }
  });

  it('sorts by department DESC', async () => {
    const res = await request(app).get('/api/v1/otb-budgets?sort=department&order=desc');
    expect(res.status).toBe(200);
    const depts = res.body.data.map((b: any) => b.department);
    expect(depts).toEqual([...depts].sort().reverse());
  });

  it('rejects invalid sort field', async () => {
    const res = await request(app).get('/api/v1/otb-budgets?sort=invalid');
    expect(res.status).toBe(400);
  });
});

// ── ADJUSTMENT LIST: sort/order ───────────────────────────────────
describe('GET /api/v1/inventory/adjustments — sort/order', () => {
  it('rejects invalid sort field', async () => {
    const res = await request(app).get('/api/v1/inventory/adjustments?sort=badField');
    expect(res.status).toBe(400);
  });

  it('accepts valid sort field', async () => {
    const res = await request(app).get('/api/v1/inventory/adjustments?sort=type&order=asc');
    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
  });

  it('rejects invalid adjustment type filter', async () => {
    const res = await request(app).get('/api/v1/inventory/adjustments?type=INVALID');
    expect(res.status).toBe(400);
  });
});

// ── DASHBOARD LOW-STOCK: sort/order ───────────────────────────────
describe('GET /api/v1/dashboard/low-stock — sort/order', () => {
  let vendorId: string;

  beforeEach(async () => {
    const vendor = await request(app).post('/api/v1/vendors').send({ name: 'Low Stock Vendor', contactEmail: 'lowstock@test.com', paymentTerms: 'NET_30', leadTimeDays: 14 });
    vendorId = vendor.body.id;
    // Create SKUs with no inventory (default 0 stock)
    await seedSkus(vendorId, 3);
  });

  it('returns paginated low-stock items with sort', async () => {
    const res = await request(app).get('/api/v1/dashboard/low-stock?sort=skuCode&order=asc&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.pageSize).toBe(2);
  });

  it('sorts by department', async () => {
    const res = await request(app).get('/api/v1/dashboard/low-stock?sort=department&order=asc');
    expect(res.status).toBe(200);
  });

  it('rejects invalid sort field', async () => {
    const res = await request(app).get('/api/v1/dashboard/low-stock?sort=invalid');
    expect(res.status).toBe(400);
  });
});

// ── REPORT ENDPOINTS: pagination + sort on detail views ───────────
describe('Report endpoints — server-side pagination', () => {
  let vendorId: string;

  beforeEach(async () => {
    const vendor = await request(app).post('/api/v1/vendors').send({ name: 'Report Vendor', contactEmail: 'report@test.com', paymentTerms: 'NET_30', leadTimeDays: 14 });
    vendorId = vendor.body.id;
    const catId = getCategoryId(560);
    const brandId = getFirstBrandId();

    // Create some SKUs with inventory
    for (let i = 0; i < 5; i++) {
      const colorId = getColorId(i);
      const sku = await request(app).post('/api/v1/skus').send({
        style: `Report Style ${i}`,
        price: 80 + i * 20,
        department: i < 3 ? 'FORMAL' : 'CASUAL',
        categoryId: catId,
        vendorId,
        brandId,
        colorId,
      });

      // Add inventory via adjustment
      await request(app).post(`/api/v1/skus/${sku.body.id}/inventory/adjustments`).send({
        adjustment: 10 + i * 5,
        reason: 'Initial stock',
      });
    }
  });

  describe('GET /api/v1/reports/on-hand', () => {
    it('returns department summary (no pagination needed)', async () => {
      const res = await request(app).get('/api/v1/reports/on-hand');
      expect(res.status).toBe(200);
      expect(res.body.departments).toBeDefined();
    });

    it('returns paginated detail view when drilling into department', async () => {
      const res = await request(app).get('/api/v1/reports/on-hand?department=FORMAL&page=1&pageSize=2');
      expect(res.status).toBe(200);
      expect(res.body.details.length).toBeLessThanOrEqual(2);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.pageSize).toBe(2);
      expect(res.body.pagination.totalItems).toBeGreaterThanOrEqual(1);
      expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(1);
    });

    it('CSV export returns all rows (no pagination)', async () => {
      const res = await request(app).get('/api/v1/reports/on-hand?department=FORMAL&format=csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });

  describe('GET /api/v1/reports/inventory-turnover', () => {
    it('returns paginated details when drilling into department', async () => {
      const res = await request(app).get('/api/v1/reports/inventory-turnover?department=FORMAL&page=1&pageSize=2');
      expect(res.status).toBe(200);
      expect(res.body.details.length).toBeLessThanOrEqual(2);
      expect(res.body.pagination).toBeDefined();
    });

    it('returns department summary at top level', async () => {
      const res = await request(app).get('/api/v1/reports/inventory-turnover');
      expect(res.status).toBe(200);
      expect(res.body.departments).toBeDefined();
    });
  });

  describe('GET /api/v1/reports/inventory-aging', () => {
    it('returns paginated details when drilling into department', async () => {
      const res = await request(app).get('/api/v1/reports/inventory-aging?department=FORMAL&page=1&pageSize=2');
      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
    });

    it('CSV export works without pagination', async () => {
      const res = await request(app).get('/api/v1/reports/inventory-aging?format=csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });
});

// ── AUDIT LOG: sort/order ─────────────────────────────────────────
describe('GET /api/v1/skus/:id/inventory/audit-log — sort/order', () => {
  let skuId: string;

  beforeEach(async () => {
    const vendor = await request(app).post('/api/v1/vendors').send({ name: 'Audit Vendor', contactEmail: 'audit@test.com', paymentTerms: 'NET_30', leadTimeDays: 14 });
    const catId = getCategoryId(560);
    const brandId = getFirstBrandId();
    const colorId = getColorId(0);
    const sku = await request(app).post('/api/v1/skus').send({
      style: 'Audit Style',
      price: 100,
      department: 'FORMAL',
      categoryId: catId,
      vendorId: vendor.body.id,
      brandId,
      colorId,
    });
    skuId = sku.body.id;

    // Create some audit entries
    await request(app).post(`/api/v1/skus/${skuId}/inventory/adjustments`).send({ adjustment: 10, reason: 'First' });
    await request(app).post(`/api/v1/skus/${skuId}/inventory/adjustments`).send({ adjustment: -3, reason: 'Second' });
    await request(app).post(`/api/v1/skus/${skuId}/inventory/adjustments`).send({ adjustment: 5, reason: 'Third' });
  });

  it('returns paginated audit log with sort', async () => {
    const res = await request(app).get(`/api/v1/skus/${skuId}/inventory/audit-log?sort=createdAt&order=asc`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    expect(res.body.pagination.totalItems).toBe(3);
  });

  it('sorts by adjustment amount', async () => {
    const res = await request(app).get(`/api/v1/skus/${skuId}/inventory/audit-log?sort=adjustment&order=asc`);
    expect(res.status).toBe(200);
    const adjustments = res.body.data.map((a: any) => a.adjustment);
    for (let i = 1; i < adjustments.length; i++) {
      expect(adjustments[i]).toBeGreaterThanOrEqual(adjustments[i - 1]);
    }
  });

  it('rejects invalid sort field', async () => {
    const res = await request(app).get(`/api/v1/skus/${skuId}/inventory/audit-log?sort=badField`);
    expect(res.status).toBe(400);
  });
});
