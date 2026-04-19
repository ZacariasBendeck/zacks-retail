/**
 * Physical Inventory module — Phase 1.a (Slice 3) service layer.
 *
 * Wave 1 scope: lifecycle (create → open → freeze → cancel) plus the entry
 * write path (add single + bulk). Variance computation, items-not-counted,
 * exports, mobile join, batch ingestion, conflict detection, and notifications
 * land in later waves.
 *
 * P1.a notes:
 *  - Snapshot at freeze is a live read against RICS via getSkuStoreCellRollup.
 *  - sku_id columns are the RICS SKU code (opaque string), not a local UUID.
 *    No FK to skus(id) — RICS owns product identity in Phase 1.
 *  - There is no commit-back. Terminal status is EXPORTED (Wave 2).
 */

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import {
  getSkuStoreCellRollup,
  type SkuStoreRollupParams,
} from './ricsInventoryAdapter';
import {
  CountSession,
  CountSessionRow,
  CountSessionStatus,
  CountSessionScope,
  CountSessionSnapshot,
  CountSessionSnapshotRow,
  CountBatch,
  CountBatchRow,
  CountBatchSource,
  CountEntry,
  CountEntryRow,
  CellRunningTotal,
  CreateSessionInput,
  AddEntryInput,
  BulkEntryInput,
  CancelSessionInput,
  ListSessionsParams,
  rowToCountSession,
  rowToSnapshot,
  rowToCountBatch,
  rowToCountEntry,
  CountVariance,
  CountVarianceRow,
  CountReviewAck,
  CountReviewAckRow,
  CompanyPhysicalInventorySettings,
  CompanyPhysicalInventorySettingsRow,
  ItemNotCountedRow,
  ItemNotCountedListParams,
  VarianceBand,
  VarianceSummary,
  VarianceBandRollup,
  ConflictRow,
  CsvImportException,
  CsvImportResult,
  ReviewStep,
  REVIEW_STEPS,
  rowToCountVariance,
  rowToCountReviewAck,
  rowToSettings,
} from '../models/physicalInventory';
import { physicalInventoryEvents } from './physicalInventoryEvents';

type Db = ReturnType<typeof getDb>;

// ── Errors (string codes — caller maps to HTTP status) ──────────────────────

export class PhysicalInventoryError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'PhysicalInventoryError';
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateJoinCode(): string {
  // 6 digits, no leading zero so it always renders as 6 chars in any UI.
  return String(100_000 + Math.floor(Math.random() * 900_000));
}

function generateUniqueJoinCode(db: Db): string {
  for (let i = 0; i < 20; i++) {
    const code = generateJoinCode();
    const existing = db.prepare('SELECT id FROM count_sessions WHERE join_code = ?').get(code);
    if (!existing) return code;
  }
  throw new PhysicalInventoryError('JOIN_CODE_EXHAUSTED');
}

function generateSessionNumber(db: Db, storeId: number): string {
  const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
  const prefix = `PI-S${String(storeId).padStart(2, '0')}-${yyyymm}`;
  const row = db
    .prepare(`SELECT COUNT(*) AS cnt FROM count_sessions WHERE session_number LIKE ?`)
    .get(`${prefix}-%`) as { cnt: number };
  return `${prefix}-${String(row.cnt + 1).padStart(3, '0')}`;
}

function loadSession(db: Db, id: string): CountSessionRow | null {
  const row = db.prepare('SELECT * FROM count_sessions WHERE id = ?').get(id) as
    | unknown
    | undefined;
  return (row as CountSessionRow | undefined) ?? null;
}

function requireSession(db: Db, id: string): CountSessionRow {
  const row = loadSession(db, id);
  if (!row) throw new PhysicalInventoryError('SESSION_NOT_FOUND');
  return row;
}

function assertStatus(
  row: CountSessionRow,
  allowed: readonly CountSessionStatus[],
): void {
  if (!allowed.includes(row.status)) {
    throw new PhysicalInventoryError(
      'INVALID_STATUS_TRANSITION',
      `Session ${row.id} is in status ${row.status}; expected one of ${allowed.join(', ')}.`,
    );
  }
}

type FieldValue = string | number | null;

function touchSession(db: Db, id: string, fields: Record<string, FieldValue>): void {
  const keys = Object.keys(fields);
  if (keys.length === 0) {
    db.prepare(`UPDATE count_sessions SET updated_at = datetime('now') WHERE id = ?`).run(id);
    return;
  }
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values: FieldValue[] = keys.map((k) => fields[k]);
  db.prepare(
    `UPDATE count_sessions SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
  ).run(...values, id);
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export function createSession(input: CreateSessionInput): CountSession {
  const db = getDb();

  if (input.mode === 'INDEPENDENT_VERIFICATION') {
    const n = input.independentVerificationN ?? 2;
    if (n < 2) throw new PhysicalInventoryError('INVALID_INDEPENDENT_VERIFICATION_N');
  }

  const id = uuidv4();
  const sessionNumber = generateSessionNumber(db, input.storeId);
  const scope = input.scope ?? { all: true };
  const mode = input.mode ?? 'ADDITIVE';
  const ivN = mode === 'INDEPENDENT_VERIFICATION' ? input.independentVerificationN ?? 2 : null;

  db.prepare(
    `INSERT INTO count_sessions
      (id, session_number, store_id, status, mode, independent_verification_n,
       scope_json, lock_store_during_count, opened_by, notes)
     VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionNumber,
    input.storeId,
    mode,
    ivN,
    JSON.stringify(scope),
    input.lockStoreDuringCount ? 1 : 0,
    input.openedBy,
    input.notes ?? null,
  );

  const row = requireSession(db, id);
  return rowToCountSession(row);
}

export function listSessions(params: ListSessionsParams = {}): CountSession[] {
  const db = getDb();
  const wheres: string[] = [];
  const args: FieldValue[] = [];
  if (params.storeId != null) {
    wheres.push('store_id = ?');
    args.push(params.storeId);
  }
  if (params.status) {
    wheres.push('status = ?');
    args.push(params.status);
  }
  if (params.fromDate) {
    wheres.push('opened_at >= ?');
    args.push(params.fromDate);
  }
  if (params.toDate) {
    wheres.push('opened_at <= ?');
    args.push(params.toDate);
  }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT * FROM count_sessions ${where} ORDER BY opened_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, offset) as unknown as CountSessionRow[];
  return rows.map(rowToCountSession);
}

