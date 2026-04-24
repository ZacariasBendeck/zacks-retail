# Zack's Retail — Architecture

Living overview of the system's current technical shape. Dated records of how decisions evolved live in [`dev/specs/`](dev/specs/). This file is the current source of truth for architecture-level decisions.

Scope: the technical system — folders, data flow, schemas, adapter layer, ETL, migration/cutover strategy, and development processes. Module detail lives in [`docs/modules/`](modules/). Company facts live in [`docs/COMPANY.md`](COMPANY.md). End-user flows live in [`docs/zacks-retail-manual/`](zacks-retail-manual/).

## Architecture rule: one-shot cutover

RICS remains the live operational system until cutover day. Zack's Retail is developed, tested, rehearsed, and enriched in Postgres, but it does **not** write back to RICS.

Hard rules:

- No writes from Zack's Retail into RICS MDB files.
- No Postgres → RICS sync agent.
- No bidirectional sync.
- No dual-write runtime architecture.
- No gradual operational cutover where both RICS and Zack's Retail are live systems of record.
- `rics_mirror` is trusted imported RICS source data, but it is not app-owned operational data.
- Final operational tables, primary keys, foreign keys, and module-owned schemas are established during the Cutover Migration.

The intended path is:

```text
Development Against RICS Mirror  →  Cutover Migration  →  Postgres-Only Operation
```

---

## Project shape

Monorepo — pnpm workspaces + Turbo.

| Path | Role |
|---|---|
| `apps/api/` | Express + Prisma API (Node 20+, TypeScript) |
| `apps/api/src/services/sync/` | ETL pipeline: RICS MDBs → Postgres `rics_mirror` |
| `apps/web/` | React 18 + Vite + Ant Design — storefront + admin UI |
| `packages/*` | Shared workspace packages |
| `docs/` | Living project documentation |
| `.claude/` | Claude Code configuration — commands, retired agents, skills |

Stack: Node 20+, TypeScript, Express, Prisma (`multiSchema` preview feature), PostgreSQL 16, Jest, React 18, Vite, Ant Design, TanStack Query, Zustand, Vitest, ECharts.

---

## Folder conventions

| Path | Purpose |
|---|---|
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Current technical architecture source of truth |
| [`docs/COMPANY.md`](COMPANY.md) | Business-general context |
| [`docs/PROJECT_STATUS.md`](PROJECT_STATUS.md) | Latest milestone + current work |
| [`docs/MODULES.md`](MODULES.md) | Module registry + RICS chapter mapping |
| [`docs/modules/`](modules/) | Per-module developer contracts |
| [`docs/zacks-retail-manual/`](zacks-retail-manual/) | End-user-only flows |
| [`docs/operations/`](operations/) | Cross-cutting hard rules and runbooks |
| [`docs/dev/specs/`](dev/specs/) | Dated technical decisions |
| [`docs/dev/plans/`](dev/plans/) | Dated implementation plans |
| [`docs/dev/handoffs/`](dev/handoffs/) | Session handoffs |
| [`docs/dev/milestones/`](dev/milestones/) | Tagged checkpoint snapshots |
| [`docs/rics-reference/`](rics-reference/) | RICS v7.7 user manual reference |
| [`.claude/commands/`](../.claude/commands/) | Project-specific slash commands |
| [`.claude/agents/`](../.claude/agents/) | Retired subagent files; never invoked |
| [`.claude/skills/`](../.claude/skills/) | Project-local skills loaded on demand |

---

## Data flow during development

```text
              operator-invoked only
              pnpm sync:rics
                     │
                     ▼
┌──────────────┐   ETL   ┌─────────────────────────────┐
│ RICS MDBs    │────────►│  Postgres rics_mirror.*     │
│ live system  │         │  atomic imported mirror     │
│ of record    │         └──────────────┬──────────────┘
└──────────────┘                        │ read-only source data
                                        ▼
                 ┌────────────────────────────────────────────┐
                 │ apps/api adapter layer                     │
                 │ ricsProduct / ricsInventory / reports      │
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

New app data, drafts, overlays, configuration, workflows
───────────────────────────────────────────────────────────►
                          Postgres public.*, app.*, platform.*
                          preserved across rics_mirror reloads
```

