import request from 'supertest';
import app from '../src/app';
import { resetDb } from '../src/db/database';
import { prisma } from '../src/db/prisma';

jest.setTimeout(30000);

const TEST_APP_ACCOUNT_PREFIX = 'TAC';
const TEST_APP_PHONE_PREFIX = '+555000';
const TEST_APP_EMAIL_DOMAIN = '@customer-route-test.local';
const TEST_IMPORTED_SOURCE = 'customer_route_test_imported';
const TEST_TICKET_VENDOR_CODE = 'ZV99';
const TEST_TICKET_DEPARTMENT_NUMBER = 0;
const TEST_TICKET_SKU_CODE = 'CTHISTSKU01';

function makeTestAccountNumber(suffix: string): string {
  const normalized = suffix.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `${TEST_APP_ACCOUNT_PREFIX}${normalized}`.slice(0, 15);
}

function makeValidCustomer(suffix = 'DEFAULT') {
  return {
    accountNumber: makeTestAccountNumber(suffix),
    firstName: 'Mary',
    lastName: 'Johnson',
    phoneE164: `${TEST_APP_PHONE_PREFIX}${suffix.replace(/\D/g, '').padStart(5, '0').slice(0, 5)}`,
    email: `mary-${suffix.toLowerCase()}${TEST_APP_EMAIL_DOMAIN}`,
    addressLine1: '123 Main St',
    city: 'Austin',
    stateRegion: 'TX',
    postalCode: '78701',
    country: 'USA',
    creditLimit: 500,
  };
}

async function cleanupAppFixtures(): Promise<void> {
  await prisma.customerIntelligenceCustomer.deleteMany({
    where: {
      source: 'app_manual',
      OR: [
        { ricsCode: { startsWith: TEST_APP_ACCOUNT_PREFIX } },
        { contacts: { some: { value: { endsWith: TEST_APP_EMAIL_DOMAIN } } } },
      ],
    },
  });
  await prisma.customer.deleteMany({
    where: {
      OR: [
        { accountNumber: { startsWith: TEST_APP_ACCOUNT_PREFIX } },
        { email: { endsWith: TEST_APP_EMAIL_DOMAIN } },
        { phoneE164: { startsWith: TEST_APP_PHONE_PREFIX } },
      ],
    },
  });
}

async function cleanupImportedFixtures(): Promise<void> {
  await prisma.salesHistoryTicket.deleteMany({
    where: { source: TEST_IMPORTED_SOURCE },
  });
  await prisma.sku.deleteMany({
    where: { createdBy: TEST_IMPORTED_SOURCE },
  });
  await prisma.vendor.deleteMany({
    where: { code: TEST_TICKET_VENDOR_CODE },
  });
  await prisma.taxonomyDepartment.deleteMany({
    where: { number: TEST_TICKET_DEPARTMENT_NUMBER },
  });
  await prisma.customerIntelligenceCustomer.deleteMany({
    where: { source: TEST_IMPORTED_SOURCE },
  });
}

async function insertImportedCustomerFixture(input: {
  account: string;
  name: string;
  city?: string | null;
  state?: string | null;
  email?: string | null;
  currentBalance?: number;
  storeCredit?: number;
  dateAdded?: Date;
  dateLastPurchase?: Date | null;
  ytdSales?: number;
}): Promise<{ id: string }> {
  return prisma.customerIntelligenceCustomer.create({
    data: {
      source: TEST_IMPORTED_SOURCE,
      status: 'active',
      ricsAccount: input.account,
      fullName: input.name,
      ricsDateAdded: input.dateAdded ?? new Date('2026-04-01T00:00:00.000Z'),
      ricsDateLastChanged: input.dateAdded ?? new Date('2026-04-01T00:00:00.000Z'),
      contacts:
        input.email == null
          ? undefined
          : {
              create: [
                {
                  contactType: 'email',
                  value: input.email,
                  normalizedValue: input.email.toLowerCase(),
                  isPrimary: true,
                  source: TEST_IMPORTED_SOURCE,
                },
              ],
            },
      addresses:
        input.city == null && input.state == null
          ? undefined
          : {
              create: [
                {
                  city: input.city ?? null,
                  state: input.state ?? null,
                  country: 'HN',
                  source: TEST_IMPORTED_SOURCE,
                },
              ],
            },
      financialProfile: {
        create: {
          currentBalance: input.currentBalance ?? 0,
          creditSlipBalance: input.storeCredit ?? 0,
        },
      },
      salesSummaryLegacy: {
        create: {
          dateLastPurchase: input.dateLastPurchase ?? null,
          dollarSales02: input.ytdSales ?? 0,
        },
      },
    },
    select: { id: true },
  });
}

