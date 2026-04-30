import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../prismaClient';
import { PERMISSION_BY_KEY, PERMISSIONS } from './permissions';
import type { Permission } from './permissions';
import { ROLE_NAMES } from './roleCatalog';
import { affectedUserIdsForRole, normalizePermissions } from './rolePermissionService';

export const SYSTEM_ROLE_NAMES = new Set<string>(ROLE_NAMES);

export interface RoleSafetyWarning {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  permissions: string[];
}

export interface ManagedRole {
  id: string;
  name: string;
  permissions: string[];
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  locked: boolean;
  systemRole: boolean;
  assignedUserCount: number;
  safetyWarnings: RoleSafetyWarning[];
}

interface RoleRow {
  id: string;
  name: string;
  permissions: string[];
  description: string | null;
  archived_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class RoleNameTakenError extends Error {
  code = 'ROLE_NAME_TAKEN' as const;

  constructor(name: string) {
    super(`A role named "${name}" already exists.`);
    this.name = 'RoleNameTakenError';
  }
}

export class SystemRoleMutationError extends Error {
  code = 'SYSTEM_ROLE' as const;

  constructor(roleName: string) {
    super(`${roleName} is a system role and cannot be renamed or archived.`);
    this.name = 'SystemRoleMutationError';
  }
}

export class ArchivedRoleError extends Error {
  code = 'ARCHIVED_ROLE' as const;

  constructor(roleName: string) {
    super(`${roleName} is archived and cannot be assigned or edited.`);
    this.name = 'ArchivedRoleError';
  }
}

export class AssignedRoleError extends Error {
  code = 'ROLE_ASSIGNED' as const;

  constructor(public readonly assignedUserCount: number) {
    super(`Role is assigned to ${assignedUserCount} user${assignedUserCount === 1 ? '' : 's'}.`);
    this.name = 'AssignedRoleError';
  }
}

function normalizeRoleName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function roleRowToManagedRole(row: RoleRow, assignedUserCount: number): ManagedRole {
  return {
    id: row.id,
    name: row.name,
    permissions: row.permissions ?? [],
    description: row.description ?? null,
    archivedAt: row.archived_at?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    locked: row.name === 'OWNER',
    systemRole: SYSTEM_ROLE_NAMES.has(row.name),
    assignedUserCount,
    safetyWarnings: analyzePermissionSafety(row.permissions ?? []),
  };
}

async function listRoleRows(prisma: PrismaClient, includeArchived: boolean): Promise<RoleRow[]> {
  try {
    return await prisma.$queryRawUnsafe<RoleRow[]>(
      `
        SELECT id, name, permissions, description, archived_at, "createdAt", "updatedAt"
        FROM public."Role"
        WHERE ($1::boolean = true OR archived_at IS NULL)
        ORDER BY name ASC
      `,
      includeArchived,
    );
  } catch {
    const rows = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      permissions: row.permissions,
      description: null,
      archived_at: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }
}

async function getRoleRow(prisma: PrismaClient, roleId: string): Promise<RoleRow | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<RoleRow[]>(
      `
        SELECT id, name, permissions, description, archived_at, "createdAt", "updatedAt"
        FROM public."Role"
        WHERE id = $1
        LIMIT 1
      `,
      roleId,
    );
    return rows[0] ?? null;
  } catch {
    const row = await prisma.role.findUnique({ where: { id: roleId } });
    return row
      ? {
          id: row.id,
          name: row.name,
          permissions: row.permissions,
          description: null,
          archived_at: null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      : null;
  }
}

async function assignedCount(prisma: PrismaClient, roleId: string): Promise<number> {
  return affectedUserIdsForRole(prisma, roleId).then((ids) => ids.length);
}

