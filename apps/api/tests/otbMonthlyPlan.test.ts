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

const BASE = '/api/v1/otb/monthly-plans';

let vendorId: string;
let skuId1: string;
let skuId2: string;
let sizeId1a: string; // SKU1 size 7
let sizeId1b: string; // SKU1 size 8
let sizeId2a: string; // SKU2 size 9
let budgetId: string;

async function seedData() {
  const db = getDb();

  const vendor = await request(app).post('/api/v1/vendors').send({
    name: 'OTB Monthly Plan Vendor',
    contactEmail: 'monthly@test.com',
    paymentTerms: 'NET_30',
    leadTimeDays: 14,
  });
  vendorId = vendor.body.id;

  // SKU 1 with sizes
  const sku1 = await request(app).post('/api/v1/skus').send({
    style: 'Monthly Pump',
    price: 120.00,
    department: 'FORMAL',
    categoryId: getCategoryId(556),
    brandId: getBrandId('KISS'),
    colorId: getColorId('BK'),
    vendorId,
    sizes: ['7', '8'],
  });
  skuId1 = sku1.body.id;

  // Get size IDs
  const sizes1 = db.prepare('SELECT id, size_label FROM sku_sizes WHERE sku_id = ? ORDER BY sort_order').all(skuId1) as any[];
  sizeId1a = sizes1.find((s: any) => s.size_label === '7').id;
  sizeId1b = sizes1.find((s: any) => s.size_label === '8').id;

  // SKU 2 with sizes
  const sku2 = await request(app).post('/api/v1/skus').send({
    style: 'Monthly Sandal',
    price: 85.00,
    department: 'FORMAL',
    categoryId: getCategoryId(558),
    brandId: getBrandId('FLEX'),
    colorId: getColorId('WH'),
    vendorId,
    sizes: ['9'],
  });
  skuId2 = sku2.body.id;

  const sizes2 = db.prepare('SELECT id, size_label FROM sku_sizes WHERE sku_id = ? ORDER BY sort_order').all(skuId2) as any[];
  sizeId2a = sizes2[0].id;

  // OTB budget for FORMAL, April 2026
  const budgetRes = await request(app).post('/api/v1/otb-budgets').send({
    department: 'FORMAL',
    year: 2026,
    month: 4,
    plannedBudget: 50000.00,
  });
  budgetId = budgetRes.body.id;
}

beforeAll(async () => {
  resetDb();
  await seedData();
});

afterAll(() => {
  resetDb();
});

