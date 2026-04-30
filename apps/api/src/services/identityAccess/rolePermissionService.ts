import { PrismaClient, Role } from '../../prismaClient';
import { ALL_PERMISSIONS, Permission } from './permissions';

export class InvalidPermissionError extends Error {
  code = 'INVALID_PERMISSION' as const;

  constructor(public readonly permissions: string[]) {
    super(`Unknown permission${permissions.length === 1 ? '' : 's'}: ${permissions.join(', ')}`);
    this.name = 'InvalidPermissionError';
  }
}

export class LockedRoleError extends Error {
  code = 'LOCKED_ROLE' as const;

  constructor(roleName: string) {
    super(`${roleName} permissions are system-managed.`);
    this.name = 'LockedRoleError';
  }
}

export class RoleNotFoundError extends Error {
  code = 'ROLE_NOT_FOUND' as const;

  constructor() {
    super('Role not found.');
    this.name = 'RoleNotFoundError';
  }
}

export class ArchivedRoleError extends Error {
  code = 'ARCHIVED_ROLE' as const;

  constructor(roleName: string) {
    super(`${roleName} is archived and cannot be edited.`);
    this.name = 'ArchivedRoleError';
  }
}

const permissionOrder = new Map(ALL_PERMISSIONS.map((permission, index) => [permission, index]));
const validPermissions = new Set<string>(ALL_PERMISSIONS);

export function normalizePermissions(permissions: string[]): Permission[] {
  const clean = Array.from(new Set(permissions.map((permission) => permission.trim()).filter(Boolean)));
  const invalid = clean.filter((permission) => !validPermissions.has(permission));
  if (invalid.length > 0) throw new InvalidPermissionError(invalid);
  return clean
    .map((permission) => permission as Permission)
    .sort((a, b) => (permissionOrder.get(a) ?? 9999) - (permissionOrder.get(b) ?? 9999));
}

async function activeRoleAssignmentUserIds(prisma: PrismaClient, roleId: string): Promise<string[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
      `
        SELECT DISTINCT user_id
        FROM public.identity_user_role_assignment
        WHERE role_id = $1
          AND revoked_at IS NULL
      `,
      roleId,
    );
    return rows.map((row) => row.user_id);
  } catch {
    return [];
  }
}

export async function affectedUserIdsForRole(prisma: PrismaClient, roleId: string): Promise<string[]> {
  const [legacyUsers, assignedUserIds] = await Promise.all([
    prisma.user.findMany({ where: { roleId }, select: { id: true } }),
    activeRoleAssignmentUserIds(prisma, roleId),
  ]);
  return Array.from(new Set([...legacyUsers.map((user) => user.id), ...assignedUserIds]));
}

export async function updateRolePermissions(
  prisma: PrismaClient,
  roleId: string,
  permissions: string[],
): Promise<{ before: Role; after: Role; revokedCount: number; affectedUserIds: string[] }> {
  const before = await prisma.role.findUnique({ where: { id: roleId } });
  if (!before) throw new RoleNotFoundError();
  if (before.name === 'OWNER') throw new LockedRoleError(before.name);
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ archived_at: Date | null }>>(
      'SELECT archived_at FROM public."Role" WHERE id = $1 LIMIT 1',
      roleId,
    );
    if (rows[0]?.archived_at) throw new ArchivedRoleError(before.name);
  } catch (err) {
    if (err instanceof ArchivedRoleError) throw err;
  }

  const normalized = normalizePermissions(permissions);
  const after = await prisma.role.update({
    where: { id: roleId },
    data: { permissions: normalized },
  });

  const affectedUserIds = await affectedUserIdsForRole(prisma, roleId);
  const revoked = affectedUserIds.length > 0
    ? await prisma.session.deleteMany({ where: { userId: { in: affectedUserIds } } })
    : { count: 0 };

  return { before, after, revokedCount: revoked.count, affectedUserIds };
}
