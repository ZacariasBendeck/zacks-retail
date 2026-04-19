import request from 'supertest';
import app from '../src/app';
import { resetDb } from '../src/db/database';

async function createCustomer(extra: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/v1/customers')
    .send({
      firstName: 'Mary',
      lastName: 'Johnson',
      phoneE164: '+15551234567',
      ...extra,
    });
  expect(res.status).toBe(201);
  return res.body.id;
}

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  resetDb();
});

describe('Special Orders (pp. 36-37)', () => {
  it('creates a special order with a deposit + lists for customer', async () => {
    const customerId = await createCustomer();
    const res = await request(app).post('/api/v1/customer-transactions/special-orders').send({
      customerId,
      storeId: 1,
      depositTicketId: 'ticket-dep-1',
      depositAmount: 25,
      lines: [{ draftSkuCode: 'CUSTOM-01', draftDescription: 'Red size 7', quantity: 1, price: 100 }],
      notes: 'Customer wants them for wedding',
      createdBy: 'cashier-1',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('OPEN_DEPOSITED');
    expect(res.body.totalOrdered).toBe(100);
    expect(res.body.depositPaid).toBe(25);
    expect(res.body.balanceDue).toBe(75);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.deposits).toHaveLength(1);

    const list = await request(app).get(`/api/v1/customer-transactions/special-orders/customer/${customerId}`);
    expect(list.body.data).toHaveLength(1);
  });

  it('rejects pickup while draft SKU is unresolved', async () => {
    const customerId = await createCustomer();
    const so = (await request(app).post('/api/v1/customer-transactions/special-orders').send({
      customerId, storeId: 1, depositTicketId: 't1', depositAmount: 10,
      lines: [{ draftSkuCode: 'DRAFT', quantity: 1, price: 50 }],
      createdBy: 'c1',
    })).body;
    const pickup = await request(app)
      .post(`/api/v1/customer-transactions/special-orders/${so.id}/pickup`)
      .send({ pickupTicketId: 't2' });
    expect(pickup.status).toBe(409);
    expect(pickup.body.error.code).toBe('SPECIAL_ORDER_HAS_UNRESOLVED_DRAFT_SKUS');
  });

  it('picks up a special order after draft is resolved', async () => {
    const customerId = await createCustomer();
    const so = (await request(app).post('/api/v1/customer-transactions/special-orders').send({
      customerId, storeId: 1, depositTicketId: 't1', depositAmount: 10,
      lines: [{ draftSkuCode: 'DRAFT', quantity: 1, price: 50 }],
      createdBy: 'c1',
    })).body;
    const lineId = so.lines[0].id;
    await request(app)
      .patch(`/api/v1/customer-transactions/special-orders/lines/${lineId}/resolve-sku`)
      .send({ skuId: 'real-sku-123' })
      .expect(204);
    const pickup = await request(app)
      .post(`/api/v1/customer-transactions/special-orders/${so.id}/pickup`)
      .send({ pickupTicketId: 't2' });
    expect(pickup.status).toBe(200);
    expect(pickup.body.status).toBe('PICKED_UP');
    expect(pickup.body.pickupTicketId).toBe('t2');
  });

  it('refunds an open-deposited special order', async () => {
    const customerId = await createCustomer();
    const so = (await request(app).post('/api/v1/customer-transactions/special-orders').send({
      customerId, storeId: 1, depositTicketId: 't1', depositAmount: 10,
      lines: [{ draftDescription: 'a', quantity: 1, price: 50 }],
      createdBy: 'c1',
    })).body;
    const r = await request(app)
      .post(`/api/v1/customer-transactions/special-orders/${so.id}/refund`)
      .send({ refundTicketId: 't2' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('REFUNDED');
  });
});

describe('Layaways (pp. 38-39)', () => {
  it('creates a layaway with an initial payment', async () => {
    const customerId = await createCustomer();
    const res = await request(app).post('/api/v1/customer-transactions/layaways').send({
      customerId, storeId: 1, originalTicketId: 't1',
      initialPayment: 20,
      lines: [{ skuId: 'sku-1', quantity: 1, price: 100 }],
      createdBy: 'c1',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.totalOriginallyDue).toBe(100);
    expect(res.body.totalPaid).toBe(20);
    expect(res.body.balance).toBe(80);
    expect(res.body.payments).toHaveLength(1);
  });

  it('records payments and transitions to PICKED_UP when balance hits 0', async () => {
    const customerId = await createCustomer();
    const layaway = (await request(app).post('/api/v1/customer-transactions/layaways').send({
      customerId, storeId: 1, originalTicketId: 't1',
      initialPayment: 20,
      lines: [{ skuId: 'sku-1', quantity: 1, price: 100 }],
      createdBy: 'c1',
    })).body;
    const p1 = await request(app)
      .post(`/api/v1/customer-transactions/layaways/${layaway.id}/payments`)
      .send({ ticketId: 't2', amount: 30 });
    expect(p1.status).toBe(200);
    expect(p1.body.balance).toBe(50);
    const p2 = await request(app)
      .post(`/api/v1/customer-transactions/layaways/${layaway.id}/payments`)
      .send({ ticketId: 't3', amount: 50 });
    expect(p2.status).toBe(200);
    expect(p2.body.balance).toBe(0);
    expect(p2.body.status).toBe('PICKED_UP');
    expect(p2.body.payments[p2.body.payments.length - 1].isPickup).toBe(true);
  });

  it('rejects payment that would overpay', async () => {
    const customerId = await createCustomer();
    const layaway = (await request(app).post('/api/v1/customer-transactions/layaways').send({
      customerId, storeId: 1, originalTicketId: 't1',
      initialPayment: 20,
      lines: [{ skuId: 'sku-1', quantity: 1, price: 100 }],
      createdBy: 'c1',
    })).body;
    const p = await request(app)
      .post(`/api/v1/customer-transactions/layaways/${layaway.id}/payments`)
      .send({ ticketId: 't2', amount: 200 });
    expect(p.status).toBe(400);
    expect(p.body.error.code).toBe('PAYMENT_OVERPAYMENT');
  });

  it('refunds an active layaway', async () => {
    const customerId = await createCustomer();
    const layaway = (await request(app).post('/api/v1/customer-transactions/layaways').send({
      customerId, storeId: 1, originalTicketId: 't1',
      initialPayment: 20,
      lines: [{ skuId: 'sku-1', quantity: 1, price: 100 }],
      createdBy: 'c1',
    })).body;
    const r = await request(app)
      .post(`/api/v1/customer-transactions/layaways/${layaway.id}/refund`)
      .send({ refundTicketId: 't2' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('REFUNDED');
  });
});

describe('Gift Certificates (pp. 40, 131-132)', () => {
  it('issues a gift certificate with an auto-number', async () => {
    const customerId = await createCustomer();
    const res = await request(app).post('/api/v1/customer-transactions/gift-certificates/issue').send({
      amount: 50,
      purchaserCustomerId: customerId,
      purchaseTicketId: 't1',
      purchaseStoreId: 1,
    });
    expect(res.status).toBe(201);
    expect(res.body.certificateNo).toMatch(/^\d{6,}$/);
    expect(res.body.originalAmount).toBe(50);
    expect(res.body.balance).toBe(50);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('redeems a gift certificate partially and then fully', async () => {
    const issued = (await request(app).post('/api/v1/customer-transactions/gift-certificates/issue').send({
      amount: 100, purchaseTicketId: 't1', purchaseStoreId: 1,
    })).body;
    const r1 = await request(app)
      .post(`/api/v1/customer-transactions/gift-certificates/${issued.id}/redeem`)
      .send({ amount: 40, ticketId: 'r1', storeId: 1, enteredBy: 'c1' });
    expect(r1.body.balance).toBe(60);
    expect(r1.body.status).toBe('ACTIVE');
    const r2 = await request(app)
      .post(`/api/v1/customer-transactions/gift-certificates/${issued.id}/redeem`)
      .send({ amount: 60, ticketId: 'r2', storeId: 1, enteredBy: 'c1' });
    expect(r2.body.balance).toBe(0);
    expect(r2.body.status).toBe('FULLY_REDEEMED');
    const txns = await request(app)
      .get(`/api/v1/customer-transactions/gift-certificates/${issued.id}/transactions`);
    expect(txns.body.data).toHaveLength(2);
  });

  it('rejects redemption exceeding the balance', async () => {
    const issued = (await request(app).post('/api/v1/customer-transactions/gift-certificates/issue').send({
      amount: 10, purchaseTicketId: 't1', purchaseStoreId: 1,
    })).body;
    const r = await request(app)
      .post(`/api/v1/customer-transactions/gift-certificates/${issued.id}/redeem`)
      .send({ amount: 20, ticketId: 'r1', storeId: 1, enteredBy: 'c1' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('GIFT_CERT_INSUFFICIENT_BALANCE');
  });

  it('looks up by certificate number', async () => {
    const issued = (await request(app).post('/api/v1/customer-transactions/gift-certificates/issue').send({
      certificateNo: 'ABC-100', amount: 25, purchaseTicketId: 't1', purchaseStoreId: 1,
    })).body;
    const lookup = await request(app).get(`/api/v1/customer-transactions/gift-certificates/by-no/ABC-100`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.id).toBe(issued.id);
  });

  it('backfills a pre-existing certificate via maintenance', async () => {
    const res = await request(app).post('/api/v1/customer-transactions/gift-certificates/backfill').send({
      certificateNo: 'LEGACY-99',
      amount: 200,
      redeemed: 75,
    });
    expect(res.status).toBe(201);
    expect(res.body.origin).toBe('MAINTENANCE_BACKFILL');
    expect(res.body.balance).toBe(125);
  });
});

describe('House Charges (pp. 40-41)', () => {
  it('records a charge and computes balance', async () => {
    const customerId = await createCustomer();
    const r1 = await request(app).post('/api/v1/customer-transactions/house-charges').send({
      customerId, storeId: 1, ticketId: 't1', kind: 'CHARGE', amount: 150,
    });
    expect(r1.status).toBe(201);
    const bal1 = await request(app).get(`/api/v1/customer-transactions/house-charges/customer/${customerId}/balance`);
    expect(bal1.body.balance).toBe(150);

    const r2 = await request(app).post('/api/v1/customer-transactions/house-charges').send({
      customerId, storeId: 1, ticketId: 't2', kind: 'PAYMENT', amount: 50, tenderType: 'CASH',
    });
    expect(r2.status).toBe(201);
    const bal2 = await request(app).get(`/api/v1/customer-transactions/house-charges/customer/${customerId}/balance`);
    expect(bal2.body.balance).toBe(100);
  });

  it('rejects non-positive amounts', async () => {
    const customerId = await createCustomer();
    const r = await request(app).post('/api/v1/customer-transactions/house-charges').send({
      customerId, storeId: 1, ticketId: 't1', kind: 'CHARGE', amount: 0,
    });
    expect(r.status).toBe(400);
  });

  it('returns 404 for unknown customer on charge', async () => {
    const r = await request(app).post('/api/v1/customer-transactions/house-charges').send({
      customerId: '00000000-0000-0000-0000-000000000099',
      storeId: 1, ticketId: 't1', kind: 'CHARGE', amount: 50,
    });
    expect(r.status).toBe(404);
  });
});
