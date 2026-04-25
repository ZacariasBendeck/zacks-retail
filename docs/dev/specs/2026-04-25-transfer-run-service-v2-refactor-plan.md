# Transfer Run Service v2 Refactor Plan

**Date:** 2026-04-25
**Module:** `inventory`
**Purpose:** introduce a new strategic balancing-transfer engine as `transferRunServiceV2` while keeping the current balancing-transfer implementation available as legacy v1.

## Context

The current transfer-run surface is implemented as one unversioned service:

- [apps/api/src/services/transferRunService.ts](../../../apps/api/src/services/transferRunService.ts)

with one unversioned route surface:

- [apps/api/src/routes/transferRunRoutes.ts](../../../apps/api/src/routes/transferRunRoutes.ts)

and one current balancing page / API client stack:

- [apps/web/src/pages/inventory/BalancingTransferPreviewPage.tsx](../../../apps/web/src/pages/inventory/BalancingTransferPreviewPage.tsx)
- [apps/web/src/services/transferRunApi.ts](../../../apps/web/src/services/transferRunApi.ts)
- [apps/api/src/models/transferRuns.ts](../../../apps/api/src/models/transferRuns.ts)
- [apps/api/src/middleware/validation.ts](../../../apps/api/src/middleware/validation.ts)

That current implementation is now the **legacy balancing engine**. It should stay available because:

- it is the closest app-owned approximation of the old RICS balancing behavior,
- operators may still want it for comparison or for familiar workflows,
- we need side-by-side previews during rehearsal to earn trust in the new engine,
- replacing it in place would make it harder to separate parity regressions from intentional v2 improvements.

The new balancing policy is defined here:

- [docs/dev/specs/2026-04-25-inventory-balancing-transfer-strategy-design.md](2026-04-25-inventory-balancing-transfer-strategy-design.md)

This plan defines how that strategy lands as a new transfer-run service version without breaking v1.

## Hard decision

Do **not** overwrite the existing balancing-transfer engine in place.

Instead:

1. Keep the current balancing endpoints and current UI as **legacy v1**.
2. Add a new additive backend service: `transferRunServiceV2.ts`.
3. Add new additive v2 endpoints and frontend entrypoints.
4. Keep transfer document materialization shared where possible so commits stay consistent.

This is a side-by-side rollout, not a silent replacement.

## Goals

1. Keep the current balancing-transfer flow fully usable.
2. Introduce the strategic pass-based balancing engine as v2.
3. Avoid breaking existing transfer preview / commit consumers.
4. Make v1 and v2 outputs directly comparable on the same rehearsal data.
5. Share commit-time inventory write behavior so both versions create transfers consistently.

## Non-goals

- Removing the v1 balancing engine
- Renaming or breaking the existing v1 API routes
- Forcing operators onto v2 before comparison and validation
- Refactoring automatic transfers at the same time
- Building a generalized transfer optimizer for every transfer type in this pass

## Versioning policy

### v1 legacy

The current balancing-transfer engine remains available under the existing surface:

- `POST /api/v1/inventory/balancing-transfer-runs`
- `GET /api/v1/inventory/balancing-transfer-runs/:id/preview`
- `POST /api/v1/inventory/balancing-transfer-runs/:id/commit`

and the current frontend page remains reachable.

This engine should be labeled **Legacy Balancing Transfers** in the UI once the v2 page exists.

### v2 strategic

The new engine is additive and versioned explicitly:

- `POST /api/v1/inventory/balancing-transfer-runs-v2`
- `GET /api/v1/inventory/balancing-transfer-runs-v2/:id/preview`
- `POST /api/v1/inventory/balancing-transfer-runs-v2/:id/commit`

This route naming is intentionally blunt. Operator clarity matters more than REST purity here.

If a cleaner semantic label is desired later, it can be added as an alias after v2 is trusted. The initial build should optimize for zero ambiguity.

## Target architecture

### Backend surfaces

Keep:

- [apps/api/src/services/transferRunService.ts](../../../apps/api/src/services/transferRunService.ts) as v1 legacy

Add:

