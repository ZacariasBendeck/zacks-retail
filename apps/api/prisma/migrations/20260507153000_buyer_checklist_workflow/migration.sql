-- Buyer Checklist workflow expansion.
-- Adds landing/dashboard support, carryover winner review, new-style targets,
-- and per-dimension attribute planning.

ALTER TABLE "app"."buyer_purchase_category_card"
  DROP CONSTRAINT IF EXISTS "buyer_purchase_category_card_status_check";

ALTER TABLE "app"."buyer_purchase_category_card"
  ADD CONSTRAINT "buyer_purchase_category_card_status_check"
    CHECK ("status" IN (
      'NOT_STARTED',
      'HISTORY_REVIEWED',
      'CARRYOVER_REVIEW',
      'CARRYOVERS',
      'NEW_STYLES',
      'PO_LINKED',
      'COMPLETE'
    ));

ALTER TABLE "app"."buyer_purchase_category_card"
  ADD COLUMN IF NOT EXISTS "replacement_style_target_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "additional_new_style_target_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_new_style_target_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "app"."buyer_purchase_carryover_line"
  ADD COLUMN IF NOT EXISTS "carryover_candidate_id" UUID;

CREATE TABLE IF NOT EXISTS "app"."buyer_purchase_carryover_candidate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workbook_id" UUID NOT NULL,
  "card_id" UUID NOT NULL,
  "store_id" INTEGER NOT NULL,
  "category_number" SMALLINT NOT NULL,
  "sku_id" UUID,
  "sku_code" VARCHAR(32) NOT NULL,
  "sku_description" TEXT,
  "color" TEXT,
  "metrics_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "decision" VARCHAR(24) NOT NULL DEFAULT 'UNREVIEWED',
  "availability" VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN',
  "unavailable_reason" TEXT,
  "carryover_line_id" UUID,
  "replacement_style_id" UUID,
  "notes" TEXT,
  "reviewed_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buyer_purchase_carryover_candidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_purchase_carryover_candidate_workbook_fkey"
    FOREIGN KEY ("workbook_id") REFERENCES "app"."buyer_purchase_workbook"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_carryover_candidate_card_fkey"
    FOREIGN KEY ("card_id") REFERENCES "app"."buyer_purchase_category_card"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_carryover_candidate_store_fkey"
    FOREIGN KEY ("store_id") REFERENCES "app"."store_master"("number")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_carryover_candidate_category_fkey"
    FOREIGN KEY ("category_number") REFERENCES "app"."taxonomy_category"("number")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_carryover_candidate_sku_fkey"
    FOREIGN KEY ("sku_id") REFERENCES "app"."sku"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_carryover_candidate_decision_check"
    CHECK ("decision" IN ('UNREVIEWED', 'WINNER', 'MAYBE', 'DROP')),
  CONSTRAINT "buyer_purchase_carryover_candidate_availability_check"
    CHECK ("availability" IN ('UNKNOWN', 'AVAILABLE', 'UNAVAILABLE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "buyer_purchase_carryover_candidate_card_sku_key"
  ON "app"."buyer_purchase_carryover_candidate"("card_id", "store_id", "sku_code");

CREATE INDEX IF NOT EXISTS "buyer_purchase_carryover_candidate_card_decision_idx"
  ON "app"."buyer_purchase_carryover_candidate"("card_id", "decision", "availability");

ALTER TABLE "app"."buyer_purchase_carryover_line"
  ADD CONSTRAINT "buyer_purchase_carryover_line_candidate_fkey"
  FOREIGN KEY ("carryover_candidate_id") REFERENCES "app"."buyer_purchase_carryover_candidate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."buyer_purchase_carryover_candidate"
  ADD CONSTRAINT "buyer_purchase_carryover_candidate_carryover_fkey"
  FOREIGN KEY ("carryover_line_id") REFERENCES "app"."buyer_purchase_carryover_line"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."buyer_purchase_planned_style"
  ADD COLUMN IF NOT EXISTS "replacement_for_carryover_candidate_id" UUID;

ALTER TABLE "app"."buyer_purchase_planned_style"
  ADD CONSTRAINT "buyer_purchase_planned_style_candidate_replacement_fkey"
  FOREIGN KEY ("replacement_for_carryover_candidate_id") REFERENCES "app"."buyer_purchase_carryover_candidate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."buyer_purchase_carryover_candidate"
  ADD CONSTRAINT "buyer_purchase_carryover_candidate_replacement_style_fkey"
  FOREIGN KEY ("replacement_style_id") REFERENCES "app"."buyer_purchase_planned_style"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "app"."buyer_purchase_attribute_plan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workbook_id" UUID NOT NULL,
  "card_id" UUID NOT NULL,
  "dimension_code" VARCHAR(120) NOT NULL,
  "dimension_label" TEXT NOT NULL,
  "value_code" VARCHAR(120) NOT NULL,
  "value_label" TEXT NOT NULL,
  "planned_style_count" INTEGER NOT NULL DEFAULT 0,
  "planned_units" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "updated_by" TEXT NOT NULL DEFAULT 'system',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "buyer_purchase_attribute_plan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_purchase_attribute_plan_workbook_fkey"
    FOREIGN KEY ("workbook_id") REFERENCES "app"."buyer_purchase_workbook"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "buyer_purchase_attribute_plan_card_fkey"
    FOREIGN KEY ("card_id") REFERENCES "app"."buyer_purchase_category_card"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "buyer_purchase_attribute_plan_card_value_key"
  ON "app"."buyer_purchase_attribute_plan"("card_id", "dimension_code", "value_code");

CREATE INDEX IF NOT EXISTS "buyer_purchase_attribute_plan_card_idx"
  ON "app"."buyer_purchase_attribute_plan"("card_id", "dimension_code");

WITH filtered_attribute_mix AS (
  SELECT
    c."id",
    COALESCE(jsonb_agg(elem ORDER BY ord) FILTER (
      WHERE (
        (elem->>'dimensionCode') IN ('color', 'color_family')
        OR EXISTS (
          SELECT 1
          FROM "app"."category_product_family" cf
          JOIN "app"."attribute_family_rule" r
            ON r."family_code" = cf."family_code"
           AND r."enabled" = true
          JOIN "app"."attribute_dimension" d ON d."id" = r."dimension_id"
          WHERE cf."category_number" = c."category_number"
            AND d."code" = elem->>'dimensionCode'
        )
      )
        AND COALESCE(BTRIM(LOWER(elem->>'dimensionCode')), '') NOT IN (
          'cadena', 'chain', 'store_chain', 'store_group',
          'buyer', 'comprador',
          'macro_dept', 'department', 'dept', 'company', 'empresa',
          'gender', 'genero', 'discount_type', 'tipo_de_descuento',
          'marca', 'brand'
        )
        AND COALESCE(BTRIM(LOWER(elem->>'dimensionLabel')), '') NOT IN (
          'cadena', 'buyer', 'comprador',
          'departamento macro', 'department', 'empresa',
          'gender', 'genero', 'tipo de descuento',
          'marca', 'brand'
        )
    ), '[]'::jsonb) AS next_mix
  FROM "app"."buyer_purchase_category_card" c
  CROSS JOIN LATERAL jsonb_array_elements(c."attribute_mix_json") WITH ORDINALITY AS value(elem, ord)
  WHERE jsonb_typeof(c."attribute_mix_json") = 'array'
  GROUP BY c."id"
)
UPDATE "app"."buyer_purchase_category_card" c
SET "attribute_mix_json" = filtered_attribute_mix.next_mix
FROM filtered_attribute_mix
WHERE c."id" = filtered_attribute_mix."id";
