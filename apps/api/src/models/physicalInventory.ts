/**
 * Physical Inventory module — Phase 1.a (Slice 3) types and row mappers.
 *
 * See docs/modules/physical-inventory.md for the spec and
 * docs/superpowers/specs/2026-04-19-physical-inventory-p1a-slice3-design.md
 * for the P1.a deltas + open-question resolutions.
 *
 * Phase 1.a status pipeline:
 *   DRAFT → OPEN → COUNTING → READY_FOR_REVIEW → EXPORTED
 *   any non-terminal → CANCELLED
 * Forward-compat values (READY_FOR_UPDATE, POSTING, COMMITTED) exist on the
 * CHECK constraint but are not used in P1.a.
 */

// ── Status enums ────────────────────────────────────────────────────────────

export type CountSessionStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'COUNTING'
  | 'READY_FOR_REVIEW'
  | 'READY_FOR_UPDATE'
  | 'POSTING'
  | 'COMMITTED'
  | 'EXPORTED'
  | 'CANCELLED';

export const COUNT_SESSION_STATUSES: readonly CountSessionStatus[] = [
  'DRAFT', 'OPEN', 'COUNTING', 'READY_FOR_REVIEW',
  'READY_FOR_UPDATE', 'POSTING', 'COMMITTED', 'EXPORTED', 'CANCELLED',
] as const;

export type CountMode = 'ADDITIVE' | 'INDEPENDENT_VERIFICATION';
export const COUNT_MODES: readonly CountMode[] = ['ADDITIVE', 'INDEPENDENT_VERIFICATION'] as const;

export type CountBatchSource =
  | 'MOBILE_WEB'
  | 'HID_SCANNER'
  | 'CSV_IMPORT'
  | 'MANUAL_KEYED'
  | 'LEGACY_PERCON_BUFFER';
export const COUNT_BATCH_SOURCES: readonly CountBatchSource[] = [
  'MOBILE_WEB', 'HID_SCANNER', 'CSV_IMPORT', 'MANUAL_KEYED', 'LEGACY_PERCON_BUFFER',
] as const;

export type VarianceBand = 'ZERO' | 'LOW' | 'MATERIAL' | 'EXTREME';
export const VARIANCE_BANDS: readonly VarianceBand[] = ['ZERO', 'LOW', 'MATERIAL', 'EXTREME'] as const;

export type ReviewStep =
  | 'VIEWED_ITEMS_NOT_COUNTED'
  | 'VIEWED_VARIANCE'
  | 'ACK_MATERIAL_VARIANCES'
  | 'BACKUP_VERIFIED';
export const REVIEW_STEPS: readonly ReviewStep[] = [
  'VIEWED_ITEMS_NOT_COUNTED', 'VIEWED_VARIANCE', 'ACK_MATERIAL_VARIANCES', 'BACKUP_VERIFIED',
] as const;

export type WorksheetFormat = 'PDF' | 'CSV';

export type SnapshotSource = 'RICS_LIVE' | 'POSTGRES_PROJECTION';

// ── Scope ────────────────────────────────────────────────────────────────────

export interface CountSessionScope {
  all?: boolean;
  vendors?: number[];
  categories?: number[];
  seasons?: string[];
  groups?: string[];
  keywords?: string[];
  skus?: string[];
  sizeTypes?: number[];
}

// ── count_sessions ───────────────────────────────────────────────────────────

