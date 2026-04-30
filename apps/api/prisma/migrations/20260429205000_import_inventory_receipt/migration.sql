CREATE TABLE IF NOT EXISTS app.import_inventory_receipt (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  invoice_line_id UUID NOT NULL,
  goods_in_transit_record_id UUID,
  stock_movement_id UUID NOT NULL,
  sku_id UUID NOT NULL,
  store_id INTEGER NOT NULL,
  receipt_basis VARCHAR(16) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_cost_hnl DECIMAL(14,4) NOT NULL,
  hnl_amount DECIMAL(14,2) NOT NULL,
  posted_by TEXT NOT NULL,
  audit_reason TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_inventory_receipt_pkey PRIMARY KEY (id),
  CONSTRAINT import_inventory_receipt_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_inventory_receipt_invoice_line_id_fkey
    FOREIGN KEY (invoice_line_id) REFERENCES app.import_invoice_line(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_inventory_receipt_goods_in_transit_record_id_fkey
    FOREIGN KEY (goods_in_transit_record_id) REFERENCES app.goods_in_transit_record(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT import_inventory_receipt_stock_movement_id_fkey
    FOREIGN KEY (stock_movement_id) REFERENCES app.stock_movement(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT import_inventory_receipt_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES app.sku(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT import_inventory_receipt_line_basis_key UNIQUE (shipment_id, invoice_line_id, receipt_basis),
  CONSTRAINT import_inventory_receipt_movement_key UNIQUE (stock_movement_id),
  CONSTRAINT import_inventory_receipt_basis_check CHECK (receipt_basis IN ('ESTIMATED', 'FINAL')),
  CONSTRAINT import_inventory_receipt_quantity_check CHECK (quantity >= 0),
  CONSTRAINT import_inventory_receipt_cost_check CHECK (unit_cost_hnl >= 0 AND hnl_amount >= 0)
);

CREATE INDEX IF NOT EXISTS import_inventory_receipt_shipment_basis_idx
  ON app.import_inventory_receipt (shipment_id, receipt_basis);
CREATE INDEX IF NOT EXISTS import_inventory_receipt_invoice_line_idx
  ON app.import_inventory_receipt (invoice_line_id);
CREATE INDEX IF NOT EXISTS import_inventory_receipt_sku_store_idx
  ON app.import_inventory_receipt (sku_id, store_id);

ALTER TABLE app.import_inventory_true_up
  ADD COLUMN IF NOT EXISTS import_inventory_receipt_id UUID;

ALTER TABLE app.import_inventory_true_up
  ADD CONSTRAINT import_inventory_true_up_import_inventory_receipt_id_fkey
  FOREIGN KEY (import_inventory_receipt_id) REFERENCES app.import_inventory_receipt(id)
  ON DELETE SET NULL ON UPDATE CASCADE;
