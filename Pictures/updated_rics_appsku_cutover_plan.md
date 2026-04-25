# Plan — Postgres-First SKU Creation + RICS Sync + Big-Bang Cutover

Updated from the prior cutover plan to reflect the current operating strategy: RICS remains the live operational system until cutover, but new SKU creation and enrichment should start in Postgres now so the business does not have to re-create rich product data later.

Source plan referenced: fileciteturn0file0

## Context

Today, the warehouse runs RICS from a local Access database that is not naturally online. The new Postgres-backed app can live online and is where the richer SKU model, lifecycle, attributes, family/category structure, media, and future workflow will exist.

The original plan assumed a mostly migration-oriented flow where:
- legacy RICS stayed authoritative until cutover,
- `app.sku` was mainly prepared for later migration,
- a rehearsal migration would materialize legacy rows into `app.sku`,
- and post-cutover reads would switch over.

That is still directionally true for operations, but it misses a practical constraint:

**creating SKUs manually in RICS and then duplicating that creation/enrichment work in Postgres is too expensive operationally.**

So the updated strategy is:

- **Postgres becomes the SKU creation and enrichment system now** for all net-new SKUs.
- **RICS remains the operational execution system until cutover** for warehouse / POS / existing flows.
- **A thin projection/sync path pushes the minimum required SKU data from Postgres into RICS**.
- **Legacy RICS-created SKUs can still be enriched in Postgres gradually**.
- **Periodic rehearsal migrations/reconciliations still matter**, but the business goal is now to reduce duplicate labor and make cutover easier by accumulating rich product data ahead of time.

This plan defines:
1. the target operating model during Phase A,
2. the UI and workflow expectations for the team,
3. the Postgres data model changes needed,
4. the RICS sync strategy and developer tasks,
5. the questions the team must answer about RICS SKU creation,
6. the rehearsal / reconciliation approach,
7. the final cutover path.

**Write target:** `docs/dev/specs/2026-04-22-postgres-first-rics-sync-cutover.md`

---

## 1. Operating model during Phase A

### 1.1 Source-of-truth by function

During Phase A, source-of-truth is split by responsibility:

- **Postgres / `app.sku`** is the source of truth for:
  - SKU creation intent
  - rich attributes
  - product family/category structure
  - vendor SKU metadata
  - images/media
  - lifecycle state (`DRAFT`, `ACTIVE`, `DISCONTINUED`)
  - future-ready product identity

- **RICS / Access** remains the source of truth for:
  - current warehouse operations
  - current POS / inventory flows
  - current receiving / barcode workflows that still depend on RICS
  - any live operational function not yet cut over

This is **not** a long-lived runtime UNION design. It is a **master creation in Postgres + operational projection into RICS** model.

### 1.2 New rule for net-new SKUs

For any new SKU introduced after this change:

1. the SKU is **created in Postgres first**,
2. rich data is captured there first,
3. a minimal RICS-compatible representation is then synced into RICS,
4. RICS continues to use that synced row operationally until cutover.

### 1.3 Existing/legacy SKUs

For legacy SKUs that already exist in RICS:

- they do **not** need to be recreated manually in Postgres immediately,
- they can be enriched gradually in Postgres,
- the cutover migration/reconciliation process remains responsible for bringing legacy operational data into final Postgres shape.

### 1.4 Hard rule

**RICS should stop being the place where new SKU identity is invented.**

After adoption of this flow, RICS should receive projected SKU records, not originate them.

---

## 2. Team workflow / UI expectations

### 2.1 Team-level operational rule

**All new SKUs start in the new web app, not in RICS.**

### 2.2 Roles

- **Buyer / merchandiser**
  - creates the new SKU in the web app
  - enters vendor SKU, family/category, core attributes, cost/price, etc.

- **Ops / admin**
  - reviews sync failures if needed
  - re-pushes or resolves mapping gaps

- **Warehouse / store staff**
  - continue operating in RICS until cutover

### 2.3 Required UI flow

