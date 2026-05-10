import { prisma } from '../../db/prisma';
import { recordPlatformAuditEvent } from '../platformAuditService';

export async function writeSegmentationAuditEvent(input: {
  actorUserId?: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await prisma.customerSegmentAuditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: (input.before as any) ?? undefined,
      afterJson: (input.after as any) ?? undefined,
    },
  });
  await recordPlatformAuditEvent(prisma, {
    eventType: `segmentation.${input.eventType}`,
    action: input.eventType.toUpperCase(),
    resourceType: `segmentation.${input.entityType}`,
    resourceId: input.entityId,
    actorUserId: input.actorUserId ?? null,
    beforeJson: input.before ?? null,
    afterJson: input.after ?? null,
    metadataJson: { module: 'customer_intelligence' },
  });
}