- `apps/api/src/services/transferRunServiceV2.ts`
- `apps/api/src/services/transferRunShared.ts`
- `apps/api/src/services/transferRunV2/`
  - `loadFacts.ts`
  - `deriveDemand.ts`
  - `deriveNeedAndSpare.ts`
  - `decisionPasses.ts`
  - `buildPreview.ts`
  - `types.ts`

Keep:

- [apps/api/src/routes/transferRunRoutes.ts](../../../apps/api/src/routes/transferRunRoutes.ts)

but extend it with explicit v2 endpoints instead of routing v2 through the old handlers.

### Frontend surfaces

Keep:

- [apps/web/src/pages/inventory/BalancingTransferPreviewPage.tsx](../../../apps/web/src/pages/inventory/BalancingTransferPreviewPage.tsx) as legacy

Add:

- `apps/web/src/pages/inventory/BalancingTransferPreviewPageV2.tsx`
- `apps/web/src/services/transferRunApiV2.ts` or additive v2 functions inside the existing API file
- `apps/web/src/types/transferRunsV2.ts`
- `apps/web/src/hooks/useTransferRunsV2.ts`

The inventory workspace should show both options explicitly:

- `Balancing Transfers (Legacy)`
- `Balancing Transfers v2`

### Shared materialization

Transfer commit logic should not fork if it can be avoided.

Extract from v1 into a shared helper:

- transfer number generation
- transfer document creation
- stock movement writes
- stock level decrement / increment logic
- commit conflict checks

That shared helper should be used by:

- `transferRunService.ts` for v1
- `transferRunServiceV2.ts` for v2

This keeps the preview engines independent while keeping the inventory-write semantics aligned.

## Data model plan

Do not overload the current balancing run table for v2.

The v2 preview payload is materially richer than v1 and deserves its own storage row shape.

### Keep existing v1 persistence

Leave the current v1 `BalancingTransferRun` storage untouched except for optional labeling fields if truly needed.

### Add new v2 persistence

Add a new Prisma model and backing table for v2 preview / commit state:

```prisma
model BalancingTransferRunV2 {
  id                   String   @id @default(uuid())
  status               RunStatus
  goalPreset           BalancingGoalPreset
  balancingMethod      BalancingMethod
  performanceMetric    PerformanceMetric
  salesPeriod          SalesPeriod
  tieBreakKind         TieBreakKind
  tieBreakValue        Decimal
  transferDoublesToLowerPriority Boolean @default(false)
  stripStoresBelowSizeCount Int?
  inTransitPos         Boolean  @default(false)
  requestedBy          String
  createdAt            DateTime @default(now())
  previewedAt          DateTime?
  committedAt          DateTime?
  generatedTransferIds String[]
  criteriaJson         Json
  summaryJson          Json
  linesJson            Json
  exceptionsJson       Json?
  comparedLegacyRunId  String?
}
```

The exact schema can vary, but the principle should not:

- v1 and v2 runs must be stored separately
- v2 lines must be able to carry decision-context detail without squeezing into the old payload
- comparing a v2 run to an optional v1 run should be supported

## API contract plan

### Keep v1 request/response shapes stable

Do not mutate existing v1 request validation or payload shapes except for harmless display metadata.

### Add dedicated v2 request/response types

Add a new backend model file:

- `apps/api/src/models/transferRunsV2.ts`

with dedicated types such as:

```ts
interface CreateBalancingTransferRunV2Input {
  goalPreset?: 'DAILY_RESCUE' | 'WEEKLY_BALANCE' | 'SEASONAL_CONSOLIDATION'
  balancingMethod: 'OVER_UNDER_MODELS' | 'WITHOUT_MODELS' | 'WITHOUT_CONSIDERING_MODELS'
  performanceMetric: 'ROI' | 'TURNS' | 'SELL_THRU'
  salesPeriod: 'MONTH' | 'SEASON' | 'YEAR'
  sortOrder?: 'SKU' | 'VENDOR' | 'CATEGORY'
  tieBreakKind: 'ABSOLUTE' | 'PERCENT'
  tieBreakValue: number
  transferDoublesToLowerPriority?: boolean
  stripStoresBelowSizeCount?: number | null
  inTransitPos?: boolean
  allowLowConfidenceMoves?: boolean
  cooldownDays?: number
  protectDaysOverride?: number | null
  criteria?: BalancingTransferCriteriaV2
}
```

