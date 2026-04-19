/**
 * Physical Inventory module — Phase 1.a (Slice 3) Wave 1 lifecycle tests.
 *
 * Covers:
 *  - createSession → DRAFT
 *  - openSession → OPEN (joinCode + QR generated)
 *  - addEntry advances OPEN → COUNTING and auto-creates a MANUAL_KEYED batch
 *  - freezeSession reads RICS (mocked) and writes a snapshot + cells; idempotent
 *  - addBulkEntries against an explicit batch
 *  - getRunningTotalsForSku aggregates across entries
 *  - cancelSession → CANCELLED, blocks further entries via INVALID_STATUS_TRANSITION
 *  - status guards (cannot freeze a DRAFT, cannot open twice, etc.)
 *
 * Migration 020 is applied manually per the same pattern as
 * ledgerCoverage.test.ts (migration 019). When the runtime migration loader in
 * src/db/database.ts integrates 020 (deferred to Wave 2), this helper goes
 * away.
 */

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';

// Mock the RICS adapter BEFORE importing the app — freezeSession imports it.
jest.mock('../src/services/ricsInventoryAdapter', () => ({
  getSkuStoreCellRollup: jest.fn(),
}));

import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';
import { getSkuStoreCellRollup } from '../src/services/ricsInventoryAdapter';

const mockedGetCellRollup = getSkuStoreCellRollup as jest.MockedFunction<
  typeof getSkuStoreCellRollup
>;

