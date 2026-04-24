# Products Module — Development Against RICS Mirror Implementation Contract

Date: 2026-04-18 (architecture realigned 2026-04-24 to the Development / Cutover / Postgres-Only model)
Module: `products`
Strategy stage: **Development Against RICS Mirror**
Source spec: [../../modules/products/README.md](../../modules/products/README.md)

> **Re-alignment banner.** This document was originally written under a "live MDB read + write parity" model. That model is abandoned. The current migration strategy is:
>
> 1. **Development Against RICS Mirror** — RICS stays live in stores. Store operators keep using RICS. Zack's Retail reads imported RICS data from Postgres and writes only app-side draft / workflow / configuration data.
> 2. **Cutover Migration** — on cutover day, RICS usage stops, a final MDB backup is taken, a final RICS extraction runs, `rics_mirror` is promoted into module-owned schemas, primary / foreign keys are created, reconciliation checks pass.
> 3. **Postgres-Only Operation** — Zack's Retail is the system of record. MDB files and the OLE DB adapter are retired.
>
> Zack's Retail never writes to MDBs. Zack's Retail never writes into `rics_mirror`. App-created SKUs are not sellable / operational until the Cutover Migration promotes them.
>
> The "Step 2 / 3 / 4 implementation logs" near the bottom of this file describe code that shipped under the superseded strategy. Those repositories are scheduled for refactor to the Development-Against-RICS-Mirror model — see "Re-alignment work" below.

## Scope

Products mirrors the RICS v7.7 products surface (Ch. 11 File Setup, Ch. 4 Stock Maintenance, Ch. 5 Labels/UPC).

**Data-source rules while under Development Against RICS Mirror:**

- **Reads** come from the Postgres `rics_mirror.*` schema, populated by the operator-invoked `pnpm sync:rics` ETL. The web app never opens an MDB at request time.
- **Writes** land in `app.*` (or `public.*`) tables — module-owned overlay / draft / workflow / configuration data. Examples: `app.sku_draft`, `app.vendor_overlay`, `app.price_change_proposal`, `ProductsAuditLog`.
- **No writes to `rics_mirror`.** The ETL rebuilds `rics_mirror` atomically on each sync; any app write into it would be dropped on the next reload.
- **No writes back to MDBs.** RICS is authoritative until Cutover Migration; the only write path into RICS is operators using RICS itself.
- **App-created SKUs are drafts.** They live in `app.sku_draft` (or equivalent), are visible in admin, and are not part of inventory, pricing, or sellable stock until the Cutover Migration promotes them.

Dev environment still uses a local copy of the MDBs under `.tmp/test-mdbs/` (or wherever `RICS_DB_DIR` points) — but only for the ETL importer, not for the request path.

## Deferred to Cutover Migration

Cutover-day responsibilities (scripted but not live before then):

- Promote `rics_mirror.*` canonical tables into module-owned schemas (`products.*`, `inventory.*`, `sales_pos.*`, …).
- Merge app-side overlays (`app.vendor_overlay`, `app.sku_draft`, `app.price_change_proposal`, picture gallery rows, SEO slugs, keyword relations, `ProductContent`) into the promoted tables.
- Create primary keys and foreign keys on the promoted tables.
- Reconcile row counts, key coverage, and spot-check a known-good SKU, vendor, and price-change set against the final RICS export.
- Flip the read path from `rics_mirror.*` to the promoted module schemas.

## Deferred to Postgres-Only Operation

- Retire the OLE DB adapter (`accessOleDb.ts`, `runPowerShellJson`), the C# bulk extractor, the `bulk-extract.ps1` host, and the `rics_mirror` schema itself.
- Drop any compatibility shims introduced to make the pre-realignment repositories read from `rics_mirror` instead of MDBs.

## Architecture (target state under Development Against RICS Mirror)

```
apps/web ───────────────► routes/products/*.ts
apps/storefront ─────────► publicProductFacade (existing, rewired)
                                │
                                ▼
                     services/products/*.ts (orchestrates reads + app writes)
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
        repositories/mirror/*.ts    repositories/app/*.ts
        (reads rics_mirror.*)       (writes app.* / public.*)
                    │                       │
                    └───────────┬───────────┘
                                ▼
                     Prisma client → Postgres
                                │
                                ▼
                 rics_mirror.* (read-only, rebuilt by sync:rics)
                 app.* / public.*  (app-owned; preserved across reloads)
```

