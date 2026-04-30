# Identity & Access Schema

## Current compatibility tables

- `public.User`
- `public.Role`
- `public.Session`

These tables stay in place while runtime contracts are migrated safely.

## New Identity & Access tables

- `public.identity_user_role_assignment`: durable role grant/revoke history.
- `public.identity_user_store_scope`: store/data visibility grants.
- `public.identity_mfa_factor`: MFA enrollment records.
- `public.identity_external_identity`: future SSO/OAuth/SAML provider mapping.
- `public.identity_login_event`: login success/failure reporting.
- `public.identity_session_event`: session lifecycle reporting.

## Shared platform audit

- `platform.platform_audit_log`: append-only audit spine for security-sensitive events.

Identity & Access writes user lifecycle, password, role, scope, login, logout, MFA-factor, and session-revocation audit events here. Platform owns retention, search UI, and long-term audit infrastructure.
