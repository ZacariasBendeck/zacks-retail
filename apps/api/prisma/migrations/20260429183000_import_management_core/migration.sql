-- Import Management module: app-owned shipment, goods-in-transit, and landed-cost core.
-- This is international import operations, not RICS/customer CSV importing.

CREATE TABLE IF NOT EXISTS app.import_shipment (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_number VARCHAR(64) NOT NULL,
  display_name TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  buyer TEXT,
  origin_port TEXT,
  destination_port TEXT,
  carrier TEXT,
  freight_forwarder TEXT,
  customs_policy_number TEXT,
  bl_number TEXT,
  expected_departure_at DATE,
  expected_arrival_at DATE,
  actual_arrival_at DATE,
  base_currency VARCHAR(3) NOT NULL DEFAULT 'HNL',
  source_workbook_name TEXT,
  notes TEXT,
  approved_estimate_at TIMESTAMPTZ,
  approved_estimate_by TEXT,
  final_liquidation_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_shipment_pkey PRIMARY KEY (id),
  CONSTRAINT import_shipment_number_key UNIQUE (shipment_number),
  CONSTRAINT import_shipment_status_check CHECK (
    status IN (
      'DRAFT',
      'REVIEWING_COSTS',
      'APPROVED_ESTIMATE',
      'IN_TRANSIT',
      'RECEIVING_ESTIMATED',
      'FINAL_LIQUIDATION',
      'RECEIVED_FINAL',
      'CLOSED',
      'CANCELLED'
    )
  ),
  CONSTRAINT import_shipment_base_currency_check CHECK (base_currency = 'HNL')
);

CREATE INDEX IF NOT EXISTS import_shipment_status_arrival_idx
  ON app.import_shipment (status, expected_arrival_at);
CREATE INDEX IF NOT EXISTS import_shipment_buyer_status_idx
  ON app.import_shipment (buyer, status);

