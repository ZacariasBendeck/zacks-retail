-- Migration 016 (UP)
-- Transaction ledger integrity hardening for receipts, transfers, and adjustments.
--
-- Non-obvious design decisions:
-- 1) Cross-table consistency checks (receipt header/line/PO-line and SKU-size alignment)
--    are implemented with triggers because SQLite CHECK constraints cannot reference
--    other tables.
-- 2) quantity_received <= quantity_ordered is enforced in the database so over-receipt
--    cannot occur via any write path, not only API validation.
-- 3) Composite indexes follow current read contracts (WHERE + ORDER BY) to reduce
--    server-side pagination scan cost for transaction-heavy pages.

BEGIN TRANSACTION;

CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po_created_v016
  ON purchase_order_lines(po_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_po_receipts_po_received_at_v016
  ON po_receipts(po_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_receipt_lines_receipt_created_v016
  ON po_receipt_lines(receipt_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_transfer_orders_status_created_v016
  ON transfer_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_order_lines_transfer_created_v016
  ON transfer_order_lines(transfer_order_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_type_created_v016
  ON inventory_adjustments(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustment_lines_adjustment_created_v016
  ON inventory_adjustment_lines(adjustment_id, created_at ASC);

CREATE TRIGGER IF NOT EXISTS trg_purchase_order_lines_qty_received_insert_guard_v016
BEFORE INSERT ON purchase_order_lines
WHEN NEW.quantity_received > NEW.quantity_ordered
BEGIN
  SELECT RAISE(ABORT, 'purchase_order_lines quantity_received cannot exceed quantity_ordered');
END;

CREATE TRIGGER IF NOT EXISTS trg_purchase_order_lines_qty_received_update_guard_v016
BEFORE UPDATE OF quantity_received, quantity_ordered ON purchase_order_lines
WHEN NEW.quantity_received > NEW.quantity_ordered
BEGIN
  SELECT RAISE(ABORT, 'purchase_order_lines quantity_received cannot exceed quantity_ordered');
END;

CREATE TRIGGER IF NOT EXISTS trg_po_receipt_lines_po_line_alignment_insert_v016
BEFORE INSERT ON po_receipt_lines
WHEN NEW.po_line_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM purchase_order_lines pol
    JOIN po_receipts pr ON pr.id = NEW.receipt_id
    WHERE pol.id = NEW.po_line_id
      AND pol.po_id = pr.po_id
      AND pol.sku_id = NEW.sku_id
  )
BEGIN
  SELECT RAISE(ABORT, 'po_receipt_lines po_line_id must belong to receipt po_id and sku_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_po_receipt_lines_po_line_alignment_update_v016
BEFORE UPDATE OF receipt_id, po_line_id, sku_id ON po_receipt_lines
WHEN NEW.po_line_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM purchase_order_lines pol
    JOIN po_receipts pr ON pr.id = NEW.receipt_id
    WHERE pol.id = NEW.po_line_id
      AND pol.po_id = pr.po_id
      AND pol.sku_id = NEW.sku_id
  )
BEGIN
  SELECT RAISE(ABORT, 'po_receipt_lines po_line_id must belong to receipt po_id and sku_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_po_receipt_lines_size_alignment_insert_v016
BEFORE INSERT ON po_receipt_lines
WHEN NEW.sku_size_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sku_sizes ss
    WHERE ss.id = NEW.sku_size_id
      AND ss.sku_id = NEW.sku_id
  )
BEGIN
  SELECT RAISE(ABORT, 'po_receipt_lines sku_size_id must belong to sku_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_po_receipt_lines_size_alignment_update_v016
BEFORE UPDATE OF sku_id, sku_size_id ON po_receipt_lines
WHEN NEW.sku_size_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sku_sizes ss
    WHERE ss.id = NEW.sku_size_id
      AND ss.sku_id = NEW.sku_id
  )
BEGIN
  SELECT RAISE(ABORT, 'po_receipt_lines sku_size_id must belong to sku_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_transfer_order_lines_size_alignment_insert_v016
BEFORE INSERT ON transfer_order_lines
WHEN NEW.sku_size_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sku_sizes ss
    WHERE ss.id = NEW.sku_size_id
      AND ss.sku_id = NEW.sku_id
  )
BEGIN
  SELECT RAISE(ABORT, 'transfer_order_lines sku_size_id must belong to sku_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_transfer_order_lines_size_alignment_update_v016
BEFORE UPDATE OF sku_id, sku_size_id ON transfer_order_lines
WHEN NEW.sku_size_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sku_sizes ss
    WHERE ss.id = NEW.sku_size_id
      AND ss.sku_id = NEW.sku_id
  )
BEGIN
  SELECT RAISE(ABORT, 'transfer_order_lines sku_size_id must belong to sku_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_adjustment_lines_nonzero_insert_v016
BEFORE INSERT ON inventory_adjustment_lines
WHEN NEW.quantity = 0
BEGIN
  SELECT RAISE(ABORT, 'inventory_adjustment_lines quantity cannot be zero');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_adjustment_lines_nonzero_update_v016
BEFORE UPDATE OF quantity ON inventory_adjustment_lines
WHEN NEW.quantity = 0
BEGIN
  SELECT RAISE(ABORT, 'inventory_adjustment_lines quantity cannot be zero');
END;

COMMIT;
