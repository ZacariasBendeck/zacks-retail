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
