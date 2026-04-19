# OTB — Plan file entry, % change method (design spec)

- **Date**: 2026-04-19
- **Module**: [`otb-planning`](../../modules/otb-planning.md)
- **Phase**: 1 (admin DB only; matches RICS v7.7 behavior page-for-page)
- **Manual grounding**: Ch. 11 pp. 158–160 (OTB Plan – File Setup), Ch. 17 p. 214 (Company Setup → OTB entry Method), Ch. 12 p. 170 (Print OTB Plan File)
- **Blocks**: Open-To-Buy Report (p. 100), Open-To-Buy vs. Sales Report (p. 100), Print OTB Plan File (p. 170), fixed-mix method slice, `[Copy Sales]` slice

## Problem

Zack's Retail cannot port any of the three OTB reports without first letting a buyer set up an OTB Plan file. The manual is explicit: *"This file is optional. It is used when printing the Open-To-Buy vs. Sales Report and the Open-To-Buy Report."* (p. 158); every report description ends with *"You need to set up an Open-To-Buy Plan before running this report."*

The existing `otb_budgets` table in [`apps/api/src/db/database.ts:276`](../../../apps/api/src/db/database.ts#L276) **is not the RICS OTB Plan**. It holds `(department, year, month, planned_budget, notes)` — a single dollar amount per macro-department per month, built for custom PO-submit budget validation. The RICS plan is keyed by **Store × Category × fiscal year** and carries % change fields, planned turnover, planned GP%, and 12 monthly planned-sales + 12 monthly markdown-% cells. Different shape, different grain, different purpose. This slice introduces the RICS-shaped plan file as a new table; the legacy `otb_budgets` stays untouched.

## Goal

Ship the **"% change over last year's sales for each category"** plan-entry path end-to-end (manual p. 158, *"the most commonly used"* method). After this slice:

- A buyer can enter, list, edit, and delete an OTB Plan row keyed by `(storeId, categoryId, fiscalYear)`.
- The row holds the RICS header fields (% change LY→CY, % change CY→NY, planned turnover 1H, 2H, planned GP%) and 12 monthly planned-sales cells.
- `[ReCalculate]` fills the 12 monthly cells from last-year actuals × (1 + %change) — the exact behavior described at p. 159.
- `[Copy]` duplicates the current row into a next (storeId, categoryId) that has no saved row.
- A company-level `otbEntryMethod` setting exists (Company Setup p. 214) with values `CHANGE_OVER_LAST_YEAR | FIXED_MONTHLY_MIX`. This slice implements the former; the latter is stubbed (reads return the value, writes reject with `NOT_IMPLEMENTED` for UI routes that depend on it).
- Audit trail captures every edit (per the pattern in `otb_budget_audit`).
- A minimal plan-entry UI page (list + single-row edit form) hangs off the admin web app.

## Non-goals (explicitly out of this slice)

- **Fixed-monthly-mix method** (p. 159 second screen) — covers `[Store Totals]`, `[Apply]`, `[Category Totals]` navigation, and the 100%-category-mix invariant. Separate follow-up slice.
- **`[Copy Sales]`** (p. 158) — duplicates LY actuals into CY plan, or CY plan into NY plan. Requires the `sales-reporting.getCategorySalesByPeriod` contract which is not built. Separate slice, behind that contract.
- **Open-To-Buy Report** and **Open-To-Buy vs. Sales Report** (p. 100) — separate slices; this slice only makes them possible.
- **Print Open-To-Buy Plan File** (p. 170) — diagnostic dump; trivially a GET + CSV on this slice's list endpoint. Separate slice.
- **Close Month / Close Year snapshot of last-year sales** (p. 158 footnote: *"The 'Last year sales' column does not show figures until you close your month at year-end."*). In this slice, LY sales are entered by the operator directly (RICS does the same thing implicitly — before close, the column is blank, and the operator can't use the % change method without LY values). Automatic LY population from `accounts-receivable.MonthClosedEvent` is deferred until that event exists.
- **Per-OtbPlan strategy override**, **OtbPlan parent entity**, **seasonal versioning**. These are modernizations from [`docs/modules/otb-planning.md`](../../modules/otb-planning.md) Modernization decisions §2–3 that do not correspond to anything in the manual. Deferred to a Phase 2 slice with its own justification.
- **PO-submit OTB validation**, **CEO exception workflow**, **policy audit on submit**. These are extensions that do not appear anywhere in Ch. 3 / Ch. 6 / Ch. 11 / Ch. 17. Out of scope for Phase 1 parity.
- **Multi-currency**, **fiscal year ≠ calendar year handling beyond a `fiscalYear` integer**. Fiscal calendar is the full `Period` primitive owned by `accounts-receivable` and is not built.

## Data model

### New table: `otb_plan_rows`

One row per `(store_id, category_id, fiscal_year)`. Wide-format (12 monthly columns) to match the RICS file layout at p. 158.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4 |
| `store_id` | TEXT NOT NULL | From `store-ops` (validated via its contract; FK not enforced at DB level matching codebase convention) |
| `category_id` | TEXT NOT NULL | From `products` |
| `fiscal_year` | INTEGER NOT NULL | e.g., 2026 |
| `pct_change_ly_to_cy` | REAL NULL | Percent, e.g. `7.5` for +7.5%. Negative allowed (p. 159 *"Enter a decrease in planned sales as a negative percent."*) |
| `pct_change_cy_to_ny` | REAL NULL | Same semantics |
| `planned_turnover_1h` | REAL NULL | Planned turns for first 6 months |
| `planned_turnover_2h` | REAL NULL | Planned turns for last 6 months |
| `planned_gp_pct` | REAL NULL | Planned gross profit % |
| `ly_sales_m01` .. `ly_sales_m12` | REAL NULL × 12 | Last-year actuals, operator-entered in this slice |
| `planned_sales_m01` .. `planned_sales_m12` | REAL NULL × 12 | Output of `[ReCalculate]` or direct entry |
| `markdown_pct_m01` .. `markdown_pct_m12` | REAL NULL × 12 | Populated only when company method = FIXED_MONTHLY_MIX; left null under CHANGE_OVER_LAST_YEAR |
| `created_by` | TEXT NOT NULL | Defaults to `'system'` in seed/tests |
| `created_at`, `updated_at` | TEXT NOT NULL | ISO-8601 |

**Constraints**
- `UNIQUE(store_id, category_id, fiscal_year)` — one plan row per cell (RICS behavior)
- `CHECK(fiscal_year BETWEEN 2020 AND 2099)` — mirrors the existing `otb_budgets` range check
- `CHECK(planned_gp_pct IS NULL OR (planned_gp_pct >= -100 AND planned_gp_pct <= 100))`
- No CHECK on % change fields (unbounded — a planner can enter `-100%` to zero out, or arbitrarily large positive values for a brand new store)

**Indexes**
- `idx_otb_plan_rows_store_year (store_id, fiscal_year)` — list by store for a given year
- `idx_otb_plan_rows_category_year (category_id, fiscal_year)` — cross-store views by category

### New table: `otb_plan_row_audit`

Append-only per-field edit log. Same shape as `otb_budget_audit`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `otb_plan_row_id` | TEXT NOT NULL | FK to `otb_plan_rows(id)` |
| `field_changed` | TEXT NOT NULL | e.g., `pct_change_ly_to_cy`, `planned_sales_m03` |
| `old_value` | TEXT NULL | Stringified (numbers rendered as plain decimal; nulls as empty string) |
| `new_value` | TEXT NULL | |
| `changed_by` | TEXT NOT NULL | |
| `created_at` | TEXT NOT NULL | |

**Index** `idx_otb_plan_row_audit_row (otb_plan_row_id, created_at DESC)`.

### New table: `company_settings`

Minimal key-value settings store. The `otbEntryMethod` toggle lives here, mirroring Company Setup (p. 214). Introduced now because no equivalent exists in the codebase; kept generic so future company-wide toggles (default store, season boundaries, etc.) can reuse it.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | e.g., `otb.entry_method` |
| `value` | TEXT NOT NULL | JSON-encoded value |
| `updated_by` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |

Seeded on migration with `otb.entry_method` = `"CHANGE_OVER_LAST_YEAR"` (RICS default per the manual's *"the most commonly used"* wording).

## Service layer

### New: `apps/api/src/services/otbPlanRowService.ts`

```ts
export type OtbEntryMethod = 'CHANGE_OVER_LAST_YEAR' | 'FIXED_MONTHLY_MIX';

export interface OtbPlanRow {
  id: string;
  storeId: string;
  categoryId: string;
  fiscalYear: number;
  pctChangeLyToCy: number | null;
  pctChangeCyToNy: number | null;
  plannedTurnover1h: number | null;
  plannedTurnover2h: number | null;
  plannedGpPct: number | null;
  lySales: (number | null)[]; // length 12, indexed 0 = January of fiscal year
  plannedSales: (number | null)[]; // length 12
  markdownPct: (number | null)[]; // length 12
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type OtbPlanRowError =
  | { code: 'NOT_FOUND' }
  | { code: 'DUPLICATE_KEY'; storeId: string; categoryId: string; fiscalYear: number }
  | { code: 'INVALID_MONTHLY_ARRAY_LENGTH'; field: string; expected: 12; actual: number }
  | { code: 'INVALID_GP_PCT'; value: number };

export function createOtbPlanRow(input: CreateInput, changedBy: string): OtbPlanRow | OtbPlanRowError;
export function getOtbPlanRow(id: string): OtbPlanRow | { code: 'NOT_FOUND' };
export function listOtbPlanRows(filters: { storeId?: string; categoryId?: string; fiscalYear?: number; limit?: number; offset?: number }): { items: OtbPlanRow[]; total: number };
export function updateOtbPlanRow(id: string, patch: Partial<CreateInput>, changedBy: string): OtbPlanRow | OtbPlanRowError;
export function deleteOtbPlanRow(id: string, changedBy: string): { ok: true } | { code: 'NOT_FOUND' };

// [ReCalculate] — p. 159
export function recalculatePlannedSales(id: string, changedBy: string): OtbPlanRow | OtbPlanRowError;
//   For each month m in 0..11:
//     if lySales[m] != null && pctChangeLyToCy != null:
//       plannedSales[m] = round2(lySales[m] * (1 + pctChangeLyToCy / 100))
//     else:
//       plannedSales[m] = null (unchanged)
//   Writes one audit row per changed cell.

// [Copy] — p. 158, copy current row's settings into a new (storeId, categoryId) row when target has no row
export function copyOtbPlanRow(sourceId: string, targetStoreId: string, targetCategoryId: string, changedBy: string): OtbPlanRow | OtbPlanRowError;
//   Creates a new row with the source's % changes, turnover, GP%, markdown %s; copies lySales and plannedSales as well.
//   Returns DUPLICATE_KEY if the target (storeId, categoryId, fiscalYear) already exists.
```

**Implementation notes**
- Audit writes: wrap every column-level diff in the same pattern as `otbBudgetService.updateOtbBudget` — one `otb_plan_row_audit` row per changed field. Monthly arrays produce up to 12 audit rows each.
- Validation: array inputs must be length 12; missing keys for monthly cells are treated as `null` (not-yet-entered), not zero.
- All mutating operations run in a single SQLite transaction covering the row write + audit writes.

### New: `apps/api/src/services/companySettingsService.ts`

Thin wrapper around `company_settings`:

```ts
export function getCompanySetting<T>(key: string, defaultValue: T): T;
export function setCompanySetting<T>(key: string, value: T, changedBy: string): void;
export function getOtbEntryMethod(): OtbEntryMethod;              // sugar for otb.entry_method
export function setOtbEntryMethod(value: OtbEntryMethod, changedBy: string): void;
```

Serialisation is JSON; `getCompanySetting` returns the default when the key is absent.

## Routes

### New: `apps/api/src/routes/otbPlanRowRoutes.ts`

Registered at `/api/otb/plan-rows` in `apps/api/src/app.ts`. zod validation throughout (matches sibling OTB routes).

| Method | Path | Body / Query | Response |
|---|---|---|---|
| POST | `/api/otb/plan-rows` | Full row payload | 201 `OtbPlanRow` / 409 `DUPLICATE_KEY` / 400 |
| GET | `/api/otb/plan-rows` | `storeId?`, `categoryId?`, `fiscalYear?`, `limit?`, `offset?` | 200 `{ items, total }` |
| GET | `/api/otb/plan-rows/:id` | — | 200 `OtbPlanRow` / 404 |
| PATCH | `/api/otb/plan-rows/:id` | Partial row payload + `changedBy` | 200 `OtbPlanRow` / 404 / 400 |
| DELETE | `/api/otb/plan-rows/:id` | `changedBy` in body | 204 / 404 |
| POST | `/api/otb/plan-rows/:id/recalculate` | `changedBy` | 200 `OtbPlanRow` / 404 |
| POST | `/api/otb/plan-rows/:id/copy` | `{ targetStoreId, targetCategoryId, changedBy }` | 201 `OtbPlanRow` / 409 `DUPLICATE_KEY` |
| GET | `/api/otb/plan-rows/:id/audit` | `limit?`, `offset?` | 200 `{ items: AuditRow[], total }` |

### New: `apps/api/src/routes/companySettingsRoutes.ts`

Registered at `/api/company-settings`. This slice ships only the OTB-related endpoints; others can follow as needed.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/company-settings/otb-entry-method` | — | 200 `{ value: OtbEntryMethod }` |
| PUT | `/api/company-settings/otb-entry-method` | `{ value, changedBy }` | 200 `{ value }` / 400 invalid value |

## Web UI

### New page: `apps/web/src/pages/otb/OtbPlanEntryPage.tsx`

Route: `/otb/plan`. Entry point for the buyer. Matches the structural elements of the RICS entry screen (p. 158) adapted for a browser.

**Layout**
- **Header bar**: store selector, fiscal-year selector, "New row" button, "Change method…" button (shows current company `otbEntryMethod`, links to Company Setup)
- **Left rail — row list**: table of `(categoryId, categoryName, plannedSalesTotal, lastUpdated)` filtered by the header bar's store + year. Clicking a row loads it into the right panel.
- **Right panel — row editor** (only shown when a row is selected or a new row is being created):
  - Top section: Store (read-only, from header), Category (category picker for new rows; read-only for existing), `% change LY→CY`, `% change CY→NY`, `Planned turnover 1H`, `Planned turnover 2H`, `Planned GP %`
  - Monthly grid: 12 columns (Jan–Dec of fiscal year — TODO: align to fiscal-year-start once `accounts-receivable` ships Period entity), 3 rows:
    - **LY Sales $** — editable; shows *"(will populate at year-end close)"* placeholder text when empty, matching p. 158 footnote
    - **Planned Sales $** — editable, derived by `[ReCalculate]`
    - **Markdown %** — disabled with tooltip *"Available when company OTB method = Fixed Monthly Mix"* (since this slice is CHANGE_OVER_LAST_YEAR only)
  - Action buttons (matching p. 158): `[Save]`, `[Delete]`, `[Copy…]` (opens modal → pick target store + category), `[ReCalculate]`, `[Audit history]`. Disabled-with-tooltip buttons for deferred actions: `[Copy Sales…]`, `[Store Totals]`, `[Apply]`, `[Category Totals]`.

**State**: TanStack Query for all reads + mutations. Optimistic update on PATCH; roll back + Ant Design `message.error` on server rejection.

**Styling**: Ant Design `Table`, `Form`, `InputNumber`, `Modal`, `Tooltip` — matches sibling OTB pages.

**No routing added for `[Copy Sales]`, `[Store Totals]`, `[Apply]`** — buttons are visible-but-disabled so the entry screen looks complete to the operator and so follow-up slices have obvious wiring points.

## Cross-module contract dependencies

| Consumer of → provider | Contract call | Status in this slice |
|---|---|---|
| `otb-planning` → `products` | `getCategory(categoryId)`, `listCategories({storeId?, departmentId?})` | Neither contract file exists today (only `purchasingContract.ts` is in [`apps/api/src/contracts/`](../../../apps/api/src/contracts/)). Add `productsContract.ts` as a thin passthrough to the existing products service. Passthrough only; do not refactor. |
| `otb-planning` → `store-ops` | `listStores()`, `getStore(storeId)` | Add `storeContract.ts`, same passthrough pattern. |
| `otb-planning` → `sales-reporting` | `getCategorySalesByPeriod()` | **Not used in this slice.** LY sales are operator-entered for now. |
| `otb-planning` → `accounts-receivable` | `getActivePeriod`, `MonthClosedEvent` | **Not used in this slice.** Fiscal year is an integer; monthly indexing is Jan–Dec. |

Per the module spec and [`apps/api/src/contracts/purchasingContract.ts`](../../../apps/api/src/contracts/purchasingContract.ts) convention, new contracts go under `apps/api/src/contracts/` and cross-module reads route through them — never a direct SQL join or direct service import from another module.

## Testing

### `apps/api/tests/otbPlanRowService.test.ts` (unit)

- Create: happy path, DUPLICATE_KEY, INVALID_MONTHLY_ARRAY_LENGTH, INVALID_GP_PCT
- Get: hit, miss (NOT_FOUND)
- List: filter by store, by category, by fiscal year, pagination
- Update: single-field patch writes one audit row; multi-field patch writes N audit rows; patching with no-op diff writes zero audit rows
- Delete: audit rows are preserved (no cascade delete), row gone
- Recalculate: `lySales[m] * (1 + pct/100)` for each month; nulls skipped; negative % produces planned decrease; one audit row per changed monthly cell
- Copy: source → target happy path; DUPLICATE_KEY on collision; target row's audit log shows a single `COPIED_FROM` entry (in addition to per-field writes)

### `apps/api/tests/companySettingsService.test.ts` (unit)

- Default return when key absent
- Round-trip set → get
- `otb.entry_method` default is `CHANGE_OVER_LAST_YEAR` after migration

### `apps/api/tests/routes/otbPlanRowRoutes.test.ts` (HTTP)

- All CRUD endpoints return the shapes above
- `POST /api/otb/plan-rows/:id/recalculate` mutates monthly cells
- `POST /api/otb/plan-rows/:id/copy` creates a new row; second copy to same target → 409
- zod validation: malformed monthly arrays → 400 with field name

### `apps/api/tests/routes/companySettingsRoutes.test.ts` (HTTP)

- GET returns default when unset, persisted value when set
- PUT rejects unknown enum values with 400

### `apps/web/src/test/otbPlanEntryPage.test.tsx` (Vitest + React Testing Library)

- Renders row list after loading
- Selecting a row opens the editor with the right values
- Editing % change LY→CY and clicking `[ReCalculate]` updates monthly cells in-place
- `[Copy…]` modal: target store + category picker; submit creates a new row in the list
- Disabled-with-tooltip buttons for deferred actions carry the right tooltip text

## Files to add

```
apps/api/src/models/otbPlanRow.ts
apps/api/src/services/otbPlanRowService.ts
apps/api/src/services/companySettingsService.ts
apps/api/src/contracts/productsContract.ts
apps/api/src/contracts/storeContract.ts
apps/api/src/routes/otbPlanRowRoutes.ts
apps/api/src/routes/companySettingsRoutes.ts
apps/api/tests/otbPlanRowService.test.ts
apps/api/tests/companySettingsService.test.ts
apps/api/tests/routes/otbPlanRowRoutes.test.ts
apps/api/tests/routes/companySettingsRoutes.test.ts
apps/web/src/pages/otb/OtbPlanEntryPage.tsx
apps/web/src/api/otbPlanRows.ts                # TanStack Query hooks
apps/web/src/api/companySettings.ts
apps/web/src/test/otbPlanEntryPage.test.tsx
```

## Files to edit

- [`apps/api/src/db/database.ts`](../../../apps/api/src/db/database.ts) — new migration entry (append to the `MIGRATIONS` array) adding `otb_plan_rows`, `otb_plan_row_audit`, `company_settings` DDL + the `otb.entry_method` seed row. Keep existing `otb_budgets` untouched.
- [`apps/api/src/app.ts`](../../../apps/api/src/app.ts) — mount the two new route modules
- [`apps/web/src/App.tsx`](../../../apps/web/src/App.tsx) (or wherever admin routes live) — add `/otb/plan` route
- [`docs/modules/otb-planning.md`](../../modules/otb-planning.md) — mark the CHANGE_OVER_LAST_YEAR entry path + [ReCalculate] + [Copy] as implemented in the "RICS features covered" section with a link back to this spec

## Rollout

- Ships behind no feature flag. New surface; cannot regress existing users.
- Dev: run migrations, seed a few `otb_plan_rows` manually, click through the UI.
- Staging / prod: deploy; no data migration required on the legacy `otb_budgets` table.

## Open questions (do not block this slice)

1. **Fiscal year alignment.** This slice models monthly cells as Jan–Dec of `fiscal_year`. RICS's Company Setup has a year-ending-month toggle (p. 214) so a retailer with a Feb–Jan fiscal year would want month 1 = Feb. Deferred to the `accounts-receivable` Period primitive work. Document current behavior in the UI: *"Months are calendar Jan–Dec. Fiscal-calendar alignment coming with Close Month."*
2. **LY sales auto-populate from close.** The manual says LY sales populate *"at Close of the Month"* (p. 158). In this slice LY is operator-entered. When `accounts-receivable` ships `MonthClosedEvent`, add a subscriber that writes `ly_sales_m01..12` on the (storeId, categoryId, fiscalYear) plan rows for the freshly-closed year.
3. **Department grouping on the list view.** RICS p. 158 lets the buyer see rows grouped by Store, then implicitly by category (categories live under departments in the taxonomy). Should the left-rail row list show a Department collapsible grouping? Default for this slice: flat list ordered by category code; revisit after usability testing.
4. **Row "soft delete" vs. hard delete.** RICS has no concept of audit-retained soft delete; DELETE is terminal. This slice hard-deletes the `otb_plan_rows` row while preserving `otb_plan_row_audit` rows (FK remains a dangling reference, which is acceptable for audit use cases). Confirm before shipping.
