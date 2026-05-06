# Design: Inventory History (`InvHis`) Promotion and Ownership

**Date:** 2026-04-25  
**Module:** `inventory` with `sales-reporting` consumers  
**Status:** approved for first implementation slice  
**Primary sources:** [docs/modules/inventory.md](../../modules/inventory.md), [docs/modules/sales-reporting.md](../../modules/sales-reporting.md), [docs/dev/specs/2026-04-18-sales-history-by-month-design.md](./2026-04-18-sales-history-by-month-design.md), [docs/dev/specs/2026-04-24-inventory-stock-maintenance-migration-map.md](./2026-04-24-inventory-stock-maintenance-migration-map.md)

## Why this exists

`RIINVHIS.MDB / InvHis` is one of the key derived RICS tables. It is not a raw ledger. It is the ready-to-publish `(SKU, Store)` inventory-history cube that RICS uses for sales reporting, ROI, Turns, on-hand history, and related KPI screens.

Zack's Retail needs an owned Postgres replacement for this surface because:

- `rics_mirror` is retired and must not be reintroduced.
- request-path reporting code still has one stale dependency on mirror-era `inv_his` data.
- `InvHis` is the parity source for inventory-backed sales reporting today, and the long-term target for rebuilding the same behavior from owned facts.

## Discovery summary

Live probe against `E:/data/rics-mdbs/RIINVHIS.MDB` on 2026-04-25 found:

- table: `InvHis`
- row count: `1,918,492`
- width: `160` columns
- grain: one row per `(SKU, Store)`

The column families are:

1. current inventory state
   - `OnHand`, `CurrentOnOrder`, `FutureOnOrder`, `Model`, `AverageCost`
   - `DateLastReceived`, `DateFirstRec`
2. current-period sales rollups
   - week / month / season / year quantity, sales, profit, markdown
3. closed monthly history
   - `LYMonthQtySales_*`, `LYMonthDolSales_*`, `LYMonthProfit_*`
   - `LYMonthQtyOH_*`, `LYMonthOnHand_*`
   - `LastMonthOnHand`, `LastSeasonOnHand`, `LastYearOnHand`
   - `LYSeason*`, `LYYear*`
4. trend state
   - `TrendBeginOH_*`, `TrendOHConstant_*`, `TrendSales_*`, `TrendWk8BegOH`
5. movement summary buckets
   - `RMSARec*`, `RMSARet*`, `RMSATranIn*`, `RMSATranOut*`, `RMSAPhyInv*`, `RMSABegDol_*`
6. pricing context
   - `RetailPrice`, `MarkDownPrice1`, `MarkDownPrice2`, `CurrentPrice`, `Perks`, `LastPriceChange`

## Important parity findings

- The monthly sales arrays are already proven to line up with the Sales History by Month report. See [2026-04-18-sales-history-by-month-design.md](./2026-04-18-sales-history-by-month-design.md).
- `CurrentPrice` is a price-slot code, not an amount. Current customer data uses values `1`, `2`, and `3`.
- `LYMonthQtyOH_*` and `LYMonthOnHand_*` are not a trivial `qty x current AverageCost` recomputation. A 2026-04-25 probe found `110,027` rows where at least one `LYMonthQtyOH_* <> 0` while the matching `LYMonthOnHand_* = 0`.
- A May 1 before/after month-close comparison refined the close rule for the newly closed month slot: `LYMonthQtySales_MM`, `LYMonthDolSales_MM`, and `LYMonthProfit_MM` receive the current month counters and those current month counters reset to zero; `LastMonthOnHand` advances to current `OnHand`; the new `LYMonthQtyOH_MM` value follows the pre-close `LastMonthOnHand`; the new `LYMonthOnHand_MM` value follows ending `OnHand x AverageCost` in the sampled rows.

Implication:

- Zack's Retail must preserve the imported `LYMonthOnHand_*` values exactly during the direct-CSV-import stage.
- The later projector that derives `inventory_history` from owned facts needs a separate reverse-engineering pass for `LYMonthOnHand_*` before it can claim exact parity.

## Decision

Promote `inv_his.csv` into owned Postgres tables in `app.*` now.

The first implementation slice has two goals:

