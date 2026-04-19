-- Migration 017 (UP)
-- Inventory balance baseline for high-volume filters and optimistic concurrency.
--
-- Non-obvious design decisions:
-- 1) `inventory_balances` denormalizes category/macro/brand/style/color/size so the
--    CTO-approved filter indexes can be satisfied with a single-index plan.
-- 2) Backfill groups by (sku_id, sku_size_id) to collapse any legacy duplicate
--    NULL-size inventory rows into one balance row during migration.
-- 3) Version checks are enforced by trigger only on quantity mutations so writes
--    unrelated to balance math can still proceed without forced version bumps.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS inventory_balances (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  sku_size_id TEXT REFERENCES sku_sizes(id) ON DELETE SET NULL,
  category INTEGER NOT NULL CHECK(category BETWEEN 556 AND 599),
  macro_department TEXT NOT NULL CHECK(macro_department IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')),
  brand INTEGER NOT NULL REFERENCES ref_brands(id),
  style TEXT NOT NULL CHECK(length(trim(style)) > 0),
  color INTEGER NOT NULL REFERENCES ref_colors(id),
  size TEXT NOT NULL CHECK(length(trim(size)) > 0),
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK(quantity_on_hand >= 0),
  quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK(quantity_reserved >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_skus_sku_code_v017
  ON skus(sku_code);

CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_balances_sku_size_key_v017
  ON inventory_balances(sku_id, COALESCE(sku_size_id, '__NO_SIZE__'));
CREATE INDEX IF NOT EXISTS idx_inventory_balances_sku_id_v017
  ON inventory_balances(sku_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_sku_size_id_v017
  ON inventory_balances(sku_size_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_category_macro_brand_style_color_size_v017
  ON inventory_balances(category, macro_department, brand, style, color, size);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_category_macro_updated_id_v017
  ON inventory_balances(category, macro_department, updated_at DESC, id);

CREATE TRIGGER IF NOT EXISTS trg_inventory_balances_size_alignment_insert_v017
BEFORE INSERT ON inventory_balances
WHEN NEW.sku_size_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sku_sizes ss
    WHERE ss.id = NEW.sku_size_id
      AND ss.sku_id = NEW.sku_id
  )
BEGIN
  SELECT RAISE(ABORT, 'inventory_balances sku_size_id must belong to sku_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_balances_size_alignment_update_v017
BEFORE UPDATE OF sku_id, sku_size_id ON inventory_balances
WHEN NEW.sku_size_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sku_sizes ss
    WHERE ss.id = NEW.sku_size_id
      AND ss.sku_id = NEW.sku_id
  )
BEGIN
  SELECT RAISE(ABORT, 'inventory_balances sku_size_id must belong to sku_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_balances_version_guard_v017
BEFORE UPDATE OF quantity_on_hand, quantity_reserved, version ON inventory_balances
WHEN (
    NEW.quantity_on_hand IS NOT OLD.quantity_on_hand
    OR NEW.quantity_reserved IS NOT OLD.quantity_reserved
  )
  AND NEW.version <> OLD.version + 1
BEGIN
  SELECT RAISE(ABORT, 'inventory_balances.version must increment by exactly 1 on balance mutations');
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_balances_touch_updated_at_v017
AFTER UPDATE ON inventory_balances
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE inventory_balances
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;

INSERT INTO inventory_balances (
  id,
  sku_id,
  sku_size_id,
  category,
  macro_department,
  brand,
  style,
  color,
  size,
  quantity_on_hand,
  quantity_reserved,
  version
)
SELECT
  lower(hex(randomblob(16))) AS id,
  i.sku_id,
  i.sku_size_id,
  c.rics_code AS category,
  c.dept_macro AS macro_department,
  s.brand_id AS brand,
  trim(s.style) AS style,
  s.color_id AS color,
  COALESCE(NULLIF(trim(ss.size_label), ''), 'NO_SIZE') AS size,
  SUM(i.quantity_on_hand) AS quantity_on_hand,
  SUM(i.quantity_reserved) AS quantity_reserved,
  1 AS version
FROM inventory i
JOIN skus s ON s.id = i.sku_id
JOIN ref_categories c ON c.id = s.category_id
LEFT JOIN sku_sizes ss ON ss.id = i.sku_size_id
GROUP BY
  i.sku_id,
  i.sku_size_id,
  c.rics_code,
  c.dept_macro,
  s.brand_id,
  trim(s.style),
  s.color_id,
  COALESCE(NULLIF(trim(ss.size_label), ''), 'NO_SIZE');

CREATE TABLE IF NOT EXISTS schema_table_comments (
  table_name TEXT PRIMARY KEY,
  comment TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR REPLACE INTO schema_table_comments (table_name, comment) VALUES
  ('inventory_balances', 'Denormalized stock snapshot at SKU-size grain with category/macro/brand/style/color/size filter keys and optimistic-concurrency versioning for movement commands.');

COMMIT;
