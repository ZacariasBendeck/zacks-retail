# Products

SKUs, taxonomy (department / category / group / season / keyword), vendors, size types, NRF codes, pricing, perks, pictures, stock labels, UPC cross-reference, UPC generation, GMAIC vendor UPC import.

**Phase:** Development Against Direct CSV Imports / Cutover Migration target
**RICS chapters:** Ch. 11 (File Setup), Ch. 4 (Stock Maintenance — pricing / discontinue / change cost), Ch. 5 (Labels + UPC)
**Registry:** [`../MODULES.md`](../MODULES.md)

## Architecture rule

RICS remains the operational system of record until cutover day. This module must not write to RICS MDB files, must not read MDBs at request time, and must not add new `rics_mirror` dependencies. During development, canonical CSV artifact imports populate owned Postgres tables such as `app.sku`, `app.vendor`, `app.product_family`, and `app.category_product_family`; app-owned drafts, enrichments, overlays, configuration, and future workflow data also live in Postgres-owned schemas such as `app.*`, `public.*`, or future module schemas. Final operational keys, foreign keys, and authoritative product tables are validated during the Cutover Migration.

## Matching-set purchasing

Matching sets model products that share a style/material story but remain separate sellable SKUs. A suit set links jacket, pant, vest, and related components through `app.matching_set` and `app.matching_set_member`; each component still owns its own stock, size grid, cost, retail, sales history, and purchase-order line. Suit planning defaults to `jacket:pant:vest = 1:1.2:0.5`, with the ratio stored on `matching_set_member.quantity_ratio`.

The Products module owns the set definition, selling mode (`separates` or `bundle_required`), material fields, chain assignment, size curves, and generated buy-plan records. The Buying Plan surface computes complete-set capacity, bottleneck role, orphan component units, role/size recommendations, and OTB impact from Postgres `app.*` data only.

### Matching-set material identity

Exact fabric/material identity belongs on the matching-set header, not in generic SKU attributes. The matching set carries the shared material story through `material_code` and `material_label` so jacket, pant, vest, and related components can be planned as one material lot while remaining separate sellable SKUs.

The finished-goods vendor and fabric vendor can be different business parties. Finished-goods vendor remains the vendor used for the garment SKU, matching set, and PO workflow. Fabric vendor should be modeled as a separate optional matching-set header field backed by controlled vendor data, not as a free-text SKU attribute. Broad searchable fabric characteristics, such as fabric family or fabric weight bucket, can be SKU attributes.

Exact fabric details may be captured in `material_label`, for example a vendor fabric description with GSM or ounce weight. If a controlled weight bucket is needed, the application should derive or suggest a SKU attribute such as `fabric_weight_bucket` from the exact material text, with operator override. The exact source text remains on the matching set; the bucket is the reporting/filtering attribute.

### Product families and attribute dimensions

Product families are editable app-owned records in `app.product_family`; they are not a fixed eleven-row taxonomy. Deletion remains intentionally unavailable because category mappings, SKU attribute rules, and SKU assignments can reference family codes.

Categories map to product families through `app.category_product_family`. The category maintenance screen must show the current family and allow operators to change it using the family catalog from Store/Product Family administration.

Attribute dimensions are either universal or scoped to one or more product families through `app.attribute_family_rule`. Creating a dimension with no family selected creates a universal dimension. Creating a dimension with a family selected creates the dimension and an initial enabled family rule in one atomic operation. Universal dimensions apply to every family; family-specific dimensions are shown under the selected family in the Families screen and under the family rollups in Attributes.

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
