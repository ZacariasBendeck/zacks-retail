-- Inventory module: stock-maintenance schema expansion.
-- Adds the remaining Phase-A Postgres-owned tables needed to promote
-- stock-maintenance data out of rics_mirror and into app.*:
--   - app.replenishment_target
--   - app.manual_return
--   - app.manual_return_line
--   - app.transfer
--   - app.transfer_line
--   - app.auto_transfer_run
--   - app.balancing_transfer_run
-- plus the enum vocabulary those tables rely on.

DO $$ BEGIN
  CREATE TYPE "app"."TransferStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "app"."TransferOrigin" AS ENUM ('MANUAL', 'TRANSFER_ALL', 'AUTO', 'BALANCING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "app"."TransferSort" AS ENUM ('SKU', 'VENDOR', 'CATEGORY', 'LOCATION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "app"."RunStatus" AS ENUM ('QUEUED', 'PREVIEWED', 'COMMITTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "app"."BalancingMethod" AS ENUM ('OVER_UNDER_MODELS', 'WITHOUT_MODELS', 'WITHOUT_CONSIDERING_MODELS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "app"."PerformanceMetric" AS ENUM ('ROI', 'TURNS', 'SELL_THRU');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "app"."SalesPeriod" AS ENUM ('MONTH', 'SEASON', 'YEAR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "app"."TieBreakKind" AS ENUM ('ABSOLUTE', 'PERCENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: replenishment_target
