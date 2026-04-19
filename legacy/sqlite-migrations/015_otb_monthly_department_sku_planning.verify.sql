-- Migration 015 verification queries
-- Run these in order:
-- 1) Apply 015_otb_monthly_department_sku_planning.up.sql
-- 2) Execute section A checks
-- 3) Apply 015_otb_monthly_department_sku_planning.down.sql
-- 4) Execute section B checks

-- --------------------------------------------------
-- A) Post-UP checks
-- --------------------------------------------------

-- A1: Core 015 table/view/trigger objects should exist.
SELECT name, type
FROM sqlite_master
WHERE (type = 'table' AND name = 'otb_monthly_department_sku_plan')
   OR (type = 'view' AND name = 'v_otb_monthly_department_sku_plan')
   OR (type = 'trigger' AND name IN (
     'trg_otb_monthly_sku_plan_size_alignment_insert_v015',
     'trg_otb_monthly_sku_plan_size_alignment_update_v015',
     'trg_otb_monthly_sku_plan_department_alignment_insert_v015',
     'trg_otb_monthly_sku_plan_department_alignment_update_v015',
     'trg_otb_monthly_sku_plan_category_guardrail_insert_v015',
     'trg_otb_monthly_sku_plan_category_guardrail_update_v015'
   ))
ORDER BY type, name;

-- A2: 015 table should expose foreign keys and indexes.
PRAGMA foreign_key_list('otb_monthly_department_sku_plan');
PRAGMA index_list('otb_monthly_department_sku_plan');

-- A3: Schema comments should be registered for table and read view.
SELECT table_name, comment
FROM schema_table_comments
WHERE table_name IN ('otb_monthly_department_sku_plan', 'v_otb_monthly_department_sku_plan')
ORDER BY table_name;

-- --------------------------------------------------
-- B) Post-DOWN checks
-- --------------------------------------------------

-- B1: 015 table/view/trigger objects should be gone.
SELECT name, type
FROM sqlite_master
WHERE (type = 'table' AND name = 'otb_monthly_department_sku_plan')
   OR (type = 'view' AND name = 'v_otb_monthly_department_sku_plan')
   OR (type = 'trigger' AND name LIKE 'trg_otb_monthly_sku_plan%_v015')
ORDER BY type, name;

-- B2: 015 index artifacts should be gone.
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_otb_monthly_sku_plan_budget_id_v015',
    'idx_otb_monthly_sku_plan_sku_id_v015',
    'idx_otb_monthly_sku_plan_sku_size_id_v015',
    'idx_otb_monthly_sku_plan_budget_updated_v015'
  )
ORDER BY name;

-- B3: 015 schema comments should be gone.
SELECT table_name
FROM schema_table_comments
WHERE table_name IN ('otb_monthly_department_sku_plan', 'v_otb_monthly_department_sku_plan')
ORDER BY table_name;
