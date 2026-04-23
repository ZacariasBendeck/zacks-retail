# Report Templates + Snapshots — Implementation Plan

**Status:** Phase 1 shipped 2026-04-22. **Phase 1.1 shipped 2026-04-23.** Phase 1.2 deferred. The post-ship delta section at the bottom records where the landed implementation diverged from the pre-ship plan.

**Goal:** Add two complementary Reports surfaces.

1. **Report Templates** — a named, reusable query a user saves on a report page and replays later (same report, same filters, **fresh data**). Listed at `/reports/templates`.
2. **Report Snapshots** — an explicit **Save snapshot** action after a successful run captures the result (params + full JSON payload + envelope metadata). Listed at `/reports/runs` with My / All tabs. Clicking a snapshot opens an immutable, form-less view of exactly what was on screen when it was saved.

**Key design decision:** snapshots are **not** auto-saved on every Run. Save-snapshot is a button the user clicks after reviewing the result. Rationale: users often run reports exploratorily; auto-save would pollute history, force clients into surprise writes, and create retention pressure on day one.

**Architecture:** Two tables in the `app` schema (`app.report_templates`, `app.report_runs`), both FK-ed to `public.User.id` and carrying a `visibility` column (`'private' | 'shared'`). New Express routes under `/api/v1/reports/templates` and `/api/v1/reports/runs`, guarded by `requireAuth`. Snapshots store the API response verbatim as `result_json` (jsonb) so the existing React components can re-render them read-only. A metadata envelope (`row_count`, `result_size_bytes`, `report_type_version`) is computed server-side at insert so list pages don't deserialize the blob. A known-`reportType` registry lives at `services/reports/reportTypes.ts` and is the single source of truth both routes validate against.

**Scope v1:** The 7 sales-reporting pages under `/reports/sales/*` and `/reports/others/*`:
SalesAnalysis, BestSellers, StockStatus, SalesByDay, SalesByTime, SalespersonSummary, SalesHistoryByMonth.

Inventory-side pages (OnHand, Aging, Sell-Through, etc.) wire in later with a one-line change per page — no schema changes.

**Phased delivery:**
- **Phase 1** — Templates only. Ships the save/list/replay/delete loop end-to-end.
- **Phase 1.1** — Explicit Save-snapshot button + `/reports/runs` list + frozen view. Renderer extraction proves on 2 reports (Sales Analysis + Best Sellers); the other 5 save snapshots but open to a "view in builder" fallback until their renderers land.
- **Phase 1.2** (deferred) — optional auto-save toggle, retention/cleanup admin, CSV/XLSX export from a frozen snapshot, remaining 5 renderers, batch template runner, per-user ACL sharing.

**UI copy:** DB value `'shared'` is labeled **"Visible to all signed-in users"** at every visible location. DB value stays `'shared'` for simplicity.

**Tech stack:** Node 20 + TypeScript + Express + Prisma + Jest for API; React 18 + Vite + Ant Design + TanStack Query + Vitest for web. Reuses existing `validate(schema)` / `validateQuery(schema)` middleware at `apps/api/src/middleware/validation.ts` and `requireAuth` / `requirePermission` at `apps/api/src/middleware/authMiddleware.ts`.

---

## Data model

### Phase 1 — `app.report_templates`

```prisma
model ReportTemplate {
  id         String    @id @default(uuid())
  ownerId    String    @map("owner_id")
  owner      User      @relation("OwnedReportTemplates", fields: [ownerId], references: [id])
  reportType String    @map("report_type")
  title      String
  paramsJson Json      @map("params_json")
  visibility String    @default("private")   // 'private' | 'shared'
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt      @map("updated_at")
  lastUsedAt DateTime? @map("last_used_at")

  @@unique([ownerId, reportType, title])
  @@index([visibility, reportType])
  @@map("report_templates")
  @@schema("app")
}
```

### Phase 1.1 — `app.report_runs`

