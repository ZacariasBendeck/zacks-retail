import request from 'supertest';
import app from '../src/app';
import { resetDb } from '../src/db/database';
import { prisma } from '../src/db/prisma';

jest.setTimeout(30000);

const validCustomer = {
  firstName: 'Mary',
  lastName: 'Johnson',
  phoneE164: '+15551234567',
  email: 'mary@example.com',
  addressLine1: '123 Main St',
  city: 'Austin',
  stateRegion: 'TX',
  postalCode: '78701',
  country: 'USA',
  creditLimit: 500,
};

async function cleanupMirrorFixtures(): Promise<void> {
  await prisma.$executeRawUnsafe(`DELETE FROM rics_mirror.mail_list_family WHERE account LIKE 'TEST-MIRROR-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM rics_mirror.mail_list_names WHERE account LIKE 'TEST-MIRROR-%'`);
}

async function insertMirrorCustomerFixture(input: {
  account: string;
  name: string;
  city?: string | null;
  state?: string | null;
  email?: string | null;
  currentBalance?: number;
  storeCredit?: number;
  dateAdded?: Date;
  dateLastPurchase?: Date | null;
}): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO rics_mirror.mail_list_names (
      account,
      name,
      city,
      state,
      e_mail,
      curr_bal,
      cred_slip,
      qty_sales_01,
      qty_sales_02,
      qty_sales_03,
      qty_sales_04,
      dollar_sales_01,
      dollar_sales_02,
      dollar_sales_03,
      dollar_sales_04,
      date_added,
      date_lst_purch,
      date_last_changed,
      non_taxable
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      0, 0, 0, 0,
      0, 0, 0, 0,
      $8, $9, $8, false
    )`,
    input.account,
    input.name,
    input.city ?? null,
    input.state ?? null,
    input.email ?? null,
    input.currentBalance ?? 0,
    input.storeCredit ?? 0,
    input.dateAdded ?? new Date('2026-04-01T00:00:00.000Z'),
    input.dateLastPurchase ?? null,
  );
}

async function insertMirrorFamilyFixture(input: {
  account: string;
  code: string;
  name: string;
  gender?: 'M' | 'F' | 'C' | null;
  birthday?: Date | null;
}): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO rics_mirror.mail_list_family (
      account,
      code,
      name,
      gender,
      date_added,
      birthday,
      date_last_changed
    ) VALUES ($1, $2, $3, $4, $5, $6, $5)`,
    input.account,
    input.code,
    input.name,
    input.gender ?? null,
    new Date('2026-04-01T00:00:00.000Z'),
    input.birthday ?? null,
  );
}

// Customers + family_members live in Postgres now; `resetDb()` only resets the
// legacy SQLite admin DB that other tests still depend on. We wipe the Postgres
// customer tables explicitly so each test starts from a clean slate. The
// delete on `customer` cascades to `familyMember` via the FK; the explicit
// familyMember wipe first is belt-and-suspenders in case of a stray orphan.
beforeEach(async () => {
  resetDb();
  await prisma.familyMember.deleteMany({});
  await prisma.customer.deleteMany({});
});

afterAll(async () => {
  resetDb();
  await cleanupMirrorFixtures();
  await prisma.familyMember.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.$disconnect();
});

