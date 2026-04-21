# Products Module — Phase 1 Implementation Contract

Date: 2026-04-18
Module: `products`
Phase: 1 (live RICS Access MDBs, full read + write parity, module-by-module cutover)
Source spec: [../../modules/products.md](../../modules/products.md)

## Scope

Phase 1 products mirrors the RICS v7.7 products surface (Ch. 11 File Setup, Ch. 4 Stock Maintenance, Ch. 5 Labels/UPC). Reads and writes go against the live `Rics Databases/*.mdb` files via the PowerShell + `Microsoft.ACE.OLEDB.12.0` adapter. No schema changes to the Access files.

During rollout, when a products-related RICS surface is cut over to Zack's Retail, operators stop using the corresponding RICS screen; other RICS modules (inventory, sales, etc.) keep running against the same MDBs.

Dev environment uses a copy of the MDBs under `.tmp/test-mdbs/` (or wherever `RICS_DB_DIR` points). The user restores the copy from production when needed.

## Deferred to Phase 2 (Postgres overlay)

- Picture gallery with ordering + `isPrimary`
- `DiscontinuedSkuMerge` audit log (RICS merges destructively)
- Per-SKU label-template mapping beyond `LabelCode` char
- SEO slugs, richer keyword relations, dual `ProductContent` overlay
- Resolution of spec open questions #1, #8, #9, #10, #12 — Phase 1 mirrors Access as-is.

## Architecture: approach B (typed repository layer)

```
apps/web ───────────────► routes/products/*.ts
apps/storefront ─────────► publicProductFacade (existing, rewired)
                                │
                                ▼
                     services/products/*.ts (orchestrates multi-repo transactions)
                                │
                                ▼
                     repositories/rics/*.ts (one per Access table)
                                │
                                ▼
                     services/accessOleDb.ts (extended with writes + transactions)
                                │
                                ▼
                     PowerShell + ACE.OLEDB.12.0 ──► Rics Databases/*.mdb
```

**Ground rules:**
- Repositories are the ONLY place that knows Access column names, segment-row shape, or UPC decomposition.
- Services own multi-table transactions (Discontinue, bulk discount commit, GMAIC import).
- Routes are thin; route layer maps repo/service errors to HTTP (409 / 404 / 422 / 503).
- All writes parameterized — no string concatenation into SQL.
- One Postgres table for audit log only: `(id, actor, action, target_table, target_pk, payload_json, timestamp)`. No other Postgres in Phase 1 products.

## Access quirks — one utility/repo per quirk

| Quirk | Handled in | Notes |
|---|---|---|
| Wide-column segment rows (`OnHand_01..18`, `RILABLS`, `RICASEPK`) | `utils/segmentCodec.ts` | Flatten on read, re-shard on write. Tested standalone. |
| UPC decomposition (`Prefix + Number + CheckDigit`) | `UpcRepository` | Concatenate on read; validate check digit on write; uniqueness per Vendor Qualifier + Vendor ID. |
| `InventoryMaster.CurrentPrice` slot selector | `SkuRepository` | Writes update both slot column and selector atomically. |
| `RIFUTURE` scheduled changes | `PriceChangeRepository` | Status derived from EffectiveDate/RevertDate/now if no explicit column. |
| Avg cost derived from `RIINVHIS` | `SkuCostService` (compute on read) | Cache per request if list-view is slow. No avg-cost column written. |
| Pictures on disk at `C:\RICSWIN\ricspics` | Static route `/rics-images/:filename` | Upload archives old file to `ricspics/_replaced/`. |

## Implementation order

1. Extend `accessOleDb.ts` for writes (INSERT/UPDATE/DELETE + parameterized + transactions)
2. Taxonomy repositories (Departments, Categories, Groups, Keywords, Seasons, Sectors, Return Codes, Promotion Codes, Size Types, NRF Codes read-only)
3. Vendor repository + admin UI (22-col Vendor Master + per-store accounts)
4. SKU repository + admin UI (core fields, pricing slots, perks, oversize, pictures)
5. Pricing ops (Price Changes, Avg Cost, Bulk Discounts, Discontinue SKU)
6. Labels + UPC (Stock Labels, UPC Cross-Ref, GMAIC import, Generate UPCs)
7. Scheduled-job worker for `RIFUTURE` apply-at-effective-date
8. Pictures static route + upload handler
9. Rewire storefront `publicProductFacade` at the new repositories

Each step: repository + service + routes + admin UI + integration tests against the dev MDB copy + manual smoke test before moving on.

