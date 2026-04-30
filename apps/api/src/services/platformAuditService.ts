import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../prismaClient';

export interface PlatformAuditEvent {
  id: string;
  eventType: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  actorUserId: string | null;
  actorUser: PlatformAuditUserRef | null;
  actorSessionId: string | null;
  outcome: string;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  metadataJson: unknown;
  createdAt: string;
}

export interface PlatformAuditUserRef {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
}

export interface PlatformAuditResourceOption {
  resourceType: string;
  resourceId: string;
  label: string;
}

export interface PlatformAuditOptions {
  eventTypes: string[];
  resourceTypes: string[];
  outcomes: string[];
  actors: PlatformAuditUserRef[];
  resources: PlatformAuditResourceOption[];
}

export interface RecordPlatformAuditEventInput {
  eventType: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  actorUserId?: string | null;
  actorSessionId?: string | null;
  outcome?: string;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadataJson?: unknown;
  traceId?: string | null;
}

interface PlatformAuditRow {
  id: string;
  event_type: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  actor_user_id: string | null;
  actor_session_id: string | null;
  outcome: string;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  before_json: unknown;
  after_json: unknown;
  metadata_json: unknown;
  created_at: Date;
}

export async function recordPlatformAuditEvent(
  prisma: PrismaClient,
  input: RecordPlatformAuditEventInput,
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO platform.platform_audit_log (
          id, event_type, action, resource_type, resource_id, actor_user_id,
          actor_session_id, outcome, reason, ip_address, user_agent,
          before_json, after_json, metadata_json, trace_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12::jsonb, $13::jsonb, $14::jsonb, $15
        )
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
      input.ipAddress ?? null,
      input.userAgent ?? null,
      input.beforeJson == null ? null : JSON.stringify(input.beforeJson),
      input.afterJson == null ? null : JSON.stringify(input.afterJson),
      input.metadataJson == null ? null : JSON.stringify(input.metadataJson),
      input.traceId ?? null,
    );
  } catch {
    // Audit should never block the operational transaction. The route-level
    // audit viewer already handles missing platform audit storage gracefully.
  }
}

export interface PlatformAuditQuery {
  actorUserId?: string;
  eventType?: string;
  outcome?: string;
  resourceType?: string;
  resourceId?: string;
  metadataJsonContains?: Record<string, unknown>;
  createdFrom?: Date;
  createdTo?: Date;
  limit?: number;
}

function auditRowToEvent(row: PlatformAuditRow): PlatformAuditEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceLabel: null,
    actorUserId: row.actor_user_id,
    actorUser: null,
    actorSessionId: row.actor_session_id,
    outcome: row.outcome,
    reason: row.reason,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    beforeJson: row.before_json ?? null,
    afterJson: row.after_json ?? null,
    metadataJson: row.metadata_json ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function userLabel(user: PlatformAuditUserRef | undefined, fallback: string): string {
  if (!user) return fallback;
  return `${user.displayName} <${user.email}>`;
}

async function loadAuditUsers(
  prisma: PrismaClient,
  userIds: Iterable<string | null | undefined>,
): Promise<Map<string, PlatformAuditUserRef>> {
  const ids = Array.from(new Set(Array.from(userIds).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, displayName: true, active: true },
  });
  return new Map(users.map((user) => [user.id, user]));
}

