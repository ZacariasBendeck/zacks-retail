import { prisma } from '../../db/prisma';
import { buildReasonCodes } from './helpers';
import { compileRule } from './ruleCompilerService';
import { writeSegmentationAuditEvent } from './auditService';
import { SegmentRule, SingleCustomerEvaluationInput } from './types';

type MatchedRow = {
  customerId: string;
  score: number;
  reasonCodes: Record<string, unknown>;
};

function valuesSql(rows: MatchedRow[]): { sql: string; params: unknown[] } {
  if (rows.length === 0) return { sql: '', params: [] };
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    params.push(row.customerId, row.score, JSON.stringify(row.reasonCodes));
    const base = params.length - 2;
    return `($${base}::uuid, $${base + 1}, $${base + 2}::jsonb)`;
  });
  return {
    sql: tuples.join(', '),
    params,
  };
}

async function collectMatchedRows(ruleAst: SegmentRule, customerId?: string): Promise<MatchedRow[]> {
  const compiled = await compileRule(ruleAst);
  const params = [...compiled.params];
  const customerPredicate = customerId ? ` AND cfc.customer_id = $${params.length + 1}::uuid` : '';
  if (customerId) params.push(customerId);
  const matches = await prisma.$queryRawUnsafe<Array<{ customer_id: string }>>(
    `SELECT cfc.customer_id
       FROM app.customer_features_current cfc
      WHERE ${compiled.sql}${customerPredicate}
      ORDER BY cfc.customer_id`,
    ...params,
  );

  return Promise.all(
    matches.map(async (match) => ({
      customerId: match.customer_id,
      score: 100,
      reasonCodes: await buildReasonCodes(match.customer_id, ruleAst),
    })),
  );
}

async function countEvaluatedCustomers(customerId?: string): Promise<number> {
  if (customerId) return 1;
  const rows = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
    'SELECT COUNT(*)::bigint AS total FROM app.customer_features_current',
  );
  return Number(rows[0]?.total ?? 0n);
}

async function withSegmentLock<T>(segmentId: string, run: () => Promise<T>): Promise<T> {
  const key = `segment-evaluation:${segmentId}`;
  const lockRows = await prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
    'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
    key,
  );
  if (!lockRows[0]?.locked) {
    throw new Error('EVALUATION_ALREADY_RUNNING');
  }
  try {
    return await run();
  } finally {
    await prisma.$queryRawUnsafe('SELECT pg_advisory_unlock(hashtext($1))', key);
  }
}