**Development invariant:** request handlers never open an MDB at request time. The only process that touches MDBs is the operator-invoked import ETL.
**Authority invariant:** once a surface has an app-owned authoritative table, request handlers read only from that table. `rics_mirror` is then ETL/bootstrap input only for that surface.

---

## Cutover model

### Development Against RICS Mirror

RICS remains operational. Stores, warehouse, POS, purchasing, receiving, and other live workflows continue in RICS.

Zack's Retail may:

- read imported RICS data from `rics_mirror`,
- build reports and new UI against Postgres,
- store drafts, enrichments, overlays, planning data, workflow state, and app-native configuration in Postgres,
- rehearse migration scripts repeatedly against imported data.

Zack's Retail must not:

- write into RICS MDBs,
- write into `rics_mirror`,
- create RICS-operational SKUs, POs, sales, inventory adjustments, or receiving documents,
- rely on foreign keys that point into `rics_mirror`.

### Cutover Migration

This is the planned switch day.

Cutover steps:

1. Stop RICS usage.
2. Take final MDB backup.
3. Run final RICS extraction/import into Postgres.
4. Promote or merge `rics_mirror` data into module-owned schemas.
5. Generate and validate primary keys.
6. Add and validate foreign keys.
7. Run reconciliation reports and business smoke tests.
8. Switch operators to Zack's Retail.

### Postgres-Only Operation

After cutover:

- RICS MDB files are archived.
- RICS extractor tooling is retired.
- `rics_mirror` is dropped or preserved only as an archived import snapshot, depending on the final runbook.
- Module-owned schemas are authoritative.
- Zack's Retail is the system of record.

---

## Net-new SKU creation during development

When an operator creates a SKU in Zack's Retail before cutover, it is an app-side draft/enrichment workflow, not an operational RICS SKU.

| Step | Writes to |
|---|---|
| Draft save | `app.sku`, `app.sku_activity` |
| Attribute save | `app.sku_attribute_assignment`, audit tables |
| Finalize inside app | `app.sku` lifecycle fields, attribute re-keying |
| AI image analysis | no DB writes unless explicitly saved by an app-owned flow |

Never written during this flow:

- RICS MDB files,
- `rics_mirror.*`,
- SQLite admin tables,
- any RICS operational table.

Operational SKU creation remains in RICS until cutover. App-created SKU records become operational only as part of the Cutover Migration.

### SKU attribute assignment keying

`app.sku_attribute_assignment.sku_code` is `VARCHAR(32)` so it can hold both a draft provisional code and a final code. During draft, assignments are keyed by `provisional_code`; on finalize, `skuLifecycleService.finalize()` rekeys assignments to the final code inside the same transaction. The `app.sku_attribute_orphans` view recognizes both `app.sku.code` and `app.sku.provisional_code` as valid targets.

---

## Schemas

Four schemas currently exist in the Postgres database.

- **`rics_mirror`** — Read-only, atomic reload. 1:1 mirror of every canonical RICS MDB table. Rebuilt by `pnpm sync:rics`. It may serve request-side reads only for surfaces that do not yet have an app-owned authoritative table. Once such a table exists, `rics_mirror` is ETL/bootstrap input only for that surface. Never write at request time — the next reload drops everything not owned by the ETL.
- **`public`** — Storefront-baseline tables that predate Phase A (`Cart`, `CartLine`, `Order`, `OrderLine`, `User`, `Session`, `Role`, `ProductContent`, `SeasonOverlay`, `ProductsAuditLog`). Preserved across ETL reloads. App writes freely here.
- **`app`** — Module-owned additive tables — net-new things Zack's Retail invents that RICS never had. Active surface as of 2026-04-23: products (`sku`, `sku_activity`, `sku_attribute_override`, `sku_keyword_override`, `size_type_override`, `products_batch_operation*`), extended attributes (`attribute_dimension`, `attribute_value`, `sku_attribute_assignment` + orphans view, `attribute_family_rule`), product family (`product_family`, `category_product_family`), plus the legacy-ref migration targets seeded 2026-04-23. Phase-A contract: writes go here freely; the `sync:rics` ETL never touches this schema.
- **`platform`** — Cross-cutting admin spine: ETL runs now; future audit, notification, feature flag, and scheduled task surfaces.

