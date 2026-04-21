# Milestone: phase-a-request-cutover

**Date:** 2026-04-21
**Tag:** `milestone-2026-04-21-phase-a-request-cutover`
**Phase:** A
**Previous milestone:** [`milestone-2026-04-21-rics-mirror-live`](2026-04-21-rics-mirror-live.md)

## Summary

Phase A request-path cutover is complete. **Every adapter path on the request side now reads from `rics_mirror.*` Postgres tables instead of spawning PowerShell + OLEDB against the MDB files.** The ETL sync pipeline at `apps/api/src/services/sync/` still uses OLEDB — it's the one process that reaches the MDBs, and only when the operator invokes `pnpm sync:rics`. Request handlers never open an MDB.

## What shipped

### Seven cutover commits

| Commit | Scope |
|---|---|
| `ab01811` | SKU Lookup warmup — `ricsProductAdapter.loadSkuLookupIndex` → `rics_mirror.inventory_master` |
| `8aa5e5b` | Product adapter — snapshot, 4 dimension loaders, `getProductById` fallback, `queryInvCatalog` |
| `e44ec85` | Inventory adapter — 14 call sites across Inquiry, Find-by-Size, Detail Report, Change Detail, Transfer Summary, Recommended Transfers, per-(SKU × Store) rollups |
| `62c0d2e` | Inquiry sales-rollup — `getInquirySalesRollup` join `ticket_header ⨝ ticket_detail` for Week/Month/Season/Year windows |
| `9692f01` | On-Hand-at-Cost adapter (sales-analysis ROI/Turns feeder) |
| `016cb8c` | Sales History by Month adapter — 4 call sites (categories, master-for-criteria, monthly measures join, `inv_his` 12-slot LY history) |
| `efb40d0` | Sales Report adapter — 10 call sites covering Sales by Day / Time / SKU / Salesperson / Best Sellers / Stock Status |

### Translation patterns applied across all cutovers

- **Access SQL → Postgres:** `IIF(x IS NULL, 0, x)` → `COALESCE(x, 0)`; `TOP N` → `LIMIT N`; `[BracketedName]` → `snake_case`; `Year()/Month(x)` → `EXTRACT(... FROM x)`; `DatePart` → `EXTRACT`; `UCASE` → `UPPER`; `#mm/dd/yyyy#` literals → `$N::date` parameters; `Voided = False` → `voided = false`.
- **Shape preservation:** every projection aliases snake_case columns back to the PascalCase / hyphenated names downstream code consumes (e.g. `m_t_d_sales_01 AS "M-T-DSales_01"`) so no public function signature changed.
- **Parameterization:** every caller-supplied SKU / vendor / category / season / store now flows through `$N` / `ANY($N::type[])` — no string interpolation of user input survives.
- **Numeric handling:** `NUMERIC(18,4)` price and cost columns cast to `::float8` in SQL so Prisma returns JS `number` (matching the old JSON round-trip); `timestamptz` to_char'd to ISO-like strings where callers expected strings.
- **SKU padding quirk:** `rics_mirror.ticket_detail.sku` is right-padded to 15 chars in the mirror data (source MDB preserves trailing spaces). `inventory_master.sku` is not padded. Every ticket_*-reading query uses `RPAD($1, 15)` or pads the filter array; every master-reading query uses plain equality.

### Cross-source integrity spot-checks

- **Inquiry U9M:** `totals.ytdSales = 30214` (from per-store cell expansion on `inventory_quantities`) vs `rollup.year.qty = 30214` (from ticket aggregation on `ticket_detail`). Exact match on independent code paths — both mirror tables produce the same YtD number for the same SKU.
- **Sales-by-day:** `2025-12-01` store 2 ("UNLIMITED C. 2000"): `22,328.59` this year vs `36,825.06` last year (-39.4%). YoY offset of 364 days working end-to-end.
- **Salesperson summary:** 159 salespeople rolled up from ticket-detail, ordered by dollars. Top: Ana G. Lopez at store 26 — 92,802.62 HNL for the 3-day window.

## Data sources by schema (current)

| Schema | Role | Used by |
|---|---|---|
| `rics_mirror` | Read-only 1:1 mirror of canonical RICS tables, rebuilt atomically on `pnpm sync:rics` | Every request handler's RICS-sourced reads |
| `public` | Net-new storefront tables (Cart, Order, User, ProductContent, SeasonOverlay, ProductsAuditLog, Session, Role) — preserved across reloads | Auth, cart, orders, content overlay |
| `app` | Reserved for future module-owned additive tables | Empty as of this milestone |
| `platform` | ETL observability + admin spine | `etl_run`, `etl_run_table` |

## Next

**Physical inventory + customer-transactions + OTB-planning + purchase-planning module flows** still likely read MDBs in places the cutover sweep didn't touch. A good next step is a `grep -r 'runPowerShellJson\|buildSelectScript' apps/api/src` to enumerate any residual call sites (expected: only in `apps/api/src/services/sync/` + `accessOleDb.ts` + `persistentPwsh.ts`), then spot-test every user-facing page through the UI to confirm no adapter was missed.

After that, the natural next phase is beginning to **write to `public` / `app` schemas** from the app for flows that RICS doesn't own (product content overlay expansion, physical-inventory count sessions, OTB plans). That's the shape of Phase A → Phase B evolution.

## Notes (carry-forward from previous milestone)

- Managed-Postgres provider still deferred. Dev remains on local Docker Postgres (`localhost:5433`).
- `app` schema is still empty — when the first module-owned additive table lands there, the schema earns its keep. No need to force it.
- SQLite admin DB still present (legacy) but no longer in the request path for products/inventory/sales. Retiring it is a separate workstream.
