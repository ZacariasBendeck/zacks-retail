-- Buyer Checklist sales projection step.

ALTER TABLE "app"."buyer_purchase_category_card"
  ADD COLUMN IF NOT EXISTS "sales_projection_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "sales_projection_units" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sales_projection_sales" NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sales_projection_updated_by" TEXT,
  ADD COLUMN IF NOT EXISTS "sales_projection_updated_at" TIMESTAMPTZ(6);