CREATE TABLE "app"."replenishment_target" (
    "id" UUID NOT NULL,
    "store_id" INTEGER NOT NULL,
    "sku_id" UUID NOT NULL,
    "column_label" TEXT NOT NULL DEFAULT '',
    "row_label" TEXT NOT NULL DEFAULT '',
    "model_qty" INTEGER,
    "max_qty" INTEGER,
    "reorder_qty" INTEGER,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "replenishment_target_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "replenishment_target_store_sku_cell_key"
    ON "app"."replenishment_target"("store_id", "sku_id", "column_label", "row_label");
CREATE INDEX "replenishment_target_sku_store_idx"
    ON "app"."replenishment_target"("sku_id", "store_id");
CREATE INDEX "replenishment_target_store_idx"
    ON "app"."replenishment_target"("store_id");

ALTER TABLE "app"."replenishment_target"
    ADD CONSTRAINT "replenishment_target_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: manual_return
CREATE TABLE "app"."manual_return" (
    "id" UUID NOT NULL,
    "store_id" INTEGER NOT NULL,
    "sku_id" UUID NOT NULL,
    "performed_by" TEXT NOT NULL,
    "return_reason_code" TEXT,
    "rma_number" TEXT,
    "movement_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_return_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "manual_return_idempotency_key"
    ON "app"."manual_return"("idempotency_key");
CREATE INDEX "manual_return_store_movement_at_idx"
    ON "app"."manual_return"("store_id", "movement_at" DESC);
CREATE INDEX "manual_return_sku_movement_at_idx"
    ON "app"."manual_return"("sku_id", "movement_at" DESC);

ALTER TABLE "app"."manual_return"
    ADD CONSTRAINT "manual_return_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: manual_return_line
CREATE TABLE "app"."manual_return_line" (
    "id" UUID NOT NULL,
    "manual_return_id" UUID NOT NULL,
    "column_label" TEXT NOT NULL DEFAULT '',
    "row_label" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "movement_id" UUID NOT NULL,

    CONSTRAINT "manual_return_line_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "manual_return_line_movement_id_key"
    ON "app"."manual_return_line"("movement_id");
CREATE UNIQUE INDEX "manual_return_line_cell_key"
    ON "app"."manual_return_line"("manual_return_id", "column_label", "row_label");
CREATE INDEX "manual_return_line_return_id_idx"
    ON "app"."manual_return_line"("manual_return_id");

ALTER TABLE "app"."manual_return_line"
    ADD CONSTRAINT "manual_return_line_return_id_fkey"
    FOREIGN KEY ("manual_return_id") REFERENCES "app"."manual_return"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."manual_return_line"
    ADD CONSTRAINT "manual_return_line_movement_id_fkey"
    FOREIGN KEY ("movement_id") REFERENCES "app"."stock_movement"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: transfer
CREATE TABLE "app"."transfer" (
    "id" UUID NOT NULL,
    "transfer_number" TEXT NOT NULL,
    "from_store_id" INTEGER NOT NULL,
    "to_store_id" INTEGER NOT NULL,
    "status" "app"."TransferStatus" NOT NULL,
    "origin" "app"."TransferOrigin" NOT NULL,
    "origin_run_id" UUID,
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "shipped_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transfer_transfer_number_key"
    ON "app"."transfer"("transfer_number");
CREATE INDEX "transfer_from_store_status_idx"
    ON "app"."transfer"("from_store_id", "status");
CREATE INDEX "transfer_to_store_status_idx"
    ON "app"."transfer"("to_store_id", "status");
CREATE INDEX "transfer_origin_created_at_idx"
    ON "app"."transfer"("origin", "created_at" DESC);

-- CreateTable: transfer_line
CREATE TABLE "app"."transfer_line" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "column_label" TEXT NOT NULL DEFAULT '',
    "row_label" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "unit_cost_snapshot" DECIMAL(12,2) NOT NULL,
    "outbound_movement_id" UUID,
    "inbound_movement_id" UUID,

    CONSTRAINT "transfer_line_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transfer_line_outbound_movement_id_key"
    ON "app"."transfer_line"("outbound_movement_id");
CREATE UNIQUE INDEX "transfer_line_inbound_movement_id_key"
    ON "app"."transfer_line"("inbound_movement_id");
CREATE INDEX "transfer_line_transfer_id_idx"
    ON "app"."transfer_line"("transfer_id");
CREATE INDEX "transfer_line_sku_id_idx"
    ON "app"."transfer_line"("sku_id");

ALTER TABLE "app"."transfer_line"
    ADD CONSTRAINT "transfer_line_transfer_id_fkey"
    FOREIGN KEY ("transfer_id") REFERENCES "app"."transfer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."transfer_line"
    ADD CONSTRAINT "transfer_line_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."transfer_line"
    ADD CONSTRAINT "transfer_line_outbound_movement_id_fkey"
    FOREIGN KEY ("outbound_movement_id") REFERENCES "app"."stock_movement"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."transfer_line"
    ADD CONSTRAINT "transfer_line_inbound_movement_id_fkey"
    FOREIGN KEY ("inbound_movement_id") REFERENCES "app"."stock_movement"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: auto_transfer_run
CREATE TABLE "app"."auto_transfer_run" (
    "id" UUID NOT NULL,
    "status" "app"."RunStatus" NOT NULL,
    "warehouse_store_id" INTEGER NOT NULL,
    "target_store_ids" INTEGER[] NOT NULL,
    "sort_order" "app"."TransferSort" NOT NULL,
    "criteria_json" JSONB NOT NULL,
    "in_transit_pos" BOOLEAN NOT NULL DEFAULT false,
    "requested_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previewed_at" TIMESTAMP(3),
    "committed_at" TIMESTAMP(3),
    "generated_transfer_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "auto_transfer_run_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auto_transfer_run_status_created_at_idx"
    ON "app"."auto_transfer_run"("status", "created_at" DESC);
CREATE INDEX "auto_transfer_run_warehouse_store_idx"
    ON "app"."auto_transfer_run"("warehouse_store_id");

-- CreateTable: balancing_transfer_run
CREATE TABLE "app"."balancing_transfer_run" (
    "id" UUID NOT NULL,
    "status" "app"."RunStatus" NOT NULL,
    "balancing_method" "app"."BalancingMethod" NOT NULL,
    "performance_metric" "app"."PerformanceMetric" NOT NULL,
    "sales_period" "app"."SalesPeriod" NOT NULL,
    "tie_break_kind" "app"."TieBreakKind" NOT NULL,
    "tie_break_value" DECIMAL(12,2) NOT NULL,
    "transfer_doubles_to_lower_priority" BOOLEAN NOT NULL DEFAULT false,
    "strip_stores_below_size_count" INTEGER,
    "include_original_retail_only" BOOLEAN NOT NULL DEFAULT false,
    "include_markdown_only" BOOLEAN NOT NULL DEFAULT false,
    "include_perks_only" BOOLEAN NOT NULL DEFAULT false,
    "criteria_json" JSONB NOT NULL,
    "in_transit_pos" BOOLEAN NOT NULL DEFAULT false,
    "requested_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previewed_at" TIMESTAMP(3),
    "committed_at" TIMESTAMP(3),
    "generated_transfer_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "exceptions_json" JSONB,

    CONSTRAINT "balancing_transfer_run_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "balancing_transfer_run_status_created_at_idx"
    ON "app"."balancing_transfer_run"("status", "created_at" DESC);
CREATE INDEX "balancing_transfer_run_method_idx"
    ON "app"."balancing_transfer_run"("balancing_method");
