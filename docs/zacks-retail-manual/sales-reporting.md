# 8. Sales Reporting

> **Status:** Draft
> **Module spec:** [../modules/sales-reporting.md](../modules/sales-reporting.md)
> **RICS ancestry:** Ch. 6 (most, minus OTB), Ch. 2 (Sales by Time, Sales by SKU, Sales Journal)
> **Last updated:** 2026-04-21

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
| Sales Analysis | — | Many | CSV / XLSX / PDF |
| 8-Week Trending | — | SKU, category, store | CSV / PDF |
| Best Sellers | — | Period, store, category | CSV / PDF |

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
