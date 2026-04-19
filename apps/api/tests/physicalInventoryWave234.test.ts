/**
 * Physical Inventory module — Waves 2, 3, 4 coverage.
 *
 * Wave 2: variance computation + banding, items-not-counted, review acks,
 *         markSessionExported, bulkZeroOut, CSV exports.
 * Wave 3: joinSessionByCode, registerDevice, acknowledgeBatch, importBatchCsv,
 *         computeConflicts, INDEPENDENT_VERIFICATION mode.
 * Wave 4: event emission for opened, frozen, review-ready, exported,
 *         extreme-variance, cancelled.
 */

import request from 'supertest';

jest.mock('../src/services/ricsInventoryAdapter', () => ({
  getSkuStoreCellRollup: jest.fn(),
}));

import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';
import { getSkuStoreCellRollup, type SkuStoreCellRow } from '../src/services/ricsInventoryAdapter';
import { physicalInventoryEvents } from '../src/services/physicalInventoryEvents';

const mockedGetCellRollup = getSkuStoreCellRollup as jest.MockedFunction<typeof getSkuStoreCellRollup>;

function fakeCell(overrides: Partial<SkuStoreCellRow> & Pick<SkuStoreCellRow, 'sku' | 'columnLabel' | 'rowLabel' | 'onHand'>): SkuStoreCellRow {
  return {
    sku: overrides.sku,
    store: overrides.store ?? 1,
    storeName: overrides.storeName ?? null,
    rowLabel: overrides.rowLabel,
    columnLabel: overrides.columnLabel,
    description: overrides.description ?? null,
    brand: overrides.brand ?? null,
    vendorCode: overrides.vendorCode ?? null,
    category: overrides.category ?? null,
    season: overrides.season ?? null,
    sizeTypeCode: overrides.sizeTypeCode ?? null,
    sizeTypeDesc: overrides.sizeTypeDesc ?? null,
    onHand: overrides.onHand,
    model: overrides.model ?? 0,
    maxQty: overrides.maxQty ?? 0,
    reorder: overrides.reorder ?? 0,
    currentOnOrder: overrides.currentOnOrder ?? 0,
    futureOnOrder: overrides.futureOnOrder ?? 0,
    mtdSales: overrides.mtdSales ?? 0,
    stdSales: overrides.stdSales ?? 0,
    ytdSales: overrides.ytdSales ?? 0,
    lySales: overrides.lySales ?? 0,
  };
}

beforeEach(() => {
  resetDb();
  mockedGetCellRollup.mockReset();
  mockedGetCellRollup.mockResolvedValue([]);
});

afterAll(() => {
  resetDb();
  physicalInventoryEvents.removeAllListeners();
});

async function createOpenedSession(): Promise<string> {
  const create = await request(app)
    .post('/api/v1/count-sessions')
    .send({ storeId: 1, openedBy: 'tester' });
  expect(create.status).toBe(201);
  const id = create.body.id as string;
  await request(app).post(`/api/v1/count-sessions/${id}/open`);
  return id;
}

async function createFrozenSession(snapshotCells: SkuStoreCellRow[]): Promise<string> {
  const id = await createOpenedSession();
  mockedGetCellRollup.mockResolvedValueOnce(snapshotCells);
  await request(app).post(`/api/v1/count-sessions/${id}/freeze`);
  return id;
}

// ════════════════════════════════════════════════════════════════════════════
// Wave 2 — variance, items-not-counted, review acks, export
// ════════════════════════════════════════════════════════════════════════════

