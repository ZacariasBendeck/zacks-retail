# Vendor overlay design — `app.vendor_overlay`

**Date:** 2026-04-24
**Source:** `/index-knowledge` pass — routing of the vendor-overlay build (MDB → Postgres migration for the Products admin vendor surface).
**Type:** Design decision
**Migration:** [`apps/api/prisma/migrations/20260423190000_app_vendor_overlay/migration.sql`](../../../apps/api/prisma/migrations/20260423190000_app_vendor_overlay/migration.sql)
**Model:** `VendorOverlay` in [`apps/api/prisma/schema.prisma`](../../../apps/api/prisma/schema.prisma)
**Consumer:** [`apps/api/src/repositories/rics/VendorRepository.ts`](../../../apps/api/src/repositories/rics/VendorRepository.ts)

## Context

The OLE DB write path in `VendorRepository` (create / update / delete / store-account upsert against `RIVENDOR.MDB`) was deleted 2026-04-23 because writes-to-RICS-at-request-time blocks the Postgres-first direction and exposes a load-bearing dependency on a Windows-local PowerShell-spawn bridge.

Reads moved to `rics_mirror.vendor_master` (2,256 rows, populated by `sync:rics`) in the same pass. That left writes without a home: the mirror is read-only (atomically rebuilt on every `sync:rics`, per `ricsRefresh.ts`), and there's no other Postgres table for vendor master data.

The Products admin UI at `/products/vendors` already ships with New / Edit / Delete buttons + per-store account panels. Leaving writes disabled for "a few sprints" until a Postgres→RICS sync agent is designed was a non-starter — the UI would have 501-ed on every mutation.

## Decision

Single overlay table `app.vendor_overlay` with a `source` column taking one of three values: `'native'`, `'override'`, `'tombstone'`. One row per vendor code; the discriminator determines how reads combine this row with the mirror.

### Schema shape

```
app.vendor_overlay
  code          VARCHAR(4) PRIMARY KEY
  source        VARCHAR(10) CHECK IN ('native', 'override', 'tombstone')
  short_name    TEXT        -- nullable
  mail_name     TEXT        -- nullable
  addr1..addr2, city, state, zip, phone, fax, contact, terms,
  ship_inst, comment, manu_code, manu_name, qualifier_id, qualifier_code,
  color_code BOOLEAN, long_comment TEXT, e_mail TEXT   -- all nullable
  created_at / updated_at TIMESTAMPTZ
  created_by / updated_by TEXT
```

Two check constraints:
- `source IN ('native', 'override', 'tombstone')`
- `source = 'native' → short_name IS NOT NULL AND mail_name IS NOT NULL` (native rows must have identity)

Indexed on `source` for cheap tombstone/native filtering.

### Read projection

```sql
SELECT
  COALESCE(o.code, m.code)             AS code,
  COALESCE(o.short_name, m.short_name) AS short_name,
  COALESCE(o.city,       m.city)       AS city,
  ...
FROM rics_mirror.vendor_master m
FULL OUTER JOIN app.vendor_overlay o ON o.code = m.code
WHERE o.source IS NULL OR o.source != 'tombstone'
```

Semantics per overlay state:

- **No overlay row** → mirror row passes through unchanged.
- **`source='native'`** → no mirror twin; `COALESCE` picks every value from the overlay. Required columns non-null per the check constraint; other columns nullable and surface as-is.
- **`source='override'`** → mirror row exists; non-null overlay columns override, null overlay columns fall through to mirror values (sparse override).
- **`source='tombstone'`** → filtered out entirely. Mirror value hidden; overlay value columns ignored.

### Write routing

```
state before                        action on create/update/delete
-------------------------------------------------------------------------
code not in mirror, not in overlay  create → INSERT source='native'
code in mirror only                 update → INSERT source='override' (sparse)
                                    delete → INSERT source='tombstone'
code in mirror + overlay='override' update → UPDATE overlay (sparse merge)
                                    delete → UPDATE source='tombstone'
code in overlay='native'            update → UPDATE overlay in place
                                    delete → DELETE overlay row
code in overlay='tombstone'         create → DuplicatePrimaryKey (already tombstoned — unambiguously)
                                    update → NotFound
                                    delete → NotFound
```

