-- Migration 019 verification queries
-- Run these in order:
-- 1) Apply 019_inventory_movement_ledger_normalization.up.sql
-- 2) Execute section A checks
-- 3) Apply 019_inventory_movement_ledger_normalization.down.sql
-- 4) Execute section B checks

-- --------------------------------------------------
-- A) Post-UP checks
-- --------------------------------------------------

-- A1: Migration 019 table should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'table'
  AND name = 'inventory_movement_ledger';

-- A2: Migration 019 indexes should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'ux_inventory_movement_ledger_source_sale_v019',
    'ux_inventory_movement_ledger_source_po_receipt_v019',
    'ux_inventory_movement_ledger_source_adjustment_v019',
    'ux_inventory_movement_ledger_source_transfer_direction_v019',
    'idx_inventory_movement_ledger_sku_location_movement_at_v019',
    'idx_inventory_movement_ledger_movement_type_movement_at_v019',
    'idx_inventory_movement_ledger_location_movement_at_v019'
  )
ORDER BY name;

-- A3: Migration 019 triggers should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'trigger'
  AND name IN (
    'trg_inventory_movement_ledger_sale_alignment_insert_v019',
    'trg_inventory_movement_ledger_sale_alignment_update_v019',
    'trg_inventory_movement_ledger_po_receipt_alignment_insert_v019',
    'trg_inventory_movement_ledger_po_receipt_alignment_update_v019',
    'trg_inventory_movement_ledger_transfer_alignment_insert_v019',
    'trg_inventory_movement_ledger_transfer_alignment_update_v019',
    'trg_inventory_movement_ledger_adjustment_alignment_insert_v019',
    'trg_inventory_movement_ledger_adjustment_alignment_update_v019',
    'trg_sales_transactions_to_inventory_movement_ledger_insert_v019',
    'trg_po_receipt_lines_to_inventory_movement_ledger_insert_v019',
    'trg_transfer_order_lines_to_inventory_movement_ledger_insert_v019',
    'trg_inventory_adjustment_lines_to_inventory_movement_ledger_insert_v019'
  )
ORDER BY name;

-- A4: Reconciliation view should exist.
SELECT name, type
FROM sqlite_master
WHERE type = 'view'
  AND name = 'v_inventory_movement_reconciliation';

-- A5: inventory_movement_ledger must expose required columns.
PRAGMA table_info('inventory_movement_ledger');

-- A6: Guardrails check (sign conventions + exactly one source path) should pass.
SELECT
  'A6_movement_guardrails' AS check_name,
  CASE WHEN violating_rows = 0 THEN 'PASS' ELSE 'FAIL' END AS check_result,
  violating_rows
FROM (
  SELECT COUNT(*) AS violating_rows
  FROM inventory_movement_ledger l
  WHERE NOT (
    (
      (l.movement_type IN ('sale', 'transfer_out') AND l.quantity_delta < 0) OR
      (l.movement_type IN ('po_receipt', 'transfer_in') AND l.quantity_delta > 0) OR
      (l.movement_type = 'adjustment' AND l.quantity_delta <> 0)
    )
    AND (
      (CASE WHEN l.source_sale_id IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN l.source_po_receipt_line_id IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN l.source_transfer_line_id IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN l.source_adjustment_line_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
  )
);

-- A7: EXPLAIN plan for sku+location timeline should use composite index.
EXPLAIN QUERY PLAN
SELECT id, quantity_delta
FROM inventory_movement_ledger
WHERE sku_id = 'fixture-sku'
  AND location_id = 'loc-01'
ORDER BY movement_at DESC, id DESC
LIMIT 20;

-- A8: EXPLAIN plan for movement_type timeline should use movement_type index.
EXPLAIN QUERY PLAN
SELECT id, sku_id
FROM inventory_movement_ledger
WHERE movement_type = 'po_receipt'
ORDER BY movement_at DESC, id DESC
LIMIT 20;

-- A9: schema_table_comments should include 019 objects.
SELECT table_name
FROM schema_table_comments
WHERE table_name IN ('inventory_movement_ledger', 'v_inventory_movement_reconciliation')
ORDER BY table_name;

-- --------------------------------------------------
-- B) Post-DOWN checks
-- --------------------------------------------------

-- B1: Migration 019 table should be removed.
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = 'inventory_movement_ledger';

-- B2: Migration 019 indexes should be removed.
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'ux_inventory_movement_ledger_source_sale_v019',
    'ux_inventory_movement_ledger_source_po_receipt_v019',
    'ux_inventory_movement_ledger_source_adjustment_v019',
    'ux_inventory_movement_ledger_source_transfer_direction_v019',
    'idx_inventory_movement_ledger_sku_location_movement_at_v019',
    'idx_inventory_movement_ledger_movement_type_movement_at_v019',
    'idx_inventory_movement_ledger_location_movement_at_v019'
  )
ORDER BY name;

-- B3: Migration 019 triggers should be removed.
SELECT name
FROM sqlite_master
WHERE type = 'trigger'
  AND name IN (
    'trg_inventory_movement_ledger_sale_alignment_insert_v019',
    'trg_inventory_movement_ledger_sale_alignment_update_v019',
    'trg_inventory_movement_ledger_po_receipt_alignment_insert_v019',
    'trg_inventory_movement_ledger_po_receipt_alignment_update_v019',
    'trg_inventory_movement_ledger_transfer_alignment_insert_v019',
    'trg_inventory_movement_ledger_transfer_alignment_update_v019',
    'trg_inventory_movement_ledger_adjustment_alignment_insert_v019',
    'trg_inventory_movement_ledger_adjustment_alignment_update_v019',
    'trg_sales_transactions_to_inventory_movement_ledger_insert_v019',
    'trg_po_receipt_lines_to_inventory_movement_ledger_insert_v019',
    'trg_transfer_order_lines_to_inventory_movement_ledger_insert_v019',
    'trg_inventory_adjustment_lines_to_inventory_movement_ledger_insert_v019'
  )
ORDER BY name;

-- B4: Reconciliation view should be removed.
SELECT name
FROM sqlite_master
WHERE type = 'view'
  AND name = 'v_inventory_movement_reconciliation';

-- B5: schema_table_comments entries should be removed.
SELECT table_name
FROM schema_table_comments
WHERE table_name IN ('inventory_movement_ledger', 'v_inventory_movement_reconciliation')
ORDER BY table_name;
