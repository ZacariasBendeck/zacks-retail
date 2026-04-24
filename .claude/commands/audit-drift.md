---
description: Read-only audit of documentation-vs-code drift for Zack's Retail. Reports mismatches between module specs, the Prisma schema, routes/services, operations docs, manual chapters, and the CLAUDE.md phase narrative. Writes nothing — the operator remediates by editing the stale docs directly.
---

# audit-drift

Report how the documentation has fallen out of sync with the actual code, schema, and ETL state. **Read-only** — this command never writes.

The remediation path is direct editing of the stale docs (either by the operator or delegated in chat). `/index-knowledge` is not the fix — it routes *new* conversational insights into fresh content, whereas drift is *existing* content that needs correcting in place. Running `/index-knowledge` on a drift report would spawn a "these docs are stale" note instead of fixing the docs, which is noise.

Argument: `$ARGUMENTS`
- Empty → audit every module + cross-cutting surfaces.
- Single module slug (e.g. `products`, `inventory`, `otb-planning`) → scope to that module only.

Example: `/audit-drift` • `/audit-drift products`

## Audit surfaces

| Path | Role |
|---|---|
| [`docs/MODULES.md`](../../docs/MODULES.md) | Module registry — canonical list, RICS-chapter mapping, "not being ported" table |
| [`docs/modules/<slug>.md`](../../docs/modules/) | Per-module spec — the contract. Narrative prose, phase state, flags |
| [`docs/PROJECT_STATUS.md`](../../docs/PROJECT_STATUS.md) | Latest milestone pointer, current phase, next step (maintained by `/milestone`) |
| [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) | Technical system overview — data flow, schemas, adapter layer, ETL |
| [`docs/COMPANY.md`](../../docs/COMPANY.md) | Business facts — chains, stores, categories, seasons |
| [`docs/operations/*.md`](../../docs/operations/) | Ops runbooks and hard-rule docs (SKU lookup warmup, OLE DB async, mirror sync) |
| [`docs/zacks-retail-manual/<slug>.md`](../../docs/zacks-retail-manual/) | End-user manual — forward UX spec |
| [`docs/dev/specs/`](../../docs/dev/specs/) | Dated design decisions |
| [`docs/dev/plans/`](../../docs/dev/plans/) | Dated implementation plans |
| [`docs/dev/handoffs/`](../../docs/dev/handoffs/) | Dated session handoffs — drift baseline anchor |
| [`docs/dev/milestones/`](../../docs/dev/milestones/) | Milestone docs (written by `/milestone`) |
| [`CLAUDE.md`](../../CLAUDE.md) | Agent guide + rollout-phase narrative |
| [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma) | Prisma schema — multi-schema (`rics_mirror`, `public`, `app`, `platform`) |
| [`apps/api/prisma/migrations/`](../../apps/api/prisma/migrations/) | Applied migrations, timestamped folders |
| [`apps/api/src/routes/`](../../apps/api/src/routes/) | Express route layer |
| [`apps/api/src/services/`](../../apps/api/src/services/) | Service layer — adapters and business logic |

## Checks

### 1. Registry vs filesystem

