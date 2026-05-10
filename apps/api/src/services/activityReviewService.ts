import type { PrismaClient } from '../prismaClient';
import { recordPlatformAuditEvent } from './platformAuditService';

export type ActivityReviewRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ActivityReviewStatus = 'UNREVIEWED' | 'REVIEWED' | 'FLAGGED' | 'NO_ISSUE';

export interface ActivityReviewEvent {
  id: string;
  occurredAt: string;
  module: string;
  action: string;
  actionLabel: string;
  category: string;
  riskLevel: ActivityReviewRiskLevel;
  outcome: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  storeId: string | null;
  registerId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  reason: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  metadataJson: unknown;
  reviewStatus: ActivityReviewStatus;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface ActivityReviewQuery {
  actorUserId?: string;
  module?: string;
  category?: string;
  resourceType?: string;
  storeId?: string;
  outcome?: string;
  riskLevel?: ActivityReviewRiskLevel;
  reviewStatus?: ActivityReviewStatus;
  search?: string;
  createdFrom?: Date;
  createdTo?: Date;
  limit?: number;
}

export interface ActivityReviewUserSummary {
  actorUserId: string | null;
  actorName: string;
  actorEmail: string | null;
  lastActivityAt: string;
  totalEvents: number;
  todayEvents: number;
  thisWeekEvents: number;
  highRiskEvents: number;
  failedEvents: number;
  flaggedEvents: number;
  modules: string[];
  categories: Record<string, number>;
}

export interface ActivityReviewUpdateInput {
  auditEventId: string;
  status: Exclude<ActivityReviewStatus, 'UNREVIEWED'>;
  reviewNote?: string | null;
  reviewedByUserId?: string | null;
  actorSessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface ActivityReviewRow {
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
  review_status: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
  actor_email: string | null;
  actor_display_name: string | null;
  resource_user_email: string | null;
  resource_user_display_name: string | null;
  resource_role_name: string | null;
}

const KNOWN_MODULES = new Set([
  'activity_review',
  'customer_intelligence',
  'employees',
  'identity_access',
  'import_management',
  'inventory',
  'products',
  'purchasing',
  'reports',
  'sales_pos',
  'utilities',
]);
const ACRONYMS = new Set(['API', 'AR', 'CSV', 'GP', 'MFA', 'OTB', 'PO', 'POS', 'SKU']);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function metadataString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return null;
}

function humanize(value: string): string {
  return value
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase();
      return ACRONYMS.has(upper) ? upper : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function eventPrefix(eventType: string): string {
  return eventType.split(/[.:-]/)[0]?.toLowerCase() ?? '';
}

function deriveModule(row: Pick<ActivityReviewRow, 'event_type' | 'action' | 'resource_type' | 'metadata_json'>): string {
  const metadata = asRecord(row.metadata_json);
  const metadataModule = metadataString(metadata, ['module', 'sourceModule']);
  if (metadataModule && KNOWN_MODULES.has(metadataModule)) return metadataModule;

  const text = `${row.event_type} ${row.action} ${row.resource_type}`.toLowerCase();
  if (text.includes('activity_review')) return 'activity_review';
  if (text.includes('identity.') || text.includes('identity_') || text.includes('login') || text.includes('session')) {
    return 'identity_access';
  }
  if (text.includes('import')) return 'import_management';
  if (text.includes('segment') || text.includes('customer_segment')) return 'customer_intelligence';
  if (text.includes('customer')) return 'customer_intelligence';
  if (text.includes('inventory') || text.includes('transfer') || text.includes('receipt') || text.includes('return') || text.includes('count')) {
    return 'inventory';
  }
  if (text.includes('purchase') || text.includes('purchasing') || text.includes('otb')) return 'purchasing';
  if (text.includes('product') || text.includes('sku') || text.includes('taxonomy') || text.includes('vendor') || text.includes('attribute')) {
    return 'products';
  }
  if (text.includes('report') || text.includes('snapshot') || text.includes('export')) return 'reports';
  if (text.includes('utility') || text.includes('batch')) return 'utilities';
  if (text.includes('sales_pos') || text.includes('pos') || text.includes('refund') || text.includes('sale')) return 'sales_pos';
  if (text.includes('employee') || text.includes('time_clock')) return 'employees';

  const prefix = eventPrefix(row.event_type);
  return prefix || 'system';
}

function deriveCategory(row: Pick<ActivityReviewRow, 'event_type' | 'action' | 'resource_type' | 'outcome'>): string {
  const text = `${row.event_type} ${row.action} ${row.resource_type}`.toLowerCase();
  if (row.outcome === 'FAILURE') return 'failure';
  if (text.includes('login') || text.includes('logout') || text.includes('session')) return 'session';
  if (text.includes('role') || text.includes('permission') || text.includes('scope') || text.includes('mfa') || text.includes('password')) {
    return 'access_control';
  }
  if (text.includes('approve') || text.includes('final_liquidation')) return 'approval';
  if (text.includes('import')) return 'import';
  if (text.includes('export') || text.includes('snapshot') || text.includes('report')) return 'reporting';
  if (text.includes('batch') || text.includes('bulk') || text.includes('utility')) return 'bulk_change';
  if (text.includes('delete') || text.includes('deactivate') || text.includes('archive') || text.includes('remove') || text.includes('revoke')) {
    return 'removal';
  }
  if (text.includes('create') || text.includes('add')) return 'creation';
  if (text.includes('update') || text.includes('edit') || text.includes('change') || text.includes('adjust') || text.includes('receive')) {
    return 'change';
  }
  return 'work';
}

function deriveRiskLevel(
  row: Pick<ActivityReviewRow, 'event_type' | 'action' | 'resource_type' | 'outcome'>,
): ActivityReviewRiskLevel {
  const text = `${row.event_type} ${row.action} ${row.resource_type}`.toLowerCase();
  if (row.outcome === 'FAILURE') return 'HIGH';
  if (
    text.includes('permission') ||
    text.includes('role') ||
    text.includes('password_reset') ||
    text.includes('mfa') ||
    text.includes('external_identity') ||
    text.includes('delete') ||
    text.includes('deactivate') ||
    text.includes('archive') ||
    text.includes('refund') ||
    text.includes('cost_override') ||
    text.includes('final_liquidation')
  ) {
    return 'HIGH';
  }
  if (
    text.includes('adjust') ||
    text.includes('transfer') ||
    text.includes('receive') ||
    text.includes('import') ||
    text.includes('batch') ||
    text.includes('bulk') ||
    text.includes('sku') ||
    text.includes('product') ||
    text.includes('export')
  ) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function resourceLabel(row: ActivityReviewRow): string | null {
  if (row.resource_type === 'identity.user' && row.resource_id) {
    if (row.resource_user_display_name || row.resource_user_email) {
      return `${row.resource_user_display_name ?? 'User'}${row.resource_user_email ? ` <${row.resource_user_email}>` : ''}`;
    }
    return row.resource_id;
  }
  if (row.resource_type === 'identity.role' && row.resource_role_name) return row.resource_role_name;
  return row.resource_id;
}

function rowToEvent(row: ActivityReviewRow): ActivityReviewEvent {
  const metadata = asRecord(row.metadata_json);
  const module = deriveModule(row);
  const category = deriveCategory(row);
  const actionLabel = humanize(row.action || row.event_type);
  const reviewStatus = (row.review_status as ActivityReviewStatus | null) ?? 'UNREVIEWED';
  return {
    id: row.id,
    occurredAt: row.created_at.toISOString(),
    module,
    action: row.action,
    actionLabel,
    category,
    riskLevel: deriveRiskLevel(row),
    outcome: row.outcome,
    actorUserId: row.actor_user_id,
    actorName: row.actor_display_name,
    actorEmail: row.actor_email,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceLabel: resourceLabel(row),
    storeId: metadataString(metadata, ['storeId', 'store_id', 'store', 'locationId', 'location_id']),
    registerId: metadataString(metadata, ['registerId', 'register_id', 'register']),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    reason: row.reason,
    beforeJson: row.before_json ?? null,
    afterJson: row.after_json ?? null,
    metadataJson: row.metadata_json ?? null,
    reviewStatus,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviewNote: row.review_note,
  };
}

function needsDerivedFiltering(query: ActivityReviewQuery): boolean {
  return Boolean(query.module || query.category || query.riskLevel || query.storeId || query.reviewStatus);
}

function applyDerivedFilters(events: ActivityReviewEvent[], query: ActivityReviewQuery): ActivityReviewEvent[] {
  return events.filter((event) => {
    if (query.module && event.module !== query.module) return false;
    if (query.category && event.category !== query.category) return false;
    if (query.riskLevel && event.riskLevel !== query.riskLevel) return false;
    if (query.storeId && event.storeId !== query.storeId) return false;
    if (query.reviewStatus && event.reviewStatus !== query.reviewStatus) return false;
    return true;
  });
}

function limitedQuery(query: ActivityReviewQuery): { limit: number; scanLimit: number } {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const scanLimit = needsDerivedFiltering(query) ? Math.min(Math.max(limit * 10, 500), 2000) : limit;
  return { limit, scanLimit };
}

function buildEventSql(
  query: ActivityReviewQuery,
  scanLimit: number,
  includeReviewTable = true,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const where: string[] = [];

  function addWhere(clause: string, value: unknown): void {
    params.push(value);
    where.push(clause.replace('?', `$${params.length}`));
  }

  if (query.actorUserId) addWhere('a.actor_user_id = ?', query.actorUserId);
  if (query.outcome) addWhere('a.outcome = ?', query.outcome.toUpperCase());
  if (query.resourceType) addWhere('a.resource_type = ?', query.resourceType);
  if (query.createdFrom) addWhere('a.created_at >= ?', query.createdFrom);
  if (query.createdTo) addWhere('a.created_at <= ?', query.createdTo);
  if (query.search?.trim()) {
    addWhere(
      `lower(concat_ws(' ', a.id, a.event_type, a.action, a.resource_type, a.resource_id, a.reason, a.metadata_json::text, a.before_json::text, a.after_json::text)) LIKE ?`,
      `%${query.search.trim().toLowerCase()}%`,
    );
  }

  params.push(scanLimit);
  const limitRef = `$${params.length}`;
  const reviewSelect = includeReviewTable
    ? 'r.status AS review_status, r.reviewed_by_user_id, r.reviewed_at, r.review_note'
    : 'NULL::text AS review_status, NULL::text AS reviewed_by_user_id, NULL::timestamp AS reviewed_at, NULL::text AS review_note';
  const reviewJoin = includeReviewTable
    ? 'LEFT JOIN platform.activity_review_event_review r ON r.audit_event_id = a.id'
    : '';

  return {
    params,
    sql: `
      SELECT
        a.id, a.event_type, a.action, a.resource_type, a.resource_id, a.actor_user_id,
        a.actor_session_id, a.outcome, a.reason, a.ip_address, a.user_agent,
        a.before_json, a.after_json, a.metadata_json, a.created_at,
        ${reviewSelect},
        actor.email AS actor_email, actor."displayName" AS actor_display_name,
        resource_user.email AS resource_user_email, resource_user."displayName" AS resource_user_display_name,
        resource_role.name AS resource_role_name
      FROM platform.platform_audit_log a
      ${reviewJoin}
      LEFT JOIN public."User" actor ON actor.id = a.actor_user_id
      LEFT JOIN public."User" resource_user ON a.resource_type = 'identity.user' AND resource_user.id = a.resource_id
      LEFT JOIN public."Role" resource_role ON a.resource_type = 'identity.role' AND resource_role.id = a.resource_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${limitRef}
    `,
  };
}

export async function listActivityReviewEvents(
  prisma: PrismaClient,
  query: ActivityReviewQuery = {},
): Promise<ActivityReviewEvent[]> {
  const { limit, scanLimit } = limitedQuery(query);
  const { sql, params } = buildEventSql(query, scanLimit);
  try {
    const rows = await prisma.$queryRawUnsafe<ActivityReviewRow[]>(sql, ...params);
    return applyDerivedFilters(rows.map(rowToEvent), query).slice(0, limit);
  } catch {
    try {
      const fallback = buildEventSql(query, scanLimit, false);
      const rows = await prisma.$queryRawUnsafe<ActivityReviewRow[]>(fallback.sql, ...fallback.params);
      return applyDerivedFilters(rows.map(rowToEvent), query).slice(0, limit);
    } catch {
      return [];
    }
  }
}

export async function getActivityReviewEvent(
  prisma: PrismaClient,
  id: string,
): Promise<ActivityReviewEvent | null> {
  const events = await listActivityReviewEvents(prisma, { search: id, limit: 200 });
  return events.find((event) => event.id === id) ?? null;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfWeek(): Date {
  const today = startOfToday();
  const day = today.getDay();
  const offset = day === 0 ? 6 : day - 1;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
}

export async function getActivityReviewSummary(
  prisma: PrismaClient,
  query: ActivityReviewQuery = {},
): Promise<ActivityReviewUserSummary[]> {
  const events = await listActivityReviewEvents(prisma, { ...query, limit: query.limit ?? 200 });
  const today = startOfToday();
  const week = startOfWeek();
  const grouped = new Map<string, ActivityReviewUserSummary>();

  for (const event of events) {
    const key = event.actorUserId ?? `system:${event.actorEmail ?? 'system'}`;
    const occurred = new Date(event.occurredAt);
    const existing = grouped.get(key);
    const row =
      existing ??
      {
        actorUserId: event.actorUserId,
        actorName: event.actorName ?? event.actorEmail ?? 'System',
        actorEmail: event.actorEmail,
        lastActivityAt: event.occurredAt,
        totalEvents: 0,
        todayEvents: 0,
        thisWeekEvents: 0,
        highRiskEvents: 0,
        failedEvents: 0,
        flaggedEvents: 0,
        modules: [],
        categories: {},
      };

    row.totalEvents += 1;
    if (occurred >= today) row.todayEvents += 1;
    if (occurred >= week) row.thisWeekEvents += 1;
    if (event.riskLevel === 'HIGH') row.highRiskEvents += 1;
    if (event.outcome === 'FAILURE') row.failedEvents += 1;
    if (event.reviewStatus === 'FLAGGED') row.flaggedEvents += 1;
    row.categories[event.category] = (row.categories[event.category] ?? 0) + 1;
    if (!row.modules.includes(event.module)) row.modules.push(event.module);
    if (new Date(row.lastActivityAt) < occurred) row.lastActivityAt = event.occurredAt;

    grouped.set(key, row);
  }

  return Array.from(grouped.values()).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

async function ensureActivityReviewReviewTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS platform');
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
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS activity_review_event_review_status_idx
      ON platform.activity_review_event_review(status, reviewed_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS activity_review_event_review_reviewer_idx
      ON platform.activity_review_event_review(reviewed_by_user_id, reviewed_at DESC)
  `);
}

export async function updateActivityReviewEventReview(
  prisma: PrismaClient,
  input: ActivityReviewUpdateInput,
): Promise<ActivityReviewEvent | null> {
  const existing = await getActivityReviewEvent(prisma, input.auditEventId);
  if (!existing) return null;

  await ensureActivityReviewReviewTable(prisma);
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO platform.activity_review_event_review
        (audit_event_id, status, reviewed_by_user_id, review_note, reviewed_at, updated_at)
      VALUES ($1, $2, $3, $4, now(), now())
      ON CONFLICT (audit_event_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
        review_note = EXCLUDED.review_note,
        reviewed_at = now(),
        updated_at = now()
    `,
    input.auditEventId,
    input.status,
    input.reviewedByUserId ?? null,
    input.reviewNote?.trim() || null,
  );

  await recordPlatformAuditEvent(prisma, {
    eventType: 'activity_review.event_reviewed',
    action: 'REVIEW_ACTIVITY_EVENT',
    resourceType: 'activity_review.event',
    resourceId: input.auditEventId,
    actorUserId: input.reviewedByUserId ?? null,
    actorSessionId: input.actorSessionId ?? null,
    outcome: 'SUCCESS',
    reason: input.reviewNote?.trim() || null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadataJson: { status: input.status },
  });

  return getActivityReviewEvent(prisma, input.auditEventId);
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function activityReviewEventsCsv(events: ActivityReviewEvent[]): string {
  const header = [
    'event_id',
    'occurred_at',
    'actor_name',
    'actor_email',
    'module',
    'category',
    'action',
    'resource_type',
    'resource_id',
    'resource_label',
    'store_id',
    'register_id',
    'outcome',
    'risk_level',
    'review_status',
    'reason',
  ];
  const lines = events.map((event) => [
    event.id,
    event.occurredAt,
    event.actorName,
    event.actorEmail,
    event.module,
    event.category,
    event.actionLabel,
    event.resourceType,
    event.resourceId,
    event.resourceLabel,
    event.storeId,
    event.registerId,
    event.outcome,
    event.riskLevel,
    event.reviewStatus,
    event.reason,
  ].map(csvCell).join(','));
  return [header.map(csvCell).join(','), ...lines].join('\n');
}
