-- Deprecated filename retained for compatibility.
-- Active migration spec lives at 011_womens_category_guardrails_and_perf.up.sql.

-- Migration 011 (UP)
-- Womens-category guardrails + targeted performance indexes
--
-- Non-obvious design decisions:
-- 1) The canonical category master (ref_categories) stays unrestricted so non-womens
--    category rows can still exist for broader catalog use cases.
-- 2) Womens enforcement is implemented through a derived subset table plus SKU
--    write-time triggers. This is the SQLite-safe equivalent of adding a NOT VALID
--    FK and validating incrementally later.
-- 3) The UPDATE guardrail trigger only evaluates when category_id changes, so legacy
--    out-of-policy SKUs are not blocked from unrelated updates during rollout.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS schema_table_comments (
  table_name TEXT PRIMARY KEY,
  comment TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS womens_shoe_categories (
  category_id INTEGER PRIMARY KEY REFERENCES ref_categories(id) ON DELETE CASCADE,
  rics_code INTEGER NOT NULL UNIQUE,
  dept_macro TEXT NOT NULL CHECK(dept_macro IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')),
  active INTEGER NOT NULL DEFAULT 1,
  source_updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO womens_shoe_categories (category_id, rics_code, dept_macro, active)
SELECT
  c.id,
  c.rics_code,
  c.dept_macro,
  c.active
FROM ref_categories c
WHERE c.rics_code BETWEEN 556 AND 599;

CREATE TRIGGER IF NOT EXISTS trg_womens_shoe_categories_sync_insert_v011
AFTER INSERT ON ref_categories
WHEN NEW.rics_code BETWEEN 556 AND 599
BEGIN
  INSERT OR REPLACE INTO womens_shoe_categories (
    category_id,
    rics_code,
    dept_macro,
    active,
    source_updated_at
  ) VALUES (
    NEW.id,
    NEW.rics_code,
    NEW.dept_macro,
    NEW.active,
    datetime('now')
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_womens_shoe_categories_sync_update_in_range_v011
AFTER UPDATE OF rics_code, dept_macro, active ON ref_categories
WHEN NEW.rics_code BETWEEN 556 AND 599
BEGIN
  INSERT OR REPLACE INTO womens_shoe_categories (
    category_id,
    rics_code,
    dept_macro,
    active,
    source_updated_at
  ) VALUES (
    NEW.id,
    NEW.rics_code,
    NEW.dept_macro,
    NEW.active,
    datetime('now')
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_womens_shoe_categories_sync_update_out_range_v011
AFTER UPDATE OF rics_code ON ref_categories
WHEN OLD.rics_code BETWEEN 556 AND 599
  AND (NEW.rics_code < 556 OR NEW.rics_code > 599)
BEGIN
  DELETE FROM womens_shoe_categories
  WHERE category_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_womens_shoe_categories_sync_delete_v011
AFTER DELETE ON ref_categories
WHEN OLD.rics_code BETWEEN 556 AND 599
BEGIN
  DELETE FROM womens_shoe_categories
  WHERE category_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_skus_womens_category_guardrail_insert_v011
BEFORE INSERT ON skus
WHEN NEW.category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM womens_shoe_categories w
    WHERE w.category_id = NEW.category_id
  )
BEGIN
  SELECT RAISE(ABORT, 'skus.category_id must map to womens_shoe_categories');
END;

CREATE TRIGGER IF NOT EXISTS trg_skus_womens_category_guardrail_update_v011
BEFORE UPDATE OF category_id ON skus
WHEN NEW.category_id IS NOT OLD.category_id
  AND NEW.category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM womens_shoe_categories w
    WHERE w.category_id = NEW.category_id
  )
BEGIN
  SELECT RAISE(ABORT, 'skus.category_id must map to womens_shoe_categories');
END;

CREATE VIEW IF NOT EXISTS v_sku_category_guardrail_violations AS
SELECT
  s.id,
  s.sku_code,
  s.category_id,
  c.rics_code,
  c.name AS category_name,
  c.dept_macro,
  s.department,
  s.active,
  s.updated_at
FROM skus s
LEFT JOIN ref_categories c ON c.id = s.category_id
LEFT JOIN womens_shoe_categories w ON w.category_id = s.category_id
WHERE s.category_id IS NOT NULL
  AND w.category_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_womens_shoe_categories_dept_rics_v011
  ON womens_shoe_categories(dept_macro, rics_code);
CREATE INDEX IF NOT EXISTS idx_skus_category_active_created_v011
  ON skus(category_id, active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_sku_size_v011
  ON inventory(sku_id, sku_size_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_sku_po_v011
  ON purchase_order_lines(sku_id, po_id);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_sku_sold_at_v011
  ON sales_transactions(sku_id, sold_at DESC);

INSERT OR REPLACE INTO schema_table_comments (table_name, comment) VALUES
  ('womens_shoe_categories', 'Derived subset of ref_categories limited to womens guardrail codes (556-599). Used for SKU category gating without globally restricting the canonical category master.'),
  ('v_sku_category_guardrail_violations', 'Diagnostic view listing SKUs whose category_id is outside womens_shoe_categories. Use this to remediate legacy rows before full policy freeze.');

COMMIT;

