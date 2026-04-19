-- Migration 013 verification queries
-- Run these in order:
-- 1) Apply 013_server_side_table_index_coverage.up.sql
-- 2) Execute section A checks
-- 3) Apply 013_server_side_table_index_coverage.down.sql
-- 4) Execute section B checks

-- --------------------------------------------------
-- A) Post-UP checks
-- --------------------------------------------------

-- A1: purchase_orders should expose new sort indexes.
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN ('idx_purchase_orders_created_at', 'idx_purchase_orders_updated_at')
ORDER BY name;

-- A2: otb_budgets should expose created/planned sort indexes.
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN ('idx_otb_budgets_created_at', 'idx_otb_budgets_planned_budget')
ORDER BY name;

-- A3: inventory_audit_log should expose composite per-SKU sort indexes.
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN ('idx_inventory_audit_log_sku_created_at', 'idx_inventory_audit_log_sku_adjustment')
ORDER BY name;

-- --------------------------------------------------
-- B) Post-DOWN checks
-- --------------------------------------------------

-- B1: All migration 013 indexes should be gone.
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_purchase_orders_created_at',
    'idx_purchase_orders_updated_at',
    'idx_otb_budgets_created_at',
    'idx_otb_budgets_planned_budget',
    'idx_inventory_audit_log_sku_created_at',
    'idx_inventory_audit_log_sku_adjustment'
  );
