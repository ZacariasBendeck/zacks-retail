-- PO-first Import Management planning.
-- Existing POs are preserved as landed-HNL legacy records; new import POs can
-- carry supplier currency while Import Management owns estimated/final landed cost.

ALTER TABLE app.purchase_order
  ADD COLUMN IF NOT EXISTS source_currency VARCHAR(3) NOT NULL DEFAULT 'HNL',
  ADD COLUMN IF NOT EXISTS fx_rate DECIMAL(18,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fx_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS incoterm_code VARCHAR(8),
  ADD COLUMN IF NOT EXISTS incoterm_place TEXT,
  ADD COLUMN IF NOT EXISTS cost_basis VARCHAR(40) NOT NULL DEFAULT 'LANDED_LEGACY_HNL';

ALTER TABLE app.purchase_order
  DROP CONSTRAINT IF EXISTS purchase_order_source_currency_check,
  ADD CONSTRAINT purchase_order_source_currency_check
    CHECK (source_currency IN ('CNY', 'USD', 'HNL')),
  DROP CONSTRAINT IF EXISTS purchase_order_fx_rate_check,
  ADD CONSTRAINT purchase_order_fx_rate_check
    CHECK (fx_rate > 0 AND (source_currency <> 'HNL' OR fx_rate = 1)),
  DROP CONSTRAINT IF EXISTS purchase_order_cost_basis_check,
  ADD CONSTRAINT purchase_order_cost_basis_check
    CHECK (cost_basis IN ('LANDED_LEGACY_HNL', 'HNL_DOMESTIC', 'VENDOR_CURRENCY_ESTIMATED_LANDED'));

ALTER TABLE app.purchase_order_line
  ADD COLUMN IF NOT EXISTS source_unit_cost DECIMAL(14,4),
  ADD COLUMN IF NOT EXISTS commercial_unit_cost_hnl DECIMAL(14,4),
  ADD COLUMN IF NOT EXISTS estimated_landed_unit_cost_hnl DECIMAL(14,4);

UPDATE app.purchase_order_line
SET source_unit_cost = COALESCE(source_unit_cost, unit_cost),
    commercial_unit_cost_hnl = COALESCE(commercial_unit_cost_hnl, unit_cost),
    estimated_landed_unit_cost_hnl = COALESCE(estimated_landed_unit_cost_hnl, unit_cost);

ALTER TABLE app.purchase_order_line
  DROP CONSTRAINT IF EXISTS purchase_order_line_import_costs_check,
  ADD CONSTRAINT purchase_order_line_import_costs_check
    CHECK (
      (source_unit_cost IS NULL OR source_unit_cost >= 0)
      AND (commercial_unit_cost_hnl IS NULL OR commercial_unit_cost_hnl >= 0)
      AND (estimated_landed_unit_cost_hnl IS NULL OR estimated_landed_unit_cost_hnl >= 0)
    );

CREATE TABLE IF NOT EXISTS app.import_shipment_line (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  purchase_order_line_id UUID NOT NULL,
  container_id UUID,
  invoice_line_id UUID,
  expected_quantity DECIMAL(12,3) NOT NULL,
  source_unit_cost DECIMAL(14,4),
  source_currency VARCHAR(3) NOT NULL,
  fx_rate DECIMAL(18,8) NOT NULL,
  fx_date DATE NOT NULL,
  incoterm_code VARCHAR(8),
  incoterm_place TEXT,
  commercial_unit_cost_hnl DECIMAL(14,4) NOT NULL,
  estimated_landed_unit_cost_hnl DECIMAL(14,4) NOT NULL,
  allocated_landed_cost_hnl DECIMAL(14,2) NOT NULL DEFAULT 0,
  landed_unit_cost_hnl DECIMAL(14,4),
  status VARCHAR(24) NOT NULL DEFAULT 'EXPECTED',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_shipment_line_pkey PRIMARY KEY (id),
  CONSTRAINT import_shipment_line_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_shipment_line_po_line_id_fkey
    FOREIGN KEY (purchase_order_line_id) REFERENCES app.purchase_order_line(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT import_shipment_line_container_id_fkey
    FOREIGN KEY (container_id) REFERENCES app.import_container(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT import_shipment_line_invoice_line_id_fkey
    FOREIGN KEY (invoice_line_id) REFERENCES app.import_invoice_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT import_shipment_line_unique_po_line_key UNIQUE (shipment_id, purchase_order_line_id),
  CONSTRAINT import_shipment_line_currency_check CHECK (source_currency IN ('CNY', 'USD', 'HNL')),
  CONSTRAINT import_shipment_line_status_check CHECK (status IN ('EXPECTED', 'MATCHED', 'CANCELLED')),
  CONSTRAINT import_shipment_line_amount_check CHECK (
    expected_quantity > 0
    AND fx_rate > 0
    AND commercial_unit_cost_hnl >= 0
    AND estimated_landed_unit_cost_hnl >= 0
    AND allocated_landed_cost_hnl >= 0
    AND (source_unit_cost IS NULL OR source_unit_cost >= 0)
  )
);

CREATE INDEX IF NOT EXISTS import_shipment_line_shipment_id_idx
  ON app.import_shipment_line (shipment_id);
CREATE INDEX IF NOT EXISTS import_shipment_line_po_line_id_idx
  ON app.import_shipment_line (purchase_order_line_id);
CREATE INDEX IF NOT EXISTS import_shipment_line_invoice_line_id_idx
  ON app.import_shipment_line (invoice_line_id);
CREATE UNIQUE INDEX IF NOT EXISTS import_shipment_line_invoice_line_unique_idx
  ON app.import_shipment_line (invoice_line_id)
  WHERE invoice_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS import_shipment_line_container_id_idx
  ON app.import_shipment_line (container_id);

ALTER TABLE app.goods_in_transit_record
  ADD COLUMN IF NOT EXISTS shipment_line_id UUID;

ALTER TABLE app.goods_in_transit_record
  DROP CONSTRAINT IF EXISTS goods_in_transit_shipment_line_id_fkey,
  ADD CONSTRAINT goods_in_transit_shipment_line_id_fkey
    FOREIGN KEY (shipment_line_id) REFERENCES app.import_shipment_line(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS goods_in_transit_shipment_line_id_idx
  ON app.goods_in_transit_record (shipment_line_id);

ALTER TABLE app.import_landed_cost_allocation
  ADD COLUMN IF NOT EXISTS shipment_line_id UUID;

ALTER TABLE app.import_landed_cost_allocation
  ALTER COLUMN invoice_line_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS import_landed_cost_allocation_shipment_line_id_fkey,
  ADD CONSTRAINT import_landed_cost_allocation_shipment_line_id_fkey
    FOREIGN KEY (shipment_line_id) REFERENCES app.import_shipment_line(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  DROP CONSTRAINT IF EXISTS import_landed_cost_allocation_target_check,
  ADD CONSTRAINT import_landed_cost_allocation_target_check
    CHECK (
      (invoice_line_id IS NOT NULL AND shipment_line_id IS NULL)
      OR (invoice_line_id IS NULL AND shipment_line_id IS NOT NULL)
    );

CREATE UNIQUE INDEX IF NOT EXISTS import_landed_cost_allocation_charge_shipment_line_key
  ON app.import_landed_cost_allocation (charge_id, shipment_line_id)
  WHERE shipment_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS import_landed_cost_allocation_shipment_line_id_idx
  ON app.import_landed_cost_allocation (shipment_line_id);

ALTER TABLE app.import_charge
  ADD COLUMN IF NOT EXISTS cost_treatment VARCHAR(32) NOT NULL DEFAULT 'ALLOCATE_TO_LANDED';

ALTER TABLE app.import_charge
  DROP CONSTRAINT IF EXISTS import_charge_cost_treatment_check,
  ADD CONSTRAINT import_charge_cost_treatment_check
    CHECK (cost_treatment IN ('ALLOCATE_TO_LANDED', 'INCLUDED_IN_COMMERCIAL_PRICE', 'EXCLUDE_FROM_LANDED'));
