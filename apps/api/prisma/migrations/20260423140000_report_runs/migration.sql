-- Report Runs (Snapshots) — explicitly captured frozen results of a report run.
-- Spec: docs/dev/plans/2026-04-22-report-templates-and-runs.md Phase 1.1.
--
-- A run stores the full response payload (result_json) so the saved view
-- re-renders exactly what was on screen at capture. Envelope columns
-- (row_count, result_size_bytes, report_type_version) are set server-side
-- on insert so list pages do not deserialize the blob and clients cannot
-- lie about sizes.
-- source_template_id is nullable; a snapshot from an ad-hoc run has none.
-- ON DELETE SET NULL on the template FK: deleting a template does not
-- cascade-wipe snapshots that referenced it — they remain, unrooted.

-- CreateTable: report_runs
CREATE TABLE "app"."report_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "source_template_id" TEXT,
    "title" TEXT,
    "params_json" JSONB NOT NULL,
    "result_json" JSONB NOT NULL,
    "row_count" INTEGER NOT NULL,
    "result_size_bytes" INTEGER NOT NULL,
    "report_type_version" INTEGER NOT NULL DEFAULT 1,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_runs_pkey" PRIMARY KEY ("id")
);

-- "My snapshots", newest-first. Covers the scope=mine list query.
CREATE INDEX "report_runs_user_id_created_at_idx"
    ON "app"."report_runs"("user_id", "created_at" DESC);

-- "All snapshots" shared scope, filtered by report type, newest-first.
CREATE INDEX "report_runs_visibility_report_type_created_at_idx"
    ON "app"."report_runs"("visibility", "report_type", "created_at" DESC);

-- Lets a template's detail page show the snapshots captured from it.
CREATE INDEX "report_runs_source_template_id_idx"
    ON "app"."report_runs"("source_template_id");

ALTER TABLE "app"."report_runs"
    ADD CONSTRAINT "report_runs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."report_runs"
    ADD CONSTRAINT "report_runs_source_template_id_fkey"
    FOREIGN KEY ("source_template_id") REFERENCES "app"."report_templates"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
