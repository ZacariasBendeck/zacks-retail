import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../prismaClient';
import { assertRoleAssignable } from './roleManagementService';

export interface RoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  assignedAt: string;
  revokedAt: string | null;
  source: 'identity_assignment' | 'legacy_user_role';
}

export interface RoleAssignmentHistory {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  roleId: string;
  roleName: string;
  assignedByUserId: string | null;
  assignedAt: string;
  revokedByUserId: string | null;
  revokedAt: string | null;
  reason: string | null;
  source: 'identity_assignment' | 'legacy_user_role';
}

interface RoleAssignmentRow {
  id: string;
  user_id: string;
  role_id: string;
  role_name: string;
  permissions: string[];
  assigned_at: Date;
  revoked_at: Date | null;
}

interface RoleAssignmentHistoryRow extends RoleAssignmentRow {
  user_email: string;
  user_display_name: string;
  assigned_by_user_id: string | null;
  revoked_by_user_id: string | null;
  reason: string | null;
}

async function roleAssignmentTableExists(prisma: PrismaClient): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
      `SELECT to_regclass('public.identity_user_role_assignment')::text AS exists`,
    );
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

function rowToAssignment(row: RoleAssignmentRow): RoleAssignment {
  return {
    id: row.id,
    userId: row.user_id,
    roleId: row.role_id,
    roleName: row.role_name,
    permissions: row.permissions ?? [],
    assignedAt: row.assigned_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
    source: 'identity_assignment',
  };
}

function rowToHistory(row: RoleAssignmentHistoryRow): RoleAssignmentHistory {
  return {
    ...rowToAssignment(row),
    userEmail: row.user_email,
    userDisplayName: row.user_display_name,
    assignedByUserId: row.assigned_by_user_id,
    revokedByUserId: row.revoked_by_user_id,
    reason: row.reason,
  };
}

async function legacyRoleAssignment(prisma: PrismaClient, userId: string): Promise<RoleAssignment | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user) return null;
  return {
    id: `legacy:${user.id}:${user.roleId}`,
    userId: user.id,
    roleId: user.roleId,
    roleName: user.role.name,
    permissions: user.role.permissions,
    assignedAt: user.createdAt.toISOString(),
    revokedAt: null,
    source: 'legacy_user_role',
  };
}