export function getSession(id: string): CountSession | null {
  const db = getDb();
  const row = loadSession(db, id);
  return row ? rowToCountSession(row) : null;
}

export interface SessionDetails {
  session: CountSession;
  snapshot: CountSessionSnapshot | null;
  batchCount: number;
  entryCount: number;
  uniqueSkusCounted: number;
  totalUnitsCounted: number;
}

export function getSessionDetails(id: string): SessionDetails | null {
  const db = getDb();
  const row = loadSession(db, id);
  if (!row) return null;

  const snapshotRow = db
    .prepare('SELECT * FROM count_session_snapshots WHERE session_id = ?')
    .get(id) as unknown as CountSessionSnapshotRow | undefined;

  const batchCount = (
    db.prepare('SELECT COUNT(*) AS c FROM count_batches WHERE session_id = ?').get(id) as {
      c: number;
    }
  ).c;
  const entryCount = (
    db.prepare('SELECT COUNT(*) AS c FROM count_entries WHERE session_id = ?').get(id) as {
      c: number;
    }
  ).c;
  const uniqueSkusCounted = (
    db
      .prepare('SELECT COUNT(DISTINCT sku_id) AS c FROM count_entries WHERE session_id = ?')
      .get(id) as { c: number }
  ).c;
  const totalUnitsCounted = (
    db
      .prepare(
        `SELECT COALESCE(SUM(quantity), 0) AS s FROM count_entries
          WHERE session_id = ? AND is_zero_flag = 0`,
      )
      .get(id) as { s: number }
  ).s;

  return {
    session: rowToCountSession(row),
    snapshot: snapshotRow ? rowToSnapshot(snapshotRow) : null,
    batchCount,
    entryCount,
    uniqueSkusCounted,
    totalUnitsCounted,
  };
}

export function openSession(id: string): CountSession {
  const db = getDb();
  const row = requireSession(db, id);
  assertStatus(row, ['DRAFT']);
  const joinCode = generateUniqueJoinCode(db);
  touchSession(db, id, {
    status: 'OPEN',
    join_code: joinCode,
    join_code_qr_payload: `zacks-retail://count-sessions/join/${joinCode}`,
  });
  const updated = requireSession(db, id);
  const session = rowToCountSession(updated);
  physicalInventoryEvents.emitOpened({
    sessionId: session.id,
    storeId: session.storeId,
    scope: session.scope,
    openedBy: session.openedBy,
    openedAt: session.openedAt,
  });
  return session;
}

export interface FreezeResult {
  session: CountSession;
  snapshot: CountSessionSnapshot;
  cellsLoaded: number;
}

/**
 * OPEN | COUNTING → COUNTING. Live-reads RICS for every cell in scope and
 * persists a frozen snapshot. Idempotent: calling twice on a frozen session
 * returns the existing snapshot without re-reading RICS.
 */