describe('Wave 2: readyForReview + variance computation', () => {
  it('computes variance for cells with entries and bands correctly using default settings', async () => {
    // Defaults: low=2%, extreme=15%
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-A', columnLabel: '7', rowLabel: 'M', onHand: 100 }),
      fakeCell({ sku: 'SKU-A', columnLabel: '8', rowLabel: 'M', onHand: 50 }),
      fakeCell({ sku: 'SKU-B', columnLabel: '', rowLabel: '', onHand: 10 }),
    ]);

    // SKU-A col 7: counted=100, snapshot=100 → ZERO
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: 100,
    });
    // SKU-A col 8: counted=51, snapshot=50, delta=1, pct=2 → LOW (boundary)
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-A', columnLabel: '8', rowLabel: 'M', quantity: 51,
    });
    // SKU-B: counted=8, snapshot=10, delta=-2, pct=20 → EXTREME (>=15)
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-B', columnLabel: '', rowLabel: '', quantity: 8,
    });

    const ready = await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);
    expect(ready.status).toBe(200);
    expect(ready.body.session.status).toBe('READY_FOR_REVIEW');
    expect(ready.body.variancesComputed).toBe(3);
    expect(ready.body.extremeCount).toBe(1);

    const variances = await request(app).get(`/api/v1/count-sessions/${id}/variance`);
    expect(variances.status).toBe(200);
    const byBand: Record<string, number> = {};
    for (const v of variances.body.data) byBand[v.band] = (byBand[v.band] ?? 0) + 1;
    expect(byBand.ZERO).toBe(1);
    expect(byBand.LOW).toBe(1);
    expect(byBand.EXTREME).toBe(1);
  });

  it('zero-flag SKU sets every cell to counted=0 (RICS p. 137 zero-count)', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-Z', columnLabel: '7', rowLabel: 'M', onHand: 5 }),
      fakeCell({ sku: 'SKU-Z', columnLabel: '8', rowLabel: 'M', onHand: 3 }),
      fakeCell({ sku: 'SKU-Z', columnLabel: '9', rowLabel: 'M', onHand: 0 }),
    ]);

    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-Z', isZero: true,
    });

    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);
    const variances = await request(app).get(`/api/v1/count-sessions/${id}/variance`);
    expect(variances.body.data).toHaveLength(3);
    for (const v of variances.body.data) {
      expect(v.skuId).toBe('SKU-Z');
      expect(v.countedQty).toBe(0);
      // delta = countedQty - snapshotOnHand = 0 - snapshotOnHand. Avoid
      // -0/0 toBe quirk via Object.is by using addition.
      expect(v.delta + v.snapshotOnHand).toBe(0);
    }
  });

  it('regular entry on the same SKU as a zero-flag is overridden by zero (zero-flag wins)', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-Z', columnLabel: '7', rowLabel: 'M', onHand: 5 }),
    ]);

    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-Z', columnLabel: '7', rowLabel: 'M', quantity: 4,
    });
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-Z', isZero: true,
    });

    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);
    const variances = await request(app).get(`/api/v1/count-sessions/${id}/variance`);
    expect(variances.body.data).toHaveLength(1);
    expect(variances.body.data[0].countedQty).toBe(0);
    expect(variances.body.data[0].delta).toBe(-5);
  });

  it('cell counted but not in snapshot → snapshotOnHand=0, EXTREME variance', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-X', columnLabel: '7', rowLabel: 'M', onHand: 10 }),
    ]);
    // Operator counted SKU-Y which wasn't on the floor at freeze.
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-Y', columnLabel: '8', rowLabel: 'L', quantity: 3,
    });

    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);
    const variances = await request(app)
      .get(`/api/v1/count-sessions/${id}/variance`)
      .query({ bands: 'EXTREME' });
    expect(variances.body.data).toHaveLength(1);
    expect(variances.body.data[0].skuId).toBe('SKU-Y');
    expect(variances.body.data[0].snapshotOnHand).toBe(0);
    expect(variances.body.data[0].countedQty).toBe(3);
    expect(variances.body.data[0].variancePct).toBeNull();
  });

  it('readyForReview is idempotent on its own data (callable twice without duplicates)', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-A', columnLabel: '7', rowLabel: 'M', onHand: 10 }),
    ]);
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: 10,
    });

    const r1 = await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);
    expect(r1.status).toBe(200);
    expect(r1.body.variancesComputed).toBe(1);

    // Calling again on the same data: no error, no duplicates, same result.
    // Per spec, READY_FOR_REVIEW means counting is over — addEntry is blocked
    // until the session is back-transitioned (out of scope for P1.a).
    const r2 = await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);
    expect(r2.status).toBe(200);
    expect(r2.body.variancesComputed).toBe(1);

    const variances = await request(app).get(`/api/v1/count-sessions/${id}/variance`);
    expect(variances.body.data).toHaveLength(1);
    expect(variances.body.data[0].countedQty).toBe(10);
    expect(variances.body.data[0].band).toBe('ZERO');
  });

  it('addEntry is rejected after readyForReview (spec: counting is over)', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-A', columnLabel: '7', rowLabel: 'M', onHand: 10 }),
    ]);
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: 8,
    });
    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);

    const blocked = await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: 2,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('Wave 2: items-not-counted', () => {
  it('lists snapshot cells with no entries, default excludes zero on-hand', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-A', columnLabel: '7', rowLabel: 'M', onHand: 5 }),
      fakeCell({ sku: 'SKU-B', columnLabel: '8', rowLabel: 'M', onHand: 0 }),
      fakeCell({ sku: 'SKU-C', columnLabel: '9', rowLabel: 'M', onHand: 3 }),
    ]);
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: 5,
    });

    // Default excludes zero-on-hand → SKU-A counted (excluded), SKU-B zero-onhand (excluded), SKU-C remains.
    const res = await request(app).get(`/api/v1/count-sessions/${id}/items-not-counted`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].skuId).toBe('SKU-C');

    // includeZeroOnHand=true brings SKU-B back.
    const res2 = await request(app)
      .get(`/api/v1/count-sessions/${id}/items-not-counted`)
      .query({ includeZeroOnHand: 'true' });
    expect(res2.body.data).toHaveLength(2);
  });

  it('CSV export of items-not-counted has a header + rows', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-A', columnLabel: '7', rowLabel: 'M', onHand: 5 }),
    ]);
    const res = await request(app).get(`/api/v1/count-sessions/${id}/items-not-counted.csv`);
    expect(res.status).toBe(200);
    expect(res.text.split('\n')[0]).toBe('skuId,columnLabel,rowLabel,snapshotOnHand');
    expect(res.text.split('\n')).toHaveLength(2);
  });
});

