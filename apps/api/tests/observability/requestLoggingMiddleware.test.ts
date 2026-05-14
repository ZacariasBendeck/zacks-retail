import request from 'supertest';
import app from '../../src/app';
import { PrismaClient } from '../../src/prismaClient';

const prisma = new PrismaClient();

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

async function findPersistedTrace(requestId: string): Promise<Array<{ request_id: string; trace_id: string }>> {
  return prisma.$queryRawUnsafe<Array<{ request_id: string; trace_id: string }>>(
    `
      SELECT request_id, trace_id
      FROM platform.platform_request_trace
      WHERE request_id = $1
    `,
    requestId,
  );
}

async function waitForPersistedTrace(requestId: string): Promise<Array<{ request_id: string; trace_id: string }>> {
  for (let i = 0; i < 20; i += 1) {
    const rows = await findPersistedTrace(requestId);
    if (rows.length > 0) return rows;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return [];
}

describe('request logging middleware', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('sets request and trace headers from incoming trace context', async () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const res = await request(app)
      .get('/health')
      .set('traceparent', `00-${traceId}-00f067aa0ba902b7-01`)
      .set('x-request-id', 'req-health-123');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('req-health-123');
    expect(res.headers['x-trace-id']).toBe(traceId);
  });

  it('includes traceId on global 500 responses', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken"');

    expect(res.status).toBe(500);
    expect(res.body.error.traceId).toMatch(/^[a-f0-9]{32}$/);
    expect(res.headers['x-trace-id']).toBe(res.body.error.traceId);
  });

  it('persists request traces best-effort when configured to persist all', async () => {
    await ensureRequestTraceTable();
    const previous = process.env.REQUEST_TRACE_PERSIST_ALL;
    process.env.REQUEST_TRACE_PERSIST_ALL = '1';
    const requestId = `req-persist-${Date.now()}`;

    try {
      const res = await request(app).get('/health').set('x-request-id', requestId);
      expect(res.status).toBe(200);

      const rows = await waitForPersistedTrace(requestId);
      expect(rows).toEqual([
        expect.objectContaining({
          request_id: requestId,
          trace_id: res.headers['x-trace-id'],
        }),
      ]);
    } finally {
      if (previous === undefined) delete process.env.REQUEST_TRACE_PERSIST_ALL;
      else process.env.REQUEST_TRACE_PERSIST_ALL = previous;
      await prisma.$executeRawUnsafe(
        'DELETE FROM platform.platform_request_trace WHERE request_id = $1',
        requestId,
      );
    }
  });
});