async function legacyRoleAssignmentHistory(
  prisma: PrismaClient,
  userId?: string | null,
  limit = 100,
): Promise<RoleAssignmentHistory[]> {
  const users = await prisma.user.findMany({
    where: userId ? { id: userId } : {},
    include: { role: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return users.map((user) => ({
    id: `legacy:${user.id}:${user.roleId}`,
    userId: user.id,
    userEmail: user.email,
    userDisplayName: user.displayName,
    roleId: user.roleId,
    roleName: user.role.name,
    assignedByUserId: null,
    assignedAt: user.createdAt.toISOString(),
    revokedByUserId: null,
    revokedAt: null,
    reason: 'compatibility projection from public.User.roleId',
    source: 'legacy_user_role',
  }));
}

export async function listActiveRoleAssignments(
  prisma: PrismaClient,
  userId: string,
): Promise<RoleAssignment[]> {
  if (await roleAssignmentTableExists(prisma)) {
    const rows = await prisma.$queryRawUnsafe<RoleAssignmentRow[]>(
      `
        SELECT
          a.id,
          a.user_id,
          a.role_id,
          r.name AS role_name,
          r.permissions,
          a.assigned_at,
          a.revoked_at
        FROM public.identity_user_role_assignment a
        JOIN public."Role" r ON r.id = a.role_id
        WHERE a.user_id = $1
          AND a.revoked_at IS NULL
        ORDER BY r.name ASC
      `,
      userId,
    );
    if (rows.length > 0) return rows.map(rowToAssignment);
  }

  const legacy = await legacyRoleAssignment(prisma, userId);
  return legacy ? [legacy] : [];
}

export async function listRoleAssignmentHistory(
  prisma: PrismaClient,
  input: { userId?: string | null; limit?: number } = {},
): Promise<RoleAssignmentHistory[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);

  if (await roleAssignmentTableExists(prisma)) {
    const rows = await prisma.$queryRawUnsafe<RoleAssignmentHistoryRow[]>(
      `
        SELECT
          a.id,
          a.user_id,
          u.email AS user_email,
          u."displayName" AS user_display_name,
          a.role_id,
          r.name AS role_name,
          r.permissions,
          a.assigned_by_user_id,
          a.assigned_at,
          a.revoked_by_user_id,
          a.revoked_at,
          a.reason
        FROM public.identity_user_role_assignment a
        JOIN public."User" u ON u.id = a.user_id
        JOIN public."Role" r ON r.id = a.role_id
        WHERE ($1::text IS NULL OR a.user_id = $1)
        ORDER BY a.assigned_at DESC, a.id DESC
        LIMIT $2
      `,
      input.userId ?? null,
      limit,
    );
    return rows.map(rowToHistory);
  }

  return legacyRoleAssignmentHistory(prisma, input.userId, limit);
}

export async function assignRole(
  prisma: PrismaClient,
  input: {
    userId: string;
    roleId: string;
    actorUserId?: string | null;
    reason?: string | null;
    replaceExisting?: boolean;
  },
): Promise<RoleAssignment> {
  await assertRoleAssignable(prisma, input.roleId);

  if (input.replaceExisting !== false) {
    await prisma.user.update({ where: { id: input.userId }, data: { roleId: input.roleId } });
  }

  if (await roleAssignmentTableExists(prisma)) {
    if (input.replaceExisting !== false) {
      await prisma.$executeRawUnsafe(
        `
          UPDATE public.identity_user_role_assignment
          SET revoked_at = now(), revoked_by_user_id = $3
          WHERE user_id = $1
            AND revoked_at IS NULL
            AND role_id <> $2
        `,
        input.userId,
        input.roleId,
        input.actorUserId ?? null,
      );
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO public.identity_user_role_assignment
          (id, user_id, role_id, assigned_by_user_id, reason, assigned_at, created_at)
        SELECT $1, $2, $3, $4, $5, now(), now()
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.identity_user_role_assignment
          WHERE user_id = $2
            AND role_id = $3
            AND revoked_at IS NULL
        )
      `,
      id,
      input.userId,
      input.roleId,
      input.actorUserId ?? null,
      input.reason ?? null,
    );
  }

  const assignments = await listActiveRoleAssignments(prisma, input.userId);
  const assignment = assignments.find((row) => row.roleId === input.roleId) ?? assignments[0];
  if (!assignment) throw new Error('ROLE_ASSIGNMENT_NOT_FOUND');
  return assignment;
}

export async function revokeRoleAssignment(
  prisma: PrismaClient,
  input: {
    userId: string;
    assignmentId: string;
    actorUserId?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  if (input.assignmentId.startsWith('legacy:')) {
    throw new Error('CANNOT_REVOKE_LEGACY_PRIMARY_ROLE');
  }
  if (!(await roleAssignmentTableExists(prisma))) return;
  await prisma.$executeRawUnsafe(
    `
      UPDATE public.identity_user_role_assignment
      SET revoked_at = now(), revoked_by_user_id = $3, reason = COALESCE($4, reason)
      WHERE id = $1
        AND user_id = $2
        AND revoked_at IS NULL
    `,
    input.assignmentId,
    input.userId,
    input.actorUserId ?? null,
    input.reason ?? null,
  );
}

export async function syncCompatibilityRoleAssignment(
  prisma: PrismaClient,
  input: {
    userId: string;
    roleId: string;
    actorUserId?: string | null;
    reason: string;
  },
): Promise<void> {
  await assignRole(prisma, { ...input, replaceExisting: true });
}