1. remove the request-path dependency on `rics_mirror.inv_his`
2. preserve the full legacy `InvHis` payload in normalized owned tables so parity work can continue without MDB reads

## Owned Postgres shape

### 1. `app.inventory_history_snapshot`

One current row per `(store_id, sku_code)`.

Stores the scalar fields:

- identity / provenance
  - `sku_id` nullable FK to `app.sku`
  - `sku_code`
  - `store_id`
  - `source`
  - `source_run_id`
  - `snapshot_as_of`
- current state
  - `average_cost`
  - `on_hand`
  - `current_on_order`
  - `future_on_order`
  - `model_qty`
- current-period totals
  - week / month / season / year quantity, sales, profit, markdown
- prior-period totals
  - `ly_season_*`, `ly_year_*`
  - `last_month_on_hand`, `last_season_on_hand`, `last_year_on_hand`
  - `last_month_inv_value`, `season_inv_value`, `year_inv_value`
- pricing / timing context
  - `last_month_retail`
  - `retail_price`
  - `mark_down_price_1`
  - `mark_down_price_2`
  - `current_price_slot_raw`
  - `current_price_slot`
  - `perks`
  - `date_first_received`
  - `date_last_received`
  - `last_price_change_at`
  - `source_date_last_changed`
- trend scalar
  - `trend_week_8_begin_on_hand`

### 2. `app.inventory_history_month`

Twelve child rows per snapshot, one per calendar-month slot.

Stores:

- `slot_number` `1..12`
- `calendar_month` `1..12`
- `stored_year`
- `year_month`
- `qty_sales`
- `net_sales`
- `profit`
- `qty_on_hand`
- `inventory_value`

This is the table Sales History by Month should read for:

- beginning on hand
- average inventory value
- ROI
- Turns

### 3. `app.inventory_history_trend_week`

Seven child rows per snapshot for the `Trend*` families:

- `begin_on_hand`
- `on_hand_constant`
- `sales`

### 4. `app.inventory_history_movement_bucket`

Three child rows per snapshot for the `RMSA*` families:

- receipts quantity / value
- returns quantity / value
- transfer-in quantity / value
- transfer-out quantity / value
- physical-inventory quantity / value
- beginning inventory value

## Why normalized child tables instead of 160 scalar columns

- reporting code can query month data directly by `year_month`
- later projector jobs can update one month or one bucket family without rewriting the whole row
- reconciliation can compare family-by-family instead of managing very wide SQL
- the owned surface still preserves exact legacy content without rebuilding a raw mirror schema

## Rollout model

### Stage A: direct CSV import parity

During current rehearsals:

- `inv_his.csv` is imported into the owned `app.inventory_history_*` tables
- request-path readers use those owned tables
- `InvHis` remains the parity oracle for inventory-backed reporting

### Stage B: owned projector parity

After the promotion is stable, add projector jobs that rebuild the same tables from owned facts:

- `app.stock_movement`
- `app.stock_level`
- `app.replenishment_target`
- sales transaction facts
- purchasing / on-order facts
- price / cost state on `app.sku` and related tables

At that stage, imported `InvHis` and projected `inventory_history_*` are reconciled side by side until the deltas are understood and accepted.

### Stage C: Postgres-only operation

After cutover:

- the imported CSV baseline disappears
- the projector becomes the only writer
- request-path readers continue to use the same owned `app.inventory_history_*` tables

## Update plan for the owned projector

### Event-driven updates

These facts should update the current snapshot row immediately:

- sales / returns
- receipts
- transfers
- physical-count adjustments
- manual returns
- price changes
- changes to on-order state
- model / replenishment edits

Immediate updates maintain:

- current on-hand state
- current on-order fields
- average cost
- current week / month / season / year counters
- current pricing context

### Boundary close jobs

Some `InvHis` semantics are month- or period-close behaviors and should not be computed only from ad hoc read-time SQL.

Required close jobs:

1. week close
   - rotate `TrendBeginOH_*`, `TrendOHConstant_*`, `TrendSales_*`
   - set `TrendWk8BegOH`
   - implemented in `apps/api/src/services/inventoryWeekCloseService.ts`
   - writes the just-finished week into slot 7, shifts old slots 2..7 into 1..6, and resets only the weekly counters
