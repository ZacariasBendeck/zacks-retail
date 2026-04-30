-- Import Management AP handoff staging.
-- This records payable documents created by import liquidation without making
-- Import Management own AP invoices or payments.

CREATE TABLE IF NOT EXISTS app.import_payable_handoff (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  source_id UUID NOT NULL,
  counterparty TEXT NOT NULL,
  document_number TEXT,
  payable_kind VARCHAR(32) NOT NULL,
  source_amount DECIMAL(14,4) NOT NULL,
  source_currency VARCHAR(3) NOT NULL,
  fx_rate DECIMAL(18,8) NOT NULL,
  fx_date DATE NOT NULL,
  hnl_amount DECIMAL(14,2) NOT NULL,
  final BOOLEAN NOT NULL DEFAULT false,
  handoff_status VARCHAR(24) NOT NULL DEFAULT 'READY',
  ap_reference TEXT,
  sent_to_ap_by TEXT,
  sent_to_ap_at TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT import_payable_handoff_pkey PRIMARY KEY (id),
  CONSTRAINT import_payable_handoff_shipment_id_fkey
    FOREIGN KEY (shipment_id) REFERENCES app.import_shipment(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT import_payable_handoff_source_key UNIQUE (source_type, source_id),
  CONSTRAINT import_payable_handoff_source_type_check CHECK (
    source_type IN ('SUPPLIER_INVOICE', 'LANDED_COST_CHARGE')
  ),
  CONSTRAINT import_payable_handoff_currency_check CHECK (source_currency IN ('CNY', 'USD', 'HNL')),
  CONSTRAINT import_payable_handoff_amount_check CHECK (source_amount >= 0 AND fx_rate > 0 AND hnl_amount >= 0),
  CONSTRAINT import_payable_handoff_status_check CHECK (handoff_status IN ('READY', 'SENT_TO_AP', 'VOIDED'))
);

CREATE INDEX IF NOT EXISTS import_payable_handoff_shipment_status_idx
  ON app.import_payable_handoff (shipment_id, handoff_status);
CREATE INDEX IF NOT EXISTS import_payable_handoff_counterparty_idx
  ON app.import_payable_handoff (counterparty);
