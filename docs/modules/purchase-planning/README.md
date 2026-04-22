# Purchase Planning

Forecast-driven replenishment calculator. Given historical sales and current on-hand, compute how many units of each (department | category | vendor) to buy each month for the next 12 months in order to hit a target end-of-month inventory level. Read-only plan grid — no commitments, no budgets, no audit trail. Replaces four offline Python scripts (`presupuesto_compras*.py`).

**Phase:** Phase 1 (legacy numbering) — read-only against live RICS MDBs; no persisted plans in v1.
**RICS chapters:** _none — net-new module, no RICS predecessor_
**Registry:** [`../MODULES.md`](../MODULES.md)

> Independent of `otb-planning`. The two share no tables, routes, or screens.

## Documents in this module

| File | Purpose |
|---|---|
| [`tech-description.md`](./tech-description.md) | Forward technical description (current implementation) |
| [`rics-module-specs.md`](./rics-module-specs.md) | _N/A — no RICS predecessor_ |
| [`business-functional.md`](./business-functional.md) | Business / functional spec |
| [`api.md`](./api.md) | HTTP API contracts |
| [`schema.md`](./schema.md) | Postgres schema |
| [`tasks.md`](./tasks.md) | Engineering ticket breakdown |
| [`decisions.md`](./decisions.md) | Module-scoped design decisions (ADRs) |

Files that don't exist yet are TBD — see the generating slash command in the layout section of [`../../../CLAUDE.md`](../../../CLAUDE.md).
