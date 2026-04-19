-- Migration 020 (UP)
-- Physical Inventory module — Phase 1.a (Slice 3) foundations.
--
-- Phase 1.a behavior: count sessions live in this admin DB; the snapshot at
-- freeze is a one-time read against RICS Inventory Quantities (wide-column
-- OnHand_01..18 unwound by ricsInventoryAdapter); no commit-back to any
-- inventory ledger. RICS remains authoritative for on-hand. Operators key
-- the variance into RICS by hand after EXPORT.
--
-- Status pipeline in P1.a:
--   DRAFT → OPEN → COUNTING → READY_FOR_REVIEW → EXPORTED
--   Any non-terminal → CANCELLED
-- Forward-compat values (READY_FOR_UPDATE, POSTING, COMMITTED) are present in
-- the CHECK constraint so a future Phase-2 migration can use them without an
-- ALTER TABLE.

BEGIN TRANSACTION;

-- ── count_sessions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS count_sessions (
  id TEXT PRIMARY KEY,
  session_number TEXT NOT NULL UNIQUE,
  store_id INTEGER NOT NULL,
  status TEXT NOT NULL
    CHECK(status IN (
      'DRAFT', 'OPEN', 'COUNTING', 'READY_FOR_REVIEW',
      'READY_FOR_UPDATE', 'POSTING', 'COMMITTED', 'EXPORTED', 'CANCELLED'
    )),
  mode TEXT NOT NULL DEFAULT 'ADDITIVE'
    CHECK(mode IN ('ADDITIVE', 'INDEPENDENT_VERIFICATION')),
  independent_verification_n INTEGER,
  scope_json TEXT NOT NULL DEFAULT '{"all":true}',
  lock_store_during_count INTEGER NOT NULL DEFAULT 0
    CHECK(lock_store_during_count IN (0, 1)),
  join_code TEXT,
  join_code_qr_payload TEXT,
  opened_by TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  frozen_at TEXT,
  review_started_at TEXT,
  exported_at TEXT,
  exported_by TEXT,
  posting_started_at TEXT,
  committed_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  cancelled_by TEXT,
  retention_expires_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(
    (mode = 'ADDITIVE' AND independent_verification_n IS NULL) OR
    (mode = 'INDEPENDENT_VERIFICATION' AND independent_verification_n >= 2)
  )
);

CREATE INDEX IF NOT EXISTS idx_count_sessions_store_status_v020
  ON count_sessions(store_id, status);
