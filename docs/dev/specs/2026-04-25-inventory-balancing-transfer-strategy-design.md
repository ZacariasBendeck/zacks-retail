# Design: Inventory Balancing Transfer Strategy

**Date:** 2026-04-25
**Module:** `inventory`
**Rollout stage:** Development Against Direct CSV Imports
**Purpose:** replace the current single-metric balancing-transfer heuristic with a transfer policy that protects size curves, prioritizes real stockout risk, and stays explainable enough for operators to trust.

## Why this exists

The inventory module already preserves the RICS balancing-transfer surface:

- [docs/modules/inventory/rics-module-specs.md](../../modules/inventory/rics-module-specs.md)

That surface is necessary for lineage back to RICS Ch. 4 p. 77, but it is not enough to define a good modern allocation policy for a shoe chain.

Today the live preview engine in:

- [apps/api/src/services/transferRunService.ts](../../../apps/api/src/services/transferRunService.ts)

primarily does this:

- ranks stores on a single metric (`ROI`, `Turns`, or `Sell-Thru`),
- walks size cells one by one,
- moves units opportunistically from lower-ranked stores to higher-ranked stores,
- applies the "doubles" and "strip skeleton stock" flags as extra passes.

That gets the basic RICS mechanics on screen, but it is not the right decision model for retail footwear. Shoes are not just "inventory by SKU"; they are size curves. The system must protect donor stores from becoming broken, must prioritize missing core sizes over abstract ranking, and must avoid churn where units bounce between stores without materially improving sell-through.

This spec defines the canonical balancing-transfer strategy going forward.

Implementation and coexistence plan:

- [docs/dev/specs/2026-04-25-transfer-run-service-v2-refactor-plan.md](2026-04-25-transfer-run-service-v2-refactor-plan.md)

Implementation note: this strategy should land as **balancing transfer v2** alongside the existing legacy balancing engine, not as an in-place replacement.

## Source requirements

Primary contract:

- [docs/modules/inventory/rics-module-specs.md](../../modules/inventory/rics-module-specs.md)

Relevant ancestry:

- RICS v7.7 Ch. 4 p. 77 "Generate Balancing Transfers"
- RICS v7.7 Ch. 4 p. 79 "Recommended Transfer Report"

Related module contracts:

- `inventory` owns on-hand, transfers, replenishment targets, and balancing-run previews
- `sales-reporting` or another app-owned reporting surface supplies store and chain demand history
- `store-ops` supplies store metadata, transfer-capable flags, peer groups, and route/friction hints
- `products` supplies size type, price/cost, style-color, vendor, and markdown status
- `purchasing` supplies confirmed inbound supply that should suppress unnecessary transfers

The runtime path for this design must remain Postgres-only for new development. No request-path MDB reads and no new `rics_mirror` dependencies are allowed.

## Decision

Zack's Retail keeps the RICS-facing balancing-transfer options for parity, but the internal decision engine changes materially.

The new engine is based on five rules:

1. Protect the donor before helping the receiver.
2. Prioritize missing core sizes and broken size curves before general "better store vs worse store" balancing.
3. Transfer only when the receiver has real service risk or a justified presentation need.
4. Treat `ROI`, `Turns`, and `Sell-Thru` as supporting signals and tie-breakers, not the primary trigger.
5. Keep the preview mandatory and fully explainable.

The engine runs in ordered passes:

1. Eligibility and blocker pass
2. Emergency service-rescue pass
3. Size-curve repair pass
4. Coverage / model rebalance pass
5. Optional downward-share pass
6. Optional skeleton-consolidation pass

The preview must label each proposed line with the pass that produced it and the business reason behind it.

## Non-goals

- A black-box optimizer that operators cannot reason about
- A mathematically perfect chainwide allocation solver
- Replacing warehouse-driven Automatic Transfers
- Writing anything back to RICS MDB files
- Letting balancing transfers invent assortment decisions for stores that should not carry a style

## Operator workflow

Balancing transfers should not be one ambiguous batch job. Operators need distinct workflows with distinct intent.

### 1. Daily service rescue

Use when a store is missing key sizes right now.

Typical cadence:

- daily, or multiple times per week during peak selling periods

Primary goal:

- prevent missed sales caused by zero-on-hand in high-demand sizes

Default behavior:

- narrow scope
- prioritize core sizes
- move only enough to restore service
- no skeleton stripping

### 2. Weekly size-curve rebalance

Use when the chain has stock, but the size distribution is wrong across stores.

Typical cadence:

- weekly

Primary goal:

