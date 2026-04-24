# Migration Day Runbook

**Status:** rehearsal + cutover-prep runbook. The data-side rebuild and readiness checks exist today; the final module-promotion cutover is **not** fully implemented yet.

## What this runbook covers

This is the canonical step list for a clean migration window:

1. freeze legacy writes,
2. take the final MDB backup,
3. extract an immutable CSV artifact pack from that frozen backup,
4. load the artifact pack into hosted Postgres + bootstrap app-owned data,
5. verify the mirror + app-side data shape,
6. promote the Vercel production deployment and execute operator smoke tests,
7. make a go / no-go decision.

Use this for rehearsals now. Use it for the real migration window only after the blockers in "What is still missing" are closed.

## Assumed production shape for this runbook

- `apps/web` is deployed on Vercel.
- The API + Postgres live outside Vercel.
- MDB files and CSV artifact packs are never uploaded to Vercel.
- Vercel promotion happens only after the hosted Postgres load, bootstrap, and validation gate pass.

## What exists today

- **Schema/bootstrap path**
  - `pnpm --filter @benlow-rics/api prisma:migrate`
  - `pnpm --filter @benlow-rics/api sync:rics`
  - `pnpm --filter @benlow-rics/api bootstrap:app-data`
- **Mirror proof**
  - `pnpm --filter @benlow-rics/api verify:rics-mirror`
- **Migration-day gate**
  - `pnpm --filter @benlow-rics/api verify:cutover-readiness`
- **Operator validation surfaces**
  - [docs/modules/inventory/inventory-testing-checklist.md](../modules/inventory/inventory-testing-checklist.md)
  - [docs/modules/purchasing/purchasing-testing-checklist.md](../modules/purchasing/purchasing-testing-checklist.md)

Today, `sync:rics` is still the shipped implementation of the reload: extraction from MDBs and load into Postgres happen on the same Windows-capable runner. The artifact split below is the target cutover shape for Vercel-hosted frontend deployments.

## What is still missing before true cutover

- **Module-owned schema promotion is not implemented.** The repo still operates on `rics_mirror`, `app`, `public`, and `platform`. There is no shipped cutover script today that promotes `rics_mirror.*` into `products.*`, `inventory.*`, `sales_pos.*`, or equivalent module-owned schemas.
- **Write-path cutover is incomplete.** Rehearsal can prove the mirror/bootstrap path, but it does not by itself prove that every live operational write path is ready to leave RICS.
- **Rollback is operational, not automated.** The safe rollback today is still "stay on RICS, preserve Postgres for diagnosis." There is no one-command rollback flow in the repo.
- **Artifact split tooling is planned, not shipped.** The target Vercel-era cutover path is `extract:rics-artifact` on a Windows-capable machine, then `load:rics-artifact` against hosted Postgres. Until that exists, the fallback remains `sync:rics` on a Windows-capable runner.

Do not treat this runbook as proof that the final business cutover is ready until those gaps are closed.

## Timeline

### T-14d to T-3d

1. Export a fresh attribute snapshot:
   - `pnpm --filter @benlow-rics/api export:attributes -- --out docs/Important-Final-Docs/attribute-catalog-export-YYYY-MM-DD.json`
2. Lint migration hygiene:
   - `pnpm --filter @benlow-rics/api migrate:lint`
3. Rebuild staging from scratch:
   - `pnpm --filter @benlow-rics/api prisma:migrate`
   - `pnpm --filter @benlow-rics/api sync:rics`
   - `pnpm --filter @benlow-rics/api bootstrap:app-data`
4. Rehearse the target artifact-prep cutover flow on staging:
   - Freeze a rehearsal copy of the MDB directory.
   - On a Windows-capable workstation, extract one CSV per canonical table plus a manifest from that frozen copy.
   - Upload the artifact pack to the staging cutover location used by the load runner.
   - Load the artifact pack into staging Postgres, then run `bootstrap:app-data`.
   - Delete transient uploaded copies after the rehearsal; retain the original artifact pack with the rehearsal backup for comparison.
5. Prove the data reload and the cutover gate:
   - `pnpm --filter @benlow-rics/api verify:rics-mirror`
   - `pnpm --filter @benlow-rics/api verify:cutover-readiness`
6. Run real operator workflows against staging using the module checklists.
7. Rehearse the Vercel promotion/rollback steps against the staging environment.
8. Record every mismatch against RICS, fix it, and repeat the loop.

### T-1d

