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
const ORPHAN_ACTOR_EVENT_ID = randomUUID();
const ORPHAN_ACTOR_USER_ID = randomUUID();
const BULK_SAFE_EVENT_ID = randomUUID();
const BULK_FILTER_EVENT_ID = randomUUID();
const BULK_HIGH_EVENT_ID = randomUUID();
const BULK_FAILURE_EVENT_ID = randomUUID();
const ALL_EVENT_IDS = [
  PRODUCT_EVENT_ID,
  FAILURE_EVENT_ID,
  ORPHAN_ACTOR_EVENT_ID,
  BULK_SAFE_EVENT_ID,
  BULK_FILTER_EVENT_ID,
  BULK_HIGH_EVENT_ID,
  BULK_FAILURE_EVENT_ID,
];

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
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO platform.platform_audit_log
          (id, event_type, action, resource_type, resource_id, actor_user_id,
           outcome, reason, ip_address, user_agent, before_json, after_json, metadata_json, created_at)
        VALUES
          ($1, 'utilities.batch.run', 'BATCH_RUN', 'utilities.batch', 'orphan-actor', $2,
           'SUCCESS', 'orphan-actor-marker', '127.0.0.1', 'jest',
           NULL, NULL, $3::jsonb, now() - interval '3 minutes')
      `,
      ORPHAN_ACTOR_EVENT_ID,
      ORPHAN_ACTOR_USER_ID,
      JSON.stringify({ module: 'utilities' }),
    );
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO platform.platform_audit_log
          (id, event_type, action, resource_type, resource_id, actor_user_id,
           outcome, reason, ip_address, user_agent, before_json, after_json, metadata_json, created_at)
        VALUES
          ($1, 'reports.export', 'REPORT_EXPORT', 'reports.report', 'bulk-safe', $2,
           'SUCCESS', 'bulk explicit safe marker', '127.0.0.1', 'jest',
           NULL, NULL, $3::jsonb, now() - interval '3 minutes'),
          ($4, 'products.sku.update', 'SKU_UPDATE', 'products.sku', 'BULK-FILTER-1', $2,
           'SUCCESS', 'bulk-filter-marker safe product update', '127.0.0.1', 'jest',
           $5::jsonb, $6::jsonb, $7::jsonb, now() - interval '4 minutes'),
          ($8, 'identity.role.permission_update', 'ROLE_PERMISSION_UPDATE', 'identity.role', 'role-bulk-high', $2,
           'SUCCESS', 'bulk high marker', '127.0.0.1', 'jest',
           $9::jsonb, $10::jsonb, $11::jsonb, now() - interval '5 minutes'),
          ($12, 'identity.login.failure', 'LOGIN', 'identity.login', NULL, NULL,
           'FAILURE', 'bulk failure marker', '10.0.0.2', 'jest',
           NULL, NULL, $13::jsonb, now() - interval '6 minutes')
      `,
      BULK_SAFE_EVENT_ID,
      ownerUserId,
      JSON.stringify({ module: 'reports' }),
      BULK_FILTER_EVENT_ID,
      JSON.stringify({ category: 'OLD' }),
      JSON.stringify({ category: 'NEW' }),
      JSON.stringify({ module: 'products', storeId: '202' }),
      BULK_HIGH_EVENT_ID,
      JSON.stringify({ permissions: ['products.view'] }),
      JSON.stringify({ permissions: ['products.view', 'products.write'] }),
      JSON.stringify({ module: 'identity_access' }),
      BULK_FAILURE_EVENT_ID,
      JSON.stringify({ module: 'identity_access' }),
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'DELETE FROM platform.activity_review_event_review WHERE audit_event_id = ANY($1::text[])',
      ALL_EVENT_IDS,
    );
    await prisma.$executeRawUnsafe(
      'DELETE FROM platform.platform_audit_log WHERE id = ANY($1::text[])',
      ALL_EVENT_IDS,
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

    const bulk = await request(app)
      .post('/api/v1/activity-review/events/bulk-review')
      .set('Cookie', cookie)
      .send({
        mode: 'IDS',
        eventIds: [BULK_SAFE_EVENT_ID],
        status: 'NO_ISSUE',
        reviewNote: 'Routine safe activity.',
      });
    expect(bulk.status).toBe(403);
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

    const expandedLimit = await request(app)
      .get('/api/v1/activity-review/events?limit=500')
      .set('Cookie', cookie);

    expect(expandedLimit.status).toBe(200);
    expect(expandedLimit.body.events).toEqual(expect.any(Array));

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

  it('labels summary rows for missing actor records as unknown users', async () => {
    const cookie = await login(OWNER_EMAIL, OWNER_PASSWORD);
    const res = await request(app)
      .get('/api/v1/activity-review/summary?search=orphan-actor-marker')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual([
      expect.objectContaining({
        actorUserId: ORPHAN_ACTOR_USER_ID,
        actorName: `Unknown user (${ORPHAN_ACTOR_USER_ID.slice(0, 8)})`,
        actorEmail: null,
      }),
    ]);
  });

  it('does not cap per-user summary totals by the event list limit', async () => {
    const cookie = await login(OWNER_EMAIL, OWNER_PASSWORD);
    const res = await request(app)
      .get(`/api/v1/activity-review/summary?actorUserId=${ownerUserId}&limit=1`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const ownerSummary = res.body.summary.find((row: { actorUserId?: string }) => row.actorUserId === ownerUserId);
    expect(ownerSummary).toEqual(expect.objectContaining({
      actorUserId: ownerUserId,
      actorEmail: OWNER_EMAIL,
    }));
    expect(ownerSummary.totalEvents).toBeGreaterThan(1);
  });

  it('bulk reviews explicit IDs and skips high-risk or failed rows when clearing activity', async () => {
    const cookie = await login(OWNER_EMAIL, OWNER_PASSWORD);

    const bulk = await request(app)
      .post('/api/v1/activity-review/events/bulk-review')
      .set('Cookie', cookie)
      .send({
        mode: 'IDS',
        eventIds: [BULK_SAFE_EVENT_ID, BULK_HIGH_EVENT_ID, BULK_FAILURE_EVENT_ID],
        status: 'NO_ISSUE',
        reviewNote: 'Routine report export spot-checked.',
      });

    expect(bulk.status).toBe(200);
    expect(bulk.body).toEqual(expect.objectContaining({
      status: 'NO_ISSUE',
      updatedCount: 1,
      skippedCount: 2,
      hasMore: false,
    }));
    expect(bulk.body.skippedEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: BULK_HIGH_EVENT_ID, riskLevel: 'HIGH' }),
      expect.objectContaining({ id: BULK_FAILURE_EVENT_ID, outcome: 'FAILURE' }),
    ]));

    const safe = await request(app)
      .get(`/api/v1/activity-review/events/${BULK_SAFE_EVENT_ID}`)
      .set('Cookie', cookie);
    expect(safe.body.event.reviewStatus).toBe('NO_ISSUE');

    const high = await request(app)
      .get(`/api/v1/activity-review/events/${BULK_HIGH_EVENT_ID}`)
      .set('Cookie', cookie);
    expect(high.body.event.reviewStatus).toBe('UNREVIEWED');
  });

  it('bulk reviews all rows matching current filters up to the batch cap', async () => {
    const cookie = await login(OWNER_EMAIL, OWNER_PASSWORD);

    const bulk = await request(app)
      .post('/api/v1/activity-review/events/bulk-review')
      .set('Cookie', cookie)
      .send({
        mode: 'FILTER',
        filters: {
          module: 'products',
          reviewStatus: 'UNREVIEWED',
          search: 'bulk-filter-marker',
        },
        status: 'REVIEWED',
        reviewNote: 'Product update pattern spot-checked.',
      });

    expect(bulk.status).toBe(200);
    expect(bulk.body).toEqual(expect.objectContaining({
      status: 'REVIEWED',
      updatedCount: 1,
      skippedCount: 0,
      hasMore: false,
    }));

    const reviewed = await request(app)
      .get(`/api/v1/activity-review/events/${BULK_FILTER_EVENT_ID}`)
      .set('Cookie', cookie);
    expect(reviewed.body.event.reviewStatus).toBe('REVIEWED');
    expect(reviewed.body.event.reviewNote).toBe('Product update pattern spot-checked.');
  });

  it('bulk flagging can mark high-risk or failed activity', async () => {
    const cookie = await login(OWNER_EMAIL, OWNER_PASSWORD);

    const bulk = await request(app)
      .post('/api/v1/activity-review/events/bulk-review')
      .set('Cookie', cookie)
      .send({
        mode: 'IDS',
        eventIds: [BULK_HIGH_EVENT_ID, BULK_FAILURE_EVENT_ID],
        status: 'FLAGGED',
        reviewNote: 'Needs manager follow-up.',
      });

    expect(bulk.status).toBe(200);
    expect(bulk.body).toEqual(expect.objectContaining({
      status: 'FLAGGED',
      updatedCount: 2,
      skippedCount: 0,
    }));

    const flagged = await request(app)
      .get(`/api/v1/activity-review/events/${BULK_FAILURE_EVENT_ID}`)
      .set('Cookie', cookie);
    expect(flagged.body.event.reviewStatus).toBe('FLAGGED');
  });

  it('validates bulk review input', async () => {
    const cookie = await login(OWNER_EMAIL, OWNER_PASSWORD);

    const missingNote = await request(app)
      .post('/api/v1/activity-review/events/bulk-review')
      .set('Cookie', cookie)
      .send({ mode: 'IDS', eventIds: [BULK_SAFE_EVENT_ID], status: 'NO_ISSUE', reviewNote: '' });
    expect(missingNote.status).toBe(400);

    const missingIds = await request(app)
      .post('/api/v1/activity-review/events/bulk-review')
      .set('Cookie', cookie)
      .send({ mode: 'IDS', status: 'NO_ISSUE', reviewNote: 'Routine safe activity.' });
    expect(missingIds.status).toBe(400);

    const missingFilters = await request(app)
      .post('/api/v1/activity-review/events/bulk-review')
      .set('Cookie', cookie)
      .send({ mode: 'FILTER', status: 'NO_ISSUE', reviewNote: 'Routine safe activity.' });
    expect(missingFilters.status).toBe(400);
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