**Ground rules:**

- Mirror repositories are read-only. They know `rics_mirror` column names, segment-row shape, and UPC decomposition — the same knowledge that used to live in the MDB repositories, now pointed at `rics_mirror`.
- App repositories own writes to module-owned tables. They never touch `rics_mirror`.
- Services orchestrate multi-repo flows: e.g. "save a vendor overlay + audit log entry" uses one mirror read (to resolve the canonical vendor) and one app write (the overlay + audit rows).
- Routes are thin; route layer maps repo / service errors to HTTP (409 / 404 / 422).
- All writes parameterized (Prisma handles this).
- One Postgres table for audit log: `ProductsAuditLog (id, actor, action, target_table, target_pk, payload_json, timestamp)` in the `app` schema.

## Handling of RICS quirks

The wide-column segment rows, UPC decomposition, and price-slot selector no longer live in the web-app request path — they belong in the ETL that populates `rics_mirror`. The web app reads normalized shapes.

| Quirk | Where handled |
|---|---|
| Wide-column segment rows (`OnHand_01..18`, `RILABLS`, `RICASEPK`) | ETL importer flattens at load time; `rics_mirror` presents normalized child rows. Mirror repositories read the normalized shape. |
| UPC decomposition (`Prefix + Number + CheckDigit`) | ETL importer concatenates; `rics_mirror.upc.full_upc` is a single column. App-side UPC *creation* (draft SKUs) validates the check digit in `services/products/upcService.ts`. |
| `InventoryMaster.CurrentPrice` slot selector | Exposed as a domain enum (`LIST | RETAIL | MD1 | MD2`) on read. Draft SKUs in `app.sku_draft` use the enum directly; the cutover migration writes the corresponding RICS 1/2/3/4 selector if the target schema keeps it. |
| `RIFUTURE` scheduled changes | Read-only from `rics_mirror.rifuture`. App-side proposals live in `app.price_change_proposal` until cutover. |
| Avg cost derived from `RIINVHIS` | `SkuCostService` computes on read from `rics_mirror.riinvhis`. Cache per request for list views. |
| Pictures on disk at `C:\RICSWIN\ricspics` | Still served via static route `/rics-images/:filename`. App-side uploads land in a new object-store location referenced by `app.sku_picture`, not by overwriting RICSWIN files. |

## Implementation order (Development Against RICS Mirror)

1. **ETL coverage for products surface.** Confirm `rics_mirror` has every RICS table this module reads: `InventoryMaster`, `InvCatalog`, `Vendors`, `VendorStoreAccounts`, `Departments`, `Categories`, `Sectors`, `GroupCodes`, `Keywords`, `MarketingCode`, `ReturnCodes`, `SizeTypes`, `NRMACodes`, `RIFUTURE`, `RIINVHIS`, `RILABLS`, `RICASEPK`, `UPC`.
2. **Mirror read repositories.** One per canonical entity. Pure Prisma or raw SQL over `rics_mirror.*`. No writes.
3. **App overlay tables + repositories.** `app.vendor_overlay`, `app.sku_draft`, `app.sku_picture`, `app.price_change_proposal`, `ProductsAuditLog`. Prisma migrations land in `apps/api/prisma/migrations/`.
4. **Services + routes.**
   - Vendor admin — read from mirror, write overlays to `app`.
   - SKU admin — read from mirror for existing SKUs; draft creation writes to `app.sku_draft`.
   - Pricing ops — price-change proposals to `app.price_change_proposal`; bulk discount proposals likewise. No writes to `rics_mirror` or MDBs.
   - Labels + UPC — read existing UPCs from mirror; generate + stage new UPCs in `app.upc_draft`.
   - Pictures — static route stays; uploads go to app-side storage.