1. Run one final full rehearsal on staging with the exact T-0 sequence: final backup, CSV artifact extract, artifact load, bootstrap, verify, Vercel promotion dry-run, rollback drill.
2. Confirm the latest `attribute-catalog-export-*.json` is checked in and current.
3. Confirm `verify:cutover-readiness` passes cleanly on staging.
4. Confirm the Vercel production deployment is built from the intended commit, the environment variables match the target API host, and the rollback target is known.
5. Prepare the manual backup destination for the MDB directory referenced by `RICS_DB_DIR`.
6. Prepare the transient artifact-storage location used to hand the CSV pack to the load runner.
7. Confirm who gives the final go / no-go decision during the migration window.

### T-0

#### 1. Freeze legacy writes

- Announce the migration window.
- Stop operator entry into RICS.
- Confirm no user is still posting inventory, receiving, pricing, or POS changes into the legacy system.

#### 2. Take the final MDB backup

- Copy the full source directory pointed to by `RICS_DB_DIR` to a timestamped backup location outside the repo workspace.
- Verify file count and total size against the source before proceeding.
- Do not resume from this step until the backup is confirmed readable.

#### 3. Extract the final CSV artifact pack from the frozen backup

- Run the extract on a Windows-capable workstation against the backed-up MDB directory, not the live share.
- Produce one CSV per canonical table plus a manifest that records file name, source MDB, source table, row count, byte size, and checksum.
- Validate the manifest before upload: no missing canonical table, no zero-byte CSV, no checksum mismatch after copy.
- Upload the artifact pack to the transient cutover location used by the load runner. Do not upload MDBs to Vercel.

#### 4. Run the final data load into hosted Postgres

Execute, in order:

```bash
pnpm --filter @benlow-rics/api prisma:migrate
pnpm --filter @benlow-rics/api load:rics-artifact -- --manifest <artifact-manifest.json>
pnpm --filter @benlow-rics/api bootstrap:app-data
pnpm --filter @benlow-rics/api verify:rics-mirror
pnpm --filter @benlow-rics/api verify:cutover-readiness -- --max-sync-age-hours 1
```

Notes:

- `load:rics-artifact` is the target cutover command shape for Vercel-era deployments. It is responsible for the same atomic `rics_mirror_staging -> rics_mirror` swap as `sync:rics`, but it reads pre-extracted CSVs instead of MDBs.
- Until `load:rics-artifact` ships, the fallback is `pnpm --filter @benlow-rics/api sync:rics` on a Windows-capable runner against the production `DATABASE_URL`.
- `bootstrap:app-data` must run after the final mirror load.
- `verify:rics-mirror` proves the reload shape and additive-data survival.
- `verify:cutover-readiness` is the migration-day gate for schema state, snapshot freshness, mirror coverage, SKU parity, category-family coverage, and orphan/collision checks.

#### 5. Validation gate

Migration day is blocked if any of these are true:

- `verify:rics-mirror` fails
- `verify:cutover-readiness` reports any `FAIL`
- operator smoke tests expose a critical mismatch vs RICS
- a required workflow cannot be completed end-to-end

#### 6. Promote the Vercel production deployment

- Promote only after the validation gate passes.
- Point operators at the promoted Vercel production URL, not the preview URL used for rehearsal.
- Run the migration-day smoke tests against the Vercel production URL immediately after promotion.

#### 7. Go / no-go decision

Go only when all are true:

- the final MDB backup exists and is readable
- the final artifact extract, load, and bootstrap sequence completed successfully
- no blocking mismatches remain
- the promoted Vercel deployment is healthy
- real operators can complete the migration-day smoke tests

If any of those fail, do not cut over.

## Rollback

If the migration window fails:

1. If failure happens before Vercel promotion, leave production traffic on the pre-cutover Vercel deployment and keep the Postgres database as-is for diagnosis.
2. If failure happens after Vercel promotion, roll Vercel back to the previous production deployment before resuming operations in RICS.
3. Resume operations in RICS from the confirmed final backup / live legacy state.
4. Preserve the CSV artifact pack, manifest, and logs with the migration record so the failure can be replayed exactly.
5. Log the exact failing check, workflow, or reconciliation gap.
6. Fix the issue outside the migration window and re-run the rehearsal loop.

Do not improvise partial writes back into MDB files. RICS stays operator-driven only.

## Related docs

- [docs/Important-Final-Docs/Migration-Steps-From-Scratch.md](../Important-Final-Docs/Migration-Steps-From-Scratch.md)
- [docs/operations/rics-mirror-sync.md](rics-mirror-sync.md)
- [docs/operations/sku-lifecycle-backfill.md](sku-lifecycle-backfill.md)
- [docs/dev/specs/2026-04-24-vercel-cutover-artifact-flow.md](../dev/specs/2026-04-24-vercel-cutover-artifact-flow.md)
