import { prisma } from '../../db/prisma';

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
}
