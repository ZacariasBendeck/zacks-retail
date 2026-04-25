# Design: Legacy Reference Baseline Migration Map

**Date:** 2026-04-25  
**Modules:** `products`, `inventory`, `purchasing`, `store-ops`  
**Purpose:** define the remaining MDB-derived CSV streams promoted directly into app-owned Postgres baseline tables.

## Why this exists

The promotion flow is now:

1. MDB -> temporary CSV extract
2. CSV -> direct import into `app.*`

There is no `rics_mirror` landing step.

This document is the migration map for the remaining legacy reference surfaces that were previously loaded through the mirror model.

## Staging CSV naming

Each canonical RICS table becomes one temporary snake-cased CSV:

| MDB | RICS table | staging CSV |
|---|---|---|
| `RIVENDOR.MDB` | `Vendor Master` | `vendor_master.csv` |
| `RIVENDOR.MDB` | `Vendor Accounts` | `vendor_accounts.csv` |
| `RISTORE.MDB` | `StoreMaster` | `store_master.csv` |
| `RIUPC.MDB` | `UPC Cross Reference` | `upc_cross_reference.csv` |
| `RICASEPK.MDB` | `Case_Packs` | `case_packs.csv` |
| `RICASEPK.MDB` | `Case_Pack_Qtys` | `case_pack_qtys.csv` |
| `RIFUTURE.MDB` | `Future Price Changes` | `future_price_changes.csv` |
| `RIPOMAS.MDB` | `Purchase Master` | `purchase_master.csv` |
| `RIPODET.MDB` | `Purchase Detail` | `purchase_detail.csv` |
| `RIPODET.MDB` | `AsnCartonHead` | `asn_carton_head.csv` |
| `RIPODET.MDB` | `AsnCartonDet` | `asn_carton_det.csv` |
| `RITRANSF.MDB` | `InvTransfers` | `inv_transfers.csv` |

## App-owned target tables

Added in `20260425090000_app_legacy_reference_baselines`:

- `app.vendor`
- `app.vendor_store_account`
- `app.store_master`
- `app.sku_upc`
- `app.case_pack`
- `app.case_pack_cell`
- `app.future_price_change`
- `app.purchase_order_legacy`
- `app.purchase_order_legacy_line`
- `app.asn_carton_legacy`
- `app.asn_carton_legacy_line`
- `app.transfer_legacy_summary`

## Migration streams

### A. Vendor + store reference

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `vendor_master.csv` | `RIVENDOR.MDB` / `Vendor Master` | `app.vendor` | direct | Snapshot rebuild of imported baseline vendor rows. `app.vendor_overlay` remains the sparse/native write surface. |
| `vendor_accounts.csv` | `RIVENDOR.MDB` / `Vendor Accounts` | `app.vendor_store_account` | direct | Snapshot rebuild of per-store vendor account numbers. |
| `store_master.csv` | `RISTORE.MDB` / `StoreMaster` | `app.store_master` | direct | Snapshot rebuild. Core store fields stay typed; full legacy row is preserved in `raw_json`. |

### B. UPC + case-pack reference

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `upc_cross_reference.csv` | `RIUPC.MDB` / `UPC Cross Reference` | `app.sku_upc` | direct | Snapshot rebuild keyed by full UPC string. Resolve `sku_id` from `app.sku`. Keep unresolved rows with `sku_id = NULL` and report them. |
| `case_packs.csv` | `RICASEPK.MDB` / `Case_Packs` | `app.case_pack` | direct | Snapshot rebuild of case-pack headers. |
| `case_pack_qtys.csv` | `RICASEPK.MDB` / `Case_Pack_Qtys` | `app.case_pack_cell` | direct | Flatten each quantity segment into per-cell rows using the owned size-type arrays when available. |

### C. Scheduled pricing baseline

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `future_price_changes.csv` | `RIFUTURE.MDB` / `Future Price Changes` | `app.future_price_change` | direct | Import all eligible future-dated rows as baseline scheduled-price records. Resolve `sku_id` when possible; preserve unresolved legacy rows with `sku_id = NULL`. |

### D. Purchasing legacy baseline

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `purchase_master.csv` | `RIPOMAS.MDB` / `Purchase Master` | `app.purchase_order_legacy` | direct | Snapshot-preservation surface for legacy PO headers. |
| `purchase_detail.csv` | `RIPODET.MDB` / `Purchase Detail` | `app.purchase_order_legacy_line` | direct | Snapshot-preservation surface for legacy PO lines. |
| `asn_carton_head.csv` | `RIPODET.MDB` / `AsnCartonHead` | `app.asn_carton_legacy` | direct | Snapshot-preservation surface for ASN carton headers. |
| `asn_carton_det.csv` | `RIPODET.MDB` / `AsnCartonDet` | `app.asn_carton_legacy_line` | direct | Snapshot-preservation surface for ASN carton detail rows. |

### E. Transfer summary baseline

| staging CSV | MDB / RICS table | target app table(s) | role | migration rule |
|---|---|---|---|---|
| `inv_transfers.csv` | `RITRANSF.MDB` / `InvTransfers` | `app.transfer_legacy_summary` | direct | Preserve the available legacy transfer summary history without forcing it into the live transfer document model. |

## Direct vs deferred

### Direct now

These surfaces are safe to promote directly and now have owned baseline tables:

- `vendor_master.csv` -> `app.vendor`
- `vendor_accounts.csv` -> `app.vendor_store_account`
- `store_master.csv` -> `app.store_master`
- `upc_cross_reference.csv` -> `app.sku_upc`
- `case_packs.csv` + `case_pack_qtys.csv` -> `app.case_pack*`
- `future_price_changes.csv` -> `app.future_price_change`
- `purchase_master.csv` + `purchase_detail.csv` -> `app.purchase_order_legacy*`
- `asn_carton_*.csv` -> `app.asn_carton_legacy*`
- `inv_transfers.csv` -> `app.transfer_legacy_summary`

### Still deferred

These source tables are now preserved in owned baseline tables, but the final runtime document model is still deferred:

- purchasing authoring/editing/receiving -> future purchasing-owned authoritative schema
- transfer documents -> `app.transfer` / `app.transfer_line` when a full legacy-detail mapping is defined
- scheduled-price execution -> future pricing-owned authoritative scheduler

## Request-path authority

Once the baseline tables exist, live request reads should use the owned tables for these surfaces.

Safe cutovers in this pass:

- vendor reads -> `app.vendor` + `app.vendor_overlay`
- vendor store-account reads -> `app.vendor_store_account`
- store lookups -> `app.store_master`
- UPC resolution -> `app.sku_upc`
- case-pack option reads -> `app.case_pack` + `app.case_pack_cell`

## Repeatable importer rule

The baseline importer must stay snapshot-style and repeatable:

- reruns rebuild only these imported baseline tables,
- app-native rows in `app.vendor_overlay` remain untouched,
- unresolved SKU joins are surfaced instead of silently dropped.

## Verification checklist

1. extract the required CSV artifacts
2. run the direct importer
3. query counts directly in Postgres
4. verify live vendor/store/UPC request paths no longer depend on mirror-era sources
