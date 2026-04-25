# Zack's Retail - Agent Instructions

This repo uses slash commands under [`.claude/commands/`](.claude/commands/) as the primary workflow surface. Subagents are not used.

> The human-facing version of this guide is in [`WORKFLOW.md`](./WORKFLOW.md) at the repo root. This file is for you (the agent); that one is for the programmer.

## Project goal

This repo builds **Zack's Retail** - a modern, web-based inventory and retail-operations system. The mandate is to re-implement the full functionality of **RICS**, the team's legacy Windows/Access-based inventory control system, as a web application that a cashier, buyer, or operator can run from a browser. RICS defines the baseline feature set; Zack's Retail matches it first, then improves on it for a web-first workflow.

# RICS Parity Rule - Cutover Requirement

## Overview

Zack's Retail must fully replicate the operational behavior of RICS before cutover.

Cutover is not based on code completion - it is based on **verified operational parity**.

---

## Core Requirement

Every RICS workflow must be:

1. Implemented in Zack's Retail
2. Tested against real RICS data
3. Re-tested through multiple rehearsal cycles
4. Verified by real operators, not just developers

Only then is it considered ready for cutover.

---

## Critical Workflows That Must Be Covered

At minimum, the following workflows must be validated:

### Product / SKU
- SKU lookup and search
- SKU creation and enrichment workflows
- SKU modification and updates
- Attribute enrichment and classification

### Purchasing
- Purchase order creation
- Editing POs
- Receiving merchandise
- Handling partial receipts

### Inventory
- Inventory tracking by SKU and store
- Inventory adjustments
- Transfers between stores
- Stock availability queries

### Pricing
- Price assignment
- Markdown pricing
- Price slot handling (list, retail, markdowns)
- Price changes over time

### Barcode
- Barcode assignment
- Barcode lookup
- Barcode printing readiness

### POS
- Item scan
- Add/remove items from ticket
- Price resolution at POS
- Transaction completion

### Reporting (minimum)
- Inventory inquiries
- SKU-level reports
- Basic operational reports used by staff

---

## Rehearsal Requirement

The system must pass multiple rehearsal cycles before cutover.

Each rehearsal includes:

1. Migration of RICS data into Postgres
2. Execution of real workflows in Zack's Retail
3. Comparison of outputs vs RICS behavior
4. Identification of mismatches
5. Fixes applied
6. Re-run

This loop continues until:

> Zack's Retail behaves consistently and predictably across all workflows.

---

## No Assumptions Allowed

- Do not assume a feature is correct because it compiles
- Do not assume parity without comparing to RICS
- Do not skip workflows because they seem minor

If RICS supports a behavior, Zack's Retail must either:
- support it, or
- explicitly document why it is not being ported

---

## Operator Validation

Technical correctness is not sufficient.

Real users must be able to perform their workflows:

- Warehouse staff
- Buyers
- Store operators

If operators cannot use the system effectively, parity is not achieved.

---

## Cutover Gate

Cutover is allowed only when:

- All critical workflows have been tested
- Rehearsal migrations succeed without blocking issues
- No unresolved high-impact mismatches remain
- Operators can complete daily tasks in Zack's Retail

---

## Design Implications

- All feature work must consider how it will be tested against RICS
- Migration tooling must support repeated rehearsal cycles
- Differences between RICS and Zack's Retail must be visible and explainable
- Testing is a first-class requirement, not a final step

---

## Guiding Principle

> Zack's Retail replaces RICS only when it has already proven it can run the business.

**Sources of truth for requirements.** Read in this order when porting or designing a feature:

1. **[`docs/modules/<slug>.md`](docs/modules/)** - the module's governed contract. Cite this first; it's authoritative for what the module does today and what it promises to other modules.
2. **[`docs/dev/specs/`](docs/dev/specs/)** - dated architecture, migration, and module design specs. Binding contracts for in-flight work. Check here before implementing any non-trivial feature.
3. **[`docs/zacks-retail-manual/`](docs/zacks-retail-manual/)** - the forward-facing end-user manual. The eventual replacement for the RICS manual; treat as the forward spec for UX and operator workflows.
4. **[`docs/rics-reference/`](docs/rics-reference/)** - the legacy RICS v7.7 User Manual. Ancestor document - cite page numbers when porting behavior so the trail back to the baseline stays intact, but do not treat it as the live spec for features already specified above.

