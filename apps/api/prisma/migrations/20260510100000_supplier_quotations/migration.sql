CREATE SEQUENCE IF NOT EXISTS app.supplier_quotation_number_seq;

CREATE TABLE app.supplier_quotation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(32) NOT NULL UNIQUE,
  vendor_code VARCHAR(4) NOT NULL REFERENCES app.vendor(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  buyer VARCHAR(120),
  season VARCHAR(2),
  chain_id VARCHAR(64) REFERENCES app.store_group(code) ON UPDATE CASCADE ON DELETE SET NULL,
  source_currency VARCHAR(3) NOT NULL DEFAULT 'HNL',
  fx_rate NUMERIC(18, 8) NOT NULL DEFAULT 1,
  fx_date DATE NOT NULL DEFAULT CURRENT_DATE,
  incoterm_code VARCHAR(8),
  incoterm_place TEXT,
  payment_terms TEXT,
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  lead_time_days SMALLINT,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  source_document_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT supplier_quotation_currency_chk CHECK (source_currency IN ('HNL', 'USD', 'CNY')),
  CONSTRAINT supplier_quotation_status_chk CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED', 'CONVERTED')),
  CONSTRAINT supplier_quotation_fx_rate_chk CHECK (fx_rate > 0),
  CONSTRAINT supplier_quotation_lead_time_chk CHECK (lead_time_days IS NULL OR lead_time_days >= 0)
);

CREATE INDEX supplier_quotation_vendor_status_idx ON app.supplier_quotation(vendor_code, status);
CREATE INDEX supplier_quotation_buyer_status_idx ON app.supplier_quotation(buyer, status);
CREATE INDEX supplier_quotation_chain_quote_date_idx ON app.supplier_quotation(chain_id, quote_date);
CREATE INDEX supplier_quotation_status_updated_idx ON app.supplier_quotation(status, updated_at);

CREATE TABLE app.supplier_quotation_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES app.supplier_quotation(id) ON UPDATE CASCADE ON DELETE CASCADE,
  line_sequence INTEGER NOT NULL,
  linked_sku_id UUID REFERENCES app.sku(id) ON UPDATE CASCADE ON DELETE SET NULL,
  supplier_style TEXT NOT NULL,
  supplier_color_code TEXT,
  supplier_color_name TEXT,
  description TEXT,
  family_code TEXT REFERENCES app.product_family(code) ON UPDATE CASCADE ON DELETE SET NULL,
  category_number SMALLINT REFERENCES app.taxonomy_category(number) ON UPDATE CASCADE ON DELETE SET NULL,
  color_family_value_id SMALLINT REFERENCES app.attribute_value(id) ON UPDATE CASCADE ON DELETE SET NULL,
  material_value_id SMALLINT REFERENCES app.attribute_value(id) ON UPDATE CASCADE ON DELETE SET NULL,
  style_element_value_id SMALLINT REFERENCES app.attribute_value(id) ON UPDATE CASCADE ON DELETE SET NULL,
  keywords TEXT,
  image_url TEXT,
  moq_qty INTEGER,
  quoted_qty INTEGER,
  unit_cost NUMERIC(14, 4) NOT NULL,
  estimated_landed_unit_cost_hnl NUMERIC(14, 4),
  target_retail_hnl NUMERIC(12, 2),
  margin_pct NUMERIC(7, 4),
  planned_receipt_date TIMESTAMPTZ,
  decision_status VARCHAR(24) NOT NULL DEFAULT 'NEW',
  decision_reason TEXT,
  decision_at TIMESTAMPTZ,
  decision_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT supplier_quotation_line_sequence_key UNIQUE (quotation_id, line_sequence),
  CONSTRAINT supplier_quotation_line_cost_chk CHECK (unit_cost >= 0),
  CONSTRAINT supplier_quotation_line_est_landed_chk CHECK (estimated_landed_unit_cost_hnl IS NULL OR estimated_landed_unit_cost_hnl >= 0),
  CONSTRAINT supplier_quotation_line_target_retail_chk CHECK (target_retail_hnl IS NULL OR target_retail_hnl >= 0),
  CONSTRAINT supplier_quotation_line_moq_chk CHECK (moq_qty IS NULL OR moq_qty >= 0),
  CONSTRAINT supplier_quotation_line_quoted_qty_chk CHECK (quoted_qty IS NULL OR quoted_qty >= 0),
  CONSTRAINT supplier_quotation_line_decision_status_chk CHECK (decision_status IN ('NEW', 'ACCEPTED', 'REJECTED', 'HOLD'))
);

