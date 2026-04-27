# Decisions: Purchasing

Running log of **module-scoped** design decisions — the *why* behind design choices that show up in the other artifacts in this folder. Append new entries at the **top** (most recent first).

Cross-module and project-wide decisions live in [`../../dev/specs/`](../../dev/specs/) instead — if a decision affects more than this module, write it there and (optionally) reference it here.

## Entry format

Each entry follows this shape:

> ## YYYY-MM-DD — Short decision title
>
> **Context:** What situation or question prompted this decision.
> **Decision:** What was decided.
> **Consequences:** What follows — tradeoffs, new constraints, knock-on effects.
> **Alternatives considered:** 1–3 options rejected, with one-line reason each.
> **Related:** Commits / specs / runbooks if applicable.

---

<!-- Decisions go below this line, most recent first. -->

## 2026-04-26 — `app.purchase_order_legacy_line.received_qtys` is a packed INT[]; sum via `unnest`, no voided flag

**Context:** Sell-Through Analysis needed a units-received total per SKU and per department over a date range. The first request-path consumer of the legacy PO surface in Postgres exposed how the imported RICS PO data is shaped — different from the placeholder `purchase_order_lines.quantity_received` scalar that the SQLite dev tables advertised.

**Decision:** Treat the `app.purchase_order_legacy_line` / `app.purchase_order_legacy` pair as the canonical PO surface for any report or service that needs receiving data, with these read conventions:

- Per-line received quantity: `(SELECT COALESCE(SUM(q), 0) FROM unnest(pol.received_qtys) AS q)`. The `received_qtys` column is `INT[]` with 18 packed segments preserved from the RICS source — never a scalar; never trust the array element order.
- Date filter: `app.purchase_order_legacy.last_received_at` (TIMESTAMPTZ). `order_date` is the order date, not the receive date — wrong field for sell-through-style "received in period" queries.
- SKU join key: `app.sku.code = pol.sku_code`. 100% join coverage observed across the current dataset (~205K POL lines, all matched). `pol.sku_id` is also present and nullable; the code-based join is simpler and observed-complete, so prefer it.
- **No voided / cancelled flag.** Neither `purchase_order_legacy` nor `purchase_order_legacy_line` carries an active voided state — the SQLite-era `WHERE po.status NOT IN ('DRAFT', 'CANCELLED')` filter has no Postgres equivalent today. Imported data is assumed clean. If a status surface becomes necessary, add a column on the legacy table (Phase A migration) rather than back-channeling through other fields.

**Consequences:**
- Receiving aggregates are subquery-heavy because of the `unnest`; the planner generally collapses these into hash aggregates for filtered queries (sub-second), but unfiltered scans across 205K lines × 18-element arrays are noticeably slower than the SQLite stub was.
- Reports that depend on a "voided PO" exclusion will show inflated received-units totals if voided-status data is later imported but no filter is added. Re-audit each receiving-aware report when a status column lands.
- Legacy PO data ranges back to 2005; a no-date-filter report will sum over 21 years of receiving history. Default to a date-bounded window in any new report.

**Alternatives considered:**
- *Use `pol.sku_id` (UUID FK) instead of `sku_code` for the SKU join.* Rejected for v1 — `sku_id` is nullable and the code-based join was observed to be 100%-coverage. Revisit if `sku_id` ever becomes non-nullable.
- *Treat `order_date` as the receiving date when `last_received_at` is null.* Rejected — conflates intent (ordered) with fact (received). A line with no receipts shouldn't contribute to "units received".

**Related:** [`docs/dev/specs/2026-04-26-sell-through-postgres-cutover.md`](../../dev/specs/2026-04-26-sell-through-postgres-cutover.md) — first consumer of these conventions. Tables: `app.purchase_order_legacy`, `app.purchase_order_legacy_line` (Prisma schema lines 616 / 658).
