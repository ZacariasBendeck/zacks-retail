---
description: Audit Zack's Retail module docs against reality (code, migrations, git log, handoffs) and propose edits to close drift. Read-only — proposes changes, never writes without approval.
---

# sync-module-docs

Audit the documentation-vs-implementation alignment for Zack's Retail modules and report drift.

Argument handling: `$ARGUMENTS`
- If empty → audit **all 14 modules** (13 RICS-derived + `purchase-planning`).
- If a single module slug (e.g. `products`, `inventory`, `otb-planning`) → scope the audit to that module only.
- If "--apply" is passed in addition to a module, you may write the proposed edits after presenting them; otherwise **propose only, do not write**.

## Repo layout this command targets

| Path | Role |
|---|---|
| `docs/MODULES.md` | Module registry — the canonical table of 14 modules, owners, RICS chapter mapping, and the "not being ported" list. |
| `docs/modules/<slug>.md` | Per-module spec. One file per module. Narrative prose — no checkbox/percentage bars. |
| `docs/superpowers/specs/` | Design specs (architecture, per-module phase designs). Dated filenames like `2026-04-18-products-phase1-design.md`. |
| `docs/superpowers/plans/` | Implementation plans. |
| `docs/superpowers/handoffs/` | Session handoffs. Dated filenames `YYYY-MM-DD-*.md`. |
| `CLAUDE.md` | Agent guide + rollout-phase narrative. |
| `WORKFLOW.md` | Human-facing workflow. |
| `apps/api/prisma/schema.prisma` | Prisma schema. Will eventually use `@@schema("<module>")` annotations post-Postgres migration. |
| `apps/api/prisma/migrations/` | Applied migrations. Timestamped folders. |
| `apps/api/src/routes/` | Express route layer. Route filename patterns hint which module surface they serve. |
| `apps/api/src/services/` | Service layer (adapters, business logic). |

## Steps

1. **Enumerate registry vs. filesystem.**
   - Read `docs/MODULES.md` and extract every row from the "Modules" table and the "Net-new modules" table. Capture: slug, display name, RICS chapters, owner.
   - List files in `docs/modules/`. Flag:
     - **Registry-only modules** (in the table but no `docs/modules/<slug>.md` file).
     - **Orphan spec files** (file in `docs/modules/` not in the registry table).
   - Also flag if the file naming convention diverges (e.g. `purchase-planning.md` vs. `purchasePlanning.md`).

2. **Per-module audit** (for each module in scope):
   - **Read the spec** at `docs/modules/<slug>.md`. Identify:
     - Does it declare a current rollout phase? Look for phrases like "Phase 1", "Phase 1.5", "Phase 2", "Phase 3", or section headings like "Rollout phase" / "Current status" / "Phase-gate state."
     - Does it reference a design-spec date file in `docs/superpowers/specs/`? If so, does that file exist?
     - Does it reference a feature flag (e.g. `PRODUCT_SOURCE=rics|local`, `SALES_SOURCE`)? Record them.
   - **Check the Prisma schema** for module-matching models. Initially (pre-Postgres-migration) everything is in `public`. Post-migration (once `previewFeatures = ["multiSchema"]` is enabled) look for `@@schema("<module-schema-name>")` — note the schema name uses **underscore_case** of the slug (e.g. `otb_planning`, not `otb-planning`).
   - **Check migrations** at `apps/api/prisma/migrations/`. For any migration whose name hints at the module (e.g. `*products*`, `*audit*`, `*season*`), confirm the spec mentions it.
   - **Grep routes and services** for the module name. Example for `products`: `apps/api/src/routes/products*.ts`, `apps/api/src/services/ricsProductAdapter.ts`. Flag route files that clearly belong to a module whose spec claims "not started."
   - **Check flag defaults in code** against the spec's claimed phase. If `docs/modules/products.md` says "Phase 1 — RICS live reads" and the code default is `PRODUCT_SOURCE=local`, that's drift.

3. **Handoff / commit freshness check.**
   - List `docs/superpowers/handoffs/*.md`. Sort by filename date. The most recent handoff date is the drift baseline.
   - Run `git log --since="<latest-handoff-date>" --oneline -- docs/modules/ docs/MODULES.md apps/api/prisma/ apps/api/src/routes/ apps/api/src/services/`.
   - Any commit that touched a module's code path but no corresponding doc update → drift warning.

4. **CLAUDE.md rollout-phase check.**
   - Read the "Rollout phases" section of `CLAUDE.md` (around lines 50–80).
   - If any module has advanced to a later phase in its spec but the CLAUDE.md narrative still describes it at an earlier phase → drift.

5. **Produce the report.**

## Report format

Always output in this exact structure. Use concise bullets; no emojis unless the user has asked for them.

```
## Sync report — <YYYY-MM-DD HH:MM>

### Summary
- Modules in registry: <N>
- Spec files present: <M>
- Registry-only (no spec file): <list or "none">
- Orphan spec files (not in registry): <list or "none">
- Modules with drift warnings: <K>
- Latest handoff: <filename>  (<date>)
- Commits since latest handoff touching module code: <count>

### Per-module drift

#### <module-slug>  — claimed phase: <phase or "unstated">
- <drift item 1 with file:line reference>
- <drift item 2>
- (repeat for each module with drift; omit modules with no drift — list them at the end as "clean")

### Clean modules
<comma-separated list>

### Proposed edits
File: `docs/MODULES.md`
- <line/section>: <what to change and why>

File: `docs/modules/<slug>.md`
- <line/section>: <what to change and why>

File: `CLAUDE.md`
- <line/section>: <what to change and why>

### Commits since last handoff not reflected in docs
- <sha> <short message>  — touches <path>, no doc update
- ...
```

## Rules

- **Propose, don't write.** Unless the user invoked with `--apply`, stop after the report. Ask "apply these changes?" and wait.
- **Never create new module spec files automatically.** If a registry entry has no spec file, flag it as a gap and let the operator decide. Creating an empty spec is noise.
- **Do not touch the handoff files.** They are historical records.
- **Do not edit `legacy/` or its references.** That folder is quarantined (see `CLAUDE.md` hard rule).
- **Do not propose adding branch/PR-workflow language** to any doc. This project commits directly to `master`; no branches, no worktrees.
- **Do not propose changing currency formatting** to use `$` / `USD` / en-US currency style. The system is single-currency HNL (plain numbers, comma thousands).
- **Keep the output under ~200 lines.** If the report is longer, summarize and offer to drill into a specific module on request.

## Example invocations

- `/sync-module-docs` — audit all modules, propose edits.
- `/sync-module-docs products` — audit only `products`, propose edits.
- `/sync-module-docs products --apply` — audit `products` and apply the proposed edits after showing them.
