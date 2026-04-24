# Design: Inventory / Stock Maintenance Migration Map

**Date:** 2026-04-24  
**Module:** `inventory`  
**Purpose:** define the exact `rics_mirror` CSV extracts that feed the app-owned Stock Maintenance migration, and map each one to its target `app.*` table(s) or migration role.

## Why this exists

For inventory / Stock Maintenance, the migration will be driven from the same CSV artifacts the RICS mirror ETL already produces.

In the shipped ETL, each canonical RICS table is extracted to a temporary CSV named after the snake-cased target table:

- `InventoryMaster` -> `inventory_master.csv`
- `Inventory Quantities` -> `inventory_quantities.csv`
- `InvChanges` -> `inv_changes.csv`

That behavior lives in:

- [apps/api/src/services/sync/canonicalRicsTables.ts](../../../apps/api/src/services/sync/canonicalRicsTables.ts)
- [apps/api/src/services/sync/copyFromMdb.ts](../../../apps/api/src/services/sync/copyFromMdb.ts)

This document is the migration map for promoting Stock Maintenance out of the mirror and into app-owned tables.

## Naming rule

Each canonical source table becomes one staging CSV:

| MDB | RICS table | staging CSV |
|---|---|---|
| `RIINVMAS.MDB` | `InventoryMaster` | `inventory_master.csv` |
| `RIINVQUA.MDB` | `Inventory Quantities` | `inventory_quantities.csv` |
| `RIINVCHG.MDB` | `InvChanges` | `inv_changes.csv` |

The CSVs are temporary staging files, not long-lived checked-in assets. They are the extract artifact that feeds either:

1. the current `rics_mirror` load, or
2. the future Stock Maintenance promotion into `app.*`.

## App-owned target tables

Already present:

- `app.stock_level`
- `app.stock_movement`
- `app.manual_receipt`
- `app.manual_receipt_line`

Still to be added before full Stock Maintenance migration:

- `app.replenishment_target`
- `app.manual_return`
- `app.manual_return_line`
- `app.transfer`
- `app.transfer_line`
- `app.auto_transfer_run`
- `app.balancing_transfer_run`

Spec source:

- [docs/modules/inventory/rics-module-specs.md](../../modules/inventory/rics-module-specs.md)

## Migration streams

The Stock Maintenance migration breaks into five streams:

1. **Identity/context bootstrap** — SKUs, size types, stores, vendors, UPCs, case packs
2. **On-hand baseline** — current stock by `(SKU × Store × Column × Row)`
3. **Movement ledger** — the historical explanation of how on-hand changed
4. **Replenishment targets** — Model / Max / Reorder
5. **Transfer documents / derived transfer history** — manual, automatic, balancing, summary/reporting

Not every inventory-related CSV is a direct row-for-row migration into a final app table. Some are:

- **direct sources** for app-owned rows
- **reference sources** used to decode or enrich the direct source
- **validation sources** used to cross-check a migration result
- **deferred sources** whose exact mapping should wait for the target app schema

## Canonical migration map

### A. Core stock baseline and context

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inventory_master.csv` | `RIINVMAS.MDB` / `InventoryMaster` | `app.sku` | direct prerequisite | Must load before stock migration so every mirrored SKU resolves to an app-owned SKU id. Also supplies category, vendor, vendor SKU, style/color, cost, retail, size type. |
| `size_types.csv` | `RISIZE.MDB` / `SizeTypes` | app-owned size-type surface or retained lookup | reference | Used to decode RICS segment columns into `(columnLabel,rowLabel)` cells during stock migration. |
| `store_master.csv` | `RISTORE.MDB` / `StoreMaster` | future app-owned store reference surface | reference | Required to resolve store ids/labels for Stock Maintenance screens and transfer documents. |
| `vendor_master.csv` | `RIVENDOR.MDB` / `Vendor Master` | existing vendor effective-read surface / future app-owned vendor surface | reference | Used for inventory context and reporting labels; not the stock source of truth itself. |
| `upc_cross_reference.csv` | `RIUPC.MDB` / `UPC Cross Reference` | future UPC app surface | reference | Required for UPC-first Manual Receipt / Manual Return / Manual Transfer flows. |
| `case_packs.csv` | `RICASEPK.MDB` / `Case_Packs` | future case-pack app surface | reference | Required for case-pack auto-fill on Manual Receipt / Return and replenishment editing. |
| `case_pack_qtys.csv` | `RICASEPK.MDB` / `Case_Pack_Qtys` | future case-pack app surface | reference | Per-cell quantities for case-pack expansion. |

### B. On-hand baseline

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inventory_quantities.csv` | `RIINVQUA.MDB` / `Inventory Quantities` | `app.stock_level` | direct | Primary baseline source for current on-hand and current replenishment cell values. Flatten each segment row into one row per `(skuId, storeId, columnLabel, rowLabel)`. |

