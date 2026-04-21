# Milestone: rics-mirror-live

**Date:** 2026-04-21
**Tag:** `milestone-2026-04-21-rics-mirror-live`
**Phase:** A
**Previous milestone:** `rics-baseline-pre-postgres` (commit `0a416c0`, 2026-04-20)

## Summary

Phase A goes live: the RICS → Postgres one-way mirror ETL is implemented, the foundational schemas (`rics_mirror`, `platform`, `app`) are in place, `legacy/` is retired along with its runtime consumers, subagents are retired in favor of slash commands, and the Zack's Retail user manual is scaffolded as the forward spec (replaces the RICS v7.7 manual).

## What shipped

### Sync / ETL pipeline
- C#-hosted-in-PowerShell bulk extractor at [apps/api/src/services/sync/bulk-extract.ps1](apps/api/src/services/sync/bulk-extract.ps1) — streams ACE.OLEDB.12.0 reads directly to Postgres COPY TEXT format, no JSON round-trip.
- Node-side pipe at [apps/api/src/services/sync/bulkExtract.ts](apps/api/src/services/sync/bulkExtract.ts), [copyFromMdb.ts](apps/api/src/services/sync/copyFromMdb.ts), [ricsRefresh.ts](apps/api/src/services/sync/ricsRefresh.ts) — owns the atomic swap transaction.
- Canonical RICS table list at [apps/api/src/services/sync/canonicalRicsTables.ts](apps/api/src/services/sync/canonicalRicsTables.ts); type mapping at [typeMapping.ts](apps/api/src/services/sync/typeMapping.ts).
- Runner scripts: [scripts/sync-rics.ts](apps/api/scripts/sync-rics.ts), [scripts/verify-rics-mirror.ts](apps/api/scripts/verify-rics-mirror.ts).
- Package scripts: `sync:rics` and `verify:rics-mirror`.
- Tests: [apps/api/tests/sync-typeMapping.test.ts](apps/api/tests/sync-typeMapping.test.ts).
- Operations doc: [docs/operations/rics-mirror-sync.md](docs/operations/rics-mirror-sync.md).

### Schemas and migrations
- Migration: `20260421024816_rics_mirror_and_etl_log`.
- New schemas: `app` (empty, reserved for future module-owned tables), `platform` (ETL observability), `rics_mirror` (27 tables mirroring canonical RICS tables).
- Observability tables: `platform.etl_run`, `platform.etl_run_table`.

### Slash commands
- [.claude/commands/sync-module-docs.md](.claude/commands/sync-module-docs.md) — audit module docs vs. code reality.
- [.claude/commands/new-manual-chapter.md](.claude/commands/new-manual-chapter.md) — scaffold a user-manual chapter (forward-spec semantics).
- [.claude/commands/verify-rics-mirror.md](.claude/commands/verify-rics-mirror.md) — end-to-end mirror verification (sync + canary + row-counts).
- [.claude/commands/milestone.md](.claude/commands/milestone.md) — lean milestone ceremony (this command).

### Docs
- **Zack's Retail user manual scaffolded** at [docs/zacks-retail-manual/](docs/zacks-retail-manual/): [INDEX.md](docs/zacks-retail-manual/INDEX.md) + 14 chapter stubs (products, inventory, physical-inventory, purchasing, otb-planning, sales-pos, customer-transactions, sales-reporting, crm, accounts-receivable, employees, store-ops, platform, purchase-planning). This manual **supersedes the RICS v7.7 manual** as the forward spec; the RICS manual is now ancestry only.
- [CLAUDE.md](CLAUDE.md) rewritten: data-surfaces reshape documented; rollout phases renamed A/B/C (old 1/1.5/2/3 explicitly deprecated with migration notes); agents section replaced with slash-commands-only model.
- [docs/MODULES.md](docs/MODULES.md): Owner columns reassigned to operator-owned; storefront-dev footnote rewritten.
- [docs/operations/rics-mirror-sync.md](docs/operations/rics-mirror-sync.md): new ETL operations reference.

### Cleanup
- `legacy/` retired: `MIGRATION_RUNBOOK.md`, `README.md`, all `sqlite-migrations/*.sql` files deleted.
- Runtime consumers removed: `apps/api/scripts/verifyMigration0{10,11,14,15,16,17,19}.ts`, `apps/api/tests/ledgerCoverage.test.ts`, `apps/api/tests/physicalInventory.test.ts`.
- `db/*.md` deleted (API_SHAPE_ALIGNMENT, CATEGORY_FILTER_CONTRACT, ER_DIAGRAM, SALES_LEDGER_OTB_API_CONTRACT).
- Stale spec artifact removed: `Project Specifications/Faceted_Search_Spec_v2.docx.txt`.

### Subagents retired
- Agent definition files deleted from `.claude/agents/`. See CLAUDE.md and `docs/MODULES.md` for the new operator-owned model.

## Migrations applied

- `20260419180000_add_season_overlay` (already applied pre-baseline)
- `20260421024816_rics_mirror_and_etl_log` ← this milestone

## Next

Pick the first module to cut over from OLEDB-at-request-time reads to `rics_mirror` reads. Recommended candidate: **products** (the spec is the most mature; the SKU Lookup index warmup path is the obvious first target). A Phase-A-cutover plan for products belongs in `docs/dev/plans/` before code changes.

## Notes

- Managed-Postgres provider still deferred. Dev runs on local Docker Postgres at `localhost:5433`; no cloud provider chosen.
- Most modules still read RICS through the OLEDB adapter at request time. Cutover to `rics_mirror` reads happens module-by-module in subsequent milestones.
- The `app` schema is empty by design — it's reserved for future module-owned additive tables (cleanly separated from `public` which holds the storefront baseline).
