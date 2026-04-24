---
description: Audit migration-day prerequisites against the live Postgres state and summarize PASS/FAIL. Fast, read-only, and intended for rehearsals plus the final migration window.
---

# verify-cutover-readiness

Run the cutover-readiness audit and summarize the blocking checks.

Argument handling: `$ARGUMENTS`

- No arguments -> run with defaults:
  - latest ETL run must be no older than 24 hours
  - latest attribute snapshot must be no older than 72 hours
- `--max-sync-age-hours <n>` -> override the ETL freshness gate
- `--max-snapshot-age-hours <n>` -> override the attribute-snapshot freshness gate

## What this verifies

One command, the minimum data-side gate for migration day:

1. **Schemas + migrations**
   - `rics_mirror`, `public`, `app`, `platform` exist
   - every migration folder under `apps/api/prisma/migrations/` is applied in `_prisma_migrations`
2. **Attribute snapshot**
   - a current `attribute-catalog-export-*.json` exists
3. **Sync state**
   - no `platform.etl_run` row is still marked `running`
   - the latest ETL run finished `status='ok'` and is fresh enough
4. **Mirror coverage**
   - every canonical table from [`apps/api/src/services/sync/canonicalRicsTables.ts`](../../apps/api/src/services/sync/canonicalRicsTables.ts) exists in `rics_mirror`
5. **Bootstrap parity**
   - `app.sku` ACTIVE RICS rows match the active mirror SKU count
   - product-family mappings cover every mirrored category
   - no orphaned `app.sku_attribute_assignment` rows remain
   - no operator-created SKU code collides with a mirrored RICS SKU

## Steps

1. Confirm `DATABASE_URL` is available. If missing, stop and report it.
2. Run:

```bash
pnpm --filter @benlow-rics/api verify:cutover-readiness $ARGUMENTS
```

3. Stream the script output.
4. Interpret the exit code:
   - `0` -> PASS, no blocking check failed
   - `1` -> FAIL, at least one blocking check failed
   - `2` -> invalid CLI usage or missing env
5. End by linking the operator to the runbook:
   - [docs/operations/migration-day-runbook.md](../../docs/operations/migration-day-runbook.md)

## Report format

Always answer in this structure:

```markdown
## Cutover readiness - <PASS|FAIL>

### Blocking checks
- <check name>: <pass/fail detail>
- <check name>: <pass/fail detail>

### Next step
<one line>
```

## Rules

- Do not mutate the database from this command.
- Do not bypass a failing freshness gate by editing the thresholds unless the operator explicitly asked for a looser rehearsal check.
- A clean `verify-cutover-readiness` result is necessary but not sufficient for the final business cutover. The operator still needs the workflow smoke tests in the migration-day runbook.
