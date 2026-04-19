import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';

const prisma = new PrismaClient();
const OWNER_EMAIL = `user-crud-${Date.now()}@example.com`;
const OWNER_PASSWORD = 'owner-password-123';

async function ownerCookie(): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
  return res.headers['set-cookie'][0];
}

describe('user CRUD routes', () => {
  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER_EMAIL;
    process.env.AUTH_OWNER_PASSWORD = OWNER_PASSWORD;
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: 'user-crud-' } } });
    await bootstrapOwner(prisma);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: 'user-crud-' } } });
    await prisma.$disconnect();
  });

  it('GET /users without auth returns 401', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('POST /users creates a user', async () => {
    const cookie = await ownerCookie();
    const salesperson = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        email: `user-crud-new-${Date.now()}@example.com`,
        displayName: 'New User',
        password: 'new-user-pw-12345',
        roleId: salesperson!.id,
      });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toMatch(/user-crud-new-/);
  });

  it('GET /users returns a list', async () => {
    const cookie = await ownerCookie();
    const res = await request(app).get('/api/v1/users').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThan(0);
    for (const u of res.body.users) expect(u.passwordHash).toBeUndefined();
  });

  it('PATCH /users/:id updates displayName', async () => {
    const cookie = await ownerCookie();
    const existing = (await request(app).get('/api/v1/users').set('Cookie', cookie)).body.users[0];
    const res = await request(app)
      .patch(`/api/v1/users/${existing.id}`)
      .set('Cookie', cookie)
      .send({ displayName: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Renamed');
  });

  it('DELETE /users/:id removes the user', async () => {
    const cookie = await ownerCookie();
    const salesperson = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const create = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        email: `user-crud-delete-${Date.now()}@example.com`,
        displayName: 'Delete Me',
        password: 'delete-me-pw-12345',
        roleId: salesperson!.id,
      });
    const id = create.body.user.id;
    const del = await request(app).delete(`/api/v1/users/${id}`).set('Cookie', cookie);
    expect(del.status).toBe(204);
  });
});
