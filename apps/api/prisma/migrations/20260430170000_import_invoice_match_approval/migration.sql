ALTER TABLE app.import_shipment_line
  ADD COLUMN IF NOT EXISTS invoice_match_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_match_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS invoice_match_approval_reason TEXT;