```prisma
model ReportRun {
  id                String   @id @default(uuid())
  userId            String   @map("user_id")
  user              User     @relation("ReportRuns", fields: [userId], references: [id])
  reportType        String   @map("report_type")
  sourceTemplateId  String?  @map("source_template_id")
  sourceTemplate    ReportTemplate? @relation(fields: [sourceTemplateId], references: [id], onDelete: SetNull)
  paramsJson        Json     @map("params_json")
  resultJson        Json     @map("result_json")
  rowCount          Int      @map("row_count")
  resultSizeBytes   Int      @map("result_size_bytes")
  reportTypeVersion Int      @default(1) @map("report_type_version")
  visibility        String   @default("private")
  createdAt         DateTime @default(now()) @map("created_at")

  @@index([userId, createdAt(sort: Desc)])
  @@index([visibility, reportType, createdAt(sort: Desc)])
  @@index([sourceTemplateId])
  @@map("report_runs")
  @@schema("app")
}
```

Envelope columns (`rowCount`, `resultSizeBytes`, `reportTypeVersion`) are computed server-side — the client POSTs only `{ reportType, paramsJson, resultJson, visibility?, sourceTemplateId? }`. Prevents clients from lying.

### Permission addition (Phase 1)

`apps/api/src/services/employees/permissions.ts`:

```ts
REPORTS_ADMIN: 'reports.admin',   // cross-user delete of templates/runs
```

Every authenticated user implicitly owns their own templates/snapshots — no permission needed for create/read-own/update-own/delete-own.

---

## API contract

All routes require `requireAuth`.

### Templates

```
GET    /api/v1/reports/templates           ?reportType=<known>&scope=mine|all
POST   /api/v1/reports/templates           body: { reportType, title, paramsJson, visibility? }
GET    /api/v1/reports/templates/:id
PATCH  /api/v1/reports/templates/:id       owner only
DELETE /api/v1/reports/templates/:id       owner OR REPORTS_ADMIN
POST   /api/v1/reports/templates/:id/touch bumps lastUsedAt
```

### Snapshots (Phase 1.1)

```
GET    /api/v1/reports/runs     ?reportType=<known>&scope=mine|all&limit=50&offset=0
                                list returns envelope only, NOT resultJson
POST   /api/v1/reports/runs     body: { reportType, paramsJson, resultJson, visibility?, sourceTemplateId? }
GET    /api/v1/reports/runs/:id  visibility-checked; returns full resultJson
DELETE /api/v1/reports/runs/:id  owner OR REPORTS_ADMIN
```

### Validation

Uses existing `validate(schema)` middleware. Schemas (new file `apps/api/src/routes/reports/schemas.ts`):

- `reportType` ∈ enum `REPORT_TYPES` from `apps/api/src/services/reports/reportTypes.ts`.
- `visibility` = `z.enum(['private','shared'])`.
- `paramsJson` is a non-array object, JSON size ≤ 64 KB.
- `resultJson` size ≤ 20 MB (Phase 1.1).
- `title` trimmed, 1–100 chars.

Per-report deep validation of `paramsJson` is **deferred**. Frontend TS types own the shape; on replay the page hydrates best-effort.

---

## Phase 1 tasks

1. **DB migration + Prisma model + permission.** Creates `app.report_templates`. Adds `ReportTemplate` model + `User.ownedReportTemplates` back-relation. Adds `REPORTS_ADMIN` to permissions. Creates `services/reports/reportTypes.ts` registry.
2. **Templates service + routes + tests.** `reportTemplatesService.ts` (create/list/get/update/delete/touch with visibility enforcement + admin delete). `reportTemplatesRoutes.ts` with zod-validated bodies. Jest tests cover owner/shared/private cases, unauthorized mutate, admin delete, unique-title conflict, size cap. Mount on `/api/v1/reports/templates`.
3. **Web API client + hooks.** `services/reportTemplatesApi.ts` + `hooks/useReportTemplates.ts`. TanStack Query keys: `['report-templates', scope, reportType]`.
4. **SaveAsTemplateButton + Sales Analysis wiring.** Button next to `RunReportControls` (disabled until first run). Modal: title + visibility radio (labeled "Visible to all signed-in users"). Page reads `?templateId=…` on mount → fetch → hydrate → auto-run → touch.
5. **Fan out to other 6 report pages.** Same 3-line change per page: render button, read `?templateId=…`, auto-run-and-touch. No renderer extraction.
6. **Templates list page + nav.** `/reports/templates` with **My / All** tabs. Columns: Report type · Title · Owner · Visibility · Created · Last used · Actions. Route added to `App.tsx`, nav entry in `AppLayout.tsx`.
7. **Phase 1 verification.** Tests green, typecheck clean, dev-server manual walk-through (save → list → click → hydrates + auto-runs; second-user visibility check).