The web app should support this sequence:

#### A. Create New SKU
Fast first-step form. Required fields should be the minimum needed to establish the item.

Recommended fields:
- vendor
- vendor SKU
- brand
- product family
- category
- gender
- short description
- color
- size or size run
- cost
- suggested retail price
- optional image upload

System-managed:
- internal record ID
- suggested final SKU code or provisional code
- `sku_state = DRAFT`
- `rics_sync_status = NOT_SYNCED`

Actions:
- `Save Draft`
- `Save and Queue for RICS Sync`

#### B. Draft SKU detail page
After creation, the SKU detail page should allow progressive enrichment.

Sections:
- Core identity
- Commercial
- Attributes
- Media
- RICS sync
- Finalization

Must show:
- SKU lifecycle badge
- sync status badge
- last sync attempt / error
- `Push to RICS` action
- `Retry sync` action
- `Finalize SKU` action

#### C. Pending RICS Sync admin view
Dedicated view for operations/admin.

Columns:
- SKU code
- description
- vendor
- vendor SKU
- category/family
- state
- sync status
- sync error
- created by / created at

Actions:
- push selected to RICS
- retry failed sync
- open record

#### D. Ready for barcode view
Should only show records that satisfy the finalization/barcode criteria defined by the lifecycle rules.

### 2.4 UX principle

Do not force the entire rich attribute model into the first screen. Adoption will fail if the initial creation form is too heavy.

Use:
- **fast create first**
- **progressive enrichment second**

---

## 3. Postgres data model changes

### 3.1 `app.sku` stays the master for new SKU creation

Net-new SKUs should continue to be created via `skuLifecycleService.create()` and finalized via `finalize()`.

### 3.2 Add explicit RICS sync tracking

Add fields to `app.sku` (or a closely related projection table) to track operational projection status:

- `rics_sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'`
  - `NOT_SYNCED`
  - `PENDING`
  - `SYNCED`
  - `FAILED`
- `rics_synced_at TIMESTAMPTZ`
- `rics_sync_error TEXT`
- `rics_legacy_code VARCHAR(15)` nullable
- `rics_row_id TEXT` nullable if RICS has a stable surrogate identity

If preferred, sync status can live in a dedicated projection table instead of `app.sku`, but the UI still needs a first-class way to read and filter it.

### 3.3 Stable legacy linkage

Every record intended to project into or reconcile with RICS should have a stable linkage field.

Preferred approach:
- keep the existing SKU `code` as the business-visible identifier,
- store `rics_legacy_code` when the operational code in RICS must be tracked separately,
- for legacy enriched rows created later, also maintain a linkage to the originating RICS record.

### 3.4 Sync log table

Add a dedicated sync log table. Example:

`app.rics_sync_job`
- `id`
- `sku_id`
- `job_type` (`CREATE_SKU`, `UPDATE_SKU`)
- `status` (`PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`)
- `attempt_number`
- `payload_snapshot JSONB`
- `error_message`
- `created_at`
- `finished_at`
- `processed_by`

This should be retry-safe and auditable.

### 3.5 Mapping tables

Do not bury RICS compatibility logic in ad hoc code. Create explicit mapping tables where needed, for example:
- category → RICS category/class
- family → RICS department/group
- vendor → RICS vendor
- brand → RICS brand field if applicable
- tax / price class mappings if needed

---

## 4. RICS sync strategy

### 4.1 Strategic goal

RICS does not need the full rich SKU model right now. It only needs the **minimum viable operational SKU payload** required for current warehouse/POS processes.

So the sync path should be a **projection**, not a mirror.

### 4.2 Recommended architecture

Because the Access DB is local in the warehouse and not naturally online, the recommended approach is:

```text
Web App / Postgres (online)
        ↓
RICS Sync Queue
        ↓
Warehouse-side Sync Agent
        ↓
Local Access / RICS DB
```

### 4.3 Warehouse-side sync agent

