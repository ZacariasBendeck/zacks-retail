import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '../src/prismaClient';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';
import { hashPassword } from '../src/services/employees/passwordHash';

const prisma = new PrismaClient();

const RUN_ID = Date.now();
const OWNER_EMAIL = `activity-review-owner-${RUN_ID}@example.com`;
const OWNER_PASSWORD = 'activity-review-owner-123';
const LIMITED_EMAIL = `activity-review-limited-${RUN_ID}@example.com`;
const LIMITED_PASSWORD = 'activity-review-limited-123';
const PRODUCT_EVENT_ID = randomUUID();
const FAILURE_EVENT_ID = randomUUID();

async function ensurePlatformTables(): Promise<void> {
  await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS platform');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS platform.platform_audit_log (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NULL,
      actor_user_id TEXT NULL,
      actor_session_id TEXT NULL,
      outcome TEXT NOT NULL DEFAULT 'SUCCESS',
      reason TEXT NULL,
      ip_address TEXT NULL,
      user_agent TEXT NULL,
      before_json JSONB NULL,
      after_json JSONB NULL,
      metadata_json JSONB NULL,
      trace_id TEXT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS platform.activity_review_event_review (
      audit_event_id TEXT PRIMARY KEY REFERENCES platform.platform_audit_log(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('REVIEWED', 'FLAGGED', 'NO_ISSUE')),
      reviewed_by_user_id TEXT NULL REFERENCES public."User"(id) ON DELETE SET NULL,
      review_note TEXT NULL,
      reviewed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureOwnerUser(): Promise<string> {
  await bootstrapOwner(prisma);
  const ownerRole = await prisma.role.findUnique({ where: { name: 'OWNER' } });
  const passwordHash = await hashPassword(OWNER_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Activity Review Owner',
    },
    create: {
      email: OWNER_EMAIL,
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Activity Review Owner',
    },
    select: { id: true },
  });
  return user.id;
}

