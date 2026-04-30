# Platform

Background workers + scheduled tasks, generalised audit log, notifications / reminders / store broadcasts, typed settings + feature flags (replaces RICS.CFG), managed-Postgres backup observability, integrations transport + durable message log (EDI / SPS Commerce / GMAIC / marketplace inbound), data retention purges, saved views + keyboard shortcuts, admin telemetry. The cross-cutting admin spine for the system.

Identity & Access writes security-sensitive user/session/role events into Platform's shared audit log; Platform owns retention, search, and audit infrastructure.

**Phase:** TBD
**RICS chapters:** Ch. 14, Ch. 15 (DB utilities + RICS.CFG reimagined as feature flags; Macro Management reimagined as saved views + shortcuts; Reset Pictures as orphaned-asset retention), Ch. 13 (Send Messages to Stores reimagined as in-app broadcasts; dial-up sync dropped), Ch. 8 (retention purges only — fiscal closes moved to `accounts-receivable`), Ch. 5 (GMAIC Vendor UPC inbound transport only), Ch. 17 (System Status Report)
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
| [`plan.md`](./plan.md) | Phased development plan (companion to `rics-module-specs.md`) |

Files that don't exist yet are TBD — see the generating slash command in the layout section of [`../../../CLAUDE.md`](../../../CLAUDE.md).
