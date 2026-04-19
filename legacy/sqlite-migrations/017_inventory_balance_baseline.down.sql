-- Migration 017 (DOWN)
-- Revert inventory balance baseline objects.

BEGIN TRANSACTION;

DROP TRIGGER IF EXISTS trg_inventory_balances_touch_updated_at_v017;
DROP TRIGGER IF EXISTS trg_inventory_balances_version_guard_v017;
DROP TRIGGER IF EXISTS trg_inventory_balances_size_alignment_update_v017;
DROP TRIGGER IF EXISTS trg_inventory_balances_size_alignment_insert_v017;

DROP INDEX IF EXISTS idx_inventory_balances_category_macro_updated_id_v017;
DROP INDEX IF EXISTS idx_inventory_balances_category_macro_brand_style_color_size_v017;
DROP INDEX IF EXISTS idx_inventory_balances_sku_size_id_v017;
DROP INDEX IF EXISTS idx_inventory_balances_sku_id_v017;
DROP INDEX IF EXISTS ux_inventory_balances_sku_size_key_v017;
DROP INDEX IF EXISTS ux_skus_sku_code_v017;

DROP TABLE IF EXISTS inventory_balances;

DELETE FROM schema_table_comments
WHERE table_name IN ('inventory_balances');

COMMIT;
