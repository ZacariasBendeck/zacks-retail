import request from 'supertest';
import { PrismaClient } from '../src/prismaClient';
import app from '../src/app';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';
import { hashPassword } from '../src/services/employees/passwordHash';
import { grantStoreScope } from '../src/services/identityAccess/storeScopeService';

const prisma = new PrismaClient();
const EMAIL_PREFIX = 'time-clock-route-';
const OWNER_EMAIL = `${EMAIL_PREFIX}owner-${Date.now()}@example.com`;
const OWNER_PASSWORD = 'time-clock-owner-123';
const STORE_A = 901;
const STORE_B = 902;
const STORE_DISABLED = 903;
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
      displayName: 'Time Clock Owner',
    },
    create: {
      email: OWNER_EMAIL,
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Time Clock Owner',
    },
  });
}

async function loginCookie(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

async function createEmployee(
  cookie: string,
  args: {
    suffix: string;
    roleName: 'SALESPERSON' | 'MANAGER';
    timeClockPin?: string;
  },
): Promise<{ id: string; email: string; password: string }> {
  const role = await prisma.role.findUnique({ where: { name: args.roleName } });
  const email = `${EMAIL_PREFIX}${args.suffix}-${Date.now()}@example.com`;
  const password = `${args.suffix}-password-123`;
  const salespersonCode = nextSalespersonCode(args.suffix);
  const res = await request(app)
    .post('/api/v1/employees')
    .set('Cookie', cookie)
    .send({
      email,
      displayName: `Employee ${args.suffix}`,
      password,
      roleId: role!.id,
      salespersonCode,
      timeClockPin: args.timeClockPin,
    });

  expect(res.status).toBe(201);
  return {
    id: res.body.employee.id,
    email,
    password,
  };
}

describe('time clock routes', () => {
  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER_EMAIL;
    process.env.AUTH_OWNER_PASSWORD = OWNER_PASSWORD;

    await prisma.session.deleteMany({});
    await prisma.timeClockEntry.deleteMany({
      where: {
        employee: {
          email: { contains: EMAIL_PREFIX },
        },
      },
    });
    await prisma.timeClockPolicy.deleteMany({
      where: {
        storeId: { in: [STORE_A, STORE_B, STORE_DISABLED] },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: EMAIL_PREFIX } },
    });
    await ensureOwnerUser();
  });

  afterAll(async () => {
    await prisma.session.deleteMany({});
    await prisma.timeClockEntry.deleteMany({
      where: {
        employee: {
          email: { contains: EMAIL_PREFIX },
        },
      },
    });
    await prisma.timeClockPolicy.deleteMany({
      where: {
        storeId: { in: [STORE_A, STORE_B, STORE_DISABLED] },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: EMAIL_PREFIX } },
    });
    await prisma.$disconnect();
  });

  it('configures and reads a store time clock policy', async () => {
    const ownerCookie = await loginCookie(OWNER_EMAIL, OWNER_PASSWORD);

    const patch = await request(app)
      .patch(`/api/v1/time-clock-policy?storeId=${STORE_A}`)
      .set('Cookie', ownerCookie)
      .send({
        enabled: true,
        requireClockInBeforeSale: true,
      });

    expect(patch.status).toBe(200);
    expect(patch.body.policy.enabled).toBe(true);
    expect(patch.body.policy.requireClockInBeforeSale).toBe(true);

    const get = await request(app)
      .get(`/api/v1/time-clock-policy?storeId=${STORE_A}`)
      .set('Cookie', ownerCookie);

    expect(get.status).toBe(200);
    expect(get.body.policy.storeId).toBe(STORE_A);
    expect(get.body.policy.enabled).toBe(true);
    expect(get.body.policy.requireClockInBeforeSale).toBe(true);
  });

  it('lets a salesperson clock in and out with a self-service PIN', async () => {
    const ownerCookie = await loginCookie(OWNER_EMAIL, OWNER_PASSWORD);
    await request(app)
      .patch(`/api/v1/time-clock-policy?storeId=${STORE_A}`)
      .set('Cookie', ownerCookie)
      .send({ enabled: true, requireClockInBeforeSale: false });

    const employee = await createEmployee(ownerCookie, {
      suffix: 'self',
      roleName: 'SALESPERSON',
      timeClockPin: '2468',
    });
    const employeeCookie = await loginCookie(employee.email, employee.password);

    const clockIn = await request(app)
      .post('/api/v1/employees/time-clock/clock-in')
      .set('Cookie', employeeCookie)
      .send({
        storeId: STORE_A,
        pin: '2468',
      });

    expect(clockIn.status).toBe(201);
    expect(clockIn.body.entry.employeeId).toBe(employee.id);
    expect(clockIn.body.entry.clockedOutAt).toBeNull();

    const clockOut = await request(app)
      .post('/api/v1/employees/time-clock/clock-out')
      .set('Cookie', employeeCookie)
      .send({
        pin: '2468',
      });

    expect(clockOut.status).toBe(200);
    expect(clockOut.body.entry.employeeId).toBe(employee.id);
    expect(clockOut.body.entry.clockedOutAt).toBeTruthy();
    expect(clockOut.body.entry.workedMinutes).toBeGreaterThanOrEqual(0);
  });

  it('rejects self clock-in with the wrong PIN', async () => {
    const ownerCookie = await loginCookie(OWNER_EMAIL, OWNER_PASSWORD);
    await request(app)
      .patch(`/api/v1/time-clock-policy?storeId=${STORE_A}`)
      .set('Cookie', ownerCookie)
      .send({ enabled: true, requireClockInBeforeSale: false });

    const employee = await createEmployee(ownerCookie, {
      suffix: 'badpin',
      roleName: 'SALESPERSON',
      timeClockPin: '1357',
    });
    const employeeCookie = await loginCookie(employee.email, employee.password);

    const clockIn = await request(app)
      .post('/api/v1/employees/time-clock/clock-in')
      .set('Cookie', employeeCookie)
      .send({
        storeId: STORE_A,
        pin: '9999',
      });

    expect(clockIn.status).toBe(401);
    expect(clockIn.body.error.code).toBe('TIME_CLOCK_INVALID_PIN');
  });

  it('lets a manager clock another employee in and out', async () => {
    const ownerCookie = await loginCookie(OWNER_EMAIL, OWNER_PASSWORD);
    await request(app)
      .patch(`/api/v1/time-clock-policy?storeId=${STORE_B}`)
      .set('Cookie', ownerCookie)
      .send({ enabled: true, requireClockInBeforeSale: false });

    const manager = await createEmployee(ownerCookie, {
      suffix: 'mgr',
      roleName: 'MANAGER',
    });
    const salesperson = await createEmployee(ownerCookie, {
      suffix: 'staff',
      roleName: 'SALESPERSON',
      timeClockPin: '8642',
    });
    const managerCookie = await loginCookie(manager.email, manager.password);

    const clockIn = await request(app)
      .post('/api/v1/employees/time-clock/clock-in')
      .set('Cookie', managerCookie)
      .send({
        employeeId: salesperson.id,
        storeId: STORE_B,
        nonSales: true,
      });

    expect(clockIn.status).toBe(201);
    expect(clockIn.body.entry.employeeId).toBe(salesperson.id);
    expect(clockIn.body.entry.nonSales).toBe(true);

    const open = await request(app)
      .get(`/api/v1/employees/time-clock/open?storeId=${STORE_B}`)
      .set('Cookie', managerCookie);

    expect(open.status).toBe(200);
    expect(open.body.entries).toHaveLength(1);
    expect(open.body.entries[0].employeeId).toBe(salesperson.id);

    const clockOut = await request(app)
      .post('/api/v1/employees/time-clock/clock-out')
      .set('Cookie', managerCookie)
      .send({
        employeeId: salesperson.id,
      });

    expect(clockOut.status).toBe(200);
    expect(clockOut.body.entry.employeeId).toBe(salesperson.id);
    expect(clockOut.body.entry.clockedOutAt).toBeTruthy();
  });

  it('enforces Identity & Access store scopes on time clock administration', async () => {
    const ownerCookie = await loginCookie(OWNER_EMAIL, OWNER_PASSWORD);
    await request(app)
      .patch(`/api/v1/time-clock-policy?storeId=${STORE_A}`)
      .set('Cookie', ownerCookie)
      .send({ enabled: true, requireClockInBeforeSale: false });
    await request(app)
      .patch(`/api/v1/time-clock-policy?storeId=${STORE_B}`)
      .set('Cookie', ownerCookie)
      .send({ enabled: true, requireClockInBeforeSale: false });

    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: OWNER_EMAIL },
      select: { id: true },
    });
    const manager = await createEmployee(ownerCookie, {
      suffix: 'scopedmgr',
      roleName: 'MANAGER',
    });
    const salesperson = await createEmployee(ownerCookie, {
      suffix: 'scopedstaff',
      roleName: 'SALESPERSON',
      timeClockPin: '9753',
    });
    await grantStoreScope(prisma, {
      userId: manager.id,
      scopeType: 'STORE',
      scopeId: String(STORE_A),
      actorUserId: owner.id,
      reason: 'time clock route store scope test',
    });
    const managerCookie = await loginCookie(manager.email, manager.password);

    const allowedPolicy = await request(app)
      .get(`/api/v1/time-clock-policy?storeId=${STORE_A}`)
      .set('Cookie', managerCookie);
    expect(allowedPolicy.status).toBe(200);

    const deniedPolicy = await request(app)
      .get(`/api/v1/time-clock-policy?storeId=${STORE_B}`)
      .set('Cookie', managerCookie);
    expect(deniedPolicy.status).toBe(403);
    expect(deniedPolicy.body.error.code).toBe('STORE_SCOPE_FORBIDDEN');

    const deniedClockIn = await request(app)
      .post('/api/v1/employees/time-clock/clock-in')
      .set('Cookie', managerCookie)
      .send({
        employeeId: salesperson.id,
        storeId: STORE_B,
      });
    expect(deniedClockIn.status).toBe(403);
    expect(deniedClockIn.body.error.code).toBe('STORE_SCOPE_FORBIDDEN');

    const deniedReport = await request(app)
      .get(`/api/v1/reports/time-clock?storeIds=${STORE_A},${STORE_B}`)
      .set('Cookie', managerCookie);
    expect(deniedReport.status).toBe(403);
    expect(deniedReport.body.error.code).toBe('STORE_SCOPE_FORBIDDEN');
  });

  it('lets a manager adjust an entry and review the adjustment audit trail', async () => {
    const ownerCookie = await loginCookie(OWNER_EMAIL, OWNER_PASSWORD);
    await request(app)
      .patch(`/api/v1/time-clock-policy?storeId=${STORE_A}`)
      .set('Cookie', ownerCookie)
      .send({ enabled: true, requireClockInBeforeSale: false });

    const manager = await createEmployee(ownerCookie, {
      suffix: 'adjustmgr',
      roleName: 'MANAGER',
    });
    const salesperson = await createEmployee(ownerCookie, {
      suffix: 'adjuststaff',
      roleName: 'SALESPERSON',
      timeClockPin: '4826',
    });
    const managerCookie = await loginCookie(manager.email, manager.password);
    const clockInAt = '2026-04-24T14:00:00.000Z';
    const clockOutAt = '2026-04-24T16:30:00.000Z';
    const adjustedClockOutAt = '2026-04-24T17:00:00.000Z';

    const clockIn = await request(app)
      .post('/api/v1/employees/time-clock/clock-in')
      .set('Cookie', managerCookie)
      .send({
        employeeId: salesperson.id,
        storeId: STORE_A,
        at: clockInAt,
      });

    expect(clockIn.status).toBe(201);

    const clockOut = await request(app)
      .post('/api/v1/employees/time-clock/clock-out')
      .set('Cookie', managerCookie)
      .send({
        employeeId: salesperson.id,
        at: clockOutAt,
      });

    expect(clockOut.status).toBe(200);

    const adjust = await request(app)
      .post(`/api/v1/employees/time-clock/entries/${clockOut.body.entry.id}/adjust`)
      .set('Cookie', managerCookie)
      .send({
        clockedOutAt: adjustedClockOutAt,
        nonSales: true,
        note: 'Supervisor corrected missed logout.',
        reason: 'Corrected end time after manager review.',
      });

    expect(adjust.status).toBe(200);
    expect(adjust.body.entry.clockedOutAt).toBe(adjustedClockOutAt);
    expect(adjust.body.entry.nonSales).toBe(true);
    expect(adjust.body.entry.note).toBe('Supervisor corrected missed logout.');
    expect(adjust.body.entry.workedMinutes).toBe(180);
    expect(adjust.body.adjustment.reason).toBe('Corrected end time after manager review.');
    expect(adjust.body.adjustment.previousClockedOutAt).toBe(clockOutAt);
    expect(adjust.body.adjustment.nextClockedOutAt).toBe(adjustedClockOutAt);

    const adjustments = await request(app)
      .get(`/api/v1/employees/time-clock/entries/${clockOut.body.entry.id}/adjustments`)
      .set('Cookie', managerCookie);

    expect(adjustments.status).toBe(200);
    expect(adjustments.body.adjustments).toHaveLength(1);
    expect(adjustments.body.adjustments[0].reason).toBe('Corrected end time after manager review.');
    expect(adjustments.body.adjustments[0].previousNonSales).toBe(false);
    expect(adjustments.body.adjustments[0].nextNonSales).toBe(true);
  });

  it('lists reconciliation issues and exports time clock reports', async () => {
    const ownerCookie = await loginCookie(OWNER_EMAIL, OWNER_PASSWORD);
    await request(app)
      .patch(`/api/v1/time-clock-policy?storeId=${STORE_B}`)
      .set('Cookie', ownerCookie)
      .send({ enabled: true, requireClockInBeforeSale: false });

    const manager = await createEmployee(ownerCookie, {
      suffix: 'reconmgr',
      roleName: 'MANAGER',
    });
    const salesperson = await createEmployee(ownerCookie, {
      suffix: 'reconstaff',
      roleName: 'SALESPERSON',
      timeClockPin: '7319',
    });
    const managerCookie = await loginCookie(manager.email, manager.password);
    const firstClockInAt = '2026-04-20T08:00:00.000Z';
    const secondClockInAt = '2026-04-21T09:05:00.000Z';

    const firstClockIn = await request(app)
      .post('/api/v1/employees/time-clock/clock-in')
      .set('Cookie', managerCookie)
      .send({
        employeeId: salesperson.id,
        storeId: STORE_B,
        at: firstClockInAt,
      });

    expect(firstClockIn.status).toBe(201);

    const secondClockIn = await request(app)
      .post('/api/v1/employees/time-clock/clock-in')
      .set('Cookie', managerCookie)
      .send({
        employeeId: salesperson.id,
        storeId: STORE_B,
        at: secondClockInAt,
      });

    expect(secondClockIn.status).toBe(201);

    const reconciliation = await request(app)
      .get(`/api/v1/employees/time-clock/reconciliation?storeId=${STORE_B}`)
      .set('Cookie', managerCookie);

    expect(reconciliation.status).toBe(200);
    expect(reconciliation.body.entries).toHaveLength(2);
    expect(reconciliation.body.entries[0].status).toBe('AUTO_CLOSED');
    expect(reconciliation.body.entries[0].workedMinutes).toBe(0);
    expect(reconciliation.body.entries[1].status).toBe('OPEN');

    const detailReport = await request(app)
      .get(`/api/v1/reports/time-clock?storeId=${STORE_B}&from=2026-04-20T00:00:00.000Z&to=2026-04-22T00:00:00.000Z&detail=true`)
      .set('Cookie', managerCookie);

    expect(detailReport.status).toBe(200);
    expect(detailReport.body.report.detail).toBe(true);
    expect(detailReport.body.report.rows).toHaveLength(2);
    expect(detailReport.body.report.rows[0].status).toBe('AUTO_CLOSED');
    expect(detailReport.body.report.rows[0].workedMinutes).toBe(0);

    const summaryCsv = await request(app)
      .get(`/api/v1/reports/time-clock?storeId=${STORE_B}&from=2026-04-20T00:00:00.000Z&to=2026-04-22T00:00:00.000Z&format=csv`)
      .set('Cookie', managerCookie);

    expect(summaryCsv.status).toBe(200);
    expect(summaryCsv.headers['content-type']).toContain('text/csv');
    expect(summaryCsv.text).toContain('employeeId,salespersonCode,employeeName,totalEntries');
    expect(summaryCsv.text).toContain(',2,');
    expect(summaryCsv.text).toContain(',1,1');
  });

  it('rejects clock-in when the store policy is disabled', async () => {
    const ownerCookie = await loginCookie(OWNER_EMAIL, OWNER_PASSWORD);
    const employee = await createEmployee(ownerCookie, {
      suffix: 'disabled',
      roleName: 'SALESPERSON',
      timeClockPin: '5555',
    });
    const employeeCookie = await loginCookie(employee.email, employee.password);

    const clockIn = await request(app)
      .post('/api/v1/employees/time-clock/clock-in')
      .set('Cookie', employeeCookie)
      .send({
        storeId: STORE_DISABLED,
        pin: '5555',
      });

    expect(clockIn.status).toBe(409);
    expect(clockIn.body.error.code).toBe('TIME_CLOCK_DISABLED');
  });
});
