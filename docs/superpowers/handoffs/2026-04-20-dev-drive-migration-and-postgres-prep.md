# Session Handoff — 2026-04-20

**Purpose of this document.** I (the previous Claude session) finished the dev-environment migration out of OneDrive and onto a Windows 11 Dev Drive, set up the GitHub remote, and agreed with the operator on the overall direction for the Postgres migration. The operator then switched to a fresh Claude Code session inside the new repo location (here at `E:\dev\zacks-retail`) to continue the work. This file is the bridge. Read it top to bottom before doing anything else — it contains both the state of the environment and the state of the project thinking.

---

## 1. Who you are and what we're building

You are working on **Zack's Retail** — a modern web-based inventory and retail-operations system intended to replace **RICS**, the team's legacy Windows/Access-based system used by a chain of Honduran shoe stores. Full project brief lives in [CLAUDE.md](../../../CLAUDE.md) at the repo root; module registry in [docs/MODULES.md](../../MODULES.md); per-module specs in [docs/modules/](../../modules/).

RICS is **still live in the stores**. Operators are still entering sales, POs, inventory moves into it daily. The new system is pre-production — not yet rolled out anywhere. That's the constraint that drives everything about the data-layer strategy below.

Currency: **Honduran Lempira (HNL)**. Single-currency system. No `$`, no `USD`, no currency symbol in cell/grid/chart output — plain numbers with thousands separators only. Include a note like "Amounts in Lempira (HNL)" once at the top of reports/pages where unit clarity matters. This is an enforced rule, see [CLAUDE.md](../../../CLAUDE.md).

---

## 2. User preferences — write these into `MEMORY.md` before you do anything else

The auto-memory is project-keyed. You just started in `E:\dev\zacks-retail\`, which is a new project slug, which means your `MEMORY.md` is empty. The preferences below were in the previous session's memory. Write them into your memory now so you behave consistently with what the operator expects.

1. **Minimize clarifying questions.** Operator prefers you act on stated assumptions. One question max before proposing a design, not a long Q&A chain. When in doubt, propose and let them redirect.
2. **No new branches, no worktrees.** Ever. All work is committed directly to `master`. This overrides superpowers skills that want to create feature branches. Reconfirmed this session — stays in effect.
3. **Currency formatting.** Plain numbers, comma thousands separators, no currency symbol in cells/charts/CSV/XLSX. One-line unit note at the page top where clarity matters. Never `$`, `USD`, or `en-US` currency formatters.
4. **Framework is Superpowers (SDD), not WAT.** The grandparent `CompartidoZBIA/CLAUDE.md` describes an older WAT framework; that does not apply here. Don't reintroduce WAT vocabulary.
5. **Odoo migration was abandoned.** `legacy/` folder holds artifacts from that effort. Never extend. `legacy/sqlite-migrations/` is still referenced at runtime by `apps/api/scripts/verifyMigration*.ts` and two test files — leave those in place. `legacy/odoo-addons/` was deleted in this session.
6. **SKU Lookup index warmup.** Required startup process — API pre-loads the full `InventoryMaster` table into memory. Never re-cap or remove. See [docs/operations/sku-lookup-index-warmup.md](../../operations/sku-lookup-index-warmup.md).
7. **Access OLE DB helper must stay async.** `apps/api/src/services/accessOleDb.ts` uses `child_process.spawn`, never `spawnSync`. Flipping to sync freezes the event loop. See [docs/operations/access-oledb-async-spawn.md](../../operations/access-oledb-async-spawn.md).

---

## 3. State of the dev environment at handoff time

| Thing | Value |
|---|---|
| Repo location | `E:\dev\zacks-retail\` (Windows 11 Dev Drive at `E:\`, ReFS formatted, 100 GB VHDX, Defender perf-mode on) |
| Old OneDrive location | `C:\Users\zbend\OneDrive\CompartidoZBIA\Paperclip ClaudeCode Repo - copia\` — **dead weight**, kept only as a fallback until the new setup is proven. Don't edit anything there. |
| RICS MDBs | `E:\data\rics-mdbs\` (copied from the OneDrive sibling folder; 8.6 GB, 77 files) |
| pnpm store | `E:/pnpm-store` (redirected via `pnpm config set store-dir`) |
| GitHub remote | `https://github.com/ZacariasBendeck/zacks-retail` (private) |
| Current branch | `master` (tracking `origin/master`) |
| Restore-point tag | `rics-baseline-pre-postgres` at commit `0a416c0` — go back there if we ever need the pre-Postgres state |
| `.env` files | `E:\dev\zacks-retail\.env` AND `E:\dev\zacks-retail\apps\api\.env` (the dev script reads the latter) |
| `.env` contents | `RICS_DB_DIR=E:/data/rics-mdbs`, placeholder `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder` |
| API boot state | Verified working — 15/16 warmup phases OK in ~3.5 s. Only failing phase: `prisma:bootstrap-owner` (expected — fails against the placeholder DATABASE_URL, will resolve when real Postgres is set up). |

