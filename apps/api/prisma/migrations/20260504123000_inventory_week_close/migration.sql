-- Inventory week close audit and duplicate-close guard.

CREATE TABLE "app"."inventory_week_close_run" (
  "id" UUID NOT NULL,
  "week_ending_date" DATE NOT NULL,
  "week_start_date" DATE NOT NULL,
  "snapshot_as_of" TIMESTAMPTZ(6) NOT NULL,
  "closed_by" VARCHAR(120) NOT NULL,
  "dry_run" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(24) NOT NULL,
  "validation_status" VARCHAR(24),
  "snapshots_scanned" INTEGER NOT NULL DEFAULT 0,
  "trend_rows_written" INTEGER NOT NULL DEFAULT 0,
  "snapshots_updated" INTEGER NOT NULL DEFAULT 0,
  "unpromoted_pos_tickets" INTEGER NOT NULL DEFAULT 0,
  "week_sales_mismatch_count" INTEGER NOT NULL DEFAULT 0,
  "week_sales_mismatch_qty_abs" INTEGER NOT NULL DEFAULT 0,
  "total_week_qty_sales" INTEGER NOT NULL DEFAULT 0,
  "total_week_net_sales" NUMERIC(14, 2),
  "total_week_profit" NUMERIC(14, 2),
  "error_text" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),

  CONSTRAINT "inventory_week_close_run_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_week_close_run_window_check"
    CHECK ("week_start_date" <= "week_ending_date"),
  CONSTRAINT "inventory_week_close_run_status_check"
    CHECK ("status" IN ('RUNNING', 'DRY_RUN', 'SUCCEEDED', 'FAILED')),
  CONSTRAINT "inventory_week_close_run_validation_status_check"
    CHECK ("validation_status" IS NULL OR "validation_status" IN ('PASSED', 'FAILED'))
);

CREATE TABLE "app"."inventory_closed_week" (
  "week_ending_date" DATE NOT NULL,
  "run_id" UUID NOT NULL,
  "week_start_date" DATE NOT NULL,
  "snapshot_as_of" TIMESTAMPTZ(6) NOT NULL,
  "closed_by" VARCHAR(120) NOT NULL,
  "closed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snapshots_closed" INTEGER NOT NULL DEFAULT 0,
  "trend_rows_closed" INTEGER NOT NULL DEFAULT 0,
  "total_week_qty_sales" INTEGER NOT NULL DEFAULT 0,
  "total_week_net_sales" NUMERIC(14, 2),
  "total_week_profit" NUMERIC(14, 2),

  CONSTRAINT "inventory_closed_week_pkey" PRIMARY KEY ("week_ending_date"),
  CONSTRAINT "inventory_closed_week_run_id_key" UNIQUE ("run_id"),
  CONSTRAINT "inventory_closed_week_window_check"
    CHECK ("week_start_date" <= "week_ending_date"),
  CONSTRAINT "inventory_closed_week_run_id_fkey"
    FOREIGN KEY ("run_id")
    REFERENCES "app"."inventory_week_close_run"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE INDEX "inventory_week_close_run_week_started_idx"
  ON "app"."inventory_week_close_run"("week_ending_date", "started_at");

CREATE INDEX "inventory_week_close_run_status_started_idx"
  ON "app"."inventory_week_close_run"("status", "started_at");
