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
    name: 'Calzados Premium',
    contactEmail: 'ventas@calzados.com',
    paymentTerms: 'NET_30',
    leadTimeDays: 14,
  });
  vendorId = vendor.body.id;

  const sku1 = await request(app).post('/api/v1/skus').send({
    style: 'Air Max',
    price: 129.99,
    department: 'FORMAL',
    categoryId: getCategoryId(560),
    brandId: getBrandId('KISS'),
    colorId: getColorId('BK'),
    vendorId,
  });
  skuId1 = sku1.body.id;

  const sku2 = await request(app).post('/api/v1/skus').send({
    style: 'Superstar',
    price: 99.99,
    department: 'CASUAL',
    categoryId: getCategoryId(565),
    brandId: getBrandId('FLEX'),
    colorId: getColorId('WH'),
    vendorId,
  });
  skuId2 = sku2.body.id;
}

beforeEach(async () => {
  resetDb();
  await seedVendorAndSkus();
});

afterAll(() => {
  resetDb();
});

describe('POST /api/v1/purchase-orders', () => {
  it('creates a PO in Draft status with line items', async () => {
    const res = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [
        { skuId: skuId1, quantity: 10, unitCost: 50.0 },
        { skuId: skuId2, quantity: 5, unitCost: 40.0 },
      ],
      notes: 'Initial order for spring season',
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.poNumber).toMatch(/^PO-\d{6}$/);
    expect(res.body.vendorId).toBe(vendorId);
    expect(res.body.notes).toBe('Initial order for spring season');
    expect(res.body.lineItems).toHaveLength(2);
    expect(res.body.lineItems[0].quantityOrdered).toBe(10);
    expect(res.body.lineItems[0].unitCost).toBe(50.0);
    expect(res.body.lineItems[0].lineTotal).toBe(500.0);
    expect(res.body.subtotal).toBe(700.0);
    expect(res.body.createdBy).toBe('system');
  });

  it('creates a PO with minimal fields (no notes)', async () => {
    const res = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 1, unitCost: 10.0 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.notes).toBeNull();
    expect(res.body.lineItems).toHaveLength(1);
  });

  it('rejects missing vendorId', async () => {
    const res = await request(app).post('/api/v1/purchase-orders').send({
      lineItems: [{ skuId: skuId1, quantity: 1, unitCost: 10.0 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects empty line items', async () => {
    const res = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid vendor', async () => {
    const res = await request(app).post('/api/v1/purchase-orders').send({
      vendorId: '00000000-0000-0000-0000-000000000099',
      lineItems: [{ skuId: skuId1, quantity: 1, unitCost: 10.0 }],
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('VENDOR_NOT_FOUND');
  });

  it('rejects invalid SKU', async () => {
    const res = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: '00000000-0000-0000-0000-000000000099', quantity: 1, unitCost: 10.0 }],
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SKU_NOT_FOUND');
  });

  it('rejects zero quantity', async () => {
    const res = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 0, unitCost: 10.0 }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects negative unit cost', async () => {
    const res = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 5, unitCost: -1 }],
    });
    expect(res.status).toBe(400);
  });

  it('generates unique PO numbers', async () => {
    const po1 = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 1, unitCost: 10.0 }],
    });
    const po2 = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 1, unitCost: 10.0 }],
    });
    expect(po1.body.poNumber).not.toBe(po2.body.poNumber);
  });
});

