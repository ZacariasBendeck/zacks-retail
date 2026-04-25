-- Inventory history parity tables
-- Created: 2026-04-25
-- Schema: app
--
-- Rationale:
--   Promote RIINVHIS.MDB / InvHis into owned Postgres tables so reporting can
--   read inventory history without depending on the retired rics_mirror
--   schema. The shape preserves the full legacy column families while
--   normalizing the 12 monthly slots, 7 trend slots, and 3 RMSA buckets.
--
-- Rollback:
--   Reversible by dropping the four app.inventory_history_* tables. Any
--   imported parity data in those tables would be lost.

CREATE TABLE "app"."inventory_history_snapshot" (
    "id" UUID NOT NULL,
    "sku_id" UUID,
    "sku_code" VARCHAR(15) NOT NULL,
    "store_id" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'RICS_IMPORT',
    "source_run_id" UUID,
    "snapshot_as_of" TIMESTAMP(3) NOT NULL,
    "date_last_received" TIMESTAMP(3),
    "average_cost" DECIMAL(12,2),
    "season_inv_value" DECIMAL(14,2),
    "year_inv_value" DECIMAL(14,2),
    "last_month_inv_value" DECIMAL(14,2),
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "current_on_order" INTEGER NOT NULL DEFAULT 0,
    "future_on_order" INTEGER NOT NULL DEFAULT 0,
    "model_qty" INTEGER NOT NULL DEFAULT 0,
    "week_qty_sales" INTEGER NOT NULL DEFAULT 0,
    "month_qty_sales" INTEGER NOT NULL DEFAULT 0,
    "season_qty_sales" INTEGER NOT NULL DEFAULT 0,
    "year_qty_sales" INTEGER NOT NULL DEFAULT 0,
    "ly_season_qty_sales" INTEGER NOT NULL DEFAULT 0,
    "ly_year_qty_sales" INTEGER NOT NULL DEFAULT 0,
    "week_dol_sales" DECIMAL(14,2),
    "month_dol_sales" DECIMAL(14,2),
    "season_dol_sales" DECIMAL(14,2),
    "year_dol_sales" DECIMAL(14,2),
    "ly_season_dol_sales" DECIMAL(14,2),
    "ly_year_dol_sales" DECIMAL(14,2),
    "week_profit" DECIMAL(14,2),
    "month_profit" DECIMAL(14,2),
    "season_profit" DECIMAL(14,2),
    "year_profit" DECIMAL(14,2),
    "ly_season_profit" DECIMAL(14,2),
    "ly_year_profit" DECIMAL(14,2),
    "week_markdown" DECIMAL(14,2),
    "month_markdown" DECIMAL(14,2),
    "season_markdown" DECIMAL(14,2),
    "year_markdown" DECIMAL(14,2),
    "last_month_on_hand" INTEGER NOT NULL DEFAULT 0,
    "last_season_on_hand" INTEGER NOT NULL DEFAULT 0,
    "last_year_on_hand" INTEGER NOT NULL DEFAULT 0,
    "trend_week_8_beg_on_hand" INTEGER NOT NULL DEFAULT 0,
    "last_month_retail" DECIMAL(12,2),
    "retail_price" DECIMAL(12,2),
    "mark_down_price_1" DECIMAL(12,2),
    "mark_down_price_2" DECIMAL(12,2),
    "current_price_slot_raw" SMALLINT,
    "current_price_slot" TEXT,
    "perks" DECIMAL(12,2),
    "date_first_received" TIMESTAMP(3),
    "last_price_change_at" TIMESTAMP(3),
    "source_date_last_changed" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_history_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_history_snapshot_store_sku_code_key"
    ON "app"."inventory_history_snapshot"("store_id", "sku_code");
CREATE INDEX "inventory_history_snapshot_sku_store_idx"
    ON "app"."inventory_history_snapshot"("sku_id", "store_id");
CREATE INDEX "inventory_history_snapshot_store_idx"
    ON "app"."inventory_history_snapshot"("store_id");
CREATE INDEX "inventory_history_snapshot_source_run_idx"
    ON "app"."inventory_history_snapshot"("source_run_id");
CREATE INDEX "inventory_history_snapshot_snapshot_as_of_idx"
    ON "app"."inventory_history_snapshot"("snapshot_as_of");

ALTER TABLE "app"."inventory_history_snapshot"
    ADD CONSTRAINT "inventory_history_snapshot_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."inventory_history_month" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "slot_number" SMALLINT NOT NULL,
    "calendar_month" SMALLINT NOT NULL,
    "stored_year" INTEGER NOT NULL,
    "year_month" VARCHAR(7) NOT NULL,
    "qty_sales" INTEGER NOT NULL DEFAULT 0,
    "net_sales" DECIMAL(14,2),
    "profit" DECIMAL(14,2),
    "qty_on_hand" INTEGER NOT NULL DEFAULT 0,
    "inventory_value" DECIMAL(14,2),

    CONSTRAINT "inventory_history_month_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_history_month_snapshot_slot_key"
    ON "app"."inventory_history_month"("snapshot_id", "slot_number");
CREATE INDEX "inventory_history_month_year_month_idx"
    ON "app"."inventory_history_month"("year_month");
CREATE INDEX "inventory_history_month_snapshot_year_month_idx"
    ON "app"."inventory_history_month"("snapshot_id", "year_month");

ALTER TABLE "app"."inventory_history_month"
    ADD CONSTRAINT "inventory_history_month_snapshot_id_fkey"
    FOREIGN KEY ("snapshot_id") REFERENCES "app"."inventory_history_snapshot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."inventory_history_trend_week" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "slot_number" SMALLINT NOT NULL,
    "begin_on_hand" INTEGER NOT NULL DEFAULT 0,
    "on_hand_constant" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_history_trend_week_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_history_trend_week_snapshot_slot_key"
    ON "app"."inventory_history_trend_week"("snapshot_id", "slot_number");
CREATE INDEX "inventory_history_trend_week_snapshot_idx"
    ON "app"."inventory_history_trend_week"("snapshot_id");

ALTER TABLE "app"."inventory_history_trend_week"
    ADD CONSTRAINT "inventory_history_trend_week_snapshot_id_fkey"
    FOREIGN KEY ("snapshot_id") REFERENCES "app"."inventory_history_snapshot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "app"."inventory_history_movement_bucket" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "bucket_number" SMALLINT NOT NULL,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "received_value" DECIMAL(14,2),
    "returned_qty" INTEGER NOT NULL DEFAULT 0,
    "returned_value" DECIMAL(14,2),
    "transfer_in_qty" INTEGER NOT NULL DEFAULT 0,
    "transfer_in_value" DECIMAL(14,2),
    "transfer_out_qty" INTEGER NOT NULL DEFAULT 0,
    "transfer_out_value" DECIMAL(14,2),
    "physical_qty" INTEGER NOT NULL DEFAULT 0,
    "physical_value" DECIMAL(14,2),
    "beginning_value" DECIMAL(14,2),

    CONSTRAINT "inventory_history_movement_bucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_history_bucket_snapshot_bucket_key"
    ON "app"."inventory_history_movement_bucket"("snapshot_id", "bucket_number");
CREATE INDEX "inventory_history_bucket_snapshot_idx"
    ON "app"."inventory_history_movement_bucket"("snapshot_id");

ALTER TABLE "app"."inventory_history_movement_bucket"
    ADD CONSTRAINT "inventory_history_bucket_snapshot_id_fkey"
    FOREIGN KEY ("snapshot_id") REFERENCES "app"."inventory_history_snapshot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
