-- Proforma landed-cost build support.
-- Extends Import Management so fabric-by-meter, CMT/conversion labor, and
-- other non-receiptable components can roll into receiptable finished SKUs.

ALTER TABLE app.import_invoice_line
  ADD COLUMN IF NOT EXISTS cost_role VARCHAR(32) NOT NULL DEFAULT 'FINISHED_GOOD',
  ADD COLUMN IF NOT EXISTS receipt_policy VARCHAR(32) NOT NULL DEFAULT 'RECEIVE_TO_STOCK',
  ADD COLUMN IF NOT EXISTS allocation_group_key TEXT,
  ADD COLUMN IF NOT EXISTS component_allocated_cost_hnl DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commercial_unit_cost_hnl DECIMAL(14,4);

UPDATE app.import_invoice_line
SET commercial_unit_cost_hnl = COALESCE(commercial_unit_cost_hnl, base_unit_cost_hnl)
WHERE commercial_unit_cost_hnl IS NULL;

ALTER TABLE app.import_invoice_line
  DROP CONSTRAINT IF EXISTS import_invoice_line_cost_role_check,
  ADD CONSTRAINT import_invoice_line_cost_role_check
    CHECK (cost_role IN (
      'FINISHED_GOOD',
      'MATERIAL',
      'CONVERSION',
      'ACCESSORY_COMPONENT',
      'RECEIPT_ACCESSORY',
      'EXPENSE'
    )),
  DROP CONSTRAINT IF EXISTS import_invoice_line_receipt_policy_check,
  ADD CONSTRAINT import_invoice_line_receipt_policy_check
    CHECK (receipt_policy IN (
      'RECEIVE_TO_STOCK',
      'ROLL_TO_OUTPUT',
      'EXPENSE_ONLY',
      'IGNORE'
    )),
  DROP CONSTRAINT IF EXISTS import_invoice_line_component_cost_check,
  ADD CONSTRAINT import_invoice_line_component_cost_check
    CHECK (
      component_allocated_cost_hnl >= 0
      AND (commercial_unit_cost_hnl IS NULL OR commercial_unit_cost_hnl >= 0)
    );

CREATE INDEX IF NOT EXISTS import_invoice_line_cost_role_idx
  ON app.import_invoice_line (cost_role, receipt_policy);

CREATE INDEX IF NOT EXISTS import_invoice_line_group_key_idx
  ON app.import_invoice_line (allocation_group_key);