Do not invent behavior from scratch or derive it from whatever happens to be in [`apps/api`](apps/api) today - that code is a snapshot, not the spec.

**Data surfaces (post 2026-04 reshape):**
- **Legacy RICS MDB files** in `E:/data/rics-mdbs/` are **read-only and never written to**. They are touched only by offline extraction tooling that emits CSV artifact packs. Request handlers never open an MDB at request time.
- **Postgres `public` + `app` schemas** hold net-new Zack's Retail data plus imported app-owned legacy baselines. These are the only supported operational schemas for rehearsals and cutover.
- **Postgres `platform` schema** holds the cross-cutting admin spine: `etl_run`, `etl_run_table` (sync/import audit log). Future platform tables are listed in [docs/modules/platform.md](docs/modules/platform.md).
- **`rics_mirror` is retired.** Supported environments must not keep a `rics_mirror` schema or load raw legacy tables into hosted Postgres.
- **SQLite (admin DB initialized at runtime)** is legacy - inherited from the pre-Postgres design. Tables there migrate into Postgres over time; do not add new tables to it.

The OLEDB adapter ([`apps/api/src/services/accessOleDb.ts`](apps/api/src/services/accessOleDb.ts), [`ricsProductAdapter.ts`](apps/api/src/services/ricsProductAdapter.ts)) stays in the codebase only for offline extraction/introspection while the direct CSV import tooling is still needed. Do not build new request-path dependencies on MDB reads, and do not build new dependencies on `rics_mirror`.

**Module-driven decomposition.** The system is broken into bounded modules at [`docs/modules/`](docs/modules/), with the registry at [`docs/MODULES.md`](docs/MODULES.md). Each module maps to one or more RICS chapters. Read the relevant `docs/modules/<name>.md` before touching that module's code - the spec is the contract.

**Out of scope (RICS features explicitly not being ported):** modem / dial-up comms, diskette POS sync, RICS.CFG editor, DOS prompt, screen spool files, hardware-printer driver setup, and similar infrastructure-only legacy surfaces. The "What's not being ported" table in `docs/MODULES.md` is authoritative.

**Currency.** All monetary values in RICS are in **Honduran Lempira (HNL, symbol `L`)**. The system is single-currency; no other currency has been introduced.

**Rendering policy:** do **not** render the currency symbol inside individual cells, chart axes, tooltips, or CSV/XLSX cells. Show a plain number with thousands separators and appropriate decimals such as `1,234.56` or `1,860`. Where clarity matters, put a one-line note at the top of the page such as "Amounts in Lempira (HNL)" so the reader understands the unit once.

Do **not** hardcode `$`, `USD`, or `en-US` currency formatters anywhere. For `Intl.NumberFormat`, use `{ minimumFractionDigits, maximumFractionDigits }` on a plain number with no currency style, or use the locale `es-HN` without a currency style. For Excel number formats, use patterns like `#,##0.00` or `#,##0` with no symbol. If you find an existing USD-formatted screen, fix it in the same pass.

## Current rollout model

The project follows three rollout stages. Always know which stage a piece of work belongs to - it determines what data source is legal and which audiences are affected by a regression.

**Development Against Direct CSV Imports.** RICS remains the live production system until cutover day. Rehearsals extract canonical CSV artifacts from the MDB files and import them directly into owned Postgres tables. During this stage:

- RICS is the source of truth
- CSV artifact packs are the raw legacy extract
- Hosted Postgres stores only owned `public` / `app` / module tables
- If a source has no owned target table yet, keep the CSV offline and do not load it into hosted Postgres
- Zack's Retail may write only app-side draft, workflow, overlay, and configuration data
- Do not write back to MDBs or RICS
- Do not treat app-created records as operationally live in RICS before cutover

**Cutover Migration.** On cutover day:

