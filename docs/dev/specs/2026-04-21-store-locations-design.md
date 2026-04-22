# Store Locations (Cities + Malls) — Design

**Date:** 2026-04-21
**Phase:** A (per [CLAUDE.md](../../../CLAUDE.md) rollout phases — app reads `rics_mirror`, writes land in `public`/`app`)
**Module:** [`store-ops`](../../modules/store-ops.md) (first concretely-landed piece of that module's scope)
**Status:** Draft for operator approval

## Context

The legacy RICS `StoreMaster` table has no notion of *mall* and stores city in a free-text column that's inconsistently cased and abbreviated (`TEGUCIGALPA`, `Tegucigalpa`, `Tegucigalpa M.D.C.`, `SPS`, `San Pedro Sula`). Operators cannot filter reports, inventory views, or sales reports by city or by mall because neither is first-class data.

This design adds two curated reference entities — **City** and **Mall** — and a **StoreLocation** overlay that links each RICS store (by its `rics_mirror.store_master.number` natural key) to a mall (optional) and tags it with a kind (`RETAIL | WAREHOUSE | ONLINE`). The overlay lives in the `app` schema so it survives every `sync:rics` reload ([see runbook](../../operations/rics-mirror-sync.md)).

RICS currently models 37 stores; 36 are in scope (store 18 *Tienda 18* is a dead row, ignored). Two canonical cities (Tegucigalpa, San Pedro Sula), 11 malls, 29 mall-bound store rows, 7 non-mall store rows.

## Goals

1. Every retail store knows what city and mall it's in — single authoritative source for reports, filters, and future UI.
2. Non-retail stores (warehouses, online-sales POS) are modeled and distinguishable from retail in one column, so reports can include/exclude them deliberately.
3. Survives a full RICS reload without operator re-entry.
4. Foundation for future `store-ops` features (store hours, lease metadata, region groupings, etc.) without schema rework.

## Non-goals

- **Not** a full `Store` entity modernization (as sketched in [`docs/modules/store-ops.md`](../../modules/store-ops.md)). That's a larger cutover — here we only add an *overlay* that joins to the existing mirrored `store_master`. Full `Store` table migration is future work.
- **Not** a `physical_site` entity for "one location, two store numbers" (stores 2/7 at Multiplaza). Captured as an open question; current design handles the case implicitly (two `StoreLocation` rows pointing at the same mall).
- **Not** mall metadata beyond name + city (no opening hours, no lease terms, no floor maps). Add later per demand.
- **Not** a UI change to any existing module. Only new admin screens under `store-ops/`.
- **Not** touching `rics_mirror`. The overlay refers to `rics_mirror.store_master.number` via a natural-key `smallint` column; readers `LEFT JOIN`.

## Architecture

### Schema

Three new tables in the `app` schema.

```prisma
enum StoreKind {
  RETAIL
  WAREHOUSE
  ONLINE

  @@schema("app")
}

model City {
  id        String   @id @default(uuid())
  name      String
  country   String   @default("Honduras")
  malls     Mall[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([name, country])
  @@map("city")
  @@schema("app")
}

model Mall {
  id        String          @id @default(uuid())
  name      String
  cityId    String
  city      City            @relation(fields: [cityId], references: [id])
  notes     String?
  stores    StoreLocation[]
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  @@unique([name, cityId])
  @@index([cityId])
  @@map("mall")
  @@schema("app")
}

model StoreLocation {
  ricsStoreCode Int       @id                  // matches rics_mirror.store_master.number
  kind          StoreKind @default(RETAIL)
  mallId        String?
  mall          Mall?     @relation(fields: [mallId], references: [id])
  notes         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([mallId])
  @@index([kind])
  @@map("store_location")
  @@schema("app")
}
```

Why these shapes:

- **`City` composite unique on `(name, country)`** — lets us extend to other countries later without renaming existing rows. Today Honduras only.
- **`Mall` composite unique on `(name, cityId)`** — "City Mall" and "Multiplaza" both exist in Tegucigalpa *and* San Pedro Sula. Composite key distinguishes them cleanly.
- **`StoreLocation.ricsStoreCode` as PK** — the natural key from RICS, stable across reloads. One row per store. No UUID indirection; the mirror references this number too.
- **`StoreLocation.kind` as enum** — enables the "retail only" filter every report will want. Warehouses and online-POS rows are flagged here and join `mall_id IS NULL`.
- **No FK from `StoreLocation` to `rics_mirror.store_master`** — `rics_mirror` gets dropped on every reload, so any FK pointing into it would break. The join is app-layer only.

### Read path — view (not a table)

App code should never hand-write the 3-join SELECT. We ship a Postgres view in the `app` schema that joins through:

```sql
CREATE VIEW app.store_location_view AS
SELECT
  sm.number           AS rics_store_code,
  sm."desc"           AS store_name,
  sm.city             AS rics_city,           -- raw RICS text, for debugging
  sm.addr1            AS rics_address,
  sl.kind             AS kind,
  c.id                AS city_id,
  c.name              AS city_name,
  m.id                AS mall_id,
  m.name              AS mall_name,
  sl.notes            AS notes,
  sl.updated_at       AS location_updated_at
FROM rics_mirror.store_master sm
LEFT JOIN app.store_location sl ON sl.rics_store_code = sm.number
LEFT JOIN app.mall            m ON m.id               = sl.mall_id
LEFT JOIN app.city            c ON c.id               = m.city_id;
```

Routes and UI read this view directly. Store 18 is in `rics_mirror` but has no `app.store_location` row, so it drops out of the inner-joinable reports — we also plan to filter it server-side via `WHERE sl.kind IS NOT NULL` in any list endpoint.

**View sits behind a Prisma migration** (`CREATE VIEW` is hand-rolled SQL, not auto-generated by Prisma). We add it in the same migration as the three tables.

### Seed data

All 36 active stores + 2 cities + 11 malls. Full list in the implementation plan under "Seed"; shape here:

```
city       : Tegucigalpa, San Pedro Sula
mall (11)  : 7 in Tegucigalpa, 4 in San Pedro Sula
storeLocation (36):
  - RETAIL in a mall      : 29 rows
  - RETAIL not in a mall  : 3 rows (stores 2, 6, 7; addresses at Multiplaza, downtown, Multiplaza respectively)
  - WAREHOUSE             : 2 rows (stores 90, 99, both Tegucigalpa)
  - ONLINE                : 2 rows (stores 1, 98, both Tegucigalpa)
```

Wait — correction per operator: stores **2 and 7 are at Multiplaza Tegucigalpa** (one physical location, two store numbers). Only store **6** (UNLIMITED Centro) is genuinely non-mall retail. So the breakdown is:

```
  - RETAIL in a mall      : 31 rows  (stores 2, 3, 5, 7, 8, 9, 13, 14, 15, 16, 17, 19, 20, 21,
                                      23, 24, 28, 30, 32, 35, 41, 42, 43, 91 in Tegucigalpa;
                                      10, 12, 22, 25, 26, 29, 31 in San Pedro Sula)
  - RETAIL not in a mall  : 1 row    (store 6 UNLIMITED Centro, downtown Parque Central)
  - WAREHOUSE             : 2 rows   (90 virtual, 99 physical; both Tegucigalpa, mall_id NULL)
  - ONLINE                : 2 rows   (1, 98; both Tegucigalpa, mall_id NULL)
```

Seed script is idempotent (upsert on `(name, country)` for cities, `(name, cityId)` for malls, `ricsStoreCode` for locations). Safe to re-run.

### API surface

All new, under `/api/v1/`. Auth: require a logged-in user; write ops require the `store-ops:write` permission (to be added to `employees`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/cities` | List cities, ordered by name. |
| POST | `/cities` | Create a city. Body: `{ name, country? }`. |
| PATCH | `/cities/:id` | Rename or edit country. |
| DELETE | `/cities/:id` | Delete. Refuses if any mall references it (409). |
| GET | `/malls` | List malls, optionally filtered by `cityId`. |
| POST | `/malls` | Create. Body: `{ name, cityId, notes? }`. |
| PATCH | `/malls/:id` | Edit. |
| DELETE | `/malls/:id` | Refuses if any store_location references it (409). |
| GET | `/store-locations` | Joined read of `app.store_location_view`. Supports `?kind=RETAIL` and `?mallId=` filters. Orders by `ricsStoreCode`. |
| GET | `/store-locations/:ricsStoreCode` | Single row from the view. |
| PUT | `/store-locations/:ricsStoreCode` | Assign / reassign mall + kind. Body: `{ mallId?: string \| null, kind: StoreKind, notes?: string }`. Upserts. |

No dedicated DELETE on `store-locations` — if you want a store off the map, leave the RICS row but set `kind = WAREHOUSE` or delete the overlay row (the view will show it as NULL kind).

### UI surface

New folder `apps/web/src/pages/store-ops/` with three pages under `/store-ops/`:

1. **Cities** (`/store-ops/cities`) — table with inline create/edit/delete. Uses `<CityFormModal />` for add/edit.
2. **Malls** (`/store-ops/malls`) — table grouped by city, inline create/edit/delete. City picker on the form.
3. **Stores** (`/store-ops/stores`) — the flagship page. Reads `store-locations` joined view. Columns: RICS #, Store name, RICS city (read-only), RICS address (read-only), Kind (dropdown), Mall (dropdown filtered by kind — malls hidden for WAREHOUSE/ONLINE), Notes, Last updated. Inline save per row (PUT `/store-locations/:code`).

Left-nav entry: add **"Store Ops"** section above `Products` in `AppLayout.tsx`, with three children (Cities / Malls / Stores).

No React page is built for the join-view as a report yet — that's a future `sales-reporting` enhancement (filter sales by mall / by city). In this spec we only ship the admin CRUD surface.

## Testing strategy

- **Services** (backend) — unit tests with mocked Prisma, cover the upsert logic, the 409 guards, and the store-kind/mall-id invariants (WAREHOUSE and ONLINE must have `mall_id = NULL`).
- **Routes** (backend) — supertest integration tests against an in-memory schema. Use Prisma test factory to create cities/malls/locations; assert HTTP semantics.
- **Seed** (backend) — a dedicated test that runs the seed script against a fresh DB and asserts: 2 cities, 11 malls, 36 store_location rows, counts per kind match the spec.
- **UI** (frontend) — Vitest unit tests on the three pages (Cities, Malls, Stores) using mocked API responses. One integration flow: add a city → add a mall → assign to a store, asserting the API calls fire in order.

## Open questions

1. **Should `Comayagüela` be its own city?** Administratively it's part of the *Distrito Central* with Tegucigalpa, and the operator confirmed all Comayagüela stores map to Tegucigalpa for now. If that changes, add a third city row and re-point 3 malls (Metromall, Premier) + stores 14, 21, 32, 91. Cost: one migration, no data loss.
2. **`physical_site` for stores 2 + 7 at Multiplaza.** Currently we model them as two independent `StoreLocation` rows with the same `mall_id`. If future features need "these two store numbers share a storefront" (combined inventory overview, single lease record), we add `app.physical_site` with a `siteId` FK on `StoreLocation`. No breaking change.
3. **`StoreLocation.notes`** — free text for now. If we find operators want structured tags (e.g., "food court", "ground floor, anchor tenant"), upgrade to a tags table later.
4. **Soft-delete or hard-delete on City / Mall?** Current plan: hard-delete with a 409 guard on referential integrity. No `deleted_at` column. If reporting history ever needs "this mall used to exist," soft-delete is an easy future migration.
5. **Permissions model.** The new routes are gated behind a `store-ops:write` permission. That permission needs to be added to the permission catalog in `employees` + assigned to the OWNER role (and any other admin roles) via seed. Tracked in the plan.

## References

- [CLAUDE.md — Rollout phases](../../../CLAUDE.md)
- [docs/modules/store-ops.md](../../modules/store-ops.md) — the module this feature lands under
- [docs/operations/rics-mirror-sync.md](../../operations/rics-mirror-sync.md) — schema layout (`rics_mirror` vs `app`) and why the overlay survives reloads
- [apps/api/prisma/schema.prisma](../../../apps/api/prisma/schema.prisma) — existing multi-schema Prisma config
