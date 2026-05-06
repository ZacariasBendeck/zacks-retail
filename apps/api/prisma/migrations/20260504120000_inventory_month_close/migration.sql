-- Inventory month close audit and duplicate-close guard.

CREATE TABLE "app"."inventory_month_close_run" (
  "id" UUID NOT NULL,
  "year_month" VARCHAR(7) NOT NULL,
  "target_slot" SMALLINT NOT NULL,
  "snapshot_as_of" TIMESTAMPTZ(6) NOT NULL,
  "closed_by" VARCHAR(120) NOT NULL,
  "dry_run" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(24) NOT NULL,
  "validation_status" VARCHAR(24),
  "snapshots_scanned" INTEGER NOT NULL DEFAULT 0,
  "months_upserted" INTEGER NOT NULL DEFAULT 0,
  "snapshots_updated" INTEGER NOT NULL DEFAULT 0,
  "nonzero_mtd_cells_before" INTEGER NOT NULL DEFAULT 0,
  "sales_cells_reset" INTEGER NOT NULL DEFAULT 0,
  "unpromoted_pos_tickets" INTEGER NOT NULL DEFAULT 0,
  "sales_cell_mismatch_count" INTEGER NOT NULL DEFAULT 0,
  "sales_cell_mismatch_qty_abs" INTEGER NOT NULL DEFAULT 0,
  "total_qty_sales" INTEGER NOT NULL DEFAULT 0,
  "total_net_sales" NUMERIC(14, 2),
  "total_profit" NUMERIC(14, 2),
  "inventory_value_total" NUMERIC(14, 2),
  "error_text" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),

  CONSTRAINT "inventory_month_close_run_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_month_close_run_year_month_check"
    CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "inventory_month_close_run_target_slot_check"
    CHECK ("target_slot" BETWEEN 1 AND 12),
  CONSTRAINT "inventory_month_close_run_status_check"
    CHECK ("status" IN ('RUNNING', 'DRY_RUN', 'SUCCEEDED', 'FAILED')),
  CONSTRAINT "inventory_month_close_run_validation_status_check"
    CHECK ("validation_status" IS NULL OR "validation_status" IN ('PASSED', 'FAILED'))
);

CREATE TABLE "app"."inventory_closed_month" (
  "year_month" VARCHAR(7) NOT NULL,
  "run_id" UUID NOT NULL,
  "target_slot" SMALLINT NOT NULL,
  "snapshot_as_of" TIMESTAMPTZ(6) NOT NULL,
  "closed_by" VARCHAR(120) NOT NULL,
  "closed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snapshots_closed" INTEGER NOT NULL DEFAULT 0,
  "month_rows_closed" INTEGER NOT NULL DEFAULT 0,
  "sales_cells_reset" INTEGER NOT NULL DEFAULT 0,
  "total_qty_sales" INTEGER NOT NULL DEFAULT 0,
  "total_net_sales" NUMERIC(14, 2),
  "total_profit" NUMERIC(14, 2),
  "inventory_value_total" NUMERIC(14, 2),

  CONSTRAINT "inventory_closed_month_pkey" PRIMARY KEY ("year_month"),
  CONSTRAINT "inventory_closed_month_run_id_key" UNIQUE ("run_id"),
  CONSTRAINT "inventory_closed_month_year_month_check"
    CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "inventory_closed_month_target_slot_check"
    CHECK ("target_slot" BETWEEN 1 AND 12),
  CONSTRAINT "inventory_closed_month_run_id_fkey"
    FOREIGN KEY ("run_id")
    REFERENCES "app"."inventory_month_close_run"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE INDEX "inventory_month_close_run_month_started_idx"
  ON "app"."inventory_month_close_run"("year_month", "started_at");

CREATE INDEX "inventory_month_close_run_status_started_idx"
  ON "app"."inventory_month_close_run"("status", "started_at");
