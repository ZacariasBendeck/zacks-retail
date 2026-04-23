# Zack's Retail — Architecture

Living overview of the system's technical shape. Updated in place by `/index-knowledge` and by hand as decisions ship. Dated records of *how we got here* live in [`dev/specs/`](dev/specs/). This doc is the *current state*.

Scope: the technical system — folders, data flow, schemas, adapter layer, ETL, development processes. **Not** module detail (that's [`docs/modules/`](modules/)); **not** company / business facts (that's [`docs/COMPANY.md`](COMPANY.md)); **not** end-user flows (that's [`docs/zacks-retail-manual/`](zacks-retail-manual/)).

Target size: 200–400 lines. If a section bloats, it migrates to its own doc and a pointer stays behind.

## Project shape

Monorepo — pnpm workspaces + Turbo.

| Path | Role |
|---|---|
| `apps/api/` | Express + Prisma API (Node 20+, TypeScript) |
| `apps/api/src/services/sync/` | ETL pipeline: RICS MDBs → Postgres `rics_mirror` |
| `apps/web/` | React 18 + Vite + Ant Design — storefront + admin UI |
| `packages/*` | Shared workspace packages |
| `docs/` | Living project documentation (see "Folder conventions") |
| `.claude/` | Claude Code configuration — commands, agents (retired), skills |

Stack: Node 20+, TypeScript, Express, Prisma (`multiSchema` preview feature), PostgreSQL 16, Jest (API), React 18, Vite, Ant Design, TanStack Query, Zustand, Vitest, ECharts.

## Folder conventions

### `docs/` layout

| Path | Purpose |
|---|---|
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | **This file** — technical-general living overview |
| [`docs/COMPANY.md`](COMPANY.md) | Business-general: who the company is, chains, stores, categories, seasons, goals |
| [`docs/PROJECT_STATUS.md`](PROJECT_STATUS.md) | Latest milestone tag + current phase + next step. Maintained by `/milestone`. |
| [`docs/MODULES.md`](MODULES.md) | Module registry + RICS-chapter mapping + "not being ported" list |
| [`docs/modules/<slug>.md`](modules/) | Per-module developer contracts — what each module does, data sources, phase-gate state |
| [`docs/zacks-retail-manual/<slug>.md`](zacks-retail-manual/) | **End-user-only** flows per module (cashier / buyer / manager) |
| [`docs/operations/*.md`](operations/) | Canonical docs for cross-cutting hard rules (SKU warmup, OLEDB async, ETL ops) |
| [`docs/dev/specs/<date>-<topic>.md`](dev/specs/) | Dated technical decisions — the "why" behind design choices |
| [`docs/dev/plans/<date>-<topic>.md`](dev/plans/) | Dated implementation plans — "steps to build X" |
| [`docs/dev/handoffs/<date>-<topic>.md`](dev/handoffs/) | Session bridges between Claude Code sessions |
| [`docs/dev/milestones/<date>-<label>.md`](dev/milestones/) | Tagged checkpoint snapshots (paired with `milestone-*` git tags) |
| [`docs/rics-reference/`](rics-reference/) | The RICS v7.7 user manual — ancestor spec, reference only |

### `.claude/` layout

| Path | Purpose |
|---|---|
| [`.claude/commands/*.md`](../.claude/commands/) | Project-specific slash commands (one markdown file per command) |
| [`.claude/agents/*.md`](../.claude/agents/) | Retired subagent files (kept for history; never invoked) |
| [`.claude/skills/*/SKILL.md`](../.claude/skills/) | Project-local skills — content libraries loaded on demand |

## Data flow

```
              operator-invoked (pnpm sync:rics)
                     │
                     ▼
┌──────────────┐   ETL   ┌─────────────────────────────┐
│ RICS MDBs    │────────►│  Postgres — rics_mirror.*   │
│ (read-only,  │         │  (atomic reload; 27 tables) │
│  Windows/    │         └──────────────┬──────────────┘
│  ACE.OLEDB)  │                        │
└──────────────┘                        │ request-side reads
                                        ▼
                 ┌────────────────────────────────────────────┐
                 │  apps/api adapter layer                    │
                 │  (ricsProduct, ricsInventory, sales-report)│
                 └──────────────────────┬─────────────────────┘
                                        │
                                        ▼
                          ┌─────────────────────────┐
                          │ Express routes          │
                          │ /api/v1/*, /api/public/*│
                          └───────────┬─────────────┘
                                      │
                                      ▼
                             ┌─────────────┐
                             │ apps/web UI │
                             └─────────────┘

Writes (new app data, cart, orders, content overlay)
───────────────────────────────────────────────────────────►
                          Postgres — public.*, app.*
                          (preserved across `rics_mirror` reloads)
```

**Phase A invariant:** request handlers never open an MDB at request time. The only process that touches MDBs is the sync ETL.

### Net-new SKU creation — write paths

When an operator creates a SKU via `/products/skus/new` (the AI-powered creator):

| Step | Writes to |
|---|---|
| Draft save (first save + every edit) | `app.sku` (DRAFT row), `app.sku_activity` (event=`created`/`updated`) |
| Apariencia / Diseño dimensional save | `app.sku_attribute_assignment` (scoped to the 11 Apariencia dims), `public.products_audit_log` |
| Finalize (DRAFT → ACTIVE) | `app.sku` (state flip + `code` set), `app.sku_activity` (event=`finalized`), `UPDATE app.sku_attribute_assignment SET sku_code = <final> WHERE sku_code = <provisional>` |
| AI image analysis | No DB writes — reads `app.category_product_family` + `rics_mirror.categories` to build the Claude prompt |

Never written during this flow: `rics_mirror.*` (read-only), RICS MDB files (forbidden), any SQLite admin table (Postgres-only policy), `app.sku_drafts` (it's a VIEW over `app.sku WHERE sku_state='DRAFT'`).

### SKU attribute assignment keying

`app.sku_attribute_assignment.sku_code` is **VARCHAR(32)** (was VARCHAR(15)) so it can hold both a DRAFT provisional code (`DRF-YYMMDD-XXXXXX` = 17 chars) and a final RICS-compatible code (≤15 chars). During DRAFT, assignments are keyed by `provisional_code`; on finalize, `skuLifecycleService.finalize()` runs `UPDATE ... SET sku_code = <final> WHERE sku_code = <provisional>` inside the state-flip transaction to rekey them atomically. The `app.sku_attribute_orphans` view recognizes both `app.sku.code` and `app.sku.provisional_code` as valid targets, so orphan counts stay accurate throughout the lifecycle.

## Schemas

Four schemas in the Postgres DB (`zacks_retail`):

- **`rics_mirror`** — Read-only, atomic reload. 1:1 mirror of every canonical RICS MDB table. Every request-side read hits this schema. Rebuilt by `pnpm sync:rics`. Never write at request time — the next reload drops everything not owned by the ETL.
- **`public`** — Storefront-baseline tables that predate Phase A (`Cart`, `CartLine`, `Order`, `OrderLine`, `User`, `Session`, `Role`, `ProductContent`, `SeasonOverlay`, `ProductsAuditLog`). Preserved across ETL reloads. App writes freely here.
- **`app`** — Module-owned additive tables — net-new things Zack's Retail invents that RICS never had. Active surface as of 2026-04-23: products (`sku`, `sku_activity`, `sku_attribute_override`, `sku_keyword_override`, `size_type_override`, `products_batch_operation*`), extended attributes (`attribute_dimension`, `attribute_value`, `sku_attribute_assignment` + orphans view, `attribute_family_rule`), product family (`product_family`, `category_product_family`), plus the legacy-ref migration targets seeded 2026-04-23. Phase-A contract: writes go here freely; the `sync:rics` ETL never touches this schema.

> ⚠️ May be stale per 2026-04-23 /index-knowledge pass: the previous description said "Currently empty. First populated when a module needs a persistent data surface for a non-RICS concept." That has long since happened — the schema now carries the full products-module surface plus the dimensional attribute framework. Review and remove if confirmed.
- **`platform`** — Cross-cutting admin spine. Currently `etl_run`, `etl_run_table`. Future: `audit_log`, `notification`, `feature_flag`, `scheduled_task`.

## Adapter layer (request-side)

Request handlers consume adapters that read from `rics_mirror`. Every adapter has an in-process TTL cache (`cachedAsync`, 5–10 min TTL) on top.

| Adapter | File | Serves |
|---|---|---|
| `ricsProductAdapter` | `apps/api/src/services/ricsProductAdapter.ts` | Storefront catalog, SKU Lookup modal, product detail, InvCatalog overlay |
| `ricsInventoryAdapter` | `apps/api/src/services/ricsInventoryAdapter.ts` | Inventory Inquiry, Find-by-Size, Detail Report, Change Detail, Transfer Summary, SKU×Store rollups, Recommended Transfers |
| `salesReporting/ricsSalesReportAdapter` | `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts` | Sales by Day/Time, Salesperson Summary, Best Sellers, Stock Status, Sales Analysis |
| `salesReporting/ricsSalesHistoryByMonthAdapter` | `...SalesHistoryByMonthAdapter.ts` | Monthly sales history, inventory-history 12-slot projections |
| `salesReporting/ricsOnHandAtCostAdapter` | `...OnHandAtCostAdapter.ts` | ROI / Turns feeder for Sales Analysis |
| `salesReporting/ricsInquiryRollupAdapter` | `...InquiryRollupAdapter.ts` | Per-SKU Week/Month/Season/Year rollup on the Inquiry screen |

## ETL pipeline

At `apps/api/src/services/sync/`:

| File | Role |
|---|---|
| `bulk-extract.ps1` | C#-hosted-in-PowerShell reader. `Add-Type` compiles C# at runtime against the Windows-built-in .NET runtime — no SDK required. Streams rows into Postgres COPY TEXT format on stdout. |
| `bulkExtract.ts` | Node side — spawns the PS host, pipes stdout into `pg-copy-streams`. |
| `copyFromMdb.ts` | COPY TEXT pipe wrapper. |
| `ricsRefresh.ts` | Orchestrator. Owns the atomic swap transaction (staging → production rename). |
| `canonicalRicsTables.ts` | The list of RICS tables mirrored (27 tables). |
| `typeMapping.ts` | RICS → Postgres type coercion. |

Invocation: `pnpm --filter @benlow-rics/api sync:rics`.
Verification: `pnpm --filter @benlow-rics/api verify:rics-mirror` (counts-only or full reload + canary).
Observability: every run writes to `platform.etl_run` + `platform.etl_run_table`.

## Rollout phases

Current phase: **A**. Full narrative in [`CLAUDE.md`](../CLAUDE.md).

- **Phase A** (now): Mirror-backed dev against live RICS. Operators continue using RICS; Zack's Retail reads from `rics_mirror`, writes to `public`/`app`.
- **Phase B**: Zack's Retail becomes the operator UI; RICS stops changing. One final reload, then `rics_mirror` contents promote into module-owned schemas.
- **Phase C**: Postgres-only. MDBs, OLEDB helpers, and `rics_mirror` all retire.

## Cross-cutting hard rules

Short summary; each has a canonical longer doc linked.

- **RICS is read-only forever.** No `INSERT` / `UPDATE` / `DELETE` against any `.MDB`.
- **No branches, no worktrees.** Commits go direct to `master`. See [`CLAUDE.md`](../CLAUDE.md).
- **SKU Lookup index warmup covers every SKU.** Never capped. See [`docs/operations/sku-lookup-index-warmup.md`](operations/sku-lookup-index-warmup.md).
- **OLEDB helper stays async.** `child_process.spawn` only, never `spawnSync`. See [`docs/operations/access-oledb-async-spawn.md`](operations/access-oledb-async-spawn.md).
- **Currency: HNL plain numbers.** No `$` / `USD` / `L` symbol inside data cells, charts, CSV, or XLSX. See [`docs/COMPANY.md`](COMPANY.md) for the business context and [`CLAUDE.md`](../CLAUDE.md) for the rendering policy.
- **`legacy/` is retired.** Do not recreate.
- **Postgres-only for new development (as of 2026-04-23).** No new SQLite columns, no new keys on `app.sku.legacy_attrs`, no new dependencies on the legacy SQLite ref tables. New attributes use the dimensional framework (`app.attribute_dimension` + `app.attribute_value` + `app.sku_attribute_assignment`); new SKU columns land on `app.sku` via a Prisma migration. See [`docs/dev/specs/2026-04-23-postgres-only-development-policy.md`](dev/specs/2026-04-23-postgres-only-development-policy.md) for the rule text + the migration backlog. Canonical restatement in [`CLAUDE.md`](../CLAUDE.md).

## Authentication

Session-based auth with Postgres-backed `User` / `Session` / `Role` tables in the `public` schema. Bcrypt-family password hashing. No SSO yet. Admin-side permissions are role-scoped; per-line permission gating for reports (e.g. hide GP% for staff without `reports.view_gp`) is not implemented.

## Development processes

### Slash commands (project-local, at `.claude/commands/`)

| Command | Purpose |
|---|---|
| `/milestone <label>` | Record a project milestone — verify, write milestone doc, sandwich-commit, tag, push |
| `/index-knowledge` | Review the current conversation, route each insight to the right existing doc (this file, `COMPANY.md`, modules, manual, `dev/specs/`, `dev/plans/`) |
| `/sync-module-docs [slug]` | Audit module docs vs. code reality; propose edits |
| `/new-manual-chapter <slug>` | Scaffold an end-user manual chapter for a module |
| `/verify-rics-mirror` | End-to-end mirror verification (sync + canary + row-counts) |

### Commit discipline

- Commit direct to `master`. No branches, no worktrees, no PRs.
- Conventional Commits style: `feat(scope)`, `chore(scope)`, `docs(scope)`, `fix(scope)`.
- Co-authored-by line on commits made via Claude Code.

### Sandwich-commit pattern

Used by `/milestone` and `/index-knowledge` for reversible multi-file passes:

1. **Before** — if the working tree is dirty, commit it as `chore: snapshot before <ritual>`. Separates pre-existing work from the ritual's writes.
2. **Write** — the ritual applies its edits.
3. **After** — commit the ritual's output as one distinct commit. `git revert <sha>` cleanly undoes the whole pass.

### Phase-A cutover method

Pattern used to flip one adapter path at a time from OLEDB to `rics_mirror`:

1. Read the OLEDB SQL; map to the equivalent `rics_mirror` table.
2. Translate SQL (`IIF → COALESCE`, `TOP N → LIMIT N`, `#date# → $N::date`, `DatePart → EXTRACT`, `[Brackets] → snake_case`, `Year()/Month() → EXTRACT(YEAR/MONTH FROM)`, `UCASE → UPPER`, `Voided = False → voided = false`, `IN (…) → ANY($N::type[])`).
3. Preserve projection shape via aliases (`sku AS "SKU"`, `current_cost::float8 AS "CurrentCost"`). Downstream code doesn't change.
4. Parameterize every caller-supplied value (`$N`, `ANY($N::type[])`). Never interpolate user input.
5. Numeric casts: `::float8` for `NUMERIC`; `to_char(x AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')` for `timestamptz` when caller expected a string.
6. SKU-padding quirk: `rics_mirror.ticket_detail.sku` is right-padded to 15 chars; `inventory_master.sku` is not. Ticket-table filters use `RPAD($1, 15)`.
7. Verify live via `curl` against the running dev server before committing. Commit per adapter with cross-source integrity checks.

### Milestone ritual

`/milestone <label>` at natural checkpoints:

1. Preflight — branch = `master`, tag not already taken, no secrets in diff.
2. Write milestone doc at `docs/dev/milestones/<date>-<label>.md`.
3. Update `docs/PROJECT_STATUS.md` in place.
4. Sandwich commit + annotated tag `milestone-<date>-<label>`.
5. Push both the commit and the tag to `origin/master`.

Same-day milestones OK (label makes them unique).

## How this document evolves

- **Additive by default.** New decisions about the technical system → updates here.
- **Annotate, don't overwrite, for staleness.** When an old section is suspect, mark it `> ⚠️ May be stale per <date> — review.` rather than silently rewriting. Operator does the final delete.
- **Routed by `/index-knowledge`.** Architecture-level insights from conversations land here.
- **Dated decisions live in `docs/dev/specs/`.** Don't duplicate them. Reference them inline as `see: docs/dev/specs/<date>-<topic>.md` when relevant.
- **Under 400 lines.** If this doc sprawls past that, split the biggest section out.