async function insertImportedSalesTicketFixture(input: {
  account: string;
  matchedCustomerId?: string | null;
  ticketNumber?: number;
  purchasedAt: Date;
  totalAmount: number;
  netAmount?: number;
  costAmount?: number;
  discountAmount?: number;
  quantity?: number;
  status?: 'completed' | 'cancelled' | 'refunded';
  transactionKind?: 'purchase' | 'return';
  categoryKey?: string | null;
  skuId?: string | null;
  skuCode?: string | null;
}): Promise<void> {
  await prisma.salesHistoryTicket.create({
    data: {
      source: TEST_IMPORTED_SOURCE,
      externalTransactionId: `${input.account}:${input.ticketNumber ?? input.purchasedAt.getTime()}`,
      matchedCustomerId: input.matchedCustomerId ?? null,
      accountKey: input.account,
      transactionType: 1,
      transactionKind: input.transactionKind ?? 'purchase',
      status: input.status ?? 'completed',
      storeId: 7,
      terminal: 'T1',
      ticketNumber: input.ticketNumber ?? 1,
      cashierCode: 'TEST',
      channel: 'store',
      totalAmount: input.totalAmount,
      netAmount: input.netAmount ?? input.totalAmount,
      costAmount: input.costAmount ?? 0,
      discountAmount: input.discountAmount ?? 0,
      purchasedAt: input.purchasedAt,
      lines: {
        create: [
          {
            lineNumber: 1,
            skuId: input.skuId ?? null,
            skuCode: input.skuCode ?? null,
            categoryKey: input.categoryKey ?? null,
            quantity: input.quantity ?? 1,
            unitPrice: input.netAmount ?? input.totalAmount,
            unitCost: input.costAmount ?? 0,
            netAmount: input.netAmount ?? input.totalAmount,
            costAmount: input.costAmount ?? 0,
            discountAmount: input.discountAmount ?? 0,
            isMarkdown: false,
            isReturn: false,
          },
        ],
      },
    },
  });
}

async function createTicketHistorySkuFixture(): Promise<{ id: string }> {
  await prisma.taxonomyDepartment.upsert({
    where: { number: TEST_TICKET_DEPARTMENT_NUMBER },
    update: {
      description: 'Test Dresses',
      begCateg: 1,
      endCateg: 199,
    },
    create: {
      number: TEST_TICKET_DEPARTMENT_NUMBER,
      description: 'Test Dresses',
      begCateg: 1,
      endCateg: 199,
    },
  });

  await prisma.vendor.upsert({
    where: { code: TEST_TICKET_VENDOR_CODE },
    update: {
      shortName: 'Test Vendor',
      mailName: 'Test Vendor',
    },
    create: {
      code: TEST_TICKET_VENDOR_CODE,
      shortName: 'Test Vendor',
      mailName: 'Test Vendor',
    },
  });

  return prisma.sku.create({
    data: {
      provisionalCode: `${TEST_TICKET_SKU_CODE}-PROV`,
      code: TEST_TICKET_SKU_CODE,
      skuState: 'ACTIVE',
      categoryNumber: 101,
      vendorId: TEST_TICKET_VENDOR_CODE,
      descriptionRics: 'Customer Ticket History SKU',
      retailPrice: 100,
      markDownPrice1: 90,
      markDownPrice2: 80,
      listPrice: 110,
      currentCost: 35,
      currentPriceSlot: 'RETAIL',
      createdBy: TEST_IMPORTED_SOURCE,
      activatedAt: new Date('2026-04-01T00:00:00.000Z'),
      activatedBy: TEST_IMPORTED_SOURCE,
      source: 'app',
    },
    select: { id: true },
  });
}

