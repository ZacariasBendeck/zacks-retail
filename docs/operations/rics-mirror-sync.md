# RICS Mirror Sync (Retired)

**Status:** retired on 2026-04-25. Do not recreate `rics_mirror` locally or on hosted Postgres.

## Decision

The project no longer uses a raw `rics_mirror` landing schema.

The approved migration shape is now:

1. extract canonical RICS tables from the MDB files into CSV artifacts,
2. import those CSVs directly into app-owned or module-owned Postgres tables,
3. verify the importer output and the resulting app tables,
4. keep the CSV artifact pack + manifest for rehearsal and reconciliation.

Hosted databases must not carry `rics_mirror` data.

## What changed

Retired:

- `pnpm --filter @benlow-rics/api sync:rics`
- `pnpm --filter @benlow-rics/api load:rics-artifact`
- `pnpm --filter @benlow-rics/api verify:rics-mirror`
- `/verify-rics-mirror`
- the `rics_mirror` and `rics_mirror_staging` schemas

Still valid:

- `extract:rics-artifact` for offline CSV extraction from MDB files
- module-specific/direct CSV importers
- direct Postgres verification of `app.*` / module-owned target tables

## Replacement workflow

Use these docs instead:

- [docs/operations/rics-csv-promotion-playbook.md](rics-csv-promotion-playbook.md)
- [docs/operations/migration-day-runbook.md](migration-day-runbook.md)
- [docs/dev/specs/2026-04-24-vercel-cutover-artifact-flow.md](../dev/specs/2026-04-24-vercel-cutover-artifact-flow.md)

The replacement rules are:

- MDB files stay read-only.
- CSV artifacts are the transient raw extract.
- Postgres stores only app-owned or module-owned tables, not a raw mirror schema.
- If a source table has no owned target yet, keep the CSV artifact offline and do not load it into hosted Postgres.

## Verification after retirement

To prove the retirement is in effect:

1. confirm `information_schema.schemata` does not list `rics_mirror` or `rics_mirror_staging`,
2. confirm the needed imported `app.*` tables still exist and have the expected counts,
3. confirm any direct-import batch/audit tables show the latest successful run.

## Related

- [docs/operations/rics-csv-promotion-playbook.md](rics-csv-promotion-playbook.md)
- [docs/operations/migration-day-runbook.md](migration-day-runbook.md)
- [docs/operations/access-oledb-async-spawn.md](access-oledb-async-spawn.md)
