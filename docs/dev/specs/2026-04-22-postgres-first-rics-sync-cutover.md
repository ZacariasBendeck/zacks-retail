# SKU Creation + Cutover Preparation

**Date:** 2026-04-22
**Status:** realigned on 2026-04-24 to match the current mirror-first strategy
**Scope:** products / SKU lifecycle / cutover preparation

## Re-alignment note

This file previously described a **Postgres -> RICS sync** path, including:

- projecting app-created SKUs into RICS before cutover,
- a warehouse-side sync agent,
- explicit `Push to RICS` flows in the UI,
- treating RICS as the operational consumer of Postgres-created records before cutover.

That is **no longer the project strategy**.

The current strategy, per [CLAUDE.md](../../../CLAUDE.md), is:

1. **Development Against RICS Mirror**
   - RICS stays live until cutover.
   - Zack's Retail reads imported legacy data from `rics_mirror`.
   - Zack's Retail writes only app-owned data to `app.*` / `public.*`.
   - Zack's Retail does **not** write back to MDBs or to `rics_mirror`.
2. **Cutover Migration**
   - RICS usage stops.
   - Final MDB backup + final reload run.
   - `rics_mirror` plus app-owned data are promoted into module-owned schemas.
   - PKs/FKs/reconciliation checks land here, not earlier.
3. **Postgres-Only Operation**
   - MDBs and `rics_mirror` retire.
   - Zack's Retail is the system of record.

## Decision

SKU creation and enrichment work should continue in Postgres-owned tables during development, but **operational use before cutover still follows RICS**.

That means:

- app-created SKUs can exist as Zack's Retail records before cutover,
- rich product data can be accumulated before cutover,
- but those records are **not treated as operationally live in RICS through a sync path**,
- and cutover remains the moment where promotion into the app's canonical owned schemas happens.

## What is in scope before cutover

### 1. Postgres-owned SKU lifecycle

Continue building and refining the SKU lifecycle in `app.sku` and related app-owned tables:

- draft creation,
- progressive enrichment,
- dimensional attributes,
- family/category structure,
- media,
- audit/activity,
- readiness reporting.

This is valid pre-cutover work because it is app-owned data that survives `sync:rics`.

### 2. Legacy read parity

Legacy operational SKU reads still come from:

- `rics_mirror.inventory_master`
- `rics_mirror.inv_catalog`
- related mirrored lookup tables

Any operational page that still reflects live RICS behavior before cutover should read from `rics_mirror`, optionally merged with app-owned overlays where the module contract allows it.

### 3. Rehearsal readiness

Before cutover, SKU work should support rehearsals by making these easy to measure:

- app-owned data completeness,
- category/family mapping completeness,
- attribute coverage,
- image coverage,
- orphan detection,
- mirror/app parity checks where applicable.

### 4. Promotion design

During development, the team should define:

- the target module-owned post-cutover schema,
- the mapping from `rics_mirror` into that schema,
- the merge rules for app-owned overlays and draft/workflow data,
- the reconciliation checks that must pass on migration day.

This design work should happen **during module development**, not after the module is "done", but the actual promotion remains cutover work.

## What is out of scope before cutover

The following are **not** part of the current strategy:

- writing app-created SKUs back into RICS,
- a warehouse-side sync agent,
- direct MDB mutation as part of normal app flows,
- `Push to RICS`, `Retry RICS sync`, or queue-driven RICS projection UI,
- treating app-created SKUs as sellable/live in the legacy operating system before cutover.

## Data-source rules

### During Development Against RICS Mirror

- Reads of legacy operational truth come from `rics_mirror.*`.
- Writes of net-new app behavior go to `app.*` / `public.*`.
- No writes to `rics_mirror`.
- No writes to MDBs.

### During Cutover Migration

- Take the final MDB backup.
- For Vercel-targeted cutovers, pre-extract immutable CSV artifacts from that frozen MDB backup on a Windows-capable workstation.
- Run the final reload into `rics_mirror` from those artifacts (target shape) or, until the split tooling ships, via `sync:rics` on a Windows-capable runner (current fallback).
- Promote `rics_mirror` plus app-owned data into module-owned schemas.
- Create/validate PKs and FKs.
- Run reconciliation checks.
- Flip reads from `rics_mirror` to promoted module-owned schemas.
- Promote the Vercel production deployment only after the load + reconciliation checks pass.

### During Postgres-Only Operation

- Retire `rics_mirror`.
- Retire OLE DB helpers and MDB dependencies.
- Keep only module-owned Postgres schemas.

## Product/UI implications

The SKU UI before cutover should optimize for:

- creating draft records quickly,
- progressive enrichment,
- showing lifecycle/readiness state,
- making app-owned work visible and testable,
- clearly distinguishing app-owned draft/workflow state from live mirrored RICS state.

It should **not** imply that a record has been pushed into RICS or is operational there unless the system is actually post-cutover.

## Rehearsal and cutover preparation

Useful pre-cutover deliverables:

- readiness dashboards for SKU richness,
- parity reports comparing mirror and app-owned structures,
- reconciliation checks for category/vendor/attribute coverage,
- promotion SQL/scripts drafted and rehearsed on staging copies,
- operator smoke-test scripts for cutover-day validation.

## Practical rule for developers

When building SKU-related features before cutover:

1. ask what must read from `rics_mirror` now,
2. ask what app-owned state belongs in `app.*` now,
3. define where that data will land after promotion,
4. do **not** build a runtime writeback path to RICS.

## Related

- [CLAUDE.md](../../../CLAUDE.md)
- [docs/operations/migration-day-runbook.md](../../operations/migration-day-runbook.md)
- [docs/dev/specs/2026-04-18-products-phase1-design.md](2026-04-18-products-phase1-design.md)
- [docs/dev/specs/rics-sku-creation-technical-note.md](rics-sku-creation-technical-note.md)