describe('Wave 2: review acks + export gating', () => {
  it('export is blocked until all 4 review acks present', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-A', columnLabel: '7', rowLabel: 'M', onHand: 5 }),
    ]);
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-A', columnLabel: '7', rowLabel: 'M', quantity: 5,
    });
    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);

    // No acks yet — export blocked.
    const r1 = await request(app).post(`/api/v1/count-sessions/${id}/export`).send({ exportedBy: 'mgr' });
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe('REVIEW_ACKS_MISSING');

    // Three acks only — still blocked.
    for (const step of ['VIEWED_ITEMS_NOT_COUNTED', 'VIEWED_VARIANCE', 'BACKUP_VERIFIED']) {
      await request(app).post(`/api/v1/count-sessions/${id}/review-acks`).send({ step, acknowledgedBy: 'mgr' });
    }
    const r2 = await request(app).post(`/api/v1/count-sessions/${id}/export`).send({ exportedBy: 'mgr' });
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe('REVIEW_ACKS_MISSING');
  });

  it('export is blocked when material/extreme variances are unacknowledged', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-X', columnLabel: '', rowLabel: '', onHand: 10 }),
    ]);
    // 50% variance → EXTREME
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-X', columnLabel: '', rowLabel: '', quantity: 5,
    });
    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);

    for (const step of ['VIEWED_ITEMS_NOT_COUNTED', 'VIEWED_VARIANCE', 'ACK_MATERIAL_VARIANCES', 'BACKUP_VERIFIED']) {
      await request(app).post(`/api/v1/count-sessions/${id}/review-acks`).send({ step, acknowledgedBy: 'mgr' });
    }
    const blocked = await request(app).post(`/api/v1/count-sessions/${id}/export`).send({ exportedBy: 'mgr' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('VARIANCES_UNACKNOWLEDGED');
  });

  it('export succeeds after all gates satisfied → EXPORTED status', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-OK', columnLabel: '', rowLabel: '', onHand: 10 }),
    ]);
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-OK', columnLabel: '', rowLabel: '', quantity: 10,
    });
    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);

    for (const step of ['VIEWED_ITEMS_NOT_COUNTED', 'VIEWED_VARIANCE', 'ACK_MATERIAL_VARIANCES', 'BACKUP_VERIFIED']) {
      await request(app).post(`/api/v1/count-sessions/${id}/review-acks`).send({ step, acknowledgedBy: 'mgr' });
    }
    const ok = await request(app).post(`/api/v1/count-sessions/${id}/export`).send({ exportedBy: 'mgr' });
    expect(ok.status).toBe(200);
    expect(ok.body.session.status).toBe('EXPORTED');
    expect(ok.body.session.exportedBy).toBe('mgr');
    expect(ok.body.session.exportedAt).toBeTruthy();
  });

  it('acknowledge variance flips acknowledgedAt + acknowledgedBy', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-MAT', columnLabel: '', rowLabel: '', onHand: 100 }),
    ]);
    // 5% delta → MATERIAL (>2%, <15%)
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-MAT', columnLabel: '', rowLabel: '', quantity: 95,
    });
    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);

    const variances = await request(app).get(`/api/v1/count-sessions/${id}/variance`);
    const matVariance = variances.body.data.find((v: { band: string }) => v.band === 'MATERIAL');
    expect(matVariance).toBeDefined();

    const ack = await request(app)
      .post(`/api/v1/count-sessions/${id}/variance/${matVariance.id}/acknowledge`)
      .send({ acknowledgedBy: 'reviewer' });
    expect(ack.status).toBe(200);
    expect(ack.body.acknowledgedBy).toBe('reviewer');
    expect(ack.body.acknowledgedAt).toBeTruthy();
  });
});

