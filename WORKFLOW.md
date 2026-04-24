# How to work in Zack's Retail with Claude Code

A reference for **you, the programmer**, on how to drive Claude Code on this project.

> The agent-facing version of this guidance lives in [`CLAUDE.md`](./CLAUDE.md) at the repo root. This file is for humans — first person, practical, no meta-analysis.

---

## The framework

**No subagents.** The `.claude/agents/` folder was removed and no subagents are configured — don't expect Claude to fan out to them.

Two work surfaces, in order of preference:

1. **Slash commands in [`.claude/commands/`](./.claude/commands/)** — project-specific rituals that know this repo's paths and conventions. Invoke via `/<name>`. If there's a slash command for what you want, use it first.
2. **Plain Claude Code** — for architectural questions, cross-module scope, one-off investigations, anything that doesn't fit a command.

**Rule of thumb:** project-specific recurring workflow → write a slash command. One-off investigation → plain chat.

---

## Commands you'll use

Every command lives in [`.claude/commands/`](./.claude/commands/). Each is a markdown file with a `description` in its frontmatter — that's what shows up in the `/` picker.

### Development

| Command | What it does | When to use |
|---|---|---|
| `/new-module-spec <slug>` | Scaffolds or refreshes a module spec at `docs/modules/<slug>.md` using the canonical 9-section template (Goal → RICS features covered → Modernization decisions → Data model sketch → API surface → UI surface → Dependencies → Contracts exposed → Out of scope → Open questions). Cites RICS manual pages; never invents behavior. | You're starting a new module, or revising one's spec from the RICS manual. |
| `/new-manual-chapter <slug>` | Scaffolds an end-user manual chapter at `docs/zacks-retail-manual/<slug>.md`, patterned after the RICS v7.7 manual. Updates the manual's `INDEX.md`. | You're starting a new module's end-user docs. |
| `/sync-module-docs [module] [--apply]` | Audits module specs (`docs/modules/*.md` + `docs/MODULES.md`) against reality — Prisma schema, migrations, route files, recent git log — and proposes edits to close drift. Read-only by default; pass `--apply` to write. | You suspect a module's doc is stale (new migrations landed, routes moved, phase advanced). |

### Operations

| Command | What it does | When to use |
|---|---|---|
| `/verify-rics-mirror` | Full end-to-end proof of the RICS → Postgres sync: plants a canary row in `public."ProductContent"`, runs the full reload, verifies row counts and canary survival, cleans up. ~5 min. PASS / FAIL result. | After changing the sync pipeline; periodic trust check; whenever you're about to flip a module's reads from OLEDB to `rics_mirror`. |
| `/verify-rics-mirror --counts-only` | Fast sanity check — queries `SELECT COUNT(*)` against every canonical `rics_mirror.*` table and shows the last three `platform.etl_run` rows. No sync triggered. A few seconds. | You just want to see current mirror state. |
| `/verify-rics-mirror --force` | Same as the default, but bypasses the "another sync is running" guard. Only safe if you've confirmed the prior run is actually dead. | Previous sync crashed and left a `status='running'` row; a plain invoke refuses. |

### Plain shell (no slash command yet — run these from the integrated terminal)

| Command | What it does |
|---|---|
| `pnpm --filter @benlow-rics/api dev` | Start the API server on `localhost:4000`. |
| `pnpm --filter @benlow-rics/api sync:rics` | One-way RICS MDB → Postgres `rics_mirror` reload. ~5 min. Same pipeline the `/verify-rics-mirror` command invokes. Full runbook: [`docs/operations/rics-mirror-sync.md`](./docs/operations/rics-mirror-sync.md). |
| `pnpm --filter @benlow-rics/api verify:rics-mirror` | Shell-level equivalent of `/verify-rics-mirror` (no Claude interpretation). Use when you want the raw script output and exit code. |
| `pnpm --filter @benlow-rics/api prisma:migrate` | Apply pending Prisma migrations to the local Postgres. |
| `pnpm --filter @benlow-rics/api test` | Jest tests. |