Notes:

- This is the authoritative **baseline snapshot** for current on-hand at migration time.
- The current repeatable rebuild already uses this path:
  - [apps/api/src/services/sync/stockLevelBackfill.ts](../../../apps/api/src/services/sync/stockLevelBackfill.ts)
  - [apps/api/scripts/rics/sync/sync-rics-stock-levels.ts](../../../apps/api/scripts/rics/sync/sync-rics-stock-levels.ts)
- After the baseline seed, app-owned movements are replayed from `app.stock_movement` so re-runs stay deterministic.

### C. Movement ledger

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inv_changes.csv` | `RIINVCHG.MDB` / `InvChanges` | `app.stock_movement` | direct | Primary historical movement source for Manual Receipts, Returns, Transfers In, Transfers Out, and other inventory changes. |
| `inv_his.csv` | `RIINVHIS.MDB` / `InvHis` | no direct row-for-row target in Stock Maintenance v1 | validation / reporting | Use for reconciliation, average-cost lineage, and month-history reporting support. Do **not** treat as the primary movement ledger source. |

Rules:

- `inv_changes.csv` is the correct historical input for `app.stock_movement`.
- `inv_his.csv` is summary/history state, not the canonical per-event ledger for Change Detail migration.
- `ticket_detail.csv` / `ticket_header.csv` may later contribute `SALE` / `SALE_RETURN` rows to the unified ledger, but that is a separate sales-pos migration pass, not the first Stock Maintenance promotion.

### D. Replenishment targets

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inventory_quantities.csv` | `RIINVQUA.MDB` / `Inventory Quantities` | `app.replenishment_target` | direct | Source for per-cell `modelQty`, `maxQty`, and `reorderQty`, flattened the same way as on-hand. |
| `inventory_master.csv` | `RIINVMAS.MDB` / `InventoryMaster` | `app.replenishment_target` enrichment only | reference | Supplies SKU identity / size-type linkage needed to decode cells correctly. |

Rule:

- Replenishment migration should be a **separate promotion step** from `stock_level`, even though both read `inventory_quantities.csv`.
- This avoids mixing “current quantity snapshot” and “operator-maintained target settings” in one write pass.