## Phase 1.1 tasks

8. DB migration + `ReportRun` model + back-relations on `User` and `ReportTemplate`.
9. Runs service + routes + tests. Envelope columns computed server-side.
10. Web API client + hooks for runs.
11. Extract renderers for `SalesAnalysisPage` and `BestSellersPage` into `components/reports/renderers/render<X>.tsx`.
12. `SaveSnapshotButton` wired into all 7 report pages; auto-fills `sourceTemplateId` when the current run came from a `?templateId=…` replay.
13. `/reports/runs` list page + `/reports/runs/:id` frozen view page. Renderer dispatch: Sales Analysis + Best Sellers render fully; other 5 show fallback + "Open in builder" CTA.
14. Phase 1.1 verification walk-through.

## Phase 1.2 (deferred)

- Automatic run history toggle (opt-in user preference, default off).
- Retention + bulk delete admin endpoint + UI.
- CSV / XLSX export from a frozen run (uses existing `sendCsv` / `sendXlsx` helpers).
- Renderer extraction for the other 5 reports.
- Version-mismatch banner (add only when a schema actually drifts).
- Batch template runner.
- Per-user ACL sharing beyond private/shared.

---

## Critical files

**Phase 1 — create:**
- `apps/api/prisma/migrations/<ts>_report_templates/migration.sql`
- `apps/api/src/services/reports/reportTypes.ts`
- `apps/api/src/services/reports/reportTemplatesService.ts`
- `apps/api/src/routes/reports/reportTemplatesRoutes.ts`
- `apps/api/src/routes/reports/schemas.ts`
- `apps/api/tests/reportTemplatesService.test.ts`
- `apps/api/tests/reportTemplatesRoutes.test.ts`
- `apps/web/src/services/reportTemplatesApi.ts`
- `apps/web/src/hooks/useReportTemplates.ts`
- `apps/web/src/components/reports/SaveAsTemplateButton.tsx`
- `apps/web/src/pages/reports/templates/TemplatesListPage.tsx`

**Phase 1 — modify:**
- `apps/api/prisma/schema.prisma` — add `ReportTemplate` + `User.ownedReportTemplates`.
- `apps/api/src/services/employees/permissions.ts` — add `REPORTS_ADMIN`.
- `apps/api/src/app.ts` — mount templates router.
- `apps/web/src/App.tsx` — add `/reports/templates` route.
- `apps/web/src/components/AppLayout.tsx` — add nav entry.
- Each of the 7 files under `apps/web/src/pages/salesReporting/` with a `<RunReportControls />`.

**Phase 1.1 — create:**
- `apps/api/prisma/migrations/<ts>_report_runs/migration.sql`
- `apps/api/src/services/reports/reportRunsService.ts`
- `apps/api/src/routes/reports/reportRunsRoutes.ts`
- `apps/web/src/services/reportRunsApi.ts`, `apps/web/src/hooks/useReportRuns.ts`
- `apps/web/src/components/reports/SaveSnapshotButton.tsx`
- `apps/web/src/components/reports/renderers/renderSalesAnalysis.tsx`, `renderBestSellers.tsx`
- `apps/web/src/pages/reports/runs/RunsListPage.tsx`, `RunViewPage.tsx`

## Risks and accepted tradeoffs

- **Param-shape drift.** `paramsJson` is a bag of best-effort hints. On replay, missing/unknown fields fall back to page defaults. Per-report validator registry deferred until real breakage appears.
- **20 MB snapshot cap.** A very wide SKU_DETAIL run over 90+ days could exceed it; we reject with a clear error. Matching envelope's `result_size_bytes` later powers retention tooling.
- **"Visible to all signed-in users" is coarse.** Per-user / per-department ACLs come only if the single-org assumption breaks.
- **Exploratory runs disappear.** Intentional — the Phase 1.2 opt-in history toggle covers users who want them retrieved.