describe('Wave 2: bulkZeroOut + variance summary', () => {
  it('bulkZeroOut creates is_zero_flag entries for each SKU', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-1', columnLabel: '7', rowLabel: 'M', onHand: 3 }),
      fakeCell({ sku: 'SKU-2', columnLabel: '8', rowLabel: 'L', onHand: 5 }),
    ]);
    const res = await request(app)
      .post(`/api/v1/count-sessions/${id}/items-not-counted/zero-out-bulk`)
      .send({ skuIds: ['SKU-1', 'SKU-2'], performedBy: 'mgr' });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(2);
    for (const e of res.body.data) {
      expect(e.isZeroFlag).toBe(true);
      expect(e.quantity).toBe(0);
    }
  });

  it('variance summary returns rollup per band', async () => {
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-A', columnLabel: '', rowLabel: '', onHand: 100 }),
      fakeCell({ sku: 'SKU-B', columnLabel: '', rowLabel: '', onHand: 100 }),
    ]);
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-A', columnLabel: '', rowLabel: '', quantity: 100,
    }); // ZERO
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-B', columnLabel: '', rowLabel: '', quantity: 80,
    }); // 20% → EXTREME

    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);
    const summary = await request(app).get(`/api/v1/count-sessions/${id}/variance/summary`);
    expect(summary.status).toBe(200);
    expect(summary.body.bands).toHaveLength(4);
    const extreme = summary.body.bands.find((b: { band: string }) => b.band === 'EXTREME');
    expect(extreme.cellCount).toBe(1);
    expect(extreme.unacknowledgedCount).toBe(1);
    expect(summary.body.pendingAcknowledgements).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Wave 3 — mobile join + batches + CSV import + conflicts + IV mode
// ════════════════════════════════════════════════════════════════════════════

