# Zack's Retail — Agent Instructions

This repo uses slash commands under [`.claude/commands/`](.claude/commands/) as the primary workflow surface. Subagents are not used.

> The human-facing version of this guide is in [`WORKFLOW.md`](./WORKFLOW.md) at the repo root. This file is for you (the agent); that one is for the programmer.

## Project goal

This repo builds **Zack's Retail** — a modern, web-based inventory and retail-operations system. The mandate is to re-implement the full functionality of **RICS**, the team's legacy Windows/Access-based inventory control system, as a web application that a cashier, buyer, or operator can run from a browser. RICS defines the baseline feature set; Zack's Retail matches it first, then improves on it for a web-first workflow (real-time sync instead of modems, Postgres instead of diskette transfer, in-app notifications instead of stored reminders, etc.).

**Sources of truth for requirements.** Read in this order when porting or designing a feature:

1. **[`docs/modules/<slug>.md`](docs/modules/)** — the module's governed contract. Cite this first; it's authoritative for what the module does today and what it promises to other modules.
2. **[`docs/dev/specs/`](docs/dev/specs/)** — dated architecture and per-module phase-design specs. Binding contracts for in-flight work. Check here before implementing any non-trivial feature.
3. **[`docs/zacks-retail-manual/`](docs/zacks-retail-manual/)** — the forward-facing end-user manual. The eventual replacement for the RICS manual; treat as the forward spec for UX and operator workflows.
4. **[`docs/rics-reference/`](docs/rics-reference/)** — the legacy RICS v7.7 User Manual. Ancestor document — cite page numbers when porting behavior so the trail back to the baseline stays intact, but do not treat it as the live spec for features already specified above.

Do not invent behavior from scratch or derive it from whatever happens to be in [`apps/api`](apps/api) today — that code is a snapshot, not the spec.

**Data surfaces (post 2026-04 reshape):**
- **Legacy RICS MDB files** in `E:/data/rics-mdbs/` are **read-only and never written to**. They're touched by exactly one process: the operator-invoked `pnpm sync:rics` ETL, which copies them into Postgres. Request handlers never open an MDB at request time.
- **Postgres `rics_mirror` schema** holds a 1:1 mirror of every canonical RICS table, rebuilt atomically on each `sync:rics` invocation. Every module's read of RICS data comes from here (in progress; most adapters still go through the OLEDB path and will be flipped per-module — see [docs/operations/rics-mirror-sync.md](docs/operations/rics-mirror-sync.md)).
- **Postgres `public` + `app` schemas** hold net-new Zack's Retail data (content overlays, cart, orders, auth — currently in `public`; `app` is reserved for future module-owned additive tables). These are **preserved across reloads** — the ETL only touches `rics_mirror`.
- **Postgres `platform` schema** holds the cross-cutting admin spine: `etl_run`, `etl_run_table` (sync audit log). Future platform tables listed in [docs/modules/platform.md](docs/modules/platform.md).
- **SQLite (admin DB initialized at runtime)** is legacy — inherited from the pre-Postgres design. Tables here migrate into Postgres over time; do not add new tables to it.

The OLEDB adapter ([`apps/api/src/services/accessOleDb.ts`](apps/api/src/services/accessOleDb.ts), [`ricsProductAdapter.ts`](apps/api/src/services/ricsProductAdapter.ts)) stays in the codebase during Phase A — the sync ETL itself uses it for column introspection. The per-request read paths that still use it (listed in [docs/operations/rics-mirror-sync.md](docs/operations/rics-mirror-sync.md)) migrate to `rics_mirror` reads module by module. The `PRODUCT_SOURCE=rics|local` flag is legacy from the prior design and is no longer the cutover mechanism.

**Module-driven decomposition.** The system is broken into bounded modules at [`docs/modules/`](docs/modules/), with the registry at [`docs/MODULES.md`](docs/MODULES.md). Each module maps to one or more RICS chapters. Read the relevant `docs/modules/<name>.md` before touching that module's code — the spec is the contract.

**Out of scope (RICS features explicitly not being ported):** modem / dial-up comms, diskette POS sync, RICS.CFG editor, DOS prompt, screen spool files, hardware-printer driver setup, etc. The "What's not being ported" table in `docs/MODULES.md` is authoritative.

**Currency.** All monetary values in RICS are in **Honduran Lempira (HNL, symbol `L`)**. The system is single-currency; no other currency has been introduced.

**Rendering policy:** do **not** render the currency symbol inside individual cells, chart axes, tooltips, or CSV/XLSX cells. Show a plain number with thousands separators and appropriate decimals (e.g. `1,234.56`, `1,860`). This avoids repeating "L" on every row and keeps grids dense. Where clarity matters (reports, purchase orders, ledgers), put a one-line note at the top of the page — e.g. "Amounts in Lempira (HNL)" — so the reader understands the unit once.

