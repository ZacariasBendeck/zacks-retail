-- Color family is derived metadata, not an operator-edited SKU dropdown.
-- This table is the governed mapping from app.attribute_value(color) to
-- app.attribute_value(color_family). The derivation code validates it by
-- joining through app.attribute_dimension/app.attribute_value.

CREATE TABLE IF NOT EXISTS "app"."color_family_derivation_rule" (
  "color_value_code" TEXT PRIMARY KEY,
  "color_label" TEXT NOT NULL,
  "family_value_code" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_by" TEXT NOT NULL DEFAULT 'seed'
);

CREATE INDEX IF NOT EXISTS "color_family_derivation_rule_family_idx"
  ON "app"."color_family_derivation_rule"("family_value_code");
