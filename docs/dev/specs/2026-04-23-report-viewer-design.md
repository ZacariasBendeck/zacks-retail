# Dedicated Report Viewer — full-screen, grouped, zoned

**Date:** 2026-04-23
**Source:** `/index-knowledge` pass — follow-on to the report-chrome foundation
**Type:** Design decision

## Context

Even after the filter card auto-collapses post-Run, the per-page report layout is still framed by the app sidebar + top nav, leaving ~80% of the viewport for the table. Operators asked for a chromeless view tuned for *reading* the data — something closer in spirit to the legacy RICS printout, where the report occupied the full page and the eye could scan across banded column groups without framing.

## Decision

Introduce a `/report-viewer` route that renders outside `AppLayout`. It re-fetches the same data the source page would show, re-renders it with additional interactivity (grouping, column picker, three-zone theming), and stays reachable from the source page via an "Open in Report Viewer" button in the header's `actions` slot.

### Route placement

`App.tsx` defines `/report-viewer` as a sibling of the `AppLayout`-wrapped group, still wrapped in `RequireAuth`:

```tsx
<Route
  path="/report-viewer"
  element={
    <RequireAuth>
      <Suspense fallback={<RouteLoadingFallback />}>
        <ReportViewerPage />
      </Suspense>
    </RequireAuth>
  }
/>
<Route element={<RequireAuth><AppLayout /></RequireAuth>}>
  {/* everything else */}
</Route>
```

No sidebar, no top nav. The viewer provides its own sticky toolbar at the top. This pattern generalizes: any future full-screen view (kiosk, presentation, receipt preview) uses the same sibling-of-AppLayout placement.

### URL shape

Query-param driven, not session-state-driven:

```
/report-viewer?type=sales-analysis&dimension=CATEGORY&reportType=SKU_DETAIL&storeOption=COMBINE&startDate=2025-10-23&endDate=2026-04-22&priorYear=true&categoriesRaw=556-599
```

- Shareable URLs. An operator can bookmark a specific filtered report, or send a link.
- `type=sales-analysis` is the only supported type in v1. Unknown types render an Alert explaining what was requested.
- The source page builds the URL via a helper (`buildViewerUrl(q)`) that mirrors `SalesAnalysisArgs` → query params.

### Three-zone column theming

Every column in the viewer is classified into one of four zones. Zones drive a tinted header band and a lighter cell wash so the three sales/inventory groupings read at a glance:

| Zone | Header tint | Cell tint | Columns |
|---|---|---|---|
| `identity` | transparent | transparent | Key, Label, Store |
| `on-hand` | grey `rgba(140,140,140,0.14)` | `rgba(140,140,140,0.04)` | Inv (Cost), Turns, ROI |
| `current` | blue `rgba(22,119,255,0.10)` | `rgba(22,119,255,0.035)` | Qty, Net Sales, COGS, Gross Profit, GP % |
| `comparison` | amber `rgba(250,173,20,0.14)` | `rgba(250,173,20,0.045)` | Prior Yr Net, PY % Δ |

A small legend at the top of the table names each active zone. The comparison zone only appears when `priorYear=true`. Tints are inline constants (`ZONE_HEADER_BG` / `ZONE_CELL_BG`) rather than Ant theme tokens — the shading is fully controllable by this file without affecting the rest of the app.

### Client-side grouping + subtotals

The viewer accepts a `groupBy` toggle (e.g. "No grouping" / "Group by store") and builds a flat array of `{_type: 'data'}` / `{_type: 'subtotal'}` rows for Ant Table. Subtotals are computed per group over every column whose `ColumnDef.sumable === true`. A grand-total row at the bottom (Ant `Table.Summary`) sums over all data rows with blue accent + top border.

No new backend endpoint. No `groupBy` parameter sent to the API.

### Column picker with localStorage persistence

A gear-icon dropdown shows a checkbox per available column. Selection persists in `localStorage` keyed on the report type — currently `report-viewer:sales-analysis:columns`. Default is every column visible.

Failure modes are swallowed: if `localStorage` is disabled or over quota, the viewer still works but forgets preferences across reloads. This is intentional — never throw on a storage failure from within a render path.

### Exports

CSV / XLSX buttons are present in the toolbar but disabled in v1. Exports still go through the source page's URLs (`getSalesHistoryByMonthCsvUrl(...)` etc.). Wiring viewer-scoped exports is a follow-up — the viewer would need to forward its `groupBy` + visible-columns state to a new export endpoint, which is more work than the current format-in-Excel fallback.

## Scope / v1 limits

- `type=sales-analysis` only. Extending to other report types (`sales-history-by-month`, `best-sellers`, `stock-status`, etc.) is a follow-up: each adds a `type=...` branch with its own `ColumnDef[]` and zone classification.
- Only the Sales Analysis source page has an "Open in Report Viewer" button in v1. Adding the same button to the other eight source pages is a straightforward follow-up once the viewer pattern has been validated.
- Grouping options in v1 are "none" and "by store". Adding "by category" / "by department" / etc. is a one-liner per group key.
- No re-ordering of columns — just show / hide. Drag-to-reorder is a later pass if operators ask.

## Non-goals

- No backend changes. The viewer consumes the existing `/api/v1/reports/sales/sales-analysis` endpoint.
- No persistence of grouping / sort state — only column visibility persists. Group choice resets on reload (intentional: cheap to set, low cost of forgetting).
- No URL param for column visibility — that would inflate URLs unnecessarily for the rare case where operators share a viewer link with someone else. Current URL only encodes *what data to load*, not *how to view it*.

## Related

- [`2026-04-23-report-chrome-foundation-design.md`](./2026-04-23-report-chrome-foundation-design.md) — the foundation the viewer reuses
- [`../../modules/sales-reporting/decisions.md`](../../modules/sales-reporting/decisions.md) — module-scoped ADRs citing this spec
- Commit `9431916`
- Source: [`apps/web/src/pages/reports/ReportViewerPage.tsx`](../../../apps/web/src/pages/reports/ReportViewerPage.tsx)