- improve size-curve health while keeping donors viable

Default behavior:

- repair broken runs
- then rebalance to target cover / model
- allow broader scope than daily rescue

### 3. Seasonal pullback / consolidation

Use when a style is tailing off, on markdown, or stores have stranded odd sizes.

Typical cadence:

- monthly, end-of-season, or by buyer decision

Primary goal:

- reduce stranded inventory and concentrate sellable stock in the best exit doors

Default behavior:

- consolidation is explicit and highly reviewable
- markdown and exit economics matter more
- donor protection still applies, but presentation targets may be relaxed

## Core principles

### Protect the donor

The engine must never create a new problem in the donor store just to solve one in the receiver. A donor can give stock only above its protected floor.

### Preserve the size curve

A shoe style is healthy when the store has a believable run of sizes, not just a raw unit count. The engine must prefer moves that repair missing sizes over moves that simply increase units at already-deep stores.

### Prioritize true stockout risk

The highest-priority transfer is not "the store with the best ROI." It is "the store that is about to miss a sale in a size it demonstrably needs."

### Use sales metrics as evidence, not authority

`ROI`, `Turns`, and `Sell-Thru` help decide between otherwise viable options. They should not force movement where the receiver has little demand or where the donor would be broken by the transfer.

### Avoid churn

Recently transferred or recently received units should not bounce again immediately. Balancing should be sticky enough to be operationally sane.

### Explain every line

Every proposed transfer line must be readable in plain language:

- what problem exists at the receiver
- why this donor was chosen
- what floor remains at the donor after the move

## Required inputs

The engine needs these inputs per `(sku, store, column, row)` or a documented fallback:

- current on hand
- reserved / committed quantity
- confirmed inbound quantity inside the lookahead window
- open in-transit transfers
- replenishment targets (`model`, `max`, `reorder`)
- recent sales history
- style-level and chain-level size curves
- current retail / markdown state
- current cost and expected gross margin
- store metadata:
  - transfer-capable
  - peer cluster / comparable-store group
  - route or friction bucket
  - assortment eligibility for the style when applicable

If a required signal is missing, the engine must degrade safely:

- fall back to model + presentation logic
- mark the preview line or run as lower confidence
- avoid discretionary low-value moves

It must not reach into legacy MDB files or unsupported schemas at request time.

## Derived concepts

### Effective available quantity

```text
effectiveAvailableQty = onHandQty - reservedQty + confirmedInboundQtyWithinLookahead
```

Open inbound that is already expected shortly should suppress unnecessary transfers. Unconfirmed or low-confidence inbound should not.

### Core-size flag

A size is "core" when it represents a material share of expected demand for the style or for the style's fallback curve.

Default derivation:

1. use same-style chainwide size share if the style has enough history
2. otherwise use category / size-type size share
3. mark as core the sizes that make up the top cumulative demand band for the curve

The exact cumulative threshold can be configured, but the core/non-core distinction must exist because missing a core size is more harmful than missing a fringe size.

### Presentation floor

The minimum quantity needed so a store can plausibly carry that size.

Default rule:

- `0` for sizes the store should not carry
- `1` for carried sizes with low presentation expectation
- greater than `1` only for clearly justified high-velocity core sizes

### Service floor

The quantity needed to cover expected demand through the next replenishment chance plus safety.

```text
serviceFloorQty = ceil(forecastDailyQty * protectDays + safetyStockQty)
```

### Target quantity

The receiver's target is the greatest of:

- presentation floor
- service floor
- model-driven floor when the run is model-aware

```text
targetQty = max(presentationFloorQty, serviceFloorQty, modelFloorQty)
needQty = max(0, targetQty - effectiveAvailableQty)
```

### Protected donor floor

The donor's protected floor is the quantity below which it may not give.

```text
donorProtectQty = max(donorPresentationFloorQty, donorServiceFloorQty, donorModelFloorQty)
spareQty = max(0, effectiveAvailableQty - donorProtectQty)
```

If `spareQty <= 0`, the donor is not eligible for that size.

## Demand model

The engine should forecast expected demand with a blended fallback chain, not a single raw metric.

Preferred order:

1. same `SKU x size x store` recent sales
2. same `SKU x store` sales distributed by the style's size curve
3. same `SKU x size` sales in comparable stores
4. chainwide style or category curve fallback

Default starting blend:

- exact `SKU x size x store`: 50%
- same `SKU x store`, size-curve distributed: 25%
- comparable-store `SKU x size`: 15%
- chainwide fallback curve: 10%

