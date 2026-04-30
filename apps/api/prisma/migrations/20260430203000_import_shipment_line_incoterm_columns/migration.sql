ALTER TABLE app.import_shipment_line
  ADD COLUMN IF NOT EXISTS incoterm_code VARCHAR(8),
  ADD COLUMN IF NOT EXISTS incoterm_place TEXT;