### E. Transfers and receiving-adjacent inventory records

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inv_transfers.csv` | `RITRANSF.MDB` / `InvTransfers` | `app.transfer` / `app.transfer_line` or reporting-only transfer history surface | deferred direct | Candidate source for summarized transfer documents/history. Exact mapping depends on final transfer document schema. |
| `purchase_master.csv` | `RIPOMAS.MDB` / `Purchase Master` | purchasing-owned tables, then inventory events | indirect | Not migrated into inventory tables directly. Purchasing promotion should emit `PO_RECEIPT` inventory movements. |
| `purchase_detail.csv` | `RIPODET.MDB` / `Purchase Detail` | purchasing-owned tables, then inventory events | indirect | Same as above. |
| `asn_carton_head.csv` | `RIPODET.MDB` / `AsnCartonHead` | purchasing / receiving surfaces | indirect | ASN receiving data; inventory consumes resulting receipt events, not raw ASN rows as stock documents. |
| `asn_carton_det.csv` | `RIPODET.MDB` / `AsnCartonDet` | purchasing / receiving surfaces | indirect | Same as above. |

Rule:

- Inventory should **not** directly import PO headers/lines into inventory-owned tables.
- Purchasing migration owns PO document promotion; inventory consumes the resulting receipt effects as `PO_RECEIPT` movements.

## Recommended migration order

### 1. Identity bootstrap

Load or verify:

- `inventory_master.csv` -> `app.sku`
- `size_types.csv` -> size-type effective read
- store/vendor/UPC/case-pack reference surfaces

Gate:

- every stock-bearing SKU in `inventory_quantities.csv` resolves to an `app.sku.id`

### 2. On-hand baseline seed

Load:

- `inventory_quantities.csv` -> `app.stock_level`

Rules:

- flatten segment columns into `(columnLabel,rowLabel)`
- do not write to `rics_mirror`
- baseline pass sets the app-owned read model only

### 3. Replay app-owned movements

Replay:

- existing `app.stock_movement` rows over the seeded baseline

Purpose:

- preserve Postgres-native Manual Receipt / future movement effects across rebuilds

### 4. Historical movement promotion

Load:

- `inv_changes.csv` -> `app.stock_movement`

Purpose:

- migrate Change Detail / Inventory Detail away from mirror-only history reads

### 5. Replenishment target promotion

Load:

- `inventory_quantities.csv` -> `app.replenishment_target`

Purpose:

- unlock Model / Max / Reorder editing and transfer logic

### 6. Transfer/history document promotion

Load or derive:

- `inv_transfers.csv`
- transfer-related rows from `inv_changes.csv`

Purpose:

- support Transfer Summary, manual transfer history, and future transfer documents

## What is direct vs deferred

### Direct now

These can drive migration work immediately:

- `inventory_master.csv` -> `app.sku`
- `inventory_quantities.csv` -> `app.stock_level`
- `inv_changes.csv` -> `app.stock_movement`

### Direct after missing schema ships

These should wait for the target app tables:

- `inventory_quantities.csv` -> `app.replenishment_target`
- `inv_changes.csv` -> `app.manual_return` / `app.manual_return_line` derivation
- `inv_transfers.csv` + `inv_changes.csv` -> `app.transfer` / `app.transfer_line`

### Reference-only / non-primary

These should not be treated as the first-row migration source for Stock Maintenance:

- `inv_his.csv` — summary/history validation, not the event ledger
- `purchase_master.csv`, `purchase_detail.csv`, `asn_carton_*` — purchasing-first promotion

## First implementation checklist

For the first real Stock Maintenance migration pass, implement in this order:

1. keep `sync:rics-skus`
2. keep `sync:rics-stock-levels`
3. add `sync:rics-stock-movements`
4. add `sync:rics-replenishment-targets`
5. add transfer-document promotion only after the transfer schema is present

That keeps the promotion aligned with the current app-owned target shape instead of forcing transfer/replenishment history into placeholder tables.

## Current repo status

Implemented today:

- `inventory_master.csv` -> `app.sku`
- `inventory_quantities.csv` -> `app.stock_level`
- live Inventory Inquiry / Find by Size read from `app.stock_level`

Not implemented yet:

- `inv_changes.csv` -> `app.stock_movement` backfill
- `inventory_quantities.csv` -> `app.replenishment_target`
- transfer-document promotion
- manual-return document promotion

## Decision

This is the working migration contract for Stock Maintenance:

- **Use the ETL CSV extracts as the migration inputs.**
- **Promote into app-owned tables by domain stream, not table-by-table imitation of RICS.**
- **Treat `inventory_quantities.csv` as the baseline stock + replenishment source.**
- **Treat `inv_changes.csv` as the primary movement-history source.**
- **Treat `inv_his.csv` as validation/reporting support, not the first ledger source.**
- **Do not build new live request paths that read both `rics_mirror` and app-owned stock tables.**
