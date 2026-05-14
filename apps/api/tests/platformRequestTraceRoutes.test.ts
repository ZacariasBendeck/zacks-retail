import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '../src/prismaClient';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';
import { hashPassword } from '../src/services/employees/passwordHash';
import { recordPlatformRequestTrace } from '../src/services/platformRequestTraceService';

const prisma = new PrismaClient();

const RUN_ID = Date.now();
const EMAIL = `platform-request-trace-owner-${RUN_ID}@example.com`;
const PASSWORD = 'platform-request-trace-owner-123';
const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const REQUEST_ID = `req-platform-trace-${RUN_ID}`;
const TRACE_ROW_ID = randomUUID();

async function ensureRequestTraceTable(): Promise<void> {
  await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS platform');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS platform.platform_request_trace (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      method TEXT NOT NULL,
      route TEXT NULL,
      original_url TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      actor_user_id TEXT NULL,
      actor_session_id TEXT NULL,
      error_code TEXT NULL,
      error_message TEXT NULL,
      timing_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata_json JSONB NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

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
      displayName: 'Platform Request Trace Owner',
    },
    create: {
      email,
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Platform Request Trace Owner',
    },
  });
}

async function ownerCookie(): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

describe('platform request trace routes', () => {
  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = EMAIL;
    process.env.AUTH_OWNER_PASSWORD = PASSWORD;

    await ensureRequestTraceTable();
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await ensureOwnerUser(EMAIL, PASSWORD);

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO platform.platform_request_trace (
          id, trace_id, request_id, method, route, original_url, status_code,
          duration_ms, error_code, error_message, timing_json, metadata_json, created_at
        )
        VALUES (
          $1, $2, $3, 'GET', '/health', '/health', 200,
          1234, null, null, $4::jsonb, $5::jsonb, now()
        )
      `,
      TRACE_ROW_ID,
      TRACE_ID,
      REQUEST_ID,
      JSON.stringify([{ name: 'test.step', ms: 123 }]),
      JSON.stringify({ testRun: RUN_ID }),
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'DELETE FROM platform.platform_request_trace WHERE request_id = $1',
      REQUEST_ID,
    );
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/platform/request-traces');
    expect(res.status).toBe(401);
  });

  it('lists request traces with filters', async () => {
    const cookie = await ownerCookie();

    const res = await request(app)
      .get(`/api/v1/platform/request-traces?traceId=${TRACE_ID}&minDurationMs=1000&limit=10`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.traces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: TRACE_ROW_ID,
          traceId: TRACE_ID,
          requestId: REQUEST_ID,
          method: 'GET',
          route: '/health',
          durationMs: 1234,
          timingJson: [{ name: 'test.step', ms: 123 }],
          metadataJson: { testRun: RUN_ID },
        }),
      ]),
    );
  });

  it('returns one request trace by id', async () => {
    const cookie = await ownerCookie();

    const res = await request(app)
      .get(`/api/v1/platform/request-traces/${TRACE_ROW_ID}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.trace.id).toBe(TRACE_ROW_ID);
    expect(res.body.trace.traceId).toBe(TRACE_ID);
    expect(res.body.trace.timingJson).toEqual([{ name: 'test.step', ms: 123 }]);
  });

  it('does not throw if request-trace persistence fails', async () => {
    const failingPrisma = {
      $executeRawUnsafe: jest.fn().mockRejectedValue(new Error('table missing')),
    } as unknown as PrismaClient;

    await expect(recordPlatformRequestTrace(failingPrisma, {
      traceId: TRACE_ID,
      requestId: 'req-best-effort',
      method: 'GET',
      originalUrl: '/health',
      statusCode: 200,
      durationMs: 5,
    })).resolves.toBeUndefined();
  });
});
