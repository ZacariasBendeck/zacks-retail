# Identity & Access Build Order

## Slice 1. Ownership split and compatibility

**Status:** shipped (foundation)

- Add module docs.
- Move identity/auth service ownership under `services/identityAccess`.
- Keep Employees compatibility exports.
- Keep `/api/v1/auth`, `/api/v1/users`, and `/admin/users` stable.

## Slice 2. Account lifecycle hardening

**Status:** shipped (foundation)

- Deactivate/archive users instead of hard-deleting.
- Revoke active sessions when a user is deactivated or role access changes.
- Revoke other active sessions after self-service password change.
- Audit user lifecycle, password, login, logout, and session events.

## Slice 3. Effective access

**Status:** in progress

- Backfill role assignments from `public.User.roleId`.
- Add store/data scopes.
- Add effective-access API/export for administrators.
- Move permission calculation from single role to active assignments.
- Add role assignment, store scope, active session, revoke-session, and login activity admin APIs.
- Add user edit UI tabs for access, store access, sessions, and login activity.
- Add effective-access CSV, privileged-users, and inactive-users report endpoints.
- Add role-assignment history JSON and CSV report endpoints.
- Add failed-login JSON and CSV report endpoints.
- Add security overview API/UI for privileged access, MFA readiness, external identity readiness, active sessions, and recent failed logins.
- Enforce store scope on POS bootstrap and open-shift store selection.
- Enforce store scope on authenticated Sales Reporting store filters and all-store requests.

Still missing:

- Expand store/data-scope enforcement beyond POS, Time Clock, and Sales Reporting into inventory, purchasing, and customer intelligence.
- Replace the compatibility `User.roleId` write path with true multi-role assignment reads everywhere.

## Slice 4. Privileged access

**Status:** skeleton started

- Add admin password reset with session revocation and audit events.
- Add MFA factor list/revoke administration.
- Add SSO-ready external identity list/unlink administration.

Still missing:

- Add MFA enrollment and enforcement for privileged roles.
- Add suspicious login scoring and review workflows.
- Add SSO provider configuration and login/link flows.

## Slice 5. UI completion

**Status:** in progress

- Users list/detail tabs: profile, roles, store access, sessions, security, activity.
- Security Audit page backed by Platform audit search.
- Effective access export.
- Role assignment history.
- Failed login activity.
