# Purchasing

Purchase orders (entry / receive / combine / merge / replicate / duplicate), auto POs, order worksheets, ASN cartons, reset future orders, PO reports, open P.O. by month.

**Phase:** Development Against Direct CSV Imports / Cutover Migration target
**RICS chapters:** Ch. 3
**Registry:** [`../MODULES.md`](../MODULES.md)

## Architecture rule

RICS remains the live purchasing system until cutover. This module must not create or modify purchase orders in RICS. During development, all purchasing logic, forecasts, and draft POs exist only in Postgres `app.*` tables, backed by direct CSV imports of legacy PO baselines. Request handlers must not open MDB files, write SQLite tables, or depend on a retired `rics_mirror` schema. Any operational PO creation remains in RICS until cutover. Final purchasing ownership transfers during Cutover Migration.

## Matching-set PO worksheets

Matching-set buy plans create normal draft purchase orders in `app.purchase_order`. The set plan is planning context only: jacket, pant, vest, and other components are exploded into separate `purchase_order_line` records with size cells, and `app.matching_set_buy_plan_line.po_line_id` preserves the link back to the recommendation. Purchasing remains responsible for PO lifecycle, receiving, cancellation, status history, and OTB validation at submit time.

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
