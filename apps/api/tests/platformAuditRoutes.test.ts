import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '../src/prismaClient';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';
import { hashPassword } from '../src/services/employees/passwordHash';

const prisma = new PrismaClient();

const RUN_ID = Date.now();
const EMAIL = `platform-audit-owner-${RUN_ID}@example.com`;
const PASSWORD = 'platform-audit-owner-123';
const AUDIT_ID = randomUUID();

async function ensurePlatformAuditTable(): Promise<void> {
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
}

async function ensureOwnerUser(email: string, password: string): Promise<string> {
  await bootstrapOwner(prisma);
  const ownerRole = await prisma.role.findUnique({ where: { name: 'OWNER' } });
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Platform Audit Owner',
    },
    create: {
      email,
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Platform Audit Owner',
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

describe('platform audit routes', () => {
  let ownerUserId = '';

  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = EMAIL;
    process.env.AUTH_OWNER_PASSWORD = PASSWORD;

    await ensurePlatformAuditTable();
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    ownerUserId = await ensureOwnerUser(EMAIL, PASSWORD);

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO platform.platform_audit_log
          (id, event_type, action, resource_type, resource_id, actor_user_id,
           outcome, reason, after_json, metadata_json, created_at)
        VALUES
          ($1, 'identity.user.updated', 'UPDATE_USER', 'identity.user', $2, $3,
           'SUCCESS', 'platform audit route test', $4::jsonb, $5::jsonb, now())
      `,
      AUDIT_ID,
      ownerUserId,
      ownerUserId,
      JSON.stringify({ active: true }),
      JSON.stringify({ testRun: RUN_ID }),
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM platform.platform_audit_log WHERE id = $1', AUDIT_ID);
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  it('lists platform audit events with filters', async () => {
    const cookie = await ownerCookie();

    const res = await request(app)
      .get('/api/v1/platform/audit?resourceType=identity.user&eventType=identity.user.updated&limit=10')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: AUDIT_ID,
          eventType: 'identity.user.updated',
          action: 'UPDATE_USER',
          resourceType: 'identity.user',
          resourceId: ownerUserId,
          resourceLabel: `Platform Audit Owner <${EMAIL}>`,
          actorUserId: ownerUserId,
          actorUser: expect.objectContaining({
            id: ownerUserId,
            email: EMAIL,
            displayName: 'Platform Audit Owner',
          }),
          outcome: 'SUCCESS',
        }),
      ]),
    );
  });

  it('returns dropdown options for audit filters', async () => {
    const cookie = await ownerCookie();

    const res = await request(app)
      .get('/api/v1/platform/audit/_meta/options')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.options.eventTypes).toContain('identity.user.updated');
    expect(res.body.options.resourceTypes).toContain('identity.user');
    expect(res.body.options.outcomes).toContain('SUCCESS');
    expect(res.body.options.actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ownerUserId, email: EMAIL, displayName: 'Platform Audit Owner' }),
      ]),
    );
    expect(res.body.options.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceType: 'identity.user',
          resourceId: ownerUserId,
          label: `Platform Audit Owner <${EMAIL}>`,
        }),
      ]),
    );
  });

  it('returns one platform audit event by id', async () => {
    const cookie = await ownerCookie();

    const res = await request(app)
      .get(`/api/v1/platform/audit/${AUDIT_ID}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.event.id).toBe(AUDIT_ID);
    expect(res.body.event.actorUser.email).toBe(EMAIL);
    expect(res.body.event.resourceLabel).toBe(`Platform Audit Owner <${EMAIL}>`);
    expect(res.body.event.afterJson).toEqual({ active: true });
    expect(res.body.event.metadataJson).toEqual({ testRun: RUN_ID });
  });
});
