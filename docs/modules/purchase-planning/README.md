# Purchase Planning

Saved seasonal buying plans for chain + department. Given historical sales, current stock position, committed open PO quantities, and a merchandise season, compute how many units the buyer should purchase per department for that chain. The plan is saved, adjustable, and auditable; it does not create purchase orders.

**Phase:** V2 saved planning surface.
**RICS chapters:** _none - net-new module, no RICS predecessor_
**Registry:** [`../MODULES.md`](../MODULES.md)

> Independent of `otb-planning`. The two share no tables, routes, or screens.
> Independent of PO entry. Purchasing remains the place where buyers choose vendors/items and enter purchase orders.

## Current Scope

- Grain: `app.store_group` chain + `app.taxonomy_department` department + three-month merchandise season.
- Seasons: Spring Feb-Apr, Summer May-Jul, Fall Aug-Oct, Winter Nov-Jan. `seasonYear` is the year the season starts, so Winter 2026 is Nov 2026-Jan 2027.
- Default forecast: Holt-Winters with monthly seasonality. The v1 ad-hoc methods remain available.
- Constrained-demand forecast: lifts historical months where beginning on-hand was zero or sell-through was at least 30%, then projects from adjusted same-month demand.
- Discount normalization: months with unusually low realized net sales versus reference retail are down-weighted before forecasting.
- Buy math subtracts stock position: on-hand, current/future on-order from `app.inventory_history_snapshot`, and committed native open PO quantities from submitted/confirmed/partially received purchase orders.
- Saved rows keep immutable baseline values and current adjusted values so buyers can compare baseline versus adjusted revision.
- Adjustments require a reason and support percent lift/reduction or absolute department season total override.
- Absolute total overrides distribute back into season months by each month's forecast-demand share.
- Unmapped SKU categories roll into an explicit `Unmapped` department row when present.

## Public API

- `POST /api/v1/purchase-planning/projections` - ad-hoc calculator.
- `POST /api/v1/purchase-planning/plans` - create a saved seasonal plan.
- `GET /api/v1/purchase-planning/plans` - list saved plans.
- `GET /api/v1/purchase-planning/plans/:id` - get plan header, department totals, month rows, and adjustments.
- `POST /api/v1/purchase-planning/plans/:id/recalculate` - rebuild baseline/current rows from current data.
- `POST /api/v1/purchase-planning/plans/:id/adjustments` - apply a reasoned department season adjustment.
- `GET /api/v1/purchase-planning/plans/:id/compare` - compare baseline versus current adjusted totals.
- `POST /api/v1/purchase-planning/plans/:id/archive` - archive a draft plan.

## Matching-Set Bridge

Matching-set purchasing is a Product-owned planning bridge for cases where the buyer must keep coordinated SKUs in ratio, such as suit jackets, pants, and vests. It uses similar replenishment concepts but computes at matching-set role and size grain instead of chain + department grain. It does not replace this broader purchase-planning module.

## Documents In This Module

| File | Purpose |
|---|---|
| [`tech-description.md`](./tech-description.md) | Forward technical description |
| [`decisions.md`](./decisions.md) | Module-scoped design decisions |
| [`rics-module-specs.md`](./rics-module-specs.md) | N/A - no RICS predecessor |
| [`business-functional.md`](./business-functional.md) | Business / functional spec (TBD) |
| [`api.md`](./api.md) | HTTP API contracts (TBD) |
| [`schema.md`](./schema.md) | Postgres schema (TBD) |
| [`tasks.md`](./tasks.md) | Engineering ticket breakdown (TBD) |
