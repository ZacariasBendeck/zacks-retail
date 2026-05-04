-- Purchase Planning v2: enterprise-wide saved plans.
-- Enterprise plans roll up all selling stores, so they are not owned by one store group.

ALTER TABLE "app"."purchase_plan"
  ADD COLUMN IF NOT EXISTS "planning_scope" VARCHAR(24) NOT NULL DEFAULT 'store_group',
  ADD COLUMN IF NOT EXISTS "scope_label" TEXT;

ALTER TABLE "app"."purchase_plan"
  DROP CONSTRAINT IF EXISTS "purchase_plan_store_group_fkey";

ALTER TABLE "app"."purchase_plan"
  ALTER COLUMN "store_group_code" DROP NOT NULL;

ALTER TABLE "app"."purchase_plan"
  ADD CONSTRAINT "purchase_plan_store_group_fkey"
  FOREIGN KEY ("store_group_code") REFERENCES "app"."store_group"("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_plan_scope_check'
      AND conrelid = 'app.purchase_plan'::regclass
  ) THEN
    ALTER TABLE "app"."purchase_plan"
      ADD CONSTRAINT "purchase_plan_scope_check"
      CHECK ("planning_scope" IN ('store_group', 'enterprise'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "purchase_plan_scope_season_idx"
  ON "app"."purchase_plan"("planning_scope", "season", "season_year", "status");