and preview lines carrying decision context:

```ts
interface BalancingTransferPreviewLineV2 {
  skuId: string
  skuCode: string
  description: string | null
  fromStoreId: number
  toStoreId: number
  suggestedQuantity: number
  reason: string
  decisionPass:
    | 'SERVICE_RESCUE'
    | 'CURVE_REPAIR'
    | 'COVERAGE_REBALANCE'
    | 'DOWNWARD_SHARE'
    | 'SKELETON_CONSOLIDATION'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  coreSize: boolean
  receiverNeedQtyBefore: number
  receiverNeedQtyAfter: number
  donorSpareQtyBefore: number
  donorSpareQtyAfter: number
  cells: TransferPreviewCell[]
}
```

### Validation

Add a new validation schema beside the existing v1 schema:

- `createBalancingTransferRunV2Schema`

Do not try to make one schema validate both versions. The payloads have different intent and different required context.

## Service decomposition plan

### Step 1: freeze and protect v1

Before v2 work, add regression coverage around the current v1 behavior:

- over/under models
- without models
- without considering models
- tie-break behavior
- doubles downward pass
- skeleton stripping
- negative-on-hand exceptions
- preview-to-commit determinism

This creates a safety rail so later shared-helper extraction does not accidentally change legacy outputs.

### Step 2: extract shared commit code

Move the commit-side helpers out of the current v1 file into `transferRunShared.ts`:

- `buildTransferNumber(...)`
- transfer grouping by store pair
- `materializeTransfersFromPreview(...)`
- shared error type if appropriate

Do this before the v2 preview engine lands so v2 can reuse commit logic from day one.

### Step 3: scaffold v2 service and routes

Add:

- `transferRunServiceV2.ts`
- v2 model types
- v2 zod validation
- v2 routes

At this step, the v2 service can return placeholder previews, but the transport and persistence contract should exist.

### Step 4: build v2 fact-loading layer

The v2 engine needs richer facts than v1. Add loaders for:

- stock on hand by size cell
- replenishment targets
- confirmed inbound supply
- reservations / committed demand if available
- open in-transit transfers
- store metadata:
  - transfer-capable
  - peer cluster
  - route / friction bucket
  - assortment eligibility flags if available
- sales history for demand estimation
- chain or category size curves

These loaders must degrade safely when signals are incomplete.

### Step 5: build v2 derived-facts layer

Add pure derived-fact helpers for:

- core-size classification
- demand forecast blending
- service floor
- presentation floor
- target quantity
- donor protected floor
- `need`
- `spare`
- confidence scoring

This layer should be unit-testable without DB I/O.

### Step 6: build ordered decision passes

Implement the pass-based engine in discrete functions:

1. blockers / eligibility
2. service rescue
3. curve repair
4. coverage rebalance
5. downward share
6. skeleton consolidation

Each pass should:

- consume a mutable working state
- append preview lines with explicit decision context
- leave the working state updated for the next pass

Do not collapse this back into one metric-first loop.

### Step 7: build richer preview and storage

The v2 preview should group lines by pass and carry enough information for operators to trust the output.

The v2 stored payload should include:

- normalized request
- summary
- lines
- exceptions
- optional comparison metadata against a v1 run

### Step 8: add v2 UI

Add a separate v2 page instead of mutating the legacy page in place.

Recommended page behavior:

- explicit banner: `Strategic Balancing Transfers v2`
- goal preset selector:
  - Daily Rescue
  - Weekly Balance
  - Seasonal Consolidation
- preview grouped by decision pass
- visible confidence / core-size / donor-spare context
- optional compare-to-legacy button

The current page should remain available and be relabeled as legacy.

## File-by-file refactor plan

### Backend

Keep as legacy:

- [apps/api/src/services/transferRunService.ts](../../../apps/api/src/services/transferRunService.ts)

Modify:

- [apps/api/src/routes/transferRunRoutes.ts](../../../apps/api/src/routes/transferRunRoutes.ts)
- [apps/api/src/middleware/validation.ts](../../../apps/api/src/middleware/validation.ts)