export async function evaluateSegmentVersion(input: {
  segmentId: string;
  segmentVersionId: string;
  ruleAst: SegmentRule;
  evaluationMode: 'batch' | 'realtime' | 'hybrid' | 'manual';
  actorUserId?: string | null;
  customerId?: string;
  metadata?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const run = await prisma.customerSegmentEvaluationRun.create({
    data: {
      segmentId: input.segmentId,
      segmentVersionId: input.segmentVersionId,
      evaluationMode: input.evaluationMode,
      status: 'running',
      metadata: (input.metadata as any) ?? undefined,
    },
  });

  try {
    return await withSegmentLock(input.segmentId, async () => {
      const matchedRows = await collectMatchedRows(input.ruleAst, input.customerId);
      const customersEvaluated = await countEvaluatedCustomers(input.customerId);
      const values = valuesSql(matchedRows);

      const summary = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`
          CREATE TEMP TABLE tmp_segment_matches (
            customer_id UUID PRIMARY KEY,
            score NUMERIC(10,4),
            reason_codes JSONB
          ) ON COMMIT DROP
        `);

        if (matchedRows.length > 0) {
          await tx.$executeRawUnsafe(
            `INSERT INTO tmp_segment_matches (customer_id, score, reason_codes) VALUES ${values.sql}`,
            ...values.params,
          );
        }

        const currentCustomerFilter = input.customerId
          ? ` AND csc.customer_id = $4::uuid`
          : '';
        const tmpCustomerFilter = input.customerId
          ? ` AND t.customer_id = $4::uuid`
          : '';
        const baseParams = input.customerId
          ? [input.segmentId, input.segmentVersionId, run.id, input.customerId]
          : [input.segmentId, input.segmentVersionId, run.id];

        const countQuery = async (sql: string): Promise<number> => {
          const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(sql, ...baseParams);
          return Number(rows[0]?.count ?? 0n);
        };

        const customersMatched = matchedRows.length;
        const customersEntered = await countQuery(
          `SELECT COUNT(*)::bigint AS count
             FROM tmp_segment_matches t
             LEFT JOIN app.customer_segment_current csc
               ON csc.customer_id = t.customer_id
              AND csc.segment_id = $1::uuid
            WHERE csc.customer_id IS NULL${tmpCustomerFilter}`,
        );
        const customersExited = await countQuery(
          `SELECT COUNT(*)::bigint AS count
             FROM app.customer_segment_current csc
             LEFT JOIN tmp_segment_matches t
               ON t.customer_id = csc.customer_id
            WHERE csc.segment_id = $1::uuid
              AND t.customer_id IS NULL${currentCustomerFilter}`,
        );
        const customersScoreChanged = await countQuery(
          `SELECT COUNT(*)::bigint AS count
             FROM app.customer_segment_current csc
             JOIN tmp_segment_matches t
               ON t.customer_id = csc.customer_id
            WHERE csc.segment_id = $1::uuid
              AND ABS(COALESCE(csc.score, 0) - COALESCE(t.score, 0)) > 0.0001${currentCustomerFilter}`,
        );
        const customersRefreshed = await countQuery(
          `SELECT COUNT(*)::bigint AS count
             FROM app.customer_segment_current csc
             JOIN tmp_segment_matches t
               ON t.customer_id = csc.customer_id
            WHERE csc.segment_id = $1::uuid${currentCustomerFilter}`,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO app.customer_segment_history (
              customer_id, segment_id, segment_version_id, event_type, score, reason_codes, evaluation_run_id
            )
            SELECT t.customer_id, $1::uuid, $2::uuid, 'entered', t.score, t.reason_codes, $3::uuid
              FROM tmp_segment_matches t
              LEFT JOIN app.customer_segment_current csc
                ON csc.customer_id = t.customer_id
               AND csc.segment_id = $1::uuid
             WHERE csc.customer_id IS NULL${tmpCustomerFilter}`,
          ...baseParams,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO app.customer_segment_history (
              customer_id, segment_id, segment_version_id, event_type, previous_score, score, reason_codes, evaluation_run_id
            )
            SELECT csc.customer_id, csc.segment_id, $2::uuid, 'score_changed', csc.score, t.score, t.reason_codes, $3::uuid
              FROM app.customer_segment_current csc
              JOIN tmp_segment_matches t
                ON t.customer_id = csc.customer_id
             WHERE csc.segment_id = $1::uuid
               AND ABS(COALESCE(csc.score, 0) - COALESCE(t.score, 0)) > 0.0001${currentCustomerFilter}`,
          ...baseParams,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO app.customer_segment_history (
              customer_id, segment_id, segment_version_id, event_type, previous_score, score, reason_codes, evaluation_run_id
            )
            SELECT csc.customer_id, csc.segment_id, $2::uuid, 'version_changed', csc.score, t.score, t.reason_codes, $3::uuid
              FROM app.customer_segment_current csc
              JOIN tmp_segment_matches t
                ON t.customer_id = csc.customer_id
             WHERE csc.segment_id = $1::uuid
               AND csc.segment_version_id <> $2::uuid${currentCustomerFilter}`,
          ...baseParams,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO app.customer_segment_history (
              customer_id, segment_id, segment_version_id, event_type, previous_score, score, reason_codes, evaluation_run_id
            )
            SELECT csc.customer_id, csc.segment_id, $2::uuid, 'refreshed', csc.score, t.score, t.reason_codes, $3::uuid
              FROM app.customer_segment_current csc
              JOIN tmp_segment_matches t
                ON t.customer_id = csc.customer_id
             WHERE csc.segment_id = $1::uuid${currentCustomerFilter}`,
          ...baseParams,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO app.customer_segment_history (
              customer_id, segment_id, segment_version_id, event_type, previous_score, score, reason_codes, evaluation_run_id
            )
            SELECT csc.customer_id, csc.segment_id, csc.segment_version_id, 'exited', csc.score, NULL, csc.reason_codes, $3::uuid
              FROM app.customer_segment_current csc
              LEFT JOIN tmp_segment_matches t
                ON t.customer_id = csc.customer_id
             WHERE csc.segment_id = $1::uuid
               AND t.customer_id IS NULL${currentCustomerFilter}`,
          ...baseParams,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO app.customer_segment_current (
              customer_id, segment_id, segment_version_id, score, reason_codes, entered_at, last_matched_at, evaluation_run_id
            )
            SELECT t.customer_id, $1::uuid, $2::uuid, t.score, t.reason_codes, NOW(), NOW(), $3::uuid
              FROM tmp_segment_matches t
              LEFT JOIN app.customer_segment_current csc
                ON csc.customer_id = t.customer_id
               AND csc.segment_id = $1::uuid
             WHERE csc.customer_id IS NULL${tmpCustomerFilter}`,
          ...baseParams,
        );

        await tx.$executeRawUnsafe(
          `UPDATE app.customer_segment_current csc
              SET segment_version_id = $2::uuid,
                  score = t.score,
                  reason_codes = t.reason_codes,
                  last_matched_at = NOW(),
                  evaluation_run_id = $3::uuid
             FROM tmp_segment_matches t
            WHERE csc.customer_id = t.customer_id
              AND csc.segment_id = $1::uuid${currentCustomerFilter}`,
          ...baseParams,
        );

        await tx.$executeRawUnsafe(
          `DELETE FROM app.customer_segment_current csc
             WHERE csc.segment_id = $1::uuid
               AND NOT EXISTS (
                 SELECT 1 FROM tmp_segment_matches t WHERE t.customer_id = csc.customer_id
               )${currentCustomerFilter}`,
          ...baseParams,
        );

        await tx.customerSegmentEvaluationRun.update({
          where: { id: run.id },
          data: {
            status: 'completed',
            finishedAt: new Date(),
            customersEvaluated,
            customersMatched,
            customersEntered,
            customersExited,
            customersRefreshed,
            customersScoreChanged,
          },
        });

        return {
          runId: run.id,
          status: 'completed',
          customersEvaluated,
          customersMatched,
          customersEntered,
          customersExited,
          customersRefreshed,
          customersScoreChanged,
        };
      });

      await writeSegmentationAuditEvent({
        actorUserId: input.actorUserId ?? null,
        eventType: 'segment.evaluated',
        entityType: 'customer_segment',
        entityId: input.segmentId,
        after: summary,
      });

      return summary;
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.customerSegmentEvaluationRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorMessage,
      },
    });
    throw error;
  }
}