Foreign key rule:

- During development, use validation views/reconciliation queries for relationships to `rics_mirror`.
- Do not add FKs inside `rics_mirror`.
- Do not add FKs from app-owned tables into `rics_mirror`.
- Add the real FK graph during Cutover Migration, after tables are promoted into module-owned schemas.

---

## Adapter layer

Request handlers consume adapters that read from the current authoritative request-path surface. Early development adapters read from `rics_mirror`; after a surface gets an app-owned authoritative table, its request adapter must read only from that app-owned table. Every adapter may cache on top, but the source remains Postgres, not MDB files.

| Adapter | File | Serves |
|---|---|---|
| `ricsProductAdapter` | `apps/api/src/services/ricsProductAdapter.ts` | Storefront catalog, SKU Lookup modal, product detail, InvCatalog overlay |
| `ricsInventoryAdapter` | `apps/api/src/services/ricsInventoryAdapter.ts` | Inventory Inquiry, Find-by-Size, Detail Report, Change Detail, Transfer Summary, SKU×Store rollups, Recommended Transfers |
| `salesReporting/ricsSalesReportAdapter` | `apps/api/src/services/salesReporting/ricsSalesReportAdapter.ts` | Sales by Day/Time, Salesperson Summary, Best Sellers, Stock Status, Sales Analysis |
| `salesReporting/ricsSalesHistoryByMonthAdapter` | `...SalesHistoryByMonthAdapter.ts` | Monthly sales history, inventory-history 12-slot projections |
| `salesReporting/ricsOnHandAtCostAdapter` | `...OnHandAtCostAdapter.ts` | ROI / Turns feeder for Sales Analysis |
| `salesReporting/ricsInquiryRollupAdapter` | `...InquiryRollupAdapter.ts` | Per-SKU Week/Month/Season/Year rollup on Inquiry |

### Overlay pattern

Where the app needs draft/enrichment/override behavior before cutover, the write target is an app-owned table, not RICS.

| Overlay | Scope |
|---|---|
| `app.sku_attribute_override` | Sparse per-column overrides for mirrored SKUs |
| `app.sku_keyword_override` | ADD/REMOVE deltas layered on RICS keyword strings |
| `app.vendor_overlay` | Native/override/tombstone vendor behavior in Postgres |

Overlay writes affect Zack's Retail views only. They do **not** flow back to RICS. Warehouse/POS users in RICS see only RICS data until cutover. App-owned overlay and native rows become authoritative only when the module spec says they do; from that point on, request handlers read the app-owned authoritative surface, not `rics_mirror`.

---

## ETL pipeline

At `apps/api/src/services/sync/`:

| File | Role |
|---|---|
| `bulk-extract.ps1` | C#-hosted-in-PowerShell reader. Streams rows into Postgres COPY TEXT format. |
| `bulkExtract.ts` | Node side — spawns the PowerShell host and pipes stdout into `pg-copy-streams`. |
| `copyFromMdb.ts` | COPY TEXT pipe wrapper. |
| `ricsRefresh.ts` | Orchestrator. Owns atomic reload / swap behavior. |
| `canonicalRicsTables.ts` | List of RICS tables mirrored. |
| `typeMapping.ts` | RICS → Postgres type coercion. |

Invocation:

```bash
pnpm --filter @benlow-rics/api sync:rics
```

Verification:

