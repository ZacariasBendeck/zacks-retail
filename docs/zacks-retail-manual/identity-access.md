# Identity & Access

> **Status:** Foundation implementation
> **Module spec:** [../modules/identity-access/README.md](../modules/identity-access/README.md)
> **RICS ancestry:** Ch. 11 (Users)
> **Last updated:** 2026-04-30

## What this module does

Identity & Access is where administrators manage internal app users: login accounts, roles, permissions, store/data access, sessions, password changes, future MFA/SSO, and security audit.

## Audience

- **System administrators** -- create users, assign roles, review effective access, revoke sessions.
- **Owners / finance leadership** -- review privileged users and access history.
- **Managers** -- use their own assigned access to approve operational flows; they do not manage system access by default.

## Screens

- Users list + create/edit.
- Roles & Permissions page for custom role creation, cloning, rename/description, archive, and permission assignment.
- Effective Access page for user-level access review and audit export.
- Security Center for privileged users, inactive users, and failed login activity.
- User access tab for effective permissions and role assignment.
- Store Access tab for store/warehouse/all-store scopes.
- Security tab for privileged-access posture, password reset, MFA factor administration, and external identity links.
- Sessions tab for active sessions, session history, and revocation.
- Login Activity tab for login success/failure history.
- Security Audit page for shared platform audit events.

## Common tasks

- Create a new internal user.
- Assign or revoke a role.
- Create a custom role by cloning an existing role.
- Archive an unassigned custom role.
- Review why a user has each effective permission.
- Review risky permission combinations before saving a role.
- Limit a user to one store or warehouse.
- Deactivate a user and revoke sessions.
- Reset a user's password and revoke existing sessions.
- Review or unlink a future SSO/external identity mapping.
- Review login activity and failed attempts.
- Review security-sensitive changes in the audit log.
- Export effective access for audit.

Store-scoped users are constrained in POS, Time Clock, and authenticated Sales Reporting requests. If they ask for an unauthorized store they receive a scope error; if they ask for an all-store sales report, the report is narrowed to their allowed stores.

## Related modules

- [Employees](employees.md) -- salesperson roster, time clock, commissions, sales passwords, manager overrides.
- [Platform](platform.md) -- shared append-only audit log and long-term audit search.
- [Store Operations](store-ops.md) -- stores used by access scopes.

## What's different from RICS

RICS users were part of File Setup and menu authorization. Zack's Retail separates identity/access from employee operations, uses modern password hashing, prepares for MFA/SSO, records security-sensitive audit events, and preserves historical user attribution by deactivating users instead of deleting them.
