# Store Locations (Cities + Malls) — Implementation Plan

**Goal:** Ship the admin surface for managing cities, malls, and the store→mall overlay introduced in [`docs/dev/specs/2026-04-21-store-locations-design.md`](../specs/2026-04-21-store-locations-design.md). After this plan lands, an operator can open `/store-ops/stores` in the admin UI and assign every RICS store to a mall (or flag it as a warehouse / online POS). Subsequent `pnpm sync:rics` runs preserve the assignments.

**Architecture:** Phase-A Postgres-native. Three new tables in the `app` schema, one Postgres view joining them against `rics_mirror.store_master`, new Express routes under `/api/v1/`, three new admin-UI pages under `/store-ops/`, one idempotent seed script. No changes to `rics_mirror`, no changes to any existing adapter, no changes to any other module.

**Tech stack:** TypeScript, Prisma 5 (multi-schema), Postgres 16, Express, Jest, supertest, React 18, Ant Design 5, TanStack Query v5, Vitest.

**Spec:** [docs/dev/specs/2026-04-21-store-locations-design.md](../specs/2026-04-21-store-locations-design.md)

**Commit convention:** `feat(store-ops): …`, `feat(api): …`, `feat(web): …`, matching the `feat(<module>): …` style in the recent git log.

**Test commands:**
- Backend: `pnpm --filter @benlow-rics/api test -- <pattern>`
- Frontend: `pnpm --filter @benlow-rics/web test -- <pattern>`
- Typecheck: `pnpm --filter @benlow-rics/api build`, `pnpm --filter @benlow-rics/web typecheck`

---

## Table of contents

- **Phase A — Schema + seed** (Tasks 1–4): Prisma models, migration, seed script, data-driven test
- **Phase B — Backend routes** (Tasks 5–8): cities, malls, store-locations CRUD + the view-backed list
- **Phase C — Frontend admin pages** (Tasks 9–12): Cities, Malls, Stores + nav entry
- **Phase D — Permissions + docs** (Tasks 13–14): add `store-ops:write` permission; update module spec
- **Phase E — Verification + handoff** (Task 15): end-to-end manual walk-through, capture screenshots in handoff

Rough scope: ~15 atomic tasks, one PR-sized commit per task, one commit = one working state.

---

## Phase A — Schema + seed

### Task 1 — Add Prisma models for `City`, `Mall`, `StoreLocation`

**Goal:** New models land in [apps/api/prisma/schema.prisma](../../../apps/api/prisma/schema.prisma), annotated with `@@schema("app")`, enum `StoreKind` declared.

**Files:**
- Edit: [apps/api/prisma/schema.prisma](../../../apps/api/prisma/schema.prisma)

**Changes:** Append the three models + enum at the end of the file, using the shapes from the spec. Keep the enum immediately before the models it's referenced by (Prisma 5 requires the enum to be declared before use within the same schema block).

**Verify:**
- `pnpm --filter @benlow-rics/api prisma validate` → exits 0.
- Diff only adds lines; no existing model changed.
- No commit yet — pair with the migration in Task 2.

### Task 2 — Generate + hand-augment Prisma migration

**Goal:** `prisma migrate dev --name store_locations_initial --create-only` produces the DDL, then we append the `CREATE VIEW app.store_location_view` statement by hand.

**Files:**
- New: `apps/api/prisma/migrations/<ts>_store_locations_initial/migration.sql`

**Changes:**
1. Run `pnpm --filter @benlow-rics/api prisma migrate dev --name store_locations_initial --create-only`. Inspect the generated SQL — should be `CREATE TABLE app.city`, `app.mall`, `app.store_location`, indexes, FKs, the `StoreKind` enum type.
2. Append to the end of the generated `migration.sql`:

