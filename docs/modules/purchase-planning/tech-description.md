# purchase-planning

> Net-new module with no RICS predecessor. `purchase-planning` is independent of `otb-planning`, which tracks budget/commitment gates, and independent of PO entry, which remains in Purchasing.

## Goal

Create saved seasonal plans that answer: how many units should the buyer purchase for a chain, department, and merchandise season?

The V2 grain is chain + department + season:

- Chain source of truth: `app.store_group` and `app.store_group_member`.
- Department source of truth: `app.taxonomy_department`.
- Category-to-department mapping: `beg_categ` through `end_categ`.
- Unmapped categories are reported as an explicit `Unmapped` department row.

## Seasons

| Season | Months |
|---|---|
| Spring | Feb-Apr |
| Summer | May-Jul |
| Fall | Aug-Oct |
| Winter | Nov-Jan |

`seasonYear` is the year the season starts. Winter 2026 is November 2026 through January 2027.

## Core Formula

For each department/month:

```text
stock_position = on_hand + current_on_order + future_on_order + native_open_po
buy(M) = max(0, proj_sales(M) + eoh_target(M) - running_boh(M))
running_boh(first month) = stock_position
eoh_actual(M) = running_boh(M) + buy(M) - proj_sales(M)
running_boh(next month) = eoh_actual(M)
```

On-order inputs:

- `app.inventory_history_snapshot.on_hand`
- `app.inventory_history_snapshot.current_on_order`
- `app.inventory_history_snapshot.future_on_order`
- Native open PO residuals from `app.purchase_order` and `app.purchase_order_line` for statuses `SUBMITTED`, `CONFIRMED`, and `PARTIALLY_RECEIVED`.

## Forecasting

Default method: `holtWinters`, additive Holt-Winters with monthly seasonality and a trailing-data fallback.

Available methods:

| Method | Notes |
|---|---|
| `holtWinters` | Default. Monthly seasonality, trend, fallback for short history. |
| `sameMonthLastYear` | Same calendar month in prior year. |
| `trailingAverage` | Average over `trailingMonths`. |
| `yoyGrowth` | Same month last year multiplied by `1 + growthPct / 100`. |
| `blendedMultiYear` | Average same month over 2 or 3 years when available. |

Before forecasting, optional discount normalization down-weights history months whose realized net sales are materially below reference retail value. The saved rows keep `normalizationFactor` and `rawProjSales` so the UI can show where normalization affected demand.

## Persistence

Migration: `apps/api/prisma/migrations/20260430213000_purchase_planning_v2/migration.sql`

Tables:

- `app.purchase_plan` - saved plan header and calculation settings.
- `app.purchase_plan_row` - baseline and current adjusted department-month rows.
- `app.purchase_plan_adjustment` - reasoned adjustment records plus before/after row snapshots.
- `app.purchase_plan_audit` - create, recalculate, archive, and adjustment audit events.

Rows store both immutable baseline values and current values:

- Baseline: `baseline_boh`, `baseline_proj_sales`, `baseline_eoh_target`, `baseline_buy`, `baseline_eoh_actual`.
- Current: `current_boh`, `current_proj_sales`, `current_eoh_target`, `current_buy`, `current_eoh_actual`.

For future seasons, the first season month BOH is projected from the latest available inventory snapshot. The calculation starts with current stock position, including known on-order/open PO quantities, then subtracts forecast demand for bridge months before the season begins.

## Adjustments

Supported adjustment kinds:

- `percent_lift`: signed percent applied to the department season total.
- `absolute_total`: replaces the department season total.

All adjustments require a non-empty reason. Absolute total overrides distribute back into the season months by each month's current forecast-demand share. If projected demand is zero, distribution falls back to current buy share, then even distribution.

## API

The V1 ad-hoc endpoint remains:

- `POST /api/v1/purchase-planning/projections`

Saved-plan endpoints:

- `POST /api/v1/purchase-planning/plans`
- `GET /api/v1/purchase-planning/plans`
- `GET /api/v1/purchase-planning/plans/:id`
- `POST /api/v1/purchase-planning/plans/:id/recalculate`
- `POST /api/v1/purchase-planning/plans/:id/adjustments`
- `GET /api/v1/purchase-planning/plans/:id/compare`
- `POST /api/v1/purchase-planning/plans/:id/archive`

## UI

Route: `/purchase-planning`

The page creates and opens saved plans. The main grid is total-first:

- One department row per selected department, plus `Unmapped` when data exists.
- Season totals first: projected sales, baseline buy, current buy, delta.
- Expand a department row to inspect monthly projected BOH, projected demand, target EOH, buy, EOH, and normalization factor.
- Adjustment modal applies percent or absolute department season total changes with a required reason.

## Out Of Scope

- Creating POs, draft PO worksheets, or vendor/SKU recommendations.
- Size-level purchase planning.
- OTB budget gates.
- Webstore integration.
- Transfer recommendations.
