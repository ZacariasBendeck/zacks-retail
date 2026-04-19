-- Migration 010 (UP)
-- RICS import staging model + SKU natural key integrity + schema comments registry
--
-- Non-obvious design decisions:
-- 1) SKU natural identity is enforced at the SKU level with (brand_id, style, color_id),
--    while size uniqueness remains enforced in sku_sizes (sku_id, size_label).
-- 2) SQLite has no NOT VALID constraint mode, so triggers are used to enforce identity
--    requirements for new/updated rows without rewriting legacy records.
-- 3) SQLite has no native table COMMENT command, so table-level comments are stored
--    in schema_table_comments for documentation tooling and audits.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS schema_table_comments (
  table_name TEXT PRIMARY KEY,
  comment TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rics_import_batches (
  id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL DEFAULT 'RICS',
  source_location TEXT,
  department TEXT CHECK(department IN ('FORMAL','CASUAL','FIESTA','SANDALIAS','BOOTS','COMFORT')),
  import_month TEXT,
  requested_by TEXT NOT NULL DEFAULT 'system',
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','UPLOADED','VALIDATING','READY_TO_APPLY','APPLYING','APPLIED','FAILED','CANCELLED')),
  total_files INTEGER NOT NULL DEFAULT 0 CHECK(total_files >= 0),
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK(total_rows >= 0),
  valid_rows INTEGER NOT NULL DEFAULT 0 CHECK(valid_rows >= 0),
  invalid_rows INTEGER NOT NULL DEFAULT 0 CHECK(invalid_rows >= 0),
  applied_rows INTEGER NOT NULL DEFAULT 0 CHECK(applied_rows >= 0),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rics_import_batches_status_created_at
  ON rics_import_batches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rics_import_batches_department_month
  ON rics_import_batches(department, import_month);

CREATE TABLE IF NOT EXISTS rics_import_files (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES rics_import_batches(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  file_size_bytes INTEGER CHECK(file_size_bytes >= 0),
  status TEXT NOT NULL DEFAULT 'UPLOADED'
    CHECK(status IN ('UPLOADED','PARSED','VALIDATED','APPLIED','FAILED')),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count >= 0),
  valid_row_count INTEGER NOT NULL DEFAULT 0 CHECK(valid_row_count >= 0),
  invalid_row_count INTEGER NOT NULL DEFAULT 0 CHECK(invalid_row_count >= 0),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  parsed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(batch_id, file_name),
  UNIQUE(batch_id, file_sha256)
);

CREATE INDEX IF NOT EXISTS idx_rics_import_files_batch_id
  ON rics_import_files(batch_id);
CREATE INDEX IF NOT EXISTS idx_rics_import_files_status_uploaded_at
  ON rics_import_files(status, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS rics_import_rows (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES rics_import_files(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK(row_number > 0),
  dedupe_hash TEXT NOT NULL,
  vendor_code TEXT,
  brand_code TEXT,
  style TEXT,
  color_code TEXT,
  size_label TEXT,
  category_code INTEGER,
  season_code TEXT,
  heel_type TEXT,
  heel_material_code TEXT,
  raw_payload TEXT NOT NULL,
  normalized_payload TEXT,
  validation_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(validation_status IN ('PENDING','VALID','INVALID','DUPLICATE','APPLIED','SKIPPED')),
  validation_errors TEXT,
  target_sku_id TEXT REFERENCES skus(id) ON DELETE SET NULL,
  target_sku_size_id TEXT REFERENCES sku_sizes(id) ON DELETE SET NULL,
  applied_action TEXT
    CHECK(applied_action IN ('INSERT_SKU','UPDATE_SKU','UPSERT_INVENTORY','SKIP_INVALID','SKIP_DUPLICATE','NONE')),
  applied_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(file_id, row_number),
  UNIQUE(file_id, dedupe_hash)
);

CREATE INDEX IF NOT EXISTS idx_rics_import_rows_file_validation
  ON rics_import_rows(file_id, validation_status, row_number);
CREATE INDEX IF NOT EXISTS idx_rics_import_rows_dedupe_hash
  ON rics_import_rows(dedupe_hash);
CREATE INDEX IF NOT EXISTS idx_rics_import_rows_target_sku
  ON rics_import_rows(target_sku_id, target_sku_size_id);
CREATE INDEX IF NOT EXISTS idx_rics_import_rows_category_code
  ON rics_import_rows(category_code);

CREATE TABLE IF NOT EXISTS rics_import_quarantine (
  id TEXT PRIMARY KEY,
  import_row_id TEXT NOT NULL UNIQUE REFERENCES rics_import_rows(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  reason_detail TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED','IGNORED')),
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rics_import_quarantine_status_created_at
  ON rics_import_quarantine(status, created_at DESC);

CREATE TABLE IF NOT EXISTS rics_import_apply_log (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES rics_import_batches(id) ON DELETE CASCADE,
  import_row_id TEXT REFERENCES rics_import_rows(id) ON DELETE SET NULL,
  action TEXT NOT NULL
    CHECK(action IN ('INSERT_SKU','UPDATE_SKU','UPSERT_INVENTORY','SKIP_INVALID','SKIP_DUPLICATE','ERROR','NOOP')),
  target_table TEXT,
  target_id TEXT,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rics_import_apply_log_batch_created_at
  ON rics_import_apply_log(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rics_import_apply_log_row
  ON rics_import_apply_log(import_row_id);

-- Enforce natural identity for canonical SKU rows.
CREATE UNIQUE INDEX IF NOT EXISTS ux_skus_brand_style_color
  ON skus(brand_id, lower(trim(style)), color_id)
  WHERE brand_id IS NOT NULL AND color_id IS NOT NULL AND length(trim(style)) > 0;

CREATE TRIGGER IF NOT EXISTS trg_skus_require_natural_identity_insert
BEFORE INSERT ON skus
WHEN NEW.brand_id IS NULL
  OR NEW.color_id IS NULL
  OR NEW.style IS NULL
  OR length(trim(NEW.style)) = 0
BEGIN
  SELECT RAISE(ABORT, 'skus natural identity requires brand_id, style, and color_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_skus_require_natural_identity_update
BEFORE UPDATE ON skus
WHEN NEW.brand_id IS NULL
  OR NEW.color_id IS NULL
  OR NEW.style IS NULL
  OR length(trim(NEW.style)) = 0
BEGIN
  SELECT RAISE(ABORT, 'skus natural identity requires brand_id, style, and color_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_sku_sizes_require_nonblank_size_insert
BEFORE INSERT ON sku_sizes
WHEN NEW.size_label IS NULL OR length(trim(NEW.size_label)) = 0
BEGIN
  SELECT RAISE(ABORT, 'sku_sizes.size_label must be non-blank');
END;

CREATE TRIGGER IF NOT EXISTS trg_sku_sizes_require_nonblank_size_update
BEFORE UPDATE ON sku_sizes
WHEN NEW.size_label IS NULL OR length(trim(NEW.size_label)) = 0
BEGIN
  SELECT RAISE(ABORT, 'sku_sizes.size_label must be non-blank');
END;

INSERT OR REPLACE INTO schema_table_comments (table_name, comment) VALUES
  ('vendors', 'Master vendor registry with vendor code semantics, contact data, and purchasing terms.'),
  ('ref_categories', 'RICS category lookup (codes 556-599) mapped to macro-departments for reporting and OTB controls.'),
  ('skus', 'Canonical SKU master. Natural identity is enforced by brand+style+color uniqueness plus size uniqueness in sku_sizes.'),
  ('sku_sizes', 'Size-run rows linked to skus. One row per size label with unique (sku_id, size_label).'),
  ('inventory', 'Current stock by SKU and optional size row. Tracks on-hand and reserved quantities.'),
  ('purchase_orders', 'PO headers for receipts and vendor commitments.'),
  ('sales_transactions', 'Sale events used by inventory depletion and sell-through reporting.'),
  ('otb_budgets', 'Open-to-Buy monthly plan by macro-department, used to compare planned vs committed vs received spend.'),
  ('rics_import_batches', 'Top-level import execution unit for one RICS load cycle (department/month context and totals).'),
  ('rics_import_files', 'Physical files attached to a batch with parse/validation counters and dedupe fingerprint.'),
  ('rics_import_rows', 'Row-level normalized import payloads with validation status, dedupe hash, and target SKU linkage.'),
  ('rics_import_quarantine', 'Rows excluded from apply step pending manual resolution with reason tracking.'),
  ('rics_import_apply_log', 'Immutable apply ledger for inserts/updates/skips/errors during batch materialization.');

COMMIT;