export interface CountSessionRow {
  id: string;
  session_number: string;
  store_id: number;
  status: CountSessionStatus;
  mode: CountMode;
  independent_verification_n: number | null;
  scope_json: string;
  lock_store_during_count: number;
  join_code: string | null;
  join_code_qr_payload: string | null;
  opened_by: string;
  opened_at: string;
  frozen_at: string | null;
  review_started_at: string | null;
  exported_at: string | null;
  exported_by: string | null;
  posting_started_at: string | null;
  committed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  retention_expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CountSession {
  id: string;
  sessionNumber: string;
  storeId: number;
  status: CountSessionStatus;
  mode: CountMode;
  independentVerificationN: number | null;
  scope: CountSessionScope;
  lockStoreDuringCount: boolean;
  joinCode: string | null;
  joinCodeQrPayload: string | null;
  openedBy: string;
  openedAt: string;
  frozenAt: string | null;
  reviewStartedAt: string | null;
  exportedAt: string | null;
  exportedBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancelledBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function rowToCountSession(row: CountSessionRow): CountSession {
  let scope: CountSessionScope;
  try {
    scope = JSON.parse(row.scope_json) as CountSessionScope;
  } catch {
    scope = { all: true };
  }
  return {
    id: row.id,
    sessionNumber: row.session_number,
    storeId: row.store_id,
    status: row.status,
    mode: row.mode,
    independentVerificationN: row.independent_verification_n,
    scope,
    lockStoreDuringCount: row.lock_store_during_count === 1,
    joinCode: row.join_code,
    joinCodeQrPayload: row.join_code_qr_payload,
    openedBy: row.opened_by,
    openedAt: row.opened_at,
    frozenAt: row.frozen_at,
    reviewStartedAt: row.review_started_at,
    exportedAt: row.exported_at,
    exportedBy: row.exported_by,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    cancelledBy: row.cancelled_by,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── count_session_snapshots + cells ──────────────────────────────────────────

export interface CountSessionSnapshotRow {
  id: string;
  session_id: string;
  taken_at: string;
  cell_count: number;
  total_units_on_hand: number;
  total_cost_value: number;
  source: SnapshotSource;
  created_at: string;
}

export interface CountSessionSnapshot {
  id: string;
  sessionId: string;
  takenAt: string;
  cellCount: number;
  totalUnitsOnHand: number;
  totalCostValue: number;
  source: SnapshotSource;
  createdAt: string;
}

export function rowToSnapshot(row: CountSessionSnapshotRow): CountSessionSnapshot {
  return {
    id: row.id,
    sessionId: row.session_id,
    takenAt: row.taken_at,
    cellCount: row.cell_count,
    totalUnitsOnHand: row.total_units_on_hand,
    totalCostValue: row.total_cost_value,
    source: row.source,
    createdAt: row.created_at,
  };
}

export interface CountSessionSnapshotCellRow {
  id: string;
  session_snapshot_id: string;
  sku_id: string;
  column_label: string;
  row_label: string;
  snapshot_on_hand: number;
  snapshot_avg_cost: number | null;
  snapshot_retail: number | null;
  created_at: string;
}

export interface CountSessionSnapshotCell {
  id: string;
  sessionSnapshotId: string;
  skuId: string;
  columnLabel: string;
  rowLabel: string;
  snapshotOnHand: number;
  snapshotAvgCost: number | null;
  snapshotRetail: number | null;
  createdAt: string;
}

export function rowToSnapshotCell(row: CountSessionSnapshotCellRow): CountSessionSnapshotCell {
  return {
    id: row.id,
    sessionSnapshotId: row.session_snapshot_id,
    skuId: row.sku_id,
    columnLabel: row.column_label,
    rowLabel: row.row_label,
    snapshotOnHand: row.snapshot_on_hand,
    snapshotAvgCost: row.snapshot_avg_cost,
    snapshotRetail: row.snapshot_retail,
    createdAt: row.created_at,
  };
}

// ── count_batches ────────────────────────────────────────────────────────────

export interface CountBatchRow {
  id: string;
  session_id: string;
  source: CountBatchSource;
  device_id: string | null;
  device_label: string | null;
  counter_user_id: string | null;
  imported_at: string;
  acknowledged_at: string | null;
  exceptions_json: string | null;
  raw_payload_ref: string | null;
  created_at: string;
}

export interface CountBatch {
  id: string;
  sessionId: string;
  source: CountBatchSource;
  deviceId: string | null;
  deviceLabel: string | null;
  counterUserId: string | null;
  importedAt: string;
  acknowledgedAt: string | null;
  exceptions: unknown | null;
  rawPayloadRef: string | null;
  createdAt: string;
}

export function rowToCountBatch(row: CountBatchRow): CountBatch {
  let exceptions: unknown = null;
  if (row.exceptions_json) {
    try {
      exceptions = JSON.parse(row.exceptions_json);
    } catch {
      exceptions = null;
    }
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    source: row.source,
    deviceId: row.device_id,
    deviceLabel: row.device_label,
    counterUserId: row.counter_user_id,
    importedAt: row.imported_at,
    acknowledgedAt: row.acknowledged_at,
    exceptions,
    rawPayloadRef: row.raw_payload_ref,
    createdAt: row.created_at,
  };
}

// ── count_entries ────────────────────────────────────────────────────────────

export interface CountEntryRow {
  id: string;
  session_id: string;
  batch_id: string;
  sku_id: string;
  column_label: string;
  row_label: string;
  quantity: number;
  scanned_at: string;
  counter_user_id: string | null;
  is_zero_flag: number;
  created_at: string;
}

export interface CountEntry {
  id: string;
  sessionId: string;
  batchId: string;
  skuId: string;
  columnLabel: string;
  rowLabel: string;
  quantity: number;
  scannedAt: string;
  counterUserId: string | null;
  isZeroFlag: boolean;
  createdAt: string;
}

export function rowToCountEntry(row: CountEntryRow): CountEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    batchId: row.batch_id,
    skuId: row.sku_id,
    columnLabel: row.column_label,
    rowLabel: row.row_label,
    quantity: row.quantity,
    scannedAt: row.scanned_at,
    counterUserId: row.counter_user_id,
    isZeroFlag: row.is_zero_flag === 1,
    createdAt: row.created_at,
  };
}

// ── Service input shapes ─────────────────────────────────────────────────────

export interface CreateSessionInput {
  storeId: number;
  openedBy: string;
  scope?: CountSessionScope;
  mode?: CountMode;
  independentVerificationN?: number;
  lockStoreDuringCount?: boolean;
  notes?: string;
}

export interface AddEntryInput {
  batchId?: string;
  skuId: string;
  columnLabel?: string;
  rowLabel?: string;
  quantity?: number;
  isZero?: boolean;
  counterUserId?: string;
}

export interface BulkEntryCell {
  columnLabel?: string;
  rowLabel?: string;
  quantity: number;
}

export interface BulkEntryInput {
  batchId: string;
  skuId: string;
  cells: BulkEntryCell[];
  counterUserId?: string;
}

export interface CancelSessionInput {
  reason: string;
  cancelledBy: string;
}

export interface ListSessionsParams {
  storeId?: number;
  status?: CountSessionStatus;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

// ── Aggregations ────────────────────────────────────────────────────────────

export interface CellRunningTotal {
  skuId: string;
  columnLabel: string;
  rowLabel: string;
  totalQuantity: number;
  entryCount: number;
  hasZeroFlag: boolean;
}
