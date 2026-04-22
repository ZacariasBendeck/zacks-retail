-- SKU extended attributes — dimension catalog + per-SKU assignments.
-- Spec: docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md
-- Module: docs/modules/products/ (extends the products module surface)
--
-- All tables in `app` schema (preserved across sync:rics reloads).
-- Natural-key soft ref from sku_attribute_assignment.sku_code to
-- rics_mirror.inventory_master.sku — no FK because the mirror is rebuilt
-- atomically on each `pnpm sync:rics`. The app.sku_attribute_orphans view
-- surfaces references that no longer resolve.

-- CreateTable: attribute_dimension (one row per extensible facet)
CREATE TABLE "app"."attribute_dimension" (
    "id" SMALLSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "label_es" TEXT NOT NULL,
    "description_es" TEXT,
    "sort_order" SMALLINT NOT NULL,
    "is_multi_value" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribute_dimension_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attribute_dimension_code_key" ON "app"."attribute_dimension"("code");

-- CreateTable: attribute_value (values available within a dimension)
CREATE TABLE "app"."attribute_value" (
    "id" SMALLSERIAL NOT NULL,
    "dimension_id" SMALLINT NOT NULL,
    "code" TEXT NOT NULL,
    "label_es" TEXT NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribute_value_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attribute_value_dimension_id_code_key" ON "app"."attribute_value"("dimension_id", "code");

ALTER TABLE "app"."attribute_value"
    ADD CONSTRAINT "attribute_value_dimension_id_fkey"
    FOREIGN KEY ("dimension_id") REFERENCES "app"."attribute_dimension"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: sku_attribute_assignment (per-SKU classification rows)
-- sku_code is a soft-ref to rics_mirror.inventory_master.sku — validated at the
-- service layer on write, reconciled via app.sku_attribute_orphans on read.
CREATE TABLE "app"."sku_attribute_assignment" (
    "sku_code" VARCHAR(15) NOT NULL,
    "dimension_id" SMALLINT NOT NULL,
    "value_id" SMALLINT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT,

    CONSTRAINT "sku_attribute_assignment_pkey" PRIMARY KEY ("sku_code", "dimension_id", "value_id")
);

CREATE INDEX "sku_attribute_assignment_facet_idx"
    ON "app"."sku_attribute_assignment"("dimension_id", "value_id", "sku_code");

CREATE INDEX "sku_attribute_assignment_assigned_by_idx"
    ON "app"."sku_attribute_assignment"("assigned_by");

ALTER TABLE "app"."sku_attribute_assignment"
    ADD CONSTRAINT "sku_attribute_assignment_dimension_id_fkey"
    FOREIGN KEY ("dimension_id") REFERENCES "app"."attribute_dimension"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."sku_attribute_assignment"
    ADD CONSTRAINT "sku_attribute_assignment_value_id_fkey"
    FOREIGN KEY ("value_id") REFERENCES "app"."attribute_value"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateView: sku_attribute_orphans — assignments whose sku_code no longer exists in the mirror.
-- Watched by pnpm verify:rics-mirror after each reload.
CREATE VIEW "app"."sku_attribute_orphans" AS
    SELECT a."sku_code", COUNT(*)::INTEGER AS "assignment_count"
    FROM "app"."sku_attribute_assignment" a
    WHERE NOT EXISTS (
        SELECT 1 FROM "rics_mirror"."inventory_master" im WHERE im."sku" = a."sku_code"
    )
    GROUP BY a."sku_code";
