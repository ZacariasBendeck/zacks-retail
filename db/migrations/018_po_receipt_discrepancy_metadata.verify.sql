-- Verify migration 018: discrepancy metadata columns exist on po_receipt_lines
SELECT discrepancy_reason, audit_reference FROM po_receipt_lines LIMIT 0;
