import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '../prismaClient';
import { createUser, updateUser, deleteUser, resetUserPassword } from '../services/identityAccess/userService';
import { requirePermission } from '../middleware/authMiddleware';
import { PERMISSION_CATALOG, PERMISSIONS } from '../services/identityAccess/permissions';
import { getEffectiveAccess, listEffectiveAccess } from '../services/identityAccess/effectiveAccessService';
import {
  listFailedLoginEvents,
  listLoginEvents,
  listSessionEvents,
  recordIdentityAudit,
  recordSessionEvent,
} from '../services/identityAccess/securityAuditService';
import {
  assignRole,
  listActiveRoleAssignments,
  listRoleAssignmentHistory,
  revokeRoleAssignment,
  syncCompatibilityRoleAssignment,
} from '../services/identityAccess/roleAssignmentService';
import {
  grantStoreScope,
  listActiveStoreScopes,
  revokeStoreScope,
} from '../services/identityAccess/storeScopeService';
import {
  listActiveSessions,
  revokeUserSessions,
} from '../services/identityAccess/sessionService';
import { getSecurityOverview } from '../services/identityAccess/securityOverviewService';
import { listMfaFactors, revokeMfaFactor } from '../services/identityAccess/mfaFactorService';
import { listExternalIdentities, unlinkExternalIdentity } from '../services/identityAccess/externalIdentityService';
import {
  ArchivedRoleError as ArchivedPermissionRoleError,
  InvalidPermissionError,
  LockedRoleError,
  RoleNotFoundError,
  updateRolePermissions,
} from '../services/identityAccess/rolePermissionService';
import {
  archiveManagedRole,
  ArchivedRoleError,
  AssignedRoleError,
  createManagedRole,
  getManagedRole,
  listManagedRoles,
  RoleNameTakenError,
  SystemRoleMutationError,
  updateManagedRole,
} from '../services/identityAccess/roleManagementService';