Add:

- `apps/api/src/services/transferRunServiceV2.ts`
- `apps/api/src/services/transferRunShared.ts`
- `apps/api/src/services/transferRunV2/loadFacts.ts`
- `apps/api/src/services/transferRunV2/deriveDemand.ts`
- `apps/api/src/services/transferRunV2/deriveNeedAndSpare.ts`
- `apps/api/src/services/transferRunV2/decisionPasses.ts`
- `apps/api/src/services/transferRunV2/buildPreview.ts`
- `apps/api/src/services/transferRunV2/types.ts`
- `apps/api/src/models/transferRunsV2.ts`
- Prisma migration for `BalancingTransferRunV2`
- API tests for v2 routes and service behavior

### Frontend

Keep as legacy:

- [apps/web/src/pages/inventory/BalancingTransferPreviewPage.tsx](../../../apps/web/src/pages/inventory/BalancingTransferPreviewPage.tsx)

Modify:

- inventory navigation / workspace entrypoints
- current balancing page title and label text to mark it as legacy once v2 exists

Add:

- `apps/web/src/pages/inventory/BalancingTransferPreviewPageV2.tsx`
- `apps/web/src/hooks/useTransferRunsV2.ts`
- `apps/web/src/services/transferRunApiV2.ts` or additive v2 functions in the existing API file
- `apps/web/src/types/transferRunsV2.ts`
- frontend tests for v2 request wiring and render grouping

## Rollout sequence

### Phase A: backend scaffolding

1. add v1 regression tests
2. extract shared commit helpers
3. add v2 persistence model and migration
4. add v2 types, validation, routes, and placeholder service

### Phase B: strategic preview engine

1. implement fact loaders
2. implement derived facts
3. implement passes
4. implement preview storage and retrieval
5. implement commit using shared materialization

### Phase C: UI coexistence

1. relabel current page as legacy
2. add separate v2 page
3. add navigation to both
4. optionally add compare-to-legacy action

### Phase D: rehearsal and operator validation

1. run v1 and v2 against the same rehearsal datasets
2. compare preview deltas by SKU / store / size
3. review mismatches with buyers and store operators
4. tune thresholds only after review, not by gut feel alone

## Test plan

### v1 regression coverage

Must prove the legacy engine still behaves the same after shared helper extraction.

### v2 unit coverage

Add direct tests for:

- core-size classification
- donor floor protection
- need / spare math
- cooldown suppression
- inbound suppression
- service rescue priority
- curve-repair priority
- consolidation separation

### v2 integration coverage

Add end-to-end API tests for:

- create preview
- fetch preview
- commit preview
- conflict on changed source stock
- preview grouping and decision-context payload

### comparative fixtures

Create a small set of deterministic fixtures where both engines run on the same stock picture and produce intentionally different outputs. Those fixtures become the team’s proof that v2 differences are deliberate, not accidental.

## Acceptance criteria

1. Legacy balancing transfers remain available on their existing route and screen.
2. v2 balancing transfers have a separate route, service, storage model, and UI entrypoint.
3. v2 does not depend on request-path MDB reads or `rics_mirror`.
4. Both versions use the same commit-time transfer materialization rules.
5. Operators can compare v1 and v2 on the same SKU/store scope during rehearsal.
6. The codebase has explicit tests protecting v1 from accidental behavioral drift.
7. The v2 preview exposes decision pass and donor/receiver context, not just a flat journal.

## Recommended first implementation slice

The safest first slice is:

1. freeze v1 with tests
2. extract shared commit helpers
3. add `BalancingTransferRunV2` persistence
4. add `transferRunServiceV2.ts` and route scaffolding
5. return a minimal preview grouped only by `SERVICE_RESCUE`

That yields a real parallel v2 surface quickly without forcing the whole strategic engine to land in one risky commit.

## Related

- Strategy spec: [2026-04-25-inventory-balancing-transfer-strategy-design.md](2026-04-25-inventory-balancing-transfer-strategy-design.md)
- Inventory module contract: [docs/modules/inventory/rics-module-specs.md](../../modules/inventory/rics-module-specs.md)