**When to add a new slash command.** If you catch yourself typing the same multi-step request to Claude twice, write a command for it. One markdown file under `.claude/commands/`, frontmatter with a `description`, body with the steps. The description is the one-line summary that shows up in `/`.

---

## How a typical task flows

**Small bug fix.**
1. Describe the bug to plain Claude Code in normal mode.
2. Claude investigates, proposes a fix, and edits on approval.
3. Claude runs the test / dev server and shows evidence before claiming done.
4. You commit (or ask Claude to).

**New feature inside one module.**
1. Describe the feature in plain chat — no subagent routing. Use plan mode (Shift+Tab twice) for anything non-trivial.
2. Design conversation → approval → Claude executes in bite-sized steps.
3. You review each iteration.
4. When done, commit to `master` (no branches on this project).

**Auditing doc drift in a module.**
1. `/sync-module-docs <module>` → Claude compares the spec against code/migrations/git log and proposes edits.
2. Read the report, accept, reject, or tell Claude `/sync-module-docs <module> --apply`.

**New module's end-user manual.**
1. `/new-manual-chapter <slug>` → scaffolds the chapter and INDEX entry.
2. Fill in the chapter prose yourself, or describe screens to plain Claude.

**Reload RICS data into Postgres.**
1. `pnpm --filter @benlow-rics/api sync:rics` from the integrated terminal.
2. Wait ~5 min. Watch per-table progress. Final line reads `OK — <N> rows total in <T>`.
3. Sanity-check with `/verify-rics-mirror --counts-only` if you want counts.

**Flipping a module from OLEDB reads to `rics_mirror` reads** (future work — no command for this yet; describe the module to plain Claude, reference [`docs/operations/rics-mirror-sync.md`](./docs/operations/rics-mirror-sync.md)).

**Flipping a surface from `rics_mirror` reads to an app-owned authoritative table** (same workflow surface — describe the module/surface to plain Claude, cite the module spec and [`docs/operations/rics-mirror-sync.md`](./docs/operations/rics-mirror-sync.md)). This is now the required next step once the authoritative app table exists: request handlers read only from the app-owned table; `rics_mirror` remains ETL/bootstrap input only for that surface.

---

## Daily reminders

- **Start in plan mode for anything non-trivial.** Shift+Tab twice. Get the design right before code gets written.
- **Prefer a slash command to a freeform request** when one fits. The command knows the paths; you save context.
- **No subagents.** If an old doc or handoff tells you to call a specific sub-agent, ignore it.
- **Watch for verification evidence.** If Claude claims "done" without showing a test run or dev-server output, push back.
- **Commit to `master` directly.** No branches, no worktrees, no PRs on this project.
- **Don't touch `rics_mirror` by hand.** It's rebuilt on every `sync:rics`. Operator data goes in `public` / `app`. Full rules: [`docs/operations/rics-mirror-sync.md`](./docs/operations/rics-mirror-sync.md).
- **Once a surface has an app-owned authoritative table, stop reading it from `rics_mirror` in request handlers.** At that point `rics_mirror` is ETL/bootstrap-only for that surface.

---

## Folder map

Everything under the repo root, top-down. Folders not listed here are either standard plumbing (`node_modules/`, package files) or deprecated.

### Top level

| Path | What's inside |
|---|---|
| [`apps/`](./apps/) | Every runnable app in the monorepo. Four workspaces: `api`, `web`, `pos`, `storefront`. Each is a pnpm workspace with its own `package.json`. |
| [`docs/`](./docs/) | All documentation — module specs, operations runbooks, design specs, session handoffs, the RICS v7.7 reference manual, and the forward-facing Zack's Retail end-user manual. |
| [`.claude/`](./.claude/) | Claude Code project configuration. Holds `commands/` — active slash commands. The old `agents/` folder was removed; subagents are not used on this project. |
| `docker-compose.yml` | Local dev Postgres (`zacks-retail-postgres` on port `5433`). The only container Zack's Retail needs for development. |
| `turbo.json` | Turbo task pipeline config for the monorepo. |
| `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml` | pnpm monorepo wiring. |
| `CLAUDE.md` | Agent-facing project guide (Claude reads this first). |
| `WORKFLOW.md` | This file — the human-facing workflow guide. |
| `start-app.bat` | Legacy one-click Windows launcher. Still works for ad-hoc manual starts. |

