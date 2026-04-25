import { prisma } from '../../db/prisma';
import { decimalToNumber } from './helpers';

export async function getCustomerSegments(customerId: string): Promise<Record<string, unknown>> {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT
        csc.customer_id,
        csc.segment_id,
        cs.segment_key,
        cs.name,
        cs.segment_family,
        csc.segment_version_id,
        csv.version_number,
        csc.score,
        csc.reason_codes,
        csc.entered_at,
        csc.last_matched_at
      FROM app.customer_segment_current csc
      JOIN app.customer_segments cs
        ON cs.id = csc.segment_id
      JOIN app.customer_segment_versions csv
        ON csv.id = csc.segment_version_id
      WHERE csc.customer_id = $1::uuid
      ORDER BY cs.priority ASC, cs.segment_key ASC`,
    customerId,
  );

  return {
    customerId,
    segments: rows.map((row) => ({
      segmentId: row.segment_id,
      segmentKey: row.segment_key,
      name: row.name,
      segmentFamily: row.segment_family,
      segmentVersionId: row.segment_version_id,
      versionNumber: row.version_number,
      score: decimalToNumber(row.score),
      reasonCodes: row.reason_codes,
      enteredAt: (row.entered_at as Date).toISOString(),
      lastMatchedAt: (row.last_matched_at as Date).toISOString(),
    })),
  };
}

export async function getSegmentMembers(
  segmentId: string,
  limit: number,
  offset: number,
): Promise<Record<string, unknown>> {
  const [items, totalRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT customer_id, segment_version_id, score, reason_codes, entered_at, last_matched_at
         FROM app.customer_segment_current
        WHERE segment_id = $1::uuid
        ORDER BY score DESC NULLS LAST, customer_id
        LIMIT $2 OFFSET $3`,
      segmentId,
      limit,
      offset,
    ),
    prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
      'SELECT COUNT(*)::bigint AS total FROM app.customer_segment_current WHERE segment_id = $1::uuid',
      segmentId,
    ),
  ]);

  return {
    items: items.map((row) => ({
      customerId: row.customer_id,
      segmentVersionId: row.segment_version_id,
      score: decimalToNumber(row.score),
      reasonCodes: row.reason_codes,
      enteredAt: (row.entered_at as Date).toISOString(),
      lastMatchedAt: (row.last_matched_at as Date).toISOString(),
    })),
    total: Number(totalRows[0]?.total ?? 0n),
  };
}

export async function getCustomerSegmentHistory(customerId: string): Promise<Record<string, unknown>> {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT
        csh.id,
        csh.segment_id,
        cs.segment_key,
        cs.name,
        csh.segment_version_id,
        csh.event_type,
        csh.previous_score,
        csh.score,
        csh.reason_codes,
        csh.occurred_at,
        csh.evaluation_run_id
       FROM app.customer_segment_history csh
       JOIN app.customer_segments cs
         ON cs.id = csh.segment_id
      WHERE csh.customer_id = $1::uuid
      ORDER BY csh.occurred_at DESC, csh.id DESC`,
    customerId,
  );

  return {
    customerId,
    items: rows.map((row) => ({
      id: row.id,
      segmentId: row.segment_id,
      segmentKey: row.segment_key,
      name: row.name,
      segmentVersionId: row.segment_version_id,
      eventType: row.event_type,
      previousScore: decimalToNumber(row.previous_score),
      score: decimalToNumber(row.score),
      reasonCodes: row.reason_codes,
      occurredAt: (row.occurred_at as Date).toISOString(),
      evaluationRunId: row.evaluation_run_id,
    })),
  };
}
