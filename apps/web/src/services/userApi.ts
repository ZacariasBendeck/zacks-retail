import type { SupportedLocale } from '@benlow-rics/i18n';

const API_BASE = '/api/v1/users';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  preferredLocale: SupportedLocale | null;
  active: boolean;
  roleId: string;
  role: { id: string; name: string; permissions: string[] };
  ricsUserId: string | null;
  salespersonCode: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
  description?: string | null;
  archivedAt?: string | null;
  assignedUserCount?: number;
  safetyWarnings?: RoleSafetyWarning[];
  locked?: boolean;
  systemRole?: boolean;
}

export interface RoleSafetyWarning {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  permissions: string[];
}

export interface PermissionDefinition {
  key: string;
  module: string;
  moduleLabel: string;
  label: string;
  description: string;
}

export interface PermissionModule {
  module: string;
  moduleLabel: string;
  permissions: PermissionDefinition[];
}

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

export interface RoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  assignedAt: string;
  revokedAt: string | null;
  source: string;
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
  source: string;
}

export interface StoreScope {
  id: string;
  userId: string;
  scopeType: string;
  scopeId: string | null;
  grantedAt: string;
  revokedAt: string | null;
  source: string;
}

export interface ActiveSessionSummary {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface SessionEventSummary {
  id: string;
  sessionId: string | null;
  userId: string | null;
  eventType: string;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: string;
}

export interface LoginEventSummary {
  id: string;
  userId: string | null;
  roleId: string | null;
  email: string;
  outcome: string;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: string;
}

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

export interface MfaFactorSummary {
  id: string;
  userId: string;
  factorType: string;
  label: string | null;
  active: boolean;
  verifiedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface ExternalIdentitySummary {
  id: string;
  userId: string;
  provider: string;
  providerSubject: string;
  emailAtProvider: string | null;
  createdAt: string;
  lastAuthenticatedAt: string | null;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  roleId: string;
  ricsUserId?: string | null;
  salespersonCode?: string | null;
  active?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  displayName?: string;
  preferredLocale?: SupportedLocale | null;
  roleId?: string;
  active?: boolean;
  ricsUserId?: string | null;
  salespersonCode?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const userApi = {
  list: () => request<{ users: AdminUser[] }>(''),
  get: (id: string) => request<{ user: AdminUser }>(`/${id}`),
  create: (input: CreateUserInput) =>
    request<{ user: AdminUser }>('', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: UpdateUserInput) =>
    request<{ user: AdminUser }>(`/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/${id}`, { method: 'DELETE' }),
  listRoles: (input: { includeArchived?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (input.includeArchived) params.set('includeArchived', 'true');
    const qs = params.toString();
    return request<{ roles: Role[] }>(`/_meta/roles${qs ? `?${qs}` : ''}`);
  },
  listPermissions: () => request<{ permissions: PermissionDefinition[]; modules: PermissionModule[] }>('/_meta/permissions'),
  createRole: (input: {
    name: string;
    description?: string | null;
    permissions?: string[];
    cloneFromRoleId?: string | null;
    reason?: string | null;
  }) =>
    request<{ role: Role }>('/_meta/roles', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateRole: (roleId: string, input: { name?: string; description?: string | null; reason?: string | null }) =>
    request<{ role: Role }>(`/_meta/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  archiveRole: (roleId: string, reason?: string | null) =>
    request<{ role: Role }>(`/_meta/roles/${roleId}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`, {
      method: 'DELETE',
    }),
  updateRolePermissions: (roleId: string, input: { permissions: string[]; reason?: string | null }) =>
    request<{ role: Role; revokedCount: number; affectedUserCount: number }>(`/_meta/roles/${roleId}/permissions`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  getEffectiveAccess: (id: string) =>
    request<{ effectiveAccess: EffectiveAccess }>(`/${id}/effective-access`),
  listEffectiveAccess: () =>
    request<{ effectiveAccess: EffectiveAccess[] }>('/_reports/effective-access'),
  listPrivilegedUsers: () =>
    request<{ privilegedUsers: Array<EffectiveAccess & { privilegedPermissions: string[] }> }>('/_reports/privileged-users'),
  listInactiveUsers: () => request<{ users: AdminUser[] }>('/_reports/inactive-users'),
  listFailedLogins: (input: { email?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (input.email) params.set('email', input.email);
    if (input.limit) params.set('limit', String(input.limit));
    const qs = params.toString();
    return request<{ failedLogins: LoginEventSummary[] }>(`/_reports/failed-logins${qs ? `?${qs}` : ''}`);
  },
  listRoleAssignments: (id: string) => request<{ roleAssignments: RoleAssignment[] }>(`/${id}/roles`),
  listRoleAssignmentHistory: (input: { userId?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (input.userId) params.set('userId', input.userId);
    if (input.limit) params.set('limit', String(input.limit));
    const qs = params.toString();
    return request<{ roleAssignmentHistory: RoleAssignmentHistory[] }>(`/_reports/role-assignment-history${qs ? `?${qs}` : ''}`);
  },
  assignRole: (id: string, input: { roleId: string; reason?: string | null; replaceExisting?: boolean }) =>
    request<{ roleAssignment: RoleAssignment }>(`/${id}/roles`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  revokeRoleAssignment: (id: string, assignmentId: string) =>
    request<void>(`/${id}/roles/${assignmentId}`, { method: 'DELETE' }),
  listStoreScopes: (id: string) => request<{ storeScopes: StoreScope[] }>(`/${id}/store-scopes`),
  grantStoreScope: (id: string, input: { scopeType: string; scopeId?: string | null; reason?: string | null }) =>
    request<{ storeScope: StoreScope }>(`/${id}/store-scopes`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  revokeStoreScope: (id: string, scopeGrantId: string) =>
    request<void>(`/${id}/store-scopes/${scopeGrantId}`, { method: 'DELETE' }),
  listSessions: (id: string) => request<{ sessions: ActiveSessionSummary[] }>(`/${id}/sessions`),
  listSessionEvents: (id: string, limit?: number) =>
    request<{ sessionEvents: SessionEventSummary[] }>(`/${id}/session-events${limit ? `?limit=${limit}` : ''}`),
  revokeSessions: (id: string) =>
    request<{ revokedCount: number }>(`/${id}/sessions/revoke`, { method: 'POST' }),
  listLoginEvents: (id: string, limit?: number) =>
    request<{ loginEvents: LoginEventSummary[] }>(`/${id}/login-events${limit ? `?limit=${limit}` : ''}`),
  getSecurityOverview: (id: string) =>
    request<{ securityOverview: SecurityOverview }>(`/${id}/security-overview`),
  resetPassword: (id: string, input: { newPassword: string; reason?: string | null }) =>
    request<{ ok: true; revokedCount: number }>(`/${id}/password-reset`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listMfaFactors: (id: string) => request<{ mfaFactors: MfaFactorSummary[] }>(`/${id}/mfa-factors`),
  revokeMfaFactor: (id: string, factorId: string, input: { reason?: string | null }) =>
    request<{ mfaFactor: MfaFactorSummary; revokedCount: number }>(`/${id}/mfa-factors/${factorId}/revoke`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listExternalIdentities: (id: string) =>
    request<{ externalIdentities: ExternalIdentitySummary[] }>(`/${id}/external-identities`),
  unlinkExternalIdentity: (id: string, externalIdentityId: string, input: { reason?: string | null }) =>
    request<{ externalIdentity: ExternalIdentitySummary; revokedCount: number }>(
      `/${id}/external-identities/${externalIdentityId}/unlink`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
};
