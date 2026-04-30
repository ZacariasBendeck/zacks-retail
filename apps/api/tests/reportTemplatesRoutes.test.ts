import request from 'supertest';
import { PrismaClient } from '../src/prismaClient';
import app from '../src/app';
import { hashPassword } from '../src/services/employees/passwordHash';
import { PERMISSIONS } from '../src/services/employees/permissions';

const prisma = new PrismaClient();

// One OWNER (admin — has REPORTS_ADMIN via OWNER role) + one SALESPERSON
// (non-admin) exercise the three access tiers: owner, non-owner (shared reader),
// REPORTS_ADMIN.
const suffix = Date.now();
const OWNER_EMAIL = `rt-owner-${suffix}@example.com`;
const USER_EMAIL = `rt-user-${suffix}@example.com`;
const OTHER_EMAIL = `rt-other-${suffix}@example.com`;
const PW = 'test-password-123';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PW });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

describe('GET/POST/PATCH/DELETE /api/v1/reports/templates', () => {
  let ownerCookie: string;
  let userCookie: string;
  let otherCookie: string;

  beforeAll(async () => {
    // Ensure roles exist. Admin role here has REPORTS_ADMIN; SALESPERSON does not.
    const adminRole = await prisma.role.upsert({
      where: { name: 'OWNER' },
      update: {},
      create: { name: 'OWNER', permissions: [PERMISSIONS.REPORTS_ADMIN, PERMISSIONS.REPORTS_VIEW] },
    });
    const plainRole = await prisma.role.upsert({
      where: { name: 'SALESPERSON' },
      update: {},
      create: { name: 'SALESPERSON', permissions: [PERMISSIONS.REPORTS_VIEW] },
    });

    const hash = await hashPassword(PW);
    await prisma.user.create({
      data: { email: OWNER_EMAIL, passwordHash: hash, displayName: 'Owner Tester', roleId: adminRole.id },
    });
    await prisma.user.create({
      data: { email: USER_EMAIL, passwordHash: hash, displayName: 'Regular User', roleId: plainRole.id },
    });
    await prisma.user.create({
      data: { email: OTHER_EMAIL, passwordHash: hash, displayName: 'Other User', roleId: plainRole.id },
    });

    ownerCookie = await login(OWNER_EMAIL);
    userCookie = await login(USER_EMAIL);
    otherCookie = await login(OTHER_EMAIL);
  });

  afterAll(async () => {
    await prisma.reportTemplate.deleteMany({
      where: { owner: { email: { in: [OWNER_EMAIL, USER_EMAIL, OTHER_EMAIL] } } },
    });
    await prisma.session.deleteMany({
      where: { user: { email: { in: [OWNER_EMAIL, USER_EMAIL, OTHER_EMAIL] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, USER_EMAIL, OTHER_EMAIL] } } });
    await prisma.$disconnect();
  });

  it('POST / without auth returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/reports/templates')
      .send({ reportType: 'sales-analysis', title: 'no-auth', paramsJson: {} });
    expect(res.status).toBe(401);
  });

  it('POST / creates a template, default visibility=private', async () => {
    const res = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'sales-analysis', title: 'Q1 Categories', paramsJson: { dimension: 'CATEGORY' } });
    expect(res.status).toBe(201);
    expect(res.body.template.visibility).toBe('private');
    expect(res.body.template.title).toBe('Q1 Categories');
    expect(res.body.template.ownerDisplayName).toBe('Regular User');
    expect(res.body.template.paramsJson).toEqual({ dimension: 'CATEGORY' });
  });

  it('POST / accepts balancing-transfer templates', async () => {
    const res = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({
        reportType: 'balancing-transfer',
        title: 'ZAP CABALLEROS',
        visibility: 'shared',
        paramsJson: {
          algorithmMode: 'RICS_MIMIC',
          criteria: { ricsStoreSelection: '2,5-24,28-30,35-43,99' },
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.template.reportType).toBe('balancing-transfer');
    expect(res.body.template.visibility).toBe('shared');
  });

  it('POST / rejects unknown reportType', async () => {
    const res = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'not-a-real-report', title: 'x', paramsJson: {} });
    expect(res.status).toBe(400);
  });

  it('POST / rejects paramsJson that is an array', async () => {
    const res = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'sales-analysis', title: 'arr', paramsJson: [1, 2, 3] });
    expect(res.status).toBe(400);
  });

  it('POST / rejects title > 100 chars', async () => {
    const res = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'sales-analysis', title: 'x'.repeat(101), paramsJson: {} });
    expect(res.status).toBe(400);
  });

  it('POST / returns 409 on duplicate (owner, reportType, title)', async () => {
    const body = { reportType: 'best-sellers', title: 'Dupe Title', paramsJson: { topN: 10 } };
    const first = await request(app).post('/api/v1/reports/templates').set('Cookie', userCookie).send(body);
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/v1/reports/templates').set('Cookie', userCookie).send(body);
    expect(second.status).toBe(409);
  });

  it('GET /?scope=mine returns only my templates', async () => {
    const res = await request(app)
      .get('/api/v1/reports/templates?scope=mine')
      .set('Cookie', userCookie);
    expect(res.status).toBe(200);
    const ownerIds = new Set<string>(res.body.templates.map((t: { ownerId: string }) => t.ownerId));
    // Every template in scope=mine should belong to the caller.
    for (const id of ownerIds) {
      const me = await request(app).get('/api/v1/auth/me').set('Cookie', userCookie);
      expect(id).toBe(me.body.user.id);
    }
  });

  it('GET /?scope=all hides other users private templates from non-admins', async () => {
    // user creates a private template; other should NOT see it in scope=all.
    const create = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'stock-status', title: 'Secret', paramsJson: {}, visibility: 'private' });
    expect(create.status).toBe(201);
    const privateId = create.body.template.id;

    const otherList = await request(app)
      .get('/api/v1/reports/templates?scope=all')
      .set('Cookie', otherCookie);
    expect(otherList.status).toBe(200);
    const ids = otherList.body.templates.map((t: { id: string }) => t.id);
    expect(ids).not.toContain(privateId);
  });

  it('GET /?scope=all reveals shared templates from others to non-admins', async () => {
    const create = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'stock-status', title: 'Shared One', paramsJson: {}, visibility: 'shared' });
    expect(create.status).toBe(201);
    const sharedId = create.body.template.id;

    const otherList = await request(app)
      .get('/api/v1/reports/templates?scope=all')
      .set('Cookie', otherCookie);
    expect(otherList.status).toBe(200);
    const ids = otherList.body.templates.map((t: { id: string }) => t.id);
    expect(ids).toContain(sharedId);
  });

  it('GET /:id returns 404 to a non-admin when the template is private to another user', async () => {
    const create = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'sales-by-day', title: 'Hidden', paramsJson: {}, visibility: 'private' });
    const id = create.body.template.id;

    const res = await request(app).get(`/api/v1/reports/templates/${id}`).set('Cookie', otherCookie);
    expect(res.status).toBe(404);
  });

  it('GET /:id returns the template to an admin even when private', async () => {
    const create = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'sales-by-time', title: 'Admin Can See', paramsJson: {}, visibility: 'private' });
    const id = create.body.template.id;

    const res = await request(app).get(`/api/v1/reports/templates/${id}`).set('Cookie', ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body.template.id).toBe(id);
  });

  it('PATCH /:id by non-owner is forbidden even if shared', async () => {
    const create = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'sales-analysis', title: 'Shared To Edit', paramsJson: {}, visibility: 'shared' });
    const id = create.body.template.id;

    const res = await request(app)
      .patch(`/api/v1/reports/templates/${id}`)
      .set('Cookie', otherCookie)
      .send({ title: 'Stolen' });
    expect(res.status).toBe(403);
  });

  it('PATCH /:id by owner updates the title', async () => {
    const create = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'salesperson-summary', title: 'Old Title', paramsJson: {} });
    const id = create.body.template.id;

    const res = await request(app)
      .patch(`/api/v1/reports/templates/${id}`)
      .set('Cookie', userCookie)
      .send({ title: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.template.title).toBe('New Title');
  });

  it('DELETE /:id by non-owner non-admin is forbidden', async () => {
    const create = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'sales-history-by-month', title: 'No delete for you', paramsJson: {}, visibility: 'shared' });
    const id = create.body.template.id;

    const res = await request(app).delete(`/api/v1/reports/templates/${id}`).set('Cookie', otherCookie);
    expect(res.status).toBe(403);

    // still exists
    const still = await request(app).get(`/api/v1/reports/templates/${id}`).set('Cookie', userCookie);
    expect(still.status).toBe(200);
  });

  it('DELETE /:id by admin succeeds on another user template', async () => {
    const create = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'best-sellers', title: 'Admin removes this', paramsJson: {} });
    const id = create.body.template.id;

    const res = await request(app).delete(`/api/v1/reports/templates/${id}`).set('Cookie', ownerCookie);
    expect(res.status).toBe(204);

    const gone = await request(app).get(`/api/v1/reports/templates/${id}`).set('Cookie', userCookie);
    expect(gone.status).toBe(404);
  });

  it('POST /:id/touch bumps lastUsedAt', async () => {
    const create = await request(app)
      .post('/api/v1/reports/templates')
      .set('Cookie', userCookie)
      .send({ reportType: 'sales-analysis', title: 'Touch Me', paramsJson: {} });
    const id = create.body.template.id;
    expect(create.body.template.lastUsedAt).toBeNull();

    const touched = await request(app).post(`/api/v1/reports/templates/${id}/touch`).set('Cookie', userCookie);
    expect(touched.status).toBe(204);

    const after = await request(app).get(`/api/v1/reports/templates/${id}`).set('Cookie', userCookie);
    expect(after.body.template.lastUsedAt).not.toBeNull();
  });
});


