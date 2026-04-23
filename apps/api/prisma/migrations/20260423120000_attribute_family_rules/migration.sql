-- Attribute ↔ Family rules — move from single-FK `product_family` on
-- attribute_dimension to a many-to-many `attribute_family_rule` join with
-- `enabled` + `is_required` flags per pair. Also add `is_active` to
-- attribute_value so values can be retired without deletion (FK Restrict
-- on sku_attribute_assignment blocks hard-delete of referenced values).
--
-- "Universal" semantics: a dimension with ZERO rule rows applies to every
-- family. A dimension with ≥1 rule row only renders for families whose rule
-- has enabled=true. This matches the existing seed behaviour where
-- product_family IS NULL meant universal.
--
-- Module: docs/modules/products/
-- Plan:   C:\Users\zbend\.claude\plans\now-we-have-all-vivid-charm.md

-- ────────────────────────────────────────────────────────────────────────
-- 1. Create attribute_family_rule (the new join table).
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE "app"."attribute_family_rule" (
    "dimension_id" SMALLINT NOT NULL,
    "family_code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL DEFAULT 'seed',

    CONSTRAINT "attribute_family_rule_pkey" PRIMARY KEY ("dimension_id", "family_code")
);

CREATE INDEX "attribute_family_rule_family_idx"
    ON "app"."attribute_family_rule"("family_code");

ALTER TABLE "app"."attribute_family_rule"
    ADD CONSTRAINT "attribute_family_rule_dimension_id_fkey"
    FOREIGN KEY ("dimension_id") REFERENCES "app"."attribute_dimension"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."attribute_family_rule"
    ADD CONSTRAINT "attribute_family_rule_family_code_fkey"
    FOREIGN KEY ("family_code") REFERENCES "app"."product_family"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────────────────
-- 2. Backfill — every non-null product_family becomes one rule row.
--    NULL dimensions get no rows (= universal).
-- ────────────────────────────────────────────────────────────────────────

INSERT INTO "app"."attribute_family_rule"
    ("dimension_id", "family_code", "enabled", "is_required", "sort_order", "updated_at", "updated_by")
SELECT
    d."id",
    d."product_family",
    true,
    false,
    0,
    CURRENT_TIMESTAMP,
    'migration:20260423120000'
FROM "app"."attribute_dimension" d
WHERE d."product_family" IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 3. Drop the old product_family column + its FK/index on attribute_dimension.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE "app"."attribute_dimension"
    DROP CONSTRAINT "attribute_dimension_product_family_fkey";

DROP INDEX "app"."attribute_dimension_product_family_idx";

ALTER TABLE "app"."attribute_dimension"
    DROP COLUMN "product_family";

-- ────────────────────────────────────────────────────────────────────────
-- 4. Add is_active to attribute_value. Defaults to true — all existing
--    values stay visible.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE "app"."attribute_value"
    ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