function applyMigration020(): void {
  const db = getDb();
  const sqlPath = path.resolve(
    __dirname,
    '../../../legacy/sqlite-migrations/020_physical_inventory_p1a.up.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  db.exec(sql);
}

beforeEach(() => {
  resetDb();
  applyMigration020();
  mockedGetCellRollup.mockReset();
  mockedGetCellRollup.mockResolvedValue([]);
});

afterAll(() => {
  resetDb();
});

// ── Lifecycle ───────────────────────────────────────────────────────────────

describe('POST /api/v1/count-sessions', () => {
  it('creates a DRAFT session with default ADDITIVE mode and {all:true} scope', async () => {
    const res = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.mode).toBe('ADDITIVE');
    expect(res.body.scope).toEqual({ all: true });
    expect(res.body.storeId).toBe(1);
    expect(res.body.openedBy).toBe('tester');
    expect(res.body.sessionNumber).toMatch(/^PI-S01-\d{6}-\d{3}$/);
    expect(res.body.joinCode).toBeNull();
  });

  it('rejects missing storeId / openedBy', async () => {
    const res = await request(app).post('/api/v1/count-sessions').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts INDEPENDENT_VERIFICATION mode with N >= 2', async () => {
    const res = await request(app)
      .post('/api/v1/count-sessions')
      .send({
        storeId: 2,
        openedBy: 'tester',
        mode: 'INDEPENDENT_VERIFICATION',
        independentVerificationN: 3,
      });
    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('INDEPENDENT_VERIFICATION');
    expect(res.body.independentVerificationN).toBe(3);
  });

  it('rejects INDEPENDENT_VERIFICATION with N < 2', async () => {
    const res = await request(app)
      .post('/api/v1/count-sessions')
      .send({
        storeId: 2,
        openedBy: 'tester',
        mode: 'INDEPENDENT_VERIFICATION',
        independentVerificationN: 1,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INDEPENDENT_VERIFICATION_N');
  });

  it('persists scope as JSON', async () => {
    const scope = { vendors: [42], categories: [560, 580] };
    const res = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester', scope });
    expect(res.status).toBe(201);
    expect(res.body.scope).toEqual(scope);
  });
});

describe('POST /api/v1/count-sessions/:id/open', () => {
  it('transitions DRAFT → OPEN and generates a 6-digit joinCode + QR payload', async () => {
    const created = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester' });
    const id = created.body.id;

    const opened = await request(app).post(`/api/v1/count-sessions/${id}/open`);
    expect(opened.status).toBe(200);
    expect(opened.body.status).toBe('OPEN');
    expect(opened.body.joinCode).toMatch(/^\d{6}$/);
    expect(opened.body.joinCodeQrPayload).toContain(opened.body.joinCode);
  });

  it('blocks open on a non-DRAFT session', async () => {
    const created = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester' });
    const id = created.body.id;
    await request(app).post(`/api/v1/count-sessions/${id}/open`);

    const second = await request(app).post(`/api/v1/count-sessions/${id}/open`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('POST /api/v1/count-sessions/:id/freeze', () => {
  it('blocks freeze on a DRAFT session', async () => {
    const created = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester' });
    const id = created.body.id;

    const res = await request(app).post(`/api/v1/count-sessions/${id}/freeze`);
    expect(res.status).toBe(409);
  });

  it('reads RICS, writes a snapshot + cells, transitions to COUNTING', async () => {
    mockedGetCellRollup.mockResolvedValue([
      {
        sku: 'SKU-A',
        store: 1,
        storeName: 'Store 1',
        rowLabel: 'M',
        columnLabel: '7',
        description: 'Test product',
        brand: 'Brand',
        vendorCode: 'V1',
        category: 560,
        season: '2026SS',
        sizeTypeCode: 1,
        sizeTypeDesc: 'Mens',
        onHand: 5,
        model: 0,
        maxQty: 0,
        reorder: 0,
        currentOnOrder: 0,
        futureOnOrder: 0,
        mtdSales: 0,
        stdSales: 0,
        ytdSales: 0,
        lySales: 0,
      },
      {
        sku: 'SKU-A',
        store: 1,
        storeName: 'Store 1',
        rowLabel: 'M',
        columnLabel: '8',
        description: 'Test product',
        brand: 'Brand',
        vendorCode: 'V1',
        category: 560,
        season: '2026SS',
        sizeTypeCode: 1,
        sizeTypeDesc: 'Mens',
        onHand: 3,
        model: 0,
        maxQty: 0,
        reorder: 0,
        currentOnOrder: 0,
        futureOnOrder: 0,
        mtdSales: 0,
        stdSales: 0,
        ytdSales: 0,
        lySales: 0,
      },
    ]);

    const created = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester' });
    const id = created.body.id;
    await request(app).post(`/api/v1/count-sessions/${id}/open`);

    const frozen = await request(app).post(`/api/v1/count-sessions/${id}/freeze`);
    expect(frozen.status).toBe(200);
    expect(frozen.body.session.status).toBe('COUNTING');
    expect(frozen.body.session.frozenAt).toBeTruthy();
    expect(frozen.body.cellsLoaded).toBe(2);
    expect(frozen.body.snapshot.cellCount).toBe(2);
    expect(frozen.body.snapshot.totalUnitsOnHand).toBe(8);

    // Snapshot cells persisted
    const db = getDb();
    const cells = db
      .prepare(
        `SELECT * FROM count_session_snapshot_cells
          WHERE session_snapshot_id = ?
          ORDER BY column_label`,
      )
      .all(frozen.body.snapshot.id) as Array<{
      sku_id: string;
      column_label: string;
      snapshot_on_hand: number;
    }>;
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ sku_id: 'SKU-A', column_label: '7', snapshot_on_hand: 5 });
    expect(cells[1]).toMatchObject({ sku_id: 'SKU-A', column_label: '8', snapshot_on_hand: 3 });
  });

  it('is idempotent on repeated freeze calls', async () => {
    mockedGetCellRollup.mockResolvedValue([]);
    const created = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester' });
    const id = created.body.id;
    await request(app).post(`/api/v1/count-sessions/${id}/open`);

    const first = await request(app).post(`/api/v1/count-sessions/${id}/freeze`);
    const second = await request(app).post(`/api/v1/count-sessions/${id}/freeze`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.snapshot.id).toBe(second.body.snapshot.id);
    // RICS adapter called once across both freeze attempts.
    expect(mockedGetCellRollup).toHaveBeenCalledTimes(1);
  });
});

describe('Entry write path', () => {
  async function newOpenSession(): Promise<string> {
    const created = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester' });
    await request(app).post(`/api/v1/count-sessions/${created.body.id}/open`);
    return created.body.id;
  }

  it('addEntry on OPEN session auto-creates a MANUAL_KEYED batch and advances to COUNTING', async () => {
    const id = await newOpenSession();
    const res = await request(app)
      .post(`/api/v1/count-sessions/${id}/entries`)
      .send({ skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: 2 });

    expect(res.status).toBe(201);
    expect(res.body.skuId).toBe('SKU-A');
    expect(res.body.quantity).toBe(2);
    expect(res.body.isZeroFlag).toBe(false);

    const detail = await request(app).get(`/api/v1/count-sessions/${id}`);
    expect(detail.body.session.status).toBe('COUNTING');
    expect(detail.body.batchCount).toBe(1);
    expect(detail.body.entryCount).toBe(1);
    expect(detail.body.totalUnitsCounted).toBe(2);
  });

  it('addEntry with isZero=true creates a zero-flag entry with quantity 0', async () => {
    const id = await newOpenSession();
    const res = await request(app)
      .post(`/api/v1/count-sessions/${id}/entries`)
      .send({ skuId: 'SKU-A', isZero: true });

    expect(res.status).toBe(201);
    expect(res.body.quantity).toBe(0);
    expect(res.body.isZeroFlag).toBe(true);
  });

  it('addBulkEntries against an explicit batch', async () => {
    const id = await newOpenSession();
    const batchRes = await request(app)
      .post(`/api/v1/count-sessions/${id}/batches`)
      .send({ source: 'HID_SCANNER', deviceLabel: 'Front register' });
    const batchId = batchRes.body.id;

    const bulk = await request(app)
      .post(`/api/v1/count-sessions/${id}/entries/bulk`)
      .send({
        batchId,
        skuId: 'SKU-A',
        cells: [
          { columnLabel: '7', rowLabel: 'M', quantity: 5 },
          { columnLabel: '8', rowLabel: 'M', quantity: 3 },
        ],
      });

    expect(bulk.status).toBe(201);
    expect(bulk.body.data).toHaveLength(2);

    const totals = await request(app).get(`/api/v1/count-sessions/${id}/cells/SKU-A`);
    expect(totals.body.data).toHaveLength(2);
    expect(totals.body.data.find((c: { columnLabel: string }) => c.columnLabel === '7').totalQuantity).toBe(5);
    expect(totals.body.data.find((c: { columnLabel: string }) => c.columnLabel === '8').totalQuantity).toBe(3);
  });

  it('running totals sum across multiple additive entries (RICS p. 137 semantics)', async () => {
    const id = await newOpenSession();
    await request(app)
      .post(`/api/v1/count-sessions/${id}/entries`)
      .send({ skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: 5 });
    await request(app)
      .post(`/api/v1/count-sessions/${id}/entries`)
      .send({ skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: 7 });
    await request(app)
      .post(`/api/v1/count-sessions/${id}/entries`)
      .send({ skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: 3 });

    const totals = await request(app).get(`/api/v1/count-sessions/${id}/cells/SKU-A`);
    expect(totals.body.data).toHaveLength(1);
    expect(totals.body.data[0].totalQuantity).toBe(15);
    expect(totals.body.data[0].entryCount).toBe(3);
  });

  it('correction via negative-quantity entry adjusts the running total (p. 137 revising counts)', async () => {
    const id = await newOpenSession();
    await request(app)
      .post(`/api/v1/count-sessions/${id}/entries`)
      .send({ skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: 5 });
    await request(app)
      .post(`/api/v1/count-sessions/${id}/entries`)
      .send({ skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: -1 });

    const totals = await request(app).get(`/api/v1/count-sessions/${id}/cells/SKU-A`);
    expect(totals.body.data[0].totalQuantity).toBe(4);
  });
});

describe('POST /api/v1/count-sessions/:id/cancel', () => {
  it('transitions any non-terminal session to CANCELLED', async () => {
    const created = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester' });
    const id = created.body.id;

    const cancelled = await request(app)
      .post(`/api/v1/count-sessions/${id}/cancel`)
      .send({ reason: 'fire drill', cancelledBy: 'manager' });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.cancellationReason).toBe('fire drill');
    expect(cancelled.body.cancelledBy).toBe('manager');
    expect(cancelled.body.cancelledAt).toBeTruthy();
  });

  it('blocks further entries on a cancelled session', async () => {
    const created = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester' });
    const id = created.body.id;
    await request(app)
      .post(`/api/v1/count-sessions/${id}/cancel`)
      .send({ reason: 'fire drill', cancelledBy: 'manager' });

    const blocked = await request(app)
      .post(`/api/v1/count-sessions/${id}/entries`)
      .send({ skuId: 'SKU-A', quantity: 1 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('rejects cancellation without reason / cancelledBy', async () => {
    const created = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester' });
    const res = await request(app).post(`/api/v1/count-sessions/${created.body.id}/cancel`).send({});
    expect(res.status).toBe(400);
  });

  it('blocks re-cancelling an already-cancelled session', async () => {
    const created = await request(app)
      .post('/api/v1/count-sessions')
      .send({ storeId: 1, openedBy: 'tester' });
    const id = created.body.id;
    await request(app)
      .post(`/api/v1/count-sessions/${id}/cancel`)
      .send({ reason: 'fire drill', cancelledBy: 'manager' });
    const second = await request(app)
      .post(`/api/v1/count-sessions/${id}/cancel`)
      .send({ reason: 'again', cancelledBy: 'manager' });
    expect(second.status).toBe(409);
  });
});

describe('GET /api/v1/count-sessions', () => {
  it('lists sessions filtered by store and status', async () => {
    await request(app).post('/api/v1/count-sessions').send({ storeId: 1, openedBy: 'a' });
    await request(app).post('/api/v1/count-sessions').send({ storeId: 1, openedBy: 'b' });
    await request(app).post('/api/v1/count-sessions').send({ storeId: 2, openedBy: 'c' });

    const all = await request(app).get('/api/v1/count-sessions');
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBe(3);

    const onlyStore1 = await request(app).get('/api/v1/count-sessions?storeId=1');
    expect(onlyStore1.body.data.length).toBe(2);

    const onlyDraft = await request(app).get('/api/v1/count-sessions?status=DRAFT');
    expect(onlyDraft.body.data.length).toBe(3);

    const noneOpen = await request(app).get('/api/v1/count-sessions?status=OPEN');
    expect(noneOpen.body.data.length).toBe(0);
  });
});
