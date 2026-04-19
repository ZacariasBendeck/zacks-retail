import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { BudgetCheckResult } from '../models/otbBudget';

export const DEFAULT_WARNING_THRESHOLD_PCT = 95;
export const DEFAULT_HARD_STOP_THRESHOLD_PCT = 100;
export const DEFAULT_CEO_EXCEPTION_THRESHOLD_PCT = 105;

export type OtbPolicySource = 'default' | 'configured';
export type OtbPolicyDecision = 'allow' | 'warn' | 'hard_stop' | 'override' | 'exception';

export interface OtbPolicyAuditEvent {
  id: string;
  eventId: string;
  eventTimestamp: string;
  department: string;
  periodYear: number;
  periodMonth: number;
  poId: string;
  policySource: OtbPolicySource;
  warningThresholdPct: number;
  hardStopThresholdPct: number;
  projectedUtilizationPct: number;
  decision: OtbPolicyDecision;
  overrideReasonCode: string | null;
  approverIds: string | null;
  ceoExceptionApprovalId: string | null;
  actorUserId: string;
  traceId: string;
  retentionExpiresAt: string;
}

type BuildAuditEventsInput = {
  poId: string;
  budgetImpact: BudgetCheckResult[];
  force: boolean;
  actorUserId: string;
  policySource?: OtbPolicySource;
  warningThresholdPct?: number;
  hardStopThresholdPct?: number;
  ceoExceptionThresholdPct?: number;
  overrideReasonCode?: string | null;
  approverIds?: string[] | null;
  ceoExceptionApprovalId?: string | null;
  traceId?: string | null;
};

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateProjectedUtilizationPct(projectedCommitted: number, plannedBudget: number): number {
  if (plannedBudget <= 0) {
    return projectedCommitted > 0 ? 9999 : 0;
  }
  return roundPct((projectedCommitted / plannedBudget) * 100);
}

export function classifyOtbPolicyDecision(input: {
  projectedUtilizationPct: number;
  force: boolean;
  warningThresholdPct: number;
  hardStopThresholdPct: number;
  ceoExceptionThresholdPct: number;
}): OtbPolicyDecision {
  if (input.projectedUtilizationPct >= input.hardStopThresholdPct) {
    if (!input.force) return 'hard_stop';
    if (input.projectedUtilizationPct > input.ceoExceptionThresholdPct) return 'exception';
    return 'override';
  }
  if (input.projectedUtilizationPct >= input.warningThresholdPct) return 'warn';
  return 'allow';
}

export function buildOtbPolicyAuditEvents(input: BuildAuditEventsInput): OtbPolicyAuditEvent[] {
  if (input.budgetImpact.length === 0) return [];

  const policySource = input.policySource ?? 'default';
  const warningThresholdPct = input.warningThresholdPct ?? DEFAULT_WARNING_THRESHOLD_PCT;
  const hardStopThresholdPct = input.hardStopThresholdPct ?? DEFAULT_HARD_STOP_THRESHOLD_PCT;
  const ceoExceptionThresholdPct = input.ceoExceptionThresholdPct ?? DEFAULT_CEO_EXCEPTION_THRESHOLD_PCT;
  const traceId = input.traceId && input.traceId.trim().length > 0 ? input.traceId : uuidv4();
  const eventId = uuidv4();
  const eventTimestamp = new Date().toISOString();
  const retentionExpiresAt = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString();
  const approverIds = input.approverIds && input.approverIds.length > 0 ? JSON.stringify(input.approverIds) : null;

  return input.budgetImpact.map((row) => {
    const projectedUtilizationPct = calculateProjectedUtilizationPct(row.projectedCommitted, row.plannedBudget);
    const decision = classifyOtbPolicyDecision({
      projectedUtilizationPct,
      force: input.force,
      warningThresholdPct,
      hardStopThresholdPct,
      ceoExceptionThresholdPct,
    });

    return {
      id: uuidv4(),
      eventId,
      eventTimestamp,
      department: row.department,
      periodYear: row.year,
      periodMonth: row.month,
      poId: input.poId,
      policySource,
      warningThresholdPct,
      hardStopThresholdPct,
      projectedUtilizationPct,
      decision,
      overrideReasonCode: input.overrideReasonCode ?? null,
      approverIds,
      ceoExceptionApprovalId: input.ceoExceptionApprovalId ?? null,
      actorUserId: input.actorUserId,
      traceId,
      retentionExpiresAt,
    };
  });
}

export function recordOtbPolicyAuditEvents(events: OtbPolicyAuditEvent[]): void {
  if (events.length === 0) return;

  const db = getDb();
  db.exec('BEGIN TRANSACTION');
  try {
    const stmt = db.prepare(`
      INSERT INTO otb_policy_audit_log (
        id,
        event_id,
        event_timestamp,
        department,
        period_year,
        period_month,
        po_id,
        policy_source,
        warning_threshold_pct,
        hard_stop_threshold_pct,
        projected_utilization_pct,
        decision,
        override_reason_code,
        approver_ids,
        ceo_exception_approval_id,
        actor_user_id,
        trace_id,
        retention_expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const event of events) {
      stmt.run(
        event.id,
        event.eventId,
        event.eventTimestamp,
        event.department,
        event.periodYear,
        event.periodMonth,
        event.poId,
        event.policySource,
        event.warningThresholdPct,
        event.hardStopThresholdPct,
        event.projectedUtilizationPct,
        event.decision,
        event.overrideReasonCode,
        event.approverIds,
        event.ceoExceptionApprovalId,
        event.actorUserId,
        event.traceId,
        event.retentionExpiresAt,
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