async function assertNameAvailable(prisma: PrismaClient, name: string, excludeRoleId?: string): Promise<void> {
  const existing = await prisma.role.findMany({
    where: excludeRoleId ? { NOT: { id: excludeRoleId } } : {},
    select: { id: true, name: true },
  });
  if (existing.some((role) => role.name.toLowerCase() === name.toLowerCase())) {
    throw new RoleNameTakenError(name);
  }
}

export function analyzePermissionSafety(permissions: readonly string[]): RoleSafetyWarning[] {
  const granted = new Set(permissions);
  const warnings: RoleSafetyWarning[] = [];

  const has = (permission: Permission) => granted.has(permission);
  const push = (warning: RoleSafetyWarning) => warnings.push(warning);

  if (permissions.length === 0) {
    push({
      code: 'NO_PERMISSIONS',
      severity: 'info',
      message: 'This role does not grant any application access.',
      permissions: [],
    });
  }
  if (has(PERMISSIONS.IDENTITY_ACCESS_MANAGE)) {
    push({
      code: 'IDENTITY_ADMIN',
      severity: 'critical',
      message: 'Can manage users, roles, passwords, sessions, and access scopes.',
      permissions: [PERMISSIONS.IDENTITY_ACCESS_MANAGE],
    });
  }
  if (has(PERMISSIONS.INVENTORY_ADJUST)) {
    push({
      code: 'INVENTORY_ADJUST',
      severity: 'warning',
      message: 'Can change stock quantities through adjustments, receipts, transfers, or returns.',
      permissions: [PERMISSIONS.INVENTORY_ADJUST],
    });
  }
  if (has(PERMISSIONS.PURCHASING_EDIT) && has(PERMISSIONS.PURCHASING_APPROVE)) {
    push({
      code: 'PURCHASING_EDIT_APPROVE',
      severity: 'warning',
      message: 'Can both edit and approve purchasing work, reducing separation of duties.',
      permissions: [PERMISSIONS.PURCHASING_EDIT, PERMISSIONS.PURCHASING_APPROVE],
    });
  }
  if (has(PERMISSIONS.PURCHASING_EDIT) && has(PERMISSIONS.INVENTORY_ADJUST)) {
    push({
      code: 'PURCHASING_INVENTORY_COMBO',
      severity: 'warning',
      message: 'Can edit purchasing documents and adjust inventory, which should be limited to trusted roles.',
      permissions: [PERMISSIONS.PURCHASING_EDIT, PERMISSIONS.INVENTORY_ADJUST],
    });
  }
  if (has(PERMISSIONS.SALES_REFUND)) {
    push({
      code: 'POS_REFUND',
      severity: 'warning',
      message: 'Can perform or approve POS refund workflows.',
      permissions: [PERMISSIONS.SALES_REFUND],
    });
  }
  if (has(PERMISSIONS.REPORTS_ADMIN)) {
    push({
      code: 'REPORTS_ADMIN',
      severity: 'warning',
      message: 'Can administer report templates, shared snapshots, and report visibility.',
      permissions: [PERMISSIONS.REPORTS_ADMIN],
    });
  }
  if (has(PERMISSIONS.SEGMENTATION_ADMIN) || (has(PERMISSIONS.SEGMENTATION_WRITE) && has(PERMISSIONS.SEGMENTATION_ACTIVATE))) {
    push({
      code: 'SEGMENTATION_ACTIVATION',
      severity: 'warning',
      message: 'Can change and activate customer segmentation outputs used by retail operations.',
      permissions: [
        ...[PERMISSIONS.SEGMENTATION_ADMIN, PERMISSIONS.SEGMENTATION_WRITE, PERMISSIONS.SEGMENTATION_ACTIVATE]
          .filter((permission) => granted.has(permission)),
      ],
    });
  }

  return warnings;
}

export function permissionLabel(permission: string): string {
  return PERMISSION_BY_KEY.get(permission as Permission)?.label ?? permission;
}

