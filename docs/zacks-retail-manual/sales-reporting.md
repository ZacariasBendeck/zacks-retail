# 8. Sales Reporting

> **Status:** Draft
> **Module spec:** [../modules/sales-reporting.md](../modules/sales-reporting.md)
> **RICS ancestry:** Ch. 6 (most, minus OTB), Ch. 2 (Sales by Time, Sales by SKU, Sales Journal)
> **Last updated:** 2026-04-23

## What this module does

Sales Reporting is the lens on what sold, when, where, and by whom. Managers read sales analysis with all its rollups; buyers look at 8-week trending and best sellers; cashiers look at sales-by-day summaries; merchandisers read size-type analysis and stock status; analysts export sales journals, NPD feeds, inventory-quantities CSVs, and SKUs HTML. Every report is driven by historical data — the module does not author; it synthesizes.

## Audience

- **Store managers** — daily / weekly sales summaries; tax recap.
- **Buyers** — best sellers, 8-week trending, size-type analysis.
- **Executives** — company-wide rollups, same-store trends.
- **Analysts** — ad-hoc exports (CSV, NPD feed).

## Prerequisites

- [Sales / POS](sales-pos.md) — ticket history in `rics_mirror` (or future `sales_pos.*`).
- [Products](products.md) — taxonomy for rollups.
- [Store Operations](store-ops.md) — store list for filters.

## Screens

_TODO. Intended screens:_
- _Sales Analysis (pivot UI: rows × columns × metrics × filters)_
- _8-Week Trending_
- _Best Sellers_
- _Stock Status_
- _Size Type Analysis_
- _Sales by Time_
- _Sales by SKU_
- _Sales by Salesperson_
- _Sales Journal_
- _Sales-by-Day Summary_
- _Exports tab (NPD, inventory quantities CSV, SKUs HTML)_

## Common tasks

_TODO. Expected flows:_
- _Run a sales analysis for last month, by department × store_
- _Export top-100 best sellers to CSV_
- _Pull an 8-week trend for a specific category_
- _Generate the NPD feed for the month_
- _Compare same-store sales year-over-year_

## Reports

_TODO — this module IS reports. Full list will enumerate below as UI ships._

| Report | Where | Filters | Exports |
|---|---|---|---|
| Sales Analysis | Reports → Sales → Sales Analysis | Stores, Categories, Vendors, Seasons, SKUs, Style/Color, Groups, Keywords; period; prior-year compare | CSV / XLSX / PDF |
| Sales Hierarchy Drill-Down | Reports → Sales → Sales Hierarchy Drill-Down | Same as Sales Analysis | CSV / XLSX / PDF |
| 8-Week Trending | — | SKU, category, store | CSV / PDF |
| Best Sellers | Reports → Sales → Best Sellers | Period, store, category | CSV / PDF |

### Sales Hierarchy Drill-Down

A three-level tree view — **Department → Category → SKU** — with subtotals at every level. Departments are collapsed by default; click a department to see its category subtotals, click a category to see the SKUs under it. Turn on **Separate Stores** in Store Options to wrap the tree in an outer Store level (one tree per store). **Combine Stores** (default) produces a single tree aggregated across every store.

Filters match Sales Analysis exactly — whatever criteria narrow Sales Analysis narrow the tree the same way. Turn on **Compare to prior year** to add **Prior Yr Net** and **PY % Δ** columns at every row in the tree.

## Saved templates and snapshots

Two small actions ride alongside **Run Report** on each report page: **Save as template** and **Save snapshot**.

### Save as template

A template is a named set of filters. Click **Save as template**, give it a title (e.g. *Q1 Footwear Categories*), and pick a visibility:

- **Private** — only you see it.
- **Visible to all signed-in users** — anyone logged in can find it under **Reports → Templates**.

Later, open **Reports → Templates**, click **Run** on any saved row, and the report page re-opens with your filters already filled in and the report auto-running against today's data. Templates are the right tool when you want **the same question, answered against fresh data each time** — monthly reviews, standing dashboards, etc.

### Save snapshot

A snapshot freezes the exact result that is on your screen. Click **Save snapshot** after a run, give it a title (default is *Report Name — YYYY-MM-DD HH:mm*), and pick a visibility. The snapshot appears under **Reports → Snapshots**.

Opening a saved snapshot shows you the same rows, same totals, same drill-downs you captured — no re-query against the sales database. Useful for:

- Bookmarking a result before a meeting.
- Sharing a point-in-time view with a teammate.
- Keeping a record of how numbers looked right before a process change.

Snapshots never refresh on their own. If you need current numbers, re-run the report in the builder (**Open builder (live data)** on the snapshot view page).

### Templates vs. snapshots — quick pick

| Want… | Use |
|---|---|
| The same filters replayed against fresh data | Template |
| A frozen copy of today's numbers | Snapshot |
| Both | Save as template first, then save a snapshot of the run |

When you take a snapshot after running a template, the snapshot remembers which template produced it — you'll see an **Open source template** link on the snapshot view page.

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** `rics_mirror.ticket_header` + `.ticket_detail` + `.ticket_tender`, joined to `rics_mirror.inventory_master`, `.categories`, `.departments`, `.salespeople`, `.store_master`.
- **Primary write:** none (reporting is read-only by definition); may write materialized-view refreshes to `platform.*` over time.
- **Future (Phase C):** dedicated `sales_reporting.*` schema with materialized views and snapshot tables.

## Related modules

- [Sales / POS](sales-pos.md) — ticket source data.
- [Products](products.md) — taxonomy for rollups.
- [Employees](employees.md) — salesperson-level attribution.
- [Store Operations](store-ops.md) — store hierarchy.

## What's different from RICS

_TODO. Expected: pivot-style Sales Analysis replaces the multi-screen RICS walkthrough; charts alongside tables; scheduled auto-refresh of materialized views; one-click export in multiple formats; mobile-readable summaries._