```sql
-- CreateView
CREATE VIEW app.store_location_view AS
SELECT
  sm.number                        AS rics_store_code,
  sm."desc"                        AS store_name,
  sm.city                          AS rics_city,
  sm.addr1                         AS rics_address,
  sl.kind                          AS kind,
  c.id                             AS city_id,
  c.name                           AS city_name,
  m.id                             AS mall_id,
  m.name                           AS mall_name,
  sl.notes                         AS notes,
  sl.updated_at                    AS location_updated_at
FROM rics_mirror.store_master   sm
LEFT JOIN app.store_location    sl ON sl.rics_store_code = sm.number
LEFT JOIN app.mall               m ON m.id               = sl.mall_id
LEFT JOIN app.city               c ON c.id               = m.city_id;
```

3. Apply: `pnpm --filter @benlow-rics/api prisma migrate dev`. Expect the migration to apply cleanly; Prisma Client regenerates.

**Verify:**
- `docker exec zacks-retail-postgres psql -U zacks -d zacks_retail -c '\dt app.*'` → shows `city`, `mall`, `store_location`.
- `docker exec zacks-retail-postgres psql -U zacks -d zacks_retail -c '\dv app.*'` → shows `store_location_view`.
- `SELECT * FROM app.store_location_view LIMIT 5;` → returns 5 rows with `kind IS NULL` (no overlay seeded yet).

### Task 3 — Seed script `apps/api/scripts/seed-store-locations.ts`

**Goal:** Idempotent script that writes 2 cities, 11 malls, 36 `store_location` rows. Re-runnable against a DB that already has them — no duplicates, no constraint violations.

**Files:**
- New: `apps/api/scripts/seed-store-locations.ts`
- Edit: `apps/api/package.json` — add `"seed:stores": "node --env-file-if-exists=.env -r tsx/cjs scripts/seed-store-locations.ts"`

**Seed tables:**

*Cities (2)*: `Tegucigalpa`, `San Pedro Sula`. Country `"Honduras"`.

*Malls (11)*:

| City | Mall |
|---|---|
| Tegucigalpa | Multiplaza |
| Tegucigalpa | Las Cascadas |
| Tegucigalpa | City Mall |
| Tegucigalpa | Metromall |
| Tegucigalpa | Miraflores |
| Tegucigalpa | Mall Tegucigalpa |
| Tegucigalpa | Premier |
| San Pedro Sula | City Mall |
| San Pedro Sula | Galerías del Valle |
| San Pedro Sula | Multiplaza |
| San Pedro Sula | Megamall |

*Store locations (36)*:

| # | Kind | Mall |
|---:|---|---|
| 1 | ONLINE | — |
| 2 | RETAIL | Multiplaza (Tegucigalpa) |
| 3 | RETAIL | Multiplaza (Tegucigalpa) |
| 5 | RETAIL | Multiplaza (Tegucigalpa) |
| 6 | RETAIL | — |
| 7 | RETAIL | Multiplaza (Tegucigalpa) |
| 8 | RETAIL | Multiplaza (Tegucigalpa) |
| 9 | RETAIL | Multiplaza (Tegucigalpa) |
| 10 | RETAIL | Multiplaza (San Pedro Sula) |
| 12 | RETAIL | Megamall |
| 13 | RETAIL | Miraflores |
| 14 | RETAIL | Metromall |
| 15 | RETAIL | Mall Tegucigalpa |
| 16 | RETAIL | Miraflores |
| 17 | RETAIL | Multiplaza (Tegucigalpa) |
| 19 | RETAIL | Mall Tegucigalpa |
| 20 | RETAIL | Multiplaza (Tegucigalpa) |
| 21 | RETAIL | Metromall |
| 22 | RETAIL | Galerías del Valle |
| 23 | RETAIL | Las Cascadas |
| 24 | RETAIL | Las Cascadas |
| 25 | RETAIL | City Mall (San Pedro Sula) |
| 26 | RETAIL | City Mall (San Pedro Sula) |
| 28 | RETAIL | Las Cascadas |
| 29 | RETAIL | Galerías del Valle |
| 30 | RETAIL | City Mall (Tegucigalpa) |
| 31 | RETAIL | City Mall (San Pedro Sula) |
| 32 | RETAIL | Premier |
| 35 | RETAIL | City Mall (Tegucigalpa) |
| 41 | RETAIL | City Mall (Tegucigalpa) |
| 42 | RETAIL | Las Cascadas |
| 43 | RETAIL | City Mall (Tegucigalpa) |
| 90 | WAREHOUSE | — |
| 91 | RETAIL | Premier |
| 98 | ONLINE | — |
| 99 | WAREHOUSE | — |

