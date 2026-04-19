-- Migration 011 verification queries
-- Run these in order:
-- 1) Apply 011_womens_category_guardrails_and_perf.up.sql
-- 2) Execute section A checks
-- 3) Apply 011_womens_category_guardrails_and_perf.down.sql
-- 4) Execute section B checks

-- --------------------------------------------------
-- A) Post-UP checks
-- --------------------------------------------------

-- A1: 011 guardrail objects should exist.
SELECT name, type
FROM sqlite_master
WHERE (type = 'table' AND name = 'womens_shoe_categories')
   OR (type = 'view' AND name = 'v_sku_category_guardrail_violations')
   OR (type = 'trigger' AND name IN (
     'trg_womens_shoe_categories_sync_insert_v011',
     'trg_womens_shoe_categories_sync_update_in_range_v011',
     'trg_womens_shoe_categories_sync_update_out_range_v011',
     'trg_womens_shoe_categories_sync_delete_v011',
     'trg_skus_womens_category_guardrail_insert_v011',
     'trg_skus_womens_category_guardrail_update_v011'
   ))
ORDER BY type, name;

-- A2: Womens subset integrity should be PASS and remain bounded to 556-599.
SELECT
  'A2_womens_subset_integrity' AS check_name,
  CASE WHEN out_of_range_rows = 0 THEN 'PASS' ELSE 'FAIL' END AS check_result,
  total_subset_rows,
  min_rics_code,
  max_rics_code,
  out_of_range_rows
FROM (
  SELECT
    COUNT(*) AS total_subset_rows,
    MIN(rics_code) AS min_rics_code,
    MAX(rics_code) AS max_rics_code,
    SUM(CASE WHEN rics_code < 556 OR rics_code > 599 THEN 1 ELSE 0 END) AS out_of_range_rows
  FROM womens_shoe_categories
);

-- A3: SKU policy check must report PASS once remediation is complete.
SELECT
  'A3_sku_guardrail_status' AS check_name,
  CASE WHEN violating_skus = 0 THEN 'PASS' ELSE 'FAIL' END AS check_result,
  violating_skus
FROM (
  SELECT COUNT(*) AS violating_skus
  FROM v_sku_category_guardrail_violations
);

-- A4: Remediation detail query for out-of-policy SKUs (expect zero rows after cleanup).
SELECT
  id,
  sku_code,
  category_id,
  rics_code,
  category_name,
  dept_macro,
  department,
  active,
  updated_at
FROM v_sku_category_guardrail_violations
ORDER BY updated_at DESC, sku_code;

-- A5: Guardrail design check - migration 011 must not globally restrict ref_categories.
SELECT name
FROM sqlite_master
WHERE type = 'trigger'
  AND name IN (
    'trg_ref_categories_rics_range_insert_v011',
    'trg_ref_categories_rics_range_update_v011'
  );

-- A6: Index coverage for touched catalog/inventory/reporting paths.
PRAGMA index_list('womens_shoe_categories');
PRAGMA index_list('skus');
PRAGMA index_list('inventory');
PRAGMA index_list('purchase_order_lines');
PRAGMA index_list('sales_transactions');

-- A7: Manual expected-failure check (execute manually; should fail)
-- INSERT INTO skus (id, sku_code, style, price, category_id, department, vendor_id, active)
-- VALUES (
--   'sku-guardrail-test',
--   'SKU-GUARDRAIL-TEST',
--   'Guardrail Test',
--   10,
--   (SELECT id FROM ref_categories WHERE rics_code NOT BETWEEN 556 AND 599 LIMIT 1),
--   'CASUAL',
--   (SELECT id FROM vendors LIMIT 1),
--   1
-- );

-- --------------------------------------------------
-- B) Post-DOWN checks
-- --------------------------------------------------

-- B1: 011 guardrail objects should be gone.
SELECT name, type
FROM sqlite_master
WHERE (type = 'table' AND name = 'womens_shoe_categories')
   OR (type = 'view' AND name = 'v_sku_category_guardrail_violations')
   OR (type = 'trigger' AND name LIKE '%_v011' AND name LIKE '%womens%')
ORDER BY type, name;

-- B2: 011 index artifacts should be gone.
SELECT name, type
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_womens_shoe_categories_dept_rics_v011',
    'idx_skus_category_active_created_v011',
    'idx_inventory_sku_size_v011',
    'idx_purchase_order_lines_sku_po_v011',
    'idx_sales_transactions_sku_sold_at_v011'
  )
ORDER BY name;
