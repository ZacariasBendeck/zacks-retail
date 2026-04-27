# Design: Inventory / Stock Maintenance Migration Map

**Date:** 2026-04-24  
**Module:** `inventory`  
**Purpose:** define the exact MDB-derived CSV extracts that feed the app-owned Stock Maintenance migration.

## Why this exists

For inventory / Stock Maintenance, the migration is driven from canonical CSV artifacts extracted from the MDB files.

Each canonical source table is extracted to a temporary snake-cased CSV:

- `InventoryMaster` -> `inventory_master.csv`
- `Inventory Quantities` -> `inventory_quantities.csv`
- `InvChanges` -> `inv_changes.csv`

Those CSVs feed direct imports into `app.*` tables. There is no `rics_mirror` landing step.

Reusable cross-module procedure:

- [docs/operations/rics-csv-promotion-playbook.md](../../operations/rics-csv-promotion-playbook.md)

## App-owned target tables

Present:

- `app.sku`
- `app.stock_level`
- `app.stock_movement`
- `app.replenishment_target`
- `app.manual_receipt`
- `app.manual_receipt_line`
- `app.transfer`
- `app.transfer_line`

Reference baselines also exist for:

- `app.store_master`
- `app.vendor`
- `app.vendor_store_account`
- `app.sku_upc`
- `app.case_pack`
- `app.case_pack_cell`

## Migration streams

1. identity/context bootstrap
2. on-hand baseline
3. movement ledger
4. replenishment targets
5. transfer and receiving-adjacent history

Some CSVs are direct sources, some are reference-only, some are validation-only, and some remain deferred until a final target schema is ready.

## Canonical migration map

### A. Core stock baseline and context

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inventory_master.csv` | `RIINVMAS.MDB` / `InventoryMaster` | `app.sku` | direct prerequisite | Must load before stock migration so every legacy SKU resolves to an owned SKU id. |
| `size_types.csv` | `RISIZE.MDB` / `SizeTypes` | size-type owned surface | reference | Decode size-grid cells into `(columnLabel,rowLabel)`. |
| `store_master.csv` | `RISTORE.MDB` / `StoreMaster` | `app.store_master` | reference | Resolve store ids/labels. |
| `vendor_master.csv` | `RIVENDOR.MDB` / `Vendor Master` | `app.vendor` | reference | Inventory context and reporting labels. |
| `upc_cross_reference.csv` | `RIUPC.MDB` / `UPC Cross Reference` | `app.sku_upc` | reference | UPC-first flows. |
| `case_packs.csv` | `RICASEPK.MDB` / `Case_Packs` | `app.case_pack` | reference | Case-pack auto-fill. |
| `case_pack_qtys.csv` | `RICASEPK.MDB` / `Case_Pack_Qtys` | `app.case_pack_cell` | reference | Per-cell case-pack expansion. |

### B. On-hand baseline

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inventory_quantities.csv` | `RIINVQUA.MDB` / `Inventory Quantities` | `app.stock_level` | direct | Flatten each segment row into `(skuId, storeId, columnLabel, rowLabel)`. |

### C. Movement ledger

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inv_changes.csv` | `RIINVCHG.MDB` / `InvChanges` | `app.stock_movement` | direct | Primary historical movement source. |
| `inv_his.csv` | `RIINVHIS.MDB` / `InvHis` | `app.inventory_history_snapshot` + `app.inventory_history_month` + `app.inventory_history_trend_week` + `app.inventory_history_movement_bucket` | direct parity import | Preserve the legacy reporting cube in owned Postgres; later replace the import writer with an owned projector built from stock, sales, and purchasing facts. |

### D. Replenishment targets

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inventory_quantities.csv` | `RIINVQUA.MDB` / `Inventory Quantities` | `app.replenishment_target` | direct | Source for per-cell `modelQty`, `maxQty`, and `reorderQty`. |
| `inventory_master.csv` | `RIINVMAS.MDB` / `InventoryMaster` | enrichment only | reference | Supplies SKU identity and size-type linkage. |

### D2. Inquiry size-grid sales

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inventory_quantities.csv` | `RIINVQUA.MDB` / `Inventory Quantities` | `app.inventory_sales_cell` | direct parity projection | Source for per-cell `mtdSales`, `stdSales`, `ytdSales`, and `lySales` used by Inventory Inquiry size-grid sales modes. |

### E. Transfers and receiving-adjacent records

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inv_transfers.csv` | `RITRANSF.MDB` / `InvTransfers` | `app.transfer` / `app.transfer_line` or reporting-only transfer history | deferred direct | Exact mapping depends on the final transfer document schema. |
| `purchase_master.csv` | `RIPOMAS.MDB` / `Purchase Master` | purchasing-owned tables | indirect | Purchasing promotion owns PO document promotion. |
| `purchase_detail.csv` | `RIPODET.MDB` / `Purchase Detail` | purchasing-owned tables | indirect | Same as above. |
| `asn_carton_head.csv` | `RIPODET.MDB` / `AsnCartonHead` | purchasing / receiving surfaces | indirect | Receiving consumes the resulting receipt effects, not raw ASN rows as inventory documents. |
| `asn_carton_det.csv` | `RIPODET.MDB` / `AsnCartonDet` | purchasing / receiving surfaces | indirect | Same as above. |

## Recommended migration order

1. identity bootstrap
2. on-hand baseline seed
3. replay app-owned movements if the projection requires it
4. historical movement promotion
5. replenishment target promotion
6. transfer/history document promotion

## Current status

Owned target tables are present, and the legacy baseline has already been rehearsed locally.

What still needs follow-up:

- replace any remaining mirror-backed inventory backfill scripts with direct CSV loaders before the next rehearsal
- finish transfer-document promotion once the final schema is agreed
- finish runtime request-path cleanup for any screens still reading mirror-era sources in code

## Decision

This is the working contract for Stock Maintenance:

- use CSV artifacts as the only raw legacy input,
- promote by domain stream, not by recreating raw RICS tables in Postgres,
- treat `inventory_quantities.csv` as the baseline stock + replenishment + inquiry-cell-sales source,
- treat `inv_changes.csv` as the primary movement-history source,
- treat `inv_his.csv` as an owned parity import now, then replace it with an owned projector once reconciliation is proven.