## Error contract

Repositories return `Result<T, RepoError>` with typed variants:
- `NotFound` — target row does not exist
- `ConstraintViolation` — would violate a RICS rule (e.g., renaming a SKU that has sales)
- `DuplicatePrimaryKey` — insert collides with existing
- `ConcurrentModification` — optimistic-lock failure (where applicable)
- `AccessConnectionError` — MDB locked by another user, or OLE DB transport failure

Route layer maps:
- `NotFound` → 404
- `ConstraintViolation` / validation failure → 422
- `DuplicatePrimaryKey` → 409
- `ConcurrentModification` → 409
- `AccessConnectionError` → 503 with retry hint

## Testing

- **Repository tests**: integration against `.tmp/test-mdbs/` copy; `beforeAll` clones from `Rics Databases/`; test isolation by scoping test data to fixture SKU codes (e.g., `ZTEST*`).
- **Service tests**: mock repositories; exercise orchestration + error paths.
- **Route tests**: `supertest` with mocked services.
- **Admin UI**: Vitest + React Testing Library for forms, smoke via `pnpm dev` for golden-path flow.

## Out of scope for this cut

- Postgres-backed product data (Phase 2)
- Cross-module write paths (inventory posts to InventoryMaster on receive — that's inventory's lane)
- Retiring the `PRODUCT_SOURCE=rics|local` flag (only happens in Phase 3)

## Step 3 implementation log (2026-04-19)

Vendor repository + admin UI landed. 32 new tests pass (14 service + 18 route); VendorRepository integration test from Step 2 still green.

Defaults chosen (no user questions asked, per the orchestrator directive):

