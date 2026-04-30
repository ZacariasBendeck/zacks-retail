# Purchase Planning v2 — Scope & Design Decisions

> 2026-04-30 update: the implemented V2 scope uses saved chain + department seasonal plans, not category-range plans. The current module spec is [`../../modules/purchase-planning/README.md`](../../modules/purchase-planning/README.md).

**Date:** 2026-04-21
**Source:** `/index-knowledge` pass — purchase-planning conversation turn
**Type:** Design decision

## Context

Operator asked to extend the purchase-planning module beyond the v1 read-only forecast calculator to help buyers answer two symmetric questions:

- *"How much do I still need to buy?"*
- *"Where have I already bought too much?"*

The operator specifically redirected away from drafting an "over-buy detection" feature first, instead prioritizing forecasting quality and plan persistence. Surplus-signal work is deferred until the forecasting + persistence layer lands.

## Decision 1 — Chain-scoped plans (not per-store)

Plans are built and budgeted per **chain**, not per individual store. A chain is a group of stores that shares a buying identity.

Known chains as of 2026-04-21:

| Chain | Stores |
|---|---|
| Unlimited | 1–8, 11–15, 26, 28–34 |
| Magic Shoes & Fashion | 10, 16, 17, 20–22, 24, 25, 35, 41–43 |
| TBD #3 | _operator to fill in_ |
| TBD #4 | _operator to fill in_ |

**Assumptions** (correct if wrong):
- A store belongs to exactly one chain (no cross-chain store membership).
- The same SKU can be carried by multiple chains; SKU-level sharing is expected.

See [`../COMPANY.md`](../../COMPANY.md) "Chain structure" for the canonical roster and any future updates.

## Decision 2 — Plans persist in `app.*`