describe('GET /api/v1/purchase-orders/:poId', () => {
  it('returns a PO with vendor info, line items, subtotal, and status', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [
        { skuId: skuId1, quantity: 10, unitCost: 50.0 },
        { skuId: skuId2, quantity: 5, unitCost: 40.0 },
      ],
    });

    const res = await request(app).get(`/api/v1/purchase-orders/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.vendorId).toBe(vendorId);
    expect(res.body.lineItems).toHaveLength(2);
    expect(res.body.subtotal).toBe(700.0);
    expect(res.body.status).toBe('DRAFT');
  });

  it('returns 404 for missing PO', async () => {
    const res = await request(app).get('/api/v1/purchase-orders/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/purchase-orders/:poId', () => {
  it('updates notes on a draft PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}`)
      .send({ notes: 'Updated notes' });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('Updated notes');
    expect(res.body.lineItems).toHaveLength(1);
  });

  it('replaces line items on a draft PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}`)
      .send({
        lineItems: [
          { skuId: skuId2, quantity: 20, unitCost: 30.0 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.lineItems).toHaveLength(1);
    expect(res.body.lineItems[0].skuId).toBe(skuId2);
    expect(res.body.subtotal).toBe(600.0);
  });

  it('rejects edit on non-draft PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    // Submit the PO
    await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/status`)
      .send({ status: 'SUBMITTED' });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}`)
      .send({ notes: 'Too late' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ONLY_DRAFT_EDITABLE');
  });

  it('returns 404 for missing PO', async () => {
    const res = await request(app)
      .patch('/api/v1/purchase-orders/00000000-0000-0000-0000-000000000099')
      .send({ notes: 'test' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/purchase-orders/:poId/status', () => {
  it('transitions Draft → Submitted', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/status`)
      .send({ status: 'SUBMITTED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.poNumber).toBeDefined();
  });

  it('transitions Submitted → Confirmed', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/status`)
      .send({ status: 'SUBMITTED' });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/status`)
      .send({ status: 'CONFIRMED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONFIRMED');
  });

  it('transitions Draft → Cancelled with reason', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/status`)
      .send({ status: 'CANCELLED', reason: 'Vendor raised prices' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancellationReason).toBe('Vendor raised prices');
  });

  it('rejects invalid transition (Draft → Confirmed)', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/status`)
      .send({ status: 'CONFIRMED' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('rejects transition on cancelled PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/status`)
      .send({ status: 'CANCELLED' });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/status`)
      .send({ status: 'SUBMITTED' });

    expect(res.status).toBe(409);
  });

  it('returns 404 for missing PO', async () => {
    const res = await request(app)
      .patch('/api/v1/purchase-orders/00000000-0000-0000-0000-000000000099/status')
      .send({ status: 'SUBMITTED' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/purchase-orders (list)', () => {
  beforeEach(async () => {
    // Create 3 POs
    await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
      notes: 'First order',
    });

    const po2 = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId2, quantity: 5, unitCost: 40.0 }],
      notes: 'Second order',
    });

    // Submit second PO
    await request(app)
      .patch(`/api/v1/purchase-orders/${po2.body.id}/status`)
      .send({ status: 'SUBMITTED' });

    await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 3, unitCost: 60.0 }],
      notes: 'Third order',
    });
  });

  it('returns all POs with pagination', async () => {
    const res = await request(app).get('/api/v1/purchase-orders');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.totalItems).toBe(3);
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/v1/purchase-orders?status=SUBMITTED');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('SUBMITTED');
  });

  it('filters by vendorId', async () => {
    const res = await request(app).get(`/api/v1/purchase-orders?vendorId=${vendorId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
  });

  it('searches by PO number', async () => {
    const all = await request(app).get('/api/v1/purchase-orders');
    const poNumber = all.body.data[0].poNumber;

    const res = await request(app).get(`/api/v1/purchase-orders?q=${poNumber}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('searches by notes', async () => {
    const res = await request(app).get('/api/v1/purchase-orders?q=Second');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].notes).toBe('Second order');
  });

  it('paginates results', async () => {
    const res = await request(app).get('/api/v1/purchase-orders?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.totalItems).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);
  });
});

// ── Named transition endpoints (ZAI-40) ──────────────────────────────

describe('PATCH /api/v1/purchase-orders/:poId/submit', () => {
  it('submits a draft PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/submit`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
  });

  it('rejects submit on non-draft PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    await request(app).patch(`/api/v1/purchase-orders/${created.body.id}/submit`).send();

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/submit`)
      .send();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('rejects submit when SKU is inactive', async () => {
    // Deactivate the SKU
    await request(app).patch(`/api/v1/skus/${skuId1}`).send({ active: false });

    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/submit`)
      .send();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INACTIVE_SKU');
  });

  it('returns 404 for missing PO', async () => {
    const res = await request(app)
      .patch('/api/v1/purchase-orders/00000000-0000-0000-0000-000000000099/submit')
      .send();
    expect(res.status).toBe(404);
  });

  it('records submit in status history', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    await request(app).patch(`/api/v1/purchase-orders/${created.body.id}/submit`).send();

    const history = await request(app).get(`/api/v1/purchase-orders/${created.body.id}/history`);
    expect(history.status).toBe(200);
    const submitEntry = history.body.find((h: any) => h.toStatus === 'SUBMITTED');
    expect(submitEntry).toBeDefined();
    expect(submitEntry.fromStatus).toBe('DRAFT');
  });
});

