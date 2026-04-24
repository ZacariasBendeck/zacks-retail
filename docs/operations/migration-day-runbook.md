# Migration Day Runbook

**Status:** rehearsal + cutover-prep runbook. The data-side rebuild and readiness checks exist today; the final module-promotion cutover is **not** fully implemented yet.

## What this runbook covers

This is the canonical step list for a clean migration window:

1. freeze legacy writes,
2. take the final MDB backup,
3. run the final Postgres reload/bootstrap,
4. verify the mirror + app-side data shape,
5. execute operator smoke tests,
6. make a go / no-go decision.

Use this for rehearsals now. Use it for the real migration window only after the blockers in "What is still missing" are closed.

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

## What is still missing before true cutover

- **Module-owned schema promotion is not implemented.** The repo still operates on `rics_mirror`, `app`, `public`, and `platform`. There is no shipped cutover script today that promotes `rics_mirror.*` into `products.*`, `inventory.*`, `sales_pos.*`, or equivalent module-owned schemas.
- **Write-path cutover is incomplete.** Rehearsal can prove the mirror/bootstrap path, but it does not by itself prove that every live operational write path is ready to leave RICS.
- **Rollback is operational, not automated.** The safe rollback today is still "stay on RICS, preserve Postgres for diagnosis." There is no one-command rollback flow in the repo.

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
4. Prove the data reload and the cutover gate:
   - `pnpm --filter @benlow-rics/api verify:rics-mirror`
   - `pnpm --filter @benlow-rics/api verify:cutover-readiness`
5. Run real operator workflows against staging using the module checklists.
6. Record every mismatch against RICS, fix it, and repeat the loop.

### T-1d

1. Run one final full rehearsal on staging with the exact commands planned for T-0.
2. Confirm the latest `attribute-catalog-export-*.json` is checked in and current.
3. Confirm `verify:cutover-readiness` passes cleanly on staging.
4. Prepare the manual backup destination for the MDB directory referenced by `RICS_DB_DIR`.
5. Confirm who gives the final go / no-go decision during the migration window.

### T-0

#### 1. Freeze legacy writes

- Announce the migration window.
- Stop operator entry into RICS.
- Confirm no user is still posting inventory, receiving, pricing, or POS changes into the legacy system.

#### 2. Take the final MDB backup

- Copy the full source directory pointed to by `RICS_DB_DIR` to a timestamped backup location outside the repo workspace.
- Verify file count and total size against the source before proceeding.
- Do not resume from this step until the backup is confirmed readable.

#### 3. Run the final data load

Execute, in order:

```bash
pnpm --filter @benlow-rics/api prisma:migrate
pnpm --filter @benlow-rics/api sync:rics
pnpm --filter @benlow-rics/api bootstrap:app-data
pnpm --filter @benlow-rics/api verify:rics-mirror
pnpm --filter @benlow-rics/api verify:cutover-readiness -- --max-sync-age-hours 1
```

Notes:

- `bootstrap:app-data` must run after the final `sync:rics`.
- `verify:rics-mirror` proves the reload shape and additive-data survival.
- `verify:cutover-readiness` is the migration-day gate for schema state, snapshot freshness, mirror coverage, SKU parity, category-family coverage, and orphan/collision checks.

#### 4. Validation gate

Migration day is blocked if any of these are true:

- `verify:rics-mirror` fails
- `verify:cutover-readiness` reports any `FAIL`
- operator smoke tests expose a critical mismatch vs RICS
- a required workflow cannot be completed end-to-end

#### 5. Go / no-go decision

Go only when all are true:

- the final MDB backup exists and is readable
- the final sync/bootstrap sequence completed successfully
- no blocking mismatches remain
- real operators can complete the migration-day smoke tests

If any of those fail, do not cut over.

## Rollback

If the migration window fails:

1. Keep the Postgres database as-is for diagnosis.
2. Resume operations in RICS from the confirmed final backup / live legacy state.
3. Log the exact failing check, workflow, or reconciliation gap.
4. Fix the issue outside the migration window and re-run the rehearsal loop.

Do not improvise partial writes back into MDB files. RICS stays operator-driven only.

## Related docs

- [docs/Important-Final-Docs/Migration-Steps-From-Scratch.md](../Important-Final-Docs/Migration-Steps-From-Scratch.md)
- [docs/operations/rics-mirror-sync.md](rics-mirror-sync.md)
- [docs/operations/sku-lifecycle-backfill.md](sku-lifecycle-backfill.md)