export async function freezeSession(id: string): Promise<FreezeResult> {
  const db = getDb();
  const row = requireSession(db, id);
  assertStatus(row, ['OPEN', 'COUNTING']);

  // Idempotent fast-path: snapshot already exists.
  const existing = db
    .prepare('SELECT * FROM count_session_snapshots WHERE session_id = ?')
    .get(id) as unknown as CountSessionSnapshotRow | undefined;
  if (existing) {
    return {
      session: rowToCountSession(row),
      snapshot: rowToSnapshot(existing),
      cellsLoaded: existing.cell_count,
    };
  }

  const session = rowToCountSession(row);
  const ricsParams: SkuStoreRollupParams = scopeToRicsParams(session.storeId, session.scope);
  const cells = await getSkuStoreCellRollup(ricsParams);

  const takenAt = new Date().toISOString();
  const snapshotId = uuidv4();
  let totalUnits = 0;
  let totalCost = 0;

  const insertSnapshot = db.prepare(
    `INSERT INTO count_session_snapshots
       (id, session_id, taken_at, cell_count, total_units_on_hand, total_cost_value, source)
     VALUES (?, ?, ?, ?, ?, ?, 'RICS_LIVE')`,
  );
  const insertCell = db.prepare(
    `INSERT INTO count_session_snapshot_cells
       (id, session_snapshot_id, sku_id, column_label, row_label,
        snapshot_on_hand, snapshot_avg_cost, snapshot_retail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  db.exec('BEGIN TRANSACTION');
  try {
    insertSnapshot.run(snapshotId, id, takenAt, 0, 0, 0);
    for (const cell of cells) {
      insertCell.run(
        uuidv4(),
        snapshotId,
        cell.sku,
        cell.columnLabel,
        cell.rowLabel,
        cell.onHand,
        null,
        null,
      );
      totalUnits += cell.onHand;
    }
    db.prepare(
      `UPDATE count_session_snapshots
          SET cell_count = ?, total_units_on_hand = ?, total_cost_value = ?
        WHERE id = ?`,
    ).run(cells.length, totalUnits, totalCost, snapshotId);
    touchSession(db, id, { status: 'COUNTING', frozen_at: takenAt });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const finalSnapshot = db
    .prepare('SELECT * FROM count_session_snapshots WHERE id = ?')
    .get(snapshotId) as unknown as CountSessionSnapshotRow;

  const sessionAfter = rowToCountSession(requireSession(db, id));
  physicalInventoryEvents.emitFrozen({
    sessionId: sessionAfter.id,
    storeId: sessionAfter.storeId,
    frozenAt: takenAt,
    cellCount: cells.length,
  });

  return {
    session: sessionAfter,
    snapshot: rowToSnapshot(finalSnapshot),
    cellsLoaded: cells.length,
  };
}

function scopeToRicsParams(storeId: number, scope: CountSessionScope): SkuStoreRollupParams {
  const params: SkuStoreRollupParams = {
    storeNumbers: [storeId],
  };
  if (scope.skus?.length) {
    params.skus = scope.skus.slice(0, 200);
  }
  if (scope.vendors?.length === 1) {
    // RICS adapter accepts a single vendorCode string, not a list.
    params.vendorCode = String(scope.vendors[0]);
  }
  if (scope.categories?.length) {
    const min = Math.min(...scope.categories);
    const max = Math.max(...scope.categories);
    params.categoryMin = min;
    params.categoryMax = max;
  }
  if (scope.seasons?.length === 1) {
    params.season = scope.seasons[0];
  }
  return params;
}

export function cancelSession(id: string, input: CancelSessionInput): CountSession {
  const db = getDb();
  const row = requireSession(db, id);
  if (row.status === 'EXPORTED' || row.status === 'COMMITTED' || row.status === 'CANCELLED') {
    throw new PhysicalInventoryError(
      'INVALID_STATUS_TRANSITION',
      `Session ${id} is already terminal (${row.status}).`,
    );
  }
  touchSession(db, id, {
    status: 'CANCELLED',
    cancelled_at: new Date().toISOString(),
    cancellation_reason: input.reason,
    cancelled_by: input.cancelledBy,
  });
  const session = rowToCountSession(requireSession(db, id));
  physicalInventoryEvents.emitCancelled({
    sessionId: session.id,
    storeId: session.storeId,
    cancelledBy: input.cancelledBy,
    reason: input.reason,
  });
  return session;
}

// ── Batches ─────────────────────────────────────────────────────────────────

export function createBatch(
  sessionId: string,
  source: CountBatchSource,
  options: { deviceLabel?: string; deviceId?: string; counterUserId?: string } = {},
): CountBatch {
  const db = getDb();
  const session = requireSession(db, sessionId);
  assertStatus(session, ['OPEN', 'COUNTING']);

  // If session is OPEN, advance to COUNTING on first batch.
  if (session.status === 'OPEN') {
    touchSession(db, sessionId, { status: 'COUNTING' });
  }

  const id = uuidv4();
  db.prepare(
    `INSERT INTO count_batches
       (id, session_id, source, device_id, device_label, counter_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    source,
    options.deviceId ?? null,
    options.deviceLabel ?? null,
    options.counterUserId ?? null,
  );
  const row = db.prepare('SELECT * FROM count_batches WHERE id = ?').get(id) as unknown as CountBatchRow;
  return rowToCountBatch(row);
}

function ensureManualBatch(db: Db, sessionId: string, counterUserId?: string): string {
  // Reuse the most recent open MANUAL_KEYED batch for this session, or create one.
  const existing = db
    .prepare(
      `SELECT id FROM count_batches
        WHERE session_id = ? AND source = 'MANUAL_KEYED' AND acknowledged_at IS NULL
        ORDER BY imported_at DESC LIMIT 1`,
    )
    .get(sessionId) as { id: string } | undefined;
  if (existing) return existing.id;
  const batch = createBatch(sessionId, 'MANUAL_KEYED', { counterUserId });
  return batch.id;
}

// ── Entries ─────────────────────────────────────────────────────────────────

export function addEntry(sessionId: string, input: AddEntryInput): CountEntry {
  const db = getDb();
  const session = requireSession(db, sessionId);
  assertStatus(session, ['OPEN', 'COUNTING']);
  if (session.status === 'OPEN') {
    touchSession(db, sessionId, { status: 'COUNTING' });
  }

  const batchId = input.batchId ?? ensureManualBatch(db, sessionId, input.counterUserId);
  const isZero = input.isZero === true;
  const quantity = isZero ? 0 : input.quantity ?? 1;

  const id = uuidv4();
  db.prepare(
    `INSERT INTO count_entries
       (id, session_id, batch_id, sku_id, column_label, row_label, quantity,
        counter_user_id, is_zero_flag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    batchId,
    input.skuId,
    input.columnLabel ?? '',
    input.rowLabel ?? '',
    quantity,
    input.counterUserId ?? null,
    isZero ? 1 : 0,
  );
  const row = db.prepare('SELECT * FROM count_entries WHERE id = ?').get(id) as unknown as CountEntryRow;
  return rowToCountEntry(row);
}

export function addBulkEntries(sessionId: string, input: BulkEntryInput): CountEntry[] {
  const db = getDb();
  const session = requireSession(db, sessionId);
  assertStatus(session, ['OPEN', 'COUNTING']);
  if (session.status === 'OPEN') {
    touchSession(db, sessionId, { status: 'COUNTING' });
  }

  // Validate batch belongs to session.
  const batchRow = db
    .prepare('SELECT id FROM count_batches WHERE id = ? AND session_id = ?')
    .get(input.batchId, sessionId) as { id: string } | undefined;
  if (!batchRow) throw new PhysicalInventoryError('BATCH_NOT_FOUND_FOR_SESSION');

  const insert = db.prepare(
    `INSERT INTO count_entries
       (id, session_id, batch_id, sku_id, column_label, row_label, quantity,
        counter_user_id, is_zero_flag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  );

  const ids: string[] = [];
  db.exec('BEGIN TRANSACTION');
  try {
    for (const cell of input.cells) {
      const id = uuidv4();
      ids.push(id);
      insert.run(
        id,
        sessionId,
        input.batchId,
        input.skuId,
        cell.columnLabel ?? '',
        cell.rowLabel ?? '',
        cell.quantity,
        input.counterUserId ?? null,
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM count_entries WHERE id IN (${placeholders}) ORDER BY scanned_at ASC`)
    .all(...ids) as unknown as CountEntryRow[];
  return rows.map(rowToCountEntry);
}

export function getEntriesForSku(sessionId: string, skuId: string): CountEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM count_entries
        WHERE session_id = ? AND sku_id = ?
        ORDER BY scanned_at ASC`,
    )
    .all(sessionId, skuId) as unknown as CountEntryRow[];
  return rows.map(rowToCountEntry);
}

export function getRunningTotalsForSku(sessionId: string, skuId: string): CellRunningTotal[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         sku_id,
         column_label,
         row_label,
         SUM(quantity) AS total_quantity,
         COUNT(*) AS entry_count,
         MAX(is_zero_flag) AS has_zero_flag
       FROM count_entries
       WHERE session_id = ? AND sku_id = ?
       GROUP BY sku_id, column_label, row_label
       ORDER BY column_label, row_label`,
    )
    .all(sessionId, skuId) as Array<{
    sku_id: string;
    column_label: string;
    row_label: string;
    total_quantity: number;
    entry_count: number;
    has_zero_flag: number;
  }>;
  return rows.map((r) => ({
    skuId: r.sku_id,
    columnLabel: r.column_label,
    rowLabel: r.row_label,
    totalQuantity: r.total_quantity,
    entryCount: r.entry_count,
    hasZeroFlag: r.has_zero_flag === 1,
  }));
}

// ───────────────────────────────────────────────────────────────────────────
// Wave 2 — variance + reports + review acks + EXPORT
// ───────────────────────────────────────────────────────────────────────────

export function getSettings(): CompanyPhysicalInventorySettings {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM company_physical_inventory_settings WHERE id = 1')
    .get() as unknown as CompanyPhysicalInventorySettingsRow | undefined;
  if (!row) throw new PhysicalInventoryError('SETTINGS_MISSING');
  return rowToSettings(row);
}

function classifyVarianceBand(
  delta: number,
  snapshotOnHand: number,
  settings: CompanyPhysicalInventorySettings,
): { band: VarianceBand; variancePct: number | null } {
  if (delta === 0) return { band: 'ZERO', variancePct: 0 };
  if (snapshotOnHand === 0) return { band: 'EXTREME', variancePct: null };
  const pct = Math.abs(delta) / Math.abs(snapshotOnHand) * 100;
  if (pct <= settings.lowVarianceTolerancePct) return { band: 'LOW', variancePct: pct };
  if (pct >= settings.extremeVarianceTolerancePct) return { band: 'EXTREME', variancePct: pct };
  return { band: 'MATERIAL', variancePct: pct };
}

export interface ReadyForReviewResult {
  session: CountSession;
  variancesComputed: number;
  materialCount: number;
  extremeCount: number;
}

/**
 * COUNTING → READY_FOR_REVIEW. Recomputes variances from scratch each call —
 * idempotent on data, not on event emission. Emits review-ready + one
 * extreme-variance event per EXTREME row.
 */
export function readyForReview(sessionId: string): ReadyForReviewResult {
  const db = getDb();
  const row = requireSession(db, sessionId);
  assertStatus(row, ['COUNTING', 'READY_FOR_REVIEW']);

  const settings = getSettings();

  // Pull snapshot.
  const snapshotRow = db
    .prepare('SELECT * FROM count_session_snapshots WHERE session_id = ?')
    .get(sessionId) as unknown as CountSessionSnapshotRow | undefined;
  if (!snapshotRow) throw new PhysicalInventoryError('SNAPSHOT_MISSING');

  // SKUs with a zero-flag entry — every cell of these SKUs should resolve to 0.
  const zeroFlagSkus = new Set(
    (
      db
        .prepare(
          `SELECT DISTINCT sku_id FROM count_entries
            WHERE session_id = ? AND is_zero_flag = 1`,
        )
        .all(sessionId) as Array<{ sku_id: string }>
    ).map((r) => r.sku_id),
  );

  // Aggregated counts per (sku, cell) ignoring zero-flag rows.
  const cellTotals = db
    .prepare(
      `SELECT sku_id, column_label, row_label, SUM(quantity) AS total
         FROM count_entries
        WHERE session_id = ? AND is_zero_flag = 0
        GROUP BY sku_id, column_label, row_label`,
    )
    .all(sessionId) as Array<{ sku_id: string; column_label: string; row_label: string; total: number }>;

  // Snapshot cells, indexed for lookup.
  const snapshotCells = db
    .prepare(
      `SELECT sku_id, column_label, row_label, snapshot_on_hand, snapshot_avg_cost
         FROM count_session_snapshot_cells
        WHERE session_snapshot_id = ?`,
    )
    .all(snapshotRow.id) as Array<{
    sku_id: string;
    column_label: string;
    row_label: string;
    snapshot_on_hand: number;
    snapshot_avg_cost: number | null;
  }>;
  const snapshotIndex = new Map<string, { onHand: number; avgCost: number | null }>();
  const snapshotCellsBySku = new Map<string, Array<{ columnLabel: string; rowLabel: string; onHand: number; avgCost: number | null }>>();
  for (const c of snapshotCells) {
    snapshotIndex.set(`${c.sku_id}|${c.column_label}|${c.row_label}`, {
      onHand: c.snapshot_on_hand,
      avgCost: c.snapshot_avg_cost,
    });
    if (!snapshotCellsBySku.has(c.sku_id)) snapshotCellsBySku.set(c.sku_id, []);
    snapshotCellsBySku.get(c.sku_id)!.push({
      columnLabel: c.column_label,
      rowLabel: c.row_label,
      onHand: c.snapshot_on_hand,
      avgCost: c.snapshot_avg_cost,
    });
  }

  // Build the variance set.
  type VarianceWrite = {
    skuId: string;
    columnLabel: string;
    rowLabel: string;
    countedQty: number;
    snapshotOnHand: number;
    delta: number;
    unitCost: number | null;
    band: VarianceBand;
    variancePct: number | null;
  };
  const variances: VarianceWrite[] = [];
  const seen = new Set<string>();

  // 1) Zero-flag SKUs: every snapshot cell of the SKU resolves to counted=0.
  for (const skuId of zeroFlagSkus) {
    const cells = snapshotCellsBySku.get(skuId) ?? [];
    if (cells.length === 0) {
      // No snapshot cells for this SKU — operator marked an SKU as zero that
      // wasn't on the floor at freeze. Record a synthetic variance at the
      // root cell so the operator sees it during review.
      const key = `${skuId}|${''}|${''}`;
      seen.add(key);
      const { band, variancePct } = classifyVarianceBand(0, 0, settings);
      variances.push({
        skuId,
        columnLabel: '',
        rowLabel: '',
        countedQty: 0,
        snapshotOnHand: 0,
        delta: 0,
        unitCost: null,
        band,
        variancePct,
      });
      continue;
    }
    for (const cell of cells) {
      const key = `${skuId}|${cell.columnLabel}|${cell.rowLabel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const delta = -cell.onHand;
      const { band, variancePct } = classifyVarianceBand(delta, cell.onHand, settings);
      variances.push({
        skuId,
        columnLabel: cell.columnLabel,
        rowLabel: cell.rowLabel,
        countedQty: 0,
        snapshotOnHand: cell.onHand,
        delta,
        unitCost: cell.avgCost,
        band,
        variancePct,
      });
    }
  }

  // 2) Regular cell totals (non-zero-flag SKUs only).
  for (const t of cellTotals) {
    if (zeroFlagSkus.has(t.sku_id)) continue;
    const key = `${t.sku_id}|${t.column_label}|${t.row_label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const snap = snapshotIndex.get(key);
    const snapshotOnHand = snap?.onHand ?? 0;
    const unitCost = snap?.avgCost ?? null;
    const delta = t.total - snapshotOnHand;
    const { band, variancePct } = classifyVarianceBand(delta, snapshotOnHand, settings);
    variances.push({
      skuId: t.sku_id,
      columnLabel: t.column_label,
      rowLabel: t.row_label,
      countedQty: t.total,
      snapshotOnHand,
      delta,
      unitCost,
      band,
      variancePct,
    });
  }

  // Replace the variance set.
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('DELETE FROM count_variances WHERE session_id = ?').run(sessionId);
    const insert = db.prepare(
      `INSERT INTO count_variances
         (id, session_id, sku_id, column_label, row_label, counted_qty,
          snapshot_on_hand, delta, unit_cost, variance_pct, band)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const v of variances) {
      insert.run(
        uuidv4(),
        sessionId,
        v.skuId,
        v.columnLabel,
        v.rowLabel,
        v.countedQty,
        v.snapshotOnHand,
        v.delta,
        v.unitCost,
        v.variancePct,
        v.band,
      );
    }
    touchSession(db, sessionId, {
      status: 'READY_FOR_REVIEW',
      review_started_at: new Date().toISOString(),
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const materialCount = variances.filter((v) => v.band === 'MATERIAL').length;
  const extremeCount = variances.filter((v) => v.band === 'EXTREME').length;
  const session = rowToCountSession(requireSession(db, sessionId));

  physicalInventoryEvents.emitReviewReady({
    sessionId,
    storeId: session.storeId,
    totalCellsWithEntry: variances.length,
    materialCount,
    extremeCount,
  });

  // Emit one extreme-variance event per EXTREME row, with the persisted id.
  if (extremeCount > 0) {
    const extremeRows = db
      .prepare(
        `SELECT * FROM count_variances WHERE session_id = ? AND band = 'EXTREME'`,
      )
      .all(sessionId) as unknown as CountVarianceRow[];
    for (const r of extremeRows) {
      physicalInventoryEvents.emitExtremeVariance({
        sessionId,
        storeId: session.storeId,
        varianceId: r.id,
        skuId: r.sku_id,
        columnLabel: r.column_label,
        rowLabel: r.row_label,
        delta: r.delta,
        variancePct: r.variance_pct,
      });
    }
  }

  return {
    session,
    variancesComputed: variances.length,
    materialCount,
    extremeCount,
  };
}

export interface VarianceListParams {
  bands?: VarianceBand[];
  onlyVarying?: boolean;
  limit?: number;
  offset?: number;
}

export function listVariances(sessionId: string, params: VarianceListParams = {}): CountVariance[] {
  const db = getDb();
  requireSession(db, sessionId);
  const wheres: string[] = ['session_id = ?'];
  const args: Array<string | number> = [sessionId];
  if (params.bands?.length) {
    wheres.push(`band IN (${params.bands.map(() => '?').join(',')})`);
    args.push(...params.bands);
  }
  if (params.onlyVarying) {
    wheres.push("band <> 'ZERO'");
  }
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 5000);
  const offset = Math.max(params.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT * FROM count_variances
        WHERE ${wheres.join(' AND ')}
        ORDER BY band DESC, sku_id, column_label, row_label
        LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, offset) as unknown as CountVarianceRow[];
  return rows.map(rowToCountVariance);
}

export function getVarianceSummary(sessionId: string): VarianceSummary {
  const db = getDb();
  requireSession(db, sessionId);
  const rows = db
    .prepare(
      `SELECT band,
              COUNT(*) AS cell_count,
              COALESCE(SUM(delta), 0) AS total_delta_units,
              COALESCE(SUM(delta * COALESCE(unit_cost, 0)), 0) AS total_delta_cost,
              SUM(CASE WHEN acknowledged_at IS NULL THEN 1 ELSE 0 END) AS unacknowledged_count
         FROM count_variances
        WHERE session_id = ?
        GROUP BY band`,
    )
    .all(sessionId) as Array<{
    band: VarianceBand;
    cell_count: number;
    total_delta_units: number;
    total_delta_cost: number;
    unacknowledged_count: number;
  }>;

  const bands: VarianceBandRollup[] = (['ZERO', 'LOW', 'MATERIAL', 'EXTREME'] as VarianceBand[]).map((b) => {
    const found = rows.find((r) => r.band === b);
    return {
      band: b,
      cellCount: found?.cell_count ?? 0,
      totalDeltaUnits: found?.total_delta_units ?? 0,
      totalDeltaCost: found?.total_delta_cost ?? 0,
      unacknowledgedCount: found?.unacknowledged_count ?? 0,
    };
  });

  const totalCellsWithEntry = bands.reduce((acc, b) => acc + b.cellCount, 0);
  const totalUnitsCounted = (
    db
      .prepare(
        `SELECT COALESCE(SUM(quantity), 0) AS s FROM count_entries
          WHERE session_id = ? AND is_zero_flag = 0`,
      )
      .get(sessionId) as { s: number }
  ).s;
  const totalUnitsDelta = bands.reduce((acc, b) => acc + b.totalDeltaUnits, 0);
  const totalCostDelta = bands.reduce((acc, b) => acc + b.totalDeltaCost, 0);
  const pendingAcknowledgements = bands
    .filter((b) => b.band === 'MATERIAL' || b.band === 'EXTREME')
    .reduce((acc, b) => acc + b.unacknowledgedCount, 0);

  return {
    totalCellsWithEntry,
    totalUnitsCounted,
    totalUnitsDelta,
    totalCostDelta,
    bands,
    pendingAcknowledgements,
  };
}

export function getItemsNotCounted(
  sessionId: string,
  params: ItemNotCountedListParams = {},
): ItemNotCountedRow[] {
  const db = getDb();
  requireSession(db, sessionId);
  const snapshotRow = db
    .prepare('SELECT id FROM count_session_snapshots WHERE session_id = ?')
    .get(sessionId) as { id: string } | undefined;
  if (!snapshotRow) throw new PhysicalInventoryError('SNAPSHOT_MISSING');

  const wheres: string[] = ['c.session_snapshot_id = ?'];
  const args: Array<string | number> = [snapshotRow.id];
  if (!params.includeZeroOnHand) {
    wheres.push('c.snapshot_on_hand > 0');
  }
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 10000);
  const offset = Math.max(params.offset ?? 0, 0);

  const rows = db
    .prepare(
      `SELECT c.sku_id AS sku_id, c.column_label, c.row_label, c.snapshot_on_hand
         FROM count_session_snapshot_cells c
         LEFT JOIN count_entries e
           ON e.session_id = ?
          AND e.sku_id = c.sku_id
          AND e.column_label = c.column_label
          AND e.row_label = c.row_label
        WHERE ${wheres.join(' AND ')}
          AND e.id IS NULL
        ORDER BY c.sku_id, c.column_label, c.row_label
        LIMIT ? OFFSET ?`,
    )
    .all(sessionId, ...args, limit, offset) as Array<{
    sku_id: string;
    column_label: string;
    row_label: string;
    snapshot_on_hand: number;
  }>;
  return rows.map((r) => ({
    skuId: r.sku_id,
    columnLabel: r.column_label,
    rowLabel: r.row_label,
    snapshotOnHand: r.snapshot_on_hand,
  }));
}

/**
 * Mark each provided SKU as physically absent (is_zero_flag = 1). Creates a
 * synthetic SYSTEM_ZERO_OUT batch and one entry per SKU. Modeled on RICS
 * Ch. 10 p. 137 "enter a zero count for any items on that report" workflow.
 */
export function bulkZeroOut(
  sessionId: string,
  skuIds: string[],
  performedBy: string,
): CountEntry[] {
  const db = getDb();
  const session = requireSession(db, sessionId);
  assertStatus(session, ['OPEN', 'COUNTING', 'READY_FOR_REVIEW']);
  if (session.status === 'OPEN') {
    touchSession(db, sessionId, { status: 'COUNTING' });
  }

  const batchId = ensureSystemBatch(db, sessionId, 'MANUAL_KEYED', performedBy);
  const insert = db.prepare(
    `INSERT INTO count_entries
       (id, session_id, batch_id, sku_id, column_label, row_label, quantity,
        counter_user_id, is_zero_flag)
     VALUES (?, ?, ?, ?, '', '', 0, ?, 1)`,
  );

  const ids: string[] = [];
  db.exec('BEGIN TRANSACTION');
  try {
    for (const skuId of skuIds) {
      const id = uuidv4();
      ids.push(id);
      insert.run(id, sessionId, batchId, skuId, performedBy);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM count_entries WHERE id IN (${placeholders})`)
    .all(...ids) as unknown as CountEntryRow[];
  return rows.map(rowToCountEntry);
}

function ensureSystemBatch(
  db: Db,
  sessionId: string,
  source: CountBatchSource,
  performedBy: string,
): string {
  const existing = db
    .prepare(
      `SELECT id FROM count_batches
        WHERE session_id = ? AND source = ? AND device_label = 'SYSTEM'
          AND acknowledged_at IS NULL
        ORDER BY imported_at DESC LIMIT 1`,
    )
    .get(sessionId, source) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = uuidv4();
  db.prepare(
    `INSERT INTO count_batches
       (id, session_id, source, device_id, device_label, counter_user_id)
     VALUES (?, ?, ?, NULL, 'SYSTEM', ?)`,
  ).run(id, sessionId, source, performedBy);
  return id;
}

export function recordReviewAck(
  sessionId: string,
  step: ReviewStep,
  acknowledgedBy: string,
): CountReviewAck {
  if (!REVIEW_STEPS.includes(step)) {
    throw new PhysicalInventoryError('INVALID_REVIEW_STEP');
  }
  const db = getDb();
  const session = requireSession(db, sessionId);
  assertStatus(session, ['COUNTING', 'READY_FOR_REVIEW']);

  const id = uuidv4();
  // Idempotent on (session, step) — replace prior ack if any.
  db.prepare('DELETE FROM count_review_acks WHERE session_id = ? AND step = ?').run(sessionId, step);
  db.prepare(
    `INSERT INTO count_review_acks (id, session_id, step, acknowledged_by) VALUES (?, ?, ?, ?)`,
  ).run(id, sessionId, step, acknowledgedBy);
  const row = db
    .prepare('SELECT * FROM count_review_acks WHERE id = ?')
    .get(id) as unknown as CountReviewAckRow;
  return rowToCountReviewAck(row);
}

export function listReviewAcks(sessionId: string): CountReviewAck[] {
  const db = getDb();
  requireSession(db, sessionId);
  const rows = db
    .prepare(
      `SELECT * FROM count_review_acks WHERE session_id = ? ORDER BY acknowledged_at ASC`,
    )
    .all(sessionId) as unknown as CountReviewAckRow[];
  return rows.map(rowToCountReviewAck);
}

export function acknowledgeVariance(
  sessionId: string,
  varianceId: string,
  acknowledgedBy: string,
): CountVariance {
  const db = getDb();
  const session = requireSession(db, sessionId);
  assertStatus(session, ['READY_FOR_REVIEW']);

  const existing = db
    .prepare('SELECT * FROM count_variances WHERE id = ? AND session_id = ?')
    .get(varianceId, sessionId) as unknown as CountVarianceRow | undefined;
  if (!existing) throw new PhysicalInventoryError('VARIANCE_NOT_FOUND');

  db.prepare(
    `UPDATE count_variances
        SET acknowledged_at = datetime('now'), acknowledged_by = ?
      WHERE id = ?`,
  ).run(acknowledgedBy, varianceId);
  const updated = db
    .prepare('SELECT * FROM count_variances WHERE id = ?')
    .get(varianceId) as unknown as CountVarianceRow;
  return rowToCountVariance(updated);
}

export interface MarkExportedResult {
  session: CountSession;
}

/**
 * READY_FOR_REVIEW → EXPORTED. Gated on:
 *  - All 4 review acks present (VIEWED_ITEMS_NOT_COUNTED, VIEWED_VARIANCE,
 *    ACK_MATERIAL_VARIANCES, BACKUP_VERIFIED).
 *  - Every MATERIAL/EXTREME variance row acknowledged.
 */
export function markSessionExported(sessionId: string, exportedBy: string): MarkExportedResult {
  const db = getDb();
  const session = requireSession(db, sessionId);
  assertStatus(session, ['READY_FOR_REVIEW']);

  const acks = (
    db
      .prepare('SELECT step FROM count_review_acks WHERE session_id = ?')
      .all(sessionId) as Array<{ step: ReviewStep }>
  ).map((r) => r.step);
  const missing = REVIEW_STEPS.filter((s) => !acks.includes(s));
  if (missing.length > 0) {
    throw new PhysicalInventoryError(
      'REVIEW_ACKS_MISSING',
      `Missing review acks: ${missing.join(', ')}`,
    );
  }

  const unacked = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM count_variances
          WHERE session_id = ?
            AND band IN ('MATERIAL', 'EXTREME')
            AND acknowledged_at IS NULL`,
      )
      .get(sessionId) as { c: number }
  ).c;
  if (unacked > 0) {
    throw new PhysicalInventoryError(
      'VARIANCES_UNACKNOWLEDGED',
      `${unacked} material/extreme variance row(s) require acknowledgement`,
    );
  }

  const exportedAt = new Date().toISOString();
  touchSession(db, sessionId, {
    status: 'EXPORTED',
    exported_at: exportedAt,
    exported_by: exportedBy,
  });
  const updated = rowToCountSession(requireSession(db, sessionId));
  physicalInventoryEvents.emitExported({
    sessionId,
    storeId: updated.storeId,
    exportedBy,
    exportedAt,
  });
  return { session: updated };
}

// ── CSV exports ─────────────────────────────────────────────────────────────

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildVarianceCsv(sessionId: string, params: VarianceListParams = {}): string {
  const rows = listVariances(sessionId, { ...params, limit: 10000 });
  const headers = ['skuId', 'columnLabel', 'rowLabel', 'snapshotOnHand', 'countedQty', 'delta', 'variancePct', 'unitCost', 'band', 'acknowledgedBy', 'acknowledgedAt'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.skuId, r.columnLabel, r.rowLabel,
      r.snapshotOnHand, r.countedQty, r.delta,
      r.variancePct ?? '', r.unitCost ?? '', r.band,
      r.acknowledgedBy ?? '', r.acknowledgedAt ?? '',
    ].map(csvEscape).join(','));
  }
  return lines.join('\n');
}

export function buildItemsNotCountedCsv(
  sessionId: string,
  params: ItemNotCountedListParams = {},
): string {
  const rows = getItemsNotCounted(sessionId, { ...params, limit: 10000 });
  const headers = ['skuId', 'columnLabel', 'rowLabel', 'snapshotOnHand'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([r.skuId, r.columnLabel, r.rowLabel, r.snapshotOnHand].map(csvEscape).join(','));
  }
  return lines.join('\n');
}

// ───────────────────────────────────────────────────────────────────────────
// Wave 3 — mobile join + batch ingestion + conflict detection
// ───────────────────────────────────────────────────────────────────────────

export interface JoinResult {
  sessionId: string;
  storeId: number;
  scope: CountSessionScope;
  mode: CountSession['mode'];
  status: CountSessionStatus;
}

export function joinSessionByCode(joinCode: string): JoinResult | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM count_sessions WHERE join_code = ?')
    .get(joinCode) as unknown as CountSessionRow | undefined;
  if (!row) return null;
  if (row.status !== 'OPEN' && row.status !== 'COUNTING') return null;
  const session = rowToCountSession(row);
  return {
    sessionId: session.id,
    storeId: session.storeId,
    scope: session.scope,
    mode: session.mode,
    status: session.status,
  };
}

