-- Migration 013 (UP)
-- Add index coverage for server-side table/list sorting and filtering paths.
--
-- Non-obvious design decisions:
-- 1) Keep this migration index-only to stay reversible and low risk for production rollout.
-- 2) Use composite indexes for inventory_audit_log so per-SKU timelines can satisfy
--    WHERE + ORDER BY with one index walk instead of sort-on-temp.

BEGIN TRANSACTION;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at
  ON purchase_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_updated_at
  ON purchase_orders(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_otb_budgets_created_at
  ON otb_budgets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otb_budgets_planned_budget
  ON otb_budgets(planned_budget);

CREATE INDEX IF NOT EXISTS idx_inventory_audit_log_sku_created_at
  ON inventory_audit_log(sku_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_log_sku_adjustment
  ON inventory_audit_log(sku_id, adjustment);

COMMIT;