describe('PATCH /api/v1/purchase-orders/:poId/confirm', () => {
  it('confirms a submitted PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    await request(app).patch(`/api/v1/purchase-orders/${created.body.id}/submit`).send();

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/confirm`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONFIRMED');
  });

  it('rejects confirm on draft PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/confirm`)
      .send();

    expect(res.status).toBe(409);
  });

  it('returns 404 for missing PO', async () => {
    const res = await request(app)
      .patch('/api/v1/purchase-orders/00000000-0000-0000-0000-000000000099/confirm')
      .send();
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/purchase-orders/:poId/cancel', () => {
  it('cancels a draft PO without reason', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/cancel`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('requires reason when cancelling a submitted PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    await request(app).patch(`/api/v1/purchase-orders/${created.body.id}/submit`).send();

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/cancel`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
  });

  it('cancels submitted PO with reason', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    await request(app).patch(`/api/v1/purchase-orders/${created.body.id}/submit`).send();

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/cancel`)
      .send({ reason: 'Vendor delayed shipment' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancellationReason).toBe('Vendor delayed shipment');
  });

  it('requires reason when cancelling a confirmed PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    await request(app).patch(`/api/v1/purchase-orders/${created.body.id}/submit`).send();
    await request(app).patch(`/api/v1/purchase-orders/${created.body.id}/confirm`).send();

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/cancel`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
  });

  it('rejects cancel on received PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    await request(app).patch(`/api/v1/purchase-orders/${created.body.id}/submit`).send();
    await request(app).patch(`/api/v1/purchase-orders/${created.body.id}/confirm`).send();

    // Receive fully
    const po = await request(app).get(`/api/v1/purchase-orders/${created.body.id}`);
    await request(app)
      .post(`/api/v1/purchase-orders/${created.body.id}/receive`)
      .send({ lines: [{ lineId: po.body.lineItems[0].id, quantityReceived: 10 }] });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/cancel`)
      .send({ reason: 'Too late' });

    expect(res.status).toBe(409);
  });

  it('returns 404 for missing PO', async () => {
    const res = await request(app)
      .patch('/api/v1/purchase-orders/00000000-0000-0000-0000-000000000099/cancel')
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/purchase-orders/:poId/receive', () => {
  let poId: string;
  let lineId1: string;
  let lineId2: string;

  beforeEach(async () => {
    // Seed inventory for SKUs
    await request(app).post(`/api/v1/skus/${skuId1}/inventory/adjustments`).send({
      adjustment: 100,
      reason: 'Initial stock',
    });
    await request(app).post(`/api/v1/skus/${skuId2}/inventory/adjustments`).send({
      adjustment: 50,
      reason: 'Initial stock',
    });

    // Create, submit, and confirm a PO
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [
        { skuId: skuId1, quantity: 10, unitCost: 50.0 },
        { skuId: skuId2, quantity: 5, unitCost: 40.0 },
      ],
    });
    poId = created.body.id;

    await request(app).patch(`/api/v1/purchase-orders/${poId}/submit`).send();
    await request(app).patch(`/api/v1/purchase-orders/${poId}/confirm`).send();

    const po = await request(app).get(`/api/v1/purchase-orders/${poId}`);
    lineId1 = po.body.lineItems[0].id;
    lineId2 = po.body.lineItems[1].id;
  });

  it('partially receives a PO (with discrepancy reason)', async () => {
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 5, discrepancyReason: 'Shipment shortage' }] });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PARTIALLY_RECEIVED');
    expect(res.body.lineItems[0].quantityReceived).toBe(5);
  });

  it('fully receives a PO', async () => {
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({
        lines: [
          { lineId: lineId1, quantityReceived: 10 },
          { lineId: lineId2, quantityReceived: 5 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RECEIVED');
  });

  it('handles incremental receives (partial then full)', async () => {
    // First partial receive — receiving less than ordered requires discrepancy reason
    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 3, discrepancyReason: 'Partial shipment' }] });

    // Second receive completes remaining — no reason required for exact-match lines
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({
        lines: [
          { lineId: lineId1, quantityReceived: 7 },
          { lineId: lineId2, quantityReceived: 5 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RECEIVED');
    expect(res.body.lineItems[0].quantityReceived).toBe(10);
    expect(res.body.lineItems[1].quantityReceived).toBe(5);
  });

  it('updates inventory on-hand quantities', async () => {
    const beforeInv = await request(app).get(`/api/v1/skus/${skuId1}/inventory`);
    const initialQty = beforeInv.body.quantityOnHand;

    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 10 }] });

    const afterInv = await request(app).get(`/api/v1/skus/${skuId1}/inventory`);
    expect(afterInv.body.quantityOnHand).toBe(initialQty + 10);
  });

  it('creates audit log entries for received goods', async () => {
    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 10 }] });

    const auditLog = await request(app).get(`/api/v1/skus/${skuId1}/inventory/audit-log`);
    expect(auditLog.status).toBe(200);
    const receiveEntry = auditLog.body.data.find((e: any) => e.reason.startsWith('PO receive:'));
    expect(receiveEntry).toBeDefined();
    expect(receiveEntry.adjustment).toBe(10);
  });

  it('creates po_receipts rows and exposes dedicated receipts endpoint', async () => {
    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({
        lines: [{ lineId: lineId1, quantityReceived: 4, discrepancyReason: 'Damaged in transit', auditReference: 'DMG-2026-001' }],
        locationId: 'loc-01',
        referenceNumber: 'RCV-001',
      });

    const receipts = await request(app).get(`/api/v1/purchase-orders/${poId}/receipts`);
    expect(receipts.status).toBe(200);
    expect(Array.isArray(receipts.body)).toBe(true);
    expect(receipts.body.length).toBeGreaterThanOrEqual(1);
    expect(receipts.body[0].locationId).toBe('loc-01');
    expect(receipts.body[0].referenceNumber).toBe('RCV-001');
    expect(receipts.body[0].lines[0].quantityReceived).toBe(4);
    expect(receipts.body[0].lines[0].discrepancyReason).toBe('Damaged in transit');
    expect(receipts.body[0].lines[0].auditReference).toBe('DMG-2026-001');
  });

  it('rejects receive on a draft PO', async () => {
    const draft = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    const res = await request(app)
      .post(`/api/v1/purchase-orders/${draft.body.id}/receive`)
      .send({ lines: [{ lineId: '00000000-0000-0000-0000-000000000099', quantityReceived: 1 }] });

    expect(res.status).toBe(409);
  });

  it('rejects receive with unknown lineId', async () => {
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: '00000000-0000-0000-0000-000000000099', quantityReceived: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LINE_NOT_FOUND');
  });

  it('rejects receive when quantity exceeds ordered', async () => {
    // lineId1 has quantity_ordered = 10
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 1000 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUANTITY_EXCEEDS_ORDERED');
  });

  it('rejects incremental receive that exceeds ordered total', async () => {
    // Receive 8 of 10 first (short receipt requires reason)
    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 8, discrepancyReason: 'Partial delivery' }] });

    // Try to receive 5 more (8 + 5 = 13 > 10)
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 5 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUANTITY_EXCEEDS_ORDERED');
  });

  it('rejects receive with empty lines array', async () => {
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [] });

    expect(res.status).toBe(400);
  });

  it('returns 404 for missing PO', async () => {
    const res = await request(app)
      .post('/api/v1/purchase-orders/00000000-0000-0000-0000-000000000099/receive')
      .send({ lines: [{ lineId: lineId1, quantityReceived: 1 }] });
    expect(res.status).toBe(404);
  });

  it('returns 404 when receiving into an unknown location', async () => {
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 1, discrepancyReason: 'Short ship' }], locationId: 'loc-99' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LOCATION_NOT_FOUND');
  });

  it('records receive transitions in status history', async () => {
    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({
        lines: [
          { lineId: lineId1, quantityReceived: 10 },
          { lineId: lineId2, quantityReceived: 5 },
        ],
      });

    const history = await request(app).get(`/api/v1/purchase-orders/${poId}/history`);
    const receiveEntry = history.body.find((h: any) => h.toStatus === 'RECEIVED');
    expect(receiveEntry).toBeDefined();
    expect(receiveEntry.fromStatus).toBe('CONFIRMED');
  });

  // ── Discrepancy reason / audit reference (ZAI-322) ─────────────────

  it('rejects short receipt without discrepancyReason', async () => {
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 3 }] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DISCREPANCY_REASON_REQUIRED');
  });

  it('accepts short receipt when discrepancyReason is provided', async () => {
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 3, discrepancyReason: 'Vendor shipped partial' }] });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PARTIALLY_RECEIVED');
  });

  it('does not require discrepancyReason for full-quantity receipt', async () => {
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({
        lines: [
          { lineId: lineId1, quantityReceived: 10 },
          { lineId: lineId2, quantityReceived: 5 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RECEIVED');
  });

  it('persists discrepancyReason and auditReference on receipt lines', async () => {
    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({
        lines: [{
          lineId: lineId1,
          quantityReceived: 7,
          discrepancyReason: 'Damaged goods rejected',
          auditReference: 'CLM-2026-042',
        }, {
          lineId: lineId2,
          quantityReceived: 5,
        }],
      });

    const receipts = await request(app).get(`/api/v1/purchase-orders/${poId}/receipts`);
    expect(receipts.status).toBe(200);

    const lines = receipts.body[0].lines;
    const shortLine = lines.find((l: any) => l.discrepancyReason === 'Damaged goods rejected');
    expect(shortLine).toBeDefined();
    expect(shortLine.auditReference).toBe('CLM-2026-042');

    const fullLine = lines.find((l: any) => l.discrepancyReason === null);
    expect(fullLine).toBeDefined();
    expect(fullLine.auditReference).toBeNull();
  });

  it('allows auditReference without discrepancyReason on full-match lines', async () => {
    const res = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({
        lines: [
          { lineId: lineId1, quantityReceived: 10, auditReference: 'ASN-7890' },
          { lineId: lineId2, quantityReceived: 5 },
        ],
      });

    expect(res.status).toBe(200);

    const receipts = await request(app).get(`/api/v1/purchase-orders/${poId}/receipts`);
    const lineWithRef = receipts.body[0].lines.find((l: any) => l.auditReference === 'ASN-7890');
    expect(lineWithRef).toBeDefined();
    expect(lineWithRef.discrepancyReason).toBeNull();
  });
});

describe('GET /api/v1/transfer-orders', () => {
  it('returns paginated transfer-order read model (empty by default)', async () => {
    const res = await request(app).get('/api/v1/transfer-orders');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('PATCH /api/v1/purchase-orders/:poId/close', () => {
  it('closes a fully received PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    // Seed inventory
    await request(app).post(`/api/v1/skus/${skuId1}/inventory/adjustments`).send({
      adjustment: 100,
      reason: 'Initial stock',
    });

    await request(app).patch(`/api/v1/purchase-orders/${created.body.id}/submit`).send();
    await request(app).patch(`/api/v1/purchase-orders/${created.body.id}/confirm`).send();

    const po = await request(app).get(`/api/v1/purchase-orders/${created.body.id}`);
    await request(app)
      .post(`/api/v1/purchase-orders/${created.body.id}/receive`)
      .send({ lines: [{ lineId: po.body.lineItems[0].id, quantityReceived: 10 }] });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/close`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CLOSED');
  });

  it('rejects close on non-received PO', async () => {
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });

    const res = await request(app)
      .patch(`/api/v1/purchase-orders/${created.body.id}/close`)
      .send();

    expect(res.status).toBe(409);
  });

  it('returns 404 for missing PO', async () => {
    const res = await request(app)
      .patch('/api/v1/purchase-orders/00000000-0000-0000-0000-000000000099/close')
      .send();
    expect(res.status).toBe(404);
  });
});