Store 18 is skipped (ignored per operator).

**Implementation notes:**
- Use `prisma.city.upsert({ where: { name_country: ... } })` for cities; same pattern for malls (key `name_cityId`); `prisma.storeLocation.upsert({ where: { ricsStoreCode: ... } })`.
- Keep the mapping table in the script as a const array so it's diff-friendly.
- Print a summary on success: `"OK — <cityCount> cities, <mallCount> malls, <locationCount> locations (by kind: RETAIL <n>, WAREHOUSE <n>, ONLINE <n>)"`.
- Exit 1 on any error, 0 otherwise.

**Verify:**
- `pnpm --filter @benlow-rics/api seed:stores` → first run prints counts matching the spec (2 / 11 / 36, kinds 32 / 2 / 2 — wait, RETAIL 32 including store 6 which has no mall).
- Re-run → same counts, no new rows, no errors.
- Spot-check via psql: `SELECT kind, COUNT(*) FROM app.store_location GROUP BY kind;` → `RETAIL 32, WAREHOUSE 2, ONLINE 2`.
- `SELECT rics_store_code, store_name, city_name, mall_name, kind FROM app.store_location_view WHERE rics_store_code IN (2, 7, 10, 25, 99) ORDER BY rics_store_code;` → correct assignments per the seed table.

### Task 4 — Seed integration test

**Goal:** A Jest test that runs the seed script against a fresh schema and asserts every invariant from the design.

**Files:**
- New: `apps/api/tests/seed-store-locations.test.ts`

**Test cases:**
1. After seed, `City` count is 2 and includes Tegucigalpa + San Pedro Sula.
2. After seed, `Mall` count is 11; `COUNT WHERE cityId = <Tegu id>` = 7, SPS = 4.
3. After seed, `StoreLocation` count is 36.
4. After seed, `COUNT WHERE kind = 'RETAIL'` = 32, WAREHOUSE = 2, ONLINE = 2.
5. After seed, `WAREHOUSE` and `ONLINE` rows have `mallId IS NULL`.
6. After seed, store 6 (downtown RETAIL) has `mallId IS NULL`.
7. Re-run seed → counts unchanged, no constraint violations.
8. View sanity: `app.store_location_view` returns 37 rows (36 seeded + store 18 with NULL overlay).

**Verify:**
- `pnpm --filter @benlow-rics/api test -- seed-store-locations` → all 8 tests green.

---

## Phase B — Backend routes

### Task 5 — `apps/api/src/services/storeOps/cityService.ts`

**Goal:** Thin service layer for city CRUD. Pure Prisma calls, no HTTP concerns.

**Files:**
- New: `apps/api/src/services/storeOps/cityService.ts`
- New: `apps/api/tests/storeOps/cityService.test.ts`

**Functions:**
- `listCities(prisma)` → `City[]` ordered by name
- `createCity(prisma, { name, country? })` → `City` (throws if duplicate via Prisma `P2002`)
- `updateCity(prisma, id, { name?, country? })` → `City`
- `deleteCity(prisma, id)` → void (throws a custom `CityInUseError` if any mall references it; service layer converts `P2003` → this error)

**TDD order:** write tests first (RED), implement (GREEN), refactor (if needed).

