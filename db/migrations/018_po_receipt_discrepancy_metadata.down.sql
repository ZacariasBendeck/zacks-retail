-- Rollback migration 018: Remove discrepancy metadata from po_receipt_lines
-- SQLite does not support DROP COLUMN before 3.35.0; recreate table.

DROP INDEX IF EXISTS idx_po_receipt_lines_discrepancy_v018;

CREATE TABLE po_receipt_lines_backup AS SELECT
  id, receipt_id, po_line_id, sku_id, sku_size_id,
  quantity_received, unit_cost, created_at
FROM po_receipt_lines;

DROP TABLE po_receipt_lines;

CREATE TABLE po_receipt_lines (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES po_receipts(id) ON DELETE CASCADE,
  po_line_id TEXT REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  sku_id TEXT NOT NULL REFERENCES skus(id),
  sku_size_id TEXT REFERENCES sku_sizes(id),
  quantity_received INTEGER NOT NULL CHECK(quantity_received > 0),
  unit_cost REAL CHECK(unit_cost >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO po_receipt_lines (id, receipt_id, po_line_id, sku_id, sku_size_id, quantity_received, unit_cost, created_at)
  SELECT id, receipt_id, po_line_id, sku_id, sku_size_id, quantity_received, unit_cost, created_at
  FROM po_receipt_lines_backup;

DROP TABLE po_receipt_lines_backup;

CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_receipt_id ON po_receipt_lines(receipt_id);
CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_sku_id ON po_receipt_lines(sku_id);
CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_po_line_id ON po_receipt_lines(po_line_id);