describe('Full PO lifecycle (DRAFT → SUBMITTED → CONFIRMED → RECEIVED → CLOSED)', () => {
  it('completes entire lifecycle with history', async () => {
    // Seed inventory record
    await request(app).post(`/api/v1/skus/${skuId1}/inventory/adjustments`).send({
      adjustment: 1,
      reason: 'Seed',
    });

    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 5, unitCost: 25.0 }],
    });
    const poId = created.body.id;

    // Submit
    const submitted = await request(app).patch(`/api/v1/purchase-orders/${poId}/submit`).send();
    expect(submitted.body.status).toBe('SUBMITTED');

    // Confirm
    const confirmed = await request(app).patch(`/api/v1/purchase-orders/${poId}/confirm`).send();
    expect(confirmed.body.status).toBe('CONFIRMED');

    // Receive
    const po = await request(app).get(`/api/v1/purchase-orders/${poId}`);
    const received = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: po.body.lineItems[0].id, quantityReceived: 5 }] });
    expect(received.body.status).toBe('RECEIVED');

    // Close
    const closed = await request(app).patch(`/api/v1/purchase-orders/${poId}/close`).send();
    expect(closed.body.status).toBe('CLOSED');

    // Verify full history
    const history = await request(app).get(`/api/v1/purchase-orders/${poId}/history`);
    expect(history.body).toHaveLength(5); // DRAFT, SUBMITTED, CONFIRMED, RECEIVED, CLOSED
    expect(history.body.map((h: any) => h.toStatus)).toEqual([
      'DRAFT', 'SUBMITTED', 'CONFIRMED', 'RECEIVED', 'CLOSED',
    ]);
  });
});

