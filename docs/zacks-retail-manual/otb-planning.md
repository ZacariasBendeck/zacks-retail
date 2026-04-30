# 5. Open-To-Buy Planning

> **Status:** Draft
> **Module spec:** [../modules/otb-planning.md](../modules/otb-planning.md)
> **RICS ancestry:** Ch. 6 (OTB Report, OTB vs. Sales), Ch. 11 (OTB Plan setup), Ch. 17 (Company Setup — OTB calculation method)
> **Last updated:** 2026-04-21

## What this module does

Open-To-Buy planning is how buyers set and track spending authority. A buyer builds a plan per store × category × month — either by fixed percentage of last-year sales or by a % change vs. last-year actuals — and the system projects the 12-month OTB budget, compares it against current sales, committed POs, and approved import landed-cost commitments, and surfaces overruns or underruns in time to act.

## Audience

- **Buyers** — build and adjust plans; reconcile against actuals.
- **Planners** — validate the calculation method fits the category.
- **Executives** — read OTB vs. Sales for budget health.

## Prerequisites

- [Sales Reporting](sales-reporting.md) — historical sales by store × category × month.
- [Purchasing](purchasing.md) — committed PO dollars by month count against plan.
- [Import Management](import-management.md) — approved estimated/final landed HNL commitments for international shipments.
- [Store Operations](store-ops.md) — stores, categories, and the company-wide OTB calculation method setting.

## Screens

_TODO. Intended screens:_
- _Plan list (by fiscal year × store × category)_
- _Plan entry (month grid, per-row calculation method)_
- _OTB Report (12-month projection)_
- _OTB vs. Sales comparison_
- _Policy audit log_

## Common tasks

_TODO. Expected flows:_
- _Create a plan for a new fiscal year_
- _Switch a category's calculation method mid-year_
- _Run the OTB-vs-Sales comparison for a store_
- _Review the audit log for a modified plan row_

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| OTB Projection (12-month) | — | Year, store, category | CSV / PDF |
| OTB vs. Sales | — | Year, store, category, month range | CSV / PDF |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources (Phase A)

- **Primary read:** sales history from `rics_mirror` (tables TBD); PO commitments from `rics_mirror` PO tables.
- **Primary write:** plan rows in `public.*` or `app.*` (scaffolding being retired — see existing `otbBudgetRoutes`, `otbMonthlyPlanRoutes` in [apps/api/src/routes](../../apps/api/src/routes/)).
- **Import feed:** estimated HNL landed commitments from Import Management before final liquidation; final HNL landed cost and true-ups after liquidation approval.
- **Future (Phase C):** dedicated `otb_planning.*` schema.

## Related modules

- [Purchasing](purchasing.md) — committed PO dollars roll up to OTB actuals.
- [Import Management](import-management.md) — estimated and final landed HNL cost feeds for imported shipments.
- [Sales Reporting](sales-reporting.md) — baseline sales data for plan calculation.
- [Store Operations](store-ops.md) — per-company OTB calculation method.

## What's different from RICS

_TODO. Expected: side-by-side plan-vs-actuals in one view; plan revision history with audit; policy flags for plans that significantly diverge from recent actuals._
