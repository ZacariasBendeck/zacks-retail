# Migration Day Runbook

**Status:** rehearsal + cutover-prep runbook for the direct CSV import model.

## What this runbook covers

This is the canonical sequence for a clean migration window:

1. freeze legacy writes,
2. take the final MDB backup,
3. extract an immutable CSV artifact pack from that frozen backup,
4. import those CSVs directly into owned Postgres tables,
5. verify the owned tables and operator workflows,
6. promote the Render production deployment and execute smoke tests,
7. make a go / no-go decision.

Hosted Postgres must not carry a `rics_mirror` schema.

## Assumed production shape

- The production runtime is hosted on Render.
- MDB files and CSV artifact packs are never uploaded into the live Render service.
- Validation passes before Render promotion.

## Current blockers before true cutover

- Some runtime request paths still read legacy mirror-era sources in code and must be cut to owned tables.
- Some direct CSV importers still need to replace older mirror-backed backfills before the next rehearsal.
- Rollback is still operational, not fully automated.

Do not treat this runbook as proof that final business cutover is ready until those gaps are closed.

## Timeline

### T-14d to T-3d

1. Export a fresh attribute snapshot if the module needs it.
2. Lint migration hygiene:
   - `pnpm --filter @benlow-rics/api migrate:lint`
3. Rebuild staging from scratch:
   - `pnpm --filter @benlow-rics/api exec prisma migrate deploy`
   - run the module-specific direct CSV imports needed for the rehearsal
4. Rehearse the artifact flow on staging:
   - freeze a rehearsal copy of the MDB directory,
   - extract one CSV per canonical table plus a manifest,
   - upload the artifact pack to the staging cutover location,
   - import the needed CSVs directly into staging Postgres,
   - delete transient uploaded copies after the rehearsal.
5. Run `verify:cutover-readiness` plus module-specific DB audits.
6. Run real operator workflows against staging.
7. Rehearse the Render promotion/rollback steps.
8. Record every mismatch vs RICS, fix it, and repeat the loop.

### T-1d

1. Run a final full rehearsal on staging with the exact T-0 sequence.
2. Confirm the latest artifact pack and manifests are retained.
3. Confirm `verify:cutover-readiness` passes.
4. Confirm the Render production deployment and rollback target are known.
5. Prepare the final MDB backup destination.
6. Prepare the transient artifact-storage location used by the load runner.
7. Confirm who gives the final go / no-go decision.

### T-0

#### 1. Freeze legacy writes

- Announce the migration window.
- Stop operator entry into RICS.
- Confirm no user is still posting inventory, receiving, pricing, or POS changes into the legacy system.

#### 2. Take the final MDB backup

- Copy the full source directory referenced by `RICS_DB_DIR` to a timestamped backup location outside the repo workspace.
- Verify file count and total size against the source before proceeding.

#### 3. Extract the final CSV artifact pack

- Run the extract on a Windows-capable workstation against the frozen backup, not the live share.
- Produce one CSV per canonical table plus a manifest with file name, source MDB, source table, row count, byte size, and checksum.
- Validate the manifest before upload.
- Upload the artifact pack to the transient cutover location used by the load runner.

#### 4. Run the final direct imports into hosted Postgres

Execute, in order:

```bash
pnpm --filter @benlow-rics/api exec prisma migrate deploy
pnpm --filter @benlow-rics/api cutover:render-load -- --bundle <final-bundle-dir>
pnpm --filter @benlow-rics/api verify:cutover-readiness -- --max-sync-age-hours 1
```

Rules:

- import only into owned tables
- do not recreate `rics_mirror`
- purchase orders are loaded through `import:native-purchase-orders-from-artifact`, which rebuilds native `app.purchase_order*` from `purchase_master.csv` and `purchase_detail.csv`
- if a source has no owned target yet, keep that CSV offline and do not load it to hosted Postgres

#### 5. Validation gate

Migration day is blocked if any of these are true:

- a required direct importer fails
- `verify:cutover-readiness` reports any `FAIL`
- DB audits do not match the expected imported counts
- operator smoke tests expose a critical mismatch vs RICS

#### 6. Promote the Render production deployment

- Promote only after the validation gate passes.
- Point operators at the promoted Render production URL.
- Run migration-day smoke tests immediately after promotion.

#### 7. Go / no-go decision

Go only when all are true:

- the final MDB backup exists and is readable
- the final extract + direct-import sequence completed successfully
- no blocking mismatches remain
- the promoted Render deployment is healthy
- real operators can complete the smoke tests

## Rollback

If the migration window fails:

1. If failure happens before Render promotion, leave production traffic on the prior deployment and keep Postgres as-is for diagnosis.
2. If failure happens after Render promotion, roll Render back before resuming RICS operations.
3. Resume operations in RICS from the confirmed legacy state.
4. Preserve the CSV artifact pack, manifest, and logs with the migration record so the failure can be replayed exactly.
5. Log the exact failing check, workflow, or reconciliation gap.

## Related

- [docs/operations/render-conversion-operator-runbook.md](render-conversion-operator-runbook.md)
- [docs/operations/rics-csv-promotion-playbook.md](rics-csv-promotion-playbook.md)
- [docs/dev/specs/2026-04-24-vercel-cutover-artifact-flow.md](../dev/specs/2026-04-24-vercel-cutover-artifact-flow.md)
- [docs/operations/render-conversion-day-matrix.md](render-conversion-day-matrix.md)
- [docs/operations/rics-mirror-sync.md](rics-mirror-sync.md)