async function ensureLimitedUser(): Promise<void> {
  const passwordHash = await hashPassword(LIMITED_PASSWORD);
  const role = await prisma.role.upsert({
    where: { name: `ACTIVITY_REVIEW_LIMITED_${RUN_ID}` },
    update: { permissions: ['products.view'] },
    create: { name: `ACTIVITY_REVIEW_LIMITED_${RUN_ID}`, permissions: ['products.view'] },
  });
  await prisma.user.upsert({
    where: { email: LIMITED_EMAIL },
    update: {
      passwordHash,
      roleId: role.id,
      active: true,
      displayName: 'Limited User',
    },
    create: {
      email: LIMITED_EMAIL,
      passwordHash,
      roleId: role.id,
      active: true,
      displayName: 'Limited User',
    },
  });
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

describe('activity review routes', () => {
  let ownerUserId = '';

  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER_EMAIL;
    process.env.AUTH_OWNER_PASSWORD = OWNER_PASSWORD;

    await ensurePlatformTables();
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, LIMITED_EMAIL] } } });
    await prisma.role.deleteMany({ where: { name: `ACTIVITY_REVIEW_LIMITED_${RUN_ID}` } });
    ownerUserId = await ensureOwnerUser();
    await ensureLimitedUser();

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO platform.platform_audit_log
          (id, event_type, action, resource_type, resource_id, actor_user_id,
           outcome, reason, ip_address, user_agent, before_json, after_json, metadata_json, created_at)
        VALUES
          ($1, 'products.sku.update', 'SKU_UPDATE', 'products.sku', 'SKU-1', $2,
           'SUCCESS', 'corrected SKU category', '127.0.0.1', 'jest',
           $3::jsonb, $4::jsonb, $5::jsonb, now() - interval '1 minute'),
          ($6, 'identity.login.failure', 'LOGIN', 'identity.login', NULL, NULL,
           'FAILURE', 'INVALID_CREDENTIALS', '10.0.0.1', 'jest',
           NULL, NULL, $7::jsonb, now() - interval '2 minutes')
      `,
      PRODUCT_EVENT_ID,
      ownerUserId,
      JSON.stringify({ category: 'OLD' }),
      JSON.stringify({ category: 'NEW' }),
      JSON.stringify({ module: 'products', storeId: '101', registerId: 'POS-1' }),
      FAILURE_EVENT_ID,
      JSON.stringify({ email: 'unknown@example.com', module: 'identity_access' }),
    );
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO platform.activity_review_event_review
          (audit_event_id, status, reviewed_by_user_id, review_note, reviewed_at, updated_at)
        VALUES ($1, 'FLAGGED', $2, 'investigate login failures', now(), now())
      `,
      FAILURE_EVENT_ID,
      ownerUserId,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'DELETE FROM platform.activity_review_event_review WHERE audit_event_id IN ($1, $2)',
      PRODUCT_EVENT_ID,
      FAILURE_EVENT_ID,
    );
    await prisma.$executeRawUnsafe(
      'DELETE FROM platform.platform_audit_log WHERE id IN ($1, $2)',
      PRODUCT_EVENT_ID,
      FAILURE_EVENT_ID,
    );
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, LIMITED_EMAIL] } } });
    await prisma.role.deleteMany({ where: { name: `ACTIVITY_REVIEW_LIMITED_${RUN_ID}` } });
    await prisma.$disconnect();
  });

  it('requires activity_review.view permission', async () => {
    const cookie = await login(LIMITED_EMAIL, LIMITED_PASSWORD);
    const res = await request(app).get('/api/v1/activity-review/events').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('lists and filters activity review events', async () => {
    const cookie = await login(OWNER_EMAIL, OWNER_PASSWORD);

    const products = await request(app)
      .get('/api/v1/activity-review/events?module=products&storeId=101&riskLevel=MEDIUM&limit=10')
      .set('Cookie', cookie);

    expect(products.status).toBe(200);
    expect(products.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: PRODUCT_EVENT_ID,
          module: 'products',
          category: 'change',
          riskLevel: 'MEDIUM',
          storeId: '101',
          registerId: 'POS-1',
          actorUserId: ownerUserId,
          actorEmail: OWNER_EMAIL,
          reviewStatus: 'UNREVIEWED',
        }),
      ]),
    );

    const failed = await request(app)
      .get('/api/v1/activity-review/events?outcome=FAILURE&reviewStatus=FLAGGED&limit=10')
      .set('Cookie', cookie);

    expect(failed.status).toBe(200);
    expect(failed.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: FAILURE_EVENT_ID,
          module: 'identity_access',
          riskLevel: 'HIGH',
          outcome: 'FAILURE',
          reviewStatus: 'FLAGGED',
        }),
      ]),
    );
  });

  it('returns a per-user summary', async () => {
    const cookie = await login(OWNER_EMAIL, OWNER_PASSWORD);
    const res = await request(app)
      .get(`/api/v1/activity-review/summary?module=products&search=${PRODUCT_EVENT_ID}&limit=50`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: ownerUserId,
          actorName: 'Activity Review Owner',
          actorEmail: OWNER_EMAIL,
          totalEvents: expect.any(Number),
          modules: expect.arrayContaining(['products']),
        }),
      ]),
    );
  });

  it('returns detail, updates review status, and exports CSV', async () => {
    const cookie = await login(OWNER_EMAIL, OWNER_PASSWORD);

    const detail = await request(app)
      .get(`/api/v1/activity-review/events/${PRODUCT_EVENT_ID}`)
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.event.beforeJson).toEqual({ category: 'OLD' });
    expect(detail.body.event.afterJson).toEqual({ category: 'NEW' });

    const review = await request(app)
      .post(`/api/v1/activity-review/events/${PRODUCT_EVENT_ID}/review`)
      .set('Cookie', cookie)
      .send({ status: 'REVIEWED', reviewNote: 'Looks intentional.' });
    expect(review.status).toBe(200);
    expect(review.body.event.reviewStatus).toBe('REVIEWED');
    expect(review.body.event.reviewNote).toBe('Looks intentional.');

    const csv = await request(app)
      .get('/api/v1/activity-review/events.csv?module=products&limit=10')
      .set('Cookie', cookie);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-disposition']).toContain('activity-review-events.csv');
    expect(csv.text).toContain(PRODUCT_EVENT_ID);
    expect(csv.text).toContain('SKU Update');
  });
});