**Dev flow verified from VS Code** — user opened `E:\dev\zacks-retail\` in a new VS Code window and successfully ran `pnpm --filter @benlow-rics/api dev` from the integrated terminal.

---

## 4. The project decision that matters most

**Phase 1 → 2 → 3 rollout stays.** The operator briefly considered a one-shot RICS → Postgres migration followed by retiring the adapter immediately, but that's off the table because RICS is still taking live writes. A one-shot dump would go stale the minute the copy completed. Two viable paths:

- **Status quo (Phase 1):** API reads live from RICS MDBs through the PowerShell/OLEDB adapter ([apps/api/src/services/ricsProductAdapter.ts](../../../apps/api/src/services/ricsProductAdapter.ts), [apps/api/src/services/accessOleDb.ts](../../../apps/api/src/services/accessOleDb.ts)). This is what's running today.
- **Replica pattern (Phase 1.5 — the direction we're going):** A periodic ETL pulls from the MDBs into a Postgres "raw_rics" landing zone, then transform jobs shape it into clean module schemas the app reads from. Operator confirmed cadence: **weekly, manually triggered** for now. Can tighten later if needed.

**Cutover stays module-by-module.** Each module transitions from "ETL-maintained mirror in Postgres" → "writes go to Postgres natively" at its own pace. See the per-module phase-gate logic in each `docs/modules/*.md`.

---

## 5. The Postgres architecture we agreed on

The operator and I spent substantial time designing this. The details are in this Claude session's history but not yet committed as a spec. **The next immediate job is to commit it as a spec file.** Here's the shape so you can write the spec from a position of knowledge:

### 5.1 Why Postgres

Decision recorded as ADR-0001 in spec-to-come: **Postgres 16 as the system-of-record.** Alternatives genuinely considered and rejected: MySQL (no technical upside), SQL Server (license cost, no upside), SQLite (not multi-writer), MongoDB (wrong paradigm for ledger-driven retail), CockroachDB/Yugabyte (over-scaled). Postgres wins on every dimension that matters for this workload — strong consistency, rich SQL for reporting, schema isolation, NUMERIC for money, timestamptz, trigram + full-text search, Prisma alignment, free.

### 5.2 Schema layout — one database, schema per module

```
zacks_retail  (database)
├── shared          — enums, helper types, touch_updated_at() trigger function
├── products        — sku, vendor, department, category, size_type, price_change, …
├── inventory       — stock_on_hand, movement, transfer, count_session, …
├── store_ops       — store, tax_rate, tender_type, company_setting, …
├── employees       — user, role, permission, session, salesperson, time_clock, …
├── purchasing      — purchase_order, po_line, po_receipt, …
├── otb_planning    — otb_plan, otb_plan_row, otb_policy_audit, …
├── sales_pos       — ticket, ticket_line, shift, pay_out, …
├── customer_tx     — special_order, layaway, gift_cert, house_charge, …
├── crm             — customer, family_member, quote, …
├── accounts_rec    — ar_account, ar_payment, gl_summary, …
├── sales_reporting — materialized views + snapshot tables
├── platform        — audit_log, notification, feature_flag, scheduled_task, etl_run
└── raw_rics        — ETL landing zone; mirrors RICS tables 1:1; never read by app code
```

13 module schemas + `shared` + `raw_rics`. Each schema name maps 1:1 to a module in [docs/MODULES.md](../../MODULES.md). Grants are per-schema so service roles are bounded.

### 5.3 Baseline conventions (every table follows these)

| Convention | Detail |
|---|---|
| PK | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`. Preserve RICS codes as `rics_code text UNIQUE NOT NULL` alongside when the natural key matters (SKU, vendor). |
| Timestamps | `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` — refreshed by a `BEFORE UPDATE` trigger calling `shared.touch_updated_at()`. |
| Time zones | Always `timestamptz`. App normalizes to `America/Tegucigalpa` at the display edge. |
| Soft delete | Opt-in, not default. Where used: `deleted_at timestamptz NULL` + partial index `WHERE deleted_at IS NULL`. |
| Money | `numeric(12,2)`. No currency column. No floats. |
| Multi-store | Any store-scoped row has `store_id uuid NOT NULL REFERENCES store_ops.store(id)`. |
| FKs | Always explicit and named (`fk_<table>_<col>`), `ON DELETE RESTRICT` unless CASCADE is specifically wanted (e.g. `cart_line → cart`). |
| Names | `snake_case`, singular (`sku` not `skus`). Indexes `idx_<table>_<cols>`. Constraints `chk_<table>_<what>`. |
| Enums | Postgres `ENUM` types or `text + CHECK`, centralized in `shared`. |
| Audit | Cross-cutting `platform.audit_log(actor_id, entity_schema, entity_table, entity_id, action, before_jsonb, after_jsonb, at)`. Opt-in per module where RICS auditing existed. |

### 5.4 Prisma setup

Single `schema.prisma` file with `previewFeatures = ["multiSchema"]`, `schemas = [...list of schemas...]`, each model annotated with `@@schema("<name>")` and `@@map("<snake_case_table>")`. Prisma Migrate handles forward-only migrations. For things Prisma can't express (triggers, `CREATE INDEX CONCURRENTLY`, materialized views, data migrations), use `prisma migrate dev --create-only` to scaffold a blank migration and hand-edit the SQL. Escape hatch, not default path.

### 5.5 Migration workflow — forward only, expand/contract for destructive changes

- Files: `apps/api/prisma/migrations/<timestamp>_<snake_case_description>/migration.sql`.
- Dev: `prisma migrate dev --name <name>` diffs `schema.prisma` vs. shadow DB, writes SQL, applies to dev DB, regenerates client.
- Prod: `prisma migrate deploy` applies unapplied migrations in order.
- **Never edit an applied migration.** Wrong? Write a new forward migration that fixes it.
- **No down-migrations maintained.** Rollback = new forward migration.
- **Expand/contract for destructive changes.** To drop a column: release 1 stops using it, release 2 drops it. To rename: add new → dual-write → backfill → cut-over → drop old, across multiple deploys. This is non-negotiable.

### 5.6 ELT shape

Not ETL — **ELT**. Extract RICS verbatim → load into `raw_rics.*` (exact mirror, same quirks, Windows-1252 text preserved) → transform into clean module schemas with SQL or Prisma jobs. Why: replay buffer, cheap transform iteration, parity debugging surface. The ETL worker lives in a new `apps/sync-worker/` or as a scheduled handler inside `apps/api`. Uses the same PowerShell persistent host at [apps/api/src/services/persistentPwsh.ts](../../../apps/api/src/services/persistentPwsh.ts).

### 5.7 Deployment (open decision — need operator input)

Managed Postgres, not self-hosted. Provider not yet chosen. Operator will decide among:

- **Supabase** — opinionated, great DX, includes auth/storage you may not need, branching via fork-and-merge.
- **Neon** — Postgres with true branching (per-PR ephemeral DBs), serverless compute, very fast cold starts.
- **AWS RDS / Aurora Postgres** — heavier setup, fits if team is already on AWS.
- **On-prem Postgres + Patroni HA** — only if ops muscle is available. Probably not.

Recommended default if operator doesn't choose: **Supabase** for simplicity, **Neon** if branching DBs sound appealing, **RDS** if there's already an AWS footprint. Operator had not chosen at handoff time.

---

## 6. What's committed vs. what's still in this Claude's head

**Committed to master (locally and on GitHub):**
- The legacy/odoo-addons/ deletion (10 files gone; no Node imports).
- The CLAUDE.md line-87 fix (was pointing at paths that never existed at the repo root; now describes `legacy/` accurately).
- All 17 other in-flight working-tree modifications the operator had accumulated before this session (RICS adapter tweaks, startup report, Inquiry UI changes, docs) — folded into the baseline snapshot commit `0a416c0`.
- Tag `rics-baseline-pre-postgres` on that commit.

**Not yet committed — still to be written:**
- The Postgres architecture design spec (the whole section 5 above, formalized).
- A Phase 0 implementation plan (foundation: stand up Postgres, baseline schemas, ETL runner skeleton).
- A products-module schema spec (Phase 1 first module).

---

## 7. What to do next, in order

1. **Read [MEMORY.md](../../../.claude/memory/MEMORY.md) if it exists at the new project path.** (Auto-memory is at `C:\Users\zbend\.claude\projects\<slug>\memory\MEMORY.md`; the new slug will likely be something like `e--dev-zacks-retail`.) If it's empty, write the preferences from section 2 of this document into it.
2. **Ask the operator the single outstanding question: which managed Postgres provider?** Shortlist: Supabase / Neon / RDS / other. If the operator wants a comparison tailored to this project, provide one (300 words max, focus on: price at retail scale, HA story, PR-branch DBs, ops complexity). If the operator says "pick one," default to Supabase unless there's a stated cloud preference.
3. **Write the Postgres architecture design spec** at `docs/superpowers/specs/2026-04-20-postgres-architecture-design.md`. Use the `superpowers:brainstorming` and `superpowers:writing-plans` skill discipline — present sections, get per-section approval, commit, self-review. Content is already 90% thought-through in section 5 above; you're formalizing, not inventing.
4. **Get operator approval on the spec.**
5. **Invoke `superpowers:writing-plans`** to produce a Phase 0 implementation plan (stand up Postgres instance + baseline shared schema + `platform.audit_log` + `platform.etl_run` + empty module schemas + ETL runner skeleton). Phase 0 is infrastructure only — no user-visible change.
6. **Execute Phase 0.**
7. **Start Phase 1 (products module end-to-end):** per-module schema spec → migrations → ETL extract + transform for products — → parity tests → feature-flag cutover (`PRODUCTS_SOURCE=rics|postgres`). This is the vertical slice that proves the whole pattern.
8. **Subsequent modules in dependency order:** store_ops → employees → inventory → purchasing → otb_planning → crm → sales_pos → customer_tx → accounts_rec → sales_reporting → physical_inventory → platform evolves throughout.

Each module takes roughly 2–3 weeks. Full RICS replacement on Postgres is a 9–12 month engineering effort at steady pace.

---

## 8. Hard rules — quick reference

Pulled from [CLAUDE.md](../../../CLAUDE.md); do not violate:

- **No branches, no worktrees.** Commit to `master` directly.
- **`accessOleDb.ts` must stay async.** No `spawnSync`.
- **SKU Lookup index warmup stays.** Don't cap, don't remove.
- **Currency: no symbols in cells/charts.** Plain numbers, comma thousands, two decimals.
- **RICS is read-only.** Never `INSERT`/`UPDATE`/`DELETE` against a `.MDB` file.
- **`.tmp/` is disposable**, `.env` holds secrets, `odoo-addons/` and `db/migrations/` (at repo root) don't exist — `legacy/` is where the abandoned Odoo artifacts live, do not extend.

---

## 9. Files the next Claude should know about

| Path | Why it matters |
|---|---|
| [CLAUDE.md](../../../CLAUDE.md) | Master project guide, hard rules, rollout phases |
| [docs/MODULES.md](../../MODULES.md) | Module registry, dependency graph, RICS chapter mapping |
| [docs/modules/](../../modules/) | Per-module specs (products.md is the most mature) |
| [docs/operations/sku-lookup-index-warmup.md](../../operations/sku-lookup-index-warmup.md) | SKU Lookup hard rule reference |
| [docs/operations/access-oledb-async-spawn.md](../../operations/access-oledb-async-spawn.md) | Async spawn hard rule reference |
| [apps/api/src/services/accessOleDb.ts](../../../apps/api/src/services/accessOleDb.ts) | PowerShell + OLEDB reader for RICS MDBs |
| [apps/api/src/services/ricsProductAdapter.ts](../../../apps/api/src/services/ricsProductAdapter.ts) | Product adapter with TTL cache and warmup |
| [apps/api/prisma/schema.prisma](../../../apps/api/prisma/schema.prisma) | Current Prisma schema (storefront-only tables — this is what the Postgres work will massively expand) |
| [apps/api/src/services/startupReport.ts](../../../apps/api/src/services/startupReport.ts) | Startup report aggregator — shows the 15/16 phases we verified working |
| `E:\data\rics-mdbs\` (not in git — data, not code) | The MDB files the ETL will extract from |

---

## 10. If the new Claude wants to verify the environment is actually working

Run this from `E:\dev\zacks-retail\` in a terminal:

```
pnpm --filter @benlow-rics/api dev
```

Expected output within ~5 seconds:

```
RICS API server running on http://localhost:4000
Swagger docs: http://localhost:4000/api-docs
──────────────────────────────────────────
  API startup report — 15/16 ok in ~3500ms  (1 failed)
──────────────────────────────────────────
  ... 15 ok lines ...
  [err] prisma:bootstrap-owner  — authentication failed (placeholder URL)
──────────────────────────────────────────
```

If you see this, the new environment is healthy. The prisma:bootstrap-owner failure is expected and resolves when a real DATABASE_URL replaces the placeholder.

---

## 11. Session history TL;DR

1. Architecture review of the current code revealed ~six god-class services >800 LoC, authorization applied on only 2/35 route files, wildcard CORS, empty `packages/shared-types`, and `legacy/` drift from CLAUDE.md. Full review in this Claude's session history.
2. Retired `legacy/odoo-addons/` (confirmed no Node imports). Did NOT delete `legacy/sqlite-migrations/` — still has 9 runtime consumers.
3. Fixed `CLAUDE.md` line 87 to describe `legacy/` accurately.
4. Designed the Postgres architecture (section 5 above).
5. Confirmed Postgres is the right DB (section 5.1).
6. Committed + tagged + pushed to GitHub: `rics-baseline-pre-postgres` at `0a416c0`.
7. Freed 183 GB of disk: deleted 158 GB of OneDrive sync logs + 25 GB of `Windows.old`.
8. Created a 100 GB Windows 11 Dev Drive at `E:\` (VHDX at `C:\DevDrives\dev.vhdx`, ReFS formatted, trusted).
9. Cloned the repo to `E:\dev\zacks-retail\`. Copied the 8.6 GB of RICS MDBs to `E:\data\rics-mdbs\`. Redirected pnpm store to `E:/pnpm-store`. Created both `.env` files. Generated Prisma client. Killed the old OneDrive-based API (PID 56636 was holding port 4000). Booted the new API and verified 15/16 warmup phases OK in 3.5 s.
10. Operator switched Claude Code to a new session in the new folder. This handoff is the bridge.

Good luck. Keep the design honest and the commits small.