### Inside `apps/`

| Path | What's inside |
|---|---|
| [`apps/api/`](./apps/api/) | **Backend.** Express + Prisma + Postgres + the RICS MDB adapter + the ETL. The heart of the system. See breakdown below. |
| [`apps/web/`](./apps/web/) | **Admin UI.** React + Vite + Ant Design. Most module UIs (Inventory Inquiry, Products, OTB, Sales Reporting, etc.) live here. Dev port 3000. |
| [`apps/pos/`](./apps/pos/) | **POS UI.** Cashier-facing React app for ticket entry. Separate from `web` because POS runs in a kiosk-style embedded browser per store. Dev port 3100. |
| [`apps/storefront/`](./apps/storefront/) | **Public storefront.** Customer-facing React site. Dev port 5173. |

### Inside `apps/api/`

| Path | What's inside |
|---|---|
| [`apps/api/src/`](./apps/api/src/) | All backend code. |
| [`apps/api/prisma/`](./apps/api/prisma/) | `schema.prisma` + timestamped migrations. Applied via `pnpm prisma:migrate`. |
| [`apps/api/scripts/`](./apps/api/scripts/) | One-off CLIs run via `tsx` — the sync pipeline (`sync-rics.ts`), the verify proof (`verify-rics-mirror.ts`), RICS schema discovery (`discover-rics-schema.ts`), seed data (`seed.ts`). |
| [`apps/api/tests/`](./apps/api/tests/) | Jest tests. One worker at a time (MDB files are single-writer). |
| `apps/api/data/` | SQLite admin DB file. Gitignored, initialized at runtime. Legacy — contents migrate into Postgres over time. |
| [`apps/api/jest.config.js`](./apps/api/jest.config.js), [`tsconfig.json`](./apps/api/tsconfig.json) | Test + TS config. |

### Inside `apps/api/src/`

| Path | What's inside |
|---|---|
| `app.ts`, `index.ts` | Express app wiring (`app.ts`) + server bootstrap + startup warmups (`index.ts`). |
| [`apps/api/src/routes/`](./apps/api/src/routes/) | Express route handlers. One file per resource (e.g., `skuRoutes.ts`, `vendorRoutes.ts`, `otbPlanRoutes.ts`). |
| [`apps/api/src/services/`](./apps/api/src/services/) | Business logic + external adapters. Home of `ricsProductAdapter.ts`, `accessOleDb.ts` (PowerShell + OLEDB helper), `ricsInventoryAdapter.ts`, the sales reporting adapters, etc. Also: [`services/sync/`](./apps/api/src/services/sync/) — the RICS → Postgres ETL. |
| [`apps/api/src/repositories/`](./apps/api/src/repositories/) | Per-table RICS repositories (`SkuRepository.ts`, `VendorRepository.ts`, `CategoryRepository.ts`, etc.) that wrap `accessOleDb` with a typed surface. |
| [`apps/api/src/db/`](./apps/api/src/db/) | SQLite admin DB initialization (`database.ts`) + schema helpers. Legacy surface. |
| [`apps/api/src/middleware/`](./apps/api/src/middleware/) | Express middleware (auth, error handler, request context). |
| [`apps/api/src/contracts/`](./apps/api/src/contracts/) | Outbound module contracts (typed interfaces one module exposes to others — e.g., `purchasingContract.ts`). |
| [`apps/api/src/models/`](./apps/api/src/models/) | Shared TypeScript types / DTOs. |
| [`apps/api/src/constants/`](./apps/api/src/constants/), [`utils/`](./apps/api/src/utils/) | Common constants and helper functions. |

### Inside `apps/web/src/`

