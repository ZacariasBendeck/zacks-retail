-- Inventory module: store-aware manual receipt foundation.
-- Adds the first Postgres-native write surface for the RICS "Enter Manual Receipts"
-- workflow without extending the legacy SQLite adjustment tables.
--
-- Scope:
--   - app.stock_level          -- per (store × sku × column × row) projection
--   - app.stock_movement       -- append-only movement ledger
--   - app.manual_receipt       -- document header
--   - app.manual_receipt_line  -- per-cell receipt lines
--
-- Deliberate non-goals in this migration:
--   - no backfill from SQLite adjustments
--   - no store-ops/case-pack FK yet
--   - no replacement of the existing app.inventory/app.inventory_audit_log tables
--
-- CreateTable: stock_level
CREATE TABLE "app"."stock_level" (
    "id" UUID NOT NULL,
    "store_id" INTEGER NOT NULL,
    "sku_id" UUID NOT NULL,
    "column_label" TEXT NOT NULL DEFAULT '',
    "row_label" TEXT NOT NULL DEFAULT '',
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "last_received_at" TIMESTAMP(3),
    "last_movement_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_level_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_level_store_sku_cell_key"
    ON "app"."stock_level"("store_id", "sku_id", "column_label", "row_label");
CREATE INDEX "stock_level_sku_store_idx"
    ON "app"."stock_level"("sku_id", "store_id");
CREATE INDEX "stock_level_store_on_hand_idx"
    ON "app"."stock_level"("store_id", "on_hand");

ALTER TABLE "app"."stock_level"
    ADD CONSTRAINT "stock_level_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: stock_movement
CREATE TABLE "app"."stock_movement" (
    "id" UUID NOT NULL,
    "store_id" INTEGER NOT NULL,
    "sku_id" UUID NOT NULL,
    "column_label" TEXT NOT NULL DEFAULT '',
    "row_label" TEXT NOT NULL DEFAULT '',
    "movement_type" TEXT NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "unit_cost_snapshot" DECIMAL(12,2),
    "retail_price_snapshot" DECIMAL(12,2),
    "source_document_type" TEXT NOT NULL,
    "source_document_id" TEXT NOT NULL,
    "reason_code" TEXT,
    "comment" TEXT,
    "performed_by" TEXT NOT NULL,
    "movement_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_movement_idempotency_key"
    ON "app"."stock_movement"("idempotency_key");
CREATE INDEX "stock_movement_sku_store_movement_at_idx"
    ON "app"."stock_movement"("sku_id", "store_id", "movement_at" DESC);
CREATE INDEX "stock_movement_type_movement_at_idx"
    ON "app"."stock_movement"("movement_type", "movement_at" DESC);
CREATE INDEX "stock_movement_store_movement_at_idx"
    ON "app"."stock_movement"("store_id", "movement_at" DESC);
CREATE INDEX "stock_movement_source_document_idx"
    ON "app"."stock_movement"("source_document_type", "source_document_id");

ALTER TABLE "app"."stock_movement"
    ADD CONSTRAINT "stock_movement_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: manual_receipt
CREATE TABLE "app"."manual_receipt" (
    "id" UUID NOT NULL,
    "store_id" INTEGER NOT NULL,
    "sku_id" UUID NOT NULL,
    "performed_by" TEXT NOT NULL,
    "reference_number" TEXT,
    "store_labels_on_receive" BOOLEAN NOT NULL DEFAULT false,
    "movement_at" TIMESTAMP(3) NOT NULL,
    "unit_cost_override" DECIMAL(12,2),
    "retail_price_override" DECIMAL(12,2),
    "case_pack_id" TEXT,
    "case_pack_multiplier" INTEGER,
    "note" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_receipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "manual_receipt_idempotency_key"
    ON "app"."manual_receipt"("idempotency_key");
CREATE INDEX "manual_receipt_store_movement_at_idx"
    ON "app"."manual_receipt"("store_id", "movement_at" DESC);
CREATE INDEX "manual_receipt_sku_movement_at_idx"
    ON "app"."manual_receipt"("sku_id", "movement_at" DESC);

ALTER TABLE "app"."manual_receipt"
    ADD CONSTRAINT "manual_receipt_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: manual_receipt_line
CREATE TABLE "app"."manual_receipt_line" (
    "id" UUID NOT NULL,
    "manual_receipt_id" UUID NOT NULL,
    "column_label" TEXT NOT NULL DEFAULT '',
    "row_label" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "retail_price" DECIMAL(12,2) NOT NULL,
    "movement_id" UUID NOT NULL,

    CONSTRAINT "manual_receipt_line_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "manual_receipt_line_movement_id_key"
    ON "app"."manual_receipt_line"("movement_id");
CREATE UNIQUE INDEX "manual_receipt_line_cell_key"
    ON "app"."manual_receipt_line"("manual_receipt_id", "column_label", "row_label");
CREATE INDEX "manual_receipt_line_receipt_id_idx"
    ON "app"."manual_receipt_line"("manual_receipt_id");

ALTER TABLE "app"."manual_receipt_line"
    ADD CONSTRAINT "manual_receipt_line_receipt_id_fkey"
    FOREIGN KEY ("manual_receipt_id") REFERENCES "app"."manual_receipt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."manual_receipt_line"
    ADD CONSTRAINT "manual_receipt_line_movement_id_fkey"
    FOREIGN KEY ("movement_id") REFERENCES "app"."stock_movement"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
