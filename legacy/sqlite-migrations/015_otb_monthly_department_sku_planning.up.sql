-- Migration 015 (UP)
-- OTB month/department/SKU(size) financial planning schema
--
-- Non-obvious design decisions:
-- 1) The line grain references otb_budgets for the month+department dimension,
--    so period and macro-department remain normalized instead of duplicated.
-- 2) sku_id and sku_size_id are both stored to enforce full SKU identity
--    (brand+style+color+size) while keeping lookup/index paths explicit.
-- 3) Variance fields stay derivable in a read view to avoid duplicate persisted math.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS schema_table_comments (
  table_name TEXT PRIMARY KEY,
  comment TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otb_monthly_department_sku_plan (
  id TEXT PRIMARY KEY,
  otb_budget_id TEXT NOT NULL REFERENCES otb_budgets(id) ON DELETE CASCADE,
  sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
  sku_size_id TEXT NOT NULL REFERENCES sku_sizes(id) ON DELETE RESTRICT,
  budget_amount REAL NOT NULL CHECK(budget_amount >= 0),
  committed_amount REAL NOT NULL DEFAULT 0 CHECK(committed_amount >= 0),
  received_amount REAL NOT NULL DEFAULT 0 CHECK(received_amount >= 0),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(otb_budget_id, sku_size_id),
  CHECK(committed_amount <= budget_amount),
  CHECK(received_amount <= committed_amount)
);

CREATE INDEX IF NOT EXISTS idx_otb_monthly_sku_plan_budget_id_v015
  ON otb_monthly_department_sku_plan(otb_budget_id);
CREATE INDEX IF NOT EXISTS idx_otb_monthly_sku_plan_sku_id_v015
  ON otb_monthly_department_sku_plan(sku_id);
CREATE INDEX IF NOT EXISTS idx_otb_monthly_sku_plan_sku_size_id_v015
  ON otb_monthly_department_sku_plan(sku_size_id);
CREATE INDEX IF NOT EXISTS idx_otb_monthly_sku_plan_budget_updated_v015
  ON otb_monthly_department_sku_plan(otb_budget_id, updated_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_size_alignment_insert_v015
BEFORE INSERT ON otb_monthly_department_sku_plan
WHEN NOT EXISTS (
  SELECT 1
  FROM sku_sizes ss
  WHERE ss.id = NEW.sku_size_id
    AND ss.sku_id = NEW.sku_id
)
BEGIN
  SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan sku_size_id must belong to sku_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_size_alignment_update_v015
BEFORE UPDATE OF sku_id, sku_size_id ON otb_monthly_department_sku_plan
WHEN NOT EXISTS (
  SELECT 1
  FROM sku_sizes ss
  WHERE ss.id = NEW.sku_size_id
    AND ss.sku_id = NEW.sku_id
)
BEGIN
  SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan sku_size_id must belong to sku_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_department_alignment_insert_v015
BEFORE INSERT ON otb_monthly_department_sku_plan
WHEN NOT EXISTS (
  SELECT 1
  FROM otb_budgets b
  JOIN skus s ON s.id = NEW.sku_id
  WHERE b.id = NEW.otb_budget_id
    AND b.department = s.department
)
BEGIN
  SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan otb_budget department must match skus.department');
END;

CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_department_alignment_update_v015
BEFORE UPDATE OF otb_budget_id, sku_id ON otb_monthly_department_sku_plan
WHEN NOT EXISTS (
  SELECT 1
  FROM otb_budgets b
  JOIN skus s ON s.id = NEW.sku_id
  WHERE b.id = NEW.otb_budget_id
    AND b.department = s.department
)
BEGIN
  SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan otb_budget department must match skus.department');
END;

CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_category_guardrail_insert_v015
BEFORE INSERT ON otb_monthly_department_sku_plan
WHEN NOT EXISTS (
  SELECT 1
  FROM skus s
  JOIN ref_categories c ON c.id = s.category_id
  WHERE s.id = NEW.sku_id
    AND c.rics_code BETWEEN 556 AND 599
)
BEGIN
  SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan sku category must resolve to RICS 556-599');
END;

CREATE TRIGGER IF NOT EXISTS trg_otb_monthly_sku_plan_category_guardrail_update_v015
BEFORE UPDATE OF sku_id ON otb_monthly_department_sku_plan
WHEN NOT EXISTS (
  SELECT 1
  FROM skus s
  JOIN ref_categories c ON c.id = s.category_id
  WHERE s.id = NEW.sku_id
    AND c.rics_code BETWEEN 556 AND 599
)
BEGIN
  SELECT RAISE(ABORT, 'otb_monthly_department_sku_plan sku category must resolve to RICS 556-599');
END;

CREATE VIEW IF NOT EXISTS v_otb_monthly_department_sku_plan AS
SELECT
  p.id,
  p.otb_budget_id,
  b.department AS macro_department,
  b.year,
  b.month,
  printf('%04d-%02d', b.year, b.month) AS plan_month,
  p.sku_id,
  p.sku_size_id,
  sz.size_label,
  s.brand_id,
  s.style,
  s.color_id,
  s.category_id,
  p.budget_amount,
  p.committed_amount,
  p.received_amount,
  p.budget_amount - p.committed_amount AS remaining_to_commit_amount,
  p.committed_amount - p.received_amount AS remaining_to_receive_amount,
  p.budget_amount - p.received_amount AS budget_vs_received_variance_amount,
  p.notes,
  p.created_at,
  p.updated_at
FROM otb_monthly_department_sku_plan p
JOIN otb_budgets b ON b.id = p.otb_budget_id
JOIN skus s ON s.id = p.sku_id
JOIN sku_sizes sz ON sz.id = p.sku_size_id;

INSERT OR REPLACE INTO schema_table_comments (table_name, comment) VALUES
  ('otb_monthly_department_sku_plan', 'Monthly OTB planning lines at SKU-size grain with budget/committed/received financials. Enforces department and womens-category guardrails.'),
  ('v_otb_monthly_department_sku_plan', 'Read model for month+department+SKU-size OTB financials with derivable variance metrics.');

COMMIT;
