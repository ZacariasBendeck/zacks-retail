-- Inventory inquiry size-grid sales projection.
-- Promote the per-cell MTD / STD / YTD / LY counters from
-- `inventory_quantities.csv` into an owned Postgres table so the
-- request path no longer depends on ticket replay or rics_mirror.

CREATE TABLE "app"."inventory_sales_cell" (
    "id" UUID NOT NULL,
    "store_id" INTEGER NOT NULL,
    "sku_id" UUID NOT NULL,
    "column_label" TEXT NOT NULL DEFAULT '',
    "row_label" TEXT NOT NULL DEFAULT '',
    "mtd_sales" INTEGER NOT NULL DEFAULT 0,
    "std_sales" INTEGER NOT NULL DEFAULT 0,
    "ytd_sales" INTEGER NOT NULL DEFAULT 0,
    "ly_sales" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'RICS_IMPORT',
    "source_run_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_sales_cell_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_sales_cell_store_sku_cell_key"
    ON "app"."inventory_sales_cell"("store_id", "sku_id", "column_label", "row_label");
CREATE INDEX "inventory_sales_cell_sku_store_idx"
    ON "app"."inventory_sales_cell"("sku_id", "store_id");
CREATE INDEX "inventory_sales_cell_store_idx"
    ON "app"."inventory_sales_cell"("store_id");

ALTER TABLE "app"."inventory_sales_cell"
    ADD CONSTRAINT "inventory_sales_cell_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
