# Identity & Access API

## Stable compatibility routes

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/change-password`
- `GET /api/v1/users`
- `GET /api/v1/users/:id`
- `POST /api/v1/users`
- `PATCH /api/v1/users/:id`
- `DELETE /api/v1/users/:id`

`DELETE /api/v1/users/:id` is now a compatibility deactivate operation. It must not hard-delete identity rows.

## Added admin routes

- `GET /api/v1/users/:id/effective-access`
- `GET /api/v1/users/_reports/effective-access`
- `GET /api/v1/users/_reports/effective-access.csv`
- `GET /api/v1/users/_reports/privileged-users`
- `GET /api/v1/users/_reports/inactive-users`
- `GET /api/v1/users/_reports/role-assignment-history`
- `GET /api/v1/users/_reports/role-assignment-history.csv`
- `GET /api/v1/users/_reports/failed-logins`
- `GET /api/v1/users/_reports/failed-logins.csv`
- `GET /api/v1/users/:id/roles`
- `POST /api/v1/users/:id/roles`
- `DELETE /api/v1/users/:id/roles/:assignmentId`
- `GET /api/v1/users/:id/store-scopes`
- `POST /api/v1/users/:id/store-scopes`
- `DELETE /api/v1/users/:id/store-scopes/:scopeGrantId`
- `GET /api/v1/users/:id/sessions`
- `POST /api/v1/users/:id/sessions/revoke`
- `GET /api/v1/users/:id/login-events`
- `GET /api/v1/users/:id/security-overview`
- `POST /api/v1/users/:id/password-reset`
- `GET /api/v1/users/:id/mfa-factors`
- `POST /api/v1/users/:id/mfa-factors/:factorId/revoke`
- `GET /api/v1/users/:id/external-identities`
- `POST /api/v1/users/:id/external-identities/:externalIdentityId/unlink`

These expose the user's active roles, effective permissions, and store/data scope projection.

## Related platform audit routes

- `GET /api/v1/platform/audit`
- `GET /api/v1/platform/audit/:id`

These are owned by Platform but currently gated by `identity_access.view` because Identity & Access is the first writer and first admin consumer.

## Permission gates

- Read/admin reporting: `identity_access.view`
- Mutating user/access administration: `identity_access.manage`

`OWNER` has all permissions. `ADMIN` has both Identity & Access permissions. Other roles do not receive identity administration by default.

## Current compatibility behavior

- Role assignments write the new assignment table when available and keep `public.User.roleId` synchronized until multi-role reads are fully cut over.
- Store scopes write the new scope table when available and keep `public.User.homeStoreId` synchronized for `STORE` / `ALL_STORES` compatibility.
- Mutating role/scope/deactivate operations revoke active sessions.
- Login throttling is backed by `identity_login_event` when that migration is present; older local databases simply skip throttling.
- Security overview reports MFA readiness, privileged permissions, external identity count, active sessions, and recent failed logins.
- Admin password reset hashes the new password, revokes the target user's sessions, and writes security audit/session events.
- Self-service password change keeps the current session and revokes the user's other active sessions.
- MFA factor administration is intentionally limited to read/revoke until enrollment and enforcement are designed.
- External identity administration is intentionally limited to read/unlink until SSO login providers are configured.
- Unlinking an external identity revokes active sessions and writes security audit/session events.
- POS bootstrap/open-shift now enforces Identity & Access store scopes for explicit store selection and default scoped-store selection.
- Authenticated Sales Reporting requests now reject unauthorized explicit stores and narrow omitted-store requests to the user's allowed stores.