```bash
pnpm --filter @benlow-rics/api verify:rics-mirror
```

Observability: ETL runs write to `platform.etl_run` and `platform.etl_run_table`.

---

## Cross-cutting hard rules

- **RICS is read-only from Zack's Retail.** No `INSERT`, `UPDATE`, or `DELETE` against MDB files.
- **`rics_mirror` is read-only from app code.** It is imported source data, not an app-owned write surface.
- **No Postgres → RICS sync agent.** Do not build one.
- **No runtime dual-write.** Cutover is rehearsed, then executed once.
- **Postgres-only for new development.** No new SQLite columns, no new keys on `app.sku.legacy_attrs`, and no new dependency on old SQLite reference tables.
- **OLEDB helper stays async.** Use `child_process.spawn`, never `spawnSync`.
- **SKU Lookup index warmup covers every SKU.** Never cap it.
- **Currency: HNL plain numbers.** No `$`, `USD`, or `L` symbol inside data cells, charts, CSV, or XLSX.
- **`legacy/` is retired.** Do not recreate it.

---

## Authentication

Session-based auth with Postgres-backed `User`, `Session`, and `Role` tables in `public`. Password hashing uses a bcrypt-family implementation. SSO is not implemented yet. Admin-side permissions are role-scoped; per-line permission gating for reports is not fully implemented.

---

## Development processes

### Slash commands

| Command | Purpose |
|---|---|
| `/milestone <label>` | Record a project milestone — verify, write milestone doc, sandwich-commit, tag, push |
| `/index-knowledge` | Route insights to the right docs |
| `/sync-module-docs [slug]` | Audit module docs vs. code reality |
| `/new-manual-chapter <slug>` | Scaffold an end-user manual chapter |
| `/verify-rics-mirror` | End-to-end mirror verification |

### Commit discipline

- Commit direct to `master` unless the operator explicitly chooses otherwise.
- Conventional Commits style: `feat(scope)`, `chore(scope)`, `docs(scope)`, `fix(scope)`.
- Co-authored-by line on commits made via Claude Code.

### Sandwich-commit pattern

Used for reversible multi-file documentation or migration passes:

1. If the working tree is dirty, commit it as a snapshot before the pass.
2. Apply the pass.
3. Commit the pass as one distinct commit.

### Adapter migration method

Pattern used to migrate request-side reads from MDB access to `rics_mirror`:

1. Read the old OLEDB SQL and map it to the matching `rics_mirror` table.
2. Translate SQL syntax to Postgres.
3. Preserve projection shape via aliases so downstream code does not change.
4. Parameterize all caller-supplied values.
5. Keep known RICS quirks explicit, such as padded SKU codes in ticket tables.
6. Verify live before committing.

This method migrates reads only. It is not a RICS write strategy.

### Prisma migration authoring

Two helper scripts gate the Prisma migration workflow.

| Script | What it does |
|---|---|
| `pnpm migrate:new <description>` | Scaffolds a migration folder with seconds-precision timestamp and header template. |
| `pnpm migrate:lint` | Flags duplicate timestamps, weak headers, unsafe DROP, and undeclared schema references. |

Applied migrations are not renamed mid-project because `_prisma_migrations` tracks them by name. Squashing/baselining belongs to the Cutover Migration on a fresh production database.

### App-data bootstrap

After `prisma:migrate` and `sync:rics`, app-owned seed/import work can run as:

```bash
pnpm --filter @benlow-rics/api bootstrap:app-data
```

This seeds product families, imports attributes, seeds SKU attributes, and syncs mirrored RICS SKUs into app-owned SKU lifecycle state where applicable. This is Postgres-side preparation only; it does not write to RICS.

---

## How this document evolves

- This file should reflect the current architecture, not historical alternatives.
- If a dated spec conflicts with this file, this file wins until the spec is revised or archived.
- Dated decisions remain in `docs/dev/specs/`; reference them instead of duplicating long explanations here.
- Keep this file concise enough that agents can read it before coding.
