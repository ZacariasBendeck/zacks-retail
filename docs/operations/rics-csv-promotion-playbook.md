# RICS CSV Promotion Playbook

**Status:** reusable playbook for direct CSV imports into app-owned Postgres tables.

## Purpose

Use this playbook when a module needs legacy RICS data in Postgres without persisting a raw mirror schema.

The pattern is:

1. extract canonical RICS tables to CSV artifacts,
2. import those CSVs directly into `app.*` or module-owned tables,
3. cut request-path reads to the owned table only,
4. keep the CSV artifact pack + manifest for reconciliation and repeat rehearsals.

## Hard rules

- MDB files remain read-only.
- There is no `rics_mirror` landing schema.
- Importers target owned tables only.
- Importers must be repeatable.
- App-native writes must survive reruns.
- If a source has no owned target yet, keep the CSV offline and do not load hosted Postgres.

## Mental model

Treat the flow as two layers:

1. **Extract**
   - MDB -> one CSV per canonical RICS table
2. **Promote**
   - CSV -> `app.<table>` or module-owned `<schema>.<table>`

The CSV artifact pack is the raw rehearsal input. Postgres stores only the owned operational model.

## Step 1: Define the migration stream

For each source table, record:

- source MDB file
- exact RICS table name
- resulting CSV name
- target owned table
- source role: direct, reference, validation, or deferred
- importer shape: snapshot or event-ledger

If this map is not written down, stop and create it first.

## Step 2: Confirm the source is canonical

The extractor allowlist lives in:

- [apps/api/src/services/sync/canonicalRicsTables.ts](../../apps/api/src/services/sync/canonicalRicsTables.ts)

Naming rule:

- `InventoryMaster` -> `inventory_master.csv`
- `Inventory Quantities` -> `inventory_quantities.csv`
- `Vendor Master` -> `vendor_master.csv`

If the source table is not there, add it before the rehearsal extract.

## Step 3: Extract the CSV artifact pack

Use the offline extractor to produce:

- one CSV per canonical table
- one manifest with row count, byte size, checksum, source MDB, and source table

The artifact pack is the only raw legacy landing zone now.

## Step 4: Create the target schema first

Before writing an importer:

1. add the Prisma model or SQL-owned target table,
2. add the migration,
3. apply the migration,
4. validate Prisma.

Rule:

- schema first, importer second

## Step 5: Choose the importer shape

### Snapshot importer

Use when the source is current-state data.

Examples:

- `inventory_quantities.csv` -> `app.stock_level`
- `vendor_master.csv` -> `app.vendor`

Pattern:

- read the full CSV set
- flatten or enrich as needed
- rebuild the target deterministically
- replay app-native deltas if the target is a projection

### Event-ledger importer

Use when the source is event history.

Examples:

- `inv_changes.csv` -> `app.stock_movement`

Pattern:

- filter eligible rows
- map legacy codes into app-owned vocabulary
- replace only the imported slice
- preserve app-native rows

## Step 6: Make reruns safe

Every importer must answer:

1. how it identifies prior imported rows,
2. how it avoids deleting app-native rows,
3. what happens on rerun,
4. how it avoids double-counting.

Recommended patterns:

- snapshot tables: `TRUNCATE`/rebuild inside one transaction, then replay app-native deltas if needed
- event-ledger tables: fence imported rows with a source family and replace only that family on rerun

## Step 7: Resolve natural keys

Build a map from legacy natural keys to owned primary keys before loading dependent tables.

Rules:

- unresolved joins must be reported
- unresolved rows must not disappear silently

## Step 8: Normalize legacy vocabulary

Do not copy opaque legacy codes blindly if the app already has a better owned vocabulary.

Instead:

1. preserve the raw code somewhere traceable,
2. map it into the owned type system,
3. document the mapping in the module spec or migration map.

## Step 9: Wire the importer into repo workflow

Each importer should have:

1. a service module,
2. a CLI entrypoint,
3. a package script,
4. batch/reject audit output where the module needs replay visibility.

Bootstrap order must follow data dependencies.

## Step 10: Cut request-path authority

Once the owned table is correct:

1. find the live request path,
2. replace legacy-source reads with the owned table,
3. remove dual-read logic,
4. verify the UI/API only depends on the owned surface.

## Step 11: Verify in three layers

### Importer verification

Record:

- total CSV rows read
- eligible rows
- inserted/updated/replaced rows
- rejected rows
- unresolved natural keys

### Database verification

Confirm:

- target tables exist
- expected counts are present
- spot checks match the source data

### Request-path verification

Confirm the live API/screen now reflects the owned table.

## Step 12: Record gaps honestly

Document which sources are:

- implemented now
- still deferred because no owned target exists
- validation-only
- still blocked by runtime cutover work

## Checklist

1. Read the module spec.
2. Update the migration map.
3. Confirm the source tables are canonical.
4. Extract the CSV artifact pack.
5. Create the owned schema and migration.
6. Build the importer.
7. Make reruns safe.
8. Run the importer against the target Postgres DB.
9. Verify DB state directly.
10. Cut the request path over.
11. Record unresolved rows and deferred sources.

## Related

- [docs/operations/migration-day-runbook.md](migration-day-runbook.md)
- [docs/dev/specs/2026-04-24-inventory-stock-maintenance-migration-map.md](../dev/specs/2026-04-24-inventory-stock-maintenance-migration-map.md)
- [docs/dev/specs/2026-04-25-legacy-reference-baseline-migration-map.md](../dev/specs/2026-04-25-legacy-reference-baseline-migration-map.md)
