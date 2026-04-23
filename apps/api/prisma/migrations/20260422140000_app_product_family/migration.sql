-- Product Family foundation — one row per named attribute-schema bundle
-- (`zapatos`, `tops`, `vestidos`, `pantalones`, `ropa_otros`, `jackets_outerwear`,
-- `suits`, `carteras`, `cinturones`, `accesorios`, `general`). Each RICS category
-- is mapped to exactly one family via app.category_product_family. The AI
-- image-analysis prompt and the SKU create form both key off the active family
-- to decide which attribute dimensions to render / inject.
--
-- Module: docs/modules/products/
-- Design: docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md
--         (Product Family is the family-scope extension of the ext-attrs model)
--
-- All tables in `app` schema — preserved across sync:rics reloads. Soft ref from
-- category_product_family.category_number to rics_mirror.categories.number (no
-- FK because the mirror is rebuilt atomically on each reload).

-- CreateTable: product_family (11 rows seeded from seeds/product_families/families.csv)
CREATE TABLE "app"."product_family" (
    "code" TEXT NOT NULL,
    "label_es" TEXT NOT NULL,
    "description_es" TEXT,
    "sort_order" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_family_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "product_family_sort_order_idx" ON "app"."product_family"("sort_order");

-- CreateTable: category_product_family — one row per RICS category in rics_mirror.categories.
-- Soft-ref on category_number (no FK to rics_mirror.categories since that schema
-- is rebuilt atomically on each sync:rics reload).
CREATE TABLE "app"."category_product_family" (
    "category_number" INTEGER NOT NULL,
    "family_code" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL DEFAULT 'seed',

    CONSTRAINT "category_product_family_pkey" PRIMARY KEY ("category_number")
);

CREATE INDEX "category_product_family_family_code_idx"
    ON "app"."category_product_family"("family_code");

ALTER TABLE "app"."category_product_family"
    ADD CONSTRAINT "category_product_family_family_code_fkey"
    FOREIGN KEY ("family_code") REFERENCES "app"."product_family"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: attribute_dimension — add product_family scope column.
-- NULL = universal dimension (renders for every family). Non-NULL = dimension
-- only renders when its family is the active one.
ALTER TABLE "app"."attribute_dimension"
    ADD COLUMN "product_family" TEXT;

CREATE INDEX "attribute_dimension_product_family_idx"
    ON "app"."attribute_dimension"("product_family");

ALTER TABLE "app"."attribute_dimension"
    ADD CONSTRAINT "attribute_dimension_product_family_fkey"
    FOREIGN KEY ("product_family") REFERENCES "app"."product_family"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateView: category_orphans — categories in rics_mirror with no family mapping.
-- Expected to be empty after the seed runs. Surfaces new categories added via
-- sync:rics so the operator knows to map them.
CREATE VIEW "app"."category_family_orphans" AS
    SELECT c."number" AS category_number, c."desc" AS category_desc
    FROM "rics_mirror"."categories" c
    WHERE NOT EXISTS (
        SELECT 1 FROM "app"."category_product_family" cpf
        WHERE cpf."category_number" = c."number"
    );