**Test cases:**
- List returns empty array on empty DB.
- Create → list shows the row.
- Create with duplicate `(name, country)` throws the Prisma unique error.
- Delete with no malls succeeds.
- Delete with malls throws `CityInUseError`.

**Verify:** `pnpm --filter @benlow-rics/api test -- cityService` all green.

### Task 6 — `apps/api/src/services/storeOps/mallService.ts`

**Goal:** Same shape as Task 5 for `Mall`, plus optional `cityId` filter on list.

**Files:**
- New: `apps/api/src/services/storeOps/mallService.ts`
- New: `apps/api/tests/storeOps/mallService.test.ts`

**Functions:**
- `listMalls(prisma, { cityId?: string })` → `Mall[]` with `city: { id, name }` included; ordered by city name then mall name.
- `createMall(prisma, { name, cityId, notes? })` → `Mall`
- `updateMall(prisma, id, { name?, cityId?, notes? })` → `Mall`
- `deleteMall(prisma, id)` → throws `MallInUseError` if any `storeLocation` references it.

**Verify:** test suite covers empty list, filtered list, create duplicate-in-same-city 409, delete-in-use 409.

### Task 7 — `apps/api/src/services/storeOps/storeLocationService.ts`

**Goal:** Read from the view for listing, write to the table for upsert.

**Files:**
- New: `apps/api/src/services/storeOps/storeLocationService.ts`
- New: `apps/api/tests/storeOps/storeLocationService.test.ts`

**Functions:**
- `listStoreLocations(prisma, { kind?: StoreKind, mallId?: string })` → array of the view's row shape (typed via a hand-written interface since Prisma doesn't model views).
- `getStoreLocation(prisma, ricsStoreCode)` → one row from the view or `null`.
- `upsertStoreLocation(prisma, ricsStoreCode, { mallId, kind, notes? })` → `StoreLocation`. Enforces: `kind = WAREHOUSE | ONLINE` implies `mallId === null` (service rejects with `ValidationError` otherwise).

