-- Speed up Sales History by Month aggregations by indexing only month slots
-- that actually contain sales activity. The table has one row per SKU/store
-- per rolling month slot, so most rows are zero-sales rows that reports should
-- skip before aggregation.
CREATE INDEX IF NOT EXISTS inventory_history_month_sales_activity_idx
  ON app.inventory_history_month (year_month, snapshot_id)
  WHERE qty_sales <> 0
     OR COALESCE(net_sales, 0) <> 0
     OR COALESCE(profit, 0) <> 0;