export interface RegisterDeviceInput {
  deviceLabel: string;
  counterUserId?: string;
}

export function registerDevice(sessionId: string, input: RegisterDeviceInput): CountBatch {
  if (!input.deviceLabel?.trim()) throw new PhysicalInventoryError('INVALID_DEVICE_LABEL');
  return createBatch(sessionId, 'MOBILE_WEB', {
    deviceLabel: input.deviceLabel.trim(),
    deviceId: uuidv4(),
    counterUserId: input.counterUserId,
  });
}

export function acknowledgeBatch(sessionId: string, batchId: string): CountBatch {
  const db = getDb();
  requireSession(db, sessionId);
  const existing = db
    .prepare('SELECT * FROM count_batches WHERE id = ? AND session_id = ?')
    .get(batchId, sessionId) as unknown as CountBatchRow | undefined;
  if (!existing) throw new PhysicalInventoryError('BATCH_NOT_FOUND_FOR_SESSION');

  db.prepare(`UPDATE count_batches SET acknowledged_at = datetime('now') WHERE id = ?`).run(batchId);
  const updated = db
    .prepare('SELECT * FROM count_batches WHERE id = ?')
    .get(batchId) as unknown as CountBatchRow;
  return rowToCountBatch(updated);
}

/**
 * CSV columns (header row required): sku, columnLabel, rowLabel, quantity.
 * `sku` is the RICS SKU code. `columnLabel`/`rowLabel` may be empty for
 * single-cell SKUs. Returns per-row exception list with prev/next valid SKU
 * anchors per RICS Ch. 10 p. 138.
 */
