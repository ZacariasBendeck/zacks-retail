# Identity & Access

Internal application identity, authentication, authorization, access scope, session governance, MFA/SSO readiness, and security audit.

**Phase:** Foundation
**RICS chapters:** Ch. 11 (Users p. 163) as lineage only; modern auth/access is app-native.
**Registry:** [`../MODULES.md`](../MODULES.md)

## What this module owns

- Internal app users and login accounts.
- Password hashing, login, logout, current-user state, password change, and future reset flows.
- Roles, permissions, effective access, and role-assignment history.
- Store/data scopes for multi-store access control.
- Session lifecycle, revocation, and login/session event history.
- MFA-ready factor records for privileged roles.
- SSO-ready external identity mapping.
- Security-sensitive audit events written to Platform's append-only audit log.

## What this module does not own

- Retail customers. Customer identity belongs to CRM/customer intelligence.
- Salespeople as payroll/commission/time-clock records. That belongs to Employees.
- Generic audit infrastructure. Platform owns the shared `platform_audit_log`; this module writes identity/security events into it.

## Current compatibility surface

The first migration keeps existing operator URLs and API contracts stable:

- `/api/v1/auth`
- `/api/v1/users`
- `/admin/users`
- `/admin/roles`
- `/admin/effective-access`
- `/admin/security`
- `/admin/audit`

Legacy imports under `apps/api/src/services/employees/*auth/user/session/role*` are compatibility shims. New code should import from `apps/api/src/services/identityAccess`.

## V1 data model direction

- `public.identity_user_role_assignment`
- `public.identity_user_store_scope`
- `public.identity_mfa_factor`
- `public.identity_external_identity`
- `public.identity_login_event`
- `public.identity_session_event`
- `platform.platform_audit_log`

During the compatibility window, `public.User.roleId` remains the primary runtime role field. The assignment table backfills current roles and becomes the source of truth in a later slice.

## Admin screens

- **Users** (`/admin/users`) lists internal login accounts, creates new users, and links to access review.
- **Roles & Permissions** (`/admin/roles`) creates custom roles, clones roles, renames/describes custom roles, archives unassigned custom roles, and assigns permissions with module-grouped checkboxes.
- **Effective Access** (`/admin/effective-access`) shows the final computed permissions for one user, the roles that grant each permission, store scopes, role history, active sessions, session history, and login activity.
- **Security Center** (`/admin/security`) summarizes privileged users, inactive users, and failed login activity.
- **Security Audit** (`/admin/audit`) searches append-only platform audit records for user, role, session, password, MFA, SSO, and scope changes.

## Access model

Permissions are grouped by module for administration, but granted at capability/action level. Sidebar entries use view permissions for visibility; routes and APIs still enforce permissions directly. Sensitive actions such as user creation, role assignment, password reset, session revocation, inventory adjustment, purchasing approval, report administration, and POS refunds require action-level permissions.

Store scopes answer where a user can act. The current v1 scopes are all stores, one store, or a warehouse identifier. A user without explicit identity scopes defaults to all stores during the compatibility window.

## Documents in this module

| File | Purpose |
|---|---|
| [`api.md`](./api.md) | HTTP API contracts |
| [`schema.md`](./schema.md) | Data ownership and schema direction |
| [`tasks.md`](./tasks.md) | Build order |
| [`decisions.md`](./decisions.md) | Module-scoped design decisions |
