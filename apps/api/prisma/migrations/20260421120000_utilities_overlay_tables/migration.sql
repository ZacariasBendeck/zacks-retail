-- Utilities module — overlay + batch-operation audit tables.
-- Spec: docs/dev/specs/2026-04-21-utilities-batch-change-design.md
-- Module: docs/modules/utilities.md
--
-- All tables in `app` schema (preserved across sync:rics reloads).
-- Natural-key refs to rics_sku_code / size-type code — no FK to rics_mirror.

-- CreateTable: sku_attribute_override (replace-style overlay for singular SKU attributes)
CREATE TABLE "app"."sku_attribute_override" (
    "rics_sku_code" VARCHAR(15) NOT NULL,
    "category" INTEGER,
    "vendor" VARCHAR(10),
    "season" VARCHAR(2),
    "group_code" VARCHAR(10),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "sku_attribute_override_pkey" PRIMARY KEY ("rics_sku_code")
);

CREATE INDEX "sku_attribute_override_category_idx" ON "app"."sku_attribute_override"("category");
CREATE INDEX "sku_attribute_override_vendor_idx"   ON "app"."sku_attribute_override"("vendor");
CREATE INDEX "sku_attribute_override_season_idx"   ON "app"."sku_attribute_override"("season");
CREATE INDEX "sku_attribute_override_group_code_idx" ON "app"."sku_attribute_override"("group_code");

-- CreateTable: sku_keyword_override (add/remove overlay layered on RICS space-sep KeyWords string)
CREATE TABLE "app"."sku_keyword_override" (
    "rics_sku_code" VARCHAR(15) NOT NULL,
    "keyword" VARCHAR(10) NOT NULL,
    "action" VARCHAR(8) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "sku_keyword_override_pkey" PRIMARY KEY ("rics_sku_code","keyword")
);

CREATE INDEX "sku_keyword_override_keyword_action_idx" ON "app"."sku_keyword_override"("keyword", "action");

-- CreateTable: size_type_override (replace-style overlay for size-type grids)
CREATE TABLE "app"."size_type_override" (
    "code" INTEGER NOT NULL,
    "description" VARCHAR(32),
    "columns_json" JSONB,
    "rows_json" JSONB,
    "max_columns" INTEGER,
    "max_rows" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "size_type_override_pkey" PRIMARY KEY ("code")
);

-- CreateTable: products_batch_operation (audit header for a batch-utility invocation)
CREATE TABLE "app"."products_batch_operation" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "criteria_json" JSONB NOT NULL,
    "change_json" JSONB NOT NULL,
    "affected_count" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "undone_at" TIMESTAMP(3),

    CONSTRAINT "products_batch_operation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "products_batch_operation_started_at_idx" ON "app"."products_batch_operation"("started_at");
CREATE INDEX "products_batch_operation_operation_type_started_at_idx" ON "app"."products_batch_operation"("operation_type", "started_at");

-- CreateTable: products_batch_operation_item (per-SKU before/after for undo)
CREATE TABLE "app"."products_batch_operation_item" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "rics_sku_code" VARCHAR(15) NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,

    CONSTRAINT "products_batch_operation_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "products_batch_operation_item_batch_id_idx" ON "app"."products_batch_operation_item"("batch_id");
CREATE INDEX "products_batch_operation_item_rics_sku_code_idx" ON "app"."products_batch_operation_item"("rics_sku_code");

ALTER TABLE "app"."products_batch_operation_item"
    ADD CONSTRAINT "products_batch_operation_item_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "app"."products_batch_operation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
