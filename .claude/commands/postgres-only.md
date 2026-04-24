---
description: Restate the "Postgres is the only database" rule and run a quick audit of the current working tree for any new SQLite code being introduced. Invoke before any migration or data-layer change so the rule is fresh in context.
---

# postgres-only

The single hard rule for every data-access change in this repo:

> **1. You will only read from Postgres.**
> **2. You will only write to Postgres.**

SQLite does not exist and will never exist again. Every function that still touches SQLite is a bug to be fixed, not a pattern to be preserved. When migrating a module, the end state is: Prisma-backed reads, Prisma-backed writes, SQLite CREATE TABLE deleted from [apps/api/src/db/database.ts](apps/api/src/db/database.ts), SQLite row-types and row-mappers deleted from the models file, tests rewritten to wipe Postgres tables between runs.

## The narrow exception

The legacy `ref_*` dimension tables (`ref_colors`, `ref_color_families`, `ref_brands`, `ref_categories`, `ref_heel_types`, `ref_size_labels`, `ref_size_types`, `ref_patterns`, `ref_occasions`) are the one category that stays on SQLite until its own migration ticket lands. Per CLAUDE.md: "SQLite remains only as a frozen read-store for legacy admin reference tables... while they are migrated piecewise into app.* Postgres dimensions."

If a new table isn't a `ref_*` dimension, it belongs in Postgres.

## What this command does when invoked

1. **Restate the rule** back to the operator (the two bullets above, verbatim). Never soften them, never offer "for now we can leave it on SQLite" — the rule is the rule.

2. **Scan the working tree for fresh SQLite additions.** Run:
   - `git diff HEAD -- apps/api/src/ | grep -nE '^\+' | grep -E "getDb\(\)|better-sqlite3|db\.prepare|db\.exec|db\.transaction"`
   - Any match = flag it. The change being staged would introduce new SQLite usage, which is forbidden. Show the operator the exact lines and ask them to rework.
   - No match = clean. Report "no new SQLite additions in the working tree."

3. **Summarize remaining SQLite debt.** Grep the whole `apps/api/src/services/` for `getDb()` and report a one-line count per file. This is the migration backlog; use it to pick the next module to convert.
   - Command: `grep -rE "from '\.\./db/database'" apps/api/src/services/ | awk -F: '{print $1}' | sort -u`
   - For each file, also note whether it has an active test file in `apps/api/tests/` so the operator can plan test updates.

4. **Per-migration checklist.** Whenever actually doing a migration, tick through:
   - [ ] New Prisma models added in [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma) (usually `app` schema).
   - [ ] Migration SQL written under `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`.
   - [ ] Migration applied via `pnpm exec prisma migrate deploy` (not `migrate dev` — the shadow DB trips on `rics_mirror`).
   - [ ] Prisma client regenerated via `pnpm exec prisma generate`. **Note:** this fails with `EPERM` when the API dev server is running (DLL lock); stop the server first.
   - [ ] Service rewritten: every `db.prepare(...)` / `db.exec(...)` replaced with `prisma.*`. Functions become async.
   - [ ] Routes rewritten to async and `await` every service call.
   - [ ] `message.includes('UNIQUE constraint')` style error sniffing replaced with `err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'`.
   - [ ] SQLite `CREATE TABLE` + indexes for the migrated tables **deleted** (not commented out) from `database.ts`. Leave the migration version in place; shrink its `up()`/`down()` to whatever SQLite tables remain in that migration.
   - [ ] Legacy `*Row` types and `rowTo*()` helpers deleted from the models file.
   - [ ] Any cross-service FK preflight checks that read the migrated table get their `SELECT id FROM <table>` flipped to `prisma.<model>.findUnique({ where: { id }, select: { id: true } })` — typically forces the caller to become async too.
   - [ ] Tests updated: `resetDb()` (SQLite) paired with `await prisma.<model>.deleteMany({})` calls in `beforeEach` / `afterAll`, plus `await prisma.$disconnect()` at the end.
   - [ ] `tsc --noEmit` clean for touched files (pre-existing errors in unrelated files are OK and will be reported).
   - [ ] Jest suite for the module passes.

5. **Stop on uncertainty.** If a migration pass uncovers behaviour that depends on something still on SQLite (e.g. a cross-service FK, a test fixture that inserts into the same SQLite table), do NOT invent a cross-DB shim. Report it, flag the dependency, and let the operator decide whether to widen scope or defer.

## Rules the command enforces

- **No `getDb()` in newly authored code.** Ever. Call `prisma` from [apps/api/src/db/prisma.ts](apps/api/src/db/prisma.ts).
- **No new SQLite tables.** Every new table goes in Postgres via a Prisma model + migration.
- **No "leave the SQLite copy as a fallback".** Delete the SQLite code the moment the Postgres path works.
- **No cross-DB joins.** A query cannot straddle Postgres and SQLite. If a service needs data from both sides, migrate the SQLite side before adding the query.
- **No raw `INSERT`/`UPDATE`/`DELETE` via `db.prepare(...)` under any circumstance.** Not in services, not in scripts, not in tests.

## Example invocations

- `/postgres-only` — print the rule + scan the working tree + show remaining SQLite debt.
- Invoke this at the start of any session that will touch the data layer so the context is fresh.

## Related docs

- [CLAUDE.md](../../CLAUDE.md) — section on data surfaces (Postgres as system of record).
- [apps/api/src/db/prisma.ts](../../apps/api/src/db/prisma.ts) — the only supported Postgres client handle.
- Previous migrations shipped on this rule: `customerService` (2026-04-23, commit on `master`).