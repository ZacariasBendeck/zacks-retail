# 2. Inventory

> **Status:** Draft
> **Module spec:** [../modules/inventory.md](../modules/inventory.md)
> **RICS ancestry:** Ch. 4 (most of Stock Maintenance)
> **Last updated:** 2026-04-21

> Amounts in Lempira (HNL).

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

### Inventory Change Detail

RICS ancestry: Ch. 2 p. 55 and Ch. 4 p. 72 — the `[Detail]` button on the Inventory Inquiry screen.

Answers the question "How did this SKU reach its current on-hand?" by listing every movement that touched it — PO receipts, transfers in and out, manual returns, physical-inventory adjustments, miscellaneous receives — across every store, most recent first, grouped by store with per-store subtotals and a grand total at the bottom.

**Two ways to reach it:**

- **From Product Inquiry** — look up a SKU on the **Inventory Inquiry** page and click the **Detail** tab. This is the common path and matches the RICS `[Detail]` button.
- **Direct URL** — `/inventory/change-detail/<sku>` opens the same view standalone. Useful for sharing a link in Slack or email, or for jumping straight in when you already know the SKU.

For ad-hoc queries that are not scoped to one SKU — e.g. "show me every physical-inventory adjustment last week" — use **`/inventory/change-detail`** (without a SKU). That page wraps the same data with a free-form filter form (SKU, store, change type, date range, row limit).

**Columns**

| Column      | What it shows |
|-------------|---------------|
| Str         | Store number where the movement happened. |
| Date        | Date and time of the movement. |
| Type        | `PO Receipt` (POR), `Return` (RET), `Physical` (PHY), `Transfer Out` (TOU), `Transfer In` (TIN), `Receive` (REC). |
| Row / Col   | Size cell — populated only when **Show Size Detail** is checked. |
| Qty         | Signed quantity delta. Negative values are shown in red. |
| Cost        | Unit cost at the time of the movement (HNL, no symbol). |
| Comment     | RICS-style context string: `PO# …`, `To Store N`, `From Store N`, `RMA# …`. |

**Show Size Detail**

Off by default — per-size rows that belong to the same document (same date, store, type, PO, RMA, counterpart store) are collapsed into one row, and the Row/Col column is blank. This matches the compact view most operators want when reconciling stock.

Turn it **on** to expand to one row per (movement × size cell), the way RICS prints it when the checkbox is ticked.

**Load more**

The initial fetch pulls the 1,000 most recent movements. Older SKUs (six years of history, multi-store) can exceed that. Hit **Load more** to double the limit each click, up to 5,000. If you need to go further back, use the standalone `/inventory/change-detail` page with a narrower date window.

**Export CSV**

One-click export of the flat row list (no subtotals, so the file is easy to re-analyse in Excel). Filename is `change-detail-<sku>.csv`.

### Inventory Audit

Reach it at **Inventory → Audit** in the sidebar, URL `/inventory/audit`.

Where Change Detail is the operator's "show me movements" screen, the **Audit** screen answers the stricter question: **"prove that the current on-hand for this SKU in this store is correct."** It unions the same non-sales movements (PO receipts, transfers, returns, physical counts) with **POS sales** (from `rics_mirror.ticket_detail` — sales don't appear in the change-detail ledger otherwise), then computes a running on-hand balance anchored to today's `inventory_quantities`.

**How to run it**

1. Pick a **SKU** — use the magnifier icon to open the lookup.
2. Pick a **Store** — the dropdown shows only stores with a non-zero on-hand for that SKU (with current on-hand next to each).
3. The ledger and summary update automatically.

**Summary strip**

- **Current On-Hand** — from `inventory_quantities` (source of truth for "now").
- **Starting Balance (oldest row)** — back-computed: current on-hand − sum of movement deltas in the window.
- **Movements in Window** — row count after the union (inv_changes ∪ sales).
- **Net Qty Δ** — sum of all deltas shown.
- **Reconciles?** — **Yes** when the running balance after the last row equals current on-hand. **Mismatch** means either the ledger is missing rows for this (SKU × Store) or the rics_mirror reload is stale.

**Ledger table**

Rows are ordered oldest → newest so the running balance reads top-down. Each row shows the movement Type tag (including the new `Sale` tag in magenta), the signed Qty Δ (negative for sales and transfers out), and the resulting **Balance** after that movement.

**Caveats**

- The ledger is capped at 1,000 rows. Long-tail SKUs will show a warning banner — the starting balance is then "as of the oldest row we have," not true day-zero.
- Phase A data only: if `rics_mirror.inv_changes` / `ticket_detail` haven't been reloaded since the last RICS activity, the audit will disagree with RICS. Re-run `pnpm sync:rics`.

### Other screens (TODO)

_TODO. Intended screens:_
- _Inventory Inquiry (per SKU, per store, with on-hand + on-order + sales velocity)_
- _Find by Size (SKU × size grid view)_
- _Transfer entry (manual / auto-balancing)_
- _Recommended transfers report_
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