5. **Storefront rewire.** `publicProductFacade` reads from mirror + app overlays combined.
6. **Cutover migration scripts.** Write (but do not yet run in prod) the scripts that promote `rics_mirror` + app overlays into module-owned schemas on cutover day. Rehearse end-to-end on a copy of prod data.

Each step: mirror repo + app repo (if applicable) + service + routes + admin UI + integration tests against a seeded Postgres DB + manual smoke test before moving on.

## Error contract

Repositories return `Result<T, RepoError>` with typed variants:

- `NotFound` — target row does not exist in `rics_mirror` or `app.*`.
- `ConstraintViolation` — would violate a RICS business rule (e.g., renaming a SKU that has sales) or an app-side integrity rule.
- `DuplicatePrimaryKey` — insert into `app.*` collides with existing row.
- `ConcurrentModification` — optimistic-lock failure on `app.*` writes.
- `MirrorStale` — read failed because `rics_mirror` is mid-reload or last reload errored. Route maps to 503 with a retry hint pointing at the latest `platform.etl_run`.

Route layer maps:

- `NotFound` → 404
- `ConstraintViolation` / validation failure → 422
- `DuplicatePrimaryKey` → 409
- `ConcurrentModification` → 409
- `MirrorStale` → 503 with retry hint

The old `AccessConnectionError` variant is retired; nothing in the request path opens an MDB.

## Testing

- **Repository tests.** Integration against a disposable Postgres database seeded from a small `rics_mirror` fixture + empty `app.*` tables. No MDBs in the request-path test tree.
- **ETL tests** (separate suite). Continue to exercise the MDB → `rics_mirror` importer against `.tmp/test-mdbs/`.
- **Service tests.** Mock repositories; exercise orchestration + error paths.
- **Route tests.** `supertest` with mocked services.
- **Admin UI.** Vitest + React Testing Library for forms, smoke via `pnpm dev` for golden-path flow.

## Out of scope for this spec

- Cutover-day scripts themselves (separate spec: `docs/dev/specs/YYYY-MM-DD-products-cutover-migration.md`, to be written).
- Cross-module write paths (inventory, sales) — each has its own Development-Against-RICS-Mirror contract.
- Anything that would require writing into `rics_mirror` or back to an MDB — not part of this strategy at all.

## Re-alignment work (from the pre-2026-04-24 Step logs)

The Step 2 / 3 / 4 implementation logs below describe repositories that were built to **write directly to Access MDBs** via the OLE DB adapter. That conflicts with the current strategy. Remediation:

- **Vendor repository / vendorRoutes.ts / vendorService.ts** (Step 3): rewrite `VendorRepository` to read from `rics_mirror.vendors` and `rics_mirror.vendor_store_accounts`. Move the write path to a new `app.vendor_overlay` table and a new `AppVendorRepository`. The existing REST surface (`/api/v1/products/vendors`) stays; the PATCH/PUT bodies are reinterpreted as overlay fields rather than MDB column writes.
- **SKU repository / skuRoutes.ts / skuService.ts** (Step 4): split into a mirror-read repo (`rics_mirror.inventory_master` joined with `rics_mirror.inv_catalog` for the detail view) and an `AppSkuDraftRepository` for creates. Update / delete on existing (RICS-sourced) SKUs must be rejected during Development Against RICS Mirror — the operator goes to RICS for those. Updates on `app.sku_draft` rows are allowed.
- **Taxonomy repositories** (Step 2): point reads at `rics_mirror.departments`, `rics_mirror.categories`, `rics_mirror.sectors`, `rics_mirror.group_codes`, `rics_mirror.keywords`, `rics_mirror.marketing_code`, `rics_mirror.return_codes`, `rics_mirror.size_types`. Writes are postponed to Cutover Migration — admin UIs become read-only in the meantime, or each gets an `app.*_overlay` if the business needs edits before cutover. Decide per-entity with the operator.
- **Audit log.** `ProductsAuditLog` stays; writes continue to record admin actions against app-side tables. Entries from the pre-realignment MDB-write period remain for posterity.
- **Rename the `PRODUCT_SOURCE` flag out of the code.** It was a phase-numbering artifact; under the new strategy there is only one source (`rics_mirror` + `app.*`).

