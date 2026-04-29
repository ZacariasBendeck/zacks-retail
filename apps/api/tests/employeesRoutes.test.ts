import request from 'supertest';
import { PrismaClient } from '../src/prismaClient';
import app from '../src/app';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';
import { hashPassword } from '../src/services/employees/passwordHash';

const prisma = new PrismaClient();
const OWNER_EMAIL = `employee-roster-owner-${Date.now()}@example.com`;
const OWNER_PASSWORD = 'employee-owner-password-123';
const EMAIL_PREFIX = 'employee-roster-';
const SALESPERSON_CODE_PREFIX = 'ZT';

function testSalespersonCode(): string {
  return `${SALESPERSON_CODE_PREFIX}${Math.random().toString(36).slice(2, 4)}`.toUpperCase();
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
      displayName: 'Employee Owner',
    },
    create: {
      email: OWNER_EMAIL,
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Employee Owner',
    },
  });
}

async function ownerCookie(): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
  return res.headers['set-cookie'][0];
}

describe('employee roster routes', () => {
  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER_EMAIL;
    process.env.AUTH_OWNER_PASSWORD = OWNER_PASSWORD;
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { contains: EMAIL_PREFIX } },
    });
    await prisma.$executeRawUnsafe(
      `DELETE FROM app.employee WHERE salesperson_code LIKE '${SALESPERSON_CODE_PREFIX}%'`,
    );
    await ensureOwnerUser();
  });

  afterAll(async () => {
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { contains: EMAIL_PREFIX } },
    });
    await prisma.$executeRawUnsafe(
      `DELETE FROM app.employee WHERE salesperson_code LIKE '${SALESPERSON_CODE_PREFIX}%'`,
    );
    await prisma.$disconnect();
  });

  it('GET /employees without auth returns 401', async () => {
    const res = await request(app).get('/api/v1/employees');
    expect(res.status).toBe(401);
  });

  it('POST /employees creates an employee-backed user profile', async () => {
    const cookie = await ownerCookie();
    const role = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Cookie', cookie)
      .send({
        email: `${EMAIL_PREFIX}new-${Date.now()}@example.com`,
        displayName: 'Employee New',
        password: 'employee-password-123',
        roleId: role!.id,
        salespersonCode: 'ab1',
        otherInformation: 'Floor team',
        commissionRate: 12.5,
        commissionBase: 'GROSS_PROFIT',
        homeStoreId: 'MAIN',
        timeClockEnabled: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.employee.isEmployee).toBe(true);
    expect(res.body.employee.salespersonCode).toBe('AB1');
    expect(res.body.employee.commissionBase).toBe('GROSS_PROFIT');
    expect(res.body.employee.commissionRate).toBe('12.5');
  });

  it('GET /employees returns only employee-backed users', async () => {
    const cookie = await ownerCookie();
    const res = await request(app).get('/api/v1/employees').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.employees)).toBe(true);
    expect(res.body.employees.length).toBeGreaterThan(0);
    expect(res.body.employees.every((user: any) => user.isEmployee === true)).toBe(true);
  });

  it('manages imported/native salespeople without creating login users', async () => {
    const cookie = await ownerCookie();
    const code = testSalespersonCode();

    const create = await request(app)
      .post('/api/v1/employees/salespeople')
      .set('Cookie', cookie)
      .send({
        salespersonCode: code.toLowerCase(),
        displayName: 'Native Salesperson',
        active: true,
        otherInformation: 'Floor seller',
        commissionRate: 6.25,
        commissionBase: 'GROSS_PROFIT',
        timeClockEnabled: true,
        timeClockAdmin: false,
        timeClockFullUser: true,
      });

    expect(create.status).toBe(201);
    expect(create.body.salesperson.salespersonCode).toBe(code);
    expect(create.body.salesperson.commissionRate).toBe(6.25);
    expect(create.body.salesperson.ricsSalespersonImportedAt).toBeNull();

    const list = await request(app).get('/api/v1/employees/salespeople').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.salespeople.some((row: any) => row.salespersonCode === code)).toBe(true);

    const patch = await request(app)
      .patch(`/api/v1/employees/salespeople/${code}`)
      .set('Cookie', cookie)
      .send({
        displayName: 'Updated Salesperson',
        active: false,
        commissionRate: null,
        commissionBase: 'NET_SALES',
        timeClockEnabled: false,
      });

    expect(patch.status).toBe(200);
    expect(patch.body.salesperson.displayName).toBe('Updated Salesperson');
    expect(patch.body.salesperson.active).toBe(false);
    expect(patch.body.salesperson.commissionRate).toBeNull();
    expect(patch.body.salesperson.commissionBase).toBe('NET_SALES');

    const del = await request(app)
      .delete(`/api/v1/employees/salespeople/${code}`)
      .set('Cookie', cookie);
    expect(del.status).toBe(204);

    const getAfterDelete = await request(app)
      .get(`/api/v1/employees/salespeople/${code}`)
      .set('Cookie', cookie);
    expect(getAfterDelete.status).toBe(404);
  });

  it('POST /employees rejects duplicate salesperson codes', async () => {
    const cookie = await ownerCookie();
    const role = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });

    const first = await request(app)
      .post('/api/v1/employees')
      .set('Cookie', cookie)
      .send({
        email: `${EMAIL_PREFIX}dup-a-${Date.now()}@example.com`,
        displayName: 'Dup A',
        password: 'employee-password-123',
        roleId: role!.id,
        salespersonCode: 'DUP1',
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/employees')
      .set('Cookie', cookie)
      .send({
        email: `${EMAIL_PREFIX}dup-b-${Date.now()}@example.com`,
        displayName: 'Dup B',
        password: 'employee-password-123',
        roleId: role!.id,
        salespersonCode: 'dup1',
      });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SALESPERSON_CODE_CONFLICT');
  });

  it('PATCH /employees/:id updates roster fields', async () => {
    const cookie = await ownerCookie();
    const role = await prisma.role.findUnique({ where: { name: 'MANAGER' } });

    const create = await request(app)
      .post('/api/v1/employees')
      .set('Cookie', cookie)
      .send({
        email: `${EMAIL_PREFIX}patch-${Date.now()}@example.com`,
        displayName: 'Patch Me',
        password: 'employee-password-123',
        roleId: role!.id,
        salespersonCode: 'PCH1',
      });

    const id = create.body.employee.id;
    const patch = await request(app)
      .patch(`/api/v1/employees/${id}`)
      .set('Cookie', cookie)
      .send({
        displayName: 'Patched Employee',
        commissionRate: 8.25,
        commissionBase: 'NET_SALES',
        otherInformation: 'Updated note',
        homeStoreId: 'OUTLET',
      });

    expect(patch.status).toBe(200);
    expect(patch.body.employee.displayName).toBe('Patched Employee');
    expect(patch.body.employee.commissionRate).toBe('8.25');
    expect(patch.body.employee.otherInformation).toBe('Updated note');
    expect(patch.body.employee.homeStoreId).toBe('OUTLET');
  });

  it('manages commission overrides for an employee', async () => {
    const cookie = await ownerCookie();
    const role = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });

    const create = await request(app)
      .post('/api/v1/employees')
      .set('Cookie', cookie)
      .send({
        email: `${EMAIL_PREFIX}override-${Date.now()}@example.com`,
        displayName: 'Override Employee',
        password: 'employee-password-123',
        roleId: role!.id,
        salespersonCode: 'OVR1',
      });

    const employeeId = create.body.employee.id;
    const createOverride = await request(app)
      .post(`/api/v1/employees/${employeeId}/commission-overrides`)
      .set('Cookie', cookie)
      .send({
        scope: 'DEPARTMENT',
        departmentId: 'FORMAL',
        rate: 7.5,
      });

    expect(createOverride.status).toBe(201);
    expect(createOverride.body.override.scope).toBe('DEPARTMENT');
    expect(createOverride.body.override.departmentId).toBe('FORMAL');
    expect(createOverride.body.override.rate).toBe('7.5');

    const listBeforePatch = await request(app)
      .get(`/api/v1/employees/${employeeId}/commission-overrides`)
      .set('Cookie', cookie);

    expect(listBeforePatch.status).toBe(200);
    expect(listBeforePatch.body.overrides).toHaveLength(1);

    const patchOverride = await request(app)
      .patch(`/api/v1/employees/commission-overrides/${createOverride.body.override.id}`)
      .set('Cookie', cookie)
      .send({
        scope: 'CATEGORY',
        categoryId: '580',
        rate: 9.25,
      });

    expect(patchOverride.status).toBe(200);
    expect(patchOverride.body.override.scope).toBe('CATEGORY');
    expect(patchOverride.body.override.categoryId).toBe('580');
    expect(patchOverride.body.override.departmentId).toBeNull();
    expect(patchOverride.body.override.rate).toBe('9.25');

    const deleteOverride = await request(app)
      .delete(`/api/v1/employees/commission-overrides/${createOverride.body.override.id}`)
      .set('Cookie', cookie);

    expect(deleteOverride.status).toBe(200);
    expect(deleteOverride.body.override.id).toBe(createOverride.body.override.id);

    const listAfterDelete = await request(app)
      .get(`/api/v1/employees/${employeeId}/commission-overrides`)
      .set('Cookie', cookie);

    expect(listAfterDelete.status).toBe(200);
    expect(listAfterDelete.body.overrides).toHaveLength(0);
  });

  it('rejects invalid commission override target combinations', async () => {
    const cookie = await ownerCookie();
    const role = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });

    const create = await request(app)
      .post('/api/v1/employees')
      .set('Cookie', cookie)
      .send({
        email: `${EMAIL_PREFIX}override-invalid-${Date.now()}@example.com`,
        displayName: 'Invalid Override Employee',
        password: 'employee-password-123',
        roleId: role!.id,
        salespersonCode: 'OVR2',
      });

    const employeeId = create.body.employee.id;
    const createOverride = await request(app)
      .post(`/api/v1/employees/${employeeId}/commission-overrides`)
      .set('Cookie', cookie)
      .send({
        scope: 'DEPARTMENT',
        skuId: 'SKU-123',
        rate: 7.5,
      });

    expect(createOverride.status).toBe(400);
    expect(createOverride.body.error.code).toBe('COMMISSION_OVERRIDE_INVALID');
  });

  it('POST /employees/:id/deactivate and /reactivate toggle active state', async () => {
    const cookie = await ownerCookie();
    const role = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });

    const create = await request(app)
      .post('/api/v1/employees')
      .set('Cookie', cookie)
      .send({
        email: `${EMAIL_PREFIX}toggle-${Date.now()}@example.com`,
        displayName: 'Toggle Me',
        password: 'employee-password-123',
        roleId: role!.id,
        salespersonCode: 'TGL1',
      });

    const id = create.body.employee.id;

    const deactivate = await request(app)
      .post(`/api/v1/employees/${id}/deactivate`)
      .set('Cookie', cookie);
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.employee.active).toBe(false);
    expect(deactivate.body.employee.terminatedAt).toBeTruthy();

    const reactivate = await request(app)
      .post(`/api/v1/employees/${id}/reactivate`)
      .set('Cookie', cookie);
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.employee.active).toBe(true);
    expect(reactivate.body.employee.terminatedAt).toBeNull();
  });
});