CREATE INDEX supplier_quotation_line_quote_decision_idx ON app.supplier_quotation_line(quotation_id, decision_status);
CREATE INDEX supplier_quotation_line_sku_idx ON app.supplier_quotation_line(linked_sku_id);
CREATE INDEX supplier_quotation_line_family_category_idx ON app.supplier_quotation_line(family_code, category_number);
CREATE INDEX supplier_quotation_line_supplier_style_idx ON app.supplier_quotation_line(supplier_style);

CREATE TABLE app.supplier_quotation_line_relation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_line_id UUID NOT NULL REFERENCES app.supplier_quotation_line(id) ON UPDATE CASCADE ON DELETE CASCADE,
  relation_type VARCHAR(24) NOT NULL,
  target_type VARCHAR(24) NOT NULL,
  target_sku_id UUID REFERENCES app.sku(id) ON UPDATE CASCADE ON DELETE SET NULL,
  target_matching_set_id UUID REFERENCES app.matching_set(id) ON UPDATE CASCADE ON DELETE SET NULL,
  target_quotation_line_id UUID REFERENCES app.supplier_quotation_line(id) ON UPDATE CASCADE ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT supplier_quotation_line_relation_type_chk CHECK (relation_type IN ('SIMILAR', 'SAME_ELEMENT', 'REPLACEMENT', 'COORDINATE', 'CARRYOVER')),
  CONSTRAINT supplier_quotation_line_relation_target_type_chk CHECK (target_type IN ('SKU', 'MATCHING_SET', 'QUOTE_LINE')),
  CONSTRAINT supplier_quotation_line_relation_target_chk CHECK (
    (target_type = 'SKU' AND target_sku_id IS NOT NULL AND target_matching_set_id IS NULL AND target_quotation_line_id IS NULL)
    OR (target_type = 'MATCHING_SET' AND target_sku_id IS NULL AND target_matching_set_id IS NOT NULL AND target_quotation_line_id IS NULL)
    OR (target_type = 'QUOTE_LINE' AND target_sku_id IS NULL AND target_matching_set_id IS NULL AND target_quotation_line_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX supplier_quotation_line_relation_unique_sku
  ON app.supplier_quotation_line_relation(source_line_id, relation_type, target_sku_id)
  WHERE target_type = 'SKU' AND target_sku_id IS NOT NULL;
CREATE UNIQUE INDEX supplier_quotation_line_relation_unique_matching_set
  ON app.supplier_quotation_line_relation(source_line_id, relation_type, target_matching_set_id)
  WHERE target_type = 'MATCHING_SET' AND target_matching_set_id IS NOT NULL;
CREATE UNIQUE INDEX supplier_quotation_line_relation_unique_quote_line
  ON app.supplier_quotation_line_relation(source_line_id, relation_type, target_quotation_line_id)
  WHERE target_type = 'QUOTE_LINE' AND target_quotation_line_id IS NOT NULL;
CREATE INDEX supplier_quotation_line_relation_source_idx ON app.supplier_quotation_line_relation(source_line_id);
CREATE INDEX supplier_quotation_line_relation_sku_idx ON app.supplier_quotation_line_relation(target_sku_id);
CREATE INDEX supplier_quotation_line_relation_matching_set_idx ON app.supplier_quotation_line_relation(target_matching_set_id);
CREATE INDEX supplier_quotation_line_relation_quote_line_idx ON app.supplier_quotation_line_relation(target_quotation_line_id);

ALTER TABLE app.purchase_order
  ADD COLUMN supplier_quotation_id UUID REFERENCES app.supplier_quotation(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX purchase_order_supplier_quotation_idx ON app.purchase_order(supplier_quotation_id);

ALTER TABLE app.purchase_order_line
  ADD COLUMN supplier_quotation_line_id UUID REFERENCES app.supplier_quotation_line(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX purchase_order_line_supplier_quote_line_idx ON app.purchase_order_line(supplier_quotation_line_id);