- Parse every row of the Modules table and the Net-new-modules table in [`docs/MODULES.md`](../../docs/MODULES.md). Capture slug, display name, RICS chapters, owner.
- List files in [`docs/modules/`](../../docs/modules/). Flag:
  - **Registry-only modules** — listed in `MODULES.md` but no `docs/modules/<slug>.md` file.
  - **Orphan spec files** — file present but no registry row.
  - **Slug-convention divergence** — spec filename uses a different casing or separator than the registry slug (e.g. `purchasePlanning.md` vs. the registry's `purchase-planning`).

### 2. Per-module phase + data-source audit

For each module in scope:

- **Phase declaration.** Read [`docs/modules/<slug>.md`](../../docs/modules/) and extract the current phase. Expected values are **Phase A**, **Phase B**, or **Phase C** per the Rollout-phases section of [`CLAUDE.md`](../../CLAUDE.md). If the spec still uses the pre-2026-04 "Phase 1 / 1.5 / 2 / 3" numbering, flag as stale vocabulary.
- **Data-source state** — the real Phase-A cutover indicator:
  - Phase A = reads may go to `rics_mirror.*` only for surfaces that do not yet have an app-owned authoritative table; once such a table exists, request handlers must read that app-owned surface instead. Writes land in `public` / `app`.
  - Search for the module's service / adapter files in [`apps/api/src/services/`](../../apps/api/src/services/).
  - If the service still imports from [`accessOleDb.ts`](../../apps/api/src/services/accessOleDb.ts) at request time, the module has **not yet been flipped** to `rics_mirror`. Cross-check against the per-request OLEDB consumer list in [`docs/operations/rics-mirror-sync.md`](../../docs/operations/rics-mirror-sync.md).
  - Drift: spec claims "reads from `rics_mirror`" but code still goes through OLEDB (or vice versa).
  - Drift: an app-owned authoritative table exists for the surface, but request handlers still read `rics_mirror` for it.
- **Flag defaults in code vs. spec.** Do NOT flag `PRODUCT_SOURCE=rics|local` — per [`CLAUDE.md`](../../CLAUDE.md) that flag is legacy and no longer the cutover mechanism. Do flag any feature flag declared in the spec that isn't actually read by code, or any code-read env var the spec doesn't mention.
- **Prisma schema placement.** For each module model in [`schema.prisma`](../../apps/api/prisma/schema.prisma), verify `@@schema("<name>")` matches the correct home:
  - RICS-canonical imported source tables → `rics_mirror` (ETL-rebuilt; no app writes).
  - Net-new Zack's Retail tables → `public` or `app`.
  - ETL audit / admin → `platform`.
  - Drift: a module-owned additive model landing in `rics_mirror` (reload would drop it), or a canonical RICS shape living in `public`.
- **Migrations.** For each migration in [`apps/api/prisma/migrations/`](../../apps/api/prisma/migrations/) whose folder name hints at the module, confirm the spec references it. Migrations without a spec mention → drift.
- **Routes and services.** Grep [`apps/api/src/routes/`](../../apps/api/src/routes/) and [`apps/api/src/services/`](../../apps/api/src/services/) for the module name. Flag route files that clearly serve a module whose spec says "not started."

### 3. Hard-rule cross-references

The three hard rules in [`CLAUDE.md`](../../CLAUDE.md) each have a runbook in [`docs/operations/`](../../docs/operations/). Module specs that touch the affected code surface should reference the runbook:

- Spec mentions `InventoryMaster`, `loadSkuLookupIndex()`, `searchSkusForLookup()`, or the SKU Lookup modal → must link [`docs/operations/sku-lookup-index-warmup.md`](../../docs/operations/sku-lookup-index-warmup.md).
- Spec mentions `runPowerShellJson()`, `accessOleDb.ts`, or MDB reads/writes → must link [`docs/operations/access-oledb-async-spawn.md`](../../docs/operations/access-oledb-async-spawn.md).
- Spec describes RICS ingestion, mirror reload behavior, or `sync:rics` → must link [`docs/operations/rics-mirror-sync.md`](../../docs/operations/rics-mirror-sync.md).

Missing link where the trigger appears → drift.

### 4. Stale-annotation carry-forward

Grep across [`docs/`](../../docs/) for the staleness marker that `/index-knowledge` writes:

```
⚠️ May be stale per
```

List each occurrence with file + surrounding context. These are deliberate carry-forward items the operator agreed to review — surface them so they don't accumulate.

### 5. Commit-vs-doc freshness

- Identify the baseline: the most recent of either the latest handoff file in [`docs/dev/handoffs/`](../../docs/dev/handoffs/) (filename-date sort) **or** the latest milestone tag (`git tag -l 'milestone-*' --sort=-creatordate | head -1`), whichever is newer.
- Run `git log <baseline>..HEAD --oneline -- docs/modules/ docs/MODULES.md docs/ARCHITECTURE.md docs/COMPANY.md docs/operations/ apps/api/prisma/ apps/api/src/routes/ apps/api/src/services/`.
- Split by prefix / path. Code-path commits with no corresponding `docs/` update in the same range → drift candidate.

### 6. CLAUDE.md rollout-phase narrative check

- Anchor on the `## Rollout phases` heading in [`CLAUDE.md`](../../CLAUDE.md) (do not hard-code line numbers — they rot).
- For each module, compare the phase the spec declares vs. where CLAUDE.md's narrative implies the module sits. Spec claims Phase B but narrative still describes it as Phase A → drift.

### 7. PROJECT_STATUS.md freshness

- Read the top block of [`docs/PROJECT_STATUS.md`](../../docs/PROJECT_STATUS.md). Compare "Latest milestone" to `git tag -l 'milestone-*' --sort=-creatordate | head -1`.
- Divergence → `PROJECT_STATUS.md` missed a `/milestone` run.

### 8. Manual-chapter coverage (informational)

- List [`docs/zacks-retail-manual/`](../../docs/zacks-retail-manual/). For each module in Phase A or later, note whether a manual chapter exists. **This is an observation, not drift** — the manual is a forward spec; chapters can legitimately lag code. Report as "coverage gap" for operator awareness.

## Report format

```
## Drift audit — <YYYY-MM-DD HH:MM>

### Summary
- Modules in registry: <N>
- Spec files present: <M>
- Registry-only (no spec): <list or "none">
- Orphan spec files: <list or "none">
- Modules with drift: <K>
- Stale vocabulary (old Phase 1/2/3): <list or "none">
- Baseline for commit check: <handoff-file-or-milestone-tag>  (<date>)
- Commits since baseline on code paths: <count>
- Stale-annotation markers in docs: <count>

### Per-module drift

#### <slug> — spec phase: <A|B|C|unstated|stale>
- <drift item>  [file:line]
- <drift item>
(repeat; omit modules with no drift — list them at the end as "clean")

### Clean modules
<comma-separated list>

### Cross-cutting drift
CLAUDE.md rollout narrative
- <item>

PROJECT_STATUS.md
- <item or "up to date">

Operations-doc cross-references
- <module spec>: missing link to <ops runbook> (spec references <trigger>)

### Stale-annotation carry-forward
- <file>: <one-line reason from the annotation>

### Commits since baseline not reflected in docs
- <sha> <subject>  — touches <path>, no doc update

### Manual-chapter coverage (informational, not drift)
- <module> (phase <X>): <chapter exists | missing>

### Remediation

Edit each drifted doc directly to match the current state of the code. This command intentionally proposes no writes — seeing the stale sentence next to the code that contradicts it is faster than reading a synthesized edit plan.
```

## Rules

- **Read-only.** Never writes, never stages, never commits.
- **Do not pipe findings into `/index-knowledge`.** That command routes new conversational insights into fresh content; it does not correct existing stale docs. The remediation path is direct editing.
- **Never flag `legacy/`.** That folder is retired — references to it in any doc are their own drift category that should already be zero.
- **Never propose adding branch / PR / worktree language** to any doc.
- **Never propose USD / `$` / `en-US` currency** changes. Single-currency HNL.
- **Anchor on headings, not line numbers,** when pointing into [`CLAUDE.md`](../../CLAUDE.md) or other long docs. Line numbers drift on every edit.
- **Keep the report under ~200 lines.** If it would be longer, summarize per-section counts and offer to drill into a specific module on re-invocation with a slug argument.

## Example invocations

- `/audit-drift` — full audit, every module and cross-cutting surface.
- `/audit-drift products` — drift audit scoped to the products module.
- `/audit-drift inventory` — drift audit scoped to the inventory module.