async function cleanupFixtures(): Promise<void> {
  await cleanupImportedFixtures();
  await cleanupAppFixtures();
}

async function createAppCustomer(suffix: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/v1/customers')
    .send({ ...makeValidCustomer(suffix), ...overrides });
}

// Customers + family_members live in Postgres now; `resetDb()` only resets the
// legacy SQLite admin DB that other tests still depend on. Customer-route tests
// now scope their Postgres fixtures by disposable prefixes/source markers so
// they do not touch imported operator data.
beforeEach(async () => {
  resetDb();
  await cleanupFixtures();
});

afterAll(async () => {
  resetDb();
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe('POST /api/v1/customers', () => {
  it('creates a customer and derives account number from phone', async () => {
    const payload = makeValidCustomer('DERIVED');
    delete payload.accountNumber;
    const expectedAccountNumber = payload.phoneE164.replace(/\D/g, '');
    const res = await request(app).post('/api/v1/customers').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.firstName).toBe('Mary');
    expect(res.body.lastName).toBe('Johnson');
    expect(res.body.displayName).toBe('JOHNSON, Mary');
    // Phone-derived account number, digits only (RICS p. 117)
    expect(res.body.accountNumber).toBe(expectedAccountNumber);
    expect(res.body.creditLimit).toBe(500);
    expect(res.body.active).toBe(true);
    expect(res.body.alertFlag).toBe(false);
  });

  it('accepts an explicit account number', async () => {
    const res = await createAppCustomer('EXPLICIT', { accountNumber: 'TACVIP001' });
    expect(res.status).toBe(201);
    expect(res.body.accountNumber).toBe('TACVIP001');
  });

  it('returns 409 on duplicate account number', async () => {
    await createAppCustomer('DUPE-1', { accountNumber: 'TACDUPE' });
    const res = await createAppCustomer('DUPE-2', {
      accountNumber: 'TACDUPE',
      firstName: 'Other',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_NUMBER_CONFLICT');
  });

  it('rejects invalid email', async () => {
    const res = await createAppCustomer('BADMAIL', { email: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('stores ALERT flag and message as structured fields (not magic-string Comments)', async () => {
    const res = await createAppCustomer('ALERT', {
      alertFlag: true,
      alertMessage: 'Bad check writer',
    });
    expect(res.status).toBe(201);
    expect(res.body.alertFlag).toBe(true);
    expect(res.body.alertMessage).toBe('Bad check writer');
  });
});

describe('GET /api/v1/customers', () => {
  it('includes app-created customers in the Postgres-backed list', async () => {
    const created = await createAppCustomer('LISTAPP', { lastName: 'Listapp' });
    expect(created.status).toBe(201);

    const res = await request(app).get('/api/v1/customers?q=Listapp');
    expect(res.status).toBe(200);
    expect(res.body.data.some((customer: { id: string; source: string; lastName: string }) => (
      customer.id === created.body.id &&
      customer.source === 'app' &&
      customer.lastName === 'LISTAPP'
    ))).toBe(true);
  });

  it('returns paginated customers sorted by displayName', async () => {
    await insertImportedCustomerFixture({
      account: 'TEST-IMPORTED-SORT-2',
      name: 'SORTTESTZIMMERMAN, Mary',
    });
    await insertImportedCustomerFixture({
      account: 'TEST-IMPORTED-SORT-1',
      name: 'SORTTESTADAMS, Mary',
    });
    const res = await request(app).get('/api/v1/customers?sort=displayName&order=asc&q=SORTTEST');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].source).toBe('imported');
    expect(res.body.data[0].lastName).toBe('SORTTESTADAMS');
    expect(res.body.data[1].lastName).toBe('SORTTESTZIMMERMAN');
    expect(res.body.pagination.totalItems).toBe(2);
  });

  it('filters by q', async () => {
    await insertImportedCustomerFixture({
      account: 'TEST-IMPORTED-FILTER-1',
      name: 'FILTERJOHNSON, Mary',
    });
    await insertImportedCustomerFixture({
      account: 'TEST-IMPORTED-FILTER-2',
      name: 'FILTERSMITH, Mary',
    });
    const res = await request(app).get('/api/v1/customers?q=FILTERJOHNSON');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].lastName).toBe('FILTERJOHNSON');
  });

  it('loads customer sales columns from sales tickets instead of legacy customer summary fields', async () => {
    await insertImportedCustomerFixture({
      account: 'TEST-IMPORTED-TICKET-SALES-1',
      name: 'TICKETSALES, Maria',
      dateLastPurchase: new Date('2025-01-15T00:00:00.000Z'),
      ytdSales: 12.5,
    });
    await insertImportedSalesTicketFixture({
      account: 'TEST-IMPORTED-TICKET-SALES-1',
      purchasedAt: new Date('2026-04-20T12:00:00.000Z'),
      totalAmount: 115,
      netAmount: 100,
      quantity: 2,
      ticketNumber: 501,
    });

    const res = await request(app).get('/api/v1/customers?q=TICKETSALES');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].accountNumber).toBe('TEST-IMPORTED-TICKET-SALES-1');
    expect(res.body.data[0].ytdSalesCents).toBe(11500);
    expect(res.body.data[0].dateOfLastPurchase).toBe('2026-04-20T12:00:00.000Z');
  });
});

describe('GET /api/v1/customers/search', () => {
  it('returns typeahead matches', async () => {
    await createAppCustomer('SEARCH-1', {
      firstName: 'Mary',
      lastName: 'Searchjohnson',
      phoneE164: '+15551111111',
    });
    const res = await request(app).get('/api/v1/customers/search?q=Searchjohnson');
    expect(res.status).toBe(200);
    expect(res.body.data.some((customer: { source: string; lastName: string }) => (
      customer.source === 'app' && customer.lastName === 'Searchjohnson'
    ))).toBe(true);
  });

  it('returns empty array for no matches', async () => {
    await createAppCustomer('SEARCH-NONE');
    const res = await request(app).get('/api/v1/customers/search?q=xyz123notfound');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('requires q param', async () => {
    const res = await request(app).get('/api/v1/customers/search');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/customers/:id', () => {
  it('returns customer with family members', async () => {
    const created = (await createAppCustomer('DETAIL-APP')).body;
    await request(app)
      .post(`/api/v1/customers/${created.id}/family`)
      .send({ code: 'S1', firstName: 'Sarah', gender: 'F' });
    const res = await request(app).get(`/api/v1/customers/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.familyMembers).toHaveLength(1);
    expect(res.body.familyMembers[0].firstName).toBe('Sarah');
    expect(res.body.familyMembers[0].code).toBe('S1');
  });

  it('returns 404 for missing customer', async () => {
    const res = await request(app).get('/api/v1/customers/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });

  it('returns imported customer when looked up by account number', async () => {
    await insertImportedCustomerFixture({
      account: 'TEST-IMPORTED-DETAIL-1',
      name: 'DETAILMOTHER, Maria',
      email: 'detailmother@customer-route-test.local',
    });

    const res = await request(app).get('/api/v1/customers/TEST-IMPORTED-DETAIL-1');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('imported');
    expect(res.body.accountNumber).toBe('TEST-IMPORTED-DETAIL-1');
    expect(res.body.familyMembers).toEqual([]);
  });

  it('returns imported customer detail sales from sales tickets', async () => {
    const imported = await insertImportedCustomerFixture({
      account: 'TEST-IMPORTED-DETAIL-TICKET-1',
      name: 'DETAILTICKET, Maria',
      ytdSales: 9,
      dateLastPurchase: new Date('2025-02-01T00:00:00.000Z'),
    });
    await insertImportedSalesTicketFixture({
      account: 'TEST-IMPORTED-DETAIL-TICKET-1',
      matchedCustomerId: imported.id,
      purchasedAt: new Date('2026-04-22T10:30:00.000Z'),
      totalAmount: 230,
      netAmount: 200,
      quantity: 3,
      ticketNumber: 777,
    });

    const res = await request(app).get(`/api/v1/customers/${imported.id}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('imported');
    expect(res.body.ytdSalesCents).toBe(23000);
    expect(res.body.dateOfLastPurchase).toBe('2026-04-22T10:30:00.000Z');
  });
});

describe('GET /api/v1/customers/:id/tickets', () => {
  it('lists purchase tickets newest first for the customer', async () => {
    const imported = await insertImportedCustomerFixture({
      account: 'TEST-IMPORTED-TICKET-HISTORY-1',
      name: 'TICKETHISTORY, Maria',
    });
    const sku = await createTicketHistorySkuFixture();

    await insertImportedSalesTicketFixture({
      account: 'TEST-IMPORTED-TICKET-HISTORY-1',
      purchasedAt: new Date('2026-04-10T09:00:00.000Z'),
      totalAmount: 115,
      netAmount: 100,
      costAmount: 40,
      quantity: 2,
      ticketNumber: 101,
      skuId: sku.id,
      skuCode: TEST_TICKET_SKU_CODE,
      categoryKey: '929',
    });
    await insertImportedSalesTicketFixture({
      account: 'TEST-IMPORTED-TICKET-HISTORY-1',
      matchedCustomerId: imported.id,
      purchasedAt: new Date('2026-04-21T14:30:00.000Z'),
      totalAmount: 230,
      netAmount: 200,
      costAmount: 70,
      quantity: 3,
      ticketNumber: 305,
      skuId: sku.id,
      skuCode: TEST_TICKET_SKU_CODE,
      categoryKey: '101',
    });
    await insertImportedSalesTicketFixture({
      account: 'TEST-IMPORTED-TICKET-HISTORY-1',
      purchasedAt: new Date('2026-04-22T10:00:00.000Z'),
      totalAmount: -57.5,
      netAmount: -50,
      quantity: -1,
      ticketNumber: 401,
      transactionKind: 'return',
    });
    await insertImportedSalesTicketFixture({
      account: 'TEST-IMPORTED-TICKET-HISTORY-1',
      purchasedAt: new Date('2026-04-23T10:00:00.000Z'),
      totalAmount: 57.5,
      netAmount: 50,
      quantity: 1,
      ticketNumber: 402,
      status: 'cancelled',
    });

    const res = await request(app).get(`/api/v1/customers/${imported.id}/tickets`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].ticketNumber).toBe(305);
    expect(res.body.data[0].purchasedAt).toBe('2026-04-21T14:30:00.000Z');
    expect(res.body.data[0].vendorSummary).toBe('Test Vendor');
    expect(res.body.data[0].categorySummary).toBe('Test Dresses');
    expect(res.body.data[0].totalAmountCents).toBe(23000);
    expect(res.body.data[0].grossProfitPct).toBe(65);
    expect(res.body.data[0].quantity).toBe(3);
    expect(res.body.data[1].ticketNumber).toBe(101);
    expect(res.body.data[1].purchasedAt).toBe('2026-04-10T09:00:00.000Z');
    expect(res.body.data[1].vendorSummary).toBe('Test Vendor');
    expect(res.body.data[1].categorySummary).toBeNull();
  });

  it('returns 404 when the customer does not exist', async () => {
    const res = await request(app).get('/api/v1/customers/does-not-exist/tickets');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/v1/customers/by-account/:accountNumber', () => {
  it('finds customer by account number', async () => {
    const created = (await createAppCustomer('ACC001', { accountNumber: 'TACACC001' })).body;
    const res = await request(app).get('/api/v1/customers/by-account/TACACC001');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
  });

  it('finds imported customer by account number', async () => {
    const imported = await insertImportedCustomerFixture({
      account: 'TEST-IMPORTED-BY-ACCOUNT-1',
      name: 'ACCOUNTLOOKUP, Maria',
    });
    const res = await request(app).get('/api/v1/customers/by-account/TEST-IMPORTED-BY-ACCOUNT-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(imported.id);
    expect(res.body.source).toBe('imported');
  });

  it('returns 404 for missing account', async () => {
    const res = await request(app).get('/api/v1/customers/by-account/NOTHERE');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/customers/:id/balances', () => {
  it('returns placeholder balances for Stage 1', async () => {
    const created = (await createAppCustomer('BALANCES-APP')).body;
    const res = await request(app).get(`/api/v1/customers/${created.id}/balances`);
    expect(res.status).toBe(200);
    expect(res.body.arBalanceCents).toBe(0);
    expect(res.body.storeCreditCents).toBe(0);
    expect(res.body.arBalanceAsOf).toBeNull();
    expect(res.body.storeCreditAsOf).toBeNull();
  });

  it('returns balances projected from the imported customer row', async () => {
    await insertImportedCustomerFixture({
      account: 'TEST-IMPORTED-BAL-1',
      name: 'BALANCES, Maria',
      currentBalance: 125.5,
      storeCredit: 20.25,
      dateLastPurchase: new Date('2026-04-08T00:00:00.000Z'),
    });

    const res = await request(app).get('/api/v1/customers/TEST-IMPORTED-BAL-1/balances');
    expect(res.status).toBe(200);
    expect(res.body.arBalanceCents).toBe(12550);
    expect(res.body.storeCreditCents).toBe(2025);
  });
});

describe('PATCH /api/v1/customers/:id', () => {
  it('updates fields and recomputes displayName on name change', async () => {
    const created = (await createAppCustomer('PATCH-1')).body;
    const res = await request(app)
      .patch(`/api/v1/customers/${created.id}`)
      .send({ firstName: 'Maria', lastName: 'Jones' });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Maria');
    expect(res.body.lastName).toBe('Jones');
    expect(res.body.displayName).toBe('JONES, Maria');
  });

  it('respects an explicit displayName override', async () => {
    const created = (await createAppCustomer('PATCH-2')).body;
    const res = await request(app)
      .patch(`/api/v1/customers/${created.id}`)
      .send({ displayName: 'Mary J. (VIP)' });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Mary J. (VIP)');
  });

  it('returns 404 for missing customer', async () => {
    const res = await request(app)
      .patch('/api/v1/customers/00000000-0000-0000-0000-000000000099')
      .send({ firstName: 'Foo' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/customers/:id', () => {
  it('deletes a customer with no associations', async () => {
    const created = (await createAppCustomer('DELETE-1')).body;
    const del = await request(app).delete(`/api/v1/customers/${created.id}`);
    expect(del.status).toBe(204);
    const check = await request(app).get(`/api/v1/customers/${created.id}`);
    expect(check.status).toBe(404);
  });

  it('cascades family-member delete', async () => {
    const created = (await createAppCustomer('DELETE-2')).body;
    await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'A1', firstName: 'Kid' });
    await request(app).delete(`/api/v1/customers/${created.id}`);
    const check = await request(app).get(`/api/v1/customers/${created.id}/family`);
    expect(check.status).toBe(200);
    expect(check.body.data).toEqual([]);
  });

  it('returns 404 for missing customer', async () => {
    const res = await request(app).delete('/api/v1/customers/00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });
});

describe('Family members', () => {
  it('creates and lists family members', async () => {
    const created = (await createAppCustomer('FAMILY-1')).body;
    await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'S1', firstName: 'Sarah', gender: 'F' });
    await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'K1', firstName: 'Kyle', gender: 'M' });
    const res = await request(app).get(`/api/v1/customers/${created.id}/family`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns 409 on duplicate family code for the same customer', async () => {
    const created = (await createAppCustomer('FAMILY-2')).body;
    await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'S1', firstName: 'Sarah' });
    const res = await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'S1', firstName: 'Other' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FAMILY_CODE_CONFLICT');
  });

  it('rejects invalid gender', async () => {
    const created = (await createAppCustomer('FAMILY-3')).body;
    const res = await request(app)
      .post(`/api/v1/customers/${created.id}/family`)
      .send({ code: 'X1', gender: 'X' });
    expect(res.status).toBe(400);
  });

  it('updates a family member', async () => {
    const created = (await createAppCustomer('FAMILY-4')).body;
    const fam = (await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'S1', firstName: 'Sarah' })).body;
    const res = await request(app)
      .patch(`/api/v1/customers/${created.id}/family/${fam.id}`)
      .send({ firstName: 'Sara', birthday: '2010-05-15' });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Sara');
    expect(res.body.birthday).toBe('2010-05-15');
  });

  it('deletes a family member', async () => {
    const created = (await createAppCustomer('FAMILY-5')).body;
    const fam = (await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'S1', firstName: 'Sarah' })).body;
    const del = await request(app).delete(`/api/v1/customers/${created.id}/family/${fam.id}`);
    expect(del.status).toBe(204);
  });
});
