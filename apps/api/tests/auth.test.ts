import request from 'supertest';
import { PrismaClient } from '../src/prismaClient';
import app from '../src/app';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';
import { hashPassword } from '../src/services/employees/passwordHash';

const prisma = new PrismaClient();

async function ensureOwnerUser(email: string, password: string): Promise<void> {
  await bootstrapOwner(prisma);
  const ownerRole = await prisma.role.findUnique({ where: { name: 'OWNER' } });
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Owner',
    },
    create: {
      email,
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Owner',
    },
  });
}

describe('auth routes', () => {
  const email = `auth-test-${Date.now()}@example.com`;
  const password = 'test-password-123';

  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = email;
    process.env.AUTH_OWNER_PASSWORD = password;
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email } });
    await ensureOwnerUser(email, password);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('POST /auth/login with wrong password returns 401', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('POST /auth/login with right password returns 200 + sets cookie', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role.name).toBe('OWNER');
    const cookie = res.headers['set-cookie']?.[0];
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('GET /auth/me without cookie returns 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me with cookie returns the user', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const cookie = login.headers['set-cookie'][0];
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.permissions).toEqual(expect.arrayContaining(['employees.manage']));
  });

  it('GET /auth/me tolerates stale duplicate sid cookies', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const staleCookie = 'sid=00000000-0000-4000-8000-000000000000';
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', `${staleCookie}; ${cookie}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });

  it('GET /auth/me ignores malformed sid cookies', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', 'sid=not-a-session-id');
    expect(res.status).toBe(401);
  });

  it('POST /auth/logout clears the session', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const cookie = login.headers['set-cookie'][0];
    const logout = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(204);
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
  });

  it('POST /auth/change-password with wrong old password returns 400', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const cookie = login.headers['set-cookie'][0];
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ oldPassword: 'wrong', newPassword: 'new-password-456' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/change-password changes the password and revokes other sessions', async () => {
    const newPassword = 'new-password-789';
    const firstLogin = await request(app).post('/api/v1/auth/login').send({ email, password });
    const secondLogin = await request(app).post('/api/v1/auth/login').send({ email, password });
    const firstCookie = firstLogin.headers['set-cookie'][0];
    const secondCookie = secondLogin.headers['set-cookie'][0];

    const change = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', firstCookie)
      .send({ oldPassword: password, newPassword });

    expect(change.status).toBe(204);

    const currentSession = await request(app).get('/api/v1/auth/me').set('Cookie', firstCookie);
    expect(currentSession.status).toBe(200);
    const revokedSession = await request(app).get('/api/v1/auth/me').set('Cookie', secondCookie);
    expect(revokedSession.status).toBe(401);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/v1/auth/login').send({ email, password: newPassword });
    expect(newLogin.status).toBe(200);
  });
});


