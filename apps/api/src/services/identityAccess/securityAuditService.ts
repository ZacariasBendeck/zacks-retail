import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { PrismaClient } from '../../prismaClient';

export interface IdentityAuditInput {
  actorUserId?: string | null;
  actorSessionId?: string | null;
  eventType: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: 'SUCCESS' | 'FAILURE';
  reason?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadataJson?: unknown;
  req?: Request;
}

function nullableJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export async function recordIdentityAudit(
  prisma: PrismaClient,
  input: IdentityAuditInput,
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO platform.platform_audit_log
          (id, event_type, action, resource_type, resource_id, actor_user_id,
           actor_session_id, outcome, reason, ip_address, user_agent,
           before_json, after_json, metadata_json, created_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
           $12::jsonb, $13::jsonb, $14::jsonb, now())
      `,
      randomUUID(),
      input.eventType,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.actorUserId ?? null,
      input.actorSessionId ?? null,
      input.outcome ?? 'SUCCESS',
      input.reason ?? null,
      input.req?.ip ?? null,
      input.req?.get('user-agent') ?? null,
      nullableJson(input.beforeJson),
      nullableJson(input.afterJson),
      nullableJson(input.metadataJson),
    );
  } catch {
    // Audit must not break operator workflows while older environments catch
    // up to the platform_audit_log migration. The migration makes this durable.
  }
}

export async function recordLoginEvent(
  prisma: PrismaClient,
  input: {
    email: string;
    userId?: string | null;
    roleId?: string | null;
    outcome: 'SUCCESS' | 'FAILURE';
    reason?: string | null;
    req?: Request;
  },
): Promise<void> {
  const normalizedEmail = input.email.toLowerCase().trim();
  try {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO public.identity_login_event
          (id, user_id, role_id, email, outcome, reason, ip_address, user_agent, occurred_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, now())
      `,
      randomUUID(),
      input.userId ?? null,
      input.roleId ?? null,
      normalizedEmail,
      input.outcome,
      input.reason ?? null,
      input.req?.ip ?? null,
      input.req?.get('user-agent') ?? null,
    );
  } catch {
    // Best-effort until the identity event migration is present everywhere.
  }

  await recordIdentityAudit(prisma, {
    actorUserId: input.userId ?? null,
    eventType: input.outcome === 'SUCCESS' ? 'identity.login.success' : 'identity.login.failure',
    action: 'LOGIN',
    resourceType: input.userId ? 'identity.user' : 'identity.login',
    resourceId: input.userId ?? null,
    outcome: input.outcome,
    reason: input.reason ?? null,
    metadataJson: {
      email: normalizedEmail,
      roleId: input.roleId ?? null,
    },
    req: input.req,
  });
}

export async function recordSessionEvent(
  prisma: PrismaClient,
  input: {
    sessionId?: string | null;
    userId?: string | null;
    eventType: string;
    reason?: string | null;
    req?: Request;
  },
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO public.identity_session_event
          (id, session_id, user_id, event_type, reason, ip_address, user_agent, occurred_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, now())
      `,
      randomUUID(),
      input.sessionId ?? null,
      input.userId ?? null,
      input.eventType,
      input.reason ?? null,
      input.req?.ip ?? null,
      input.req?.get('user-agent') ?? null,
    );
  } catch {
    // Best-effort until the identity event migration is present everywhere.
  }
}

export interface SessionEventSummary {
  id: string;
  sessionId: string | null;
  userId: string | null;
  eventType: string;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: string;
}

interface SessionEventRow {
  id: string;
  session_id: string | null;
  user_id: string | null;
  event_type: string;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: Date;
}

export async function listSessionEvents(
  prisma: PrismaClient,
  input: { userId?: string | null; sessionId?: string | null; limit?: number },
): Promise<SessionEventSummary[]> {
  const limit = Math.max(input.limit ?? 50, 1);
  try {
    const rows = await prisma.$queryRawUnsafe<SessionEventRow[]>(
      `
        SELECT id, session_id, user_id, event_type, reason, ip_address, user_agent, occurred_at
        FROM public.identity_session_event
        WHERE ($1::text IS NULL OR user_id = $1)
          AND ($2::text IS NULL OR session_id = $2)
        ORDER BY occurred_at DESC
        LIMIT $3
      `,
      input.userId ?? null,
      input.sessionId ?? null,
      limit,
    );
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      eventType: row.event_type,
      reason: row.reason,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      occurredAt: row.occurred_at.toISOString(),
    }));
  } catch {
    return [];
  }
}

export interface LoginEventSummary {
  id: string;
  userId: string | null;
  roleId: string | null;
  email: string;
  outcome: string;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: string;
}

interface LoginEventRow {
  id: string;
  user_id: string | null;
  role_id: string | null;
  email: string;
  outcome: string;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: Date;
}

export async function listLoginEvents(
  prisma: PrismaClient,
  input: { userId?: string | null; email?: string | null; limit?: number },
): Promise<LoginEventSummary[]> {
  const limit = Math.max(input.limit ?? 50, 1);
  try {
    const rows = input.userId
      ? await prisma.$queryRawUnsafe<LoginEventRow[]>(
          `
            SELECT id, user_id, role_id, email, outcome, reason, ip_address, user_agent, occurred_at
            FROM public.identity_login_event
            WHERE user_id = $1
            ORDER BY occurred_at DESC
            LIMIT $2
          `,
          input.userId,
          limit,
        )
      : await prisma.$queryRawUnsafe<LoginEventRow[]>(
          `
            SELECT id, user_id, role_id, email, outcome, reason, ip_address, user_agent, occurred_at
            FROM public.identity_login_event
            WHERE email = $1
            ORDER BY occurred_at DESC
            LIMIT $2
          `,
          input.email?.toLowerCase().trim() ?? '',
          limit,
        );
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      roleId: row.role_id,
      email: row.email,
      outcome: row.outcome,
      reason: row.reason,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      occurredAt: row.occurred_at.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function listFailedLoginEvents(
  prisma: PrismaClient,
  input: { email?: string | null; limit?: number } = {},
): Promise<LoginEventSummary[]> {
  const limit = Math.max(input.limit ?? 100, 1);
  try {
    const rows = await prisma.$queryRawUnsafe<LoginEventRow[]>(
      `
        SELECT id, user_id, role_id, email, outcome, reason, ip_address, user_agent, occurred_at
        FROM public.identity_login_event
        WHERE outcome = 'FAILURE'
          AND ($1::text IS NULL OR email = $1)
        ORDER BY occurred_at DESC
        LIMIT $2
      `,
      input.email?.toLowerCase().trim() || null,
      limit,
    );
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      roleId: row.role_id,
      email: row.email,
      outcome: row.outcome,
      reason: row.reason,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      occurredAt: row.occurred_at.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function countRecentFailedLoginEvents(
  prisma: PrismaClient,
  input: { email: string; windowMinutes: number },
): Promise<number> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `
        SELECT COUNT(*)::bigint AS count
        FROM public.identity_login_event
        WHERE email = $1
          AND outcome = 'FAILURE'
          AND occurred_at >= now() - ($2::int * interval '1 minute')
      `,
      input.email.toLowerCase().trim(),
      input.windowMinutes,
    );
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}
