# Align Spec To Cutover Plan

You are updating a Zack's Retail planning/spec file so it matches the current migration strategy.

## Context Rules (CRITICAL)

- Treat THIS command as the source of truth.
- Ignore conflicting phase definitions in other files.
- Do not import phase logic from other specs unless explicitly told.
- Do not reintroduce:
  - Phase A/B/C operational rollout language
  - hybrid sync concepts
  - bidirectional assumptions

If another file conflicts with this plan, this plan wins.



## Current Strategy

RICS remains the live production system until cutover day.

Zack's Retail is developed and tested against imported RICS data in Postgres.

There is no bidirectional sync.
There are no writes back to RICS.
There is no gradual dual-operation model.

The project strategy is:

1. Development Against RICS Mirror
2. Cutover Migration
3. Postgres-Only Operation

On cutover day:
- RICS usage stops
- Final MDB backup is taken
- Final RICS extraction/import runs
- Mirror data is promoted into module-owned schemas
- Primary keys and foreign keys are created/validated
- Reconciliation checks pass
- Zack's Retail becomes the system of record

## Your Task

Read the target spec file and revise it so it aligns with this strategy.

## What To Fix

### Replace old phase language

Replace outdated language such as:

- Phase A / Phase B / Phase C
- Phase 1 / Phase 2 / Phase 3
- hybrid writes
- bidirectional sync
- reverse sync
- gradual cutover where both RICS and Zack's Retail are operational
- writing back to RICS
- app-created SKUs becoming operational before cutover

Use this language instead:

- Development Against RICS Mirror
- Cutover Migration
- Postgres-Only Operation

### Enforce data-source rules

During Development Against RICS Mirror:

- RICS is the source of truth
- `rics_mirror` is read-only imported source data
- Zack's Retail may read from `rics_mirror`
- Zack's Retail may write only app-side draft/workflow/configuration data
- Do not write to `rics_mirror`
- Do not write back to MDB/RICS
- Do not treat app-created SKUs as sellable operational SKUs

### Enforce cutover rules

Final operational tables, primary keys, and foreign keys are created during the Cutover Migration.

Before cutover, migration scripts may be written and rehearsed, but they should not be described as already-live operational constraints.

### Preserve useful intent

Do not rewrite the whole spec unnecessarily.

Keep the original module intent, workflows, requirements, and useful implementation notes.

Only change wording or structure that conflicts with the current migration plan.

## Output Required

Return:

1. A short summary of what you changed
2. The revised full file content
3. A list of any remaining unclear decisions

## Style

Be direct.
Use clear headings.
Avoid long theory.
Use operational language a developer can follow.