-- Migration 018: Add discrepancy reason + audit reference to PO receipt lines
-- Supports purchasing exception workflow for short-receipt variance tracking.

ALTER TABLE po_receipt_lines ADD COLUMN discrepancy_reason TEXT;
ALTER TABLE po_receipt_lines ADD COLUMN audit_reference TEXT;

-- Index for filtering/reporting on receipts that had discrepancies
CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_discrepancy_v018
  ON po_receipt_lines(discrepancy_reason)
  WHERE discrepancy_reason IS NOT NULL;
