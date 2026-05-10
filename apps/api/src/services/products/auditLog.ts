/**
 * Products-module audit log writer.
 *
 * Phase 1: every create/update/delete on a products-scoped table in the live
 * RICS MDBs writes one row to `ProductsAuditLog` in Postgres. This is pure
 * observability — product correctness is enforced by the Access write, not by
 * the presence of this row. Failures here DO NOT block the mutation.
 *
 * See [docs/dev/specs/2026-04-18-products-phase1-design.md](../../../../../docs/dev/specs/2026-04-18-products-phase1-design.md).
 */

import type { PrismaClient } from '../../prismaClient';
import { prisma as defaultPrisma } from '../../db/prisma';
import { recordPlatformAuditEvent } from '../platformAuditService';

export interface AuditRecordInput {
  actor: string;
  action: string;
  targetTable: string;
  targetPk: string | number;
  payload: Record<string, unknown>;
}

export interface AuditLogger {
  record(input: AuditRecordInput): Promise<void>;
}

async function resolveActorUserId(client: PrismaClient, actor: string): Promise<string | null> {
  const normalized = actor.toLowerCase().trim();
  if (!normalized || normalized === 'system') return null;
  const user = await client.user.findFirst({
    where: {
      OR: [
        { id: actor },
        { email: normalized },
      ],
    },
    select: { id: true },
  });
  return user?.id ?? null;
}

/** Creates a logger bound to a Prisma client. Default export uses the shared singleton. */
export function createAuditLogger(client: PrismaClient = defaultPrisma): AuditLogger {
  return {
    async record(input: AuditRecordInput): Promise<void> {
      try {
        await client.productsAuditLog.create({
          data: {
            actor: input.actor,
            action: input.action,
            targetTable: input.targetTable,
            targetPk: String(input.targetPk),
            payloadJson: input.payload as any, // Prisma JSON column accepts unknown
          },
        });
        const actorUserId = await resolveActorUserId(client, input.actor);
        await recordPlatformAuditEvent(client, {
          eventType: `products.${input.action.replace(/_/g, '.')}`,
          action: input.action.toUpperCase(),
          resourceType: `products.${input.targetTable}`,
          resourceId: String(input.targetPk),
          actorUserId,
          afterJson: input.payload,
          metadataJson: {
            module: 'products',
            legacyActor: input.actor,
            targetTable: input.targetTable,
          },
        });
      } catch (err) {
        // Non-blocking — the RICS write already succeeded. Log and continue.
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(
          `[productsAudit] Failed to record ${input.action} on ${input.targetTable}[${input.targetPk}]: ${message}`,
        );
      }
    },
  };
}

/** Shared singleton logger used by product services. */
export const auditLog: AuditLogger = createAuditLogger();