function sanitize(u: any) {
  const { passwordHash, ...rest } = u;
  return rest;
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function effectiveAccessCsv(rows: Awaited<ReturnType<typeof listEffectiveAccess>>): string {
  const header = [
    'user_id',
    'email',
    'display_name',
    'active',
    'roles',
    'permissions',
    'store_scopes',
  ];
  const lines = rows.map((row) => [
    row.user.id,
    row.user.email,
    row.user.displayName,
    row.user.active,
    row.roles.map((role) => role.name).join(';'),
    row.effectivePermissions.join(';'),
    row.storeScopes.map((scope) => `${scope.scopeType}:${scope.scopeId ?? 'ALL'}`).join(';'),
  ].map(csvCell).join(','));
  return [header.map(csvCell).join(','), ...lines].join('\n');
}

function roleAssignmentHistoryCsv(rows: Awaited<ReturnType<typeof listRoleAssignmentHistory>>): string {
  const header = [
    'assignment_id',
    'user_id',
    'user_email',
    'user_display_name',
    'role_id',
    'role_name',
    'assigned_by_user_id',
    'assigned_at',
    'revoked_by_user_id',
    'revoked_at',
    'reason',
    'source',
  ];
  const lines = rows.map((row) => [
    row.id,
    row.userId,
    row.userEmail,
    row.userDisplayName,
    row.roleId,
    row.roleName,
    row.assignedByUserId,
    row.assignedAt,
    row.revokedByUserId,
    row.revokedAt,
    row.reason,
    row.source,
  ].map(csvCell).join(','));
  return [header.map(csvCell).join(','), ...lines].join('\n');
}

function loginEventsCsv(rows: Awaited<ReturnType<typeof listFailedLoginEvents>>): string {
  const header = [
    'event_id',
    'user_id',
    'role_id',
    'email',
    'outcome',
    'reason',
    'ip_address',
    'user_agent',
    'occurred_at',
  ];
  const lines = rows.map((row) => [
    row.id,
    row.userId,
    row.roleId,
    row.email,
    row.outcome,
    row.reason,
    row.ipAddress,
    row.userAgent,
    row.occurredAt,
  ].map(csvCell).join(','));
  return [header.map(csvCell).join(','), ...lines].join('\n');
}

export function createUserRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (_req, res, next) => {
    try {
      const users = await prisma.user.findMany({
        include: { role: true },
        orderBy: { createdAt: 'asc' },
      });
      res.json({ users: users.map(sanitize) });
    } catch (err) {
      next(err);
    }
  });

  // Roles list — needed by the frontend create/edit forms.
  // Defined before /:id so the regex doesn't capture "_meta".
  router.get('/_meta/roles', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const roles = await listManagedRoles(prisma, { includeArchived: req.query.includeArchived === 'true' });
      res.json({ roles });
    } catch (err) {
      next(err);
    }
  });

  router.get('/_meta/permissions', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (_req, res) => {
    const modules = Array.from(
      PERMISSION_CATALOG.reduce((map, permission) => {
        if (!map.has(permission.module)) {
          map.set(permission.module, {
            module: permission.module,
            moduleLabel: permission.moduleLabel,
            permissions: [],
          });
        }
        map.get(permission.module)!.permissions.push(permission);
        return map;
      }, new Map<string, { module: string; moduleLabel: string; permissions: typeof PERMISSION_CATALOG[number][] }>())
        .values(),
    );
    res.json({ permissions: PERMISSION_CATALOG, modules });
  });

  const updateRolePermissionsBody = z.object({
    permissions: z.array(z.string().trim().min(1)),
    reason: z.string().optional().nullable(),
  });

  const createRoleBody = z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).optional().nullable(),
    permissions: z.array(z.string().trim().min(1)).optional(),
    cloneFromRoleId: z.string().uuid().optional().nullable(),
    reason: z.string().optional().nullable(),
  });

  router.post('/_meta/roles', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const parsed = createRoleBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }

      const role = await createManagedRole(prisma, parsed.data);
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: parsed.data.cloneFromRoleId ? 'identity.role.cloned' : 'identity.role.created',
        action: parsed.data.cloneFromRoleId ? 'CLONE_ROLE' : 'CREATE_ROLE',
        resourceType: 'identity.role',
        resourceId: role.id,
        reason: parsed.data.reason ?? null,
        afterJson: role,
        metadataJson: { cloneFromRoleId: parsed.data.cloneFromRoleId ?? null },
        req,
      });

      res.status(201).json({ role });
    } catch (err: any) {
      if (err instanceof RoleNameTakenError || err?.code === 'ROLE_NAME_TAKEN') {
        return res.status(409).json({ error: { code: 'ROLE_NAME_TAKEN', message: err.message } });
      }
      if (err instanceof InvalidPermissionError || err?.code === 'INVALID_PERMISSION') {
        return res.status(400).json({ error: { code: err.code, message: err.message, permissions: err.permissions } });
      }
      next(err);
    }
  });

  const updateRoleBody = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    reason: z.string().optional().nullable(),
  });

  router.patch('/_meta/roles/:roleId', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const parsed = updateRoleBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }

      const roleId = String(req.params.roleId);
      const result = await updateManagedRole(prisma, roleId, parsed.data);
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.role.updated',
        action: 'UPDATE_ROLE',
        resourceType: 'identity.role',
        resourceId: roleId,
        reason: parsed.data.reason ?? null,
        beforeJson: result.before,
        afterJson: result.after,
        req,
      });

      res.json({ role: result.after });
    } catch (err: any) {
      if (err?.message === 'ROLE_NOT_FOUND') {
        return res.status(404).json({ error: { code: 'ROLE_NOT_FOUND', message: 'Role not found.' } });
      }
      if (err instanceof RoleNameTakenError || err?.code === 'ROLE_NAME_TAKEN') {
        return res.status(409).json({ error: { code: 'ROLE_NAME_TAKEN', message: err.message } });
      }
      if (err instanceof SystemRoleMutationError || err?.code === 'SYSTEM_ROLE') {
        return res.status(409).json({ error: { code: 'SYSTEM_ROLE', message: err.message } });
      }
      if (err instanceof ArchivedRoleError || err?.code === 'ARCHIVED_ROLE') {
        return res.status(409).json({ error: { code: 'ARCHIVED_ROLE', message: err.message } });
      }
      next(err);
    }
  });

  router.delete('/_meta/roles/:roleId', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const roleId = String(req.params.roleId);
      const result = await archiveManagedRole(prisma, roleId);
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.role.archived',
        action: 'ARCHIVE_ROLE',
        resourceType: 'identity.role',
        resourceId: roleId,
        reason: typeof req.query.reason === 'string' ? req.query.reason : null,
        beforeJson: result.before,
        afterJson: result.after,
        req,
      });

      res.json({ role: result.after });
    } catch (err: any) {
      if (err?.message === 'ROLE_NOT_FOUND') {
        return res.status(404).json({ error: { code: 'ROLE_NOT_FOUND', message: 'Role not found.' } });
      }
      if (err instanceof SystemRoleMutationError || err?.code === 'SYSTEM_ROLE') {
        return res.status(409).json({ error: { code: 'SYSTEM_ROLE', message: err.message } });
      }
      if (err instanceof AssignedRoleError || err?.code === 'ROLE_ASSIGNED') {
        return res.status(409).json({
          error: { code: 'ROLE_ASSIGNED', message: err.message, assignedUserCount: err.assignedUserCount },
        });
      }
      next(err);
    }
  });

  router.patch('/_meta/roles/:roleId/permissions', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const parsed = updateRolePermissionsBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }

      const roleId = String(req.params.roleId);
      const result = await updateRolePermissions(prisma, roleId, parsed.data.permissions);
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.role_permissions.updated',
        action: 'UPDATE_ROLE_PERMISSIONS',
        resourceType: 'identity.role',
        resourceId: roleId,
        reason: parsed.data.reason ?? null,
        beforeJson: { name: result.before.name, permissions: result.before.permissions },
        afterJson: { name: result.after.name, permissions: result.after.permissions },
        metadataJson: {
          affectedUserCount: result.affectedUserIds.length,
          sessionsRevoked: true,
          revokedCount: result.revokedCount,
        },
        req,
      });
      const role = await getManagedRole(prisma, roleId);

      res.json({
        role: role ?? result.after,
        revokedCount: result.revokedCount,
        affectedUserCount: result.affectedUserIds.length,
      });
    } catch (err: any) {
      if (err instanceof RoleNotFoundError) {
        return res.status(404).json({ error: { code: err.code, message: err.message } });
      }
      if (err instanceof LockedRoleError) {
        return res.status(409).json({ error: { code: err.code, message: err.message } });
      }
      if (err instanceof ArchivedPermissionRoleError || err?.code === 'ARCHIVED_ROLE') {
        return res.status(409).json({ error: { code: 'ARCHIVED_ROLE', message: err.message } });
      }
      if (err instanceof InvalidPermissionError) {
        return res.status(400).json({ error: { code: err.code, message: err.message, permissions: err.permissions } });
      }
      next(err);
    }
  });

  router.get('/_reports/effective-access', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (_req, res, next) => {
    try {
      const rows = await listEffectiveAccess(prisma);
      res.json({ effectiveAccess: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/_reports/effective-access.csv', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (_req, res, next) => {
    try {
      const rows = await listEffectiveAccess(prisma);
      res.type('text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="identity-effective-access.csv"');
      res.send(effectiveAccessCsv(rows));
    } catch (err) {
      next(err);
    }
  });

  router.get('/_reports/privileged-users', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (_req, res, next) => {
    try {
      const rows = await listEffectiveAccess(prisma);
      const privilegedMarkers = ['.manage', '.admin', '.approve', '.adjust', '.refund', '.post_', 'receive_estimated'];
      const privilegedUsers = rows
        .map((row) => ({
          ...row,
          privilegedPermissions: row.effectivePermissions.filter((permission) =>
            privilegedMarkers.some((marker) => permission.includes(marker)),
          ),
        }))
        .filter((row) => row.privilegedPermissions.length > 0);
      res.json({ privilegedUsers });
    } catch (err) {
      next(err);
    }
  });

  router.get('/_reports/inactive-users', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (_req, res, next) => {
    try {
      const users = await prisma.user.findMany({
        where: { active: false },
        include: { role: true },
        orderBy: { updatedAt: 'desc' },
      });
      res.json({ users: users.map(sanitize) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/_reports/role-assignment-history', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
      const roleAssignmentHistory = await listRoleAssignmentHistory(prisma, { userId, limit });
      res.json({ roleAssignmentHistory });
    } catch (err) {
      next(err);
    }
  });

  router.get('/_reports/role-assignment-history.csv', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
      const rows = await listRoleAssignmentHistory(prisma, { userId, limit });
      res.type('text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="identity-role-assignment-history.csv"');
      res.send(roleAssignmentHistoryCsv(rows));
    } catch (err) {
      next(err);
    }
  });

  router.get('/_reports/failed-logins', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const email = typeof req.query.email === 'string' ? req.query.email : null;
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
      const failedLogins = await listFailedLoginEvents(prisma, { email, limit });
      res.json({ failedLogins });
    } catch (err) {
      next(err);
    }
  });

  router.get('/_reports/failed-logins.csv', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const email = typeof req.query.email === 'string' ? req.query.email : null;
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
      const rows = await listFailedLoginEvents(prisma, { email, limit });
      res.type('text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="identity-failed-logins.csv"');
      res.send(loginEventsCsv(rows));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/effective-access', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const effectiveAccess = await getEffectiveAccess(prisma, id);
      if (!effectiveAccess) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      res.json({ effectiveAccess });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/roles', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const assignments = await listActiveRoleAssignments(prisma, id);
      res.json({ roleAssignments: assignments });
    } catch (err) {
      next(err);
    }
  });

  const assignRoleBody = z.object({
    roleId: z.string().uuid(),
    reason: z.string().optional().nullable(),
    replaceExisting: z.boolean().optional(),
  });

  router.post('/:id/roles', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const parsed = assignRoleBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }
      const id = String(req.params.id);
      const assignment = await assignRole(prisma, {
        userId: id,
        roleId: parsed.data.roleId,
        actorUserId: req.user?.id,
        reason: parsed.data.reason ?? 'assigned through Identity & Access',
        replaceExisting: parsed.data.replaceExisting,
      });
      await revokeUserSessions(prisma, id);
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.role_assigned',
        action: 'ASSIGN_ROLE',
        resourceType: 'identity.user',
        resourceId: id,
        afterJson: assignment,
        metadataJson: { sessionsRevoked: true },
        req,
      });
      res.status(201).json({ roleAssignment: assignment });
    } catch (err: any) {
      if (err?.code === 'ARCHIVED_ROLE') {
        return res.status(409).json({ error: { code: 'ARCHIVED_ROLE', message: err.message } });
      }
      next(err);
    }
  });

  router.delete('/:id/roles/:assignmentId', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const assignmentId = String(req.params.assignmentId);
      await revokeRoleAssignment(prisma, {
        userId: id,
        assignmentId,
        actorUserId: req.user?.id,
        reason: typeof req.query.reason === 'string' ? req.query.reason : null,
      });
      await revokeUserSessions(prisma, id);
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.role_revoked',
        action: 'REVOKE_ROLE',
        resourceType: 'identity.user',
        resourceId: id,
        metadataJson: { assignmentId, sessionsRevoked: true },
        req,
      });
      res.status(204).end();
    } catch (err: any) {
      if (err?.message === 'CANNOT_REVOKE_LEGACY_PRIMARY_ROLE') {
        return res.status(400).json({ error: { code: 'CANNOT_REVOKE_PRIMARY_ROLE' } });
      }
      next(err);
    }
  });

  router.get('/:id/store-scopes', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const scopes = await listActiveStoreScopes(prisma, id);
      res.json({ storeScopes: scopes });
    } catch (err) {
      next(err);
    }
  });

  const grantStoreScopeBody = z.object({
    scopeType: z.enum(['ALL_STORES', 'STORE', 'WAREHOUSE']),
    scopeId: z.string().optional().nullable(),
    reason: z.string().optional().nullable(),
  });

  router.post('/:id/store-scopes', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const parsed = grantStoreScopeBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }
      if (parsed.data.scopeType === 'STORE' && !parsed.data.scopeId?.trim()) {
        return res.status(400).json({ error: { code: 'STORE_SCOPE_REQUIRES_SCOPE_ID' } });
      }
      const id = String(req.params.id);
      const scope = await grantStoreScope(prisma, {
        userId: id,
        scopeType: parsed.data.scopeType,
        scopeId: parsed.data.scopeId,
        actorUserId: req.user?.id,
        reason: parsed.data.reason ?? 'granted through Identity & Access',
      });
      await revokeUserSessions(prisma, id);
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.store_scope_granted',
        action: 'GRANT_STORE_SCOPE',
        resourceType: 'identity.user',
        resourceId: id,
        afterJson: scope,
        metadataJson: { sessionsRevoked: true },
        req,
      });
      res.status(201).json({ storeScope: scope });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/store-scopes/:scopeGrantId', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const scopeGrantId = String(req.params.scopeGrantId);
      await revokeStoreScope(prisma, {
        userId: id,
        scopeId: scopeGrantId,
        actorUserId: req.user?.id,
        reason: typeof req.query.reason === 'string' ? req.query.reason : null,
      });
      await revokeUserSessions(prisma, id);
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.store_scope_revoked',
        action: 'REVOKE_STORE_SCOPE',
        resourceType: 'identity.user',
        resourceId: id,
        metadataJson: { scopeGrantId, sessionsRevoked: true },
        req,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/sessions', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const sessions = await listActiveSessions(prisma, id);
      res.json({ sessions });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/session-events', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
      const events = await listSessionEvents(prisma, { userId: id, limit });
      res.json({ sessionEvents: events });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/sessions/revoke', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const revokedCount = await revokeUserSessions(prisma, id);
      await recordSessionEvent(prisma, {
        userId: id,
        eventType: 'ADMIN_REVOKE_ALL',
        reason: `revoked by ${req.user?.id ?? 'unknown'}`,
        req,
      });
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.sessions_revoked',
        action: 'REVOKE_USER_SESSIONS',
        resourceType: 'identity.user',
        resourceId: id,
        metadataJson: { revokedCount },
        req,
      });
      res.json({ revokedCount });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/login-events', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
      const events = await listLoginEvents(prisma, { userId: id, limit });
      res.json({ loginEvents: events });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/security-overview', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const securityOverview = await getSecurityOverview(prisma, id);
      if (!securityOverview) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      res.json({ securityOverview });
    } catch (err) {
      next(err);
    }
  });

  const passwordResetBody = z.object({
    newPassword: z.string().min(8),
    reason: z.string().optional().nullable(),
  });

  router.post('/:id/password-reset', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const parsed = passwordResetBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }

      const id = String(req.params.id);
      const result = await resetUserPassword(prisma, id, parsed.data.newPassword);
      if (!result.ok) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

      await recordSessionEvent(prisma, {
        userId: id,
        eventType: 'ADMIN_PASSWORD_RESET',
        reason: `password reset by ${req.user?.id ?? 'unknown'}`,
        req,
      });
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.password_reset.admin',
        action: 'RESET_PASSWORD',
        resourceType: 'identity.user',
        resourceId: id,
        reason: parsed.data.reason ?? null,
        metadataJson: { sessionsRevoked: true, revokedCount: result.revokedCount },
        req,
      });

      res.json({ ok: true, revokedCount: result.revokedCount });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/mfa-factors', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

      const mfaFactors = await listMfaFactors(prisma, id);
      res.json({ mfaFactors });
    } catch (err) {
      next(err);
    }
  });

  const revokeMfaFactorBody = z.object({
    reason: z.string().optional().nullable(),
  });

  router.post('/:id/mfa-factors/:factorId/revoke', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const parsed = revokeMfaFactorBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }

      const id = String(req.params.id);
      const factorId = String(req.params.factorId);
      const factor = await revokeMfaFactor(prisma, { userId: id, factorId });
      if (!factor) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

      const revokedCount = await revokeUserSessions(prisma, id);
      await recordSessionEvent(prisma, {
        userId: id,
        eventType: 'MFA_FACTOR_REVOKED',
        reason: `MFA factor ${factorId} revoked by ${req.user?.id ?? 'unknown'}`,
        req,
      });
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.mfa_factor.revoked',
        action: 'REVOKE_MFA_FACTOR',
        resourceType: 'identity.user',
        resourceId: id,
        reason: parsed.data.reason ?? null,
        afterJson: factor,
        metadataJson: { factorId, sessionsRevoked: true, revokedCount },
        req,
      });

      res.json({ mfaFactor: factor, revokedCount });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/external-identities', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

      const externalIdentities = await listExternalIdentities(prisma, id);
      res.json({ externalIdentities });
    } catch (err) {
      next(err);
    }
  });

  const unlinkExternalIdentityBody = z.object({
    reason: z.string().optional().nullable(),
  });

  router.post('/:id/external-identities/:externalIdentityId/unlink', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const parsed = unlinkExternalIdentityBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }

      const id = String(req.params.id);
      const externalIdentityId = String(req.params.externalIdentityId);
      const externalIdentity = await unlinkExternalIdentity(prisma, { userId: id, externalIdentityId });
      if (!externalIdentity) return res.status(404).json({ error: { code: 'NOT_FOUND' } });

      const revokedCount = await revokeUserSessions(prisma, id);
      await recordSessionEvent(prisma, {
        userId: id,
        eventType: 'EXTERNAL_IDENTITY_UNLINKED',
        reason: `external identity ${externalIdentity.provider}:${externalIdentity.providerSubject} unlinked by ${req.user?.id ?? 'unknown'}`,
        req,
      });
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.external_identity.unlinked',
        action: 'UNLINK_EXTERNAL_IDENTITY',
        resourceType: 'identity.user',
        resourceId: id,
        reason: parsed.data.reason ?? null,
        beforeJson: externalIdentity,
        metadataJson: { externalIdentityId, sessionsRevoked: true, revokedCount },
        req,
      });

      res.json({ externalIdentity, revokedCount });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', requirePermission(PERMISSIONS.IDENTITY_ACCESS_VIEW), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const user = await prisma.user.findUnique({
        where: { id },
        include: { role: true },
      });
      if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      res.json({ user: sanitize(user) });
    } catch (err) {
      next(err);
    }
  });

  const createBody = z.object({
    email: z.string().email(),
    displayName: z.string().min(1),
    preferredLocale: z.enum(['en-US', 'es-HN']).nullable().optional(),
    password: z.string().min(8),
    roleId: z.string().uuid(),
    ricsUserId: z.string().optional().nullable(),
    salespersonCode: z.string().optional().nullable(),
    active: z.boolean().optional(),
  });

  router.post('/', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const parsed = createBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }
      const user = await createUser(prisma, parsed.data);
      const withRole = await prisma.user.findUnique({
        where: { id: user.id },
        include: { role: true },
      });
      await syncCompatibilityRoleAssignment(prisma, {
        userId: user.id,
        roleId: user.roleId,
        actorUserId: req.user?.id,
        reason: 'user created through compatibility user route',
      });
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.user.created',
        action: 'CREATE_USER',
        resourceType: 'identity.user',
        resourceId: user.id,
        afterJson: sanitize(withRole),
        req,
      });
      res.status(201).json({ user: sanitize(withRole) });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already in use' } });
      }
      if (err?.code === 'ARCHIVED_ROLE') {
        return res.status(409).json({ error: { code: 'ARCHIVED_ROLE', message: err.message } });
      }
      next(err);
    }
  });

  const patchBody = z.object({
    email: z.string().email().optional(),
    displayName: z.string().min(1).optional(),
    preferredLocale: z.enum(['en-US', 'es-HN']).nullable().optional(),
    roleId: z.string().uuid().optional(),
    active: z.boolean().optional(),
    ricsUserId: z.string().nullable().optional(),
    salespersonCode: z.string().nullable().optional(),
  });

  router.patch('/:id', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const parsed = patchBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }
      const id = String(req.params.id);
      const before = await prisma.user.findUnique({
        where: { id },
        include: { role: true },
      });
      await updateUser(prisma, id, parsed.data);
      const withRole = await prisma.user.findUnique({
        where: { id },
        include: { role: true },
      });
      if (parsed.data.roleId) {
        await syncCompatibilityRoleAssignment(prisma, {
          userId: id,
          roleId: parsed.data.roleId,
          actorUserId: req.user?.id,
          reason: 'role changed through compatibility user route',
        });
      }
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.user.updated',
        action: 'UPDATE_USER',
        resourceType: 'identity.user',
        resourceId: id,
        beforeJson: before ? sanitize(before) : null,
        afterJson: withRole ? sanitize(withRole) : null,
        metadataJson: {
          sessionsRevoked: parsed.data.active === false || Boolean(parsed.data.roleId),
        },
        req,
      });
      res.json({ user: sanitize(withRole) });
    } catch (err: any) {
      if (err?.code === 'ARCHIVED_ROLE') {
        return res.status(409).json({ error: { code: 'ARCHIVED_ROLE', message: err.message } });
      }
      next(err);
    }
  });

  router.delete('/:id', requirePermission(PERMISSIONS.IDENTITY_ACCESS_MANAGE), async (req, res, next) => {
    try {
      const id = String(req.params.id);
      if (req.user?.id === id) {
        return res.status(400).json({ error: { code: 'CANNOT_DELETE_SELF' } });
      }
      const before = await prisma.user.findUnique({
        where: { id },
        include: { role: true },
      });
      await deleteUser(prisma, id);
      await recordIdentityAudit(prisma, {
        actorUserId: req.user?.id,
        actorSessionId: req.sessionId,
        eventType: 'identity.user.deactivated',
        action: 'DEACTIVATE_USER',
        resourceType: 'identity.user',
        resourceId: id,
        beforeJson: before ? sanitize(before) : null,
        afterJson: { active: false },
        metadataJson: { compatibilityRoute: 'DELETE /api/v1/users/:id' },
        req,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}


