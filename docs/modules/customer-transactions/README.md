# Customer Transactions

Transaction types that require a customer account and have their own lifecycle beyond a single ticket: special orders (deposit / pickup / refund / print), layaways (sale / payment / pickup / refund / print), gift certificate sales + redemptions + maintenance + activity report, house charge sales + payments + print. Extends `sales-pos` ticket flow; depends on `crm` for customer accounts; reports into `accounts-receivable` where relevant.

**Phase:** TBD
**RICS chapters:** Ch. 2 (Special Orders pp. 36–37, Layaways pp. 38–39, Gift Certificate p. 40, House Charge pp. 40–41 + related print reports), Ch. 9 (Gift Certificate Maintenance p. 131, Print Gift Certificate Activity p. 132)
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
