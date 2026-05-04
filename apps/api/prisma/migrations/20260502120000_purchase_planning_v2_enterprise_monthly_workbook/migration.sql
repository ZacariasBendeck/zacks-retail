-- Purchase Planning v2: enterprise monthly workbooks.
-- New saved workbooks keep 15 monthly rows while legacy 3-month plans remain readable.

ALTER TABLE "app"."purchase_plan"
  DROP CONSTRAINT IF EXISTS "purchase_plan_months_check";

ALTER TABLE "app"."purchase_plan"
  ADD CONSTRAINT "purchase_plan_months_check"
  CHECK (COALESCE(array_length("season_months", 1), 0) IN (3, 15));

CREATE INDEX IF NOT EXISTS "purchase_plan_enterprise_workbook_idx"
  ON "app"."purchase_plan"("planning_scope", "season", "season_year", "status")
  WHERE "planning_scope" = 'enterprise'
    AND COALESCE(array_length("season_months", 1), 0) = 15;
