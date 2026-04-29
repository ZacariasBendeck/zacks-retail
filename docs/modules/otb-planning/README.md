# OTB Planning

Open-To-Buy plan setup per store × category × month (two calculation methods — fixed percentages and % change vs. last year), 12-month OTB projection, OTB vs. Sales comparison, integration points with `purchasing` (PO dollars against plan) and `sales-reporting`.

**Phase:** TBD
**RICS chapters:** Ch. 11 (OTB Plan p. 158), Ch. 6 (OTB Report p. 100, OTB vs. Sales p. 100), Ch. 17 (Company Setup — OTB calculation method)
**Registry:** [`../MODULES.md`](../MODULES.md)

## Matching-set OTB preview

Matching-set buy plans do not replace OTB. They feed proposed component receipts into OTB by category/department/month so buyers can see the cost and retail impact before creating or submitting a PO. The current Buying Plan preview is Postgres-safe: it reads proposed set-plan lines and committed native PO dollars from `app.*` and returns `NO_PLAN` when no Postgres OTB budget table exists yet, rather than reading legacy SQLite OTB tables. Once OTB plan rows move fully to Postgres, the same preview contract should populate planned and remaining OTB values.

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