CREATE INDEX IF NOT EXISTS idx_count_sessions_status_opened_at_v020
  ON count_sessions(status, opened_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_count_sessions_join_code_v020
  ON count_sessions(join_code) WHERE join_code IS NOT NULL;

-- ── count_session_snapshots ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS count_session_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE
    REFERENCES count_sessions(id) ON DELETE RESTRICT,
  taken_at TEXT NOT NULL,
  cell_count INTEGER NOT NULL DEFAULT 0,
  total_units_on_hand INTEGER NOT NULL DEFAULT 0,
  total_cost_value REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'RICS_LIVE'
    CHECK(source IN ('RICS_LIVE', 'POSTGRES_PROJECTION')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── count_session_snapshot_cells ─────────────────────────────────────────────
-- One row per (snapshot, sku, cell). Queryable + indexable per OQ #1
-- resolution. Powers Items Not Counted enumeration and variance computation.

CREATE TABLE IF NOT EXISTS count_session_snapshot_cells (
  id TEXT PRIMARY KEY,
  session_snapshot_id TEXT NOT NULL
    REFERENCES count_session_snapshots(id) ON DELETE CASCADE,
  sku_id TEXT NOT NULL,
  column_label TEXT NOT NULL DEFAULT '',
  row_label TEXT NOT NULL DEFAULT '',
  snapshot_on_hand INTEGER NOT NULL,
  snapshot_avg_cost REAL,
  snapshot_retail REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_count_session_snapshot_cells_cell_v020
  ON count_session_snapshot_cells(session_snapshot_id, sku_id, column_label, row_label);
CREATE INDEX IF NOT EXISTS idx_count_session_snapshot_cells_snapshot_v020
  ON count_session_snapshot_cells(session_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_count_session_snapshot_cells_sku_v020
  ON count_session_snapshot_cells(sku_id);

-- ── count_batches ────────────────────────────────────────────────────────────
-- One ingest event: one mobile-session, one CSV upload, one manual save burst.
-- The Percon-style "exactly one in-flight buffer" rule is enforced at the
-- service layer via acknowledged_at, not at the schema level.

CREATE TABLE IF NOT EXISTS count_batches (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL
    REFERENCES count_sessions(id) ON DELETE RESTRICT,
  source TEXT NOT NULL
    CHECK(source IN ('MOBILE_WEB', 'HID_SCANNER', 'CSV_IMPORT', 'MANUAL_KEYED', 'LEGACY_PERCON_BUFFER')),
  device_id TEXT,
  device_label TEXT,
  counter_user_id TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  exceptions_json TEXT,
  raw_payload_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_count_batches_session_v020
  ON count_batches(session_id, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_count_batches_source_v020
  ON count_batches(source, imported_at DESC);

-- ── count_entries ────────────────────────────────────────────────────────────
-- Append-only per-scan/per-save. Additive semantics — running cell total is
-- SUM(quantity) over (session_id, sku_id, column_label, row_label).
-- is_zero_flag distinguishes "this whole SKU is physically absent — set every
-- cell to zero on export" from "this specific cell is empty" (quantity = 0).

CREATE TABLE IF NOT EXISTS count_entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL
    REFERENCES count_sessions(id) ON DELETE RESTRICT,
  batch_id TEXT NOT NULL
    REFERENCES count_batches(id) ON DELETE RESTRICT,
  sku_id TEXT NOT NULL,
  column_label TEXT NOT NULL DEFAULT '',
  row_label TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL,
  scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
  counter_user_id TEXT,
  is_zero_flag INTEGER NOT NULL DEFAULT 0
    CHECK(is_zero_flag IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_count_entries_session_sku_cell_v020
  ON count_entries(session_id, sku_id, column_label, row_label);
CREATE INDEX IF NOT EXISTS idx_count_entries_session_scanned_at_v020
  ON count_entries(session_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_count_entries_batch_v020
  ON count_entries(batch_id);

-- ── count_variances ──────────────────────────────────────────────────────────
-- Computed at READY_FOR_REVIEW. One row per cell with at least one entry.
-- band is set against thresholds in store-ops.CompanyPhysicalInventorySettings
-- (deferred to Wave 2 — for Wave 1 the table exists but no rows are written).

CREATE TABLE IF NOT EXISTS count_variances (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL
    REFERENCES count_sessions(id) ON DELETE CASCADE,
  sku_id TEXT NOT NULL,
  column_label TEXT NOT NULL DEFAULT '',
  row_label TEXT NOT NULL DEFAULT '',
  counted_qty INTEGER NOT NULL,
  snapshot_on_hand INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  unit_cost REAL,
  variance_pct REAL,
  band TEXT NOT NULL
    CHECK(band IN ('ZERO', 'LOW', 'MATERIAL', 'EXTREME')),
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_count_variances_session_cell_v020
  ON count_variances(session_id, sku_id, column_label, row_label);
CREATE INDEX IF NOT EXISTS idx_count_variances_session_band_v020
  ON count_variances(session_id, band);

-- ── count_review_acks ────────────────────────────────────────────────────────
-- The "Have You?" gate (RICS Ch. 10 p. 140) — one row per (session, step) once
-- the operator confirms a precondition.

CREATE TABLE IF NOT EXISTS count_review_acks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL
    REFERENCES count_sessions(id) ON DELETE CASCADE,
  step TEXT NOT NULL
    CHECK(step IN ('VIEWED_ITEMS_NOT_COUNTED', 'VIEWED_VARIANCE', 'ACK_MATERIAL_VARIANCES', 'BACKUP_VERIFIED')),
  acknowledged_by TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_count_review_acks_session_step_v020
  ON count_review_acks(session_id, step);

-- ── worksheet_exports ────────────────────────────────────────────────────────
-- Audit row per generated worksheet. Independent of any session.

CREATE TABLE IF NOT EXISTS worksheet_exports (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL,
  filters_json TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('PDF', 'CSV')),
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  artifact_ref TEXT,
  row_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_worksheet_exports_store_v020
  ON worksheet_exports(store_id, generated_at DESC);

-- ── schema comments ──────────────────────────────────────────────────────────

INSERT OR REPLACE INTO schema_table_comments (table_name, comment) VALUES
  ('count_sessions',                'Physical inventory count session — one stocktake event per (store, cycle).'),
  ('count_session_snapshots',       'Frozen on-hand baseline taken at session freeze. P1.a reads from RICS live.'),
  ('count_session_snapshot_cells',  'Per-cell snapshot rows. Queryable for items-not-counted enumeration.'),
  ('count_batches',                 'One ingest event (mobile session, CSV upload, manual save burst).'),
  ('count_entries',                 'Append-only per-scan additive count entries.'),
  ('count_variances',               'Per-cell variance computed at READY_FOR_REVIEW.'),
  ('count_review_acks',             'Operator acknowledgements gating the export step.'),
  ('worksheet_exports',             'Audit log of generated count worksheets.');

COMMIT;
