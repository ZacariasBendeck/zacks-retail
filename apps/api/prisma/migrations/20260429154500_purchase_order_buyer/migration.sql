-- Preserve the RICS purchase_master buyer code on native purchase orders.
ALTER TABLE app.purchase_order
  ADD COLUMN IF NOT EXISTS buyer TEXT;

CREATE INDEX IF NOT EXISTS purchase_order_buyer_status_idx
  ON app.purchase_order (buyer, status);