describe('POST /api/v1/customers', () => {
  it('creates a customer and derives account number from phone', async () => {
    const res = await request(app).post('/api/v1/customers').send(validCustomer);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.firstName).toBe('Mary');
    expect(res.body.lastName).toBe('Johnson');
    expect(res.body.displayName).toBe('JOHNSON, Mary');
    // Phone-derived account number, digits only (RICS p. 117)
    expect(res.body.accountNumber).toBe('15551234567');
    expect(res.body.creditLimit).toBe(500);
    expect(res.body.active).toBe(true);
    expect(res.body.alertFlag).toBe(false);
  });

  it('accepts an explicit account number', async () => {
    const res = await request(app)
      .post('/api/v1/customers')
      .send({ ...validCustomer, accountNumber: 'VIP001' });
    expect(res.status).toBe(201);
    expect(res.body.accountNumber).toBe('VIP001');
  });

  it('returns 409 on duplicate account number', async () => {
    await request(app).post('/api/v1/customers').send({ ...validCustomer, accountNumber: 'DUPE' });
    const res = await request(app)
      .post('/api/v1/customers')
      .send({ ...validCustomer, accountNumber: 'DUPE', firstName: 'Other' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_NUMBER_CONFLICT');
  });

  it('rejects invalid email', async () => {
    const res = await request(app).post('/api/v1/customers').send({ ...validCustomer, email: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('stores ALERT flag and message as structured fields (not magic-string Comments)', async () => {
    const res = await request(app)
      .post('/api/v1/customers')
      .send({ ...validCustomer, alertFlag: true, alertMessage: 'Bad check writer' });
    expect(res.status).toBe(201);
    expect(res.body.alertFlag).toBe(true);
    expect(res.body.alertMessage).toBe('Bad check writer');
  });
});

describe('GET /api/v1/customers', () => {
  it('returns paginated customers sorted by displayName', async () => {
    await insertMirrorCustomerFixture({
      account: 'TEST-MIRROR-SORT-2',
      name: 'SORTTESTZIMMERMAN, Mary',
    });
    await insertMirrorCustomerFixture({
      account: 'TEST-MIRROR-SORT-1',
      name: 'SORTTESTADAMS, Mary',
    });
    const res = await request(app).get('/api/v1/customers?sort=displayName&order=asc&q=SORTTEST');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].source).toBe('mirror');
    expect(res.body.data[0].lastName).toBe('SORTTESTADAMS');
    expect(res.body.data[1].lastName).toBe('SORTTESTZIMMERMAN');
    expect(res.body.pagination.totalItems).toBe(2);
  });

  it('filters by q', async () => {
    await insertMirrorCustomerFixture({
      account: 'TEST-MIRROR-FILTER-1',
      name: 'FILTERJOHNSON, Mary',
    });
    await insertMirrorCustomerFixture({
      account: 'TEST-MIRROR-FILTER-2',
      name: 'FILTERSMITH, Mary',
    });
    const res = await request(app).get('/api/v1/customers?q=FILTERJOHNSON');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].lastName).toBe('FILTERJOHNSON');
  });
});

describe('GET /api/v1/customers/search', () => {
  it('returns typeahead matches', async () => {
    await request(app).post('/api/v1/customers').send({ ...validCustomer, firstName: 'Mary', lastName: 'Johnson', phoneE164: '+15551111111' });
    const res = await request(app).get('/api/v1/customers/search?q=john');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].lastName).toBe('Johnson');
  });

  it('returns empty array for no matches', async () => {
    await request(app).post('/api/v1/customers').send(validCustomer);
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
    const created = (await request(app).post('/api/v1/customers').send(validCustomer)).body;
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

  it('returns mirror customer with mirror family members when id is an account number', async () => {
    await insertMirrorCustomerFixture({
      account: 'TEST-MIRROR-DETAIL-1',
      name: 'DETAILMOTHER, Maria',
    });
    await insertMirrorFamilyFixture({
      account: 'TEST-MIRROR-DETAIL-1',
      code: 'D1',
      name: 'DETAILDAUGHTER, Sofia',
      gender: 'F',
      birthday: new Date('2015-05-15T00:00:00.000Z'),
    });

    const res = await request(app).get('/api/v1/customers/TEST-MIRROR-DETAIL-1');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('mirror');
    expect(res.body.accountNumber).toBe('TEST-MIRROR-DETAIL-1');
    expect(res.body.familyMembers).toHaveLength(1);
    expect(res.body.familyMembers[0].code).toBe('D1');
    expect(res.body.familyMembers[0].birthday).toBe('2015-05-15');
  });
});

describe('GET /api/v1/customers/by-account/:accountNumber', () => {
  it('finds customer by account number', async () => {
    const created = (await request(app).post('/api/v1/customers').send({ ...validCustomer, accountNumber: 'ACC001' })).body;
    const res = await request(app).get('/api/v1/customers/by-account/ACC001');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
  });

  it('returns 404 for missing account', async () => {
    const res = await request(app).get('/api/v1/customers/by-account/NOTHERE');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/customers/:id/balances', () => {
  it('returns placeholder balances for Stage 1', async () => {
    const created = (await request(app).post('/api/v1/customers').send(validCustomer)).body;
    const res = await request(app).get(`/api/v1/customers/${created.id}/balances`);
    expect(res.status).toBe(200);
    expect(res.body.arBalanceCents).toBe(0);
    expect(res.body.storeCreditCents).toBe(0);
    expect(res.body.arBalanceAsOf).toBeNull();
    expect(res.body.storeCreditAsOf).toBeNull();
  });

  it('returns balances projected from the mirror customer row', async () => {
    await insertMirrorCustomerFixture({
      account: 'TEST-MIRROR-BAL-1',
      name: 'BALANCES, Maria',
      currentBalance: 125.5,
      storeCredit: 20.25,
      dateLastPurchase: new Date('2026-04-08T00:00:00.000Z'),
    });

    const res = await request(app).get('/api/v1/customers/TEST-MIRROR-BAL-1/balances');
    expect(res.status).toBe(200);
    expect(res.body.arBalanceCents).toBe(12550);
    expect(res.body.storeCreditCents).toBe(2025);
  });
});

describe('PATCH /api/v1/customers/:id', () => {
  it('updates fields and recomputes displayName on name change', async () => {
    const created = (await request(app).post('/api/v1/customers').send(validCustomer)).body;
    const res = await request(app)
      .patch(`/api/v1/customers/${created.id}`)
      .send({ firstName: 'Maria', lastName: 'Jones' });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Maria');
    expect(res.body.lastName).toBe('Jones');
    expect(res.body.displayName).toBe('JONES, Maria');
  });

  it('respects an explicit displayName override', async () => {
    const created = (await request(app).post('/api/v1/customers').send(validCustomer)).body;
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
    const created = (await request(app).post('/api/v1/customers').send(validCustomer)).body;
    const del = await request(app).delete(`/api/v1/customers/${created.id}`);
    expect(del.status).toBe(204);
    const check = await request(app).get(`/api/v1/customers/${created.id}`);
    expect(check.status).toBe(404);
  });

  it('cascades family-member delete', async () => {
    const created = (await request(app).post('/api/v1/customers').send(validCustomer)).body;
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
    const created = (await request(app).post('/api/v1/customers').send(validCustomer)).body;
    await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'S1', firstName: 'Sarah', gender: 'F' });
    await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'K1', firstName: 'Kyle', gender: 'M' });
    const res = await request(app).get(`/api/v1/customers/${created.id}/family`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns 409 on duplicate family code for the same customer', async () => {
    const created = (await request(app).post('/api/v1/customers').send(validCustomer)).body;
    await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'S1', firstName: 'Sarah' });
    const res = await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'S1', firstName: 'Other' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FAMILY_CODE_CONFLICT');
  });

  it('rejects invalid gender', async () => {
    const created = (await request(app).post('/api/v1/customers').send(validCustomer)).body;
    const res = await request(app)
      .post(`/api/v1/customers/${created.id}/family`)
      .send({ code: 'X1', gender: 'X' });
    expect(res.status).toBe(400);
  });

  it('updates a family member', async () => {
    const created = (await request(app).post('/api/v1/customers').send(validCustomer)).body;
    const fam = (await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'S1', firstName: 'Sarah' })).body;
    const res = await request(app)
      .patch(`/api/v1/customers/${created.id}/family/${fam.id}`)
      .send({ firstName: 'Sara', birthday: '2010-05-15' });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Sara');
    expect(res.body.birthday).toBe('2010-05-15');
  });

  it('deletes a family member', async () => {
    const created = (await request(app).post('/api/v1/customers').send(validCustomer)).body;
    const fam = (await request(app).post(`/api/v1/customers/${created.id}/family`).send({ code: 'S1', firstName: 'Sarah' })).body;
    const del = await request(app).delete(`/api/v1/customers/${created.id}/family/${fam.id}`);
    expect(del.status).toBe(204);
  });
});