Do **not** hardcode `$`, `USD`, or `en-US` currency formatters anywhere. For `Intl.NumberFormat`, use `{ minimumFractionDigits, maximumFractionDigits }` on a plain number (no `style: 'currency'`) or the locale `es-HN` without a currency style. For Excel number formats, use patterns like `#,##0.00` / `#,##0` (no symbol). If you find an existing USD-formatted screen, fix it in the same pass.

## Rollout phases

The project rolls out in three phases. Always know which phase a piece of work belongs to — it determines what data source is legal and which audiences are affected by a regression. **The plan shifted in 2026-04 to a one-way mirror approach** (no bidirectional sync, no writes back to RICS); the phases below reflect that revised direction.

**Phase A — Mirror-backed dev against live RICS.** RICS stays live in the stores; store operators keep entering sales and POs into it as usual. Separately, an operator-invoked ETL ([docs/operations/rics-mirror-sync.md](docs/operations/rics-mirror-sync.md)) reloads every canonical RICS table from the MDB files into the Postgres `rics_mirror` schema in ~5 min. Zack's Retail reads exclusively from `rics_mirror` (not from the MDBs at request time); writes land in `public`/`app` Postgres tables that the reload explicitly does not touch. This is where the project sits today. No reverse sync — Zack's Retail and RICS are independent surfaces during this phase.

**Phase B — Zack's Retail becomes the operator UI; RICS stops changing.** Store operators cut over from RICS to Zack's Retail (module by module or all at once, TBD per module plan). RICS MDBs become historical — no new writes from cashiers. The `sync:rics` reload stops being periodic because the source stopped moving; one final reload captures the last RICS state, then `rics_mirror` is merged with any app-side extensions to become the authoritative tables. The product, inventory, and sales-history data in `rics_mirror` either gets promoted into module-owned schemas (`products.*`, `inventory.*`, `sales_pos.*`) or is preserved as-is for historical reads.

**Phase C — Postgres-only.** The MDB files are retired. The C# bulk extractor, the `bulk-extract.ps1` host, the `accessOleDb.ts` + `persistentPwsh.ts` helpers, and the `rics_mirror` schema itself all come out. Only module-owned schemas remain. Zack's Retail is the system of record.

**How this affects day-to-day decisions:**
- A new feature's spec must declare which phase it targets. A "Phase A" feature reads from `rics_mirror.*` via raw SQL (or a generated Prisma view) and writes to `public.*` or `app.*`. It MUST NOT write into `rics_mirror` (reload drops everything) and MUST NOT write back to the MDBs (hard rule; see below).
- Module specs in `docs/modules/<name>.md` should record which phase the module currently sits in and what gates the next transition. Most modules are pre-Phase-A today (still reading MDBs at request time via the OLEDB adapter); migrating them to `rics_mirror` reads is the first concrete phase-A cutover.
- When porting RICS behavior, default to matching it exactly (cite the manual page). App-native improvements — new columns, richer content, audit trails — live in `public`/`app` schemas alongside the mirror, never inside `rics_mirror`.
- "Phase 1 / Phase 2 / Phase 3" are the old naming from before 2026-04. If you see those in older specs, they map: old Phase 1 (live MDB reads) never became permanent; old Phase 2 (hybrid writes) is no longer planned; old Phase 3 ≈ new Phase C.

## The framework: slash commands and skills only

**Subagents are not used on this project (retired 2026-04-21).** The old `.claude/agents/` definitions (`products-dev`, `storefront-dev`, `rics-module-analyst`) have been removed. Do **not** invoke any agent via the `Agent` tool for this repo's work. Work that used to be delegated is now either (a) handled by a slash command — e.g. writing a module spec is `/new-module-spec <slug>` — or (b) operator-driven in plain chat.

Work happens in three surfaces, in this order of preference:

1. **Slash commands in [`.claude/commands/`](.claude/commands/)** — project-specific rituals tailored to this repo's paths and conventions. Invoke via `/<name>`. Current: `/sync-module-docs`, `/new-manual-chapter`, `/new-module-spec`, `/verify-rics-mirror` (see that folder for the full set). These beat generic marketplace agents for this codebase.
2. **Skills** — content bundles whose rule files can be referenced directly. Example: the Supabase Postgres best-practices skill at `E:/dev/.claude/skills/supabase-postgres-best-practices/`.
3. **Plain Claude Code** — for architectural, cross-module, or scope-unclear work.

**Rule of thumb:** project-specific workflow → write a slash command. One-off investigation → plain Claude Code. Reusable domain rules → install a skill.

