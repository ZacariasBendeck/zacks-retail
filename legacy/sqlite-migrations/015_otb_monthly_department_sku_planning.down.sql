-- Migration 015 (DOWN)
-- Revert OTB month/department/SKU(size) financial planning schema

BEGIN TRANSACTION;

DROP VIEW IF EXISTS v_otb_monthly_department_sku_plan;

DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_category_guardrail_update_v015;
DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_category_guardrail_insert_v015;
DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_department_alignment_update_v015;
DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_department_alignment_insert_v015;
DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_size_alignment_update_v015;
DROP TRIGGER IF EXISTS trg_otb_monthly_sku_plan_size_alignment_insert_v015;

DROP INDEX IF EXISTS idx_otb_monthly_sku_plan_budget_updated_v015;
DROP INDEX IF EXISTS idx_otb_monthly_sku_plan_sku_size_id_v015;
DROP INDEX IF EXISTS idx_otb_monthly_sku_plan_sku_id_v015;
DROP INDEX IF EXISTS idx_otb_monthly_sku_plan_budget_id_v015;

DROP TABLE IF EXISTS otb_monthly_department_sku_plan;

DELETE FROM schema_table_comments
WHERE table_name IN (
  'otb_monthly_department_sku_plan',
  'v_otb_monthly_department_sku_plan'
);

COMMIT;
