# Sales POS

Sales ticket entry, batch lifecycle, refunds, cash handling, and register reporting.

**Phase:** Development Against Direct CSV Imports / Cutover Migration target
**RICS chapters:** Ch. 2 (register core), Ch. 13 (customer-facing register flow only; sync infrastructure not ported)
**Registry:** [`../../MODULES.md`](../../MODULES.md)

## Architecture rule

RICS remains the live operational register until cutover day. During Development Against Direct CSV Imports, Zack's Retail may build and rehearse this module only against owned Postgres tables plus imported baseline data.

New `sales-pos` work must not:

- write to MDB files,
- add new request-path dependencies on MDB reads,
- add new dependencies on `rics_mirror`,
- add any register-local request-path data store outside Postgres-owned schemas.

The supported Enter Sales runtime is the Postgres-owned `app.pos_*` surface documented in this module.

## Documents in this module

| File | Purpose |
|---|---|
| [`tech-description.md`](./tech-description.md) | Forward technical description (current implementation and target architecture) |
| [`rics-module-specs.md`](./rics-module-specs.md) | RICS port lineage - what RICS did, what we are changing |
| [`business-functional.md`](./business-functional.md) | Business / functional spec |
| [`api.md`](./api.md) | HTTP API contracts |
| [`schema.md`](./schema.md) | Postgres schema |
| [`tasks.md`](./tasks.md) | Engineering ticket breakdown |
| [`decisions.md`](./decisions.md) | Module-scoped design decisions (ADRs) |

The operator-facing workflow chapter lives at [`../../zacks-retail-manual/sales-pos.md`](../../zacks-retail-manual/sales-pos.md).
