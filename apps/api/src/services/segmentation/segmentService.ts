import { prisma } from '../../db/prisma';
import { writeSegmentationAuditEvent } from './auditService';
import { SegmentEvaluationMode, SegmentFamily, SegmentStatus } from './types';

export async function createSegment(input: {
  segmentKey: string;
  name: string;
  description?: string | null;
  segmentFamily: SegmentFamily;
  evaluationMode: SegmentEvaluationMode;
  priority?: number;
  actorUserId?: string | null;
}): Promise<Record<string, unknown>> {
  const segment = await prisma.customerSegment.create({
    data: {
      segmentKey: input.segmentKey,
      name: input.name,
      description: input.description ?? null,
      segmentFamily: input.segmentFamily,
      evaluationMode: input.evaluationMode,
      priority: input.priority ?? 100,
      createdBy: input.actorUserId ?? null,
      updatedBy: input.actorUserId ?? null,
      status: 'draft',
    },
  });
  await writeSegmentationAuditEvent({
    actorUserId: input.actorUserId ?? null,
    eventType: 'segment.created',
    entityType: 'customer_segment',
    entityId: segment.id,
    after: segment,
  });
  return {
    id: segment.id,
    segmentKey: segment.segmentKey,
    name: segment.name,
    description: segment.description,
    segmentFamily: segment.segmentFamily,
    evaluationMode: segment.evaluationMode,
    priority: segment.priority,
    status: segment.status,
  };
}

export async function listSegments(filters: {
  status?: SegmentStatus;
  family?: SegmentFamily;
}): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.family) where.segmentFamily = filters.family;
  const [items, total] = await Promise.all([
    prisma.customerSegment.findMany({
      where,
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 3,
        },
      },
      orderBy: [{ priority: 'asc' }, { segmentKey: 'asc' }],
    }),
    prisma.customerSegment.count({ where }),
  ]);
  return {
    items: items.map((segment) => ({
      id: segment.id,
      segmentKey: segment.segmentKey,
      name: segment.name,
      description: segment.description,
      segmentFamily: segment.segmentFamily,
      evaluationMode: segment.evaluationMode,
      priority: segment.priority,
      status: segment.status,
      versions: segment.versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        validationStatus: version.validationStatus,
        createdAt: version.createdAt.toISOString(),
      })),
    })),
    total,
  };
}

export async function getSegment(segmentId: string): Promise<Record<string, unknown> | null> {
  const segment = await prisma.customerSegment.findUnique({
    where: { id: segmentId },
    include: { versions: { orderBy: { versionNumber: 'desc' } } },
  });
  if (!segment) return null;
  return {
    id: segment.id,
    segmentKey: segment.segmentKey,
    name: segment.name,
    description: segment.description,
    segmentFamily: segment.segmentFamily,
    evaluationMode: segment.evaluationMode,
    priority: segment.priority,
    status: segment.status,
    createdAt: segment.createdAt.toISOString(),
    updatedAt: segment.updatedAt.toISOString(),
    versions: segment.versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      ruleAst: version.ruleAst,
      scoringConfig: version.scoringConfig,
      activationPolicy: version.activationPolicy,
      suppressionPolicy: version.suppressionPolicy,
      status: version.status,
      validationStatus: version.validationStatus,
      validationErrors: version.validationErrors,
      createdAt: version.createdAt.toISOString(),
      activatedAt: version.activatedAt?.toISOString() ?? null,
      retiredAt: version.retiredAt?.toISOString() ?? null,
    })),
  };
}

export async function updateSegment(
  segmentId: string,
  input: {
    name?: string;
    description?: string | null;
    segmentFamily?: SegmentFamily;
    evaluationMode?: SegmentEvaluationMode;
    priority?: number;
    status?: SegmentStatus;
    actorUserId?: string | null;
  },
): Promise<Record<string, unknown> | null> {
  const existing = await prisma.customerSegment.findUnique({ where: { id: segmentId } });
  if (!existing) return null;
  if (input.status === 'archived') {
    const activeVersions = await prisma.customerSegmentVersion.count({
      where: { segmentId, status: 'active' },
    });
    if (activeVersions > 0) {
      throw new Error('SEGMENT_ALREADY_ACTIVE');
    }
  }
  const updated = await prisma.customerSegment.update({
    where: { id: segmentId },
    data: {
      name: input.name,
      description: input.description,
      segmentFamily: input.segmentFamily,
      evaluationMode: input.evaluationMode,
      priority: input.priority,
      status: input.status,
      updatedBy: input.actorUserId ?? null,
    },
  });
  await writeSegmentationAuditEvent({
    actorUserId: input.actorUserId ?? null,
    eventType: 'segment.updated',
    entityType: 'customer_segment',
    entityId: updated.id,
    before: existing,
    after: updated,
  });
  return getSegment(segmentId);
}

export async function archiveSegment(segmentId: string, actorUserId?: string | null): Promise<Record<string, unknown> | null> {
  return updateSegment(segmentId, { status: 'archived', actorUserId });
}