Any reference in the logs below to "writes to MDBs," "writes to Access," "extend `accessOleDb.ts` for writes," or "live MDBs" is superseded.

---

## Historical implementation logs (pre-realignment)

The sections below document code that shipped under the abandoned "live MDB read + write parity" approach. They are kept for provenance and to make the refactor items above concrete. Do not treat anything here as a current specification.

### Step 3 implementation log (2026-04-19) — superseded

Vendor repository + admin UI landed. 32 new tests pass (14 service + 18 route); VendorRepository integration test from Step 2 still green.

Defaults chosen (no user questions asked, per the orchestrator directive):

- **Mount path:** the products-module vendor admin is mounted at `/api/v1/products/vendors`, NOT `/api/v1/vendors`. Reason: a pre-existing SQLite-backed `vendorRoutes.ts` (legacy admin vendor route at `/api/v1/vendors`) is still referenced by `apps/web/src/services/skuApi.ts` for the vendor dropdown in the legacy SKU admin. Step 4 (SKU repository + admin UI) will migrate both the SKU and its vendor dropdown to the new products routes; the legacy mount stays reachable until then to avoid breaking the existing SKU admin mid-migration.
- **Vendor # format:** up-to-4 alphanumeric, uppercased on write (RICS p. 153 convention of "first 4 letters of name" is NOT enforced — any 4-char alphanumeric accepted). Uniqueness enforced via pre-insert `COUNT(*)` check in the repository.
- **Manufacturer handling:** kept as scalar fields (`manuCode`, `manuName`) on the Vendor record. No separate `Manufacturer` entity.
- **EDI visibility:** the UI uses a virtual `ediEnabled` checkbox (derived from whether `qualifierId` or `qualifierCode` is populated). The service enforces both-or-neither as a `ConstraintViolation` (422). When the UI submits `ediEnabled=false`, qualifier fields are cleared to null.
- **LongComment memo:** UI uses Ant Design `<Input.TextArea autoSize>` with a 32 KB soft cap.
- **Delete guard:** vendors with SKU references get a 422 `ConstraintViolation`; the error message includes the SKU count. The UI disables the delete button + shows the count in the popconfirm title.
- **Per-store accounts:** simple numeric store ID input in the UI (no dropdown populated from `/api/v1/stores` — that route isn't wired for this step).
- **Route layout:** all vendor endpoints are in `apps/api/src/routes/products/vendorRoutes.ts`, mounted at `/api/v1/products/vendors`. Store accounts are nested under `/:code/store-accounts/:storeId`. SKU-count helpers (`/:code/sku-count`, `/sku-counts`) live on the same router.

Backend files added:
- `apps/api/src/services/products/vendorService.ts`
- `apps/api/src/routes/products/vendorRoutes.ts`
- `apps/api/tests/services/products/vendorService.test.ts` — 14 service tests
- `apps/api/tests/services/products/vendorRoutes.test.ts` — 18 route tests

Frontend files added:
- `apps/web/src/types/productsVendor.ts`
- `apps/web/src/services/productsVendorApi.ts`
- `apps/web/src/hooks/useProductsVendors.ts`
- `apps/web/src/pages/products/vendors/VendorListPage.tsx`
- `apps/web/src/pages/products/vendors/VendorFormPage.tsx`
- `apps/web/src/pages/products/vendors/VendorStoreAccountsEditor.tsx`
- Routes wired in `apps/web/src/App.tsx`; nav entry added to `apps/web/src/components/AppLayout.tsx` under the Products menu.

**Re-alignment note for Step 3:** the backend code opens MDBs for writes. Refactor per the "Re-alignment work" section above — mirror reads + `app.vendor_overlay` writes.

### Step 4 implementation log (2026-04-19) — superseded

SKU repository + service + routes + admin UI landed. 25 new tests pass (13 service + 12 route).

Defaults chosen:

- **Mount path:** `/api/v1/products/skus` (avoids collision with the legacy `/api/v1/inventory/skus` used by the SQLite-backed admin UI at `apps/web/src/pages/inventory/SkuListPage.tsx`).
- **Two-table atomicity:** SKU create / update / delete wraps `InventoryMaster` and `InvCatalog` in a single `executeTransaction` call. InvCatalog row is written only when at least one overlay field is present; update performs a SELECT-then-UPDATE-or-INSERT upsert.
- **CurrentPrice slot:** exposed as a domain enum (`LIST | RETAIL | MD1 | MD2`) and translated to the RICS 1/2/3/4 selector on write. Default for a new SKU is `RETAIL`.
- **Keywords:** UI accepts a single space-separated string; the form splits on whitespace and the repository joins with single spaces to match `InventoryMaster.KeyWords` WCHAR shape (RICS p. 165). 10-char cap per keyword is enforced by the `Keywords` lookup table (Step 2) but not re-validated here.
- **Rename guard:** service-level rejection of `PATCH` bodies containing a `code` field — matches RICS p. 154. The Discontinue SKUs flow (Step 5) is the proper path for renaming.
- **Delete:** allowed without cross-MDB activity check in this step; Discontinue (Step 5) is the correct path for SKUs with activity. UI copy warns the user. Real activity check deferred to Step 5.
- **`longComment` / `paraDesc`:** UI TextArea with autoSize; 255-char cap matches the Access column.
- **SKU list view:** does NOT join `InvCatalog` — too expensive for 25k-row list. Only detail view joins.
- **Filter params on list:** `q`, `vendor`, `category`, `season`, `group`, `keyword`, `limit`, `offset` — all applied at the SQL WHERE level (keyword uses `UCASE(KeyWords) LIKE ?` for substring match). Limit defaults to 500 client-side slice (no `TOP N` — Jet syntax limitation).

Files added (backend):
- `apps/api/src/repositories/rics/SkuRepository.ts`
- `apps/api/src/services/products/skuService.ts`
- `apps/api/src/routes/products/skuRoutes.ts`
- `apps/api/tests/services/products/skuService.test.ts` — 13 service tests
- `apps/api/tests/services/products/skuRoutes.test.ts` — 12 route tests

Files added (frontend):
- `apps/web/src/types/productsSku.ts`
- `apps/web/src/services/productsSkuApi.ts`
- `apps/web/src/hooks/useProductsSkus.ts`
- `apps/web/src/pages/products/skus/SkuListPage.tsx`
- `apps/web/src/pages/products/skus/SkuFormPage.tsx`
- Routes wired in `apps/web/src/App.tsx` (distinct names `ProductsSkuListPage` / `ProductsSkuFormPage` to avoid collision).
- Nav entry added in `apps/web/src/components/AppLayout.tsx`.

**Re-alignment note for Step 4:** `SkuRepository` writes to two MDB tables transactionally. Refactor into `MirrorSkuRepository` (read-only, joins `rics_mirror.inventory_master` and `rics_mirror.inv_catalog`) + `AppSkuDraftRepository` (writes `app.sku_draft`). Updates on RICS-sourced SKUs become 422 `ConstraintViolation` until Cutover Migration promotes them.

### Step 2 implementation log (2026-04-19) — superseded

Taxonomy repositories + admin UI shipped. 10 repositories against the live Access MDBs, 10 admin pages + shared hooks/API client, one new Postgres audit table, segment-codec util shared with future inventory writes.

Repositories delivered:

| Entity | Access table | CRUD | Notes |
|---|---|---|---|
| Department | RIDEPT.Departments | full | 1–99 number, range check enforced |
| Category | RICATEG.Categories | full | 1–999 number |
| Sector | RIDEPT.Sectors | full | 1–99; kept (see decision) |
| Group | RIGROUP.GroupCodes | full | 1–3 alphanumeric code |
| Keyword | RIGROUP.Keywords | full | 10-char cap + no-whitespace |
| PromotionCode | RIGROUP.MarketingCode | full | Access table name differs from RICS terminology |
| ReturnCode | RIRETURN.ReturnCodes | full | Schema inferred from RICS manual (MDB was not in auto-discovered schema doc) |
| SizeType | RISIZE.SizeTypes | full | Wide-column grid via shared segmentCodec |
| Season | (derived) InventoryMaster.Season | read-only | RISEMF.MDB legacy format; writes 503 |
| NrfCode | RISIZE.NRMACodes | read-only | NRMACodes table empty; editor deferred |

Decisions recorded during Step 2:

- **Sectors kept.** Nine populated sector rows are in active reporting use; parity is the lower-risk move.
- **Seasons derived, not a master table.** `RISEMF.MDB` is in an older Jet format the `Microsoft.ACE.OLEDB.12.0` provider refuses to open. `SeasonRepository.list()` returns distinct values from `InventoryMaster.Season` with SKU counts as a proxy. Writes were blocked with `AccessConnectionError`.
- **Promotion Codes map to `MarketingCode`.** Manual p. 167 uses "Promotion Code"; the Access table is physically `MarketingCode`. UI preserves manual terminology; repository reads the Access table by its actual name.
- **ReturnCodes schema inferred.** `RIRETURN.MDB` was not in the auto-generated `docs/rics-db-schema.md`. The repository assumed `(Code SMALLINT, Desc WCHAR, Trackable BOOLEAN, DateLastChanged DATE)` per manual p. 166; integration test passed against the live MDB.
- **NRMACodes deferred.** Customer's table is empty; read API returns `[]`.
- **Audit log is non-blocking.** `ProductsAuditLog` inserts are best-effort — failures are logged but the Access mutation was treated as authoritative.
- **Test data prefix `ZTEST*`.** Fixtures scope themselves to `ZTEST`-prefixed codes and self-clean.

Access quirks observed during Step 2 (moved to the ETL under the new strategy):

| Quirk | Where it now lives |
|---|---|
| Wide-column segment rows (`Columns_01..54`, `Rows_01..27`, `OnHand_01..18`) | ETL importer flattens on load into normalized `rics_mirror` child tables. |
| MDB file locking under parallel Jest workers | ETL test harness only; request-path tests hit Postgres. |
| Legacy Jet format (RISEMF.MDB) | ETL-side fallback; mirror still exposes `rics_mirror.season_usage` derived from `inventory_master.season`. |
| Access table name mismatch (RICS "Promotion Code" vs Access `MarketingCode`) | ETL normalizes; `rics_mirror.marketing_code` preserves the RICS column name but the API surfaces the manual term. |

Unresolved items (open questions raised):

- Promotion Code column types not verified against live rows (table was empty at implementation time). First real GMAIC or manual write will validate.
- `ReturnCodes` schema not in auto-discovered schema doc. Regenerate via `pnpm --filter @benlow-rics/api rics:discover` to capture RIRETURN.

Additional Step 2 findings (2026-04-19) — apply to ETL-era code only, not to the new Postgres request path:

- **Jet OLE DB UPDATE occasionally under-reports `rowsAffected`.** Taxonomy `update()` methods dropped the "rowsAffected === 0 → NotFound" check and re-read the row instead. NotFound was still covered via a pre-check. (Moot under the new plan — request-path writes go to Postgres, not Jet.)
- **Jet OLE DB returns a stale `SELECT COUNT(*)` immediately after an INSERT from a separate PowerShell spawn.** Tests inserted a 400ms settle pause when asserting DuplicatePrimaryKey. (Moot.)
- **Parallel Jest workers cannot coexist on the same MDB.** `jest.config.js` pinned `maxWorkers: 1`. (Only the ETL test suite still has this constraint.)
- **`req.params` is `string | string[]`** in `@types/express@5`. Route handlers cast via a shared `paramString()` helper before passing to repositories.
- **App-level route mount is `/api/v1/taxonomy/*`**, not `/api/v1/*`. Clients use the prefix; the typed `productsTaxonomyApi` service already does.
- **Admin navigation wiring deferred.** Per the Step 2 charter, `AppLayout.tsx` was not modified there; routes were added in `App.tsx` so every page was reachable by URL.
- **segmentCodec already existed from Step 1.** No behavior change.

**Re-alignment note for Step 2:** flip every taxonomy repository to read from `rics_mirror.*`. The ten admin UIs become read-only during Development Against RICS Mirror unless the operator decides a specific entity needs an app-side overlay before cutover. Writes that previously hit MDBs are removed from the request path.
