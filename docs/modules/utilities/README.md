# Utilities

Operator-facing batch-change surface. Criteria-based SKU picker (SKUs / Categories / Vendors / Seasons / Styles-Colors / Groups / Keywords + "future price changes" / "WTD sales" filters) feeding a shared `applyBatchChange(criteria, change)` primitive. Utilities: Change Keywords (add/remove), Change Categories, Change Vendors, Change Seasons, Change Group Codes, Change Size Columns (global label rename), Change Size Types (restructure grid with consolidation). Owns the batch-operation audit and the undo path.

**Phase:** TBD
**RICS chapters:** Ch. 15 (Utilities 2 — batch-change tools from p. 193 onward — Change Size Columns, Change Size Types, Change Categories, Change Vendors, Change Seasons, Change Group Codes, Change Keywords)
**Registry:** [`../MODULES.md`](../MODULES.md)

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
