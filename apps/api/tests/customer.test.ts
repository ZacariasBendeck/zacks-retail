import request from 'supertest';
import app from '../src/app';
import { resetDb } from '../src/db/database';

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

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  resetDb();
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
    await request(app).post('/api/v1/customers').send({ ...validCustomer, lastName: 'Zimmerman', phoneE164: '+15551111111' });
    await request(app).post('/api/v1/customers').send({ ...validCustomer, lastName: 'Adams', phoneE164: '+15552222222' });
    const res = await request(app).get('/api/v1/customers?sort=displayName&order=asc');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].lastName).toBe('Adams');
    expect(res.body.data[1].lastName).toBe('Zimmerman');
    expect(res.body.pagination.totalItems).toBe(2);
  });

  it('filters by q', async () => {
    await request(app).post('/api/v1/customers').send({ ...validCustomer, lastName: 'Johnson', phoneE164: '+15551111111' });
    await request(app).post('/api/v1/customers').send({ ...validCustomer, lastName: 'Smith', phoneE164: '+15552222222' });
    const res = await request(app).get('/api/v1/customers?q=Johnson');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].lastName).toBe('Johnson');
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
