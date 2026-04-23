# RICS SKU Creation — Technical Note

Pre-implementation discovery for the Postgres → RICS sync path described in
[2026-04-22-postgres-first-rics-sync-cutover.md](./2026-04-22-postgres-first-rics-sync-cutover.md) §5.

**Method:** read-only inspection of the existing write code in this repo. The
legacy RICS write path has been partially implemented already — see
[apps/api/src/repositories/rics/SkuRepository.ts](../../apps/api/src/repositories/rics/SkuRepository.ts)
`create()` (line 639) and `update()` (line 678). This note summarizes what that
code says Access needs, and flags the gaps that still require manual Access-UI
verification before we trust it as the sync path.

---

## 1. Connection shape

All writes happen through [apps/api/src/services/accessOleDb.ts](../../apps/api/src/services/accessOleDb.ts),
which is a PowerShell + OLE DB bridge. Each call spawns a new `powershell.exe`
process (async via `child_process.spawn`). Connection details:

- **Provider**: `Microsoft.ACE.OLEDB.12.0` (the Access Connectivity Engine
  redistributable — must be installed on the machine doing the writes).
- **Connection string**: `Provider=Microsoft.ACE.OLEDB.12.0;Data Source=<mdb-path>;Jet OLEDB:Database Password=<password>;Persist Security Info=False;`
- **Password**: auto-recovered from the MDB file header at startup (see
  [accessOleDb.ts:516](../../apps/api/src/services/accessOleDb.ts#L516) — a
  pre-existing Jet-password decoder). Can be overridden with
  `RICS_MDB_PASSWORD` env var.
- **Target file for SKU writes**: `RIINVMAS.MDB` (env override:
  `RICS_INVMAS_DB_FILE`). Resolved relative to `RICS_DB_DIR` or the
  `Rics Databases/` folder in the repo root.
- **Transactions**: supported via `executeTransaction(path, password, ops[])`
  — `BeginTransaction` / `Commit` / `Rollback` on a single `OleDbConnection`.
  Used today to keep the `InventoryMaster` + `InvCatalog` inserts atomic.

**Hard constraint:** `runPowerShellJson()` **must stay async** — see the
`HARD RULE` in [CLAUDE.md](../../CLAUDE.md) and
[docs/operations/access-oledb-async-spawn.md](../operations/access-oledb-async-spawn.md).
Do not introduce a `spawnSync` fast-path for the sync agent; it will freeze
the event loop for 0.7–60 seconds per call.

---

## 2. Tables that get written on SKU create (from code)

A SKU create touches **at most two tables**, both in `RIINVMAS.MDB`, inside
one OLE DB transaction:

| Table | Required? | Purpose |
|---|---|---|
| `InventoryMaster` | always | Core SKU record (31 cols) |
| `InvCatalog` | only if any overlay field is set | Web overlay (long description, bullet points, web filename, picture names) |

Source: [SkuRepository.ts:657–670](../../apps/api/src/repositories/rics/SkuRepository.ts#L657).

### 2.1 `InventoryMaster` column map

Full ordinal list from [docs/rics-db-schema.md §RIINVMAS](../rics-db-schema.md#riinvmasmdb)
cross-referenced against [SkuRepository.ts:382–416](../../apps/api/src/repositories/rics/SkuRepository.ts#L382):

| # | Column | Access type | Nullable in DDL | Code type hint | Notes |
|---|---|---|---|---|---|
| 1 | `SKU` | WCHAR | yes | `string` | **PK in practice** (uniqueness checked by COUNT(*) before insert — see §5). Max 15 chars. Uppercased + trimmed before write. |
| 2 | `VendorSKU` | WCHAR | yes | `string` / `null` | Max 20 chars. Vendor's own SKU code. |
| 3 | `Category` | SMALLINT | yes | **`long` (int32)** | ⚠ mismatch vs. DDL SMALLINT — see §7. Required by service validation. Must exist in `RICATEG.Categories.Number`. |
| 4 | `Vendor` | WCHAR | yes | `string` | Required by service validation. Must exist in `RIVENDOR.Vendor Master.Code`. |
| 5 | `SizeType` | SMALLINT | yes | `long` | Must exist in `RISIZE.SizeTypes.Code` if set. |
| 6 | `Desc` | WCHAR | yes | `string` | Required by service validation. Max 30 chars. |
| 7 | `StyleColor` | WCHAR | yes | `string` / `null` | Max 20 chars. |
| 8 | `Season` | WCHAR | yes | `string` / `null` | Max 2 chars (see `SKU_FIELD_LIMITS.season`). |
| 9 | `Location` | WCHAR | yes | `string` / `null` | Max 10 chars. |
| 10 | `ListPrice` | CURRENCY | yes | `decimal` | |
| 11 | `RetailPrice` | CURRENCY | yes | `decimal` | **Required + non-negative** (service-level). |
| 12 | `MarkDownPrice1` | CURRENCY | yes | `decimal` | |
| 13 | `MarkDownPrice2` | CURRENCY | yes | `decimal` | |
| 14 | `CurrentPrice` | SMALLINT | yes | `integer` (int16) | Slot selector: `1=List, 2=Retail, 3=MD1, 4=MD2`. Defaults to `2` (RETAIL) if unset. |
| 15 | `CurrentCost` | CURRENCY | yes | `decimal` | |
| 16 | `OverSizeColumn` | WCHAR | yes | `string` / `null` | Max 3 chars. |
| 17 | `OverSizeAmount` | CURRENCY | yes | `decimal` | |
| 18 | `Perks` | CURRENCY | yes | `decimal` | |
| 19 | `Manufacturer` | WCHAR | yes | `string` / `null` | Max 20 chars. |
| 20 | `LabelCode` | WCHAR | yes | `string` / `null` | Max 1 char. |
| 21 | `ColorCode` | WCHAR | yes | `string` / `null` | Max 3 chars. |
| 22 | `Comment` | WCHAR | yes | `string` / `null` | Max 30 chars. |
| 23 | `GroupCode` | WCHAR | yes | `string` / `null` | Max 3 chars. Must exist in `RIGROUP.GroupCodes.Code` if set. |
| 24 | `KeyWords` | WCHAR | yes | `string` / `null` | Max 60 chars joined. Array on domain → space-joined, uppercased on write. |
| 25 | `PictureFileName` | WCHAR | yes | `string` / `null` | Max 50 chars. Points to a file under `C:\RICSWIN\ricspics`. |
| 26 | `Coupon` | BOOLEAN | **NO** | `boolean` | Only NOT NULL column. Defaults `false`. |
| 27 | `LastPriceChange` | DATE | yes | `date` | **Set to `NOW()` at write time.** |
| 28 | `Status` | WCHAR | yes | `string` / `null` | Max 1 char. Known values: `'D'` = discontinued. |
| 29 | `DateLastChanged` | DATE | yes | `date` | **Set to `NOW()` at write time.** |
| 30 | `OrderMultiple` | SMALLINT | yes | `long` | |
| 31 | `OrderUOM` | WCHAR | yes | `string` / `null` | Max 10 chars. |

### 2.2 `InvCatalog` column map

Written only if any overlay field is set (see
[SkuRepository.ts:419](../../apps/api/src/repositories/rics/SkuRepository.ts#L419)).
The schema doc lists 21 columns; current code writes 14 (the non-deprecated ones):

| Column | Access type | Writer sets? | Notes |
|---|---|---|---|
| `SKU` | WCHAR | yes | Join key to `InventoryMaster.SKU` |
| `LongColor` | WCHAR | yes | Max 30 chars |
| `BoldDesc` | WCHAR | yes | Max 60 chars |
| `ParaDesc` | WCHAR | yes | Max 255 chars |
| `CatalogSKU` | WCHAR | yes | Max 20 chars |
| `BulletText_01..05` | WCHAR | yes | Up to 5 bullets, max 80 chars each |
| `PictureName_01` | WCHAR | yes | Max 50 chars |
| `PictureName_02` | WCHAR | yes | Max 50 chars |
| `SizeText` | WCHAR | yes | Max 30 chars |
| `WebFileName` | WCHAR | yes | Max 50 chars |
| `CfgFileName` | WCHAR | **no** | Not touched by current code |
| `Categories_01..05` | SMALLINT | **no** | Not touched by current code (RICS-side web overlay that the retail app doesn't consume) |
| `DateLastChanged` | DATE | **no** | Not touched — possible gap |

---

## 3. Minimum-viable-payload for RICS ingestion (service-level)

From [skuService.ts:31–51 `validateCreate`](../../apps/api/src/services/products/skuService.ts#L31):

```
code         (1..15 chars, alphanumeric + legacy symbols, uppercased)
vendor       (non-empty; must exist in Vendor Master)
category     (integer; must exist in Categories)
description  (non-empty, ≤ 30 chars)
retailPrice  (number ≥ 0)
```

Everything else on `InventoryMaster` is nullable in the DDL. `Coupon` is
NOT NULL in the DDL but the writer always passes a value (`false` by default).

`InvCatalog` is entirely optional — the code skips the whole INSERT if none
of the overlay fields are set.

---

## 4. Postgres → RICS field mapping (for the sync projection)

Based on `app.sku` columns in [apps/api/prisma/schema.prisma:360–420](../../apps/api/prisma/schema.prisma#L360).
Source fields that don't map to RICS are parked — the sync payload carries
only the RICS-required subset; the rest stays Postgres-only until cutover.

| `app.sku` field | `InventoryMaster` column | Notes |
|---|---|---|
| `code` | `SKU` | 1:1 once `code` is minted by `finalize()` |
| `vendorSku` | `VendorSKU` | 1:1 |
| `categoryNumber` | `Category` | 1:1; must pre-exist in RICS Categories |
| `vendorId` | `Vendor` | **needs mapping.** `app.sku.vendorId` is a text key; verify it matches `Vendor Master.Code` exactly, else add a `vendor_id → rics_vendor_code` mapping row. |
| `sizeType` | `SizeType` | 1:1 if set; must pre-exist in `SizeTypes.Code` |
| `descriptionRics` | `Desc` | 1:1. `descriptionWeb` stays Postgres-only. |
| `styleColor` | `StyleColor` | 1:1 |
| `season` | `Season` | 1:1 |
| `location` | `Location` | 1:1 |
| `listPrice` | `ListPrice` | Decimal(12,2) → CURRENCY |
| `retailPrice` | `RetailPrice` | Decimal(12,2) → CURRENCY. Required. |
| `markDownPrice1` | `MarkDownPrice1` | |
| `markDownPrice2` | `MarkDownPrice2` | |
| `currentPriceSlot` (enum) | `CurrentPrice` (int) | map `LIST→1, RETAIL→2, MD1→3, MD2→4` |
| `currentCost` | `CurrentCost` | |
| *(none)* | `OverSizeColumn` | Postgres-only; send `NULL` |
| *(none)* | `OverSizeAmount` | Postgres-only; send `0` or `NULL` |
| *(none)* | `Perks` | Postgres-only until perks program is modeled |
| `manufacturer` | `Manufacturer` | 1:1 |
| `labelCode` | `LabelCode` | 1:1 |
| `colorCode` | `ColorCode` | 1:1 |
| `comment` | `Comment` | 1:1 |
| `groupCode` | `GroupCode` | 1:1 |
| `keywords` | `KeyWords` | split-on-space → array in Postgres; joined-with-space → single WCHAR on write (max 60 chars joined) |
| `pictureFileName` | `PictureFileName` | File content must also be delivered to `C:\RICSWIN\ricspics` (out of scope for SQL sync) |
| `coupon` | `Coupon` | BOOLEAN NOT NULL |
| *(set by writer)* | `LastPriceChange` | `NOW()` at sync time |
| `skuState` | `Status` | map `ACTIVE → NULL`, `DISCONTINUED → 'D'`. `DRAFT` should never reach RICS. |
| *(set by writer)* | `DateLastChanged` | `NOW()` at sync time |
| `orderMultiple` | `OrderMultiple` | 1:1 |
| `orderUom` | `OrderUOM` | 1:1 |

**Not synced to RICS (Postgres-only):** `id`, `provisionalCode`, `familyCode`,
`brandId`, `descriptionWeb`, `style`, lifecycle audit fields
(`activatedAt/By`, `discontinuedAt/By`, `createdAt/By`, `updatedAt`),
`legacyAttrs`, `source`, `rics_sync_status`, `rics_sync_error`,
`rics_synced_at`, `rics_legacy_code`, `rics_row_id`.

**InvCatalog overlay** can also be projected if we decide to populate the
web-overlay fields from Postgres. Current recommendation: **skip for the
sync MVP** — operationally RICS doesn't need it; it's a POS/ecom convenience.
Revisit once `app.sku.descriptionWeb` / product media are in use.

---

## 5. Write-path flow (from existing `create()`)

[SkuRepository.ts:639–676](../../apps/api/src/repositories/rics/SkuRepository.ts#L639):

```
1. normalize code → UPPERCASE trim
2. SELECT COUNT(*) FROM [InventoryMaster] WHERE [SKU] = ?  → duplicate check
   → return DuplicatePrimaryKey if > 0
3. Build inventoryMasterParams (31 values)
4. Build invCatalogParams (14 values) IF any overlay set, else null
5. executeTransaction:
     INSERT INTO [InventoryMaster] (...31 cols...) VALUES (?, ?, ... ?)
     IF overlay: INSERT INTO [InvCatalog] (...14 cols...) VALUES (?, ?, ... ?)
6. Invalidate SKU list cache
7. Re-read via findByCode() and return
```

Parameterized `?` placeholders throughout — no user value is ever inlined
into SQL (see [SkuRepository.ts:659](../../apps/api/src/repositories/rics/SkuRepository.ts#L659)).

### Error shape

[ricsAccess.ts:78 `toRepoError`](../../apps/api/src/repositories/rics/ricsAccess.ts#L78):

- Error text matching `duplicate value|cannot contain a null value|not unique|violation of PRIMARY KEY|duplicate key|the changes you requested` → `DuplicatePrimaryKey`.
- Everything else → `AccessConnectionError`.

For the sync agent, at minimum surface both.

---

## 6. Recommended safe write strategy

**Start with direct DB write via the existing `SkuRepository.create()` path.**
The code is written, typed, parameterized, transactional, and already consumed
by [apps/api/src/routes/products/skuRoutes.ts](../../apps/api/src/routes/products/skuRoutes.ts).
No need to re-invent.

Refinements for the sync-agent context:

1. **Run the agent on a warehouse-local Windows box** where ACE.OLEDB 12.0 is
   installed and the MDBs are directly reachable (avoids network + lock
   contention with RICS.EXE).
2. **Hold the connection only for the transaction.** Open, insert, commit,
   close. No long-lived handle — RICS.EXE will escalate to an exclusive lock
   on certain actions and break a held shared lock.
3. **Honor the RICS file-lock window.** If `RIINVMAS.LACCDB` (the Access
   lockfile) is held by `RICS.EXE`, back off and retry — do not force the
   insert. The sync job table should carry an `attempt_number` + `next_retry_at`.
4. **Per-call async spawn, not a persistent PowerShell host.** The existing
   `runPowerShellJson` uses async `spawn` with a fresh process per query.
   The sync agent should reuse that — it's the combination that survived
   50+ k-row pulls without deadlocks
   (see [accessOleDb.ts:83](../../apps/api/src/services/accessOleDb.ts#L83)
   comment about why the persistent host was abandoned).
5. **Write once, verify once.** After commit, `SELECT [SKU]` to confirm the
   row landed (the existing `create()` already does this via `findByCode`).

**Do NOT start with CSV import or UI automation** — both lose the transaction
guarantee and require solving file-format or window-handle problems that the
direct-write path already solved.

---

## 7. Known risks and unknowns (must verify before go-live)

These are items the code-only inspection cannot answer. Each is **blocking**
for a high-confidence rollout.

### 7.1 Type mismatch on `Category` and `SizeType`

Schema says `SMALLINT` (int16, OLE DB `SmallInt`) but the code sends
`type: 'long'` (OLE DB `Integer` = int32) — see
[SkuRepository.ts:386, 388](../../apps/api/src/repositories/rics/SkuRepository.ts#L386).
Jet usually tolerates widening, but the OLE DB strict-mode path can reject
this. **Verify** by running one end-to-end insert against a test copy of
`RIINVMAS.MDB`.

### 7.2 Write path has no integration test

There is no `SkuRepository.test.ts` under
[apps/api/tests/repositories/rics/](../../apps/api/tests/repositories/rics/).
Every other rics repo has one. That means:

- the INSERT has never been exercised in CI against a real MDB,
- and the "Duplicate SKU fails cleanly" path has only been exercised via
  service-level mocks.

**Action:** add `SkuRepository.test.ts` mirroring the pattern in
`DepartmentRepository.test.ts` (ZTEST sentinel SKUs, create → re-read →
clean up). Gate the sync MVP on this test passing against `.tmp/test-mdbs/`.

### 7.3 Unknown side-effects on manual creation

When an operator creates a SKU via the RICS desktop application, it may
populate additional rows beyond `InventoryMaster` + `InvCatalog`. Candidates
to check:

- **Inventory quantities** — does RICS auto-insert a zero-row per store into
  the segmented InventoryQuantities table? If yes, the sync must create
  those rows too, or receiving will fail.
- **Barcode / UPC** — does RICS auto-generate or auto-link a barcode row?
  Barcodes are under a different MDB; sync may need to write there too.
- **Price history** — is there a `PriceChange` / `PriceHistory` log row
  written at creation time?
- **Vendor cross-reference** — does a `Vendor X-Ref` row get created if the
  `VendorSKU` is set?

**Method:** make a dummy SKU manually in RICS on a test copy of the MDB set,
then `SELECT * FROM <candidate tables>` before and after. Record the diff
in §7 of this note.

### 7.4 VBA / macros / form events

The code above bypasses everything Access-side. If RICS relies on form
`AfterInsert` events to initialize anything, direct INSERTs will skip those.
Open `RIINVMAS.MDB` in Access and inspect:

- every form that edits `InventoryMaster`,
- VBA project modules,
- saved macros,
- saved queries that chain through (`make-table`, `append`).

If VBA writes derivative rows, the sync agent must either (a) replicate those
writes, or (b) delegate creation to UI automation of the RICS app. (a) is
strongly preferred.

### 7.5 `InvCatalog.DateLastChanged` not written

The current writer omits `DateLastChanged` on `InvCatalog` inserts/updates.
Probably harmless, but if anything downstream (reports, audit) filters on it,
the row will look stale. Either add it to `invCatalogParams` or confirm it
is unused.

### 7.6 Status NULL vs. empty string

`Status` is nullable but the service maps the absence of a state change to
`null`. Verify RICS treats `NULL` and `''` as equivalent (i.e., "not
discontinued"). If it distinguishes, pick one and enforce at the param
builder.

### 7.7 `Coupon` NOT NULL

Only NOT NULL column on `InventoryMaster`. Writer always supplies `false`
default. No action — just worth noting so no one "sparse-ifies" the INSERT
later.

### 7.8 Password recovery

`getOrRecoverPassword(path)` decodes the password from the MDB header.
Works on the MDBs checked into the repo today. If the warehouse's live MDBs
have been re-protected with a newer Jet version or an ACE encryption variant,
recovery will fail and the agent will need the password via
`RICS_MDB_PASSWORD`. Verify on the actual production file, not the repo copy.

### 7.9 File-lock contention with `RICS.EXE`

Live RICS holds shared read locks and escalates to exclusive for certain
maintenance. The sync agent must tolerate `The database has been placed in
a state by user 'Admin' on machine 'XYZ' that prevents it from being
opened or locked` and back off. Retry window needs to be tested in situ —
5 s / 30 s / 5 min cascade is a reasonable starting point.

### 7.10 Picture files

`PictureFileName` is just a path string. The actual file needs to land under
`C:\RICSWIN\ricspics` (or `RICS_IMAGES_DIR`). That's a **second delivery
channel** the sync agent has to handle: SMB copy, HTTP pull, whatever. Out
of scope for the SQL sync MVP but must be designed before we claim "SKU
synced to RICS".

---

## 8. Next steps

1. **Confirm §7.3 (side effects):** create one SKU manually in a test copy of
   RICS, diff the MDBs, and amend this note.
2. **Confirm §7.4 (VBA):** inspect the Access forms. If any VBA fires on SKU
   insert, add to the sync payload.
3. **Close §7.2 (test):** write `SkuRepository.test.ts` and run it green against
   `.tmp/test-mdbs/`.
4. **Verify §7.1 (types):** one live-insert regression test.
5. Only then: build the sync agent (plan §4) on top of the existing
   `SkuRepository.create()`.

This note is a living document. Each verified item moves from §7 to §2 or §4
with a code reference.