v1 was read-only (no persisted plans). v2 persists. This is the first real use of the `app` schema — the reserved namespace for module-owned additive tables ([`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) "Schemas").

Draft table shapes:

```
app.store_group
  id              uuid PK
  name            text
  slug            text UNIQUE        e.g. 'unlimited', 'magic-shoes'
  kind            text               'chain' | future values
  created_at, updated_at

app.store_group_member
  group_id        uuid FK → store_group
  store_number    int (FK meaning → rics_mirror.store_master.number)
  added_at        timestamptz
  PK (group_id, store_number)

app.purchase_plan
  id              uuid PK
  store_group_id  uuid FK → store_group
  category_min    int
  category_max    int
  fiscal_year     int
  label           text
  status          text   'draft' | 'active' | 'archived'
  forecast_method text
  eoh_method      text
  cover_months    int
  created_by      uuid → public.User
  created_at, updated_at

app.purchase_plan_row
  plan_id         uuid FK → purchase_plan
  dim_key         text                  (category / vendor / sku depending on plan grain)
  year_month      text
  boh             int
  proj_sales      int
  eoh_target      int
  buy             int
  eoh_actual      int
  surplus         int                   (non-negative; non-zero only when raw buy is negative)
  PK (plan_id, dim_key, year_month)

app.purchase_plan_adjustment
  id              uuid PK
  plan_id         uuid FK → purchase_plan
  scope           text    'dimension' | 'cell'
  dim_key         text
  year_month      text NULL              (NULL when scope='dimension')
  kind            text    'lift_factor' | 'vendor_exclude' | 'override_qty'
  value           numeric(10,4)          (0.15 = +15%, -1.0 = exclude, abs qty for override)
  reason          text
  applied_by      uuid → public.User
  applied_at      timestamptz

app.purchase_plan_audit
  id              uuid PK
  plan_id         uuid FK
  action          text    'create' | 'update' | 'archive' | ...
  actor_id        uuid → public.User
  at              timestamptz
  before_jsonb    jsonb
  after_jsonb     jsonb
```

Baseline conventions from [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md): uuid PKs, `created_at`/`updated_at` timestamptz, `numeric(12,2)` for money (none here — qty is int; lift factor is `numeric(10,4)` for fine-grained percentages), no symbols in display, named FKs, `ON DELETE RESTRICT` unless CASCADE specifically wanted.

## Decision 3 — Forecasting upgrade

The existing four methods (`sameMonthLastYear`, `trailingAverage`, `yoyGrowth`, `blendedMultiYear`) are flat numerical aggregators. None models trend + seasonality jointly. Add:

- **Holt-Winters triple exponential smoothing** (monthly seasonality, 12-period) as the new default. Produces a full-year demand curve from ~18+ months of history; handles trend and seasonality together. Classical retail forecasting baseline.
- **Trimmed-mean trailing average** — drops the top/bottom 10% of observations before averaging. Robust to one-off spikes.

The existing four methods stay **pickable per dimension** (category X uses Holt-Winters, vendor Y uses `sameMonthLastYear`). Per-dimension method overrides were considered as a first-class feature but are subsumed by this: set the method per-plan or per-row.

Outlier smoothing and cold-start for new SKUs were explicitly deferred in favor of the two mechanisms above.

## Decision 4 — Discount-distorted history handled via realized-price normalization

Operator raised the concern: big promotional discounts in the past can spike historical qty, which forecasters then project forward as if the spike were organic seasonal demand.

Three levels of fix considered:

| Effort | Approach | Data needed |
|---|---|---|
| Low | Auto-outlier cap — detect months >N× trailing median and cap | existing sales data |
| **Med (chosen for v2)** | **Realized-price normalization — compute avg realized price per month (`extension ÷ qty`), down-weight months where realized price is significantly below list price** | **`rics_mirror.ticket_detail` extension + qty, `rics_mirror.inventory_master` list/retail price** |
| High | Explicit promo flagging — join the RICS price_change ledger and model promo periods separately | depends on RICS price-change tracking quality |

Rationale for Med: captures most of the distortion without the fragility of promo-ledger joins. Low is a strictly-worse subset of Med. High is a research project deferred to v3 if evidence warrants.

## Decision 5 — Lift factors as the manual override layer

Buyer-entered signed % multipliers on top of the mechanical forecast, stored per (plan × dimension × optional month), with a required reason string.

```
final_forecast = smoothed_baseline × (1 + lift_factor)
```

Stored in `app.purchase_plan_adjustment` (kind='lift_factor'). Operator chose this shape over per-dimension method overrides (subsumed by Decision 3's per-plan method selection) and outlier smoothing (subsumed by Decision 4's normalization).

## Decision 6 — On-order fix ships first

Smallest concrete v2 increment: fix [`compute.ts:102`](../../../apps/api/src/services/purchasePlanning/compute.ts#L102) to subtract committed POs from Buy. Current formula:

```ts
const buy = Math.max(0, projSales + eohTarget - runningBoh);  // runningBoh = on-hand only
```

Should be:

```ts
const runningPosition = onHand + currentOnOrder + futureOnOrder;
const buy = Math.max(0, projSales + eohTarget - runningPosition);
```

Data source for on-order: `rics_mirror.inventory_quantities.current_on_order_NN` + `.future_on_order_NN` (wide-column; already summed across segments by other adapters — reuse that pattern).

Ships ahead of the chain/persistence/forecasting work because:
- The current number is demonstrably wrong — plans recommend buying things the buyer has already committed POs for.
- It's a one-line fix plus adapter-level change to pass on-order alongside on-hand.
- It gives the operator immediate trust in the numbers before v2 scaffolding lands.

## Decision 7 — Surplus signal deferred

Exposing raw-buy's negative side as a buyer-visible "over-bought" signal was drafted as the next feature and then pulled from scope. Operator redirected to forecasting quality + persistence as the higher-priority work. When it returns:

- Preserve signed `gap` = `projSales + eohTarget - runningPosition` in the compute output.
- Add `surplus` field to `PlanRow` and `PlanTotals`, non-negative, non-zero only when `gap < 0`.
- Category-level and vendor-level surplus totals drive the "stop buying this category / vendor" alerts the operator described.
- Markdown-candidate drill-down (per-SKU surplus + low-velocity filter) becomes a separate report endpoint.

## Next concrete step

Land Decision 6 (on-order fix) in a standalone commit — no v2 schema required, adapter-only. After that, scaffold the `app.*` tables as a Prisma migration, then add Holt-Winters to `forecast.ts` alongside existing methods.

## Open questions for the operator

1. Two TBD chains — names + store rosters.
2. Cross-chain store membership — confirm assumption (one store → one chain).
3. Plan fiscal window — calendar year vs. retail seasons (Spring/Fall per [`../COMPANY.md`](../../COMPANY.md) "Seasons")?
4. Lift factor unit — percentage (`0.15` = +15%) vs. multiplier (`1.15` = ×1.15)? Percentage is operator-friendlier; multiplier is math-friendlier.

## Related

- Module spec: [`../../modules/purchase-planning.md`](../../modules/purchase-planning.md)
- Company-level chain/category definitions: [`../../COMPANY.md`](../../COMPANY.md)
- Cutover pattern for v1 → v2 changes that hit `rics_mirror`: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) "Phase-A cutover method"