// ── Receipt idempotency (ZAI-136 AC4) ──────────────────────────────

describe('POST /api/v1/purchase-orders/:poId/receive — idempotency', () => {
  let poId: string;
  let lineId1: string;

  beforeEach(async () => {
    await request(app).post(`/api/v1/skus/${skuId1}/inventory/adjustments`).send({
      adjustment: 100,
      reason: 'Initial stock',
    });

    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });
    poId = created.body.id;

    await request(app).patch(`/api/v1/purchase-orders/${poId}/submit`).send();
    await request(app).patch(`/api/v1/purchase-orders/${poId}/confirm`).send();

    const po = await request(app).get(`/api/v1/purchase-orders/${poId}`);
    lineId1 = po.body.lineItems[0].id;
  });

  it('duplicate receive with same idempotencyKey returns current state without double-posting', async () => {
    const key = 'receipt-unique-key-001';

    const first = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 5, discrepancyReason: 'Short ship' }], idempotencyKey: key });

    expect(first.status).toBe(200);
    expect(first.body.lineItems[0].quantityReceived).toBe(5);

    const beforeInv = await request(app).get(`/api/v1/skus/${skuId1}/inventory`);
    const qtyAfterFirst = beforeInv.body.quantityOnHand;

    // Replay same request
    const second = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 5, discrepancyReason: 'Short ship' }], idempotencyKey: key });

    expect(second.status).toBe(200);
    expect(second.body.lineItems[0].quantityReceived).toBe(5); // unchanged

    const afterInv = await request(app).get(`/api/v1/skus/${skuId1}/inventory`);
    expect(afterInv.body.quantityOnHand).toBe(qtyAfterFirst); // inventory not double-incremented
  });

  it('different idempotencyKeys create separate receipts', async () => {
    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 3, discrepancyReason: 'Partial A' }], idempotencyKey: 'key-a' });

    const second = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 4, discrepancyReason: 'Partial B' }], idempotencyKey: 'key-b' });

    expect(second.status).toBe(200);
    expect(second.body.lineItems[0].quantityReceived).toBe(7); // 3 + 4
  });

  it('receive without idempotencyKey is not deduplicated', async () => {
    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 3, discrepancyReason: 'Partial 1' }] });

    const second = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: lineId1, quantityReceived: 3, discrepancyReason: 'Partial 2' }] });

    expect(second.status).toBe(200);
    expect(second.body.lineItems[0].quantityReceived).toBe(6); // 3 + 3
  });
});

