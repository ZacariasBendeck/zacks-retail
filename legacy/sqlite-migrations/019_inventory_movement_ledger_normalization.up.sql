-- Migration 019 (UP)
-- Canonical inventory movement ledger normalization + integrity contracts.
--
-- Non-obvious design decisions:
-- 1) Source linkage uses one-and-only-one nullable FK path
--    (sale, po_receipt_line, transfer_line, adjustment_line) so each ledger row
--    is auditable without ambiguous polymorphic IDs.
-- 2) Cross-table quantity/location consistency is enforced via triggers because
--    SQLite CHECK constraints cannot reference related tables.
-- 3) Transfer lines intentionally fan out into two rows (transfer_out, transfer_in)
--    to preserve signed quantities per location and keep reconciliation additive.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS schema_table_comments (
  table_name TEXT PRIMARY KEY,
  comment TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_movement_ledger (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
  location_id TEXT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL
    CHECK(movement_type IN ('sale', 'po_receipt', 'transfer_in', 'transfer_out', 'adjustment')),
  quantity_delta INTEGER NOT NULL CHECK(quantity_delta <> 0),
  unit_cost_snapshot REAL CHECK(unit_cost_snapshot IS NULL OR unit_cost_snapshot >= 0),
  source_sale_id TEXT REFERENCES sales_transactions(id) ON DELETE RESTRICT,
  source_po_receipt_line_id TEXT REFERENCES po_receipt_lines(id) ON DELETE RESTRICT,
  source_transfer_line_id TEXT REFERENCES transfer_order_lines(id) ON DELETE RESTRICT,
  source_adjustment_line_id TEXT REFERENCES inventory_adjustment_lines(id) ON DELETE RESTRICT,
  movement_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(
    (CASE WHEN source_sale_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN source_po_receipt_line_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN source_transfer_line_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN source_adjustment_line_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  CHECK(
    (movement_type = 'sale' AND source_sale_id IS NOT NULL) OR
    (movement_type = 'po_receipt' AND source_po_receipt_line_id IS NOT NULL) OR
    (movement_type IN ('transfer_in', 'transfer_out') AND source_transfer_line_id IS NOT NULL) OR
    (movement_type = 'adjustment' AND source_adjustment_line_id IS NOT NULL)
  ),
  CHECK(
    (movement_type IN ('sale', 'transfer_out') AND quantity_delta < 0) OR
    (movement_type IN ('po_receipt', 'transfer_in') AND quantity_delta > 0) OR
    (movement_type = 'adjustment' AND quantity_delta <> 0)
  ),
  CHECK(movement_type <> 'po_receipt' OR unit_cost_snapshot IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_movement_ledger_source_sale_v019
  ON inventory_movement_ledger(source_sale_id)
  WHERE source_sale_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_movement_ledger_source_po_receipt_v019
  ON inventory_movement_ledger(source_po_receipt_line_id)
  WHERE source_po_receipt_line_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_movement_ledger_source_adjustment_v019
  ON inventory_movement_ledger(source_adjustment_line_id)
  WHERE source_adjustment_line_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_movement_ledger_source_transfer_direction_v019
  ON inventory_movement_ledger(source_transfer_line_id, movement_type)
  WHERE source_transfer_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movement_ledger_sku_location_movement_at_v019
  ON inventory_movement_ledger(sku_id, location_id, movement_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_ledger_movement_type_movement_at_v019
  ON inventory_movement_ledger(movement_type, movement_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_ledger_location_movement_at_v019
  ON inventory_movement_ledger(location_id, movement_at DESC, id);

CREATE TRIGGER IF NOT EXISTS trg_inventory_movement_ledger_sale_alignment_insert_v019
BEFORE INSERT ON inventory_movement_ledger
WHEN NEW.source_sale_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sales_transactions st
    WHERE st.id = NEW.source_sale_id
      AND st.sku_id = NEW.sku_id
      AND NEW.quantity_delta = -st.quantity
  )
BEGIN
  SELECT RAISE(ABORT, 'inventory_movement_ledger sale source must match sku_id and signed quantity');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_movement_ledger_sale_alignment_update_v019
BEFORE UPDATE OF sku_id, quantity_delta, source_sale_id ON inventory_movement_ledger
WHEN NEW.source_sale_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sales_transactions st
    WHERE st.id = NEW.source_sale_id
      AND st.sku_id = NEW.sku_id
      AND NEW.quantity_delta = -st.quantity
  )
BEGIN
  SELECT RAISE(ABORT, 'inventory_movement_ledger sale source must match sku_id and signed quantity');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_movement_ledger_po_receipt_alignment_insert_v019
BEFORE INSERT ON inventory_movement_ledger
WHEN NEW.source_po_receipt_line_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM po_receipt_lines prl
    JOIN po_receipts pr ON pr.id = prl.receipt_id
    WHERE prl.id = NEW.source_po_receipt_line_id
      AND prl.sku_id = NEW.sku_id
      AND pr.location_id = NEW.location_id
      AND NEW.quantity_delta = prl.quantity_received
      AND (
        (prl.unit_cost IS NULL AND NEW.unit_cost_snapshot IS NULL) OR
        (prl.unit_cost IS NOT NULL AND NEW.unit_cost_snapshot = prl.unit_cost)
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'inventory_movement_ledger po_receipt source must match sku, location, quantity, and cost snapshot');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_movement_ledger_po_receipt_alignment_update_v019
BEFORE UPDATE OF sku_id, location_id, quantity_delta, unit_cost_snapshot, source_po_receipt_line_id ON inventory_movement_ledger
WHEN NEW.source_po_receipt_line_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM po_receipt_lines prl
    JOIN po_receipts pr ON pr.id = prl.receipt_id
    WHERE prl.id = NEW.source_po_receipt_line_id
      AND prl.sku_id = NEW.sku_id
      AND pr.location_id = NEW.location_id
      AND NEW.quantity_delta = prl.quantity_received
      AND (
        (prl.unit_cost IS NULL AND NEW.unit_cost_snapshot IS NULL) OR
        (prl.unit_cost IS NOT NULL AND NEW.unit_cost_snapshot = prl.unit_cost)
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'inventory_movement_ledger po_receipt source must match sku, location, quantity, and cost snapshot');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_movement_ledger_transfer_alignment_insert_v019
BEFORE INSERT ON inventory_movement_ledger
WHEN NEW.source_transfer_line_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM transfer_order_lines tol
    JOIN transfer_orders t ON t.id = tol.transfer_order_id
    WHERE tol.id = NEW.source_transfer_line_id
      AND tol.sku_id = NEW.sku_id
      AND (
        (NEW.movement_type = 'transfer_out'
          AND NEW.location_id = t.from_location_id
          AND NEW.quantity_delta = -tol.quantity)
        OR
        (NEW.movement_type = 'transfer_in'
          AND NEW.location_id = t.to_location_id
          AND NEW.quantity_delta = tol.quantity)
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'inventory_movement_ledger transfer source must match sku, direction location, and signed quantity');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_movement_ledger_transfer_alignment_update_v019
BEFORE UPDATE OF sku_id, location_id, movement_type, quantity_delta, source_transfer_line_id ON inventory_movement_ledger
WHEN NEW.source_transfer_line_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM transfer_order_lines tol
    JOIN transfer_orders t ON t.id = tol.transfer_order_id
    WHERE tol.id = NEW.source_transfer_line_id
      AND tol.sku_id = NEW.sku_id
      AND (
        (NEW.movement_type = 'transfer_out'
          AND NEW.location_id = t.from_location_id
          AND NEW.quantity_delta = -tol.quantity)
        OR
        (NEW.movement_type = 'transfer_in'
          AND NEW.location_id = t.to_location_id
          AND NEW.quantity_delta = tol.quantity)
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'inventory_movement_ledger transfer source must match sku, direction location, and signed quantity');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_movement_ledger_adjustment_alignment_insert_v019
BEFORE INSERT ON inventory_movement_ledger
WHEN NEW.source_adjustment_line_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_adjustment_lines ial
    JOIN inventory_adjustments ia ON ia.id = ial.adjustment_id
    WHERE ial.id = NEW.source_adjustment_line_id
      AND ial.sku_id = NEW.sku_id
      AND ial.quantity = NEW.quantity_delta
      AND (ia.from_location_id = NEW.location_id OR ia.to_location_id = NEW.location_id)
      AND (ia.from_location_id IS NOT NULL OR ia.to_location_id IS NOT NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'inventory_movement_ledger adjustment source must match sku, quantity, and a referenced location');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_movement_ledger_adjustment_alignment_update_v019
BEFORE UPDATE OF sku_id, location_id, quantity_delta, source_adjustment_line_id ON inventory_movement_ledger
WHEN NEW.source_adjustment_line_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_adjustment_lines ial
    JOIN inventory_adjustments ia ON ia.id = ial.adjustment_id
    WHERE ial.id = NEW.source_adjustment_line_id
      AND ial.sku_id = NEW.sku_id
      AND ial.quantity = NEW.quantity_delta
      AND (ia.from_location_id = NEW.location_id OR ia.to_location_id = NEW.location_id)
      AND (ia.from_location_id IS NOT NULL OR ia.to_location_id IS NOT NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'inventory_movement_ledger adjustment source must match sku, quantity, and a referenced location');
END;

INSERT INTO inventory_movement_ledger (
  id,
  sku_id,
  location_id,
  movement_type,
  quantity_delta,
  unit_cost_snapshot,
  source_sale_id,
  movement_at
)
SELECT
  lower(hex(randomblob(16))),
  st.sku_id,
  COALESCE(
    (SELECT id FROM inventory_locations WHERE code = 'LOC_01' LIMIT 1),
    (SELECT id FROM inventory_locations ORDER BY created_at ASC, id ASC LIMIT 1)
  ),
  'sale',
  -st.quantity,
  NULL,
  st.id,
  COALESCE(st.sold_at, st.created_at, datetime('now'))
FROM sales_transactions st
WHERE NOT EXISTS (
  SELECT 1
  FROM inventory_movement_ledger l
  WHERE l.source_sale_id = st.id
);

INSERT INTO inventory_movement_ledger (
  id,
  sku_id,
  location_id,
  movement_type,
  quantity_delta,
  unit_cost_snapshot,
  source_po_receipt_line_id,
  movement_at
)
SELECT
  lower(hex(randomblob(16))),
  prl.sku_id,
  pr.location_id,
  'po_receipt',
  prl.quantity_received,
  prl.unit_cost,
  prl.id,
  COALESCE(pr.received_at, prl.created_at, datetime('now'))
FROM po_receipt_lines prl
JOIN po_receipts pr ON pr.id = prl.receipt_id
WHERE NOT EXISTS (
  SELECT 1
  FROM inventory_movement_ledger l
  WHERE l.source_po_receipt_line_id = prl.id
);

INSERT INTO inventory_movement_ledger (
  id,
  sku_id,
  location_id,
  movement_type,
  quantity_delta,
  unit_cost_snapshot,
  source_transfer_line_id,
  movement_at
)
SELECT
  lower(hex(randomblob(16))),
  tol.sku_id,
  t.from_location_id,
  'transfer_out',
  -tol.quantity,
  NULL,
  tol.id,
  COALESCE(t.shipped_at, t.created_at, tol.created_at, datetime('now'))
FROM transfer_order_lines tol
JOIN transfer_orders t ON t.id = tol.transfer_order_id
WHERE NOT EXISTS (
  SELECT 1
  FROM inventory_movement_ledger l
  WHERE l.source_transfer_line_id = tol.id
    AND l.movement_type = 'transfer_out'
);

INSERT INTO inventory_movement_ledger (
  id,
  sku_id,
  location_id,
  movement_type,
  quantity_delta,
  unit_cost_snapshot,
  source_transfer_line_id,
  movement_at
)
SELECT
  lower(hex(randomblob(16))),
  tol.sku_id,
  t.to_location_id,
  'transfer_in',
  tol.quantity,
  NULL,
  tol.id,
  COALESCE(t.received_at, t.shipped_at, t.created_at, tol.created_at, datetime('now'))
FROM transfer_order_lines tol
JOIN transfer_orders t ON t.id = tol.transfer_order_id
WHERE NOT EXISTS (
  SELECT 1
  FROM inventory_movement_ledger l
  WHERE l.source_transfer_line_id = tol.id
    AND l.movement_type = 'transfer_in'
);

INSERT INTO inventory_movement_ledger (
  id,
  sku_id,
  location_id,
  movement_type,
  quantity_delta,
  unit_cost_snapshot,
  source_adjustment_line_id,
  movement_at
)
SELECT
  lower(hex(randomblob(16))),
  ial.sku_id,
  CASE
    WHEN ial.quantity < 0 THEN COALESCE(ia.from_location_id, ia.to_location_id)
    ELSE COALESCE(ia.to_location_id, ia.from_location_id)
  END,
  'adjustment',
  ial.quantity,
  NULL,
  ial.id,
  COALESCE(ia.created_at, ial.created_at, datetime('now'))
FROM inventory_adjustment_lines ial
JOIN inventory_adjustments ia ON ia.id = ial.adjustment_id
WHERE ial.quantity <> 0
  AND (ia.from_location_id IS NOT NULL OR ia.to_location_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_movement_ledger l
    WHERE l.source_adjustment_line_id = ial.id
  );

CREATE TRIGGER IF NOT EXISTS trg_sales_transactions_to_inventory_movement_ledger_insert_v019
AFTER INSERT ON sales_transactions
BEGIN
  INSERT INTO inventory_movement_ledger (
    id,
    sku_id,
    location_id,
    movement_type,
    quantity_delta,
    unit_cost_snapshot,
    source_sale_id,
    movement_at
  )
  VALUES (
    lower(hex(randomblob(16))),
    NEW.sku_id,
    COALESCE(
      (SELECT id FROM inventory_locations WHERE code = 'LOC_01' LIMIT 1),
      (SELECT id FROM inventory_locations ORDER BY created_at ASC, id ASC LIMIT 1)
    ),
    'sale',
    -NEW.quantity,
    NULL,
    NEW.id,
    COALESCE(NEW.sold_at, NEW.created_at, datetime('now'))
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_po_receipt_lines_to_inventory_movement_ledger_insert_v019
AFTER INSERT ON po_receipt_lines
BEGIN
  INSERT INTO inventory_movement_ledger (
    id,
    sku_id,
    location_id,
    movement_type,
    quantity_delta,
    unit_cost_snapshot,
    source_po_receipt_line_id,
    movement_at
  )
  SELECT
    lower(hex(randomblob(16))),
    NEW.sku_id,
    pr.location_id,
    'po_receipt',
    NEW.quantity_received,
    NEW.unit_cost,
    NEW.id,
    COALESCE(pr.received_at, NEW.created_at, datetime('now'))
  FROM po_receipts pr
  WHERE pr.id = NEW.receipt_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_transfer_order_lines_to_inventory_movement_ledger_insert_v019
AFTER INSERT ON transfer_order_lines
BEGIN
  INSERT INTO inventory_movement_ledger (
    id,
    sku_id,
    location_id,
    movement_type,
    quantity_delta,
    unit_cost_snapshot,
    source_transfer_line_id,
    movement_at
  )
  SELECT
    lower(hex(randomblob(16))),
    NEW.sku_id,
    t.from_location_id,
    'transfer_out',
    -NEW.quantity,
    NULL,
    NEW.id,
    COALESCE(t.shipped_at, t.created_at, NEW.created_at, datetime('now'))
  FROM transfer_orders t
  WHERE t.id = NEW.transfer_order_id;

  INSERT INTO inventory_movement_ledger (
    id,
    sku_id,
    location_id,
    movement_type,
    quantity_delta,
    unit_cost_snapshot,
    source_transfer_line_id,
    movement_at
  )
  SELECT
    lower(hex(randomblob(16))),
    NEW.sku_id,
    t.to_location_id,
    'transfer_in',
    NEW.quantity,
    NULL,
    NEW.id,
    COALESCE(t.received_at, t.shipped_at, t.created_at, NEW.created_at, datetime('now'))
  FROM transfer_orders t
  WHERE t.id = NEW.transfer_order_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_adjustment_lines_to_inventory_movement_ledger_insert_v019
AFTER INSERT ON inventory_adjustment_lines
BEGIN
  INSERT INTO inventory_movement_ledger (
    id,
    sku_id,
    location_id,
    movement_type,
    quantity_delta,
    unit_cost_snapshot,
    source_adjustment_line_id,
    movement_at
  )
  SELECT
    lower(hex(randomblob(16))),
    NEW.sku_id,
    CASE
      WHEN NEW.quantity < 0 THEN COALESCE(ia.from_location_id, ia.to_location_id)
      ELSE COALESCE(ia.to_location_id, ia.from_location_id)
    END,
    'adjustment',
    NEW.quantity,
    NULL,
    NEW.id,
    COALESCE(ia.created_at, NEW.created_at, datetime('now'))
  FROM inventory_adjustments ia
  WHERE ia.id = NEW.adjustment_id
    AND (ia.from_location_id IS NOT NULL OR ia.to_location_id IS NOT NULL);
END;

CREATE VIEW IF NOT EXISTS v_inventory_movement_reconciliation AS
SELECT
  l.sku_id,
  l.location_id,
  SUM(l.quantity_delta) AS expected_quantity_delta,
  COUNT(*) AS movement_row_count,
  MIN(l.movement_at) AS first_movement_at,
  MAX(l.movement_at) AS last_movement_at
FROM inventory_movement_ledger l
GROUP BY l.sku_id, l.location_id;

INSERT OR REPLACE INTO schema_table_comments (table_name, comment) VALUES
  ('inventory_movement_ledger', 'Canonical signed movement ledger keyed by SKU and location with auditable one-source-path linkage (sale, receipt, transfer, adjustment).'),
  ('v_inventory_movement_reconciliation', 'Read model that aggregates expected stock deltas per SKU and location directly from canonical movement rows.');

COMMIT;