The weights are tunable, but the fallback order is part of the contract.

The engine should use a recency-weighted trailing window, not a naive year aggregate, because footwear demand shifts by season, markdown state, and local sell-through.

## Decision passes

### Pass 0: eligibility and blockers

Do not consider a transfer line if any of these are true:

- source or destination store is not transfer-capable
- size is negative on hand in the source store
- the receiver is not meant to carry the style / size
- a recent physical-inventory discrepancy marks the cell as untrusted
- a recent transfer or receipt places the cell inside cooldown
- a confirmed inbound receipt already satisfies the receiver's need
- the quantity would push the donor below its protected floor

Blocked lines still belong in preview as exceptions so operators can see why nothing happened.

### Pass 1: emergency service rescue

This is the highest-priority pass.

Trigger:

- the receiver is zero or critically low in a core size
- the receiver has demonstrated demand for that style / size
- at least one donor has genuine spare

Behavior:

- fill the missing size before doing any broader balancing
- move the minimum quantity needed to restore service, usually one unit first
- prefer donors that:
  - remain healthiest after the move
  - are in the same peer cluster or lower-friction route
  - do not break their own core-size curve

This pass exists because "store with the best metric" is not the real emergency. "Store with a dead core size and live demand" is.

### Pass 2: size-curve repair

This pass repairs stores that have the style but have an unhealthy run of sizes.

Trigger examples:

- a store has adjacent sizes but is missing a core middle size
- a store has enough total units but a visibly broken selling curve
- a donor has over-concentration in the same size

Behavior:

- prioritize moves that increase size-curve completeness
- penalize moves that simply pile deeper into already-healthy sizes
- do not repair the receiver by creating a new broken run at the donor

This pass is especially important for footwear because a style with plenty of units can still be unsellable if the curve is broken.

### Pass 3: coverage / model rebalance

Once urgent service gaps and broken curves are handled, the engine can rebalance broader coverage.

Trigger:

- receiver still sits below its target quantity
- donor still has spare

Behavior:

- transfer up to the receiver's remaining `needQty`
- respect model floors when the method is model-aware
- use `ROI`, `Turns`, or `Sell-Thru` only as secondary ordering once need and spare have already been established

This is the pass that most closely resembles legacy balancing, but it happens after the more retail-correct rescue and curve passes.

### Pass 4: optional downward-share ("transfer doubles to lower-priority stores")

This is the legacy "share one extra unit downward" behavior, but it should be constrained.

Rules:

- execute only after passes 1-3
- donor must still have at least one unit of true spare after the proposed move
- receiver must have evidence it can sell the size, or at minimum be eligible to carry it
- do not use this pass to scatter units into low-confidence stores just because they are zero

This is a low-priority fill pass, not a substitute for real balancing logic.

### Pass 5: optional skeleton consolidation ("strip stores below N sizes")

This should be treated as a separate operational intent even if the UI keeps it as a flag.

Rules:

- default off
- preview lines must be grouped separately and labeled as consolidation, not rescue
- run only after the rescue / repair / rebalance passes
- never strip a store that still has meaningful local demand for the style
- never strip into a receiver that would not actually improve exit probability

The system must not mix "save lost sales" and "clean up skeleton stock" into one opaque bucket.

## Candidate ranking

When multiple receivers or donors are eligible, use deterministic ordering based on business impact.

Receiver priority:

1. core-size stockout with demonstrated demand
2. broken-run repair
3. below target cover / below model
4. optional downward-share fill
5. optional consolidation destination

Donor priority:

1. lowest donor pain after the move
2. lowest route friction
3. strongest remaining size-curve health
4. oldest excess stock / highest overexposure
5. lower store id as final deterministic tie-break

`ROI`, `Turns`, and `Sell-Thru` fit inside this process as secondary evidence when two candidate receivers or donors are otherwise similar.

## Legacy control mapping

The RICS-facing controls remain, but their meaning changes slightly.

### Balancing method

`OVER_UNDER_MODELS`

- only SKUs with models participate
- model floor is part of target and donor protection
- rescue and curve-repair passes still run first

`WITHOUT_MODELS`

- only SKUs without models participate
- target is derived from demand, presentation, and curve logic

`WITHOUT_CONSIDERING_MODELS`

- all eligible SKUs may participate
- model quantities do not force target or donor protection
- demand and curve logic still apply

### Performance metric

`ROI`, `Turns`, and `Sell-Thru` remain selectable for lineage and operator familiarity, but they are no longer the top-level decision trigger.

Recommended meaning:

