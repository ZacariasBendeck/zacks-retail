import request from 'supertest';
import { PrismaClient } from '../src/prismaClient';
import app from '../src/app';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';
import { hashPassword } from '../src/services/employees/passwordHash';

const prisma = new PrismaClient();
const EMAIL_PREFIX = 'employee-sales-password-';
const OWNER_EMAIL = `${EMAIL_PREFIX}owner-${Date.now()}@example.com`;
const OWNER_PASSWORD = 'employee-sales-password-owner-123';
let salespersonCodeCounter = 0;

function nextSalespersonCode(seed: string): string {
  const prefix = `${seed.replace(/[^a-z0-9]/gi, '').toUpperCase()}XX`.slice(0, 2);
  const suffix = (salespersonCodeCounter++).toString(36).toUpperCase().padStart(2, '0');
  return `${prefix}${suffix}`;
}

async function ensureOwnerUser(): Promise<void> {
  await bootstrapOwner(prisma);
  const ownerRole = await prisma.role.findUnique({ where: { name: 'OWNER' } });
  const passwordHash = await hashPassword(OWNER_PASSWORD);
  await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Employee Sales Password Owner',
    },
    create: {
      email: OWNER_EMAIL,
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Employee Sales Password Owner',
    },
  });
}

async function ownerCookie(): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
  return res.headers['set-cookie'][0];
}

async function createEmployee(cookie: string, suffix: string): Promise<{ id: string; email: string }> {
  const role = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
  const email = `${EMAIL_PREFIX}${suffix}-${Date.now()}@example.com`;
  const res = await request(app)
    .post('/api/v1/employees')
    .set('Cookie', cookie)
    .send({
      email,
      displayName: `Employee ${suffix}`,
      password: 'employee-password-123',
      roleId: role!.id,
      salespersonCode: nextSalespersonCode(suffix),
    });

  expect(res.status).toBe(201);
  return { id: res.body.employee.id, email };
}

describe('employee sales password bridge routes', () => {
  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER_EMAIL;
    process.env.AUTH_OWNER_PASSWORD = OWNER_PASSWORD;
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { contains: EMAIL_PREFIX } },
    });
    await ensureOwnerUser();
  });

  afterAll(async () => {
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { contains: EMAIL_PREFIX } },
    });
    await prisma.$disconnect();
  });

  it('issues and lists an employee sales password', async () => {
    const cookie = await ownerCookie();
    const employee = await createEmployee(cookie, 'issue');

    const issue = await request(app)
      .post(`/api/v1/employees/${employee.id}/sales-passwords`)
      .set('Cookie', cookie)
      .send({
        pin: '4321',
        scopes: ['REFUND', 'VOID'],
      });

    expect(issue.status).toBe(201);
    expect(issue.body.password.employeeId).toBe(employee.id);
    expect(issue.body.password.scopes).toEqual(['REFUND', 'VOID']);
    expect(issue.body.password.pinHash).toBeUndefined();

    const list = await request(app)
      .get(`/api/v1/employees/${employee.id}/sales-passwords`)
      .set('Cookie', cookie);

    expect(list.status).toBe(200);
    expect(list.body.passwords).toHaveLength(1);
    expect(list.body.passwords[0].active).toBe(true);
    expect(list.body.passwords[0].scopes).toEqual(['REFUND', 'VOID']);
  });

  it('rejects duplicate active pins across employees', async () => {
    const cookie = await ownerCookie();
    const firstEmployee = await createEmployee(cookie, 'dup-a');
    const secondEmployee = await createEmployee(cookie, 'dup-b');

    const first = await request(app)
      .post(`/api/v1/employees/${firstEmployee.id}/sales-passwords`)
      .set('Cookie', cookie)
      .send({
        pin: '5555',
        scopes: ['VOID'],
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/v1/employees/${secondEmployee.id}/sales-passwords`)
      .set('Cookie', cookie)
      .send({
        pin: '5555',
        scopes: ['REFUND'],
      });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SALES_PASSWORD_PIN_CONFLICT');
  });

  it('verifies a PIN and consumes the override token once', async () => {
    const cookie = await ownerCookie();
    const employee = await createEmployee(cookie, 'verify');

    const issue = await request(app)
      .post(`/api/v1/employees/${employee.id}/sales-passwords`)
      .set('Cookie', cookie)
      .send({
        pin: '8765',
        scopes: ['VOID'],
      });
    expect(issue.status).toBe(201);

    const verify = await request(app)
      .post('/api/v1/employees/sales-passwords/verify')
      .set('Cookie', cookie)
      .send({
        employeeId: employee.id,
        pin: '8765',
        scope: 'VOID',
        action: 'VOID_TICKET',
      });

    expect(verify.status).toBe(200);
    expect(verify.body.employee.id).toBe(employee.id);
    expect(typeof verify.body.overrideToken).toBe('string');

    const consume = await request(app)
      .post('/api/v1/employees/sales-passwords/consume-token')
      .set('Cookie', cookie)
      .send({
        overrideToken: verify.body.overrideToken,
        scope: 'VOID',
        action: 'VOID_TICKET',
      });

    expect(consume.status).toBe(200);
    expect(consume.body.token.employeeId).toBe(employee.id);
    expect(consume.body.token.consumedAt).toBeTruthy();

    const consumeAgain = await request(app)
      .post('/api/v1/employees/sales-passwords/consume-token')
      .set('Cookie', cookie)
      .send({
        overrideToken: verify.body.overrideToken,
        scope: 'VOID',
        action: 'VOID_TICKET',
      });

    expect(consumeAgain.status).toBe(409);
    expect(consumeAgain.body.error.code).toBe('OVERRIDE_TOKEN_ALREADY_CONSUMED');
  });

  it('locks a PIN after five bad targeted attempts', async () => {
    const cookie = await ownerCookie();
    const employee = await createEmployee(cookie, 'locked');

    const issue = await request(app)
      .post(`/api/v1/employees/${employee.id}/sales-passwords`)
      .set('Cookie', cookie)
      .send({
        pin: '2468',
        scopes: ['REFUND'],
      });
    expect(issue.status).toBe(201);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const bad = await request(app)
        .post('/api/v1/employees/sales-passwords/verify')
        .set('Cookie', cookie)
        .send({
          employeeId: employee.id,
          pin: '0000',
          scope: 'REFUND',
        });
      expect(bad.status).toBe(401);
      expect(bad.body.error.code).toBe('INVALID_SALES_PASSWORD');
    }

    const locked = await request(app)
      .post('/api/v1/employees/sales-passwords/verify')
      .set('Cookie', cookie)
      .send({
        employeeId: employee.id,
        pin: '0000',
        scope: 'REFUND',
      });

    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('SALES_PASSWORD_LOCKED');
    expect(locked.body.lockedUntil).toBeTruthy();
  });

  it('revokes an employee sales password', async () => {
    const cookie = await ownerCookie();
    const employee = await createEmployee(cookie, 'revoke');

    const issue = await request(app)
      .post(`/api/v1/employees/${employee.id}/sales-passwords`)
      .set('Cookie', cookie)
      .send({
        pin: '9753',
        scopes: ['PAY_OUT'],
      });
    expect(issue.status).toBe(201);

    const revoke = await request(app)
      .post(`/api/v1/employees/${employee.id}/sales-passwords/${issue.body.password.id}/revoke`)
      .set('Cookie', cookie);

    expect(revoke.status).toBe(200);
    expect(revoke.body.password.active).toBe(false);
    expect(revoke.body.password.revokedAt).toBeTruthy();
  });
});


