# Hosted Cutover Artifact Flow (Render target)

**Date:** 2026-04-24  
**Status:** planned cutover shape under the direct CSV import model  
**Scope:** migration day / rehearsal workflow / hosted Postgres load

Host note: the file name is stale. Render is the real deployment target now.

## Context

Render is not the place to handle MDB files, and hosted Postgres should not carry a raw legacy mirror schema.

The cutover shape is therefore:

1. extract immutable CSV artifacts from the frozen MDB backup on a Windows-capable machine,
2. upload the artifact pack to the transient cutover location,
3. import the required CSVs directly into owned Postgres tables,
4. verify owned-table counts and operator workflows before Render promotion.

## Decision

The migration-day workflow is a split pipeline:

1. **Extract phase** on a Windows-capable workstation:
   - read the frozen MDB backup,
   - produce one CSV per canonical table,
   - produce a manifest with row count, byte size, checksum, source MDB, and source table metadata.
2. **Load phase** on the cutover runner:
   - read only the CSV artifact pack + manifest,
   - run the needed direct importers for owned app/module tables,
   - record batch/audit results,
   - reject any source whose owned target schema is not ready.
3. **Promotion phase**:
   - after the data-side validation passes, promote the Render production deployment and run smoke tests.

## Command shape

Target future commands remain:

```bash
pnpm --filter @benlow-rics/api extract:rics-artifact -- --out <artifact-dir>
# plus module-specific direct CSV import commands
```

`load:rics-artifact` is retired because it recreated `rics_mirror`.

## Artifact contract

The artifact pack should contain:

- one CSV per canonical table,
- one manifest file,
- optional extractor logs.

The manifest should record, at minimum:

- extraction timestamp,
- source MDB file,
- source table name,
- target CSV file name,
- row count,
- byte size,
- checksum,
- extractor version / commit SHA.

Hard rules:

- the manifest must cover every extracted canonical table,
- the loader/importer must reject missing files, row-count mismatches, checksum mismatches, or duplicate entries,
- MDB files are never uploaded to Render,
- transient copies on the cutover runner are deleted after the load.

## Rehearsal requirements

Every rehearsal should include:

1. freeze a rehearsal copy of the MDB directory,
2. extract the artifact pack from that frozen copy,
3. upload it to the same transient location planned for T-0,
4. import the required CSVs into staging Postgres,
5. run owned-table verification and `verify:cutover-readiness`,
6. run operator smoke tests,
7. rehearse the Render promotion and rollback steps.

## Render sequencing

1. finish the data-side imports and validation first,
2. verify the API is serving the imported owned data correctly,
3. promote the intended Render production deployment,
4. run smoke tests against the production Render URL,
5. if anything fails after promotion, roll Render back before resuming RICS operations.

## Non-goals

- putting MDB files on Render,
- recreating `rics_mirror` on hosted Postgres,
- storing raw legacy tables on the hosted DB when no owned target exists.

## Related

- [docs/operations/migration-day-runbook.md](../../operations/migration-day-runbook.md)
- [docs/operations/render-conversion-day-matrix.md](../../operations/render-conversion-day-matrix.md)
- [docs/operations/rics-csv-promotion-playbook.md](../../operations/rics-csv-promotion-playbook.md)