| Path | What's inside |
|---|---|
| [`apps/web/src/pages/`](./apps/web/src/pages/) | Top-level route components. One folder per module area (products, inventory, otb, sales, etc.). |
| [`apps/web/src/components/`](./apps/web/src/components/) | Shared UI components (ProductCard, pickers, dialogs, chart wrappers). |
| [`apps/web/src/services/`](./apps/web/src/services/) | TanStack Query hooks + thin API clients. One file per API resource. |
| [`apps/web/src/auth/`](./apps/web/src/auth/) | Login flow + session handling. |
| [`apps/web/src/hooks/`](./apps/web/src/hooks/), [`utils/`](./apps/web/src/utils/), [`types/`](./apps/web/src/types/) | React hooks, helpers, shared types. |
| [`apps/web/src/styles/`](./apps/web/src/styles/) | Global CSS + theme. |
| [`apps/web/src/mock/`](./apps/web/src/mock/) | Static fixtures for Storybook / design review only — never imported by runtime code. |
| [`apps/web/src/test/`](./apps/web/src/test/) | Vitest setup. |
| `main.tsx`, `App.tsx` | React bootstrap + top-level router. |

### Inside `docs/`

| Path | What's inside |
|---|---|
| [`docs/MODULES.md`](./docs/MODULES.md) | The module registry — canonical list of modules, RICS chapter mapping, "what's not being ported" table. Start here when onboarding a new module. |
| [`docs/modules/`](./docs/modules/) | Per-module specs. One file per module (products, inventory, sales-pos, etc.). Each is a governed contract — changes need to match what the code actually does. |
| [`docs/operations/`](./docs/operations/) | Ops runbooks. Currently: `rics-mirror-sync.md` (the ETL pipeline), `access-oledb-async-spawn.md` (async-spawn hard rule), `sku-lookup-index-warmup.md` (startup warmup hard rule). Add one here per new operational concern. |
| [`docs/rics-reference/`](./docs/rics-reference/) | The RICS v7.7 user manual (PDF + any extracted text). Source of lineage; cite page numbers when porting behavior. |
| [`docs/zacks-retail-manual/`](./docs/zacks-retail-manual/) | Forward-facing end-user manual for Zack's Retail. The eventual replacement for the RICS manual. Written chapter by chapter via `/new-manual-chapter`. |
| [`docs/dev/specs/`](./docs/dev/specs/) | Dated architecture + design specs. Filename pattern: `YYYY-MM-DD-<topic>-design.md`. |
| [`docs/dev/plans/`](./docs/dev/plans/) | Implementation plans, typically one per feature/migration. |
| [`docs/dev/handoffs/`](./docs/dev/handoffs/) | Session handoffs between Claude sessions. Dated. Never edit historical handoffs. |
| [`docs/dev/milestones/`](./docs/dev/milestones/) | Dated milestone notes. |
| [`docs/rics-db-schema.md`](./docs/rics-db-schema.md) | Reference dump of RICS MDB schemas — useful when something in `rics_mirror` looks surprising. |
| `docs/triage-2026-04-18.md` | One-off architecture review from 2026-04-18. Historical. |

### Inside `.claude/`

| Path | What's inside |
|---|---|
| [`.claude/commands/`](./.claude/commands/) | Active slash commands (see the "Commands you'll use" table above). One markdown file per command. |

---

## Where stuff lives

| What | Where |
|---|---|
| Agent instructions for Claude | [`CLAUDE.md`](./CLAUDE.md) |
| Slash commands | [`.claude/commands/`](./.claude/commands/) |
| Module specs (source of truth per module) | [`docs/modules/`](./docs/modules/) |
| End-user manual (forward spec) | [`docs/zacks-retail-manual/`](./docs/zacks-retail-manual/) |
| RICS v7.7 manual (ancestor / lineage reference) | [`docs/rics-reference/`](./docs/rics-reference/) |
| Operations runbooks | [`docs/operations/`](./docs/operations/) |
| Design specs (dated, for architecture + per-module Phase designs) | [`docs/dev/specs/`](./docs/dev/specs/) |
| Session handoffs | [`docs/dev/handoffs/`](./docs/dev/handoffs/) |
| Legacy RICS MDB files (read-only, ETL only) | `E:/data/rics-mdbs/` |
| This workflow guide | `WORKFLOW.md` (you are here) |
