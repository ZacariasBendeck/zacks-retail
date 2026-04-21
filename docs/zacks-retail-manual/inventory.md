# 2. Inventory

> **Status:** Draft
> **Module spec:** [../modules/inventory.md](../modules/inventory.md)
> **RICS ancestry:** Ch. 4 (most of Stock Maintenance)
> **Last updated:** 2026-04-21

## What this module does

Inventory tracks where stock is and how it moves. On-hand by store, on-order by store and PO, the movement ledger that explains every quantity change, multi-store transfers (manual, auto-balancing, and recommended), model + max + reorder levels, and the inquiry screens buyers and managers open every day.

## Audience

- **Store managers** — inventory inquiry, find-by-size, daily stock status.
- **Receivers** — move-to-floor, transfer entry.
- **Buyers** — check on-hand + on-order when planning.
- **Merchandisers** — inventory change detail to audit adjustments.

## Prerequisites

- [Products](products.md) — SKU master must exist.
- [Store Operations](store-ops.md) — at least one store; multi-store transfers require ≥ 2.

## Screens

_TODO. Intended screens:_
- _Inventory Inquiry (per SKU, per store, with on-hand + on-order + sales velocity)_
- _Find by Size (SKU × size grid view)_
- _Transfer entry (manual / auto-balancing)_
- _Recommended transfers report_
- _Inventory change detail (audit trail)_
- _Models + max + reorder maintenance_

## Common tasks

_TODO. Expected flows:_
- _Look up an item's on-hand across all stores_
- _Enter a manual transfer between stores_
- _Run and print a recommended-transfers report_
- _Audit why a SKU's on-hand changed in a given date range_
- _Set or adjust reorder points for a category_

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Inventory Detail | — | Store, category, vendor, season | CSV / XLSX / PDF |
| Recommended Transfers | — | From/to store, category | PDF |
| Transfer Summary | — | Date range, store | CSV / PDF |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** `rics_mirror.inventory_quantities` (per SKU × store), `rics_mirror.inv_changes` (movement ledger), `rics_mirror.inv_his` (history snapshots), `rics_mirror.inventory_master` (SKU attributes), `rics_mirror.inv_catalog`.
- **Primary write (Phase A):** none from the app — inventory changes today still originate in RICS and land in `rics_mirror` on the next reload.
- **Future (Phase B+):** `inventory.*` schema will own stock_on_hand, movement, transfer, count_session.

## Related modules

- [Products](products.md) — SKU identity and attributes.
- [Purchasing](purchasing.md) — on-order quantities and receipts create movements.
- [Physical Inventory](physical-inventory.md) — count sessions post movements to reconcile on-hand.
- [Sales / POS](sales-pos.md) — post-to-inventory decrements on-hand at batch close.
- [Sales Reporting](sales-reporting.md) — joins inventory for stock status reports.

## What's different from RICS

_TODO. Expected: real-time updates instead of end-of-day batch posts once Phase B ships; richer audit trail; web-based inquiry with filter/export instead of green-screen windows._
