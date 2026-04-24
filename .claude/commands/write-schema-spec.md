---
description: Write the detailed database schema spec for a Zack's Retail module at docs/modules/<slug>/schema.md. Per-table schema home (rics_mirror/public/app/platform), columns with Postgres types, constraints, indexes, foreign keys, enums, migration references. Enforces the Phase-A rule that module-owned additive tables never land in rics_mirror. Pairs with /write-api-spec.
---

# write-schema-spec

Produce the detailed Postgres schema for a module. Per-table columns, types, constraints, indexes, and which Postgres schema owns each table (`rics_mirror`, `public`, `app`, or `platform`).

Argument: `$ARGUMENTS` — module slug (required).
- Omitted → stop and ask.
- Neither `tech-description.md` nor `rics-module-specs.md` exists in `docs/modules/<slug>/` → stop; run `/describe-tech-module <slug>` first.

## Sources to read

1. [`docs/modules/<slug>/tech-description.md`](../../docs/modules/) — primary source for intended tables and data flow.
2. [`docs/modules/<slug>/rics-module-specs.md`](../../docs/modules/) — RICS "Data model sketch" if tech-description not yet written.
3. [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma) — current Prisma models and `@@schema(...)` annotations.
4. [`apps/api/prisma/migrations/`](../../apps/api/prisma/migrations/) — folder names that hint at this module.
5. [`docs/modules/<slug>/business-functional.md`](../../docs/modules/) — Data Entities section (business-level names).
6. [`CLAUDE.md`](../../CLAUDE.md) — "Data surfaces" section and Rollout phases.
7. [`docs/operations/rics-mirror-sync.md`](../../docs/operations/rics-mirror-sync.md) — if this module reads from `rics_mirror`.

## Writing rules

- **Schema home per table — this is the critical decision:**
  - `rics_mirror` — 1:1 mirror of canonical RICS tables, rebuilt on `sync:rics`. **Module-owned additive tables MUST NOT land here** (reload drops them). Flag this as a hard violation if proposed.
  - `public` — net-new Zack's Retail tables currently in use.
  - `app` — reserved for future module-owned additive tables.
  - `platform` — cross-cutting admin (`etl_run`, `etl_run_table`, future platform tables).
  - SQLite — legacy. Do not propose new tables here; migrate existing ones into Postgres over time.
- **Authority rule:** if the module already has an app-owned authoritative table for a surface, say explicitly that request handlers read that table only. `rics_mirror` can still appear in the schema doc as ETL/bootstrap input, but not as the live request-path authority for that surface.
- **Postgres types, not Prisma generics:**
  - Money: `NUMERIC(12,2)` — never `FLOAT` / `REAL`.
  - Timestamps: `TIMESTAMPTZ` — never naive `TIMESTAMP`.
  - Strings: `TEXT` — avoid `VARCHAR(n)` unless the constraint is load-bearing.
  - IDs: `UUID` default `gen_random_uuid()`.
- **Standard columns** unless stated otherwise:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Reference the migration** that created each table. If no migration exists yet, write "pending — Task <N> in `tasks.md`".
- **Foreign keys declare `ON DELETE` behavior** explicitly. Default `RESTRICT` unless the business case demands `CASCADE` / `SET NULL`.
- **Indexes are justified** — each index entry says what query it supports.
- **HNL currency** in any example values.
- **No branches / worktree** language anywhere.

## Template

Path: `docs/modules/<slug>/schema.md`.

```markdown
# Schema: <slug>

**Type:** Schema spec
**Folder landing:** [`README.md`](./README.md)
**Tech description:** [`tech-description.md`](./tech-description.md)
**RICS lineage:** [`rics-module-specs.md`](./rics-module-specs.md)
**Business spec:** [`business-functional.md`](./business-functional.md)
**API contract:** [`api.md`](./api.md)
**Tasks:** [`tasks.md`](./tasks.md)
**Decisions:** [`decisions.md`](./decisions.md)
**Last refreshed:** <YYYY-MM-DD>

## Schema homes used by this module

- `<schema>` — <what this module puts here and why>

## Tables

### `<schema>.<table_name>`

**Purpose:** <one-line>
**Schema home:** `<schema>`
**Created in migration:** `<YYYYMMDDHHMMSS_name>` (or "pending — Task N")

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | |
| ... | ... | ... | ... | ... |

**Indexes**
- `idx_<name>` on `(col_a, col_b)` — supports <query / lookup>

**Foreign keys**
- `<col>` → `<schema>.<table>(<col>)` ON DELETE `<action>`

**Check constraints**
- `ck_<name>` — `<expression>` — <business reason>

**Triggers**
- `<name>` — <what it does>

---

### `<schema>.<table_name>` (repeat for each table)

## Enums

\\\`\\\`\\\`sql
CREATE TYPE <schema>.<enum_name> AS ENUM ('value_1', 'value_2', 'value_3');
\\\`\\\`\\\`

Used by: <table.column>, <table.column>

## Views / materialized views

- `<schema>.<view_name>` — <purpose>; built from <source tables>; refresh: <on-demand / scheduled>

## Row-level security

<Policies, or "none for v1".>

## Relationships diagram

\\\`\\\`\\\`
<table_a> 1 ——— N <table_b>
<table_b> N ——— 1 <table_c>
\\\`\\\`\\\`

## Phase-A rule compliance

Every table above has its schema home justified. Tables that would live in `rics_mirror` are RICS-canonical mirrors (not module-owned additions). Violations flagged: <none | list>.
```

## Editing existing specs

- If the file exists, use `Edit`, not `Write`.
- When a table migrates to a different schema home (e.g. `public` → `app` during Phase B), record both the old and new location with the migration that moved it.
- Update `**Last refreshed:**` on every edit.

## Commit

```
docs(schema): <slug> — schema spec

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Report

> Wrote `docs/modules/<slug>/schema.md` — <N> tables across <list-of-homes>, <M> indexes, <K> foreign keys, <J> enums. Phase-A violations flagged: <count or "none">. Next: `/write-api-spec <slug>` to pair the API side, or `/break-module-into-tasks <slug>` for the ticket breakdown.

## Example invocations

- `/write-schema-spec inventory-transfer`
- `/write-schema-spec sales-pos`
- `/write-schema-spec purchase-planning`