export async function listManagedRoles(
  prisma: PrismaClient,
  input: { includeArchived?: boolean } = {},
): Promise<ManagedRole[]> {
  const rows = await listRoleRows(prisma, Boolean(input.includeArchived));
  const counts = await Promise.all(rows.map((row) => assignedCount(prisma, row.id)));
  return rows.map((row, index) => roleRowToManagedRole(row, counts[index] ?? 0));
}

export async function getManagedRole(prisma: PrismaClient, roleId: string): Promise<ManagedRole | null> {
  const row = await getRoleRow(prisma, roleId);
  if (!row) return null;
  return roleRowToManagedRole(row, await assignedCount(prisma, roleId));
}

export async function assertRoleAssignable(prisma: PrismaClient, roleId: string): Promise<void> {
  const role = await getRoleRow(prisma, roleId);
  if (!role) return;
  if (role.archived_at) throw new ArchivedRoleError(role.name);
}

export async function createManagedRole(
  prisma: PrismaClient,
  input: {
    name: string;
    permissions?: string[];
    description?: string | null;
    cloneFromRoleId?: string | null;
  },
): Promise<ManagedRole> {
  const name = normalizeRoleName(input.name);
  await assertNameAvailable(prisma, name);

  const source = input.cloneFromRoleId ? await getRoleRow(prisma, input.cloneFromRoleId) : null;
  const permissions = normalizePermissions(input.permissions ?? source?.permissions ?? []);
  const id = randomUUID();

  try {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO public."Role"
          (id, name, permissions, description, "createdAt", "updatedAt")
        VALUES ($1, $2, $3::text[], $4, now(), now())
      `,
      id,
      name,
      permissions,
      input.description?.trim() || null,
    );
  } catch (err: any) {
    if (err?.code === 'P2002' || err?.code === '23505') throw new RoleNameTakenError(name);
    throw err;
  }

  const created = await getManagedRole(prisma, id);
  if (!created) throw new Error('ROLE_CREATE_FAILED');
  return created;
}

export async function updateManagedRole(
  prisma: PrismaClient,
  roleId: string,
  input: { name?: string; description?: string | null },
): Promise<{ before: ManagedRole; after: ManagedRole }> {
  const before = await getManagedRole(prisma, roleId);
  if (!before) throw new Error('ROLE_NOT_FOUND');
  if (before.archivedAt) throw new ArchivedRoleError(before.name);
  if (before.systemRole && input.name !== undefined && normalizeRoleName(input.name) !== before.name) {
    throw new SystemRoleMutationError(before.name);
  }

  const nextName = input.name === undefined ? before.name : normalizeRoleName(input.name);
  if (nextName !== before.name) await assertNameAvailable(prisma, nextName, roleId);

  await prisma.$executeRawUnsafe(
    `
      UPDATE public."Role"
      SET name = $2,
          description = $3,
          "updatedAt" = now()
      WHERE id = $1
    `,
    roleId,
    nextName,
    input.description === undefined ? before.description : input.description?.trim() || null,
  );

  const after = await getManagedRole(prisma, roleId);
  if (!after) throw new Error('ROLE_NOT_FOUND');
  return { before, after };
}

export async function archiveManagedRole(
  prisma: PrismaClient,
  roleId: string,
): Promise<{ before: ManagedRole; after: ManagedRole }> {
  const before = await getManagedRole(prisma, roleId);
  if (!before) throw new Error('ROLE_NOT_FOUND');
  if (before.systemRole) throw new SystemRoleMutationError(before.name);
  if (before.archivedAt) return { before, after: before };
  if (before.assignedUserCount > 0) throw new AssignedRoleError(before.assignedUserCount);

  await prisma.$executeRawUnsafe(
    `
      UPDATE public."Role"
      SET archived_at = now(),
          "updatedAt" = now()
      WHERE id = $1
    `,
    roleId,
  );

  const after = await getManagedRole(prisma, roleId);
  if (!after) throw new Error('ROLE_NOT_FOUND');
  return { before, after };
}
