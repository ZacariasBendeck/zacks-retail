-- SKU-sweep migration: move the last four operational SQLite tables
-- (sku_sizes, inventory, inventory_audit_log, sku_code_seq) into Postgres.
-- Paired with deletion of the SQLite CREATE TABLE blocks in
-- apps/api/src/db/database.ts and the service-layer rewrite across
-- shiftService / ticketService / adjustmentService / purchaseOrderService /
-- dashboardService / publicProductService / skuService / inventoryService /
-- reportService. No data backfill — SQLite had no live data the operator
-- wants to preserve. `style_colors` + `sku_style_colors` are intentionally
-- NOT modelled here; the dedupe is dropped entirely (operator decision
-- 2026-04-23). The `skus` table itself is already covered by `app.sku`
-- from the pre-existing SKU-lifecycle model.

-- CreateTable: sku_size
CREATE TABLE "app"."sku_size" (
    "id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "size_label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sku_size_pkey" PRIMARY KEY ("id")
);

-- Prevent two rows for the same (sku, size_label) pair — matches the
-- SQLite UNIQUE(sku_id, size_label).
CREATE UNIQUE INDEX "sku_size_sku_id_size_label_key"
    ON "app"."sku_size"("sku_id", "size_label");

CREATE INDEX "sku_size_sku_id_idx" ON "app"."sku_size"("sku_id");

ALTER TABLE "app"."sku_size"
    ADD CONSTRAINT "sku_size_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: inventory
CREATE TABLE "app"."inventory" (
    "id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "sku_size_id" UUID,
    "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
    "quantity_reserved" INTEGER NOT NULL DEFAULT 0,
    "last_counted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- UNIQUE(sku_id, sku_size_id) handles both sized SKUs (both non-null) and
-- non-sized SKUs (sku_size_id NULL; there's at most one such row per sku).
-- Postgres treats NULLs as distinct by default, so the partial index
-- below covers the NULL case explicitly — otherwise a SKU without sizes
-- could accumulate multiple "inventory" rows.
CREATE UNIQUE INDEX "inventory_sku_size_unique"
    ON "app"."inventory"("sku_id", "sku_size_id");
CREATE UNIQUE INDEX "inventory_sku_size_null_unique"
    ON "app"."inventory"("sku_id")
    WHERE "sku_size_id" IS NULL;

CREATE INDEX "inventory_sku_id_idx" ON "app"."inventory"("sku_id");

ALTER TABLE "app"."inventory"
    ADD CONSTRAINT "inventory_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."inventory"
    ADD CONSTRAINT "inventory_sku_size_id_fkey"
    FOREIGN KEY ("sku_size_id") REFERENCES "app"."sku_size"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: inventory_audit_log
CREATE TABLE "app"."inventory_audit_log" (
    "id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "sku_size_id" UUID,
    "adjustment" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "resulting_balance" INTEGER NOT NULL,
    "performed_by" TEXT NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_audit_log_sku_id_idx"
    ON "app"."inventory_audit_log"("sku_id");
CREATE INDEX "inventory_audit_log_created_at_idx"
    ON "app"."inventory_audit_log"("created_at");

-- Audit rows outlive the thing they describe — we WANT them to survive if
-- the SKU itself is deleted. ON DELETE RESTRICT on sku FK + nullable
-- sku_size FK with ON DELETE SET NULL give us that: an adjustment can't
-- orphan its sku, but a dropped size label doesn't wipe history.
ALTER TABLE "app"."inventory_audit_log"
    ADD CONSTRAINT "inventory_audit_log_sku_id_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."inventory_audit_log"
    ADD CONSTRAINT "inventory_audit_log_sku_size_id_fkey"
    FOREIGN KEY ("sku_size_id") REFERENCES "app"."sku_size"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: sku_code_seq
-- Per-prefix auto-increment. Matches the SQLite upsert-and-read pattern
-- used by skuService.generateSkuCode and purchaseOrderService's PO
-- numbering. Prisma's `upsert` with `increment: 1` handles the semantics.
CREATE TABLE "app"."sku_code_seq" (
    "prefix" TEXT NOT NULL,
    "next_val" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sku_code_seq_pkey" PRIMARY KEY ("prefix")
);
