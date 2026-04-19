-- Deprecated filename retained for compatibility.
-- Active migration spec lives at 011_womens_category_guardrails_and_perf.down.sql.

-- Migration 011 (DOWN)
-- Revert womens-category guardrails + targeted performance indexes

BEGIN TRANSACTION;

DROP VIEW IF EXISTS v_sku_category_guardrail_violations;

DROP TRIGGER IF EXISTS trg_skus_womens_category_guardrail_update_v011;
DROP TRIGGER IF EXISTS trg_skus_womens_category_guardrail_insert_v011;
DROP TRIGGER IF EXISTS trg_womens_shoe_categories_sync_delete_v011;
DROP TRIGGER IF EXISTS trg_womens_shoe_categories_sync_update_out_range_v011;
DROP TRIGGER IF EXISTS trg_womens_shoe_categories_sync_update_in_range_v011;
DROP TRIGGER IF EXISTS trg_womens_shoe_categories_sync_insert_v011;

DROP INDEX IF EXISTS idx_sales_transactions_sku_sold_at_v011;
DROP INDEX IF EXISTS idx_purchase_order_lines_sku_po_v011;
DROP INDEX IF EXISTS idx_inventory_sku_size_v011;
DROP INDEX IF EXISTS idx_skus_category_active_created_v011;
DROP INDEX IF EXISTS idx_womens_shoe_categories_dept_rics_v011;

DROP TABLE IF EXISTS womens_shoe_categories;

DELETE FROM schema_table_comments
WHERE table_name IN (
  'womens_shoe_categories',
  'v_sku_category_guardrail_violations'
);

COMMIT;

