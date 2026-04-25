# SKU Creation + Direct-Import Cutover Preparation

**Date:** 2026-04-22  
**Status:** realigned on 2026-04-25 to the direct CSV import strategy  
**Scope:** products / SKU lifecycle / cutover preparation

## Re-alignment note

This file previously assumed a mirror-first rollout. That is no longer the project strategy.

The current strategy is:

1. extract legacy MDB data to immutable CSV artifacts,
2. import those CSVs directly into app-owned or module-owned Postgres tables,
3. eliminate `rics_mirror` entirely from hosted databases,
4. cut request-path reads to owned tables only.

## Decision

SKU creation and enrichment continue in Postgres-owned tables, but the raw legacy source now enters the system only through CSV artifacts and direct importers.

That means:

- app-created SKUs can exist before cutover,
- rich product data can be accumulated before cutover,
- the hosted DB must not carry a raw legacy mirror schema,
- cutover still depends on proving operational parity against RICS.

## What is in scope before cutover

### 1. Postgres-owned SKU lifecycle

Continue building and refining the SKU lifecycle in `app.sku` and related owned tables:

- draft creation
- progressive enrichment
- dimensional attributes
- family/category structure
- media
- audit/activity
- readiness reporting

### 2. Direct legacy imports

Legacy operational SKU data should be promoted through direct CSV imports into owned tables.

If an owned target does not exist yet:

- do not recreate `rics_mirror`,
- keep the CSV artifact offline,
- treat the importer/schema as missing work.

### 3. Rehearsal readiness

Before cutover, SKU work should make these measurable:

- app-owned data completeness,
- category/family mapping completeness,
- attribute coverage,
- image coverage,
- orphan detection,
- parity checks against the extracted legacy artifacts.

### 4. Promotion design

During development, define:

- the target post-cutover owned schema,
- the mapping from CSV artifacts into that schema,
- the merge rules for app-owned overlays and workflow data,
- the reconciliation checks that must pass on migration day.

## What is out of scope before cutover

- writing app-created SKUs back into RICS
- any new dependency on `rics_mirror`
- direct MDB mutation in app flows
- UI that implies a record was pushed into RICS

## Data-source rules

### During rehearsal development

- MDBs are read-only
- raw legacy input is a CSV artifact pack
- owned Postgres tables are the only database target
- no writes to MDBs
- no writes to `rics_mirror`

### During cutover migration

- take the final MDB backup
- extract the final CSV artifact pack
- import the required sources directly into owned Postgres tables
- create/validate PKs and FKs
- run reconciliation checks
- flip request-path authority to the owned tables

### During Postgres-only operation

- retire MDB extraction once no longer needed
- keep only owned Postgres schemas

## Product/UI implications

The SKU UI before cutover should optimize for:

- creating draft records quickly,
- progressive enrichment,
- showing lifecycle/readiness state,
- making app-owned work visible and testable.

It must not imply that a record was synchronized into a legacy mirror or pushed into RICS.

## Practical rule for developers

When building SKU-related features before cutover:

1. decide which owned table is authoritative,
2. decide which CSV artifact supplies the legacy baseline,
3. define the importer and reconciliation checks,
4. do not build any new mirror dependency.

## Related

- [docs/operations/rics-csv-promotion-playbook.md](../../operations/rics-csv-promotion-playbook.md)
- [docs/operations/migration-day-runbook.md](../../operations/migration-day-runbook.md)
- [docs/dev/specs/2026-04-24-vercel-cutover-artifact-flow.md](2026-04-24-vercel-cutover-artifact-flow.md)
