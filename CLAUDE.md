# Zack's Retail — Agent Instructions

This repo uses **Subagent-Driven Development (SDD)** via the [`obra/superpowers`](https://github.com/obra/superpowers) skill pack.

> The human-facing version of this guide is in [`WORKFLOW.md`](./WORKFLOW.md) at the repo root. This file is for you (the agent); that one is for the programmer.

> Note: the grandparent `CompartidoZBIA/CLAUDE.md` describes an older **WAT (Workflows-Agents-Tools)** framework. That document does **not** apply to this project. Use this file's guidance for Zack's Retail.

## Project goal

This repo builds **Zack's Retail** — a modern, web-based inventory and retail-operations system. The mandate is to re-implement the full functionality of **RICS**, the team's legacy Windows/Access-based inventory control system, as a web application that a cashier, buyer, or operator can run from a browser. RICS defines the baseline feature set; Zack's Retail matches it first, then improves on it for a web-first workflow (real-time sync instead of modems, Postgres instead of diskette transfer, in-app notifications instead of stored reminders, etc.).

**Source of truth for requirements.** The RICS v7.7 User Manual at [`docs/rics-reference/`](docs/rics-reference/) is the spec. When porting a feature, cite the manual page so the behavior is traceable. Do not invent behavior from scratch or derive it from whatever happens to be in [`apps/api`](apps/api) today — that code is a snapshot, not the spec.

**Two live data surfaces:**
- **Legacy RICS MDB files** in `Rics Databases/` are read **live and read-only** via a PowerShell + `Microsoft.ACE.OLEDB.12.0` adapter ([`apps/api/src/services/ricsProductAdapter.ts`](apps/api/src/services/ricsProductAdapter.ts)). This lets the new storefront serve real product data while the new system is still being built. Toggled with `PRODUCT_SOURCE=rics|local`.
- **Net-new system data** lives in a modern stack: Postgres (via Prisma) for storefront concerns (content overlay, cart, orders) and SQLite (admin DB initialized at runtime) for in-progress admin domains (SKUs, inventory, vendors, POs, OTB). Migrating the admin DB to Postgres is a separate workstream.

**Module-driven decomposition.** The system is broken into bounded modules at [`docs/modules/`](docs/modules/), with the registry at [`docs/MODULES.md`](docs/MODULES.md). Each module maps to one or more RICS chapters. Read the relevant `docs/modules/<name>.md` before touching that module's code — the spec is the contract.

**Out of scope (RICS features explicitly not being ported):** modem / dial-up comms, diskette POS sync, RICS.CFG editor, DOS prompt, screen spool files, hardware-printer driver setup, etc. The "What's not being ported" table in `docs/MODULES.md` is authoritative.

## Rollout phases

The project rolls out in three phases. Always know which phase a piece of work belongs to — it determines what data sources are legal, what regressions matter, and whether a feature can be Postgres-only.

**Phase 1 — Mirror RICS on the existing Access database.** The web app reproduces RICS functionality module by module, but every read and write still goes against the original RICS Access MDB files. No schema changes to the legacy DB. Goal: feature parity in a browser, with zero risk to existing RICS workflows. Operators can use either RICS or Zack's Retail and see the same data.

**Phase 2 — Hybrid: some modules on Postgres, others still on Access.** Selected modules cut over to a new Postgres database whose tables either (a) duplicate RICS structure (so behavior stays identical) or (b) extend it with new tables that represent improvements over RICS (richer content, web-only fields, audit trails, etc.). Other modules continue to read/write the Access DB. The two stores must stay coherent for any data shared across module boundaries — when in doubt, design for read-from-Access, write-to-both, then read-from-Postgres once a module is fully cut over.

**Phase 3 — Postgres-only.** The Access MDB files are retired entirely. All data lives in the managed Postgres instance. The RICS adapter (`ricsProductAdapter.ts`, `accessOleDb.ts`) and the `PRODUCT_SOURCE=rics|local` flag exist only to support phases 1–2; in phase 3 they're removed. Zack's Retail is the system of record.

**How this affects day-to-day decisions:**
- A new feature spec must declare which phase it targets. A "Phase 1" feature MUST work against the live RICS MDBs read-only — no schema changes, no new tables. A "Phase 2" feature MAY introduce a new Postgres table but MUST keep the legacy RICS read path intact for modules that haven't cut over.
- Module specs in `docs/modules/<name>.md` should record which phase the module currently sits in and what gates the next transition.
- When porting RICS behavior, default to Phase 1 fidelity first (cite the manual page, match the behavior). "Improvements on the old system" are Phase 2 work and need their own justification — don't sneak them into a Phase 1 port.

## The framework in one paragraph

Superpowers ships auto-triggered skills that form a disciplined SDLC loop:

**brainstorm → write-plan → use-worktree → subagent-execute (with TDD) → verify → code-review → finish-branch**

You don't invoke skills by name. They trigger from context. What you *do* choose is the **starting surface** — plain Claude Code or a domain subagent — and the **mode** (plan mode vs. normal).

## When to use which agent

| Scenario | Start with | Mode |
|---|---|---|
| Whole-project architecture, scope, cross-module decisions | Plain Claude Code | Plan mode |
| Module-scoped plan (products, storefront, or RICS analysis) | Domain subagent (`products-dev`, `storefront-dev`, `rics-module-analyst`) | Plan mode |
| Brainstorm general specs | Plain Claude Code | Normal |
| Brainstorm a spec derived from the RICS v7.7 manual | `rics-module-analyst` | Normal |
| "Write the code, I'll test and iterate" | Plain Claude Code (delegates automatically) | Normal |
| Debug layout / UI / bugs (cross-layer) | Plain Claude Code | Normal |
| Debug a clearly module-scoped bug | The owning subagent | Normal |

**Rule of thumb:** one module's surface → start with that subagent. Crosses modules, architectural, or scope unclear → plain Claude Code and let it delegate.

## Existing subagents (`.claude/agents/`)

- **`products-dev`** — SKUs, taxonomy, pricing, content overlay, facets, ProductCard, ProductDetail, RICS product adapter, `docs/modules/products.md`.
- **`storefront-dev`** — cart, checkout, orders, account, header/footer/layout, public API routes/services.
- **`rics-module-analyst`** — translates RICS v7.7 manual chapters into module specs in `docs/modules/`.

Superpowers does not replace these. `subagent-driven-development` dispatches work to them.

## Project stack

- Monorepo: **pnpm workspaces + Turbo**
- Backend: Node 20+, TypeScript, Express, **Jest**, **Prisma**, SQLite/PostgreSQL
- Frontend: React 18, Vite, Ant Design, TanStack Query, Zustand, **Vitest**, ECharts
- Legacy read-only: RICS v7.7 Access MDB files (adapter in `apps/api/.../services/ricsProductAdapter.ts`, flagged by `PRODUCT_SOURCE=rics|local`)
- Module specs: `docs/modules/*.md` are governed contracts, not scratchpads

## Non-WAT project rules that still apply

- **Deliverables** land in cloud services (Google Sheets, Slides, etc.), not local files
- **`.tmp/`** is disposable — regenerate as needed; don't rely on it persisting
- **`.env`** is the only place for secrets — never hardcode
- **`odoo-addons/`** and **`db/migrations/`** (legacy Odoo cutover plumbing) are NOT the target of new work. The Odoo migration was abandoned.

## Skill expectations (post-install)

Once `/plugin install superpowers@claude-plugins-official` is run, expect these to trigger automatically:

- `brainstorming` — gates you to "design approved before code"
- `writing-plans` — TDD-first, bite-sized plan files
- `subagent-driven-development` — implement → spec-review → code-review loop
- `dispatching-parallel-agents` — when independent investigations can run in parallel
- `using-git-worktrees` — isolated workspace per feature
- `test-driven-development` — RED-GREEN-REFACTOR
- `systematic-debugging` — root-cause first; circuit-break after 3 failed fixes
- `verification-before-completion` — no "done" without fresh evidence (run the dev server, run the test, show the output)
- `finishing-a-development-branch` — merge + cleanup

## Bottom line

Read the relevant module spec in `docs/modules/` before touching a module. Start in the right surface (plain Claude Code vs. subagent). Trust skills to trigger — don't invoke them manually. Never claim done without verification evidence.
