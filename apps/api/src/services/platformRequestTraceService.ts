import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../prismaClient';
import { logger, redactForLog } from '../observability/logger';
import type { RequestTimingStep } from '../observability/requestContext';

export interface PlatformRequestTrace {
  id: string;
  traceId: string;
  requestId: string;
  method: string;
  route: string | null;
  originalUrl: string;
  statusCode: number;
  durationMs: number;
  actorUserId: string | null;
  actorSessionId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  timingJson: unknown;
  metadataJson: unknown;
  createdAt: string;
}

export interface RecordPlatformRequestTraceInput {
  traceId: string;
  requestId: string;
  method: string;
  route?: string | null;
  originalUrl: string;
  statusCode: number;
  durationMs: number;
  actorUserId?: string | null;
  actorSessionId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  timingSteps?: RequestTimingStep[];
  metadataJson?: unknown;
}

export interface PlatformRequestTraceQuery {
  traceId?: string;
  requestId?: string;
  method?: string;
  route?: string;
  statusMin?: number;
  minDurationMs?: number;
  createdFrom?: Date;
  createdTo?: Date;
  limit?: number;
}

interface PlatformRequestTraceRow {
  id: string;
  trace_id: string;
  request_id: string;
  method: string;
  route: string | null;
  original_url: string;
  status_code: number;
  duration_ms: number;
  actor_user_id: string | null;
  actor_session_id: string | null;
  error_code: string | null;
  error_message: string | null;
  timing_json: unknown;
  metadata_json: unknown;
  created_at: Date;
}

function rowToTrace(row: PlatformRequestTraceRow): PlatformRequestTrace {
  return {
    id: row.id,
    traceId: row.trace_id,
    requestId: row.request_id,
    method: row.method,
    route: row.route,
    originalUrl: row.original_url,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    actorUserId: row.actor_user_id,
    actorSessionId: row.actor_session_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    timingJson: row.timing_json ?? [],
    metadataJson: row.metadata_json ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function recordPlatformRequestTrace(
  prisma: PrismaClient,
  input: RecordPlatformRequestTraceInput,
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO platform.platform_request_trace (
          id, trace_id, request_id, method, route, original_url, status_code,
          duration_ms, actor_user_id, actor_session_id, error_code,
          error_message, timing_json, metadata_json
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13::jsonb, $14::jsonb
        )
      `,
      randomUUID(),
      input.traceId,
      input.requestId,
      input.method.toUpperCase(),
      input.route ?? null,
      input.originalUrl,
      input.statusCode,
      input.durationMs,
      input.actorUserId ?? null,
      input.actorSessionId ?? null,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      JSON.stringify(redactForLog(input.timingSteps ?? [])),
      input.metadataJson == null ? null : JSON.stringify(redactForLog(input.metadataJson)),
    );
  } catch (err) {
    logger.debug(
      {
        err,
        traceId: input.traceId,
        requestId: input.requestId,
      },
      'platform request trace persistence skipped',
    );
  }
}

export async function listPlatformRequestTraces(
  prisma: PrismaClient,
  query: PlatformRequestTraceQuery = {},
): Promise<PlatformRequestTrace[]> {
  const params: unknown[] = [];
  const where: string[] = [];

  function addWhere(column: string, value: unknown): void {
    params.push(value);
    where.push(`${column} = $${params.length}`);
  }

  if (query.traceId) addWhere('trace_id', query.traceId);
  if (query.requestId) addWhere('request_id', query.requestId);
  if (query.method) addWhere('method', query.method.toUpperCase());
  if (query.route) addWhere('route', query.route);
  if (query.statusMin != null) {
    params.push(query.statusMin);
    where.push(`status_code >= $${params.length}`);
  }
  if (query.minDurationMs != null) {
    params.push(query.minDurationMs);
    where.push(`duration_ms >= $${params.length}`);
  }
  if (query.createdFrom) {
    params.push(query.createdFrom);
    where.push(`created_at >= $${params.length}`);
  }
  if (query.createdTo) {
    params.push(query.createdTo);
    where.push(`created_at <= $${params.length}`);
  }

  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  params.push(limit);

  const sql = `
    SELECT id, trace_id, request_id, method, route, original_url, status_code,
           duration_ms, actor_user_id, actor_session_id, error_code,
           error_message, timing_json, metadata_json, created_at
    FROM platform.platform_request_trace
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC, id DESC
    LIMIT $${params.length}
  `;

  const rows = await prisma.$queryRawUnsafe<PlatformRequestTraceRow[]>(sql, ...params);
  return rows.map(rowToTrace);
}

export async function getPlatformRequestTrace(
  prisma: PrismaClient,
  id: string,
): Promise<PlatformRequestTrace | null> {
  const rows = await prisma.$queryRawUnsafe<PlatformRequestTraceRow[]>(
    `
      SELECT id, trace_id, request_id, method, route, original_url, status_code,
             duration_ms, actor_user_id, actor_session_id, error_code,
             error_message, timing_json, metadata_json, created_at
      FROM platform.platform_request_trace
      WHERE id = $1
      LIMIT 1
    `,
    id,
  );
  return rows[0] ? rowToTrace(rows[0]) : null;
}
