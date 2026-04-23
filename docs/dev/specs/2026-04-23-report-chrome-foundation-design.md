# Shared report chrome foundation

**Date:** 2026-04-23
**Source:** `/index-knowledge` pass — rendering polish of every Sales Reporting page
**Type:** Design decision

## Context

Sales Reporting shipped nine live report pages and two hubs before having a shared presentation layer. Every page had re-implemented its own `fmtMoney`, `fmtPct1`, `fmtQty`; its own GP%-coloring thresholds in a Tag render function; its own "Amounts in Lempira (HNL)" footnote text; and its own ad-hoc `<Text strong>` summary rows. `apps/web/src/utils/` contained only `errors.ts`, so a new page author had no obvious shared home to import from and re-invented the primitives.

The trigger for centralization: multiple pages were drifting away from the project currency rule (one page used `precision={2}` on Ant `Statistic` cards, bypassing the shared `toLocaleString` formatter; another inlined `.toLocaleString('en-US', { maximumFractionDigits: 0 })` without naming the function, so a grep for `fmtMoney` missed it). Any central change to the rule — a locale flip, a separator style, a thousands separator character — required touching every report file and every inline site.

## Decision

Land a shared chrome layer that every report page imports. It lives in two places:

**Pure utilities** → `apps/web/src/utils/reportFormatters.ts`:

- `fmtMoney(v)` — 2 dp, thousands separator, no currency symbol
- `fmtMoneyInt(v)` — 0 dp variant (used by pivots where money reads as whole numbers)
- `fmtInt(v)` — integer qty, thousands separator
- `fmtQty(v)` — integer when whole, 2 dp otherwise
- `fmtPct1(v)` / `fmtPct2(v)` — percent with trailing `%`, 1 or 2 dp
- `fmtPctBare1(v)` — same precision, no trailing `%` (for "× turns" and similar suffixes)
- `fmtChangePct(v)` — signed (`+` / `−`) percent with `%`
- `fmtChangeMoney(v)` — signed money
- `DASH = '—'` — null / NaN render everywhere

Uses module-scoped `Intl.NumberFormat` instances (reused per call, not re-created). No `style: 'currency'` — the Lempira rule (`docs/CLAUDE.md` → "Currency") is enforced here and here only.

**React components** → `apps/web/src/components/reports/`:

- `ReportHeader` — breadcrumb + title + description + RICS citation + optional right-side meta + optional actions slot + "Amounts in Lempira (HNL)" footnote (can be suppressed via `showCurrencyNote={false}` on pages that don't carry monetary values).
- `FilterChips` — compact chip row for "you ran with these filters". Null / empty entries are skipped so callers can use `query.x && { label, value: x }`.
- `ReportEmptyState` — one look for `idle` / `no-results` / `missing-required` / `custom` states, each with a sensible default message + hint.
- `SummaryRow` — tinted subtotal + blue-accented grand-total cell helpers (`SummaryLabelCell`, `SummaryNumericCell`, `subtotalCellStyle`, `grandTotalCellStyle`).
- `gpBadge` — `GpBadge` / `ChangePctBadge` / `GpBadgeLegend`. **All GP% / change-% threshold logic lives in this file and nowhere else.** Constants: `GP_PCT_GOOD = 30`, `GP_PCT_OKAY = 10`.
- `ShareBar` — inline horizontal "share of top" bar for a metric column (rank pages, contribution pages).
- `CollapsibleFilterCard` — outer filter shell with open/closed states, parent owns the open flag.

**Stylesheet** → `apps/web/src/styles/reports.css`. Imported once in `main.tsx`. Owns `.report-zebra-row` (subtle alternating row tint) and `.report-viewer-subtotal` (grouped-subtotal row styling for the Report Viewer).

## Scope of application

The nine live report pages and two hubs in `apps/web/src/pages/salesReporting/` were re-skinned to use the foundation in commits `f5cd374` and `e4b6af5`. The components are module-agnostic by design — the next inventory or purchasing report page should import from `components/reports/` rather than re-inventing.

## Enforcement

Four guardrails kept consistency during the re-skin:

1. **Import, don't customize.** If a page needs a one-off variant, add a prop or a new helper — don't re-inline.
2. **Delete as you go.** Inline `fmtMoney` / `fmtQty` / duplicated summary-row styling / custom Tag logic gets deleted when a page is re-skinned, not left in place "just in case".
3. **Thresholds live in one file.** GP% / change-% color breakpoints are defined once in `gpBadge.tsx`. Pages reference them — they don't redefine.
4. **Resist decoration.** "Beautiful" here means *finished and readable*, not flashy. No extra colors, icons, cards, or bars that don't carry information.

## Non-goals

- No new report types, endpoints, or data sources. This was a presentation-only pass.
- No replacement of Ant Design or ECharts.
- The forward `DateRangeControl` refactor is out of scope for this spec — tracked separately by the operator's DateSpec rollout.

## Related

- [`../../modules/sales-reporting/decisions.md`](../../modules/sales-reporting/decisions.md) — module-scoped decisions that cite this spec
- Commits `f5cd374`, `e4b6af5`
- Follow-on: [`2026-04-23-report-viewer-design.md`](./2026-04-23-report-viewer-design.md)
