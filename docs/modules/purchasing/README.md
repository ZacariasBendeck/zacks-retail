# Purchasing

Purchase orders (entry / receive / combine / merge / replicate / duplicate), auto POs, order worksheets, ASN cartons, reset future orders, PO reports, open P.O. by month.

**Phase:** Development Against RICS Mirror / Cutover Migration target
**RICS chapters:** Ch. 3
**Registry:** [`../MODULES.md`](../MODULES.md)

## Architecture rule

RICS remains the live purchasing system until cutover. This module must not create or modify purchase orders in RICS. During development, all purchasing logic, forecasts, and draft POs exist only in Postgres. Any operational PO creation remains in RICS until cutover. Final purchasing ownership transfers during Cutover Migration.

## Documents in this module

| File | Purpose |
|---|---|
| [`tech-description.md`](./tech-description.md) | Forward technical description (current implementation) |
| [`rics-module-specs.md`](./rics-module-specs.md) | RICS port lineage — what RICS did, what we're changing |
| [`business-functional.md`](./business-functional.md) | Business / functional spec |
| [`api.md`](./api.md) | HTTP API contracts |
| [`schema.md`](./schema.md) | Postgres schema |
| [`tasks.md`](./tasks.md) | Engineering ticket breakdown |
| [`decisions.md`](./decisions.md) | Module-scoped design decisions (ADRs) |

Files that don't exist yet are TBD — see the generating slash command in the layout section of [`../../../CLAUDE.md`](../../../CLAUDE.md).
