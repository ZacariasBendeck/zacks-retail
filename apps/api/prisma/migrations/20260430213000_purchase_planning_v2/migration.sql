-- Purchase Planning v2: saved chain + department seasonal plans.
-- This is an app-owned planning surface. It does not create purchase orders.

CREATE TABLE IF NOT EXISTS "app"."purchase_plan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_group_code" VARCHAR(64) NOT NULL,
  "label" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
  "season" VARCHAR(16) NOT NULL,
  "season_year" SMALLINT NOT NULL,
  "season_months" TEXT[] NOT NULL,
  "selected_departments" INTEGER[] NOT NULL,
  "forecast_method" VARCHAR(32) NOT NULL,
  "eoh_method" VARCHAR(16) NOT NULL,
  "cover_months" SMALLINT NOT NULL DEFAULT 3,
  "discount_normalization" BOOLEAN NOT NULL DEFAULT true,
  "history_from_year_month" VARCHAR(7) NOT NULL,
  "history_to_year_month" VARCHAR(7) NOT NULL,
  "created_by" TEXT NOT NULL DEFAULT 'system',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ(6),

  CONSTRAINT "purchase_plan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_plan_store_group_fkey"
    FOREIGN KEY ("store_group_code") REFERENCES "app"."store_group"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_plan_status_check"
    CHECK ("status" IN ('draft', 'archived')),
  CONSTRAINT "purchase_plan_season_check"
    CHECK ("season" IN ('spring', 'summer', 'fall', 'winter')),
  CONSTRAINT "purchase_plan_forecast_method_check"
    CHECK ("forecast_method" IN ('holtWinters', 'sameMonthLastYear', 'trailingAverage', 'yoyGrowth', 'blendedMultiYear')),
  CONSTRAINT "purchase_plan_eoh_method_check"
    CHECK ("eoh_method" IN ('forward', 'seasonal')),
  CONSTRAINT "purchase_plan_months_check"
    CHECK (COALESCE(array_length("season_months", 1), 0) = 3),
  CONSTRAINT "purchase_plan_departments_check"
    CHECK (COALESCE(array_length("selected_departments", 1), 0) >= 1),
  CONSTRAINT "purchase_plan_year_month_check"
    CHECK (
      "history_from_year_month" ~ '^[0-9]{4}-[0-9]{2}$'
      AND "history_to_year_month" ~ '^[0-9]{4}-[0-9]{2}$'
    )
);

CREATE INDEX IF NOT EXISTS "purchase_plan_chain_season_idx"
  ON "app"."purchase_plan"("store_group_code", "season", "season_year", "status");
CREATE INDEX IF NOT EXISTS "purchase_plan_status_updated_idx"
  ON "app"."purchase_plan"("status", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "app"."purchase_plan_row" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "department_key" VARCHAR(32) NOT NULL,
  "department_number" SMALLINT,
  "department_label" TEXT NOT NULL,
  "year_month" VARCHAR(7) NOT NULL,
  "baseline_boh" INTEGER NOT NULL,
  "baseline_proj_sales" INTEGER NOT NULL,
  "baseline_eoh_target" INTEGER NOT NULL,
  "baseline_buy" INTEGER NOT NULL,
  "baseline_eoh_actual" INTEGER NOT NULL,
  "current_boh" INTEGER NOT NULL,
  "current_proj_sales" INTEGER NOT NULL,
  "current_eoh_target" INTEGER NOT NULL,
  "current_buy" INTEGER NOT NULL,
  "current_eoh_actual" INTEGER NOT NULL,
  "on_hand" INTEGER NOT NULL DEFAULT 0,
  "current_on_order" INTEGER NOT NULL DEFAULT 0,
  "future_on_order" INTEGER NOT NULL DEFAULT 0,
  "native_open_po" INTEGER NOT NULL DEFAULT 0,
  "stock_position" INTEGER NOT NULL DEFAULT 0,
  "normalization_factor" NUMERIC(10,4),
  "raw_proj_sales" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "purchase_plan_row_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_plan_row_plan_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "app"."purchase_plan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchase_plan_row_year_month_check"
    CHECK ("year_month" ~ '^[0-9]{4}-[0-9]{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_plan_row_key"
  ON "app"."purchase_plan_row"("plan_id", "department_key", "year_month");
CREATE INDEX IF NOT EXISTS "purchase_plan_row_plan_department_idx"
  ON "app"."purchase_plan_row"("plan_id", "department_key");

CREATE TABLE IF NOT EXISTS "app"."purchase_plan_adjustment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "department_key" VARCHAR(32) NOT NULL,
  "kind" VARCHAR(24) NOT NULL,
  "value" NUMERIC(12,4) NOT NULL,
  "reason" TEXT NOT NULL,
  "applied_by" TEXT NOT NULL DEFAULT 'system',
  "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "before_rows_json" JSONB,
  "after_rows_json" JSONB,

  CONSTRAINT "purchase_plan_adjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_plan_adjustment_plan_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "app"."purchase_plan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchase_plan_adjustment_kind_check"
    CHECK ("kind" IN ('percent_lift', 'absolute_total')),
  CONSTRAINT "purchase_plan_adjustment_reason_check"
    CHECK (length(btrim("reason")) > 0)
);

CREATE INDEX IF NOT EXISTS "purchase_plan_adjustment_plan_department_idx"
  ON "app"."purchase_plan_adjustment"("plan_id", "department_key", "applied_at");

CREATE TABLE IF NOT EXISTS "app"."purchase_plan_audit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "actor" TEXT NOT NULL DEFAULT 'system',
  "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "before_json" JSONB,
  "after_json" JSONB,

  CONSTRAINT "purchase_plan_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_plan_audit_plan_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "app"."purchase_plan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "purchase_plan_audit_plan_at_idx"
  ON "app"."purchase_plan_audit"("plan_id", "at" DESC);
