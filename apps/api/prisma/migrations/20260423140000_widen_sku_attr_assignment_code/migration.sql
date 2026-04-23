-- Widen sku_attribute_assignment.sku_code so app-created SKUs in DRAFT state
-- can carry a dimensional assignment while the final RICS-compatible code
-- hasn't been assigned yet. Provisional codes follow the pattern
-- DRF-YYMMDD-XXXXXX (17 chars) which doesn't fit the original VARCHAR(15)
-- constraint inherited from RICS p. 154.
--
-- The widened column still accepts the 15-char RICS codes used by the keyword
-- seed path, so every existing row is valid as-is. Only max length grows.
--
-- The orphans view is DROP + re-CREATE because Postgres can't ALTER a column
-- type in-place while a view depends on it. Definition re-matches the spec
-- (docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md §2).

DROP VIEW IF EXISTS "app"."sku_attribute_orphans";

ALTER TABLE "app"."sku_attribute_assignment"
    ALTER COLUMN "sku_code" TYPE VARCHAR(32);

-- Bootstrap-safe: skipped on from-scratch boot when rics_mirror.inventory_master
-- doesn't yet exist. sync:rics drops rics_mirror CASCADE on every reload
-- (cascade-dropping this view), so leaving it absent on first boot is consistent
-- with the lifecycle. See sibling migration 20260422120000_app_sku_extended_attributes.
DO $mig$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'rics_mirror' AND table_name = 'inventory_master'
    ) THEN
        EXECUTE $v$
            CREATE VIEW "app"."sku_attribute_orphans" AS
                SELECT a."sku_code", COUNT(*)::INTEGER AS "assignment_count"
                FROM "app"."sku_attribute_assignment" a
                WHERE NOT EXISTS (
                    SELECT 1 FROM "rics_mirror"."inventory_master" im WHERE im."sku" = a."sku_code"
                )
                AND NOT EXISTS (
                    SELECT 1 FROM "app"."sku" s WHERE s."code" = a."sku_code" OR s."provisional_code" = a."sku_code"
                )
                GROUP BY a."sku_code"
        $v$;
    END IF;
END $mig$;
