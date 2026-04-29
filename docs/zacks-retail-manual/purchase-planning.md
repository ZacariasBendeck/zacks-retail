# N1. Purchase Planning

> **Status:** Draft
> **Module spec:** [../modules/purchase-planning.md](../modules/purchase-planning.md)
> **RICS ancestry:** — (net-new module; no RICS predecessor)
> **Last updated:** 2026-04-21

## What this module does

Purchase Planning is a forecast-driven replenishment calculator. Given historical sales and current on-hand, it projects **12 months of recommended buy quantities** per department / category / vendor, using one of four selectable forecast methods (same-month-last-year, trailing average, year-over-year growth %, blended multi-year) and one of two ending-on-hand (EOH) target methods (forward-demand cover, seasonal multiplier). It is **read-only** in v1 — no plans persist. The output is a calculator view that buyers consult to inform PO entry in [Purchasing](purchasing.md).

This module has no RICS predecessor — it was built to answer a question RICS never answered natively (how much should I buy for the next N months) and is independent of [OTB Planning](otb-planning.md), which tracks already-committed spending against a budget.

## Audience

- **Buyers** — primary consumers; compare forecast methods; validate against gut feel.
- **Planners** — second-check calculated quantities before they become POs.
- **Executives** — roll-up views of total forecast spend.

## Prerequisites

- [Sales Reporting](sales-reporting.md) / historical sales depth — at least 13 months of history for trailing-average, more for YoY.
- [Inventory](inventory.md) — current on-hand for the starting point.
- [Products](products.md) — department / category / vendor taxonomy.
- [Store Operations](store-ops.md) — store list.

## Screens

_Intended (v1):_
- _Forecast calculator — pick method + parameters + filters; see 12-month projection_
- _Compare forecast methods side-by-side_
- _Drill into one (department × category × vendor) row to see underlying history_
- _Export the calculated plan to CSV (no persistence to DB in v1)_

## Common tasks

_TODO. Expected flows:_
- _Run a same-month-last-year forecast for next 12 months, one department_
- _Compare trailing-average vs. YoY-growth for the same scope_
- _Adjust the EOH target method and see how the buy quantity changes_
- _Filter to one vendor and export the resulting plan_

### Buy a matching suit set

Use matching-set buying when jackets, pants, vests, and related components share one material story but are purchased and stocked as separate SKUs.

1. Confirm the component SKUs exist for each sellable piece: jacket, pant, vest, and any optional related component.
2. Open Products -> Matching Sets and create or open the set header.
3. Enter the finished-goods vendor, vendor style, shared color, season, chain, sell mode, material code, and exact material description.
4. Add the component SKUs as members and confirm the buying ratio. The normal suit starting point is 1 jacket : 1.2 pants : 0.5 vests.
5. Open the Buying Plan tab and review complete-set capacity, bottleneck role, and orphan units before adding more inventory.
6. Choose receipt month, planning horizon, and target cover weeks, then recalculate the plan.
7. Review role and size recommendations. The plan should correct shortages without creating excess jackets, pants, or vests above the set ratio.
8. Review the OTB preview. If proposed cost exceeds the plan, reduce quantities, move the receipt month, or follow the override policy.
9. Save the buying plan and create a PO worksheet. The worksheet creates normal PO lines for the component SKUs, not a fake bundle SKU.
10. After receipt, re-run the set balance before reorders so the next buy restores the sellable proportion.

Exact fabric identity belongs on the matching-set material fields. Broad classifications such as fabric family or fabric weight bucket may be SKU attributes. If exact material text includes a fabric weight such as GSM or ounces, the application may suggest a controlled weight bucket for the component SKUs, but the exact source text remains on the matching set.

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| 12-Month Buy Plan | — | Department, category, vendor, store, method, EOH target | CSV / XLSX |
| Method Comparison | — | Same as above | CSV |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources

- **Primary read:** `rics_mirror` ticket + inventory tables (sales history + on-hand).
- **Primary write:** none in v1 (read-only calculator).
- **Future versions** could persist plans to `app.purchase_planning_plan` + `app.purchase_planning_line`.

## Related modules

- [Purchasing](purchasing.md) — v1 is **independent** of purchasing, but the operator may copy-paste calculator output into manual PO entry. A future integration could pre-fill PO lines.
- [OTB Planning](otb-planning.md) — **distinct from** OTB. OTB tracks what you've committed against a budget; Purchase Planning projects what you should commit going forward. The two may cross-reference but do not share data.
- [Inventory](inventory.md) — on-hand is a calculator input.
- [Sales Reporting](sales-reporting.md) — sales history is the main calculator input.

## What's different from RICS

Everything — this module has **no RICS equivalent**. It codifies planning logic from four Python scripts (`presupuesto_compras*.py`) that lived outside RICS. The manual chapter for this module is fully Zack's Retail's own authority.
