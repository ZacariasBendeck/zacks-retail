-- Generic macro-attribute derivation rules.
--
-- A rule maps one value from a source dimension into one value on a target
-- macro dimension. Example:
--
--   color:Negro -> color_family:black
--
-- Codes are stored instead of IDs so rule rows survive catalog value reorders
-- and remain readable in audit/debug SQL. The products service validates that
-- dimensions and values exist and belong together before writing.

CREATE TABLE IF NOT EXISTS "app"."attribute_derivation_rule" (
  "source_dimension_code" TEXT NOT NULL,
  "source_value_code" TEXT NOT NULL,
  "target_dimension_code" TEXT NOT NULL,
  "target_value_code" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_by" TEXT NOT NULL DEFAULT 'seed',
  PRIMARY KEY ("source_dimension_code", "source_value_code", "target_dimension_code")
);

CREATE INDEX IF NOT EXISTS "attribute_derivation_rule_source_idx"
  ON "app"."attribute_derivation_rule"("source_dimension_code", "target_dimension_code");

CREATE INDEX IF NOT EXISTS "attribute_derivation_rule_target_idx"
  ON "app"."attribute_derivation_rule"("target_dimension_code", "target_value_code");

DO $$
BEGIN
  IF to_regclass('app.color_family_derivation_rule') IS NOT NULL THEN
    INSERT INTO "app"."attribute_derivation_rule" (
      "source_dimension_code",
      "source_value_code",
      "target_dimension_code",
      "target_value_code",
      "updated_at",
      "updated_by"
    )
    SELECT
      'color',
      "color_value_code",
      'color_family',
      "family_value_code",
      "updated_at",
      "updated_by"
    FROM "app"."color_family_derivation_rule"
    ON CONFLICT ("source_dimension_code", "source_value_code", "target_dimension_code")
    DO UPDATE SET
      "target_value_code" = EXCLUDED."target_value_code",
      "updated_at" = EXCLUDED."updated_at",
      "updated_by" = EXCLUDED."updated_by";
  END IF;
END $$;
