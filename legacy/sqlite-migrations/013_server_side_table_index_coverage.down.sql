-- Migration 013 (DOWN)
-- Revert server-side table/list index coverage additions.

BEGIN TRANSACTION;

DROP INDEX IF EXISTS idx_inventory_audit_log_sku_adjustment;
DROP INDEX IF EXISTS idx_inventory_audit_log_sku_created_at;
DROP INDEX IF EXISTS idx_otb_budgets_planned_budget;
DROP INDEX IF EXISTS idx_otb_budgets_created_at;
DROP INDEX IF EXISTS idx_purchase_orders_updated_at;
DROP INDEX IF EXISTS idx_purchase_orders_created_at;

COMMIT;
