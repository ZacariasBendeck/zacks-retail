CREATE TABLE IF NOT EXISTS app.import_inventory_true_up (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  invoice_line_id UUID NOT NULL,
  goods_in_transit_record_id UUID,
  purchase_order_id UUID,
  purchase_order_line_id UUID,
  po_receipt_line_id UUID,
  stock_movement_id UUID NOT NULL,
  sku_id UUID NOT NULL,
  store_id INTEGER NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  estimated_unit_cost_hnl DECIMAL(14,4) NOT NULL,
  final_unit_cost_hnl DECIMAL(14,4) NOT NULL,
  delta_unit_cost_hnl DECIMAL(14,4) NOT NULL,
  delta_hnl_amount DECIMAL(14,2) NOT NULL,
  posted_by TEXT NOT NULL,
  audit_reason TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_inventory_true_up_pkey PRIMARY KEY (id),
  CONSTRAINT import_inventory_true_up_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_inventory_true_up_invoice_line_id_fkey
    FOREIGN KEY (invoice_line_id) REFERENCES app.import_invoice_line(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_inventory_true_up_goods_in_transit_record_id_fkey
    FOREIGN KEY (goods_in_transit_record_id) REFERENCES app.goods_in_transit_record(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT import_inventory_true_up_purchase_order_id_fkey
    FOREIGN KEY (purchase_order_id) REFERENCES app.purchase_order(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT import_inventory_true_up_purchase_order_line_id_fkey
    FOREIGN KEY (purchase_order_line_id) REFERENCES app.purchase_order_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT import_inventory_true_up_po_receipt_line_id_fkey
    FOREIGN KEY (po_receipt_line_id) REFERENCES app.po_receipt_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT import_inventory_true_up_stock_movement_id_fkey
    FOREIGN KEY (stock_movement_id) REFERENCES app.stock_movement(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT import_inventory_true_up_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES app.sku(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT import_inventory_true_up_line_key UNIQUE (shipment_id, invoice_line_id),
  CONSTRAINT import_inventory_true_up_movement_key UNIQUE (stock_movement_id),
  CONSTRAINT import_inventory_true_up_quantity_check CHECK (quantity >= 0),
  CONSTRAINT import_inventory_true_up_cost_check CHECK (
    estimated_unit_cost_hnl >= 0
    AND final_unit_cost_hnl >= 0
  )
);

CREATE INDEX IF NOT EXISTS import_inventory_true_up_shipment_id_idx
  ON app.import_inventory_true_up (shipment_id);
CREATE INDEX IF NOT EXISTS import_inventory_true_up_invoice_line_id_idx
  ON app.import_inventory_true_up (invoice_line_id);
CREATE INDEX IF NOT EXISTS import_inventory_true_up_sku_store_idx
  ON app.import_inventory_true_up (sku_id, store_id);
