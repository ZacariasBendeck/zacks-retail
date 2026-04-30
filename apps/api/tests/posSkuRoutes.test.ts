import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '../src/prismaClient';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';
import { hashPassword } from '../src/services/employees/passwordHash';
import { grantStoreScope } from '../src/services/identityAccess/storeScopeService';

const prisma = new PrismaClient();

const RUN_ID = Date.now();
const EMAIL = `pos-sku-owner-${RUN_ID}@example.com`;
const PASSWORD = 'pos-sku-owner-123';
const STORE_A = 1201;
const STORE_B = 1202;

async function ensureOwnerUser(): Promise<string> {
  await bootstrapOwner(prisma);
  const ownerRole = await prisma.role.findUnique({ where: { name: 'OWNER' } });
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'POS SKU Owner',
    },
    create: {
      email: EMAIL,
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'POS SKU Owner',
    },
    select: { id: true },
  });
  return user.id;
}

async function ownerCookie(): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

describe('pos sku helper routes', () => {
  let ownerUserId = '';

  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = EMAIL;
    process.env.AUTH_OWNER_PASSWORD = PASSWORD;
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    ownerUserId = await ensureOwnerUser();
  });

  afterAll(async () => {
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  it('requires POS permission for helper endpoints', async () => {
    const res = await request(app).get(`/api/v1/pos/promotions?storeId=${STORE_A}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('enforces store scopes on store-specific POS helper endpoints', async () => {
    await grantStoreScope(prisma, {
      userId: ownerUserId,
      scopeType: 'STORE',
      scopeId: String(STORE_A),
      actorUserId: ownerUserId,
      reason: 'pos sku helper scope test',
    });
    const cookie = await ownerCookie();

    const allowed = await request(app)
      .get(`/api/v1/pos/promotions?storeId=${STORE_A}`)
      .set('Cookie', cookie);

    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toEqual([]);

    const denied = await request(app)
      .get(`/api/v1/pos/promotions?storeId=${STORE_B}`)
      .set('Cookie', cookie);

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('STORE_SCOPE_FORBIDDEN');
  });
});
