-- Report Templates — reusable saved queries for the Reports module.
-- Spec: docs/dev/plans/2026-04-22-report-templates-and-runs.md
--
-- A template captures (report_type + params) for later replay against fresh
-- data. Owner has full control; visibility='shared' exposes read-only to any
-- authenticated user. Runs/snapshots (frozen results) live in a separate
-- table added in Phase 1.1.

-- CreateTable: report_templates
CREATE TABLE "app"."report_templates" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "params_json" JSONB NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- Prevents a user from having two templates with the same title for the same
-- report type. Users can still have identically-titled templates across
-- different report types (e.g. "Q1 Review" under sales-analysis and
-- best-sellers).
CREATE UNIQUE INDEX "report_templates_owner_id_report_type_title_key"
    ON "app"."report_templates"("owner_id", "report_type", "title");

-- Supports the "All templates" scope: fetch everything with visibility='shared'
-- for a given report type, then union with the caller's own templates.
CREATE INDEX "report_templates_visibility_report_type_idx"
    ON "app"."report_templates"("visibility", "report_type");

ALTER TABLE "app"."report_templates"
    ADD CONSTRAINT "report_templates_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "public"."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