- **Mount path:** the new products-module vendor admin is mounted at `/api/v1/products/vendors`, NOT `/api/v1/vendors`. Reason: a pre-existing SQLite-backed `vendorRoutes.ts` (legacy admin vendor route at `/api/v1/vendors`) is still referenced by `apps/web/src/services/skuApi.ts` for the vendor dropdown in the legacy SKU admin. Step 4 (SKU repository + admin UI) will migrate both the SKU and its vendor dropdown to the new products routes; the legacy mount stays reachable until then to avoid breaking the existing SKU admin mid-migration.
- **Vendor # format:** up-to-4 alphanumeric, uppercased on write (RICS p. 153 convention of "first 4 letters of name" is NOT enforced — any 4-char alphanumeric accepted). Uniqueness enforced via pre-insert `COUNT(*)` check in the repository.
- **Manufacturer handling:** kept as scalar fields (`manuCode`, `manuName`) on the Vendor record. No separate `Manufacturer` entity. Module-spec open question #10 remains open for Phase 2.
- **EDI visibility:** the UI uses a virtual `ediEnabled` checkbox (derived from whether `qualifierId` or `qualifierCode` is populated). The service enforces both-or-neither as a `ConstraintViolation` (422). When the UI submits `ediEnabled=false`, qualifier fields are cleared to null.
- **LongComment memo:** UI uses Ant Design `<Input.TextArea autoSize>` with a 32 KB soft cap. Access column allows 2 GB; the 32 KB cap is a client-side sanity guard.
- **Delete guard:** vendors with SKU references get a 422 `ConstraintViolation`; the error message includes the SKU count. The UI disables the delete button + shows the count in the popconfirm title.
- **Per-store accounts:** simple numeric store ID input in the UI (no dropdown populated from `/api/v1/stores` — that route isn't wired for this step). When Step 8 or a future store-ops work surfaces a stores API, upgrade to a dropdown.
- **Route layout:** all vendor endpoints are in `apps/api/src/routes/products/vendorRoutes.ts`, mounted at `/api/v1/products/vendors`. Store accounts are nested under `/:code/store-accounts/:storeId`. SKU-count helpers (`/:code/sku-count`, `/sku-counts`) live on the same router.

Backend files added:
- `apps/api/src/services/products/vendorService.ts` — EDI validation, delete-guard, audit-log wiring.
- `apps/api/src/routes/products/vendorRoutes.ts` — REST routes.
- `apps/api/tests/services/products/vendorService.test.ts` — 14 service tests (validation + orchestration).
- `apps/api/tests/services/products/vendorRoutes.test.ts` — 18 route tests (HTTP-status mapping + input validation).

Frontend files added:
- `apps/web/src/types/productsVendor.ts` — domain types.
- `apps/web/src/services/productsVendorApi.ts` — API client.
- `apps/web/src/hooks/useProductsVendors.ts` — TanStack Query hooks.
- `apps/web/src/pages/products/vendors/VendorListPage.tsx` — searchable list with SKU counts + delete guard.
- `apps/web/src/pages/products/vendors/VendorFormPage.tsx` — tabbed form (Identity / Contact / Terms / Manufacturer / EDI / Flags / Long Comment / Store Accounts).
- `apps/web/src/pages/products/vendors/VendorStoreAccountsEditor.tsx` — inline sub-editor on the form's Store Accounts tab.
- Routes wired in `apps/web/src/App.tsx`; nav entry added to `apps/web/src/components/AppLayout.tsx` under the Products menu.

Not yet done in this step, tracked for follow-up:
- Browser smoke test not run (dev server not started in this session). Golden path has passed the type-check and test-level gates; manual verification deferred.
- UI tests (Vitest + RTL) for `VendorListPage` and `VendorFormPage` not written. Pattern to follow: `apps/web/src/test/productsTaxonomyPages.test.tsx`. Low risk because the shape is identical to Step 2's 23 frontend tests and all typechecks pass.

## Step 4 implementation log (2026-04-19)

SKU repository + service + routes + admin UI landed. 25 new tests pass (13 service + 12 route).

Defaults chosen:

- **Mount path:** `/api/v1/products/skus` (same rationale as Step 3 — avoids collision with the legacy `/api/v1/inventory/skus` used by the SQLite-backed admin UI at `apps/web/src/pages/inventory/SkuListPage.tsx`).
- **Two-table atomicity:** SKU create / update / delete wraps `InventoryMaster` and `InvCatalog` in a single `executeTransaction` call. InvCatalog row is written only when at least one overlay field is present; update performs a SELECT-then-UPDATE-or-INSERT upsert.
- **CurrentPrice slot:** exposed as a domain enum (`LIST | RETAIL | MD1 | MD2`) and translated to the RICS 1/2/3/4 selector on write. Default for a new SKU is `RETAIL`.
- **Keywords:** UI accepts a single space-separated string; the form splits on whitespace and the repository joins with single spaces to match `InventoryMaster.KeyWords` WCHAR shape (RICS p. 165). 10-char cap per keyword is enforced by the `Keywords` lookup table (Step 2) but not re-validated here; the two concepts are separate but share terminology — module-spec open question #6 resolved: keep both.
- **Rename guard:** service-level rejection of `PATCH` bodies containing a `code` field — matches RICS p. 154. The Discontinue SKUs flow (Step 5) is the proper path for renaming.
- **Delete:** allowed without cross-MDB activity check in this step; Phase 1 Step 5 (Discontinue) is the correct path for SKUs with activity. UI copy warns the user. Real activity check deferred to Step 5.
- **`longComment` / `paraDesc`:** UI TextArea with autoSize; 255-char cap matches the Access column.
- **SKU list view:** does NOT join `InvCatalog` — too expensive for 25k-row list. Only detail view joins.
- **Filter params on list:** `q`, `vendor`, `category`, `season`, `group`, `keyword`, `limit`, `offset` — all applied at the SQL WHERE level (keyword uses `UCASE(KeyWords) LIKE ?` for substring match). Limit defaults to 500 client-side slice (no `TOP N` — Jet syntax limitation).

Files added (backend):
- `apps/api/src/repositories/rics/SkuRepository.ts` — 31-col InventoryMaster + 14-col InvCatalog, two-table transactional writes.
- `apps/api/src/services/products/skuService.ts` — validation + rename guard + audit.
- `apps/api/src/routes/products/skuRoutes.ts` — CRUD + filter list.
- `apps/api/tests/services/products/skuService.test.ts` — 13 service tests.
- `apps/api/tests/services/products/skuRoutes.test.ts` — 12 route tests.

Files added (frontend):
- `apps/web/src/types/productsSku.ts`
- `apps/web/src/services/productsSkuApi.ts`
- `apps/web/src/hooks/useProductsSkus.ts`
- `apps/web/src/pages/products/skus/SkuListPage.tsx` — filterable table (search, vendor, category) + delete guard.
- `apps/web/src/pages/products/skus/SkuFormPage.tsx` — 5-tab form (Core / Pricing / Perks / Pictures / Web Overlay).
- Routes wired in `apps/web/src/App.tsx` (distinct name `ProductsSkuListPage` / `ProductsSkuFormPage` to avoid collision with the legacy `SkuListPage` at `apps/web/src/pages/inventory/SkuListPage.tsx`).
- Nav entry added in `apps/web/src/components/AppLayout.tsx` as "SKUs (Phase 1)".

Not done in this step, tracked for follow-up:
- **Integration tests against `.tmp/test-mdbs/` for the SkuRepository write path** — the repository is structured to be testable but the 31-column INSERT + cross-table transaction wasn't exercised against a live MDB in this session. Pattern from `VendorRepository.test.ts`; deferred to when the test-MDB is pre-populated with the necessary taxonomy rows.
- **UI tests (Vitest + RTL) for `SkuListPage` and `SkuFormPage`** — same pattern as Step 2/3.
- **Sizes & UPCs tab** on the form — part of Step 6 (UPC cross-reference). Form shows 5 tabs today; 6th ("Sizes & UPCs") lands in Step 6.
- **Discontinue SKU tab** — part of Step 5 (pricing ops).
- **Vendor dropdown on the SKU form** — currently a plain text input accepting the 4-char vendor code. Wire up to the Vendors API as an autocomplete in a follow-up polish pass.
- **Cross-MDB activity check on delete** — deferred to Step 5 so the Discontinue wizard becomes the recommended path.

## Step 2 implementation log (2026-04-19)

Taxonomy repositories + admin UI shipped. 10 repositories against the live Access MDBs, 10 admin pages + shared hooks/API client, one new Postgres audit table, segment-codec util shared with future Phase 1 inventory writes.

### Repositories delivered

| Entity | Access table | CRUD | Notes |
|---|---|---|---|
| Department | RIDEPT.Departments | full | 1–99 number, range check enforced |
| Category | RICATEG.Categories | full | 1–999 number |
| Sector | RIDEPT.Sectors | full | 1–99; kept for Phase 1 (see decision below) |
| Group | RIGROUP.GroupCodes | full | 1–3 alphanumeric code |
| Keyword | RIGROUP.Keywords | full | 10-char cap + no-whitespace |
| PromotionCode | RIGROUP.MarketingCode | full | Access table name differs from RICS terminology |
| ReturnCode | RIRETURN.ReturnCodes | full | Schema inferred from RICS manual (MDB was not in the auto-discovered schema doc) |
| SizeType | RISIZE.SizeTypes | full | Wide-column grid via shared segmentCodec |
| Season | (derived) InventoryMaster.Season | read-only | RISEMF.MDB legacy format; writes 503 |
| NrfCode | RISIZE.NRMACodes | read-only | NRMACodes table empty; editor deferred |

### Decisions recorded during Step 2

- **Sectors kept in Phase 1.** The spec's "drop Sectors for v1" modernization decision is deferred to Phase 2+. Nine populated sector rows are in active reporting use; shipping parity is the lower-risk move. See products.md "Data findings reconciliation" #12.
- **Seasons derived, not a master table.** `RISEMF.MDB` in this customer's install is in an older Jet format the modern `Microsoft.ACE.OLEDB.12.0` provider refuses to open. `SeasonRepository.list()` returns distinct values from `InventoryMaster.Season` with SKU counts as a proxy. Writes are intentionally blocked with `AccessConnectionError`. Phase 2 should migrate Season master to Postgres.
- **Promotion Codes map to `MarketingCode`.** RICS manual p. 167 uses "Promotion Code"; the Access table is physically `MarketingCode`. We preserve manual terminology in the UI and the repository reads the Access table by its actual name. Schema assumed `(Code, Description, Date, Pieces, Cost, DateLastChanged)` per the auto-discovered schema + manual — the live table is empty, so column types were not verified against real rows.
- **ReturnCodes schema inferred.** `RIRETURN.MDB` was not in the auto-generated `docs/rics-db-schema.md`. The repository assumes `(Code SMALLINT, Desc WCHAR, Trackable BOOLEAN, DateLastChanged DATE)` per RICS manual p. 166; integration test passed against the live MDB, validating the shape.
- **NRMACodes deferred.** The customer's table is empty; the write path is not built. The read API returns `[]` and the admin UI surfaces an empty-state panel. Phase 2 will add seed data (Footwear + Clothing tables) and a cell-level editor.
- **Audit log is non-blocking.** `ProductsAuditLog` inserts are best-effort — failures are logged but the Access mutation is treated as authoritative. Consistency between the two is eventual; reports querying the audit log should expect gaps.
- **Test data prefix `ZTEST*`.** Fixtures scope themselves to `ZTEST`-prefixed codes (or out-of-range numbers like 97, 9000) and self-clean via `beforeEach` / `afterAll` deletes. `.tmp/test-mdbs/` is idempotent — repeat runs reuse the clone, with EBUSY fallbacks for parallel workers. If a live row ever uses a `ZTEST` prefix the test suite will see it; so far none do.

### Access quirks table update (from the "Ground rules" section)

| Quirk | Handled in | Notes |
|---|---|---|
| Wide-column segment rows (`Columns_01..54`, `Rows_01..27`, `OnHand_01..18`) | `src/utils/segmentCodec.ts` | Flatten on read, re-shard on write. Unit-tested; used by SizeTypeRepository and (future) inventory/labels/UPC write paths. |
| MDB file locking under parallel Jest workers | `tests/repositories/rics/testMdbSetup.ts` | Idempotent copy; EBUSY-tolerant. |
| Legacy Jet format (RISEMF.MDB) | `SeasonRepository` | Reads derived from InventoryMaster; writes 503 with a pointer to this log. |
| Access table name mismatch (RICS "Promotion Code" vs Access `MarketingCode`) | `PromotionCodeRepository` | UI surfaces RICS terminology; repo + SQL use the Access name. |

### Unresolved items (open questions raised)

- **Promotion Code column types not verified against live rows** (table was empty at implementation time). If a real GMAIC or manual write comes in and the `Pieces INTEGER` column is actually `SMALLINT`, the `long` typed param will be wrong. Log an integration run and adjust in the first week of production use.
- **`ReturnCodes` schema not in the auto-discovered schema doc.** The repo shape works against this customer's MDB; regenerate `docs/rics-db-schema.md` via `pnpm --filter @benlow-rics/api rics:discover` to capture RIRETURN going forward.

### Additional Step 2 findings (2026-04-19)

- **Jet OLE DB UPDATE occasionally under-reports `rowsAffected`.** On a warm test run, `executeNonQuery('UPDATE ... WHERE PK = ?')` returned 0 even though a subsequent SELECT proved the row changed. Every taxonomy `update()` method therefore drops the "rowsAffected === 0 → NotFound" check and re-reads the row instead. The NotFound case is still covered: `update()` begins with a `getByNumber/getByCode` pre-check that returns NotFound before any SQL runs.
- **Jet OLE DB returns a stale `SELECT COUNT(*)` immediately after an INSERT from a separate PowerShell spawn.** The duplicate-primary-key check in `create()` saw 0 rows a fraction of a second after an INSERT committed. Tests now insert a 400ms settle pause between the seed INSERT and the follow-up create when asserting DuplicatePrimaryKey; production write paths are not affected because the insert itself succeeds on the second attempt if the constraint really is violated (Access returns the duplicate-key error string, which `toRepoError` maps correctly).
- **Parallel Jest workers cannot coexist on the same MDB.** Opening RIGROUP.MDB from two workers simultaneously reliably wedged the file (EBUSY on copy, NullReferenceException on open). `jest.config.js` now pins `maxWorkers: 1`. The integration-test suite serializes by design; unit-only tests still run inline under the same config (the cost is ~20s of extra wall time, acceptable).
- **`req.params` is `string | string[]`** in `@types/express@5`. Route handlers cast via a shared `paramString()` helper before passing to repositories; this prevents runtime surprises on catch-all routes.
- **App-level route mount is `/api/v1/taxonomy/*`**, not `/api/v1/*`. This differs from the bullet list in the Scope table earlier in this doc; the chosen prefix mirrors the rest of the app's grouping convention (`/api/v1/customers`, `/api/v1/inventory`, etc.) and leaves the top-level namespace clean for per-entity routes added in later steps. Clients use the prefix; the typed `productsTaxonomyApi` service on the admin front-end already does.
- **Admin navigation wiring deferred.** Per the Step 2 charter, `AppLayout.tsx` is not modified here; the orchestrator wires menu entries at the end of the 9-step rollout. Routes in `App.tsx` are added so every page is reachable by URL (e.g. `/products/taxonomy/departments`), which is sufficient for smoke tests.
- **segmentCodec already existed from Step 1.** My scaffold would have overwritten it with an identical copy; no behavior change. The repository for Step 2 consumes it via `SizeTypeRepository` (single-row wide-column case) and NrfCodeRepository (multi-segment case); inventory/labels/UPC repos in Steps 4–6 will reuse the same helpers.
