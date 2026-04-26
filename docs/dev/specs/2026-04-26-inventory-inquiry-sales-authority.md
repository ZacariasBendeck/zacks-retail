# Inventory Inquiry Sales Authority

**Date:** 2026-04-26
**Source:** `/index-knowledge` pass — inquiry-sales parity fixes and RICS comparison for Product Inquiry / Inventory Inquiry
**Type:** Design decision

## Context

Live RICS comparison work on April 25-26, 2026 found that the Zack's Retail inquiry page was mixing sales sources on the same screen.

- The `Info` popup had already been corrected to use imported legacy inquiry-history tables.
- The sales roll-up strip and All Stores Summary were still reading ticket-derived totals from `app.sales_history_ticket` and `app.sales_history_ticket_line`.
- RICS did not agree with the ticket replay for key SKUs. Example: SKU `6017-130-BKPU` showed `Season 1`, `Year 159`, and `L/Y 523` in the live RICS inquiry, while the web inquiry was showing ticket-derived totals `Season 68`, `Year 140`, and `L/Y 477`.

The inquiry page must mimic RICS first. That requires documenting which sales surfaces are snapshot-driven and which are still ticket-driven.

## Decision

During Development Against Direct CSV Imports, the inquiry page uses two different owned Postgres authorities:

1. `app.inventory_history_snapshot` plus `app.inventory_history_month` are the authority for:
   - the sales roll-up strip (`Week`, `Month`, `Season`, `Year`)
   - `All Stores Summary`
   - `All Stores - 1 Row` totals for single-row size types
   - the `[Info]` popup's prior-12-month sales block
   - the `[Info]` popup's `M-T-D`, `S-T-D`, and `Y-T-D` GP / ROI / Turns metrics
2. `app.sales_history_ticket` plus `app.sales_history_ticket_line` remain the temporary authority for:
   - the per-size MTD / STD / YTD / L/Y sales cells shown in the size-grid sales modes

This split is deliberate until a cell-level legacy inquiry-history source is promoted into owned Postgres tables.

## Current Request-Path Authority By Surface

| Inquiry surface | Current authority | Notes |
|---|---|---|
| Header identity / pricing | `app.sku` | SKU identity, price slots, comments, perks |
| On hand | `app.stock_level` | request-path projection |
| Model / Max / Reorder | `app.replenishment_target` | request-path projection |
| On order | live PO projection | derived from purchasing-owned PO lines |
| Sales roll-up strip | `app.inventory_history_snapshot` | `week_*`, `month_*`, `season_*`, `year_*` counters |
| All Stores Summary | `app.inventory_history_snapshot` + `app.inventory_history_month` | store totals must match RICS inquiry |
| All Stores - 1 Row (single-row size types) | `app.inventory_history_snapshot` + `app.inventory_history_month` | same totals as summary when the size type has one row |
| `[Info]` prior 12 months | `app.inventory_history_month` | calendar-month slots from imported inquiry history |
| `[Info]` GP / ROI / Turns | `app.inventory_history_snapshot` + `app.inventory_history_month` | same inquiry-history family as RICS |
| `[Trend]` | `app.inventory_history_trend_week` | imported 8-week trend slots |
| Per-size MTD / STD / YTD / L/Y cells | `app.sales_history_ticket*` | known parity gap; still ticket-derived |

## How Last-Year Sales Is Reconstructed

`L/Y Sales` on the inquiry screen is not a straight replay of calendar-year tickets and it is not just one snapshot field.

- `app.inventory_history_month` stores the last 12 closed calendar months for each `(SKU, Store)` snapshot row.
- Once the snapshot month advances past January, the early months of the prior calendar year are no longer visible in that 12-slot window.
- RICS carries those rolled-off early months in `app.inventory_history_snapshot.ly_year_qty_sales`.

Current inquiry reconstruction rule:

1. Sum visible prior-calendar-year months from `app.inventory_history_month`.
2. Add `ly_year_qty_sales` from `app.inventory_history_snapshot` when the snapshot month is after January.

For SKU `6017-130-BKPU` at snapshot `2026-04-24`:

- visible 2025 months in `app.inventory_history_month` sum to `513`
- `ly_year_qty_sales` carry is `10`
- reconstructed `L/Y Sales` is `523`

That matches the live RICS inquiry.

## Why Ticket Totals And Inquiry-History Totals Differ

The two sources answer different questions.

- Ticket replay is a fresh rebuild from completed ticket lines filtered by `purchased_at`, with signed return logic applied line by line.
- Inquiry history is a legacy RICS snapshot surface. It stores pre-aggregated counters as of `snapshot_as_of`, plus a rolling 12-month history and LY carry values.
- The 12-month history stores closed calendar months. The current open month lives on the snapshot row, not in the month table.
- Returns, close-cycle adjustments, and legacy carry fields can make snapshot totals differ from line-by-line ticket replay even when both are "correct" for their own accounting surface.

This means the inquiry page should be compared to the live RICS inquiry first, not to ticket-detail reports.

## Verification Evidence

Verification on April 26, 2026 used live imported data for SKU `6017-130-BKPU`.

- RICS inquiry roll-up showed `Week 1`, `Month 1`, `Season 1`, `Year 159`.
- RICS all-stores totals showed `YTD 159`, `L/Y 523`.
- Zack's Retail inquiry now returns the same values from `getInventoryInquiry('6017-130-BKPU')`.

## Consequences

- The inquiry page can now match RICS on the roll-up strip, All Stores Summary, single-row all-stores totals, and `[Info]` popup.
- Differences between the per-size sales grids and the summary totals are currently expected for some SKUs because the grids still use ticket replay.
- Any future cutover or parity checklist for Inventory Inquiry must validate the size-grid sales modes separately from the snapshot-backed totals.

## Related

- [`docs/modules/products/rics-module-specs.md`](../../modules/products/rics-module-specs.md)
- [`docs/modules/inventory/rics-module-specs.md`](../../modules/inventory/rics-module-specs.md)
- [`docs/dev/specs/2026-04-19-inventory-inquiry-design.md`](./2026-04-19-inventory-inquiry-design.md)
- [`apps/api/src/services/ricsInventoryAdapter.ts`](../../../apps/api/src/services/ricsInventoryAdapter.ts)
