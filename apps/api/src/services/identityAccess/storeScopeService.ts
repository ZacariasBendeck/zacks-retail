import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../prismaClient';

export interface StoreScope {
  id: string;
  userId: string;
  scopeType: string;
  scopeId: string | null;
  grantedAt: string;
  revokedAt: string | null;
  source: 'identity_scope' | 'legacy_user_home_store' | 'default_all_stores';
}

interface StoreScopeRow {
  id: string;
  user_id: string;
  scope_type: string;
  scope_id: string | null;
  granted_at: Date;
  revoked_at: Date | null;
}

async function storeScopeTableExists(prisma: PrismaClient): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
      `SELECT to_regclass('public.identity_user_store_scope')::text AS exists`,
    );
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

function rowToScope(row: StoreScopeRow): StoreScope {
  return {
    id: row.id,
    userId: row.user_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    grantedAt: row.granted_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
    source: 'identity_scope',
  };
}

export async function listActiveStoreScopes(
  prisma: PrismaClient,
  userId: string,
): Promise<StoreScope[]> {
  if (await storeScopeTableExists(prisma)) {
    const rows = await prisma.$queryRawUnsafe<StoreScopeRow[]>(
      `
        SELECT id, user_id, scope_type, scope_id, granted_at, revoked_at
        FROM public.identity_user_store_scope
        WHERE user_id = $1
          AND revoked_at IS NULL
        ORDER BY scope_type ASC, scope_id ASC NULLS FIRST
      `,
      userId,
    );
    if (rows.length > 0) return rows.map(rowToScope);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, homeStoreId: true, createdAt: true },
  });
  if (!user) return [];
  if (user.homeStoreId) {
    return [{
      id: `legacy:${user.id}:STORE:${user.homeStoreId}`,
      userId: user.id,
      scopeType: 'STORE',
      scopeId: user.homeStoreId,
      grantedAt: user.createdAt.toISOString(),
      revokedAt: null,
      source: 'legacy_user_home_store',
    }];
  }
  return [{
    id: `default:${user.id}:ALL_STORES`,
    userId: user.id,
    scopeType: 'ALL_STORES',
    scopeId: null,
    grantedAt: user.createdAt.toISOString(),
    revokedAt: null,
    source: 'default_all_stores',
  }];
}

export async function grantStoreScope(
  prisma: PrismaClient,
  input: {
    userId: string;
    scopeType: string;
    scopeId?: string | null;
    actorUserId?: string | null;
    reason?: string | null;
  },
): Promise<StoreScope> {
  const scopeType = input.scopeType.toUpperCase();
  const scopeId = input.scopeId?.trim() || null;

  if (scopeType === 'STORE') {
    await prisma.user.update({ where: { id: input.userId }, data: { homeStoreId: scopeId } });
  } else if (scopeType === 'ALL_STORES') {
    await prisma.user.update({ where: { id: input.userId }, data: { homeStoreId: null } });
  }

  if (await storeScopeTableExists(prisma)) {
    if (scopeType === 'ALL_STORES') {
      await prisma.$executeRawUnsafe(
        `
          UPDATE public.identity_user_store_scope
          SET revoked_at = now(), revoked_by_user_id = $2
          WHERE user_id = $1
            AND revoked_at IS NULL
        `,
        input.userId,
        input.actorUserId ?? null,
      );
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO public.identity_user_store_scope
          (id, user_id, scope_type, scope_id, granted_by_user_id, reason, granted_at, created_at)
        SELECT $1, $2, $3, $4, $5, $6, now(), now()
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.identity_user_store_scope
          WHERE user_id = $2
            AND scope_type = $3
            AND COALESCE(scope_id, '') = COALESCE($4, '')
            AND revoked_at IS NULL
        )
      `,
      id,
      input.userId,
      scopeType,
      scopeId,
      input.actorUserId ?? null,
      input.reason ?? null,
    );
  }

  const scopes = await listActiveStoreScopes(prisma, input.userId);
  return scopes.find((row) => row.scopeType === scopeType && row.scopeId === scopeId) ?? scopes[0]!;
}

export async function revokeStoreScope(
  prisma: PrismaClient,
  input: {
    userId: string;
    scopeId: string;
    actorUserId?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  if (input.scopeId.startsWith('legacy:')) {
    await prisma.user.update({ where: { id: input.userId }, data: { homeStoreId: null } });
    return;
  }
  if (input.scopeId.startsWith('default:')) return;

  if (!(await storeScopeTableExists(prisma))) return;

  await prisma.$executeRawUnsafe(
    `
      UPDATE public.identity_user_store_scope
      SET revoked_at = now(), revoked_by_user_id = $3, reason = COALESCE($4, reason)
      WHERE id = $1
        AND user_id = $2
        AND revoked_at IS NULL
    `,
    input.scopeId,
    input.userId,
    input.actorUserId ?? null,
    input.reason ?? null,
  );
}
