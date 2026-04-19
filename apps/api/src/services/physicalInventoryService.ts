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
} from '../models/physicalInventory';

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
  return rowToCountSession(requireSession(db, id));
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

  return {
    session: rowToCountSession(requireSession(db, id)),
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
  return rowToCountSession(requireSession(db, id));
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

// ── Internal helpers exposed for tests ──────────────────────────────────────

export const __internals = {
  scopeToRicsParams,
  generateJoinCode,
};
