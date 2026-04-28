# Products

SKUs, taxonomy (department / category / group / season / keyword), vendors, size types, NRF codes, pricing, perks, pictures, stock labels, UPC cross-reference, UPC generation, GMAIC vendor UPC import.

**Phase:** Development Against Direct CSV Imports / Cutover Migration target
**RICS chapters:** Ch. 11 (File Setup), Ch. 4 (Stock Maintenance — pricing / discontinue / change cost), Ch. 5 (Labels + UPC)
**Registry:** [`../MODULES.md`](../MODULES.md)

## Architecture rule

RICS remains the operational system of record until cutover day. This module must not write to RICS MDB files, must not read MDBs at request time, and must not add new `rics_mirror` dependencies. During development, canonical CSV artifact imports populate owned Postgres tables such as `app.sku`, `app.vendor`, `app.product_family`, and `app.category_product_family`; app-owned drafts, enrichments, overlays, configuration, and future workflow data also live in Postgres-owned schemas such as `app.*`, `public.*`, or future module schemas. Final operational keys, foreign keys, and authoritative product tables are validated during the Cutover Migration.

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
