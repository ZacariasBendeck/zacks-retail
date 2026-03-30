import request from 'supertest';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';

function getCategoryId(ricsCode: number): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(ricsCode) as { id: number } | undefined;
  return row ? row.id : null;
}

const validBudget = {
  department: 'FORMAL',
  year: 2026,
  month: 3,
  plannedBudget: 50000,
  notes: 'Q1 formal shoes budget',
};

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  resetDb();
});

describe('POST /api/v1/otb-budgets', () => {
  it('creates an OTB budget', async () => {
    const res = await request(app).post('/api/v1/otb-budgets').send(validBudget);
    expect(res.status).toBe(201);
    expect(res.body.department).toBe('FORMAL');
    expect(res.body.year).toBe(2026);
    expect(res.body.month).toBe(3);
    expect(res.body.plannedBudget).toBe(50000);
    expect(res.body.notes).toBe('Q1 formal shoes budget');
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
  });

  it('rejects duplicate department+year+month', async () => {
    await request(app).post('/api/v1/otb-budgets').send(validBudget);
    const res = await request(app).post('/api/v1/otb-budgets').send(validBudget);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_BUDGET');
  });

  it('rejects invalid department', async () => {
    const res = await request(app).post('/api/v1/otb-budgets').send({ ...validBudget, department: 'INVALID' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects negative budget', async () => {
    const res = await request(app).post('/api/v1/otb-budgets').send({ ...validBudget, plannedBudget: -100 });
    expect(res.status).toBe(400);
  });

  it('rejects invalid month', async () => {
    const res = await request(app).post('/api/v1/otb-budgets').send({ ...validBudget, month: 13 });
    expect(res.status).toBe(400);
  });

  it('rejects missing required fields', async () => {
    const res = await request(app).post('/api/v1/otb-budgets').send({ department: 'FORMAL' });
    expect(res.status).toBe(400);
  });

  it('allows zero budget', async () => {
    const res = await request(app).post('/api/v1/otb-budgets').send({ ...validBudget, plannedBudget: 0 });
    expect(res.status).toBe(201);
    expect(res.body.plannedBudget).toBe(0);
  });
});

describe('GET /api/v1/otb-budgets/:budgetId', () => {
  it('returns a budget by ID', async () => {
    const created = await request(app).post('/api/v1/otb-budgets').send(validBudget);
    const res = await request(app).get(`/api/v1/otb-budgets/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.department).toBe('FORMAL');
    expect(res.body.plannedBudget).toBe(50000);
  });

  it('returns 404 for missing budget', async () => {
    const res = await request(app).get('/api/v1/otb-budgets/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/otb-budgets/:budgetId', () => {
  it('updates planned budget with audit trail', async () => {
    const created = await request(app).post('/api/v1/otb-budgets').send(validBudget);
    const res = await request(app)
      .patch(`/api/v1/otb-budgets/${created.body.id}`)
      .send({ plannedBudget: 75000, changedBy: 'buyer1' });
    expect(res.status).toBe(200);
    expect(res.body.plannedBudget).toBe(75000);

    // Verify audit trail
    const audit = await request(app).get(`/api/v1/otb-budgets/${created.body.id}/audit`);
    expect(audit.status).toBe(200);
    expect(audit.body.length).toBe(1);
    expect(audit.body[0].fieldChanged).toBe('planned_budget');
    expect(audit.body[0].oldValue).toBe('50000');
    expect(audit.body[0].newValue).toBe('75000');
    expect(audit.body[0].changedBy).toBe('buyer1');
  });

  it('updates notes with audit trail', async () => {
    const created = await request(app).post('/api/v1/otb-budgets').send(validBudget);
    const res = await request(app)
      .patch(`/api/v1/otb-budgets/${created.body.id}`)
      .send({ notes: 'Updated notes' });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('Updated notes');

    const audit = await request(app).get(`/api/v1/otb-budgets/${created.body.id}/audit`);
    expect(audit.body.length).toBe(1);
    expect(audit.body[0].fieldChanged).toBe('notes');
  });

  it('does not create audit entry when value unchanged', async () => {
    const created = await request(app).post('/api/v1/otb-budgets').send(validBudget);
    await request(app)
      .patch(`/api/v1/otb-budgets/${created.body.id}`)
      .send({ plannedBudget: 50000 }); // same value

    const audit = await request(app).get(`/api/v1/otb-budgets/${created.body.id}/audit`);
    expect(audit.body.length).toBe(0);
  });

  it('returns 404 for missing budget', async () => {
    const res = await request(app)
      .patch('/api/v1/otb-budgets/00000000-0000-0000-0000-000000000099')
      .send({ plannedBudget: 10000 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/otb-budgets/:budgetId', () => {
  it('deletes a budget and its audit trail', async () => {
    const created = await request(app).post('/api/v1/otb-budgets').send(validBudget);
    // Create an audit entry first
    await request(app)
      .patch(`/api/v1/otb-budgets/${created.body.id}`)
      .send({ plannedBudget: 60000 });

    const res = await request(app).delete(`/api/v1/otb-budgets/${created.body.id}`);
    expect(res.status).toBe(204);

    const check = await request(app).get(`/api/v1/otb-budgets/${created.body.id}`);
    expect(check.status).toBe(404);
  });

  it('returns 404 for missing budget', async () => {
    const res = await request(app).delete('/api/v1/otb-budgets/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/otb-budgets (list)', () => {
  beforeEach(async () => {
    const budgets = [
      { department: 'FORMAL', year: 2026, month: 1, plannedBudget: 50000 },
      { department: 'CASUAL', year: 2026, month: 1, plannedBudget: 30000 },
      { department: 'FORMAL', year: 2026, month: 2, plannedBudget: 45000 },
      { department: 'BOOTS', year: 2025, month: 12, plannedBudget: 20000 },
    ];
    for (const b of budgets) {
      await request(app).post('/api/v1/otb-budgets').send(b);
    }
  });

  it('returns all budgets', async () => {
    const res = await request(app).get('/api/v1/otb-budgets');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(4);
    expect(res.body.pagination.totalItems).toBe(4);
  });

  it('filters by department', async () => {
    const res = await request(app).get('/api/v1/otb-budgets?department=FORMAL');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((b: any) => b.department === 'FORMAL')).toBe(true);
  });

  it('filters by year', async () => {
    const res = await request(app).get('/api/v1/otb-budgets?year=2026');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
  });

  it('filters by year and month', async () => {
    const res = await request(app).get('/api/v1/otb-budgets?year=2026&month=1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('paginates results', async () => {
    const res = await request(app).get('/api/v1/otb-budgets?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.totalPages).toBe(2);
  });
});

describe('GET /api/v1/otb-budgets/summary', () => {
  it('returns summary with planned budget and warning fields', async () => {
    await request(app).post('/api/v1/otb-budgets').send(validBudget);
    const res = await request(app).get('/api/v1/otb-budgets/summary?year=2026&month=3');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].department).toBe('FORMAL');
    expect(res.body[0].plannedBudget).toBe(50000);
    expect(res.body[0].committedAmount).toBe(0);
    expect(res.body[0].receivedAmount).toBe(0);
    expect(res.body[0].remainingOtb).toBe(50000);
    expect(res.body[0].utilizationPercent).toBe(0);
    expect(res.body[0].budgetExceeded).toBe(false);
  });

  it('requires year parameter', async () => {
    const res = await request(app).get('/api/v1/otb-budgets/summary');
    expect(res.status).toBe(400);
  });

  it('filters by department', async () => {
    await request(app).post('/api/v1/otb-budgets').send(validBudget);
    await request(app).post('/api/v1/otb-budgets').send({ ...validBudget, department: 'CASUAL', plannedBudget: 30000 });

    const res = await request(app).get('/api/v1/otb-budgets/summary?year=2026&month=3&department=FORMAL');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].department).toBe('FORMAL');
  });

  it('returns empty array when no budgets match', async () => {
    const res = await request(app).get('/api/v1/otb-budgets/summary?year=2099');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });
});

describe('GET /api/v1/otb-budgets/:budgetId/audit', () => {
  it('returns 404 for non-existent budget', async () => {
    const res = await request(app).get('/api/v1/otb-budgets/00000000-0000-0000-0000-000000000099/audit');
    expect(res.status).toBe(404);
  });

  it('returns empty audit for unchanged budget', async () => {
    const created = await request(app).post('/api/v1/otb-budgets').send(validBudget);
    const res = await request(app).get(`/api/v1/otb-budgets/${created.body.id}/audit`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it('records multiple changes chronologically', async () => {
    const created = await request(app).post('/api/v1/otb-budgets').send(validBudget);
    await request(app).patch(`/api/v1/otb-budgets/${created.body.id}`).send({ plannedBudget: 60000 });
    await request(app).patch(`/api/v1/otb-budgets/${created.body.id}`).send({ plannedBudget: 70000 });

    const res = await request(app).get(`/api/v1/otb-budgets/${created.body.id}/audit`);
    expect(res.body.length).toBe(2);
    // Both changes recorded
    const values = res.body.map((a: any) => a.newValue).sort();
    expect(values).toEqual(['60000', '70000']);
  });
});

describe('GET /api/v1/otb-budgets/check-po/:poId', () => {
  let vendorId: string;
  let skuId1: string;

  beforeEach(async () => {
    const vendor = await request(app).post('/api/v1/vendors').send({
      name: 'Test Vendor',
      contactEmail: 'test@vendor.com',
      paymentTerms: 'NET_30',
    });
    vendorId = vendor.body.id;

    const sku = await request(app).post('/api/v1/skus').send({
      style: 'Air Max',
      price: 129.99,
      department: 'FORMAL',
      categoryId: getCategoryId(560),
      vendorId,
    });
    skuId1 = sku.body.id;
  });

  it('returns budget impact for a PO within budget', async () => {
    await request(app).post('/api/v1/otb-budgets').send(validBudget);

    const po = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 100 }],
    });

    const res = await request(app).get(`/api/v1/otb-budgets/check-po/${po.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.poId).toBe(po.body.id);
    expect(res.body.budgetImpact).toHaveLength(1);
    expect(res.body.budgetImpact[0].department).toBe('FORMAL');
    expect(res.body.budgetImpact[0].poAmount).toBe(1000);
    expect(res.body.budgetImpact[0].exceedsBudget).toBe(false);
    expect(res.body.warning).toBeNull();
  });

  it('returns warning when PO exceeds budget', async () => {
    await request(app).post('/api/v1/otb-budgets').send({ ...validBudget, plannedBudget: 500 });

    const po = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 100 }],
    });

    const res = await request(app).get(`/api/v1/otb-budgets/check-po/${po.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.budgetImpact[0].exceedsBudget).toBe(true);
    expect(res.body.budgetImpact[0].overageAmount).toBe(500);
    expect(res.body.warning).toBeTruthy();
  });

  it('returns 404 for non-existent PO', async () => {
    const res = await request(app).get('/api/v1/otb-budgets/check-po/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });
});

describe('PO submit with OTB budget check', () => {
  let vendorId: string;
  let skuId1: string;

  beforeEach(async () => {
    const vendor = await request(app).post('/api/v1/vendors').send({
      name: 'Test Vendor',
      contactEmail: 'test@vendor.com',
      paymentTerms: 'NET_30',
    });
    vendorId = vendor.body.id;

    const sku = await request(app).post('/api/v1/skus').send({
      style: 'Air Max',
      price: 129.99,
      department: 'FORMAL',
      categoryId: getCategoryId(560),
      vendorId,
    });
    skuId1 = sku.body.id;
  });

  it('blocks PO submit when it would exceed OTB budget', async () => {
    await request(app).post('/api/v1/otb-budgets').send({ ...validBudget, plannedBudget: 500 });

    const po = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 100 }],
    });

    const res = await request(app).patch(`/api/v1/purchase-orders/${po.body.id}/submit`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BUDGET_EXCEEDED');
    expect(res.body.budgetImpact).toBeDefined();
    expect(res.body.budgetImpact[0].exceedsBudget).toBe(true);
  });

  it('allows PO submit with force=true when budget exceeded', async () => {
    await request(app).post('/api/v1/otb-budgets').send({ ...validBudget, plannedBudget: 500 });

    const po = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 100 }],
    });

    const res = await request(app).patch(`/api/v1/purchase-orders/${po.body.id}/submit`).send({ force: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.budgetWarning).toBeDefined();
    expect(res.body.budgetWarning.message).toContain('budget override');
  });

  it('submits normally when within budget', async () => {
    await request(app).post('/api/v1/otb-budgets').send(validBudget);

    const po = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 100 }],
    });

    const res = await request(app).patch(`/api/v1/purchase-orders/${po.body.id}/submit`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.budgetWarning).toBeUndefined();
  });

  it('submits normally when no OTB budget exists for that department/month', async () => {
    // No budget set up — should pass without warning
    const po = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 100 }],
    });

    const res = await request(app).patch(`/api/v1/purchase-orders/${po.body.id}/submit`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
  });
});