CREATE TABLE IF NOT EXISTS app.import_container (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  container_number TEXT,
  container_type VARCHAR(24) NOT NULL DEFAULT 'CONTAINER',
  seal_number TEXT,
  cargo_group TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'PLANNED',
  expected_arrival_at DATE,
  actual_arrival_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_container_pkey PRIMARY KEY (id),
  CONSTRAINT import_container_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_container_type_check CHECK (container_type IN ('CONTAINER', 'LOOSE_CARGO', 'CARTON_GROUP')),
  CONSTRAINT import_container_status_check CHECK (status IN ('PLANNED', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS import_container_shipment_id_idx
  ON app.import_container (shipment_id);

CREATE TABLE IF NOT EXISTS app.import_supplier_invoice (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  invoice_number TEXT NOT NULL,
  supplier_code VARCHAR(16),
  supplier_name TEXT NOT NULL,
  invoice_date DATE,
  invoice_group VARCHAR(24) NOT NULL DEFAULT 'TAXABLE',
  invoice_kind VARCHAR(24) NOT NULL DEFAULT 'MERCHANDISE',
  source_amount DECIMAL(14,4) NOT NULL,
  source_currency VARCHAR(3) NOT NULL,
  fx_rate DECIMAL(18,8) NOT NULL,
  fx_date DATE NOT NULL,
  hnl_amount DECIMAL(14,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_supplier_invoice_pkey PRIMARY KEY (id),
  CONSTRAINT import_supplier_invoice_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_supplier_invoice_group_check CHECK (invoice_group IN ('TAXABLE', 'NON_TAXABLE', 'MIXED')),
  CONSTRAINT import_supplier_invoice_kind_check CHECK (invoice_kind IN ('MERCHANDISE', 'FABRIC', 'CMT', 'ACCESSORY', 'OTHER')),
  CONSTRAINT import_supplier_invoice_currency_check CHECK (source_currency IN ('CNY', 'USD', 'HNL')),
  CONSTRAINT import_supplier_invoice_amount_check CHECK (source_amount >= 0 AND fx_rate > 0 AND hnl_amount >= 0)
);

CREATE INDEX IF NOT EXISTS import_supplier_invoice_shipment_id_idx
  ON app.import_supplier_invoice (shipment_id);
CREATE INDEX IF NOT EXISTS import_supplier_invoice_supplier_code_idx
  ON app.import_supplier_invoice (supplier_code);

CREATE TABLE IF NOT EXISTS app.import_invoice_line (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL,
  sku_id UUID,
  purchase_order_line_id UUID,
  line_number INTEGER NOT NULL,
  item_code TEXT,
  style_code TEXT,
  description TEXT,
  material_meters DECIMAL(12,3),
  carton_count DECIMAL(12,3),
  weight_kg DECIMAL(12,3),
  volume_cbm DECIMAL(12,3),
  quantity DECIMAL(12,3) NOT NULL,
  unit_of_measure VARCHAR(16) NOT NULL DEFAULT 'UNIT',
  source_unit_cost DECIMAL(14,4),
  source_amount DECIMAL(14,4) NOT NULL,
  source_currency VARCHAR(3) NOT NULL,
  fx_rate DECIMAL(18,8) NOT NULL,
  fx_date DATE NOT NULL,
  hnl_amount DECIMAL(14,2) NOT NULL,
  base_unit_cost_hnl DECIMAL(14,4) NOT NULL,
  allocated_landed_cost_hnl DECIMAL(14,2) NOT NULL DEFAULT 0,
  landed_unit_cost_hnl DECIMAL(14,4),
  taxable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_invoice_line_pkey PRIMARY KEY (id),
  CONSTRAINT import_invoice_line_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES app.import_supplier_invoice(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_invoice_line_number_key UNIQUE (invoice_id, line_number),
  CONSTRAINT import_invoice_line_currency_check CHECK (source_currency IN ('CNY', 'USD', 'HNL')),
  CONSTRAINT import_invoice_line_amount_check CHECK (
    quantity > 0
    AND source_amount >= 0
    AND fx_rate > 0
    AND hnl_amount >= 0
    AND base_unit_cost_hnl >= 0
    AND allocated_landed_cost_hnl >= 0
  )
);

CREATE INDEX IF NOT EXISTS import_invoice_line_invoice_id_idx
  ON app.import_invoice_line (invoice_id);
CREATE INDEX IF NOT EXISTS import_invoice_line_sku_id_idx
  ON app.import_invoice_line (sku_id);
CREATE INDEX IF NOT EXISTS import_invoice_line_po_line_id_idx
  ON app.import_invoice_line (purchase_order_line_id);

CREATE TABLE IF NOT EXISTS app.import_charge (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  charge_type VARCHAR(32) NOT NULL,
  counterparty TEXT,
  document_number TEXT,
  source_amount DECIMAL(14,4) NOT NULL,
  source_currency VARCHAR(3) NOT NULL,
  fx_rate DECIMAL(18,8) NOT NULL,
  fx_date DATE NOT NULL,
  hnl_amount DECIMAL(14,2) NOT NULL,
  allocation_basis VARCHAR(32) NOT NULL DEFAULT 'PRODUCT_COST_SHARE',
  taxable BOOLEAN NOT NULL DEFAULT false,
  estimated BOOLEAN NOT NULL DEFAULT true,
  final BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_charge_pkey PRIMARY KEY (id),
  CONSTRAINT import_charge_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_charge_type_check CHECK (
    charge_type IN ('FREIGHT', 'INSURANCE', 'DUTY', 'TAX', 'CUSTOMS_AGENCY', 'LOCAL_FREIGHT', 'OTHER')
  ),
  CONSTRAINT import_charge_currency_check CHECK (source_currency IN ('CNY', 'USD', 'HNL')),
  CONSTRAINT import_charge_allocation_basis_check CHECK (allocation_basis = 'PRODUCT_COST_SHARE'),
  CONSTRAINT import_charge_amount_check CHECK (source_amount >= 0 AND fx_rate > 0 AND hnl_amount >= 0)
);

CREATE INDEX IF NOT EXISTS import_charge_shipment_id_idx
  ON app.import_charge (shipment_id);

CREATE TABLE IF NOT EXISTS app.import_landed_cost_allocation (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  charge_id UUID NOT NULL,
  invoice_line_id UUID NOT NULL,
  allocation_basis VARCHAR(32) NOT NULL DEFAULT 'PRODUCT_COST_SHARE',
  allocated_hnl_amount DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_landed_cost_allocation_pkey PRIMARY KEY (id),
  CONSTRAINT import_landed_cost_allocation_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_landed_cost_allocation_charge_id_fkey
    FOREIGN KEY (charge_id) REFERENCES app.import_charge(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_landed_cost_allocation_invoice_line_id_fkey
    FOREIGN KEY (invoice_line_id) REFERENCES app.import_invoice_line(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_landed_cost_allocation_key UNIQUE (charge_id, invoice_line_id),
  CONSTRAINT import_landed_cost_allocation_basis_check CHECK (allocation_basis = 'PRODUCT_COST_SHARE'),
  CONSTRAINT import_landed_cost_allocation_amount_check CHECK (allocated_hnl_amount >= 0)
);

CREATE INDEX IF NOT EXISTS import_landed_cost_allocation_shipment_id_idx
  ON app.import_landed_cost_allocation (shipment_id);
CREATE INDEX IF NOT EXISTS import_landed_cost_allocation_invoice_line_id_idx
  ON app.import_landed_cost_allocation (invoice_line_id);

CREATE TABLE IF NOT EXISTS app.goods_in_transit_record (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  container_id UUID,
  invoice_line_id UUID,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  ownership_transfer_at DATE,
  expected_receipt_at DATE,
  received_at DATE,
  quantity_in_transit DECIMAL(12,3),
  audit_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT goods_in_transit_record_pkey PRIMARY KEY (id),
  CONSTRAINT goods_in_transit_record_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT goods_in_transit_record_container_id_fkey
    FOREIGN KEY (container_id) REFERENCES app.import_container(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT goods_in_transit_record_invoice_line_id_fkey
    FOREIGN KEY (invoice_line_id) REFERENCES app.import_invoice_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT goods_in_transit_record_status_check CHECK (
    status IN ('PENDING', 'OWNED', 'IN_TRANSIT', 'RECEIVING_ESTIMATED', 'RECEIVED_FINAL', 'CLOSED', 'CANCELLED')
  ),
  CONSTRAINT goods_in_transit_record_quantity_check CHECK (quantity_in_transit IS NULL OR quantity_in_transit >= 0)
);

CREATE INDEX IF NOT EXISTS goods_in_transit_shipment_status_idx
  ON app.goods_in_transit_record (shipment_id, status);
CREATE INDEX IF NOT EXISTS goods_in_transit_container_id_idx
  ON app.goods_in_transit_record (container_id);
CREATE INDEX IF NOT EXISTS goods_in_transit_invoice_line_id_idx
  ON app.goods_in_transit_record (invoice_line_id);

CREATE TABLE IF NOT EXISTS app.import_verification_check (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  check_code VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  expected_hnl_amount DECIMAL(14,2),
  actual_hnl_amount DECIMAL(14,2),
  variance_hnl_amount DECIMAL(14,2),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_verification_check_pkey PRIMARY KEY (id),
  CONSTRAINT import_verification_check_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_verification_check_key UNIQUE (shipment_id, check_code),
  CONSTRAINT import_verification_check_status_check CHECK (status IN ('PENDING', 'PASS', 'WARN', 'FAIL'))
);

CREATE INDEX IF NOT EXISTS import_verification_check_shipment_status_idx
  ON app.import_verification_check (shipment_id, status);

CREATE TABLE IF NOT EXISTS app.import_suggested_price (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  invoice_line_id UUID NOT NULL,
  sku_id UUID,
  landed_unit_cost_hnl DECIMAL(14,4) NOT NULL,
  markup_factor DECIMAL(8,4) NOT NULL DEFAULT 2.5,
  suggested_retail_hnl DECIMAL(14,2) NOT NULL,
  approval_status VARCHAR(24) NOT NULL DEFAULT 'SUGGESTED',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_suggested_price_pkey PRIMARY KEY (id),
  CONSTRAINT import_suggested_price_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_suggested_price_invoice_line_id_fkey
    FOREIGN KEY (invoice_line_id) REFERENCES app.import_invoice_line(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_suggested_price_line_key UNIQUE (shipment_id, invoice_line_id),
  CONSTRAINT import_suggested_price_status_check CHECK (approval_status IN ('SUGGESTED', 'APPROVED', 'REJECTED', 'POSTED')),
  CONSTRAINT import_suggested_price_amount_check CHECK (
    landed_unit_cost_hnl >= 0
    AND markup_factor > 0
    AND suggested_retail_hnl >= 0
  )
);

CREATE INDEX IF NOT EXISTS import_suggested_price_shipment_status_idx
  ON app.import_suggested_price (shipment_id, approval_status);
CREATE INDEX IF NOT EXISTS import_suggested_price_sku_id_idx
  ON app.import_suggested_price (sku_id);
