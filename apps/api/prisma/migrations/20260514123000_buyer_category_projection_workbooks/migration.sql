-- Category-specific enterprise sales projection workbooks for buyer checklist cards.

ALTER TABLE "app"."purchase_plan"
  ADD COLUMN IF NOT EXISTS "planning_dimension" VARCHAR(24) NOT NULL DEFAULT 'department',
  ADD COLUMN IF NOT EXISTS "selected_categories" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_plan_planning_dimension_check'
      AND conrelid = '"app"."purchase_plan"'::regclass
  ) THEN
    ALTER TABLE "app"."purchase_plan"
      ADD CONSTRAINT "purchase_plan_planning_dimension_check"
      CHECK ("planning_dimension" IN ('department', 'category'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "purchase_plan_dimension_scope_idx"
  ON "app"."purchase_plan"("planning_dimension", "planning_scope", "status", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "purchase_plan_selected_categories_idx"
  ON "app"."purchase_plan" USING GIN ("selected_categories");

ALTER TABLE "app"."buyer_purchase_category_card"
  ADD COLUMN IF NOT EXISTS "sales_projection_plan_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'buyer_purchase_category_card_sales_projection_plan_fkey'
      AND conrelid = '"app"."buyer_purchase_category_card"'::regclass
  ) THEN
    ALTER TABLE "app"."buyer_purchase_category_card"
      ADD CONSTRAINT "buyer_purchase_category_card_sales_projection_plan_fkey"
      FOREIGN KEY ("sales_projection_plan_id") REFERENCES "app"."purchase_plan"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "buyer_purchase_category_card_sales_projection_plan_idx"
  ON "app"."buyer_purchase_category_card"("sales_projection_plan_id");
