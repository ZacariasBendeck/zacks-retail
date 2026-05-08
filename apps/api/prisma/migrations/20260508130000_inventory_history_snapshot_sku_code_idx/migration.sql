CREATE INDEX IF NOT EXISTS inventory_history_snapshot_sku_code_idx
  ON app.inventory_history_snapshot (sku_code);
