import request from 'supertest';
import app from '../src/app';
import { resetDb } from '../src/db/database';

let vendorId: string;
let skuId1: string;
let skuId2: string;

async function seedVendorAndSkus() {
  const vendor = await request(app).post('/api/v1/vendors').send({
    name: 'Calzados Premium',
    contactEmail: 'ventas@calzados.com',
    paymentTerms: 'NET_30',
  });
  vendorId = vendor.body.id;

  const sku1 = await request(app).post('/api/v1/skus').send({
    brand: 'Nike',
    style: 'Air Max',
    color: 'Black',
    size: '9',
    price: 129.99,
    category: 560,
    department: 'FORMAL',
    vendorId,
  });
  skuId1 = sku1.body.id;

  const sku2 = await request(app).post('/api/v1/skus').send({
    brand: 'Adidas',
    style: 'Superstar',
    color: 'White',
    size: '10',
    price: 99.99,
    category: 565,
    department: 'CASUAL',
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
