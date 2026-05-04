-- Purchase Planning v3: chain seasonal plans with shared warehouse planning credit.
-- This is intentionally isolated from purchase_plan v2 tables.

CREATE TABLE IF NOT EXISTS "app"."purchase_plan_v3" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "label" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
  "store_group_codes" TEXT[] NOT NULL,
  "department_number" SMALLINT NOT NULL,
  "department_label" TEXT NOT NULL,
  "year" SMALLINT NOT NULL,
  "forecast_method" VARCHAR(32) NOT NULL,
  "eoh_method" VARCHAR(16) NOT NULL,
  "cover_months" SMALLINT NOT NULL DEFAULT 3,
  "discount_normalization" BOOLEAN NOT NULL DEFAULT true,
  "history_from_year_month" VARCHAR(7) NOT NULL,
  "history_to_year_month" VARCHAR(7) NOT NULL,
  "warehouse_store_numbers" INTEGER[] NOT NULL DEFAULT '{}',
  "created_by" TEXT NOT NULL DEFAULT 'system',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ(6),

  CONSTRAINT "purchase_plan_v3_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_plan_v3_status_check"
    CHECK ("status" IN ('draft', 'archived')),
  CONSTRAINT "purchase_plan_v3_forecast_method_check"
    CHECK ("forecast_method" IN ('holtWinters', 'sameMonthLastYear', 'trailingAverage', 'yoyGrowth', 'blendedMultiYear')),
  CONSTRAINT "purchase_plan_v3_eoh_method_check"
    CHECK ("eoh_method" IN ('forward', 'seasonal')),
  CONSTRAINT "purchase_plan_v3_year_month_check"
    CHECK (
      "history_from_year_month" ~ '^[0-9]{4}-[0-9]{2}$'
      AND "history_to_year_month" ~ '^[0-9]{4}-[0-9]{2}$'
    )
);

CREATE INDEX IF NOT EXISTS "purchase_plan_v3_department_year_idx"
  ON "app"."purchase_plan_v3"("department_number", "year", "status");
CREATE INDEX IF NOT EXISTS "purchase_plan_v3_status_updated_idx"
  ON "app"."purchase_plan_v3"("status", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "app"."purchase_plan_v3_row" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "store_group_code" VARCHAR(64) NOT NULL,
  "store_group_label" TEXT NOT NULL,
  "season" VARCHAR(16) NOT NULL,
  "season_year" SMALLINT NOT NULL,
  "season_months" TEXT[] NOT NULL,
  "projected_boh" INTEGER NOT NULL DEFAULT 0,
  "projected_sales" INTEGER NOT NULL DEFAULT 0,
  "eoh_target" INTEGER NOT NULL DEFAULT 0,
  "baseline_buy" INTEGER NOT NULL DEFAULT 0,
  "chain_on_hand" INTEGER NOT NULL DEFAULT 0,
  "current_on_order" INTEGER NOT NULL DEFAULT 0,
  "future_on_order" INTEGER NOT NULL DEFAULT 0,
  "native_open_po" INTEGER NOT NULL DEFAULT 0,
  "stock_position" INTEGER NOT NULL DEFAULT 0,
  "warehouse_eligible" INTEGER NOT NULL DEFAULT 0,
  "warehouse_planning_credit" INTEGER NOT NULL DEFAULT 0,
  "warehouse_unallocated" INTEGER NOT NULL DEFAULT 0,
  "total_available_for_plan" INTEGER NOT NULL DEFAULT 0,
  "recommended_buy" INTEGER NOT NULL DEFAULT 0,
  "projected_eoh" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "purchase_plan_v3_row_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_plan_v3_row_plan_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "app"."purchase_plan_v3"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchase_plan_v3_row_season_check"
    CHECK ("season" IN ('spring', 'summer', 'fall', 'winter')),
  CONSTRAINT "purchase_plan_v3_row_months_check"
    CHECK (COALESCE(array_length("season_months", 1), 0) = 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_plan_v3_row_key"
  ON "app"."purchase_plan_v3_row"("plan_id", "store_group_code", "season");
CREATE INDEX IF NOT EXISTS "purchase_plan_v3_row_plan_chain_idx"
  ON "app"."purchase_plan_v3_row"("plan_id", "store_group_code");

CREATE TABLE IF NOT EXISTS "app"."purchase_plan_v3_adjustment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "store_group_code" VARCHAR(64) NOT NULL,
  "season" VARCHAR(16) NOT NULL,
  "kind" VARCHAR(24) NOT NULL,
  "value" NUMERIC(12,4) NOT NULL,
  "reason" TEXT NOT NULL,
  "applied_by" TEXT NOT NULL DEFAULT 'system',
  "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "before_rows_json" JSONB,
  "after_rows_json" JSONB,

  CONSTRAINT "purchase_plan_v3_adjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_plan_v3_adjustment_plan_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "app"."purchase_plan_v3"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchase_plan_v3_adjustment_kind_check"
    CHECK ("kind" IN ('percent_lift', 'absolute_total')),
  CONSTRAINT "purchase_plan_v3_adjustment_reason_check"
    CHECK (length(btrim("reason")) > 0)
);

CREATE INDEX IF NOT EXISTS "purchase_plan_v3_adjustment_plan_idx"
  ON "app"."purchase_plan_v3_adjustment"("plan_id", "store_group_code", "season", "applied_at");

CREATE TABLE IF NOT EXISTS "app"."purchase_plan_v3_audit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "actor" TEXT NOT NULL DEFAULT 'system',
  "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "before_json" JSONB,
  "after_json" JSONB,

  CONSTRAINT "purchase_plan_v3_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_plan_v3_audit_plan_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "app"."purchase_plan_v3"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "purchase_plan_v3_audit_plan_at_idx"
  ON "app"."purchase_plan_v3_audit"("plan_id", "at" DESC);