Build a small warehouse-local agent that:
1. authenticates to the online API,
2. polls for pending sync jobs,
3. loads the job payload,
4. writes the required SKU records into the Access DB,
5. reports success/failure back to the API,
6. logs locally as well.

This can be implemented as:
- Windows service,
- scheduled script,
- lightweight desktop utility.

Preferred priority order:
1. **manual/semi-manual sync utility** as MVP,
2. **automated local agent** once the write path is understood and stable.

### 4.4 Sync behavior

Flow:
1. user creates SKU in web app,
2. system writes rich `app.sku` record,
3. system creates a pending RICS sync job,
4. sync agent transforms SKU into RICS payload,
5. sync agent inserts/updates Access tables,
6. API marks sync status.

### 4.5 Idempotency

The RICS sync path must be idempotent.

Retrying the same job must not create duplicate SKUs in RICS.

This requires the developers to identify the stable key RICS uses for SKU identity.

### 4.6 MVP fallback option

If direct DB writes are too risky initially, support one of these as an MVP:
- CSV export in exact RICS-import shape,
- desktop-assisted sync with manual confirmation,
- UI automation only if RICS import/write semantics are too opaque.

---

## 5. What developers must discover about RICS before coding the sync

This is mandatory discovery work. The team cannot safely build the sync without it.

### 5.1 Core questions

#### A. What table or tables define a SKU in RICS?
Developers must identify:
- the main item master table,
- any required related tables,
- any reference/lookup tables that must already contain values.

#### B. What is the minimum viable payload for SKU creation?
For a SKU to be considered usable in RICS, what exact fields are required?

Examples to verify:
- code
- description
- vendor
- category/class/department
- cost
- retail price
- barcode
- active flag
- UOM
- tax flags

#### C. What is the true identity key in RICS?
Need to know whether identity is based on:
- SKU string,
- numeric surrogate id,
- composite key,
- style/color/size matrix.

#### D. Are variants separate rows or matrix-driven?
Need to confirm whether each size/color is its own SKU row or part of a parent-child style structure.

#### E. What lookup tables or coded values must match?
Need to know all required foreign-key / coded-value dependencies.

#### F. What makes a SKU operationally usable in RICS?
Need to know what additional flags or rows are required before:
- receiving,
- barcode printing,
- POS sale,
- inventory movement.

#### G. What other records are created when a user creates a SKU manually in RICS?
This must be traced by comparing DB state before and after manual SKU creation.

Possible side effects:
- item master row
- barcode row
- price row
- vendor cross-reference
- inventory defaults
- reorder/control rows
- audit rows

#### H. Are there Access-side macros / VBA / form events involved?
Developers must inspect:
- VBA modules,
- macros,
- form event handlers,
- saved queries.

Direct table writes may be insufficient if business logic lives in Access forms.

#### I. Is direct DB writing actually safe?
Developers must explicitly recommend one of:
- direct DB write,
- import/staging file,
- UI automation,
- hybrid.

#### J. How are barcodes handled?
Need to know:
- required at create time or not,
- one-per-SKU or many,
- vendor UPC vs internal barcode handling,
- barcode table relationships.

#### K. How are prices stored?
Need to know whether prices are:
- required at creation,
- per-store or global,
- effective-dated,
- tax-inclusive or tax-exclusive.

#### L. How are vendor relationships stored?
Need to know whether there is:
- one primary vendor,
- many vendor item codes,
- separate cross-reference records.

### 5.2 Required developer deliverable

Before building the sync, the developer must produce a short technical note:

**`docs/dev/specs/rics-sku-creation-technical-note.md`**

It must contain:
1. manual RICS creation flow trace,
2. table map,
3. minimum viable creation payload,
4. Postgres → RICS field mapping,
5. recommended safe write strategy,
6. known risks / unknowns.

---

## 6. Rehearsal and reconciliation strategy

The big-bang cutover strategy still stands, but rehearsals now serve two purposes:

1. validate migration of legacy operational data,
2. validate that Postgres-first SKU creation is producing the data shape needed for cutover.

