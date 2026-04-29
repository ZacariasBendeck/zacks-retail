-- Matching-set purchasing plan.
--
-- Keeps set planning in app-owned Postgres tables. Jackets, pants, vests, and
-- other components remain separate SKUs; the set provides planning ratios,
-- size curves, OTB preview context, and PO worksheet provenance.

ALTER TABLE "app"."matching_set"
  ADD COLUMN IF NOT EXISTS "material_code" TEXT,
  ADD COLUMN IF NOT EXISTS "material_label" TEXT,
  ADD COLUMN IF NOT EXISTS "chain_id" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "sell_mode" VARCHAR(24) NOT NULL DEFAULT 'separates',
  ADD COLUMN IF NOT EXISTS "planning_active" BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matching_set_chain_fkey'
      AND conrelid = 'app.matching_set'::regclass
  ) THEN
    ALTER TABLE "app"."matching_set"
      ADD CONSTRAINT "matching_set_chain_fkey"
      FOREIGN KEY ("chain_id") REFERENCES "app"."store_group"("code")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matching_set_sell_mode_check'
      AND conrelid = 'app.matching_set'::regclass
  ) THEN
    ALTER TABLE "app"."matching_set"
      ADD CONSTRAINT "matching_set_sell_mode_check"
      CHECK ("sell_mode" IN ('separates', 'bundle_required'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "matching_set_chain_idx"
  ON "app"."matching_set"("chain_id");

CREATE TABLE IF NOT EXISTS "app"."matching_set_member_size_curve" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "set_id" UUID NOT NULL,
  "sku_id" UUID NOT NULL,
  "chain_id" VARCHAR(64),
  "store_id" SMALLINT,
  "size_label" TEXT NOT NULL,
  "column_label" TEXT NOT NULL DEFAULT '',
  "row_label" TEXT NOT NULL DEFAULT '',
  "ratio_pct" NUMERIC(7,4) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL DEFAULT 'system',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT NOT NULL DEFAULT 'system',

  CONSTRAINT "matching_set_member_size_curve_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "matching_set_member_size_curve_member_fkey"
    FOREIGN KEY ("set_id", "sku_id") REFERENCES "app"."matching_set_member"("set_id", "sku_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "matching_set_member_size_curve_chain_fkey"
    FOREIGN KEY ("chain_id") REFERENCES "app"."store_group"("code")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "matching_set_member_size_curve_ratio_check"
    CHECK ("ratio_pct" >= 0 AND "ratio_pct" <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "matching_set_member_size_curve_key"
  ON "app"."matching_set_member_size_curve"(
    "set_id",
    "sku_id",
    COALESCE("chain_id", ''),
    COALESCE("store_id", 0),
    "size_label"
  );

CREATE INDEX IF NOT EXISTS "matching_set_member_size_curve_chain_idx"
  ON "app"."matching_set_member_size_curve"("chain_id");

CREATE TABLE IF NOT EXISTS "app"."matching_set_buy_plan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "set_id" UUID NOT NULL,
  "chain_id" VARCHAR(64),
  "receipt_month" VARCHAR(7) NOT NULL,
  "horizon_weeks" SMALLINT NOT NULL DEFAULT 13,
  "target_cover_weeks" SMALLINT NOT NULL DEFAULT 8,
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "generated_po_id" UUID,
  "otb_status" VARCHAR(24),
  "otb_snapshot_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL DEFAULT 'system',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT NOT NULL DEFAULT 'system',

  CONSTRAINT "matching_set_buy_plan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "matching_set_buy_plan_set_fkey"
    FOREIGN KEY ("set_id") REFERENCES "app"."matching_set"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "matching_set_buy_plan_chain_fkey"
    FOREIGN KEY ("chain_id") REFERENCES "app"."store_group"("code")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "matching_set_buy_plan_po_fkey"
    FOREIGN KEY ("generated_po_id") REFERENCES "app"."purchase_order"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "matching_set_buy_plan_status_check"
    CHECK ("status" IN ('draft', 'po_created', 'cancelled')),
  CONSTRAINT "matching_set_buy_plan_receipt_month_check"
    CHECK ("receipt_month" ~ '^[0-9]{4}-[0-9]{2}$')
);

CREATE INDEX IF NOT EXISTS "matching_set_buy_plan_set_created_idx"
  ON "app"."matching_set_buy_plan"("set_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "matching_set_buy_plan_chain_month_idx"
  ON "app"."matching_set_buy_plan"("chain_id", "receipt_month");
CREATE INDEX IF NOT EXISTS "matching_set_buy_plan_po_idx"
  ON "app"."matching_set_buy_plan"("generated_po_id");

CREATE TABLE IF NOT EXISTS "app"."matching_set_buy_plan_line" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "set_id" UUID NOT NULL,
  "sku_id" UUID NOT NULL,
  "role_code" TEXT NOT NULL,
  "size_label" TEXT NOT NULL,
  "column_label" TEXT NOT NULL DEFAULT '',
  "row_label" TEXT NOT NULL DEFAULT '',
  "on_hand" INTEGER NOT NULL DEFAULT 0,
  "on_order" INTEGER NOT NULL DEFAULT 0,
  "projected_sales" INTEGER NOT NULL DEFAULT 0,
  "target_ending" INTEGER NOT NULL DEFAULT 0,
  "recommended_qty" INTEGER NOT NULL,
  "unit_cost" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "retail_price" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "category_number" INTEGER,
  "department_number" SMALLINT,
  "po_line_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "matching_set_buy_plan_line_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "matching_set_buy_plan_line_plan_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "app"."matching_set_buy_plan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "matching_set_buy_plan_line_member_fkey"
    FOREIGN KEY ("set_id", "sku_id") REFERENCES "app"."matching_set_member"("set_id", "sku_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "matching_set_buy_plan_line_sku_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "matching_set_buy_plan_line_po_line_fkey"
    FOREIGN KEY ("po_line_id") REFERENCES "app"."purchase_order_line"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "matching_set_buy_plan_line_qty_check"
    CHECK ("recommended_qty" >= 0)
);

CREATE INDEX IF NOT EXISTS "matching_set_buy_plan_line_plan_idx"
  ON "app"."matching_set_buy_plan_line"("plan_id");
CREATE INDEX IF NOT EXISTS "matching_set_buy_plan_line_sku_idx"
  ON "app"."matching_set_buy_plan_line"("sku_id");
CREATE INDEX IF NOT EXISTS "matching_set_buy_plan_line_po_line_idx"
  ON "app"."matching_set_buy_plan_line"("po_line_id");
CREATE INDEX IF NOT EXISTS "matching_set_buy_plan_line_taxonomy_idx"
  ON "app"."matching_set_buy_plan_line"("category_number", "department_number");

-- Default planning ratio for suit components requested by the operator:
-- jacket:pant:vest = 1:1.2:0.5. Only untouched defaults are updated.
UPDATE "app"."matching_set_member" m
SET "quantity_ratio" = CASE
  WHEN m."role_code" = 'pant' THEN 1.200
  WHEN m."role_code" = 'vest' THEN 0.500
  ELSE m."quantity_ratio"
END
FROM "app"."matching_set" s
WHERE s."id" = m."set_id"
  AND s."set_type_code" = 'suit'
  AND m."role_code" IN ('pant', 'vest')
  AND m."quantity_ratio" = 1.000;