- RICS usage stops
- A final MDB backup is taken
- The final extraction/import runs directly into owned Postgres tables
- Primary keys and foreign keys are created and validated
- Reconciliation checks pass
- Request-path authority flips to the promoted module-owned tables
- Zack's Retail becomes the system of record

Before cutover, migration scripts may be written and rehearsed, but they should not be described as already-live operational constraints.

**Postgres-Only Operation.** After cutover succeeds:

- The MDB files are retired
- The C# bulk extractor, the `bulk-extract.ps1` host, the `accessOleDb.ts` and `persistentPwsh.ts` helpers are removed once no longer needed
- Only module-owned schemas remain
- Zack's Retail is the system of record

**How this affects day-to-day decisions:**
- A new feature's spec must declare which rollout stage it targets.
- During **Development Against Direct CSV Imports**, a feature may consume legacy data only through owned tables or offline CSV artifact imports. Do not add new `rics_mirror` dependencies.
- Development-stage writes land in `public.*` or `app.*`.
- Features must never write back to the MDBs.
- Module specs in `docs/modules/<name>.md` should record the current request-path authority for each surface and what still has to happen before cutover.
- When porting RICS behavior, default to matching it exactly and cite the manual page where possible.
- App-native improvements such as new columns, richer content, and audit trails live in owned Postgres schemas only.
- If you encounter old `Phase A / Phase B / Phase C` or `Phase 1 / Phase 2 / Phase 3` wording in older specs, treat it as stale and rewrite it to this rollout model. Do not preserve hybrid-write or gradual dual-operation assumptions.

## The framework: slash commands and skills only

**Subagents are not used on this project (retired 2026-04-21).** The old `.Codex/agents/` definitions (`products-dev`, `storefront-dev`, `rics-module-analyst`) have been removed. Do **not** invoke any agent via the `Agent` tool for this repo's work. Work that used to be delegated is now either handled by a slash command or operator-driven in plain chat.

Work happens in three surfaces, in this order of preference:

1. **Slash commands in [`.claude/commands/`](.claude/commands/)** - project-specific rituals tailored to this repo's paths and conventions. Invoke via `/<name>`. Current examples: `/sync-module-docs`, `/new-manual-chapter`, `/new-module-spec`.
2. **Skills** - content bundles whose rule files can be referenced directly.
3. **Plain Codex** - for architectural, cross-module, or scope-unclear work.

**Rule of thumb:** project-specific workflow -> use or write a slash command. One-off investigation -> plain Codex. Reusable domain rules -> install a skill.

## Conversational triggers

Natural-language requests that map to specific slash commands. When the operator phrases a request that matches one of these, invoke the command rather than improvising:

| When the operator says something like... | Invoke |
|---|---|
| "gather / index / capture / save / distill / extract / route knowledge from this conversation" | `/index-knowledge` |
| "record a milestone" / "snapshot where we are" | `/milestone <label>` |
| "audit module docs" / "check which modules are out of date" | `/sync-module-docs` |
| "scaffold a manual chapter" | `/new-manual-chapter <slug>` |
| "scaffold a module spec" | `/new-module-spec <slug>` |
| "analyze this odoo module" / "look at Odoo's X addon" / "steal patterns from Odoo's Y" | `/analyze-odoo-module <module>` |

Match on intent, not exact phrasing. If the operator's ask plausibly maps to a command above, use the command - its safety rails beat improvising.

## Project stack

- Monorepo: **pnpm workspaces + Turbo**
- Backend: Node 20+, TypeScript, Express, **Jest**, **Prisma** (multi-schema), **PostgreSQL 16** as the system of record. SQLite is present only as a frozen read-store for legacy admin tables that are being migrated piecewise into `app.*` dimensions. No new SQLite writes.
- Frontend: React 18, Vite, Ant Design, TanStack Query, Zustand, **Vitest**, ECharts
- ETL: PowerShell + C# (hosted via `Add-Type`) reads ACE.OLEDB.12.0 and writes CSV artifacts. Node importers then load owned Postgres tables directly. See [docs/operations/rics-csv-promotion-playbook.md](docs/operations/rics-csv-promotion-playbook.md).
- Legacy read-only: RICS v7.7 Access MDB files at `E:/data/rics-mdbs/`, reached only via the sync ETL; never written.
- Module specs: `docs/modules/*.md` are governed contracts, not scratchpads

