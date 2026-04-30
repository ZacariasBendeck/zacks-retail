import { PrismaClient } from '../../prismaClient';
import { getEffectiveAccess } from './effectiveAccessService';
import { listLoginEvents } from './securityAuditService';
import { listActiveSessions } from './sessionService';

export interface SecurityOverview {
  userId: string;
  privileged: boolean;
  privilegedPermissions: string[];
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  activeMfaFactorCount: number;
  externalIdentityCount: number;
  activeSessionCount: number;
  recentFailedLoginCount: number;
}

function privilegedPermissions(permissions: string[]): string[] {
  const markers = ['.manage', '.admin', '.approve', '.adjust', '.refund', '.post_', 'receive_estimated'];
  return permissions.filter((permission) => markers.some((marker) => permission.includes(marker)));
}

async function countRaw(
  prisma: PrismaClient,
  sql: string,
  ...params: unknown[]
): Promise<number> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(sql, ...params);
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function getSecurityOverview(
  prisma: PrismaClient,
  userId: string,
): Promise<SecurityOverview | null> {
  const effectiveAccess = await getEffectiveAccess(prisma, userId);
  if (!effectiveAccess) return null;

  const privileged = privilegedPermissions(effectiveAccess.effectivePermissions);
  const [activeMfaFactorCount, externalIdentityCount, activeSessions, recentEvents] = await Promise.all([
    countRaw(
      prisma,
      `
        SELECT COUNT(*)::bigint AS count
        FROM public.identity_mfa_factor
        WHERE user_id = $1
          AND active = true
          AND revoked_at IS NULL
      `,
      userId,
    ),
    countRaw(
      prisma,
      `
        SELECT COUNT(*)::bigint AS count
        FROM public.identity_external_identity
        WHERE user_id = $1
      `,
      userId,
    ),
    listActiveSessions(prisma, userId),
    listLoginEvents(prisma, { userId, limit: 25 }),
  ]);

  const recentFailedLoginCount = recentEvents.filter((event) => event.outcome === 'FAILURE').length;

  return {
    userId,
    privileged: privileged.length > 0,
    privilegedPermissions: privileged,
    mfaRequired: privileged.length > 0,
    mfaEnrolled: activeMfaFactorCount > 0,
    activeMfaFactorCount,
    externalIdentityCount,
    activeSessionCount: activeSessions.length,
    recentFailedLoginCount,
  };
}