- `Sell-Thru`: best default for seasonal / fashion balancing
- `Turns`: best default for repeat / basic styles
- `ROI`: useful when margin mix should influence discretionary moves

### Tie-break kind and value

The tie-break setting remains available, but it should only gate discretionary moves where stores are otherwise close enough to compare on the chosen metric.

It must not block an emergency core-size rescue, and it must not cause a move where need / spare logic says no.

## Preview requirements

Preview is mandatory and must be richer than the current journal.

Each proposed line should expose:

- decision pass:
  - `SERVICE_RESCUE`
  - `CURVE_REPAIR`
  - `COVERAGE_REBALANCE`
  - `DOWNWARD_SHARE`
  - `SKELETON_CONSOLIDATION`
- plain-language reason
- receiver need before and after
- donor spare before and after
- receiver and donor cover before and after
- core-size flag
- model qty where relevant
- confidence level for the demand estimate
- route / friction bucket when available
- expected gross-margin benefit or an explicit note that the move is service-protective

Exceptions should also be explicit:

- negative on hand
- cooldown
- receiver not eligible
- inbound already covers the need
- donor would be broken
- low-confidence demand signal

Operators should be able to review the preview by pass so they can approve rescue lines without accidentally approving aggressive consolidation.

## API and model implications

The current request shape can stay mostly intact, but the preview record needs more structure.

Recommended additions to the balancing preview line:

```ts
interface BalancingTransferDecisionContext {
  decisionPass:
    | 'SERVICE_RESCUE'
    | 'CURVE_REPAIR'
    | 'COVERAGE_REBALANCE'
    | 'DOWNWARD_SHARE'
    | 'SKELETON_CONSOLIDATION'
  reasonCode:
    | 'CORE_SIZE_STOCKOUT'
    | 'BROKEN_CURVE'
    | 'UNDER_TARGET_COVER'
    | 'UNDER_MODEL'
    | 'DOWNWARD_FILL'
    | 'SKELETON_PULLBACK'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  coreSize: boolean
  receiverNeedQtyBefore: number
  receiverNeedQtyAfter: number
  donorSpareQtyBefore: number
  donorSpareQtyAfter: number
  receiverCoverDaysBefore: number | null
  receiverCoverDaysAfter: number | null
  donorCoverDaysBefore: number | null
  donorCoverDaysAfter: number | null
  routeBucket: string | null
  expectedMarginRecovered: number | null
}
```

Recommended additions to run setup:

- `goalPreset?: 'DAILY_RESCUE' | 'WEEKLY_BALANCE' | 'SEASONAL_CONSOLIDATION'`
- `allowLowConfidenceMoves?: boolean`
- `cooldownDays?: number`
- `protectDaysOverride?: number | null`

The existing RICS-surface controls remain, but a preset should be allowed to tune thresholds and defaults.

## Implementation notes

The current code in:

- [apps/api/src/services/transferRunService.ts](../../../apps/api/src/services/transferRunService.ts)

should be refactored so that balancing preview generation is broken into explicit passes rather than one metric-first loop.

Recommended decomposition:

1. load raw facts
2. derive forecast and curve facts
3. compute per-cell `need` and `spare`
4. run passes in order
5. emit preview lines with full decision context
6. commit exactly what was previewed

The preview and commit contract remains mandatory-preview then explicit-commit, consistent with the inventory module contract.

## Acceptance criteria

The design is correct when these scenarios behave predictably:

1. A store missing a core size with live demand gets help before a higher-metric store that is merely low on depth.
2. A donor is never drained below its own protected floor.
3. A move that repairs a broken size curve outranks a move that only deepens an already-healthy size.
4. A store with no credible demand does not receive discretionary units just because it is zero.
5. Downward-share moves happen only after urgent rescue and rebalance needs are satisfied.
6. Skeleton consolidation is clearly separated from rescue logic in the preview.
7. Confirmed inbound stock suppresses unnecessary inter-store moves.
8. Recently moved inventory does not bounce again during cooldown.
9. Low-confidence demand estimates are visibly labeled and can be suppressed.
10. Preview-to-commit remains deterministic and auditable.

## Verification against RICS and operator practice

For parity and cutover confidence:

- preserve the RICS-facing balancing methods and filters
- compare the new preview against RICS behavior on rehearsal data
- review mismatches with buyers and store operators, not just developers
- accept intentional differences only when they improve explainability and service outcomes without violating the governed module contract

The point is not to copy every RICS transfer blindly. The point is to produce a balancing workflow that can run the business better while still tracing cleanly back to the legacy surface.
