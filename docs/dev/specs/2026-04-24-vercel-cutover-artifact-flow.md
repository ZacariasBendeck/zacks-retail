# Vercel Cutover Artifact Flow

**Date:** 2026-04-24
**Status:** planned cutover shape; tooling not shipped yet
**Scope:** migration day / rehearsal workflow / hosted Postgres reload

## Context

The current `pnpm --filter @benlow-rics/api sync:rics` path is a combined extract-and-load command:

1. open the MDBs through ACE.OLEDB.12.0 on a Windows-capable machine,
2. emit one CSV per table,
3. stream those CSVs into Postgres,
4. atomically swap `rics_mirror_staging` into `rics_mirror`.

That is fine for day-to-day rehearsals on a Windows-capable runner, but it is the wrong migration-day shape when the public web deploy is on Vercel:

- Vercel is not the place to handle MDB files.
- The production host that loads Postgres data should not need ACE.OLEDB.12.0.
- The migration window should depend on an immutable artifact, not a live MDB extraction happening in the middle of cutover.

## Decision

The target migration-day workflow is a split pipeline:

1. **Extract phase** on a Windows-capable workstation:
   - read the frozen MDB backup,
   - produce one CSV per canonical table,
   - produce a manifest with row count, byte size, checksum, source MDB, and source table metadata.
2. **Load phase** on the cutover runner:
   - read only the CSV artifact pack + manifest,
   - create `rics_mirror_staging`,
   - recreate the mirrored tables with the same type mapping used by `sync:rics`,
   - `COPY` each CSV into Postgres,
   - perform the same atomic schema swap,
   - run the existing `app.sku` backfill and post-load verification.
3. **Promotion phase**:
   - only after the data-side validation passes, promote the Vercel production deployment and run smoke tests against the production URL.

## Command shape

Target future commands:

```bash
pnpm --filter @benlow-rics/api extract:rics-artifact -- --out <artifact-dir>
pnpm --filter @benlow-rics/api load:rics-artifact -- --manifest <artifact-dir/manifest.json>
```

Current fallback until those ship:

```bash
pnpm --filter @benlow-rics/api sync:rics
```

The fallback stays valid, but it keeps Windows + ACE in the critical path. The new commands exist to remove that dependency from cutover day.

## Artifact contract

The artifact pack should contain:

- one CSV per canonical table,
- one manifest file,
- optional per-run logs from the extractor.

The manifest should record, at minimum:

- extraction timestamp,
- source MDB file,
- source table name,
- target table name (`snake_case`),
- row count,
- byte size,
- checksum,
- extractor version / commit SHA.

Hard rules:

- The manifest must cover every table in `canonicalRicsTables.ts`.
- The loader must reject missing files, row-count mismatches, checksum mismatches, or duplicate table entries.
- MDB files are never uploaded to Vercel.
- Transient copies of the CSV pack on the cutover runner are deleted after the load; the original artifact pack is retained with the migration record until the go / no-go decision is closed.

## Rehearsal requirements

Every migration rehearsal should include the artifact flow, not just the data load:

1. freeze a rehearsal copy of the MDB directory,
2. extract the artifact pack from that frozen copy,
3. upload it to the same transient location planned for T-0,
4. load it into staging Postgres,
5. run `bootstrap:app-data`,
6. run `verify:rics-mirror`,
7. run `verify:cutover-readiness`,
8. run operator smoke tests,
9. rehearse the Vercel promotion and rollback steps.

If a rehearsal uses `sync:rics` instead of the split commands, document it as a fallback rehearsal, not as proof that the target cutover shape was exercised.

## Vercel sequencing

Assumptions:

- `apps/web` is deployed on Vercel.
- API + Postgres are hosted outside Vercel.

Cutover sequencing:

1. finish the data-side load and validation first,
2. verify the API is serving the loaded data correctly,
3. promote the intended Vercel production deployment,
4. run smoke tests against the production Vercel URL,
5. if anything fails after promotion, roll Vercel back before resuming RICS operations.

## Non-goals

- putting MDB files on Vercel,
- rewriting the extractor to avoid ACE before cutover,
- changing the canonical table allowlist or type mapping,
- changing the `app.sku` backfill semantics.

## Related

- [docs/operations/migration-day-runbook.md](../../operations/migration-day-runbook.md)
- [docs/operations/rics-mirror-sync.md](../../operations/rics-mirror-sync.md)
- [docs/operations/sku-lifecycle-backfill.md](../../operations/sku-lifecycle-backfill.md)