describe('Wave 3: joinSessionByCode', () => {
  it('returns session info for OPEN session', async () => {
    const id = await createOpenedSession();
    const session = await request(app).get(`/api/v1/count-sessions/${id}`);
    const code = session.body.session.joinCode as string;

    const res = await request(app).post(`/api/v1/count-sessions/by-join-code/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(id);
    expect(res.body.storeId).toBe(1);
  });

  it('rejects an unknown join code', async () => {
    const res = await request(app).post(`/api/v1/count-sessions/by-join-code/000000`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOIN_CODE_INVALID');
  });

  it('rejects join code on a CANCELLED session', async () => {
    const id = await createOpenedSession();
    const session = await request(app).get(`/api/v1/count-sessions/${id}`);
    const code = session.body.session.joinCode as string;
    await request(app)
      .post(`/api/v1/count-sessions/${id}/cancel`)
      .send({ reason: 'test', cancelledBy: 'mgr' });

    const res = await request(app).post(`/api/v1/count-sessions/by-join-code/${code}`);
    expect(res.status).toBe(404);
  });
});

describe('Wave 3: registerDevice + acknowledgeBatch', () => {
  it('registerDevice creates a MOBILE_WEB batch with deviceId', async () => {
    const id = await createOpenedSession();
    const res = await request(app)
      .post(`/api/v1/count-sessions/${id}/devices`)
      .send({ deviceLabel: "Maria's iPhone", counterUserId: 'user-1' });
    expect(res.status).toBe(201);
    expect(res.body.source).toBe('MOBILE_WEB');
    expect(res.body.deviceId).toBeTruthy();
    expect(res.body.deviceLabel).toBe("Maria's iPhone");
  });

  it('acknowledgeBatch sets acknowledged_at', async () => {
    const id = await createOpenedSession();
    const dev = await request(app)
      .post(`/api/v1/count-sessions/${id}/devices`)
      .send({ deviceLabel: 'phone' });
    expect(dev.body.acknowledgedAt).toBeNull();

    const ack = await request(app).post(`/api/v1/count-sessions/${id}/batches/${dev.body.id}/acknowledge`);
    expect(ack.status).toBe(200);
    expect(ack.body.acknowledgedAt).toBeTruthy();
  });
});

describe('Wave 3: importBatchCsv', () => {
  async function setupBatch(): Promise<{ sessionId: string; batchId: string }> {
    const sessionId = await createOpenedSession();
    const batch = await request(app)
      .post(`/api/v1/count-sessions/${sessionId}/batches`)
      .send({ source: 'CSV_IMPORT' });
    return { sessionId, batchId: batch.body.id as string };
  }

  it('parses valid CSV and creates entries', async () => {
    const { sessionId, batchId } = await setupBatch();
    const csv = [
      'sku,columnLabel,rowLabel,quantity',
      'SKU-A,7,M,3',
      'SKU-A,8,M,2',
      'SKU-B,,,5',
    ].join('\n');
    const res = await request(app)
      .post(`/api/v1/count-sessions/${sessionId}/batches/${batchId}/import-csv`)
      .send({ csv, performedBy: 'importer' });
    expect(res.status).toBe(201);
    expect(res.body.acceptedCount).toBe(3);
    expect(res.body.exceptions).toHaveLength(0);
  });

  it('collects exceptions with prev/next valid SKU anchors (RICS p. 138)', async () => {
    const { sessionId, batchId } = await setupBatch();
    const csv = [
      'sku,columnLabel,rowLabel,quantity',
      'SKU-A,7,M,1',
      ',8,M,2',           // missing sku
      'SKU-B,9,M,not-a-number', // bad qty
      'SKU-C,10,M,4',
    ].join('\n');
    const res = await request(app)
      .post(`/api/v1/count-sessions/${sessionId}/batches/${batchId}/import-csv`)
      .send({ csv, performedBy: 'importer' });
    expect(res.status).toBe(201);
    expect(res.body.acceptedCount).toBe(2);
    expect(res.body.exceptions).toHaveLength(2);
    expect(res.body.exceptions[0].previousValidSku).toBe('SKU-A');
    expect(res.body.exceptions[0].nextValidSku).toBe('SKU-C');
    expect(res.body.exceptions[1].previousValidSku).toBe('SKU-A');
    expect(res.body.exceptions[1].nextValidSku).toBe('SKU-C');
  });

  it('rejects CSV without a valid header', async () => {
    const { sessionId, batchId } = await setupBatch();
    const res = await request(app)
      .post(`/api/v1/count-sessions/${sessionId}/batches/${batchId}/import-csv`)
      .send({ csv: 'bogus,header\n1,2', performedBy: 'importer' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CSV_HEADER_INVALID');
  });
});

describe('Wave 3: computeConflicts', () => {
  it('flags same-cell counts from multiple devices within window', async () => {
    const id = await createOpenedSession();
    const dev1 = await request(app).post(`/api/v1/count-sessions/${id}/devices`).send({ deviceLabel: 'phone-A' });
    const dev2 = await request(app).post(`/api/v1/count-sessions/${id}/devices`).send({ deviceLabel: 'phone-B' });

    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      batchId: dev1.body.id, skuId: 'SKU-X', columnLabel: '7', rowLabel: 'M', quantity: 3,
    });
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      batchId: dev2.body.id, skuId: 'SKU-X', columnLabel: '7', rowLabel: 'M', quantity: 5,
    });

    const conflicts = await request(app).get(`/api/v1/count-sessions/${id}/conflicts`);
    expect(conflicts.status).toBe(200);
    expect(conflicts.body.data).toHaveLength(1);
    expect(conflicts.body.data[0].skuId).toBe('SKU-X');
    expect(conflicts.body.data[0].deviceCount).toBe(2);
    expect(conflicts.body.data[0].totalQuantity).toBe(8);
    expect(conflicts.body.data[0].devices).toHaveLength(2);
  });

  it('does not flag a single-device cell', async () => {
    const id = await createOpenedSession();
    const dev1 = await request(app).post(`/api/v1/count-sessions/${id}/devices`).send({ deviceLabel: 'phone-A' });

    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      batchId: dev1.body.id, skuId: 'SKU-X', columnLabel: '7', rowLabel: 'M', quantity: 3,
    });
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      batchId: dev1.body.id, skuId: 'SKU-X', columnLabel: '7', rowLabel: 'M', quantity: 2,
    });

    const conflicts = await request(app).get(`/api/v1/count-sessions/${id}/conflicts`);
    expect(conflicts.body.data).toHaveLength(0);
  });
});

describe('Wave 3: INDEPENDENT_VERIFICATION mode', () => {
  it('creates a session with mode + N>=2', async () => {
    const res = await request(app).post('/api/v1/count-sessions').send({
      storeId: 3,
      openedBy: 'tester',
      mode: 'INDEPENDENT_VERIFICATION',
      independentVerificationN: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('INDEPENDENT_VERIFICATION');
    expect(res.body.independentVerificationN).toBe(3);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Wave 4 — events
// ════════════════════════════════════════════════════════════════════════════

describe('Wave 4: event emission', () => {
  beforeEach(() => {
    physicalInventoryEvents.removeAllListeners();
  });

  it('emits opened on openSession', async () => {
    const onOpened = jest.fn();
    physicalInventoryEvents.on('count-session.opened', onOpened);
    const create = await request(app).post('/api/v1/count-sessions').send({ storeId: 1, openedBy: 't' });
    await request(app).post(`/api/v1/count-sessions/${create.body.id}/open`);
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(onOpened.mock.calls[0][0]).toMatchObject({
      sessionId: create.body.id,
      storeId: 1,
      openedBy: 't',
    });
  });

  it('emits frozen on freezeSession with cellCount', async () => {
    const onFrozen = jest.fn();
    physicalInventoryEvents.on('count-session.frozen', onFrozen);
    await createFrozenSession([
      fakeCell({ sku: 'SKU-A', columnLabel: '7', rowLabel: 'M', onHand: 5 }),
      fakeCell({ sku: 'SKU-A', columnLabel: '8', rowLabel: 'M', onHand: 3 }),
    ]);
    expect(onFrozen).toHaveBeenCalledTimes(1);
    expect(onFrozen.mock.calls[0][0].cellCount).toBe(2);
  });

  it('emits review-ready on readyForReview with material+extreme counts', async () => {
    const onReady = jest.fn();
    physicalInventoryEvents.on('count-session.review-ready', onReady);
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-A', columnLabel: '', rowLabel: '', onHand: 100 }),
    ]);
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-A', columnLabel: '', rowLabel: '', quantity: 80, // 20% → EXTREME
    });
    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady.mock.calls[0][0].extremeCount).toBe(1);
  });

  it('emits one extreme-variance per EXTREME row', async () => {
    const onExtreme = jest.fn();
    physicalInventoryEvents.on('count-session.extreme-variance', onExtreme);
    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-A', columnLabel: '', rowLabel: '', onHand: 100 }),
      fakeCell({ sku: 'SKU-B', columnLabel: '', rowLabel: '', onHand: 100 }),
    ]);
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-A', columnLabel: '', rowLabel: '', quantity: 50,
    });
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-B', columnLabel: '', rowLabel: '', quantity: 70,
    });
    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);
    expect(onExtreme).toHaveBeenCalledTimes(2);
  });

  it('emits exported on successful markSessionExported', async () => {
    const onExported = jest.fn();
    physicalInventoryEvents.on('count-session.exported', onExported);

    const id = await createFrozenSession([
      fakeCell({ sku: 'SKU-A', columnLabel: '', rowLabel: '', onHand: 5 }),
    ]);
    await request(app).post(`/api/v1/count-sessions/${id}/entries`).send({
      skuId: 'SKU-A', columnLabel: '', rowLabel: '', quantity: 5,
    });
    await request(app).post(`/api/v1/count-sessions/${id}/ready-for-review`);
    for (const step of ['VIEWED_ITEMS_NOT_COUNTED', 'VIEWED_VARIANCE', 'ACK_MATERIAL_VARIANCES', 'BACKUP_VERIFIED']) {
      await request(app).post(`/api/v1/count-sessions/${id}/review-acks`).send({ step, acknowledgedBy: 'mgr' });
    }
    await request(app).post(`/api/v1/count-sessions/${id}/export`).send({ exportedBy: 'mgr' });

    expect(onExported).toHaveBeenCalledTimes(1);
    expect(onExported.mock.calls[0][0]).toMatchObject({ sessionId: id, exportedBy: 'mgr' });
  });

  it('emits cancelled on cancelSession', async () => {
    const onCancelled = jest.fn();
    physicalInventoryEvents.on('count-session.cancelled', onCancelled);
    const create = await request(app).post('/api/v1/count-sessions').send({ storeId: 1, openedBy: 't' });
    await request(app)
      .post(`/api/v1/count-sessions/${create.body.id}/cancel`)
      .send({ reason: 'oops', cancelledBy: 'mgr' });
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(onCancelled.mock.calls[0][0]).toMatchObject({
      sessionId: create.body.id,
      cancelledBy: 'mgr',
      reason: 'oops',
    });
  });
});
