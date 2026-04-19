-- Migration 014 verification queries
-- Run these in order:
-- 1) Apply 014_sales_ledger_otb_lines.up.sql
-- 2) Execute section A checks
-- 3) Apply 014_sales_ledger_otb_lines.down.sql
-- 4) Execute section B checks

-- --------------------------------------------------
-- A) Post-UP checks
-- --------------------------------------------------

-- A1: Sales ledger date-first index should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'index'
  AND name = 'idx_sales_transactions_sold_at_sku';

-- A2: OTB SKU plan lines table should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'table'
  AND name = 'otb_sku_plan_lines';

-- A3: OTB SKU plan lines should expose both foreign keys and indexes.
PRAGMA foreign_key_list('otb_sku_plan_lines');
PRAGMA index_list('otb_sku_plan_lines');

-- A4: OTB SKU lines view should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'view'
  AND name = 'v_otb_sku_lines';

-- A5: View should be queryable.
SELECT COUNT(*) AS row_count
FROM v_otb_sku_lines;

-- --------------------------------------------------
-- B) Post-DOWN checks
-- --------------------------------------------------

-- B1: Migration 014 table and view should be gone.
SELECT name, type
FROM sqlite_master
WHERE (type = 'table' AND name = 'otb_sku_plan_lines')
   OR (type = 'view' AND name = 'v_otb_sku_lines')
ORDER BY type, name;

-- B2: Migration 014 sales index should be gone.
SELECT name, type
FROM sqlite_master
WHERE type = 'index'
  AND name = 'idx_sales_transactions_sold_at_sku';