// ── Overdue lead-time exceptions (ZAI-136 AC6) ─────────────────────

describe('GET /api/v1/purchase-orders/overdue-exceptions', () => {
  it('returns empty list when no POs are overdue', async () => {
    const res = await request(app).get('/api/v1/purchase-orders/overdue-exceptions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns overdue POs when vendor lead time has been exceeded', async () => {
    const db = getDb();

    // Create PO, submit, and confirm
    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });
    const poId = created.body.id;

    await request(app).patch(`/api/v1/purchase-orders/${poId}/submit`).send();
    await request(app).patch(`/api/v1/purchase-orders/${poId}/confirm`).send();

    // Backdate the SUBMITTED status history entry to simulate lead time exceeding
    db.prepare(
      "UPDATE po_status_history SET created_at = datetime('now', '-30 days') WHERE po_id = ? AND to_status = 'SUBMITTED'"
    ).run(poId);

    const res = await request(app).get('/api/v1/purchase-orders/overdue-exceptions');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].poId).toBe(poId);
    expect(res.body[0].daysOverdue).toBeGreaterThanOrEqual(1);
    expect(res.body[0].vendorName).toBe('Calzados Premium');
    expect(res.body[0].leadTimeDays).toBe(14);
  });

  it('does not include fully received POs', async () => {
    const db = getDb();

    await request(app).post(`/api/v1/skus/${skuId1}/inventory/adjustments`).send({
      adjustment: 100,
      reason: 'Initial stock',
    });

    const created = await request(app).post('/api/v1/purchase-orders').send({
      vendorId,
      lineItems: [{ skuId: skuId1, quantity: 10, unitCost: 50.0 }],
    });
    const poId = created.body.id;

    await request(app).patch(`/api/v1/purchase-orders/${poId}/submit`).send();
    await request(app).patch(`/api/v1/purchase-orders/${poId}/confirm`).send();

    // Backdate submitted_at
    db.prepare(
      "UPDATE po_status_history SET created_at = datetime('now', '-30 days') WHERE po_id = ? AND to_status = 'SUBMITTED'"
    ).run(poId);

    // Fully receive the PO
    const po = await request(app).get(`/api/v1/purchase-orders/${poId}`);
    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .send({ lines: [{ lineId: po.body.lineItems[0].id, quantityReceived: 10 }] });

    const res = await request(app).get('/api/v1/purchase-orders/overdue-exceptions');
    expect(res.status).toBe(200);
    expect(res.body.find((e: any) => e.poId === poId)).toBeUndefined();
  });
});