CREATE TABLE IF NOT EXISTS app.import_cost_build (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  build_code VARCHAR(96) NOT NULL,
  description TEXT,
  output_invoice_line_id UUID,
  output_shipment_line_id UUID,
  output_sku_id UUID,
  output_quantity DECIMAL(12,3) NOT NULL,
  allocation_basis VARCHAR(32) NOT NULL DEFAULT 'OUTPUT_QUANTITY',
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_cost_build_pkey PRIMARY KEY (id),
  CONSTRAINT import_cost_build_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_cost_build_output_invoice_line_id_fkey
    FOREIGN KEY (output_invoice_line_id) REFERENCES app.import_invoice_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT import_cost_build_output_shipment_line_id_fkey
    FOREIGN KEY (output_shipment_line_id) REFERENCES app.import_shipment_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT import_cost_build_output_sku_id_fkey
    FOREIGN KEY (output_sku_id) REFERENCES app.sku(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT import_cost_build_key UNIQUE (shipment_id, build_code),
  CONSTRAINT import_cost_build_output_check CHECK (
    output_invoice_line_id IS NOT NULL OR output_shipment_line_id IS NOT NULL
  ),
  CONSTRAINT import_cost_build_quantity_check CHECK (output_quantity > 0),
  CONSTRAINT import_cost_build_basis_check CHECK (
    allocation_basis IN ('OUTPUT_QUANTITY', 'OUTPUT_VALUE_SHARE', 'MANUAL_SHARE', 'METER_USAGE')
  )
);

CREATE INDEX IF NOT EXISTS import_cost_build_shipment_idx
  ON app.import_cost_build (shipment_id);

CREATE INDEX IF NOT EXISTS import_cost_build_output_invoice_line_idx
  ON app.import_cost_build (output_invoice_line_id);

CREATE INDEX IF NOT EXISTS import_cost_build_output_shipment_line_idx
  ON app.import_cost_build (output_shipment_line_id);

CREATE TABLE IF NOT EXISTS app.import_cost_component_allocation (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  build_id UUID NOT NULL,
  component_invoice_line_id UUID NOT NULL,
  output_invoice_line_id UUID,
  output_shipment_line_id UUID,
  allocation_basis VARCHAR(32) NOT NULL,
  allocated_hnl_amount DECIMAL(14,2) NOT NULL,
  allocated_quantity DECIMAL(12,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_cost_component_allocation_pkey PRIMARY KEY (id),
  CONSTRAINT import_component_allocation_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_component_allocation_build_id_fkey
    FOREIGN KEY (build_id) REFERENCES app.import_cost_build(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_component_allocation_component_line_id_fkey
    FOREIGN KEY (component_invoice_line_id) REFERENCES app.import_invoice_line(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_component_allocation_output_invoice_line_id_fkey
    FOREIGN KEY (output_invoice_line_id) REFERENCES app.import_invoice_line(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_component_allocation_output_shipment_line_id_fkey
    FOREIGN KEY (output_shipment_line_id) REFERENCES app.import_shipment_line(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_component_allocation_target_check CHECK (
    (output_invoice_line_id IS NOT NULL AND output_shipment_line_id IS NULL)
    OR (output_invoice_line_id IS NULL AND output_shipment_line_id IS NOT NULL)
  ),
  CONSTRAINT import_component_allocation_amount_check CHECK (allocated_hnl_amount >= 0)
);

CREATE INDEX IF NOT EXISTS import_component_allocation_shipment_idx
  ON app.import_cost_component_allocation (shipment_id);

CREATE INDEX IF NOT EXISTS import_component_allocation_build_idx
  ON app.import_cost_component_allocation (build_id);

CREATE INDEX IF NOT EXISTS import_component_allocation_component_idx
  ON app.import_cost_component_allocation (component_invoice_line_id);

ALTER TABLE app.po_receipt_line
  ADD COLUMN IF NOT EXISTS import_shipment_id UUID,
  ADD COLUMN IF NOT EXISTS import_invoice_line_id UUID,
  ADD COLUMN IF NOT EXISTS import_shipment_line_id UUID,
  ADD COLUMN IF NOT EXISTS landed_cost_basis VARCHAR(16),
  ADD COLUMN IF NOT EXISTS commercial_unit_cost_hnl DECIMAL(14,4),
  ADD COLUMN IF NOT EXISTS allocated_landed_cost_hnl DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS landed_unit_cost_hnl DECIMAL(14,4);

ALTER TABLE app.po_receipt_line
  DROP CONSTRAINT IF EXISTS po_receipt_line_import_shipment_id_fkey,
  ADD CONSTRAINT po_receipt_line_import_shipment_id_fkey
    FOREIGN KEY (import_shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS po_receipt_line_import_invoice_line_id_fkey,
  ADD CONSTRAINT po_receipt_line_import_invoice_line_id_fkey
    FOREIGN KEY (import_invoice_line_id) REFERENCES app.import_invoice_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS po_receipt_line_import_shipment_line_id_fkey,
  ADD CONSTRAINT po_receipt_line_import_shipment_line_id_fkey
    FOREIGN KEY (import_shipment_line_id) REFERENCES app.import_shipment_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS po_receipt_line_landed_cost_basis_check,
  ADD CONSTRAINT po_receipt_line_landed_cost_basis_check
    CHECK (landed_cost_basis IS NULL OR landed_cost_basis IN ('ESTIMATED', 'FINAL'));

CREATE INDEX IF NOT EXISTS po_receipt_line_import_ref_idx
  ON app.po_receipt_line (import_shipment_id, import_invoice_line_id);

CREATE TABLE IF NOT EXISTS app.stock_cost_event (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  stock_movement_id UUID,
  store_id INTEGER NOT NULL,
  sku_id UUID NOT NULL,
  quantity_delta DECIMAL(12,3) NOT NULL,
  value_delta_hnl DECIMAL(14,2) NOT NULL,
  unit_cost_hnl DECIMAL(14,4),
  valuation_basis VARCHAR(24) NOT NULL,
  source_document_type VARCHAR(64) NOT NULL,
  source_document_id TEXT NOT NULL,
  posted_by TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key TEXT,

  CONSTRAINT stock_cost_event_pkey PRIMARY KEY (id),
  CONSTRAINT stock_cost_event_stock_movement_id_fkey
    FOREIGN KEY (stock_movement_id) REFERENCES app.stock_movement(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT stock_cost_event_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES app.sku(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT stock_cost_event_basis_check CHECK (
    valuation_basis IN ('DOMESTIC_RECEIPT', 'IMPORT_ESTIMATED', 'IMPORT_FINAL', 'IMPORT_TRUE_UP', 'MANUAL')
  ),
  CONSTRAINT stock_cost_event_idempotency_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS stock_cost_event_sku_store_idx
  ON app.stock_cost_event (sku_id, store_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS app.stock_cost_balance (
  store_id INTEGER NOT NULL,
  sku_id UUID NOT NULL,
  quantity_on_hand DECIMAL(12,3) NOT NULL DEFAULT 0,
  inventory_value_hnl DECIMAL(14,2) NOT NULL DEFAULT 0,
  average_unit_cost_hnl DECIMAL(14,4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT stock_cost_balance_pkey PRIMARY KEY (store_id, sku_id),
  CONSTRAINT stock_cost_balance_sku_id_fkey
    FOREIGN KEY (sku_id) REFERENCES app.sku(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS stock_cost_balance_sku_idx
  ON app.stock_cost_balance (sku_id);
