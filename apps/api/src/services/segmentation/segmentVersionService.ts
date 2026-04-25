import { prisma } from '../../db/prisma';
import { writeSegmentationAuditEvent } from './auditService';
import { DEFAULT_SEGMENT_SEEDS } from './defaults';
import { seedDefaultMetrics } from './metricRegistryService';
import { previewSegment } from './segmentPreviewService';
import { evaluateSegmentById } from './segmentEvaluationService';
import { validateRule } from './ruleValidatorService';
import { SegmentRule } from './types';

export async function createSegmentVersion(input: {
  segmentId: string;
  ruleAst: SegmentRule;
  scoringConfig?: unknown;
  activationPolicy?: unknown;
  suppressionPolicy?: unknown;
  actorUserId?: string | null;
}): Promise<Record<string, unknown>> {
  const validation = await validateRule(input.ruleAst);
  const latest = await prisma.customerSegmentVersion.findFirst({
    where: { segmentId: input.segmentId },
    orderBy: { versionNumber: 'desc' },
  });
  const versionNumber = (latest?.versionNumber ?? 0) + 1;

  const version = await prisma.$transaction(async (tx) => {
    const created = await tx.customerSegmentVersion.create({
      data: {
        segmentId: input.segmentId,
        versionNumber,
        ruleAst: input.ruleAst as any,
        scoringConfig: (input.scoringConfig as any) ?? undefined,
        activationPolicy: (input.activationPolicy as any) ?? undefined,
        suppressionPolicy: (input.suppressionPolicy as any) ?? undefined,
        status: 'draft',
        validationStatus: validation.isValid ? 'valid' : 'invalid',
        validationErrors: validation.errors.length > 0 ? (validation.errors as any) : undefined,
        createdBy: input.actorUserId ?? null,
      },
    });

    if (validation.metricDependencies.length > 0) {
      await tx.segmentVersionMetricDependency.createMany({
        data: validation.metricDependencies.map((metricKey) => ({
          segmentVersionId: created.id,
          metricKey,
        })),
      });
    }
    return created;
  });

  await writeSegmentationAuditEvent({
    actorUserId: input.actorUserId ?? null,
    eventType: 'segment_version.created',
    entityType: 'customer_segment_version',
    entityId: version.id,
    after: version,
  });

  return {
    id: version.id,
    segmentId: version.segmentId,
    versionNumber: version.versionNumber,
    status: version.status,
    validationStatus: version.validationStatus,
    validationErrors: version.validationErrors,
    metricDependencies: validation.metricDependencies,
  };
}

export async function validateSegmentVersionRule(ruleAst: SegmentRule): Promise<Record<string, unknown>> {
  const validation = await validateRule(ruleAst);
  return {
    isValid: validation.isValid,
    errors: validation.errors,
    metricDependencies: validation.metricDependencies,
  };
}

export async function previewSegmentVersion(ruleAst: SegmentRule, limit?: number): Promise<Record<string, unknown>> {
  return previewSegment({ ruleAst, limit });
}

export async function activateSegmentVersion(input: {
  segmentId: string;
  versionId: string;
  actorUserId?: string | null;
  evaluateImmediately?: boolean;
}): Promise<Record<string, unknown>> {
  const version = await prisma.customerSegmentVersion.findUnique({ where: { id: input.versionId } });
  if (!version || version.segmentId !== input.segmentId) {
    throw new Error('SEGMENT_VERSION_NOT_FOUND');
  }
  const validation = await validateRule(version.ruleAst as SegmentRule);
  if (!validation.isValid) {
    throw new Error('SEGMENT_VERSION_INVALID');
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerSegmentVersion.updateMany({
      where: { segmentId: input.segmentId, status: 'active' },
      data: {
        status: 'retired',
        retiredAt: new Date(),
      },
    });
    await tx.customerSegmentVersion.update({
      where: { id: input.versionId },
      data: {
        status: 'active',
        validationStatus: 'valid',
        validationErrors: undefined,
        activatedAt: new Date(),
        retiredAt: null,
      },
    });
    await tx.customerSegment.update({
      where: { id: input.segmentId },
      data: {
        status: 'active',
        updatedBy: input.actorUserId ?? null,
      },
    });
  });

  await writeSegmentationAuditEvent({
    actorUserId: input.actorUserId ?? null,
    eventType: 'segment_version.activated',
    entityType: 'customer_segment_version',
    entityId: input.versionId,
    after: { segmentId: input.segmentId },
  });

  const result: Record<string, unknown> = {
    segmentId: input.segmentId,
    versionId: input.versionId,
    status: 'active',
  };
  if (input.evaluateImmediately !== false) {
    result.evaluation = await evaluateSegmentById(input.segmentId, input.actorUserId);
  }
  return result;
}

export async function retireSegmentVersion(input: {
  segmentId: string;
  versionId: string;
  actorUserId?: string | null;
}): Promise<Record<string, unknown>> {
  const version = await prisma.customerSegmentVersion.findUnique({ where: { id: input.versionId } });
  if (!version || version.segmentId !== input.segmentId) {
    throw new Error('SEGMENT_VERSION_NOT_FOUND');
  }
  const retired = await prisma.customerSegmentVersion.update({
    where: { id: input.versionId },
    data: {
      status: 'retired',
      retiredAt: new Date(),
    },
  });
  await writeSegmentationAuditEvent({
    actorUserId: input.actorUserId ?? null,
    eventType: 'segment_version.retired',
    entityType: 'customer_segment_version',
    entityId: retired.id,
    before: version,
    after: retired,
  });
  return {
    id: retired.id,
    segmentId: retired.segmentId,
    status: retired.status,
    retiredAt: retired.retiredAt?.toISOString() ?? null,
  };
}

export async function seedDefaultSegments(actorUserId?: string | null): Promise<void> {
  await seedDefaultMetrics();
  for (const seed of DEFAULT_SEGMENT_SEEDS) {
    const existing = await prisma.customerSegment.findUnique({ where: { segmentKey: seed.segmentKey } });
    if (existing) continue;
    const segment = await prisma.customerSegment.create({
      data: {
        segmentKey: seed.segmentKey,
        name: seed.name,
        description: seed.description,
        segmentFamily: seed.segmentFamily,
        evaluationMode: seed.evaluationMode,
        priority: seed.priority,
        status: 'active',
        createdBy: actorUserId ?? null,
        updatedBy: actorUserId ?? null,
      },
    });
    const validation = await validateRule(seed.ruleAst);
    const version = await prisma.customerSegmentVersion.create({
      data: {
        segmentId: segment.id,
        versionNumber: 1,
        ruleAst: seed.ruleAst as any,
        status: 'active',
        validationStatus: validation.isValid ? 'valid' : 'invalid',
        validationErrors: validation.errors.length > 0 ? (validation.errors as any) : undefined,
        createdBy: actorUserId ?? null,
        activatedAt: new Date(),
      },
    });
    if (validation.metricDependencies.length > 0) {
      await prisma.segmentVersionMetricDependency.createMany({
        data: validation.metricDependencies.map((metricKey) => ({
          segmentVersionId: version.id,
          metricKey,
        })),
      });
    }
  }
}
