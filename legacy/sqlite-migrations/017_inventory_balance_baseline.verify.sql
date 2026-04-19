-- Migration 017 verification queries
-- Run these in order:
-- 1) Apply 017_inventory_balance_baseline.up.sql
-- 2) Execute section A checks
-- 3) Apply 017_inventory_balance_baseline.down.sql
-- 4) Execute section B checks

-- --------------------------------------------------
-- A) Post-UP checks
-- --------------------------------------------------

-- A1: Migration 017 table should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'table'
  AND name = 'inventory_balances';

-- A2: Migration 017 indexes should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'ux_skus_sku_code_v017',
    'ux_inventory_balances_sku_size_key_v017',
    'idx_inventory_balances_sku_id_v017',
    'idx_inventory_balances_sku_size_id_v017',
    'idx_inventory_balances_category_macro_brand_style_color_size_v017',
    'idx_inventory_balances_category_macro_updated_id_v017'
  )
ORDER BY name;

-- A3: Migration 017 triggers should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'trigger'
  AND name IN (
    'trg_inventory_balances_size_alignment_insert_v017',
    'trg_inventory_balances_size_alignment_update_v017',
    'trg_inventory_balances_version_guard_v017',
    'trg_inventory_balances_touch_updated_at_v017'
  )
ORDER BY name;

-- A4: inventory_balances must expose required columns.
PRAGMA table_info('inventory_balances');

-- A5: Backfilled/inserted rows should remain within category and macro guardrails.
SELECT
  'A5_inventory_balance_guardrails' AS check_name,
  CASE WHEN violating_rows = 0 THEN 'PASS' ELSE 'FAIL' END AS check_result,
  violating_rows
FROM (
  SELECT COUNT(*) AS violating_rows
  FROM inventory_balances
  WHERE category NOT BETWEEN 556 AND 599
     OR macro_department NOT IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')
);

-- A6: schema_table_comments should include inventory_balances.
SELECT table_name
FROM schema_table_comments
WHERE table_name = 'inventory_balances';

-- A7: index catalog should include the two CTO baseline composite indexes.
PRAGMA index_list('inventory_balances');

-- --------------------------------------------------
-- B) Post-DOWN checks
-- --------------------------------------------------

-- B1: Migration 017 table should be removed.
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = 'inventory_balances';

-- B2: Migration 017 indexes should be removed.
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'ux_skus_sku_code_v017',
    'ux_inventory_balances_sku_size_key_v017',
    'idx_inventory_balances_sku_id_v017',
    'idx_inventory_balances_sku_size_id_v017',
    'idx_inventory_balances_category_macro_brand_style_color_size_v017',
    'idx_inventory_balances_category_macro_updated_id_v017'
  )
ORDER BY name;

-- B3: Migration 017 triggers should be removed.
SELECT name
FROM sqlite_master
WHERE type = 'trigger'
  AND name IN (
    'trg_inventory_balances_size_alignment_insert_v017',
    'trg_inventory_balances_size_alignment_update_v017',
    'trg_inventory_balances_version_guard_v017',
    'trg_inventory_balances_touch_updated_at_v017'
  )
ORDER BY name;

-- B4: schema_table_comments entry should be removed.
SELECT table_name
FROM schema_table_comments
WHERE table_name = 'inventory_balances';