### 6.1 Rehearsal objectives

Each rehearsal should verify:
- legacy RICS rows can be loaded/reconciled into the target Postgres model,
- Postgres-created net-new SKUs already contain the rich data needed on day one,
- mappings between RICS and Postgres are complete enough,
- no duplicate manual work will be needed after cutover.

### 6.2 Reconciliation reports

Add reporting for:
- SKUs in RICS with no matching/enriched record in Postgres,
- SKUs in Postgres not yet synced to RICS when they should be,
- category/family mapping gaps,
- missing vendor mappings,
- barcode mismatches,
- price mismatches,
- duplicate code collisions,
- orphaned attribute assignments.

### 6.3 Richness/readiness reporting

Add a migration-readiness report showing, for the active SKU base:
- % with family/category assigned,
- % with required attribute coverage,
- % with image,
- % with vendor linkage,
- % with barcode policy defined,
- % synced to RICS,
- % finalized/ACTIVE.

This is critical because the business goal is not only migration parity, but **arriving at cutover with most SKU richness already built**.

---

## 7. Cutover strategy

### 7.1 Strategic posture

The cutover is still **big-bang**, not gradual.

That means:
- RICS remains the live operational system until the cutover window,
- Postgres accumulates SKU richness and future workflow capability ahead of time,
- the final cutover switches reads/writes to the new system in one controlled window.

### 7.2 Pre-cutover objective

By cutover day, the target condition is:
- all net-new SKUs since adoption have been created in Postgres first,
- most important legacy SKUs have been enriched sufficiently in Postgres,
- the remaining migration of legacy operational data is primarily reconciliation, not product re-authoring.

### 7.3 Cutover runbook

#### T-14d to T-3d
- run rehearsal migration(s),
- fix mapping gaps,
- review sync error backlog,
- validate that new SKU creation is consistently happening in Postgres first.

#### T-1d
- final rehearsal,
- sign off on reconciliation and readiness metrics,
- verify sync agent stability.

#### T-0
- freeze RICS writes,
- run final legacy extract/import,
- validate counts and critical flows,
- switch operational consumers to Postgres-backed paths,
- keep rollback available.

### 7.4 Rollback

Rollback criteria and rollback mechanics must still be defined before cutover.

Until confidence is high, the first rollback move should be operationally simple:
- stop using the new read/write paths,
- resume RICS as operational truth,
- preserve migrated Postgres data for diagnosis.

---

## 8. Concrete implementation order for developers

### Phase 1 — Product/UI foundation
1. implement/create the Postgres-first SKU create flow,
2. add sync status to the UI,
3. add pending-sync admin view,
4. add retry/push actions.

### Phase 2 — RICS discovery
1. inspect Access schema,
2. trace manual SKU creation,
3. document required tables/fields/side effects,
4. choose safe write strategy.

### Phase 3 — Sync MVP
1. implement RICS payload builder,
2. implement queue/sync job model,
3. implement manual or semi-automated sync utility,
4. surface sync errors in UI.

### Phase 4 — Sync automation
1. implement warehouse-local sync agent,
2. make it retry-safe and idempotent,
3. add monitoring/logging.

### Phase 5 — Rehearsal and cutover readiness
1. build reconciliation reports,
2. build readiness dashboard,
3. run rehearsal cycles,
4. define final cutover checklist and rollback criteria.

---

## 9. Hard rules

- No long-lived runtime UNION is the goal.
- No duplicate manual SKU authoring across both systems for net-new products.
- Postgres is where new SKU identity and rich product thinking begin.
- RICS receives a projection, not the full future model.
- Direct Access writes are not allowed until the developer has documented why they are safe.
- Rehearsals must validate workflows, not just row counts.

---

## 10. Summary

The updated strategy changes the project from “prepare a later migration” to “start using the future product model now, while still operating through RICS.”

The practical outcome should be:
- less duplicate labor,
- richer SKU data accumulated before cutover,
- a simpler cutover day,
- and much less post-cutover cleanup.
