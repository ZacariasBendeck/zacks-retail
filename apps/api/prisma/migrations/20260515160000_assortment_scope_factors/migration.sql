-- Assortment release planning: department/category scope and per-plan factors.

ALTER TABLE "app"."assortment_plan"
  ADD COLUMN IF NOT EXISTS "planning_scope_type" TEXT NOT NULL DEFAULT 'CATEGORY',
  ADD COLUMN IF NOT EXISTS "planning_scope_number" SMALLINT,
  ADD COLUMN IF NOT EXISTS "scope_label" TEXT,
  ADD COLUMN IF NOT EXISTS "category_numbers" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN IF NOT EXISTS "planning_factors" JSONB NOT NULL DEFAULT '{}'::JSONB;

UPDATE "app"."assortment_plan"
SET
  "planning_scope_number" = COALESCE("planning_scope_number", "category_number"),
  "scope_label" = COALESCE("scope_label", "category_label"),
  "category_numbers" = CASE
    WHEN cardinality("category_numbers") = 0 THEN ARRAY["category_number"]::INTEGER[]
    ELSE "category_numbers"
  END,
  "planning_factors" = CASE
    WHEN "planning_factors" = '{}'::JSONB AND "metadata" ? 'planningFactors'
      THEN "metadata" -> 'planningFactors'
    ELSE "planning_factors"
  END;

ALTER TABLE "app"."assortment_plan"
  ALTER COLUMN "planning_scope_number" SET NOT NULL,
  ALTER COLUMN "scope_label" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "assortment_plan_scope_updated_idx"
  ON "app"."assortment_plan"("planning_scope_type", "planning_scope_number", "updated_at" DESC);
