# Employees

Salespeople, time clock (login / logout / admin / print), commission overrides, hours + perks, salesperson analysis, close salesperson period, sales passwords, and manager options. Employees owns the retail-person concepts that RICS partially conflates: Employee / Salesperson and Sales Password. Internal app users, auth, roles, sessions, MFA, SSO, and access scopes now belong to [Identity & Access](../identity-access/README.md).

**Phase:** TBD
**RICS chapters:** Ch. 7; Ch. 11 users are lineage for Identity & Access
**Registry:** [`../MODULES.md`](../MODULES.md)

## Documents in this module

| File | Purpose |
|---|---|
| [`employees-testing-checklist.md`](./employees-testing-checklist.md) | Cutover / rehearsal checklist for the RICS salespeople surface |
| [`tech-description.md`](./tech-description.md) | Forward technical description (current implementation) |
| [`rics-module-specs.md`](./rics-module-specs.md) | RICS port lineage — what RICS did, what we're changing |
| [`business-functional.md`](./business-functional.md) | Business / functional spec |
| [`api.md`](./api.md) | HTTP API contracts |
| [`schema.md`](./schema.md) | Postgres schema |
| [`tasks.md`](./tasks.md) | Engineering ticket breakdown |
| [`decisions.md`](./decisions.md) | Module-scoped design decisions (ADRs) |

Files that don't exist yet are TBD — see the generating slash command in the layout section of [`../../../CLAUDE.md`](../../../CLAUDE.md).
