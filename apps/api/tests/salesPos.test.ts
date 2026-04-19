import request from 'supertest';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';
import { resetPosDb } from '../src/db/posDatabase';

const VENDOR_ID = '00000000-0000-0000-0000-000000000001';
const STORE_ID = 1;
const REGISTER_ID = 'reg-main-a';
const CASH_TENDER_ID = 'tt-main-cash';
const CARD_TENDER_ID = 'tt-main-card';

function seedVendor(): void {
  getDb().prepare(
    "INSERT OR IGNORE INTO vendors (id, name, contact_email) VALUES (?, 'Test Vendor', 'vendor@test.com')"
  ).run(VENDOR_ID);
}

function getCategoryId(ricsCode: number): number {
  const row = getDb().prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(ricsCode) as { id: number };
  return row.id;
}

function getBrandId(code: string): number {
  const row = getDb().prepare('SELECT id FROM ref_brands WHERE code = ?').get(code) as { id: number };
  return row.id;
}

function getColorId(code: string): number {
  const row = getDb().prepare('SELECT id FROM ref_colors WHERE code = ?').get(code) as { id: number };
  return row.id;
}

async function createSku(style = 'POS Test Shoe'): Promise<string> {
  const res = await request(app).post('/api/v1/skus').send({
    style,
    price: 100.0,
    department: 'FORMAL',
    vendorId: VENDOR_ID,
    categoryId: getCategoryId(560),
    brandId: getBrandId('KISS'),
    colorId: getColorId('BK'),
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function stockSku(skuId: string, qty: number): Promise<void> {
  const res = await request(app)
    .post(`/api/v1/skus/${skuId}/inventory/adjustments`)
    .send({ adjustment: qty, reason: 'Test seed' });
  expect(res.status).toBe(200);
}

async function openShift(): Promise<string> {
  const res = await request(app).post('/api/v1/shifts').send({
    storeId: STORE_ID,
    registerId: REGISTER_ID,
    openedByUserId: 'cashier-1',
    openingCashFloat: 100,
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

beforeEach(() => {
  resetDb();
  resetPosDb();
  seedVendor();
});

afterAll(() => {
  resetDb();
  resetPosDb();
});

// ---------------------------------------------------------------------------

describe('Shift lifecycle', () => {
  it('opens, produces cash-totals, and closes a shift', async () => {
    const shiftId = await openShift();
    const totals = await request(app).get(`/api/v1/shifts/${shiftId}/cash-totals`);
    expect(totals.status).toBe(200);
    expect(totals.body.salesRecap.ticketCount).toBe(0);

    const close = await request(app).post(`/api/v1/shifts/${shiftId}/close`).send({
      closingCashCount: 100,
      closingDepositCount: 0,
      closedByUserId: 'cashier-1',
    });
    expect(close.status).toBe(200);
    expect(close.body.status).toBe('CLOSED');
    expect(close.body.overShortAmount).toBe(0);
  });

  it('rejects a second open shift on the same register', async () => {
    await openShift();
    const second = await request(app).post('/api/v1/shifts').send({
      storeId: STORE_ID,
      registerId: REGISTER_ID,
      openedByUserId: 'cashier-1',
      openingCashFloat: 50,
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SHIFT_ALREADY_OPEN');
  });
});

// ---------------------------------------------------------------------------

describe('Ticket lifecycle — regular sale', () => {
  let shiftId: string;
  let skuId: string;

  beforeEach(async () => {
    shiftId = await openShift();
    skuId = await createSku();
    await stockSku(skuId, 10);
  });

  it('rings a ticket with one line, tenders cash, and ends it', async () => {
    const created = await request(app).post('/api/v1/tickets').send({
      shiftId,
      cashierUserId: 'cashier-1',
    });
    expect(created.status).toBe(201);
    const ticketId = created.body.id;
    expect(created.body.ticketNumber).toBe(1);
    expect(created.body.postingStatus).toBe('DRAFT');

    const line = await request(app).post(`/api/v1/tickets/${ticketId}/lines`).send({
      skuId,
      quantity: 2,
    });
    expect(line.status).toBe(201);

    const tender = await request(app).post(`/api/v1/tickets/${ticketId}/tenders`).send({
      tenderTypeId: CASH_TENDER_ID,
      amount: 250,
    });
    expect(tender.status).toBe(201);

    const ended = await request(app).post(`/api/v1/tickets/${ticketId}/end`).send({});
    expect(ended.status).toBe(200);
    expect(ended.body.subtotal).toBe(200);
    expect(ended.body.taxTotal).toBe(0);
    expect(ended.body.grandTotal).toBe(200);
    expect(ended.body.changeGiven).toBe(50);
    expect(ended.body.postingStatus).toBe('REALTIME_POSTED');

    // Inventory should be depleted.
    const inv = await request(app).get(`/api/v1/skus/${skuId}/inventory`);
    expect(inv.body.quantityOnHand).toBe(8);
  });

  it('rejects ending a ticket with insufficient tender', async () => {
    const created = await request(app).post('/api/v1/tickets').send({
      shiftId, cashierUserId: 'cashier-1',
    });
    const ticketId = created.body.id;
    await request(app).post(`/api/v1/tickets/${ticketId}/lines`).send({ skuId, quantity: 1 });
    await request(app).post(`/api/v1/tickets/${ticketId}/tenders`).send({
      tenderTypeId: CASH_TENDER_ID, amount: 50,
    });
    const ended = await request(app).post(`/api/v1/tickets/${ticketId}/end`).send({});
    expect(ended.status).toBe(400);
    expect(ended.body.error.code).toBe('INSUFFICIENT_TENDER');
  });

  it('rejects more than 4 split tenders', async () => {
    const created = await request(app).post('/api/v1/tickets').send({
      shiftId, cashierUserId: 'cashier-1',
    });
    const ticketId = created.body.id;
    await request(app).post(`/api/v1/tickets/${ticketId}/lines`).send({ skuId, quantity: 1 });
    for (let i = 0; i < 4; i++) {
      const r = await request(app).post(`/api/v1/tickets/${ticketId}/tenders`).send({
        tenderTypeId: CASH_TENDER_ID, amount: 25,
      });
      expect(r.status).toBe(201);
    }
    const fifth = await request(app).post(`/api/v1/tickets/${ticketId}/tenders`).send({
      tenderTypeId: CARD_TENDER_ID, amount: 10,
    });
    expect(fifth.status).toBe(400);
    expect(fifth.body.error.code).toBe('MAX_SPLIT_TENDERS_EXCEEDED');
  });

  it('splits across cash + card tenders', async () => {
    const created = await request(app).post('/api/v1/tickets').send({
      shiftId, cashierUserId: 'cashier-1',
    });
    const ticketId = created.body.id;
    await request(app).post(`/api/v1/tickets/${ticketId}/lines`).send({ skuId, quantity: 3 });
    await request(app).post(`/api/v1/tickets/${ticketId}/tenders`).send({
      tenderTypeId: CASH_TENDER_ID, amount: 100,
    });
    await request(app).post(`/api/v1/tickets/${ticketId}/tenders`).send({
      tenderTypeId: CARD_TENDER_ID, amount: 200,
    });
    const ended = await request(app).post(`/api/v1/tickets/${ticketId}/end`).send({});
    expect(ended.status).toBe(200);
    expect(ended.body.grandTotal).toBe(300);
    expect(ended.body.tenders).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------

describe('Refund (negative quantity)', () => {
  let shiftId: string;
  let skuId: string;

  beforeEach(async () => {
    shiftId = await openShift();
    skuId = await createSku();
    await stockSku(skuId, 5);
  });

  it('returns stock to inventory when a line has qty < 0', async () => {
    const created = await request(app).post('/api/v1/tickets').send({
      shiftId, cashierUserId: 'cashier-1',
    });
    const ticketId = created.body.id;
    await request(app).post(`/api/v1/tickets/${ticketId}/lines`).send({
      skuId, quantity: -1,
    });
    await request(app).post(`/api/v1/tickets/${ticketId}/tenders`).send({
      tenderTypeId: CASH_TENDER_ID, amount: -100,
    });
    const ended = await request(app).post(`/api/v1/tickets/${ticketId}/end`).send({});
    expect(ended.status).toBe(200);
    expect(ended.body.grandTotal).toBe(-100);

    const inv = await request(app).get(`/api/v1/skus/${skuId}/inventory`);
    expect(inv.body.quantityOnHand).toBe(6);
  });
});

// ---------------------------------------------------------------------------

describe('Void post-end', () => {
  let shiftId: string;
  let skuId: string;

  beforeEach(async () => {
    shiftId = await openShift();
    skuId = await createSku();
    await stockSku(skuId, 10);
  });

  it('reverses inventory when a posted ticket is voided', async () => {
    const created = await request(app).post('/api/v1/tickets').send({
      shiftId, cashierUserId: 'cashier-1',
    });
    const ticketId = created.body.id;
    await request(app).post(`/api/v1/tickets/${ticketId}/lines`).send({ skuId, quantity: 4 });
    await request(app).post(`/api/v1/tickets/${ticketId}/tenders`).send({
      tenderTypeId: CASH_TENDER_ID, amount: 400,
    });
    await request(app).post(`/api/v1/tickets/${ticketId}/end`).send({});

    const invAfterSale = await request(app).get(`/api/v1/skus/${skuId}/inventory`);
    expect(invAfterSale.body.quantityOnHand).toBe(6);

    const voided = await request(app).post(`/api/v1/tickets/${ticketId}/void`).send({
      actorUserId: 'manager-1',
      reason: 'wrong customer',
    });
    expect(voided.status).toBe(200);
    expect(voided.body.postingStatus).toBe('VOIDED_UNPOSTED');
    expect(voided.body.voidedAt).not.toBeNull();

    const invAfterVoid = await request(app).get(`/api/v1/skus/${skuId}/inventory`);
    expect(invAfterVoid.body.quantityOnHand).toBe(10);
  });
});

// ---------------------------------------------------------------------------

describe('Payouts and cash totals', () => {
  let shiftId: string;

  beforeEach(async () => {
    shiftId = await openShift();
  });

  it('records a payout and subtracts it from expected drawer cash', async () => {
    const payout = await request(app).post('/api/v1/pay-outs').send({
      shiftId,
      cashierUserId: 'cashier-1',
      categoryId: 'pc-main-post',
      amount: 15,
      note: 'stamps',
    });
    expect(payout.status).toBe(201);

    const totals = await request(app).get(`/api/v1/shifts/${shiftId}/cash-totals`);
    expect(totals.body.cashDrawerRecap.payouts).toBe(15);
    expect(totals.body.cashDrawerRecap.expectedCashInDrawer).toBe(85);
  });
});

// ---------------------------------------------------------------------------

describe('Reclaim voided draft in same shift', () => {
  let shiftId: string;
  let skuId: string;

  beforeEach(async () => {
    shiftId = await openShift();
    skuId = await createSku();
    await stockSku(skuId, 10);
  });

  it('reclaims a voided draft by creating a new ticket carrying lines forward', async () => {
    const created = await request(app).post('/api/v1/tickets').send({
      shiftId, cashierUserId: 'cashier-1',
    });
    const ticketId = created.body.id;
    await request(app).post(`/api/v1/tickets/${ticketId}/lines`).send({ skuId, quantity: 2 });
    const voided = await request(app).post(`/api/v1/tickets/${ticketId}/void`).send({
      actorUserId: 'manager-1',
    });
    expect(voided.status).toBe(200);

    const reclaimed = await request(app).post(`/api/v1/tickets/${ticketId}/reclaim`).send({
      actorUserId: 'cashier-1',
    });
    expect(reclaimed.status).toBe(201);
    expect(reclaimed.body.id).not.toBe(ticketId);
    expect(reclaimed.body.postingStatus).toBe('DRAFT');
    expect(reclaimed.body.lines).toHaveLength(1);
    expect(reclaimed.body.reclaimedFromTicketId).toBe(ticketId);
  });
});

// ---------------------------------------------------------------------------

describe('Sales passwords', () => {
  it('rotates and verifies the manager password', async () => {
    const set = await request(app).put('/api/v1/pos/stores/1/sales-passwords/MANAGER').send({
      plain: 'hunter2',
      updatedByUserId: 'admin',
    });
    expect(set.status).toBe(200);

    const ok = await request(app).post('/api/v1/pos/stores/1/sales-passwords/MANAGER/verify').send({
      plain: 'hunter2',
    });
    expect(ok.status).toBe(200);

    const bad = await request(app).post('/api/v1/pos/stores/1/sales-passwords/MANAGER/verify').send({
      plain: 'wrong',
    });
    expect(bad.status).toBe(401);
  });

  it('requires the manager password on shift close when set', async () => {
    await request(app).put('/api/v1/pos/stores/1/sales-passwords/MANAGER').send({
      plain: 'hunter2',
      updatedByUserId: 'admin',
    });
    const shiftId = await openShift();
    const closeNoPw = await request(app).post(`/api/v1/shifts/${shiftId}/close`).send({
      closingCashCount: 100, closingDepositCount: 0, closedByUserId: 'cashier-1',
    });
    expect(closeNoPw.status).toBe(401);

    const closeOk = await request(app).post(`/api/v1/shifts/${shiftId}/close`).send({
      closingCashCount: 100, closingDepositCount: 0, closedByUserId: 'cashier-1',
      managerPassword: 'hunter2',
    });
    expect(closeOk.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------

describe('Reports', () => {
  let shiftId: string;
  let skuId: string;

  beforeEach(async () => {
    shiftId = await openShift();
    skuId = await createSku();
    await stockSku(skuId, 10);
    const c = await request(app).post('/api/v1/tickets').send({
      shiftId, cashierUserId: 'cashier-1', promotionCode: 'SPRING25',
    });
    await request(app).post(`/api/v1/tickets/${c.body.id}/lines`).send({ skuId, quantity: 2 });
    await request(app).post(`/api/v1/tickets/${c.body.id}/tenders`).send({
      tenderTypeId: CASH_TENDER_ID, amount: 200,
    });
    await request(app).post(`/api/v1/tickets/${c.body.id}/end`).send({});
  });

  it('produces sales-by-day and promotion-code-analysis', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const sbd = await request(app)
      .get(`/api/v1/reports/pos/sales-by-day?from=${today}&to=${today}`);
    expect(sbd.status).toBe(200);
    expect(Array.isArray(sbd.body.current)).toBe(true);
    expect(sbd.body.current.length).toBeGreaterThanOrEqual(1);

    const promo = await request(app)
      .get(`/api/v1/reports/pos/promotion-code-analysis?from=${today}&to=${today}`);
    expect(promo.status).toBe(200);
    expect(promo.body.rows.length).toBeGreaterThanOrEqual(1);
    expect(promo.body.rows[0].promotion_code).toBe('SPRING25');
  });

  it('surfaces posted tickets in reprint-posted-sales', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/v1/reports/pos/reprint-posted-sales?from=${today}&to=${today}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('Registers and tender types', () => {
  it('lists seed registers and tender types for store 1', async () => {
    const regs = await request(app).get('/api/v1/pos/registers?storeId=1');
    expect(regs.status).toBe(200);
    expect(regs.body.registers.some((r: any) => r.id === REGISTER_ID)).toBe(true);

    const tenders = await request(app).get('/api/v1/pos/stores/1/tender-types');
    expect(tenders.status).toBe(200);
    expect(tenders.body.tenderTypes.find((t: any) => t.tenderKind === 'CASH')).toBeDefined();
  });
});
