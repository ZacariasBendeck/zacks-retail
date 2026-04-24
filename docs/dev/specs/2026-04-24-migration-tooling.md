# Migration authoring tooling + hygiene audit

**Date:** 2026-04-24
**Source:** `/index-knowledge` pass — routing of migration-workflow improvements identified during the vendor overlay build.
**Type:** Design decision + hygiene audit
**Scripts:**
- [`apps/api/scripts/migrations/migrate-new.ts`](../../../apps/api/scripts/migrations/migrate-new.ts)
- [`apps/api/scripts/migrations/migrate-lint.ts`](../../../apps/api/scripts/migrations/migrate-lint.ts)
- [`apps/api/scripts/bootstrap-app-data.ts`](../../../apps/api/scripts/bootstrap-app-data.ts)

## Context

18 Prisma migrations shipped in the first ~7 days of the project. Authoring was hand-rolled (pick a timestamp, `mkdir`, write SQL, remember to edit `schema.prisma`, remember to `prisma migrate deploy`). Three observable failure modes:

1. **Duplicate timestamps.** Three pairs of folders share the same 14-char `YYYYMMDDHHMMSS` prefix (`20260422140000_*`, `20260423120000_*`, `20260423140000_*`). Prisma breaks the tie by lexicographic suffix, so "works today" — but rename either folder in a pair and apply-order flips.
2. **Micro-migrations during active schema design.** `app.sku` evolved across 5 separate migrations in 48 hours (`app_sku_lifecycle`, `sku_check_relax`, `sku_legacy_attrs`, `sku_add_perks_discount_code`, `app_sku_rics_source`). Normal during design; noise post-cutover.
3. **Authoring overhead.** The vendor-overlay migration required: manually pick a timestamp ahead of everything else, `mkdir` the folder, scaffold the SQL, remember the `schema.prisma` update, run `prisma migrate deploy`, regenerate the client. No lint, no scaffold, no guardrails.

## Decision

Three scripts, added 2026-04-24. They don't change anything about already-applied migrations (see §Non-goals); they change how new ones get authored + validated.

### `pnpm migrate:new <description>`

Scaffolds a migration folder with a **seconds-precision** timestamp (`YYYYMMDDHHMMSS`), not the minute-precision Prisma generates by default. That single change prevents the whole class of duplicate-timestamp bugs — two authors would have to invoke the command in the same second to collide, and the script's post-check catches even that.

What it does:

- Normalizes the description (lowercases, collapses whitespace + non-alphanum to `_`)
- Generates `apps/api/prisma/migrations/<YYYYMMDDHHMMSS>_<description>/migration.sql`
- Writes a header template with `-- TODO` markers for **schema** (which of `rics_mirror` / `app` / `platform` / `public`), **rationale**, and **rollback plan**
- Prints a next-steps reminder: fill in SQL, update `schema.prisma`, run `prisma migrate deploy`, run `pnpm migrate:lint`

What it doesn't do: no `schema.prisma` touch, no `prisma migrate` invocation. Deliberately — those are the author's to do, post-scaffold.

### `pnpm migrate:lint`

Static check over the migrations folder. Flags:

| Check | Severity | Detects |
|---|---|---|
| Duplicate timestamps | **error** | Two folders sharing the same 14-char prefix |
| Missing header comment | warning | First non-blank line should start with `--` and be >10 chars |
| Unsafe DROP | warning | `DROP TABLE/COLUMN/CONSTRAINT/INDEX/SCHEMA/VIEW/TYPE` without `IF EXISTS` (rollback-safety smell) |
| Undeclared schema reference | **error** | `"schema"."table"` or `CREATE SCHEMA "schema"` where `schema` isn't in `datasource db { schemas = [...] }` (Postgres built-ins whitelisted) |

Exit 0 on clean, 1 on any error. Ready to gate CI before `prisma migrate deploy`.

The schema-reference check uses a negative lookbehind `(?<!\.)` to skip the middle term in triple-qualified `"app"."sku"."col"` references (otherwise `sku` would be flagged as an undeclared schema). SQL line comments (`--`) and block comments (`/* */`) are stripped before scanning to avoid false positives on prose inside headers.

### `pnpm bootstrap:app-data`

Single orchestrator for the four-step app-data seed that runs after `prisma:migrate` and `sync:rics`:

1. `seed:product-families`
2. `import:attributes` (auto-detects the latest `attribute-catalog-export-*.json` in `docs/Important-Final-Docs/`, falls back to repo root / `apps/api/`)
3. `seed:sku-attributes`
4. `sync:rics-skus`

Each step is spawned as a child process with `stdio: 'inherit'` for live output. Per-step timing. Halts the chain on any non-zero exit. Flags: `--dry-run`, `--snapshot <path>`, `--skip-product-families`, `--skip-attributes-import`, `--skip-sku-attributes`, `--skip-sku-sync`.

Individual scripts remain on their existing `pnpm seed:*` / `pnpm import:attributes` / `pnpm sync:rics-skus` entry points for targeted re-runs.

## Current-state audit

Output of `pnpm migrate:lint` as of 2026-04-24:

```
Scanning 18 migration(s)...
Declared schemas: public, platform, rics_mirror, app

✗ ERROR  Duplicate timestamp 20260422140000: app_product_family, report_templates
✗ ERROR  Duplicate timestamp 20260423120000: attribute_family_rules, sku_add_perks_discount_code
✗ ERROR  Duplicate timestamp 20260423140000: report_runs, widen_sku_attr_assignment_code
! WARN   20260423120000_attribute_family_rules:67  Unsafe DROP without IF EXISTS: DROP CONSTRAINT
! WARN   20260423120000_attribute_family_rules:69  Unsafe DROP without IF EXISTS: DROP INDEX
! WARN   20260423120000_attribute_family_rules:72  Unsafe DROP without IF EXISTS: DROP COLUMN

3 error(s), 3 warning(s).
```

3 real errors, 3 real warnings, zero false positives. Documented here because the errors can't be fixed without renaming applied folders — see §Non-goals.

## Non-goals

**Squashing applied migrations into fewer baseline migrations.** Every environment's `_prisma_migrations` table tracks which migrations were applied by name. Renaming or removing already-applied migrations breaks the tracker and blocks every subsequent `prisma migrate deploy`. The legitimate moment to squash is the Phase B cutover on the fresh production DB — at that point, the three duplicate-timestamp pairs go away, the micro-migrations collapse into ~3 baseline migrations (one per schema), and the unsafe-DROP warnings get resolved the same way.

**Fixing the three pre-existing duplicate-timestamp pairs.** Same reason. The lint flags them so nobody accidentally adds a fourth thinking it's fine.

**Auto-applying migrations inside `migrate:new`.** Deliberately left out. The author should review the scaffolded SQL + write the matching Prisma model before `prisma migrate deploy`. A "generate + apply" button tempts skipping that review.

## Related

- [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) §Prisma migration authoring + §App-data bootstrap — short-form reference for the three scripts.
- [`docs/Important-Final-Docs/Migration-Steps-From-Scratch.md`](../../Important-Final-Docs/Migration-Steps-From-Scratch.md) — full rebuild sequence; now uses `bootstrap:app-data` as a single step.