export async function evaluateSegmentById(
  segmentId: string,
  actorUserId?: string | null,
): Promise<Record<string, unknown>> {
  const version = await prisma.customerSegmentVersion.findFirst({
    where: { segmentId, status: 'active' },
    orderBy: { versionNumber: 'desc' },
  });
  if (!version) {
    throw new Error('SEGMENT_VERSION_NOT_FOUND');
  }
  return evaluateSegmentVersion({
    segmentId,
    segmentVersionId: version.id,
    ruleAst: version.ruleAst as SegmentRule,
    evaluationMode: 'manual',
    actorUserId,
  });
}

export async function evaluateActiveSegments(actorUserId?: string | null): Promise<{ runIds: string[] }> {
  const versions = await prisma.customerSegmentVersion.findMany({
    where: {
      status: 'active',
      segment: {
        status: 'active',
        evaluationMode: { in: ['batch', 'hybrid'] },
      },
    },
    include: { segment: true },
    orderBy: [{ segment: { priority: 'asc' } }, { versionNumber: 'desc' }],
  });

  const runIds: string[] = [];
  for (const version of versions) {
    try {
      const result = await evaluateSegmentVersion({
        segmentId: version.segmentId,
        segmentVersionId: version.id,
        ruleAst: version.ruleAst as SegmentRule,
        evaluationMode: version.segment.evaluationMode as 'batch' | 'hybrid',
        actorUserId,
      });
      runIds.push(String(result.runId));
    } catch (error) {
      console.error(`[segmentation] failed evaluating segment ${version.segmentId}:`, error);
    }
  }
  return { runIds };
}

export async function evaluateCustomerSegments(
  input: SingleCustomerEvaluationInput & { actorUserId?: string | null },
): Promise<Record<string, unknown>> {
  const versions = input.changedMetrics?.length
    ? await prisma.customerSegmentVersion.findMany({
        where: {
          status: 'active',
          segment: { status: 'active' },
          metricDependencies: {
            some: { metricKey: { in: input.changedMetrics } },
          },
        },
        include: { segment: true },
      })
    : await prisma.customerSegmentVersion.findMany({
        where: {
          status: 'active',
          segment: { status: 'active' },
        },
        include: { segment: true },
      });

  let entered = 0;
  let exited = 0;
  let refreshed = 0;
  for (const version of versions) {
    const result = await evaluateSegmentVersion({
      segmentId: version.segmentId,
      segmentVersionId: version.id,
      ruleAst: version.ruleAst as SegmentRule,
      evaluationMode: 'realtime',
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      metadata: {
        eventType: input.eventType ?? null,
        eventId: input.eventId ?? null,
        changedMetrics: input.changedMetrics ?? [],
      },
    });
    entered += Number(result.customersEntered ?? 0);
    exited += Number(result.customersExited ?? 0);
    refreshed += Number(result.customersRefreshed ?? 0);
  }

  return {
    customerId: input.customerId,
    evaluatedSegments: versions.length,
    entered,
    exited,
    refreshed,
  };
}

export async function getEvaluationRun(runId: string): Promise<Record<string, unknown> | null> {
  const run = await prisma.customerSegmentEvaluationRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  return {
    id: run.id,
    segmentId: run.segmentId,
    segmentVersionId: run.segmentVersionId,
    evaluationMode: run.evaluationMode,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    customersEvaluated: run.customersEvaluated,
    customersMatched: run.customersMatched,
    customersEntered: run.customersEntered,
    customersExited: run.customersExited,
    customersRefreshed: run.customersRefreshed,
    customersScoreChanged: run.customersScoreChanged,
    errorMessage: run.errorMessage,
    metadata: run.metadata,
  };
}
