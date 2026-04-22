# Sales POS

Sales ticket entry (header / detail / tender) for regular sales, manager options, batch-of-sales lifecycle (start / close / count money / over-short), refunds, void / reclaim / reprint, credit slips, pay outs, cash drawer, post-sales-to-inventory, sales tax recap, sales-by-day, reprint posted sales, returned sales report, promotion code analysis, change sales passwords. Owns the sales-ticket framework that `customer-transactions` extends.

**Phase:** TBD
**RICS chapters:** Ch. 2 (register core), Ch. 13 (customer-facing register flow only — sync infrastructure dropped)
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
