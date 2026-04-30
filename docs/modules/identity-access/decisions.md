# Decisions: Identity & Access

Running log of module-scoped design decisions. Append new entries at the top.

---

## 2026-04-30 -- Keep compatibility fields during access-model migration

**Context:** Existing routes, UI, tests, and downstream modules still read `public.User.roleId` and `public.User.homeStoreId`.

**Decision:** Role assignment and store-scope APIs write the new Identity & Access tables when available, while keeping the legacy compatibility fields synchronized. Effective permissions read active role assignments first and fall back to `User.roleId` when the new tables are absent or not backfilled.

**Consequences:** The module can ship incrementally without breaking `/api/v1/auth`, `/api/v1/users`, or existing permission middleware. A later slice must remove the compatibility dependence and make multi-role assignments the only source of truth.

**Alternatives considered:** Immediate hard cutover to assignment tables only, rejected because it would break local/test databases and downstream modules before the migration has landed everywhere.

## 2026-04-30 -- Split identity from employees

**Context:** Users, auth, roles, sessions, MFA, SSO, and access audit apply to buyers, finance users, warehouse staff, cashiers, owners, and future admin users. Not all app users are employees in the payroll/salesperson sense.

**Decision:** Create a standalone Identity & Access module. Keep "Users" as the operator-facing screen label, but move architectural ownership of users/auth/access out of Employees.

**Consequences:** Employees now depends on Identity & Access when a salesperson or manager also needs app login access. Existing routes stay stable during migration.

**Alternatives considered:** Keep users in Employees, rejected because it conflates HR workflows with system access. Use a module called "Users", rejected because it is too narrow for roles, sessions, MFA, SSO, scopes, and audit.
