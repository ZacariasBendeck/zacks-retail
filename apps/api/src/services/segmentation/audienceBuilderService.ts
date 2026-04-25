import crypto from 'node:crypto';
import { prisma } from '../../db/prisma';
import { compileRule } from './ruleCompilerService';
import { decimalToNumber } from './helpers';
import { writeSegmentationAuditEvent } from './auditService';
import { ActivationAudienceRequest } from './types';

function holdoutHit(audienceId: string, customerId: string, holdoutPercent: number): boolean {
  const hash = crypto.createHash('sha1').update(`${audienceId}:${customerId}`).digest('hex');
  const bucket = Number.parseInt(hash.slice(0, 8), 16) % 100;
  return bucket < holdoutPercent;
}

export async function buildActivationAudience(input: {
  request: ActivationAudienceRequest;
  actorUserId?: string | null;
}): Promise<Record<string, unknown>> {
  if (input.request.requireRelevantInventory) {
    throw new Error('AUDIENCE_BUILD_FAILED: relevant inventory filtering is not implemented yet.');
  }
  if (input.request.suppressRecentlyContacted) {
    throw new Error('AUDIENCE_BUILD_FAILED: recent-contact suppression surface is not implemented yet.');
  }

  const segments = await prisma.customerSegment.findMany({
    where: { segmentKey: { in: input.request.segmentKeys } },
    orderBy: { priority: 'asc' },
  });
  if (segments.length !== input.request.segmentKeys.length) {
    throw new Error('SEGMENT_NOT_FOUND');
  }

  const audience = await prisma.activationAudience.create({
    data: {
      audienceKey: `aud-${Date.now()}`,
      name: input.request.name,
      description: input.request.description ?? null,
      requestedBy: input.actorUserId ?? null,
      request: input.request as any,
      status: 'building',
      expiresAt: input.request.expiresAt ? new Date(input.request.expiresAt) : null,
    },
  });

  try {
    const segmentIds = segments.map((segment) => segment.id);
    const requireAll = input.request.requireAllSegments ?? true;
    const additional = input.request.additionalFilters
      ? await compileRule(input.request.additionalFilters)
      : null;
    const params: unknown[] = [segmentIds];
    let whereExtra = '';

    if (input.request.storeIds?.length) {
      params.push(input.request.storeIds);
      whereExtra += ` AND (cfc.preferred_store_id::text = ANY($${params.length}::text[]))`;
    }
    if (additional) {
      whereExtra += ` AND (${additional.sql})`;
      params.push(...additional.params);
    }

    const havingClause = requireAll
      ? `HAVING COUNT(DISTINCT csc.segment_id) = ${segmentIds.length}`
      : '';

    const candidates = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT
          csc.customer_id,
          array_agg(DISTINCT csc.segment_id)::text[] AS segment_ids,
          array_agg(DISTINCT csc.segment_version_id)::text[] AS segment_version_ids,
          MAX(csc.score)::double precision AS score,
          cfc.email_opt_in,
          cfc.sms_opt_in,
          cfc.push_opt_in,
          cfc.employee_flag,
          cfc.fraud_risk_flag,
          cfc.abuse_risk_flag,
          cfc.preferred_store_id
         FROM app.customer_segment_current csc
         JOIN app.customer_features_current cfc
           ON cfc.customer_id = csc.customer_id
        WHERE csc.segment_id = ANY($1::uuid[])${whereExtra}
        GROUP BY csc.customer_id, cfc.email_opt_in, cfc.sms_opt_in, cfc.push_opt_in,
                 cfc.employee_flag, cfc.fraud_risk_flag, cfc.abuse_risk_flag, cfc.preferred_store_id
        ${havingClause}
        ORDER BY MAX(csc.score) DESC NULLS LAST, csc.customer_id`,
      ...params,
    );

    const sliced = input.request.maxAudienceSize
      ? candidates.slice(0, input.request.maxAudienceSize)
      : candidates;

    const members = sliced.map((row) => {
      const suppressionReasons: string[] = [];
      if (row.employee_flag) suppressionReasons.push('employee_flag');
      if (row.fraud_risk_flag) suppressionReasons.push('fraud_risk_flag');
      if (row.abuse_risk_flag) suppressionReasons.push('abuse_risk_flag');
      if (input.request.channel === 'email' && !row.email_opt_in) suppressionReasons.push('email_opt_in_required');
      if (input.request.channel === 'sms' && !row.sms_opt_in) suppressionReasons.push('sms_opt_in_required');
      if (input.request.channel === 'push' && !row.push_opt_in) suppressionReasons.push('push_opt_in_required');

      let treatmentGroup: 'activation' | 'holdout' | 'suppressed' = 'activation';
      if (suppressionReasons.length > 0) {
        treatmentGroup = 'suppressed';
      } else if ((input.request.holdoutPercent ?? 0) > 0 && holdoutHit(audience.id, String(row.customer_id), input.request.holdoutPercent ?? 0)) {
        treatmentGroup = 'holdout';
      }

      return {
        audienceId: audience.id,
        customerId: String(row.customer_id),
        treatmentGroup,
        suppressionReasons,
        segmentIds: (row.segment_ids as string[]) ?? [],
        segmentVersionIds: (row.segment_version_ids as string[]) ?? [],
        score: decimalToNumber(row.score),
      };
    });

    const eligibleCustomers = members.filter((member) => member.treatmentGroup !== 'suppressed');
    const holdoutCustomers = members.filter((member) => member.treatmentGroup === 'holdout');
    const activationCustomers = members.filter((member) => member.treatmentGroup === 'activation');

    if (members.length > 0) {
      await prisma.activationAudienceMember.createMany({
        data: members.map((member) => ({
          audienceId: member.audienceId,
          customerId: member.customerId,
          treatmentGroup: member.treatmentGroup,
          suppressionReasons: member.suppressionReasons.length > 0 ? (member.suppressionReasons as any) : undefined,
          segmentIds: member.segmentIds,
          segmentVersionIds: member.segmentVersionIds,
          score: member.score,
        })),
      });
    }

    const updated = await prisma.activationAudience.update({
      where: { id: audience.id },
      data: {
        totalCandidates: sliced.length,
        eligibleCustomers: eligibleCustomers.length,
        holdoutCustomers: holdoutCustomers.length,
        activationCustomers: activationCustomers.length,
        status: 'ready',
      },
    });

    await writeSegmentationAuditEvent({
      actorUserId: input.actorUserId ?? null,
      eventType: 'activation_audience.created',
      entityType: 'activation_audience',
      entityId: updated.id,
      after: {
        totalCandidates: updated.totalCandidates,
        eligibleCustomers: updated.eligibleCustomers,
        holdoutCustomers: updated.holdoutCustomers,
        activationCustomers: updated.activationCustomers,
      },
    });

    return {
      audienceId: updated.id,
      status: updated.status,
      totalCandidates: updated.totalCandidates,
      eligibleCustomers: updated.eligibleCustomers,
      holdoutCustomers: updated.holdoutCustomers,
      activationCustomers: updated.activationCustomers,
    };
  } catch (error) {
    await prisma.activationAudience.update({
      where: { id: audience.id },
      data: {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function getAudience(audienceId: string): Promise<Record<string, unknown> | null> {
  const audience = await prisma.activationAudience.findUnique({ where: { id: audienceId } });
  if (!audience) return null;
  return {
    id: audience.id,
    audienceKey: audience.audienceKey,
    name: audience.name,
    description: audience.description,
    request: audience.request,
    totalCandidates: audience.totalCandidates,
    eligibleCustomers: audience.eligibleCustomers,
    holdoutCustomers: audience.holdoutCustomers,
    activationCustomers: audience.activationCustomers,
    status: audience.status,
    createdAt: audience.createdAt.toISOString(),
    expiresAt: audience.expiresAt?.toISOString() ?? null,
    errorMessage: audience.errorMessage,
  };
}

export async function getAudienceMembers(input: {
  audienceId: string;
  treatmentGroup?: string;
  limit: number;
  offset: number;
}): Promise<Record<string, unknown>> {
  const clauses = ['audience_id = $1::uuid'];
  const params: unknown[] = [input.audienceId];
  if (input.treatmentGroup) {
    params.push(input.treatmentGroup);
    clauses.push(`treatment_group = $${params.length}`);
  }
  params.push(input.limit, input.offset);
  const limitPlaceholder = `$${params.length - 1}`;
  const offsetPlaceholder = `$${params.length}`;
  const whereClause = clauses.join(' AND ');

  const [items, totalRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT customer_id, treatment_group, score, segment_ids, segment_version_ids, suppression_reasons, created_at
         FROM app.activation_audience_members
        WHERE ${whereClause}
        ORDER BY score DESC NULLS LAST, customer_id
        LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      ...params,
    ),
    prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
      `SELECT COUNT(*)::bigint AS total
         FROM app.activation_audience_members
        WHERE ${whereClause}`,
      ...params.slice(0, input.treatmentGroup ? 2 : 1),
    ),
  ]);

  return {
    items: items.map((row) => ({
      customerId: row.customer_id,
      treatmentGroup: row.treatment_group,
      score: decimalToNumber(row.score),
      segmentIds: row.segment_ids,
      segmentVersionIds: row.segment_version_ids,
      suppressionReasons: row.suppression_reasons,
      createdAt: (row.created_at as Date).toISOString(),
    })),
    total: Number(totalRows[0]?.total ?? 0n),
  };
}

export async function exportAudienceMembersCsv(audienceId: string): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT aam.customer_id, aam.treatment_group, aam.score, aam.segment_ids, aam.segment_version_ids, aam.suppression_reasons,
            ARRAY(
              SELECT cs.segment_key
                FROM app.customer_segments cs
               WHERE cs.id = ANY(aam.segment_ids)
               ORDER BY cs.segment_key
            ) AS segment_keys
       FROM app.activation_audience_members aam
      WHERE aam.audience_id = $1::uuid
      ORDER BY aam.score DESC NULLS LAST, aam.customer_id`,
    audienceId,
  );

  const header = 'customer_id,treatment_group,score,segment_keys,segment_version_ids,suppression_reasons';
  const lines = rows.map((row) => {
    const fields = [
      row.customer_id,
      row.treatment_group,
      row.score ?? '',
      JSON.stringify(row.segment_keys ?? []),
      JSON.stringify(row.segment_version_ids ?? []),
      JSON.stringify(row.suppression_reasons ?? []),
    ];
    return fields
      .map((field) => `"${String(field ?? '').replace(/"/g, '""')}"`)
      .join(',');
  });
  return [header, ...lines].join('\n');
}
