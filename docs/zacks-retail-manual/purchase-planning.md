# N1. Purchase Planning

> **Status:** V2 saved planning surface
> **Module spec:** [../modules/purchase-planning/README.md](../modules/purchase-planning/README.md)
> **RICS ancestry:** none - net-new module
> **Last updated:** 2026-04-30

## What This Module Does

Purchase Planning helps buyers decide how many units to buy for a chain, department, and merchandise season. It creates saved seasonal plans, shows department season totals first, and lets buyers expand into monthly detail.

It does not create purchase orders. Buyers use the plan as the buying target, then choose vendors/items and enter POs in [Purchasing](purchasing.md).

## Planning Grain

- Chain: from `app.store_group` / `app.store_group_member`.
- Department: from `app.taxonomy_department`.
- Season: Spring Feb-Apr, Summer May-Jul, Fall Aug-Oct, Winter Nov-Jan.
- `seasonYear`: the year the season starts. Winter 2026 means Nov 2026-Jan 2027.

Unmapped categories appear in an `Unmapped` department row when present.

## Common Tasks

### Create a seasonal plan

1. Open Purchase Planning.
2. Choose the chain.
3. Choose the season and season year.
4. Select one or more departments.
5. Leave the default Holt-Winters forecast unless the buyer needs a legacy method comparison.
6. Leave discount normalization enabled unless investigating raw promotional history.
7. Save the plan.

The saved plan stores baseline calculated rows and current adjusted rows. The baseline does not change when the buyer applies adjustments.

### Review department totals

The main grid shows one row per department:

- Current on-hand.
- On-order position.
- Projected season sales.
- Baseline buy.
- Current adjusted buy.
- Delta between baseline and current.

Expand a department row to inspect the three monthly rows: projected BOH, projected demand, EOH target, buy, EOH actual, and normalization factor.

### Adjust a department total

1. Click Adjust on the department row.
2. Choose the adjustment type:
   - Absolute season total.
   - Percent lift/reduction.
3. Enter the value.
4. Enter the reason.
5. Save.

Absolute season totals distribute back into months by the forecast-demand share for each month.

## Forecasting And Buy Math

Default forecast method is Holt-Winters with monthly seasonality. The older ad-hoc methods remain available.

Discount-heavy months are down-weighted before forecasting by comparing realized net sales against reference retail value. Rows keep metadata so buyers can see when normalization affected demand.

Buy math subtracts existing stock position:

- On-hand.
- Current and future on-order from inventory snapshots.
- Native open PO residual quantities from submitted, confirmed, and partially received POs.

For future seasons, monthly BOH is projected. The plan starts from the latest current stock position and subtracts forecast demand for the months between the data snapshot and the season start before calculating the first season month.

## Related Modules

- [Purchasing](purchasing.md) - PO entry and receiving.
- [OTB Planning](otb-planning.md) - budget and commitment tracking. Separate from Purchase Planning.
- [Inventory](inventory.md) - stock position input.
- [Sales Reporting](sales-reporting.md) - historical sales input.