## Conversational triggers

Natural-language requests that map to specific slash commands. When the operator phrases a request that matches one of these, invoke the command rather than improvising:

| When the operator says something like… | Invoke |
|---|---|
| "gather / index / capture / save / distill / extract / route knowledge from this conversation" | `/index-knowledge` |
| "record a milestone" / "snapshot where we are" | `/milestone <label>` |
| "audit module docs" / "check which modules are out of date" | `/sync-module-docs` |
| "scaffold a manual chapter" | `/new-manual-chapter <slug>` |
| "scaffold a module spec" | `/new-module-spec <slug>` |
| "verify the mirror" / "prove the rics sync" | `/verify-rics-mirror` |
| "analyze this odoo module" / "look at Odoo's X addon" / "steal patterns from Odoo's Y" | `/analyze-odoo-module <module>` |

Match on intent, not exact phrasing. If the operator's ask plausibly maps to a command above, use the command — its safety rails (sandwich commits, cap checks, staleness annotation) beat improvising.

## Project stack

- Monorepo: **pnpm workspaces + Turbo**
- Backend: Node 20+, TypeScript, Express, **Jest**, **Prisma** (multi-schema), **PostgreSQL 16** as the system-of-record; SQLite still present for legacy admin tables pending migration
- Frontend: React 18, Vite, Ant Design, TanStack Query, Zustand, **Vitest**, ECharts
- ETL: PowerShell + C# (hosted via `Add-Type`) reads ACE.OLEDB.12.0, writes CSV, Node pipes into Postgres COPY. One-way RICS → Postgres, operator-invoked. See [docs/operations/rics-mirror-sync.md](docs/operations/rics-mirror-sync.md).
- Legacy read-only: RICS v7.7 Access MDB files at `E:/data/rics-mdbs/`, reached only via the sync ETL; never written.
- Module specs: `docs/modules/*.md` are governed contracts, not scratchpads

## Non-WAT project rules that still apply

- **Deliverables** land in cloud services (Google Sheets, Slides, etc.), not local files
- **`.tmp/`** is disposable — regenerate as needed; don't rely on it persisting
- **`.env`** is the only place for secrets — never hardcode
- **`legacy/` no longer exists.** It previously held abandoned Odoo artifacts and pre-Postgres SQLite migrations; all of it was removed when Postgres became the system-of-record. Do not recreate.

## HARD RULE — SKU Lookup index warmup must stay in place

The API pre-loads the full `InventoryMaster` table into an in-memory index at startup. This powers the SKU Lookup modal on the Inventory Inquiry screen and **must cover every SKU in the catalog** — never a capped subset. Details, call sites, and the canonical log line to watch for live in [`docs/operations/sku-lookup-index-warmup.md`](docs/operations/sku-lookup-index-warmup.md). Read it before touching `loadSkuLookupIndex()`, `searchSkusForLookup()`, or the `warmup()` `Promise.all` in `apps/api/src/services/ricsProductAdapter.ts`.

## HARD RULE — Access OLE DB helper must stay async

`runPowerShellJson()` in [`apps/api/src/services/accessOleDb.ts`](apps/api/src/services/accessOleDb.ts) **must use `child_process.spawn`, never `spawnSync`**. Every read and write against the legacy RICS MDBs goes through this one helper; if it becomes synchronous, the Node event loop freezes for the full duration of every PowerShell call (0.7–60 s each) and the server stops answering HTTP even though port 4000 is still listening. Operators see "every tab hangs" on restart. Full explanation, verification steps, and the list of edits that would re-introduce the bug live in [`docs/operations/access-oledb-async-spawn.md`](docs/operations/access-oledb-async-spawn.md).

## HARD RULE — no new branches, no worktrees

The operator does **not** want branches or worktrees created for this project, ever. All work is committed directly to `master`.

**Enforce this by:**

- Never calling the `Agent` tool with `isolation: "worktree"`. Omit the parameter entirely.
- Never creating a new branch with `git checkout -b …`, `git branch …`, or any equivalent. Commit directly to `master` with `git commit`.
- When writing implementation plans, omit any "create a worktree" step. Plans on this project execute on `master` only.

If the operator ever explicitly asks for a branch, you can create one — but the default is always `master`.

## Bottom line

Read the relevant module spec in `docs/modules/` before touching a module. Prefer slash commands from `.claude/commands/` over ad-hoc work. Subagents are not used — do not invoke them. The **Zack's Retail user manual** at [`docs/zacks-retail-manual/`](docs/zacks-retail-manual/) is the forward spec going forward; the RICS v7.7 manual at [`docs/rics-reference/`](docs/rics-reference/) is the ancestor document — cite it as lineage, not as the live spec. Never claim done without verification evidence.