Collision guard on create: a single query checks both `rics_mirror.vendor_master` and `app.vendor_overlay` in one round-trip and returns which source collides (if any). Prevents creating a "native" duplicate of a mirror vendor.

## Consequences

- **Writes work end-to-end on `/api/v1/products/vendors`** — POST returns 201, PATCH 200, DELETE 204. `/api/v1/vendors` (legacy, read-only) is unchanged.
- **Overlay rows don't reach RICS until the sync agent ships** (Phase B work). Warehouse/POS systems still see only what the last `sync:rics` copied. A new vendor created today is invisible to the cash register until cutover.
- **Store-account writes still 501** (`upsertStoreAccount` / `deleteStoreAccount` return `WriteNotSupported`). Scope-reduction; a separate `vendor_store_account_overlay` will follow the same pattern when needed.
- **Orphan-override risk.** If a RICS code disappears from the mirror between syncs (vendor deleted in RICS), an `'override'` or `'tombstone'` row for that code silently points at nothing. The FULL OUTER JOIN tolerates it (returns the overlay row as if native for `'override'`; filters it for `'tombstone'`). Add a post-sync `app.vendor_orphan_overrides` report when the sync agent work starts.
- **No schema prefixing of the code column.** Natural key only — no FK to `rics_mirror.vendor_master.code` because the mirror table is dropped every sync. Soft-ref pattern, matches `app.sku_attribute_override`.

## Alternatives considered

**Three separate tables** (`app.vendor_native`, `app.vendor_override`, `app.vendor_tombstone`): rejected. Three insert paths, three tables to JOIN, harder to produce a unified read projection, adds no clarity. The discriminator column carries the same semantic cleanly.

**Full-row override** (on first edit of a RICS vendor, copy the entire mirror row into the overlay with every column populated): rejected. Diverges from the `app.sku_attribute_override` sparse pattern, wastes storage, and silently freezes out later RICS-side updates to columns the operator didn't touch. The sparse model means a RICS-side phone-number update still surfaces unless the operator explicitly overrode phone.

**No overlay; keep writes disabled until the sync agent exists**: rejected. The UI has live New / Edit / Delete buttons; a multi-sprint regression for a design that's cheap to build now doesn't pay off.

**Separate `deleted_at` column + `is_native` boolean instead of a single `source` enum**: rejected. Two flags, four combinations, three of them meaningful — redundant. One enum is clearer and the check constraint easier to express.

## Verification

End-to-end smoke at [`apps/api/scripts/smoke-vendor-overlay.ts`](../../../apps/api/scripts/smoke-vendor-overlay.ts) exercises:

1. Create native `ZTST` → `source='native'` row with all columns
2. Duplicate create of `ZTST` → `DuplicatePrimaryKey`
3. Update native → stays `source='native'`, overlay UPDATE in place
4. Override mirror vendor `03EV` → `source='override'`, `short_name` stays NULL (falls through from mirror), `city`/`phone` overridden
5. Tombstone mirror vendor `1004` → disappears from `findByCode` + `findAll({ q: '1004' })`
6. Delete native → overlay row physically removed; second delete returns `NotFound`

Plus 24 unit tests under [`apps/api/tests/repositories/rics/VendorRepository.test.ts`](../../../apps/api/tests/repositories/rics/VendorRepository.test.ts) covering every write path + NotFound / DuplicatePrimaryKey / WriteNotSupported branches, Prisma client mocked.

## Related

- [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) §Write surfaces (overlay pattern) — catalogues this alongside `sku_attribute_override` / `sku_keyword_override`.
- [`docs/modules/products/decisions.md`](../../modules/products/decisions.md) §2026-04-24 — decision summary with alternatives.
- [`docs/modules/products/rics-module-specs.md`](../../modules/products/rics-module-specs.md) §Data model sketch — `VendorOverlay` model outline.
- [`docs/dev/specs/2026-04-22-postgres-first-rics-sync-cutover.md`](2026-04-22-postgres-first-rics-sync-cutover.md) — the Phase A→B plan this overlay enables.