async function loadAuditRoles(
  prisma: PrismaClient,
  roleIds: Iterable<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(Array.from(roleIds).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();

  const roles = await prisma.role.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(roles.map((role) => [role.id, role.name]));
}

async function enrichAuditEvents(
  prisma: PrismaClient,
  events: PlatformAuditEvent[],
): Promise<PlatformAuditEvent[]> {
  const userIds = [
    ...events.map((event) => event.actorUserId),
    ...events
      .filter((event) => event.resourceType === 'identity.user')
      .map((event) => event.resourceId),
  ];
  const roleIds = events
    .filter((event) => event.resourceType === 'identity.role')
    .map((event) => event.resourceId);
  const [users, roles] = await Promise.all([
    loadAuditUsers(prisma, userIds),
    loadAuditRoles(prisma, roleIds),
  ]);

  return events.map((event) => {
    const actorUser = event.actorUserId ? users.get(event.actorUserId) ?? null : null;
    const resourceUser =
      event.resourceType === 'identity.user' && event.resourceId
        ? users.get(event.resourceId)
        : undefined;
    const resourceRole =
      event.resourceType === 'identity.role' && event.resourceId
        ? roles.get(event.resourceId)
        : undefined;

    return {
      ...event,
      actorUser,
      resourceLabel:
        event.resourceType === 'identity.user' && event.resourceId
          ? userLabel(resourceUser, event.resourceId)
          : event.resourceType === 'identity.role' && resourceRole
            ? resourceRole
          : null,
    };
  });
}

export async function listPlatformAuditEvents(
  prisma: PrismaClient,
  query: PlatformAuditQuery = {},
): Promise<PlatformAuditEvent[]> {
  const params: unknown[] = [];
  const where: string[] = [];

  function addWhere(column: string, value: unknown): void {
    params.push(value);
    where.push(`${column} = $${params.length}`);
  }

  if (query.actorUserId) addWhere('actor_user_id', query.actorUserId);
  if (query.eventType) addWhere('event_type', query.eventType);
  if (query.outcome) addWhere('outcome', query.outcome.toUpperCase());
  if (query.resourceType) addWhere('resource_type', query.resourceType);
  if (query.resourceId) addWhere('resource_id', query.resourceId);
  if (query.metadataJsonContains) {
    params.push(JSON.stringify(query.metadataJsonContains));
    where.push(`metadata_json @> $${params.length}::jsonb`);
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
    SELECT id, event_type, action, resource_type, resource_id, actor_user_id,
           actor_session_id, outcome, reason, ip_address, user_agent,
           before_json, after_json, metadata_json, created_at
    FROM platform.platform_audit_log
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC, id DESC
    LIMIT $${params.length}
  `;

  try {
    const rows = await prisma.$queryRawUnsafe<PlatformAuditRow[]>(sql, ...params);
    return enrichAuditEvents(prisma, rows.map(auditRowToEvent));
  } catch {
    return [];
  }
}

export async function getPlatformAuditEvent(
  prisma: PrismaClient,
  id: string,
): Promise<PlatformAuditEvent | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<PlatformAuditRow[]>(
      `
        SELECT id, event_type, action, resource_type, resource_id, actor_user_id,
               actor_session_id, outcome, reason, ip_address, user_agent,
               before_json, after_json, metadata_json, created_at
        FROM platform.platform_audit_log
        WHERE id = $1
        LIMIT 1
      `,
      id,
    );
    const event = rows[0] ? auditRowToEvent(rows[0]) : null;
    if (!event) return null;
    const enriched = await enrichAuditEvents(prisma, [event]);
    return enriched[0] ?? null;
  } catch {
    return null;
  }
}

export async function getPlatformAuditOptions(
  prisma: PrismaClient,
): Promise<PlatformAuditOptions> {
  try {
    const [eventRows, resourceTypeRows, outcomeRows, actorRows, resourceRows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ event_type: string }>>(
        `
          SELECT DISTINCT event_type
          FROM platform.platform_audit_log
          ORDER BY event_type ASC
        `,
      ),
      prisma.$queryRawUnsafe<Array<{ resource_type: string }>>(
        `
          SELECT DISTINCT resource_type
          FROM platform.platform_audit_log
          ORDER BY resource_type ASC
        `,
      ),
      prisma.$queryRawUnsafe<Array<{ outcome: string }>>(
        `
          SELECT DISTINCT outcome
          FROM platform.platform_audit_log
          ORDER BY outcome ASC
        `,
      ),
      prisma.$queryRawUnsafe<Array<{ actor_user_id: string }>>(
        `
          SELECT DISTINCT actor_user_id
          FROM platform.platform_audit_log
          WHERE actor_user_id IS NOT NULL
          ORDER BY actor_user_id ASC
          LIMIT 200
        `,
      ),
      prisma.$queryRawUnsafe<Array<{ resource_type: string; resource_id: string }>>(
        `
          SELECT resource_type, resource_id
          FROM (
            SELECT DISTINCT ON (resource_type, resource_id)
              resource_type,
              resource_id,
              created_at
            FROM platform.platform_audit_log
            WHERE resource_id IS NOT NULL
            ORDER BY resource_type, resource_id, created_at DESC
          ) resources
          ORDER BY created_at DESC
          LIMIT 500
        `,
      ),
    ]);

    const [users, roles] = await Promise.all([
      loadAuditUsers(prisma, [
        ...actorRows.map((row) => row.actor_user_id),
        ...resourceRows
          .filter((row) => row.resource_type === 'identity.user')
          .map((row) => row.resource_id),
      ]),
      loadAuditRoles(
        prisma,
        resourceRows
          .filter((row) => row.resource_type === 'identity.role')
          .map((row) => row.resource_id),
      ),
    ]);

    return {
      eventTypes: eventRows.map((row) => row.event_type),
      resourceTypes: resourceTypeRows.map((row) => row.resource_type),
      outcomes: outcomeRows.map((row) => row.outcome),
      actors: actorRows
        .map((row) => users.get(row.actor_user_id))
        .filter((user): user is PlatformAuditUserRef => Boolean(user)),
      resources: resourceRows.map((row) => ({
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        label: row.resource_type === 'identity.user'
          ? userLabel(users.get(row.resource_id), row.resource_id)
          : row.resource_type === 'identity.role'
            ? roles.get(row.resource_id) ?? row.resource_id
          : row.resource_id,
      })),
    };
  } catch {
    return {
      eventTypes: [],
      resourceTypes: [],
      outcomes: ['SUCCESS', 'FAILURE'],
      actors: [],
      resources: [],
    };
  }
}