**Implementation notes:**
- Use `prisma.$queryRaw` for view reads (Prisma doesn't track views natively). Keep the raw SQL string literal in the service for transparency.
- Upsert uses `prisma.storeLocation.upsert({ where: { ricsStoreCode }, create, update })`.

**Test cases:**
- List returns all 37 rows from the view (36 seeded + store 18 with NULL overlay).
- Filter by `kind=RETAIL` returns 32 rows.
- Filter by `mallId` returns the stores in that mall.
- Upsert on an existing code updates; on a new code creates.
- Upsert with `kind=WAREHOUSE` and non-null `mallId` throws `ValidationError`.

**Verify:** suite green.

### Task 8 — Express routes `apps/api/src/routes/storeOps/`

**Goal:** HTTP layer over the three services.

**Files:**
- New: `apps/api/src/routes/storeOps/cityRoutes.ts`
- New: `apps/api/src/routes/storeOps/mallRoutes.ts`
- New: `apps/api/src/routes/storeOps/storeLocationRoutes.ts`
- Edit: [apps/api/src/app.ts](../../../apps/api/src/app.ts) — mount the three routers under `/api/v1/cities`, `/api/v1/malls`, `/api/v1/store-locations`.
- New: `apps/api/tests/storeOps/cityRoutes.test.ts`
- New: `apps/api/tests/storeOps/mallRoutes.test.ts`
- New: `apps/api/tests/storeOps/storeLocationRoutes.test.ts`

**HTTP semantics:**
- 200 on successful read / update.
- 201 on successful create.
- 400 on bad body (zod validation).
- 404 on missing `:id` / `:ricsStoreCode`.
- 409 on `CityInUseError` / `MallInUseError` / duplicate create.
- 401 if no session (existing `requireAuth` middleware).
- 403 if session lacks `store-ops:write` (existing `requirePermission` middleware; permission added in Task 13).

**Test shape (per route file):** supertest against the mounted app, 8–12 cases per file covering the HTTP semantics list above.

**Verify:**
- `pnpm --filter @benlow-rics/api test -- storeOps` all suites green.
- `pnpm --filter @benlow-rics/api build` compiles.
- Manually hit one endpoint: `curl -b cookies.txt http://localhost:4000/api/v1/store-locations | jq '. | length'` → 37.

---

## Phase C — Frontend admin pages

### Task 9 — API client hooks `apps/web/src/services/storeOpsApi.ts`

**Goal:** Typed TanStack Query hooks for the 10 endpoints from Task 8.

**Files:**
- New: `apps/web/src/services/storeOpsApi.ts`
- New: `apps/web/src/types/storeOps.ts` (shared types: `City`, `Mall`, `StoreLocation`, `StoreLocationView`, `StoreKind`)

**Hooks:**
- `useCities()`, `useCreateCity()`, `useUpdateCity()`, `useDeleteCity()`
- `useMalls({ cityId? })`, `useCreateMall()`, `useUpdateMall()`, `useDeleteMall()`
- `useStoreLocations({ kind?, mallId? })`, `useStoreLocation(code)`, `useUpsertStoreLocation()`

Cache keys: `['cities']`, `['malls', cityId]`, `['storeLocations', filters]`. Invalidations wired on the mutation hooks.

**Verify:** `pnpm --filter @benlow-rics/web typecheck` passes. No test — hooks are tested implicitly through the page tests.

### Task 10 — Cities page `apps/web/src/pages/store-ops/CitiesPage.tsx`

**Goal:** Table with inline create + edit-in-modal + delete.

**Files:**
- New: `apps/web/src/pages/store-ops/CitiesPage.tsx`
- New: `apps/web/src/pages/store-ops/CityFormModal.tsx`
- New: `apps/web/src/pages/store-ops/__tests__/CitiesPage.test.tsx`

**Layout:** Ant Design `<Table>` with columns: Name, Country, Created at, Actions (Edit + Delete). Header has `<Button>+ Add city</Button>` opening `<CityFormModal />` in create mode.

**Error handling:** Delete returns 409 → show a Toast "Cannot delete — <N> malls reference this city. Reassign or delete the malls first."

**Test cases (Vitest):**
- Renders list from mocked `useCities`.
- Clicking Add opens the modal.
- Submitting the modal fires `useCreateCity`.
- Delete with 409 shows the toast.

**Verify:** tests green; navigate to `/store-ops/cities` in dev; create a test city, edit, delete. Ensure OWNER session works (adds a 403 test after Task 13 permissions wiring).

### Task 11 — Malls page `apps/web/src/pages/store-ops/MallsPage.tsx`

**Goal:** Same shape as Cities, but with a city filter at the top and a city picker in the form modal.

**Files:**
- New: `apps/web/src/pages/store-ops/MallsPage.tsx`
- New: `apps/web/src/pages/store-ops/MallFormModal.tsx`
- New: `apps/web/src/pages/store-ops/__tests__/MallsPage.test.tsx`

**Layout:** Filter row with `<Select>` cityId filter. Table columns: Name, City, Notes, Created at, Actions. Header `<Button>+ Add mall</Button>`.

**Test cases:** list with + without filter, create, edit (change city), delete with 409 in-use toast.

### Task 12 — Stores page `apps/web/src/pages/store-ops/StoresPage.tsx`

**Goal:** The anchor page. Lists all 37 rows from the store-locations view and lets you assign mall + kind inline.

**Files:**
- New: `apps/web/src/pages/store-ops/StoresPage.tsx`
- New: `apps/web/src/pages/store-ops/__tests__/StoresPage.test.tsx`
- Edit: `apps/web/src/components/AppLayout.tsx` — add a "Store Ops" nav group with children Cities / Malls / Stores.
- Edit: `apps/web/src/App.tsx` — register the three routes under `/store-ops/...`.

**Layout:** Table, one row per store. Columns:

| Col | Source | Editable? |
|---|---|---|
| RICS # | `rics_store_code` | no |
| Store name | `store_name` | no |
| RICS city | `rics_city` | no (read-only, shows raw RICS text for reference) |
| RICS address | `rics_address` | no |
| Kind | `kind` (enum dropdown) | **yes** — onChange fires PUT; if new kind ∈ {WAREHOUSE, ONLINE} clears mallId client-side before submit |
| Mall | `mall_name` via `mall_id` (dropdown) | **yes** — dropdown disabled when kind ∈ {WAREHOUSE, ONLINE}; options filtered to malls matching… no, show all malls, cities are separate entities. The city filter is implicit in which mall you pick. |
| Notes | `notes` | **yes** — inline text input |
| Updated | `location_updated_at` | no |

Row-level save: on any change, fire PUT `/store-locations/:code` with the current full `{ mallId, kind, notes }`. Use a 300ms debounce so rapid changes to the same row batch.

**Test cases:**
- Renders 37 rows from mock.
- Changing mall dropdown fires upsert.
- Changing kind to WAREHOUSE disables the mall dropdown and sends `mallId: null`.
- Save error (409/400) shows inline error banner and reverts the optimistic update.

**Verify:** `pnpm --filter @benlow-rics/web test -- StoresPage` green. Drive the page in dev: change a mall, reload, confirm persisted.

---

## Phase D — Permissions + docs

### Task 13 — Add `store-ops:write` permission

**Goal:** The three write routes from Task 8 require this permission; OWNER (and any other admin role) has it.

**Files:**
- Edit: `apps/api/src/services/employees/permissions.ts` — add `'store-ops:write'` to the permission catalog.
- Edit: `apps/api/prisma/seed.ts` (or the existing role-seed path) — grant the permission to the OWNER role on seed.
- New migration if permissions are stored in a DB table (check the existing model — likely a string array on `Role`).

**Verify:**
- Start API, log in as OWNER.
- `GET /api/v1/cities` returns 200.
- `POST /api/v1/cities` returns 201 for OWNER, 403 if token downgraded to a role without the permission (test this by stripping the permission in a Jest setup).

### Task 14 — Update `docs/modules/store-ops.md`

**Goal:** Record this feature as the first concretely-implemented piece of the `store-ops` module.

**Files:**
- Edit: [docs/modules/store-ops.md](../../modules/store-ops.md)

**Changes:**
- Add a new section at the top of "Modernization decisions" (or a dedicated "Implemented — v1 slice" section, whichever slots better): describe that `City`, `Mall`, and `StoreLocation` are live, living in the `app` schema, and link to this spec + plan.
- Add a row to the module's "Data model sketch" section mentioning the three new entities and the `app.store_location_view`.
- Update any "Open questions" that are now resolved.

**Verify:** run `/sync-module-docs store-ops` — report should NOT flag new drift around this feature.

---

## Phase E — Verification + handoff

### Task 15 — End-to-end walkthrough + handoff note

**Goal:** Prove the full flow works; leave a breadcrumb in `docs/dev/handoffs/`.

**Steps (operator-driven, no code):**
1. Fresh DB state: `pnpm --filter @benlow-rics/api prisma migrate reset --skip-seed`, then `prisma migrate dev`, then `seed:stores`, then `sync:rics`.
2. Start API + web. Log in as OWNER.
3. Navigate `/store-ops/cities` — see the 2 cities. Add "San Pedro Sula Test" temporarily and delete it.
4. Navigate `/store-ops/malls` — see 11. Filter by Tegucigalpa → 7. Filter by SPS → 4.
5. Navigate `/store-ops/stores` — see all 37 rows. Store 18 has `kind=NULL`, read-only. All other 36 show the seeded kind + mall.
6. Reassign store 6 (currently "not in a mall") to some mall, save, reload — persisted.
7. Reassign back to no-mall.
8. Re-run `pnpm --filter @benlow-rics/api sync:rics`. After ~5 min, navigate back to `/store-ops/stores` — all the custom overlay data is still there (this is the critical survival test).
9. Capture screenshots of the three pages + the post-sync "Stores" page into `docs/dev/handoffs/2026-04-21-store-locations-shipped.md` with short notes about each.

**Deliverable:** `docs/dev/handoffs/2026-04-21-store-locations-shipped.md` with screenshots + the steps above + any gotchas discovered.

---

## Order of execution + commit strategy

Each task is one commit. Commit message pattern: `feat(store-ops): <what this commit does>` or `feat(api): add city routes`, etc. One commit = one working state (tests green, build passes).

Suggested order: **1 → 2 → 3 → 4** (Phase A, all together — schema changes are a single logical unit) → **5 → 6 → 7 → 8** (Phase B services + routes, can be one commit per service/route pair) → **9 → 10 → 11 → 12** (Phase C hooks + pages) → **13 → 14** (permissions + docs) → **15** (handoff).

Don't ship Phase B without Phase A; don't ship Phase C without Phase B. Phase D (permissions) can slip in between C and E if it's simpler.

## Success criteria

All of these must hold at end of plan execution:

- `pnpm --filter @benlow-rics/api build` passes.
- `pnpm --filter @benlow-rics/web typecheck` passes.
- `pnpm --filter @benlow-rics/api test` passes (existing tests still green + new ~30 test cases added).
- `pnpm --filter @benlow-rics/web test` passes.
- `pnpm --filter @benlow-rics/api seed:stores` is idempotent (second run is a no-op).
- After `pnpm --filter @benlow-rics/api sync:rics`, every `app.store_location` row still exists (survival test).
- `/store-ops/cities`, `/malls`, `/stores` render and function in a browser.
- [docs/modules/store-ops.md](../../modules/store-ops.md) mentions the new feature and links to this plan.
- `/sync-module-docs store-ops` reports no drift caused by this feature.

## Risks / gotchas

- **Prisma view modeling.** Prisma doesn't know about views. We use `$queryRaw` for reads; if the view shape changes, it's a manual type update in `storeLocationService.ts`.
- **`sync:rics` timing.** If an operator runs `sync:rics` while the admin UI has open PUTs in flight, the ETL holds a long transaction that could briefly block writes on `app.store_location` because of shared-row locking on FK checks? No — the ETL only touches `rics_mirror` and never holds locks on `app.*`. Low risk.
- **Migration rollback.** We don't ship down-migrations on this project (per `docs/operations/rics-mirror-sync.md` pattern). If we need to back this out, it's a forward migration that drops the view then the three tables — still safe, but rollback is explicit.
- **Store 18 stays in `rics_mirror.store_master`.** The view shows it with `kind IS NULL`. The UI shows it read-only. If RICS eventually deletes it, the view just stops returning it; no overlay row to clean up.
- **Mall name ambiguity.** The UI shows mall name only; "City Mall" and "Multiplaza" exist in both cities. The mall dropdown on the Stores page groups by city or shows "Multiplaza (Tegucigalpa)" / "Multiplaza (San Pedro Sula)" to disambiguate — decide at Task 12 which rendering.
- **Future `physical_site`.** If we add it later, the `StoreLocation.ricsStoreCode` stays the PK; we add a new column `siteId` that groups multiple codes. No breaking change.

## References

- [Spec](../specs/2026-04-21-store-locations-design.md)
- [CLAUDE.md](../../../CLAUDE.md) — rollout phases, hard rules
- [docs/operations/rics-mirror-sync.md](../../operations/rics-mirror-sync.md) — why `app` schema survives reloads
- [docs/modules/store-ops.md](../../modules/store-ops.md) — owning module
- [apps/api/prisma/schema.prisma](../../../apps/api/prisma/schema.prisma) — existing multi-schema setup