export function importBatchCsv(
  sessionId: string,
  batchId: string,
  csvText: string,
  performedBy: string,
): CsvImportResult {
  const db = getDb();
  const session = requireSession(db, sessionId);
  assertStatus(session, ['OPEN', 'COUNTING']);
  const batchRow = db
    .prepare('SELECT id, source FROM count_batches WHERE id = ? AND session_id = ?')
    .get(batchId, sessionId) as { id: string; source: CountBatchSource } | undefined;
  if (!batchRow) throw new PhysicalInventoryError('BATCH_NOT_FOUND_FOR_SESSION');

  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { batchId, acceptedCount: 0, exceptions: [] };
  }
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = {
    sku: header.indexOf('sku'),
    columnLabel: header.indexOf('columnlabel'),
    rowLabel: header.indexOf('rowlabel'),
    quantity: header.indexOf('quantity'),
  };
  if (idx.sku < 0 || idx.quantity < 0) {
    throw new PhysicalInventoryError('CSV_HEADER_INVALID');
  }

  const exceptions: CsvImportException[] = [];
  type Row = { rowNumber: number; sku: string; columnLabel: string; rowLabel: string; quantity: number };
  const accepted: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cols = raw.split(',');
    const sku = (cols[idx.sku] ?? '').trim();
    const columnLabel = idx.columnLabel >= 0 ? (cols[idx.columnLabel] ?? '').trim() : '';
    const rowLabel = idx.rowLabel >= 0 ? (cols[idx.rowLabel] ?? '').trim() : '';
    const qtyRaw = (cols[idx.quantity] ?? '').trim();
    const quantity = Number(qtyRaw);
    if (!sku) {
      exceptions.push({ rowNumber: i + 1, reason: 'MISSING_SKU', raw, previousValidSku: null, nextValidSku: null });
      continue;
    }
    if (!Number.isFinite(quantity)) {
      exceptions.push({ rowNumber: i + 1, reason: 'INVALID_QUANTITY', raw, previousValidSku: null, nextValidSku: null });
      continue;
    }
    accepted.push({ rowNumber: i + 1, sku, columnLabel, rowLabel, quantity });
  }

  // Patch in prev/next anchors from valid rows only.
  for (const ex of exceptions) {
    ex.previousValidSku = accepted.filter((r) => r.rowNumber < ex.rowNumber).slice(-1)[0]?.sku ?? null;
    ex.nextValidSku = accepted.find((r) => r.rowNumber > ex.rowNumber)?.sku ?? null;
  }

  // Persist accepted entries + exceptions in one transaction.
  db.exec('BEGIN TRANSACTION');
  try {
    const insert = db.prepare(
      `INSERT INTO count_entries
         (id, session_id, batch_id, sku_id, column_label, row_label, quantity,
          counter_user_id, is_zero_flag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    for (const r of accepted) {
      insert.run(uuidv4(), sessionId, batchId, r.sku, r.columnLabel, r.rowLabel, r.quantity, performedBy);
    }
    db.prepare('UPDATE count_batches SET exceptions_json = ? WHERE id = ?').run(
      exceptions.length > 0 ? JSON.stringify(exceptions) : null,
      batchId,
    );
    if (session.status === 'OPEN') {
      touchSession(db, sessionId, { status: 'COUNTING' });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { batchId, acceptedCount: accepted.length, exceptions };
}

/**
 * Same-cell counts attributed to multiple devices within `windowMinutes`
 * (default from settings). Per spec: "Surface for review; do not auto-merge."
 */
export function computeConflicts(sessionId: string, windowMinutesOverride?: number): ConflictRow[] {
  const db = getDb();
  requireSession(db, sessionId);
  const settings = getSettings();
  const windowMinutes = windowMinutesOverride ?? settings.duplicatePassWindowMinutes;

  const rows = db
    .prepare(
      `SELECT
         e.sku_id, e.column_label, e.row_label,
         COUNT(DISTINCT b.device_id) AS device_count,
         COALESCE(SUM(e.quantity), 0) AS total_quantity,
         MIN(e.scanned_at) AS window_start,
         MAX(e.scanned_at) AS window_end
       FROM count_entries e
       JOIN count_batches b ON b.id = e.batch_id
       WHERE e.session_id = ?
         AND e.is_zero_flag = 0
         AND b.device_id IS NOT NULL
       GROUP BY e.sku_id, e.column_label, e.row_label
       HAVING COUNT(DISTINCT b.device_id) > 1
          AND (julianday(MAX(e.scanned_at)) - julianday(MIN(e.scanned_at))) * 24 * 60 <= ?`,
    )
    .all(sessionId, windowMinutes) as Array<{
    sku_id: string;
    column_label: string;
    row_label: string;
    device_count: number;
    total_quantity: number;
    window_start: string;
    window_end: string;
  }>;

  return rows.map((r) => {
    const deviceBreakdown = db
      .prepare(
        `SELECT b.device_id, b.device_label,
                COALESCE(SUM(e.quantity), 0) AS quantity,
                COUNT(*) AS entry_count
           FROM count_entries e
           JOIN count_batches b ON b.id = e.batch_id
          WHERE e.session_id = ? AND e.sku_id = ?
            AND e.column_label = ? AND e.row_label = ?
            AND e.is_zero_flag = 0
          GROUP BY b.device_id, b.device_label
          ORDER BY b.device_label`,
      )
      .all(sessionId, r.sku_id, r.column_label, r.row_label) as Array<{
      device_id: string | null;
      device_label: string | null;
      quantity: number;
      entry_count: number;
    }>;
    return {
      skuId: r.sku_id,
      columnLabel: r.column_label,
      rowLabel: r.row_label,
      deviceCount: r.device_count,
      totalQuantity: r.total_quantity,
      windowStart: r.window_start,
      windowEnd: r.window_end,
      devices: deviceBreakdown.map((d) => ({
        deviceId: d.device_id,
        deviceLabel: d.device_label,
        quantity: d.quantity,
        entryCount: d.entry_count,
      })),
    };
  });
}

// ── Internal helpers exposed for tests ──────────────────────────────────────

export const __internals = {
  scopeToRicsParams,
  generateJoinCode,
  classifyVarianceBand,
};