2. month close
   - write the completed month into the matching `inventory_history_month` calendar slot
   - move current month quantity, dollar sales, and profit into that slot
   - set slot `qty_on_hand` from the pre-close `last_month_on_hand`
   - set slot `inventory_value` from ending `on_hand x average_cost` when cost exists
   - update `last_month_on_hand` to current `on_hand`
   - reset only the current month counters; week, season, and year counters are separate closes
   - preserve the exact `stored_year` and `year_month` mapping used by RICS
3. season close
   - update `LYSeason*`
   - update `LastSeasonOnHand`
4. year close
   - update `LYYear*`
   - update `LastYearOnHand`

### Deterministic full rebuild

We also need a repeatable rebuild job that recomputes the owned tables from source facts. This is mandatory for rehearsal cycles and for catching drift in the event-driven projector.

The rebuild must support:

- single-store rebuild
- full-catalog rebuild
- parity compare against imported `inv_his.csv`

## Reconciliation contract

Before we can call the projector parity-complete, we need the following checks:

1. row count and key match
   - `(store_id, sku_code)` set matches imported `InvHis`
2. current-state reconciliation
   - `OnHand`, `CurrentOnOrder`, `FutureOnOrder`, `Model`, `AverageCost`
3. month-array reconciliation
   - `qty_sales`, `net_sales`, `profit`, `qty_on_hand`, `inventory_value`
4. price-context reconciliation
   - retail / markdown prices, slot code, perks, last price change
5. trend reconciliation
   - all seven `Trend*` slots plus `TrendWk8BegOH`
6. RMSA reconciliation
   - all three movement-summary buckets

Hard caution:

- `inventory_value` must be compared against imported `LYMonthOnHand_*`, not re-derived from current cost, until the legacy rule is fully proven.

## Read-path contract

`sales-reporting` should no longer query `rics_mirror.inv_his`.

Instead:

- `queryMonthlyInventoryHistory()` reads `app.inventory_history_snapshot` and `app.inventory_history_month`
- the adapter continues returning the same facade-facing shape
- the adapter should prefer `snapshot_as_of` over wall-clock `today` when mapping the rolling 12 slots to concrete `year_month` values

## Related derived RICS tables

`InvHis` is not the only derived table in the legacy estate. Other notable derived or copied surfaces are:

- `RIINVQUA.MDB / Inventory Quantities`
  - stock / replenishment projection from movements and purchasing state
- `RIOTB.MDB / Open To Buy`
  - planning matrix derived from sales and budget inputs
- `RISLSPSN.MDB / SalespeopleSales`
  - salesperson summary cube derived from ticket activity and hours
- `RIMAILED.MDB / Mail Ticket Detail`, `Mail Purch Detail`, `Mail Tender Detail`
  - customer-indexed transaction derivatives
- `FR.MDB`, `RIINVPOS.MDB`, `RIUPLMAI.MDB`, `RIUPLSAL.MDB`, `RIUPLTRN.MDB`
  - transport or shadow caches, not primary facts
- `riprclog.mdb`, `RIDELETE.MDB`, `RIJHIST.MDB`
  - audit or log derivatives

The general RICS pattern is:

- base ledgers and masters
- projection tables for workflows
- reporting cubes for fast operator screens

Zack's Retail should keep the same separation:

- owned facts underneath
- owned parity projections above

## First implementation slice

Ship now:

1. Prisma schema + SQL migration for the four owned `inventory_history_*` tables
2. CSV-artifact importer for `inv_his.csv`
3. optional mirror-compatible sync entrypoint for legacy dev environments
4. sales-reporting adapter cutover from `rics_mirror.inv_his` to the owned tables

Defer until the next pass:

- event-driven projector from owned facts
- week / month / season / year close jobs
- broader reverse-engineering of historical `LYMonthOnHand_*` exceptions
- request paths beyond Sales History by Month that still need inventory-history parity

## Open questions

1. exact generation rule for older imported `LYMonthOnHand_*` values when `LYMonthQtyOH_* > 0` but value is zero
2. exact semantic meaning of `TrendOHConstant_*`
3. exact business labeling of the three `RMSA` buckets
4. whether season rollover uses a store-level or global season calendar in practice

These do not block the import-backed first slice. They do block calling the later projector "exactly like RICS" without qualification.
