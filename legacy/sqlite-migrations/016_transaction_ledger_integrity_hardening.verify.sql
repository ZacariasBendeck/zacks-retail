-- Migration 016 verification queries
-- Run these in order:
-- 1) Apply 016_transaction_ledger_integrity_hardening.up.sql
-- 2) Execute section A checks
-- 3) Apply 016_transaction_ledger_integrity_hardening.down.sql
-- 4) Execute section B checks

-- --------------------------------------------------
-- A) Post-UP checks
-- --------------------------------------------------

-- A1: Migration 016 indexes should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_purchase_order_lines_po_created_v016',
    'idx_po_receipts_po_received_at_v016',
    'idx_po_receipt_lines_receipt_created_v016',
    'idx_transfer_orders_status_created_v016',
    'idx_transfer_order_lines_transfer_created_v016',
    'idx_inventory_adjustments_type_created_v016',
    'idx_inventory_adjustment_lines_adjustment_created_v016'
  )
ORDER BY name;

-- A2: Migration 016 triggers should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'trigger'
  AND name IN (
    'trg_purchase_order_lines_qty_received_insert_guard_v016',
    'trg_purchase_order_lines_qty_received_update_guard_v016',
    'trg_po_receipt_lines_po_line_alignment_insert_v016',
    'trg_po_receipt_lines_po_line_alignment_update_v016',
    'trg_po_receipt_lines_size_alignment_insert_v016',
    'trg_po_receipt_lines_size_alignment_update_v016',
    'trg_transfer_order_lines_size_alignment_insert_v016',
    'trg_transfer_order_lines_size_alignment_update_v016',
    'trg_inventory_adjustment_lines_nonzero_insert_v016',
    'trg_inventory_adjustment_lines_nonzero_update_v016'
  )
ORDER BY name;

-- A3: Target table index catalogs should include v016 index coverage.
PRAGMA index_list('purchase_order_lines');
PRAGMA index_list('po_receipts');
PRAGMA index_list('po_receipt_lines');
PRAGMA index_list('transfer_orders');
PRAGMA index_list('transfer_order_lines');
PRAGMA index_list('inventory_adjustments');
PRAGMA index_list('inventory_adjustment_lines');

-- --------------------------------------------------
-- B) Post-DOWN checks
-- --------------------------------------------------

-- B1: Migration 016 indexes should be removed.
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_purchase_order_lines_po_created_v016',
    'idx_po_receipts_po_received_at_v016',
    'idx_po_receipt_lines_receipt_created_v016',
    'idx_transfer_orders_status_created_v016',
    'idx_transfer_order_lines_transfer_created_v016',
    'idx_inventory_adjustments_type_created_v016',
    'idx_inventory_adjustment_lines_adjustment_created_v016'
  )
ORDER BY name;

-- B2: Migration 016 triggers should be removed.
SELECT name
FROM sqlite_master
WHERE type = 'trigger'
  AND name IN (
    'trg_purchase_order_lines_qty_received_insert_guard_v016',
    'trg_purchase_order_lines_qty_received_update_guard_v016',
    'trg_po_receipt_lines_po_line_alignment_insert_v016',
    'trg_po_receipt_lines_po_line_alignment_update_v016',
    'trg_po_receipt_lines_size_alignment_insert_v016',
    'trg_po_receipt_lines_size_alignment_update_v016',
    'trg_transfer_order_lines_size_alignment_insert_v016',
    'trg_transfer_order_lines_size_alignment_update_v016',
    'trg_inventory_adjustment_lines_nonzero_insert_v016',
    'trg_inventory_adjustment_lines_nonzero_update_v016'
  )
ORDER BY name;
