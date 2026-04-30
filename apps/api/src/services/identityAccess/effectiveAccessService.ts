import { PrismaClient } from '../../prismaClient';
import { PERMISSION_BY_KEY, PERMISSION_CATALOG } from './permissions';
import { analyzePermissionSafety, RoleSafetyWarning } from './roleManagementService';
import { listActiveRoleAssignments } from './roleAssignmentService';
import { listActiveStoreScopes } from './storeScopeService';

export interface EffectiveAccess {
  user: {
    id: string;
    email: string;
    displayName: string;
    active: boolean;
  };
  roles: Array<{ id: string; name: string; permissions: string[] }>;
  effectivePermissions: string[];
  permissionSources: Array<{
    permission: string;
    label: string;
    module: string;
    moduleLabel: string;
    roles: Array<{ id: string; name: string }>;
  }>;
  safetyWarnings: RoleSafetyWarning[];
  storeScopes: Array<{ id: string; scopeType: string; scopeId: string | null; source: string }>;
}

const permissionOrder = new Map(PERMISSION_CATALOG.map((permission, index) => [permission.key, index]));

function sortPermissions(permissions: Iterable<string>): string[] {
  return Array.from(permissions).sort(
    (a, b) => (permissionOrder.get(a as any) ?? 9999) - (permissionOrder.get(b as any) ?? 9999) || a.localeCompare(b),
  );
}

export async function getEffectiveAccess(
  prisma: PrismaClient,
  userId: string,
): Promise<EffectiveAccess | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      active: true,
    },
  });
  if (!user) return null;

  const assignments = await listActiveRoleAssignments(prisma, userId);
  const permissions = new Set<string>();
  const sourceMap = new Map<string, Map<string, { id: string; name: string }>>();
  for (const assignment of assignments) {
    for (const permission of assignment.permissions) {
      permissions.add(permission);
      if (!sourceMap.has(permission)) sourceMap.set(permission, new Map());
      sourceMap.get(permission)!.set(assignment.roleId, { id: assignment.roleId, name: assignment.roleName });
    }
  }
  const storeScopes = await listActiveStoreScopes(prisma, userId);
  const sortedPermissions = sortPermissions(permissions);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      active: user.active,
    },
    roles: assignments.map((assignment) => ({
      id: assignment.roleId,
      name: assignment.roleName,
      permissions: assignment.permissions,
    })),
    effectivePermissions: sortedPermissions,
    permissionSources: sortedPermissions.map((permission) => {
      const definition = PERMISSION_BY_KEY.get(permission as any);
      return {
        permission,
        label: definition?.label ?? permission,
        module: definition?.module ?? 'other',
        moduleLabel: definition?.moduleLabel ?? 'Other',
        roles: Array.from(sourceMap.get(permission)?.values() ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      };
    }),
    safetyWarnings: analyzePermissionSafety(sortedPermissions),
    storeScopes: storeScopes.map((scope) => ({
      id: scope.id,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      source: scope.source,
    })),
  };
}

export async function getEffectivePermissions(
  prisma: PrismaClient,
  userId: string,
): Promise<Set<string>> {
  const assignments = await listActiveRoleAssignments(prisma, userId);
  const permissions = new Set<string>();
  for (const assignment of assignments) {
    for (const permission of assignment.permissions) permissions.add(permission);
  }
  return permissions;
}

export async function listEffectiveAccess(prisma: PrismaClient): Promise<EffectiveAccess[]> {
  const users = await prisma.user.findMany({
    select: { id: true },
    orderBy: { email: 'asc' },
  });
  const rows = await Promise.all(users.map((user) => getEffectiveAccess(prisma, user.id)));
  return rows.filter((row): row is EffectiveAccess => Boolean(row));
}