## Non-WAT project rules that still apply

- **Deliverables** land in cloud services (Google Sheets, Slides, etc.), not local files
- **`.tmp/`** is disposable - regenerate as needed; do not rely on it persisting
- **`.env`** is the only place for secrets - never hardcode
- **`legacy/` no longer exists.** It previously held abandoned Odoo artifacts and pre-Postgres SQLite migrations; all of it was removed when Postgres became the system of record. Do not recreate.

## HARD RULE - SKU Lookup index warmup must stay in place

The API pre-loads the full `InventoryMaster` table into an in-memory index at startup. This powers the SKU Lookup modal on the Inventory Inquiry screen and **must cover every SKU in the catalog** - never a capped subset. Details, call sites, and the canonical log line to watch for live are in [`docs/operations/sku-lookup-index-warmup.md`](docs/operations/sku-lookup-index-warmup.md). Read it before touching `loadSkuLookupIndex()`, `searchSkusForLookup()`, or the `warmup()` `Promise.all` in `apps/api/src/services/ricsProductAdapter.ts`.

## HARD RULE - Access OLE DB helper must stay async

`runPowerShellJson()` in [`apps/api/src/services/accessOleDb.ts`](apps/api/src/services/accessOleDb.ts) **must use `child_process.spawn`, never `spawnSync`**. Every read and write against the legacy RICS MDBs goes through this one helper; if it becomes synchronous, the Node event loop freezes for the full duration of every PowerShell call and the server stops answering HTTP even though port 4000 is still listening. Operators see "every tab hangs" on restart. Full explanation, verification steps, and the list of edits that would re-introduce the bug live in [`docs/operations/access-oledb-async-spawn.md`](docs/operations/access-oledb-async-spawn.md).

## HARD RULE - Postgres-only for new development (as of 2026-04-23)

Every new feature built on Zack's Retail from this date forward writes **exclusively to Postgres**. No new columns on SQLite (`apps/api/src/db/database.ts`), no new `legacy_attrs` keys, and no new dependencies on the SQLite ref tables.

**Concretely this means:**

- **New SKU attributes** land as proper dimensional assignments in `app.attribute_dimension`, `app.attribute_value`, and `app.sku_attribute_assignment`. Never in `app.sku.legacy_attrs`.
- **New SKU columns** land on `app.sku` or a new `app.*` table, with a Prisma migration. Never on a SQLite admin table.
- **New lookup data** such as families, brands, stores, employees, and promotion codes lives in `app.*` or module-owned Postgres tables, never in a fresh SQLite table.
- **`legacy_attrs` is frozen.** It still carries the shoe-specific AI attributes that have not been migrated yet, but no new key should be added to it.
- **Existing SQLite reads** continue to work as-is so the rest of the admin does not rot, but new code reads from Postgres.

If a task seems to require a SQLite write, stop and surface it to the operator before proceeding - it is almost certainly a sign the feature should use the dimensional framework or a new `app.*` table.

## HARD RULE - no new branches, no worktrees

The operator does **not** want branches or worktrees created for this project, ever. All work is committed directly to `master`.

**Enforce this by:**

- Never calling the `Agent` tool with `isolation: "worktree"`. Omit the parameter entirely.
- Never creating a new branch with `git checkout -b ...`, `git branch ...`, or any equivalent. Commit directly to `master` with `git commit`.
- When writing implementation plans, omit any "create a worktree" step. Plans on this project execute on `master` only.

If the operator ever explicitly asks for a branch, you can create one - but the default is always `master`.

## Bottom line

Read the relevant module spec in `docs/modules/` before touching a module. Prefer slash commands from `.claude/commands/` over ad-hoc work. Subagents are not used - do not invoke them. The **Zack's Retail user manual** at [`docs/zacks-retail-manual/`](docs/zacks-retail-manual/) is the forward spec going forward; the RICS v7.7 manual at [`docs/rics-reference/`](docs/rics-reference/) is the ancestor document - cite it as lineage, not as the live spec. Never claim done without verification evidence.