describe('OTB Monthly Plan CRUD', () => {
  let planId: string;

  test('POST creates a plan line', async () => {
    const res = await request(app).post(BASE).send({
      otbBudgetId: budgetId,
      skuId: skuId1,
      skuSizeId: sizeId1a,
      budgetAmount: 5000.00,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.otbBudgetId).toBe(budgetId);
    expect(res.body.skuId).toBe(skuId1);
    expect(res.body.skuSizeId).toBe(sizeId1a);
    expect(res.body.budgetAmount).toBe(5000);
    expect(res.body.committedAmount).toBe(0);
    expect(res.body.receivedAmount).toBe(0);
    expect(res.body.macroDepartment).toBe('FORMAL');
    expect(res.body.year).toBe(2026);
    expect(res.body.month).toBe(4);
    expect(res.body.planMonth).toBe('2026-04');
    expect(res.body.sizeLabel).toBe('7');
    expect(res.body.remainingToCommitAmount).toBe(5000);
    expect(res.body.remainingToReceiveAmount).toBe(0);
    expect(res.body.budgetVsReceivedVarianceAmount).toBe(5000);

    planId = res.body.id;
  });

  test('POST rejects duplicate budget+size', async () => {
    const res = await request(app).post(BASE).send({
      otbBudgetId: budgetId,
      skuId: skuId1,
      skuSizeId: sizeId1a,
      budgetAmount: 1000,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_PLAN_LINE');
  });

  test('POST rejects mismatched sku_size_id', async () => {
    const res = await request(app).post(BASE).send({
      otbBudgetId: budgetId,
      skuId: skuId1,
      skuSizeId: sizeId2a, // belongs to skuId2
      budgetAmount: 1000,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SKU_SIZE_MISMATCH');
  });

  test('POST rejects department mismatch', async () => {
    // Create CASUAL budget
    const casualBudget = await request(app).post('/api/v1/otb-budgets').send({
      department: 'CASUAL',
      year: 2026,
      month: 4,
      plannedBudget: 10000,
    });

    const res = await request(app).post(BASE).send({
      otbBudgetId: casualBudget.body.id,
      skuId: skuId1, // FORMAL sku
      skuSizeId: sizeId1a,
      budgetAmount: 1000,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEPARTMENT_MISMATCH');
  });

  test('POST with committed and received amounts', async () => {
    const res = await request(app).post(BASE).send({
      otbBudgetId: budgetId,
      skuId: skuId1,
      skuSizeId: sizeId1b,
      budgetAmount: 3000,
      committedAmount: 2000,
      receivedAmount: 1000,
      notes: 'Partial commitment',
    });

    expect(res.status).toBe(201);
    expect(res.body.budgetAmount).toBe(3000);
    expect(res.body.committedAmount).toBe(2000);
    expect(res.body.receivedAmount).toBe(1000);
    expect(res.body.remainingToCommitAmount).toBe(1000);
    expect(res.body.remainingToReceiveAmount).toBe(1000);
    expect(res.body.budgetVsReceivedVarianceAmount).toBe(2000);
    expect(res.body.notes).toBe('Partial commitment');
  });

  test('GET by ID returns the plan line', async () => {
    const res = await request(app).get(`${BASE}/${planId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(planId);
    expect(res.body.macroDepartment).toBe('FORMAL');
    expect(res.body.style).toBe('Monthly Pump');
  });

  test('GET by ID returns 404 for missing', async () => {
    const res = await request(app).get(`${BASE}/${uuidv4()}`);
    expect(res.status).toBe(404);
  });

  test('PATCH updates financial amounts', async () => {
    const res = await request(app).patch(`${BASE}/${planId}`).send({
      budgetAmount: 8000,
      committedAmount: 3000,
      receivedAmount: 1500,
    });

    expect(res.status).toBe(200);
    expect(res.body.budgetAmount).toBe(8000);
    expect(res.body.committedAmount).toBe(3000);
    expect(res.body.receivedAmount).toBe(1500);
    expect(res.body.remainingToCommitAmount).toBe(5000);
    expect(res.body.remainingToReceiveAmount).toBe(1500);
  });

  test('PATCH rejects constraint violation (committed > budget)', async () => {
    const res = await request(app).patch(`${BASE}/${planId}`).send({
      committedAmount: 99999,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONSTRAINT_VIOLATION');
  });

  test('PATCH returns 404 for missing', async () => {
    const res = await request(app).patch(`${BASE}/${uuidv4()}`).send({
      budgetAmount: 100,
    });
    expect(res.status).toBe(404);
  });

  test('DELETE removes the plan line', async () => {
    // Create a throwaway line
    const created = await request(app).post(BASE).send({
      otbBudgetId: budgetId,
      skuId: skuId2,
      skuSizeId: sizeId2a,
      budgetAmount: 2000,
    });
    const throwawayId = created.body.id;

    const del = await request(app).delete(`${BASE}/${throwawayId}`);
    expect(del.status).toBe(204);

    const get = await request(app).get(`${BASE}/${throwawayId}`);
    expect(get.status).toBe(404);
  });

  test('DELETE returns 404 for missing', async () => {
    const res = await request(app).delete(`${BASE}/${uuidv4()}`);
    expect(res.status).toBe(404);
  });
});

describe('OTB Monthly Plan List (server-side table)', () => {
  test('GET list returns paginated results', async () => {
    const res = await request(app).get(BASE);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.totalItems).toBeGreaterThan(0);
  });

  test('GET list filters by year+month', async () => {
    const res = await request(app).get(BASE).query({ year: 2026, month: 4 });

    expect(res.status).toBe(200);
    for (const row of res.body.data) {
      expect(row.year).toBe(2026);
      expect(row.month).toBe(4);
    }
  });

  test('GET list filters by department', async () => {
    const res = await request(app).get(BASE).query({ department: 'FORMAL' });

    expect(res.status).toBe(200);
    for (const row of res.body.data) {
      expect(row.macroDepartment).toBe('FORMAL');
    }
  });

  test('GET list filters by style (case-insensitive)', async () => {
    const res = await request(app).get(BASE).query({ style: 'pump' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row.style.toLowerCase()).toContain('pump');
    }
  });

  test('GET list sorts by budgetAmount asc', async () => {
    const res = await request(app).get(BASE).query({ sort: 'budgetAmount', order: 'asc' });

    expect(res.status).toBe(200);
    const amounts = res.body.data.map((r: any) => r.budgetAmount);
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i]).toBeGreaterThanOrEqual(amounts[i - 1]);
    }
  });

  test('GET list paginates correctly', async () => {
    const res = await request(app).get(BASE).query({ pageSize: 1, page: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination.pageSize).toBe(1);
    expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(2);
  });

  test('GET list rejects invalid sort field', async () => {
    const res = await request(app).get(BASE).query({ sort: 'hackerField' });
    expect(res.status).toBe(400);
  });

  test('GET list rejects invalid department', async () => {
    const res = await request(app).get(BASE).query({ department: 'INVALID' });
    expect(res.status).toBe(400);
  });
});

describe('OTB Monthly Plan validation', () => {
  test('POST rejects missing required fields', async () => {
    const res = await request(app).post(BASE).send({});
    expect(res.status).toBe(400);
  });

  test('POST rejects negative budgetAmount', async () => {
    const res = await request(app).post(BASE).send({
      otbBudgetId: budgetId,
      skuId: skuId1,
      skuSizeId: sizeId1a,
      budgetAmount: -100,
    });
    expect(res.status).toBe(400);
  });
});

describe('OTB Monthly Plan DTO shape', () => {
  test('response uses camelCase field names', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(200);

    const row = res.body.data[0];
    expect(row).toHaveProperty('otbBudgetId');
    expect(row).toHaveProperty('macroDepartment');
    expect(row).toHaveProperty('planMonth');
    expect(row).toHaveProperty('skuSizeId');
    expect(row).toHaveProperty('sizeLabel');
    expect(row).toHaveProperty('budgetAmount');
    expect(row).toHaveProperty('committedAmount');
    expect(row).toHaveProperty('receivedAmount');
    expect(row).toHaveProperty('remainingToCommitAmount');
    expect(row).toHaveProperty('remainingToReceiveAmount');
    expect(row).toHaveProperty('budgetVsReceivedVarianceAmount');
    expect(row).toHaveProperty('createdAt');
    expect(row).toHaveProperty('updatedAt');

    // Must NOT have snake_case fields
    expect(row).not.toHaveProperty('otb_budget_id');
    expect(row).not.toHaveProperty('macro_department');
    expect(row).not.toHaveProperty('plan_month');
  });
});
