---
description: Run the RICS -> Postgres mirror verification end-to-end (plant canary, reload from MDBs, check row counts + canary survival) and summarize PASS/FAIL. Takes 10-20 min because it runs a full sync.
---

# verify-rics-mirror

Invoke the end-to-end mirror verification and report the outcome.

Argument handling: `$ARGUMENTS`
- No arguments → run the full verify (safety check, canary plant, sync, row-count audit, canary survival check, cleanup).
- `--force` → also set `SYNC_FORCE=1` in the environment, bypassing the "another sync is running" guard. Only use when the prior run is known dead.
- `--counts-only` → skip the sync and canary work. Just query row counts from each `rics_mirror.*` canonical table and print them. Useful for a fast sanity check without the ~15-minute reload.

## What this verifies

One command, three properties:

1. **Mirror exists and holds data.** After the reload, every canonical `rics_mirror.*` table returns `COUNT(*) > 0` (or intentionally 0 for a known-empty source like `rics_mirror.inv_catalog`).
2. **Reload is atomic and idempotent.** Postgres's transactional DDL means the `rics_mirror` swap is observed as instant. The `platform.etl_run` table gets a new `status='ok'` row; the previous mirror never sits half-populated.
3. **Additive Zack's Retail data survives a reload.** A canary row (`public."ProductContent".ricsSkuCode = '__SYNC_VERIFY_CANARY__'`) is inserted before the sync and is confirmed still present after. The canary is then deleted.

If all three hold, exit code is 0 and the command prints `RESULT: PASS`. Otherwise `RESULT: FAIL` with the specific property that failed.

## Steps

1. **Precondition check.** Confirm Postgres is reachable and the `rics_mirror` / `platform` / `app` schemas exist. If any are missing, stop and tell the operator to apply the Prisma migration first (`pnpm --filter @benlow-rics/api prisma:migrate`).

2. **Run the verify command.**
   - Default path: `pnpm --filter @benlow-rics/api verify:rics-mirror`
   - `--force`: prepend `SYNC_FORCE=1` in the env for that invocation.
   - `--counts-only`: skip the pnpm command. Instead, open a connection via `docker exec zacks-retail-postgres psql -U zacks -d zacks_retail -c "..."` and run `SELECT COUNT(*)` against every table in the canonical list from [apps/api/src/services/sync/canonicalRicsTables.ts](apps/api/src/services/sync/canonicalRicsTables.ts). Print a simple table of counts.
   - Stream progress lines from stdout so the operator can see per-table timing.

3. **Interpret the exit code.**
   - 0 → PASS. Echo the final summary block from the script and stop.
   - 1 → FAIL. Parse the summary to identify which property failed (sync status, canary survived, missing tables). Show the operator the specific line(s) from the output.
   - 2 → unhandled error. Print the stack trace section from the output and stop.

4. **Show the last 3 etl_run rows.** Regardless of PASS/FAIL, end by querying `platform.etl_run` so the operator sees trend data:
   ```sql
   SELECT id, status, "startedAt", "finishedAt", "tableCount", "totalRows", "errorText"
   FROM platform.etl_run
   ORDER BY "startedAt" DESC
   LIMIT 3;
   ```

## Report format

Always output in this exact structure. Use concise bullets; no emojis.

```
## Mirror verification — <YYYY-MM-DD HH:MM>

### Result
<PASS or FAIL>

### Properties
- mirror populated     : <yes | no — details>
- reload atomic        : <yes | no — details>
- additive data survived: <yes | no | n/a if --counts-only>

### Mirror row counts
<table of table/rows from the script output>

### Recent runs (platform.etl_run)
<id | status | startedAt | finishedAt | tableCount | totalRows>
...

### Next step
<one line — e.g. "Pick the first adapter to cut over (recommend: products)."
 or  "Fix the failing table (<name>) and re-run.">
```

## Rules

- **Never skip the canary step unless `--counts-only` was passed.** The survival check is the only protection against someone accidentally writing a sync that wipes the `public`/`app` schemas.
- **Do not start a new sync if another is in flight.** The script already guards with a 30-minute window on `platform.etl_run.status='running'`; if it refuses, don't override without `--force`, and never pass `--force` without first confirming with the operator.
- **Never commit the canary row.** It's transient verification data. The script cleans it up in a `finally` block; if the cleanup path failed (check output for the `WARN: canary cleanup may have failed` line), do a manual `DELETE FROM public."ProductContent" WHERE "ricsSkuCode" = '__SYNC_VERIFY_CANARY__'` and flag it.
- **Do not modify the sync pipeline from this command.** If a verification fails and the root cause is in [apps/api/src/services/sync/](apps/api/src/services/sync/), report the failure and stop. Fixing it is separate work.
- **Do not propose adding the verify run to CI.** The reload is slow and reads live MDB files — it's an operator tool, not a CI check.

## Example invocations

- `/verify-rics-mirror` — full end-to-end proof. Takes ~15 min.
- `/verify-rics-mirror --counts-only` — fast sanity check (a few seconds). Does not re-sync.
- `/verify-rics-mirror --force` — full proof, bypassing the "another sync running" guard.
