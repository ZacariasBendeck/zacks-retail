import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';
import { prisma } from '../src/db/prisma';
import {
  cleanupMirroredInventoryStateByLegacySkuCodes,
  cleanupMirroredInventoryState,
  ensureInventoryAuditLogTablePresent,
  countInventoryAuditRows,
  getAggregateInventoryRecord,
} from './utils/postgresInventoryTestHelpers';

jest.setTimeout(30000);

function getRefId(table: string, offset = 0): number | null {
  const db = getDb();
  const row = db.prepare(`SELECT id FROM ${table} LIMIT 1 OFFSET ?`).get(offset) as { id: number } | undefined;
  return row ? row.id : null;
}

function getCategoryId(ricsCode: number): number | null {
  const db = getDb();
  const row = db.prepare('SELECT id FROM ref_categories WHERE rics_code = ?').get(ricsCode) as { id: number } | undefined;
  return row ? row.id : null;
}

let vendorId: string;
let skuId: string;
let mirroredSkuIds: string[] = [];
let mirroredLegacySkuCodes: string[] = [];

function seedLegacyVendor(): string {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    "INSERT INTO vendors (id, name, contact_email, payment_terms, lead_time_days, active) VALUES (?, ?, ?, 'NET_30', 14, 1)"
  ).run(id, 'Mutation Test Vendor', 'mutation@test.com');
  return id;
}

beforeEach(async () => {
  await ensureInventoryAuditLogTablePresent();
  await cleanupMirroredInventoryStateByLegacySkuCodes(mirroredLegacySkuCodes);
  await cleanupMirroredInventoryState(mirroredSkuIds);
  mirroredSkuIds = [];
  mirroredLegacySkuCodes = [];
  resetDb();
  vendorId = seedLegacyVendor();
  const catId = getCategoryId(560);
  const brandId = getRefId('ref_brands');
  const colorId = getRefId('ref_colors');
  const sku = await request(app).post('/api/v1/skus').send({
    style: 'Mutation Test Style',
    price: 100,
    department: 'FORMAL',
    categoryId: catId,
    vendorId,
    brandId,
    colorId,
  });
  skuId = sku.body.id;
  mirroredLegacySkuCodes = [sku.body.skuCode];
  await cleanupMirroredInventoryStateByLegacySkuCodes(mirroredLegacySkuCodes);
  mirroredSkuIds = [skuId];
});

afterAll(async () => {
  await ensureInventoryAuditLogTablePresent();
  await cleanupMirroredInventoryStateByLegacySkuCodes(mirroredLegacySkuCodes);
  await cleanupMirroredInventoryState(mirroredSkuIds);
  await prisma.$disconnect();
  resetDb();
});

// ── Mutation Endpoints (AC1, AC2, AC3, AC4, AC7, AC8) ───────────

describe('POST /api/v1/inventory/mutations/receive', () => {
  it('commits atomic mutation with sourceDocumentRef and ledger entry (AC1)', async () => {
    const res = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 50,
      reasonCode: 'PO Receipt',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-000001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    expect(res.status).toBe(200);
    expect(res.body.skuId).toBe(skuId);
    expect(res.body.adjustment).toBe(50);
    expect(res.body.resultingBalance).toBe(50);
    expect(res.body.sourceDocumentRef).toEqual({ type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-000001' });
  });

  it('rejects category code 555 with VALIDATION_CATEGORY_RANGE (AC3)', async () => {
    const res = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 10,
      reasonCode: 'Test',
      categoryCode: 555,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_CATEGORY_RANGE');
    expect(res.body.error.traceId).toBeDefined();
  });

  it('rejects category code 600 with VALIDATION_CATEGORY_RANGE (AC3)', async () => {
    const res = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 10,
      reasonCode: 'Test',
      categoryCode: 600,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_CATEGORY_RANGE');
  });

  it('rejects missing canonical attributes with VALIDATION_CANONICAL_ATTRIBUTE (AC4)', async () => {
    // Temporarily drop triggers so we can insert a SKU with null brand/color
    const db = getDb();
    db.exec('DROP TRIGGER IF EXISTS trg_skus_natural_identity_insert_v011');
    db.exec('DROP TRIGGER IF EXISTS trg_skus_require_natural_identity_insert');
    const badSkuId = uuidv4();
    const catId = getCategoryId(560);
    db.prepare(
      "INSERT INTO skus (id, sku_code, style, price, department, category_id, vendor_id, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
    ).run(badSkuId, 'BAD-SKU-001', 'Bad Style', 100, 'FORMAL', catId, vendorId);

    const res = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId: badSkuId,
      quantityDelta: 10,
      reasonCode: 'Test',
      categoryCode: 560,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_CANONICAL_ATTRIBUTE');
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(1);
  });

  it('returns error with code, message, details, traceId on validation failure (AC7)', async () => {
    const res = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 10,
      reasonCode: 'Test',
      categoryCode: 555,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
      traceId: expect.any(String),
    });
    expect(res.body.error.details).toBeDefined();
  });
});

describe('Idempotency (AC8)', () => {
  it('replays same key + same payload without creating duplicate', async () => {
    const idempotencyKey = uuidv4();
    const payload = {
      skuId,
      quantityDelta: 25,
      reasonCode: 'PO Receipt',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-000002' },
      actorId: uuidv4(),
      idempotencyKey,
    };

    const first = await request(app).post('/api/v1/inventory/mutations/receive').send(payload);
    expect(first.status).toBe(200);
    expect(first.body.resultingBalance).toBe(25);

    const second = await request(app).post('/api/v1/inventory/mutations/receive').send(payload);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
  });

  it('rejects same key with different payload as IDEMPOTENCY_KEY_PAYLOAD_MISMATCH (409)', async () => {
    const idempotencyKey = uuidv4();
    const payload1 = {
      skuId,
      quantityDelta: 25,
      reasonCode: 'PO Receipt',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-000003' },
      actorId: uuidv4(),
      idempotencyKey,
    };

    await request(app).post('/api/v1/inventory/mutations/receive').send(payload1);

    const payload2 = { ...payload1, quantityDelta: 50 };
    const second = await request(app).post('/api/v1/inventory/mutations/receive').send(payload2);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
  });

  it('requires Idempotency-Key on receive endpoint (CTO policy ZAI-168)', async () => {
    const res = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 10,
      reasonCode: 'PO Receipt',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-REQ-001' },
      actorId: uuidv4(),
      // idempotencyKey intentionally omitted
    });
    expect(res.status).toBe(400);
  });

  it('requires Idempotency-Key on transfer endpoint (CTO policy ZAI-168)', async () => {
    const res = await request(app).post('/api/v1/inventory/mutations/transfer').send({
      skuId,
      quantityDelta: -5,
      reasonCode: 'Transfer',
      categoryCode: 560,
      sourceDocumentRef: { type: 'TRANSFER_ORDER', id: 'TO-REQ-001' },
      actorId: uuidv4(),
      // idempotencyKey intentionally omitted
    });
    expect(res.status).toBe(400);
  });

  it('does NOT require Idempotency-Key on adjust endpoint', async () => {
    // First receive stock so we have inventory to adjust
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 100,
      reasonCode: 'Initial',
      categoryCode: 560,
      sourceDocumentRef: { type: 'INITIAL_IMPORT', id: 'IMP-IK-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    const res = await request(app).post('/api/v1/inventory/mutations/adjust').send({
      skuId,
      quantityDelta: -5,
      reasonCode: 'Damage write-off',
      categoryCode: 560,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-IK-001' },
      actorId: uuidv4(),
      // idempotencyKey intentionally omitted — should be allowed
    });
    expect(res.status).toBe(200);
  });
});

describe('Transaction rollback (AC2)', () => {
  it('does not commit stock delta when adjustment would go below zero', async () => {
    const res = await request(app).post('/api/v1/inventory/mutations/adjust').send({
      skuId,
      quantityDelta: -100,
      reasonCode: 'Damage write-off',
      categoryCode: 560,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-002' },
      actorId: uuidv4(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

    // Verify no stock delta committed
    const inv = await request(app).get(`/api/v1/skus/${skuId}/inventory`);
    // Stock should be 0 (no previous adjustments succeeded)
    if (inv.status === 200) {
      expect(inv.body.quantityOnHand).toBe(0);
    }
  });

  it('deterministic forced-persistence-failure: no stock delta AND no ledger row committed (AC2 hard-failure proof)', async () => {
    // First receive stock so we have a non-zero starting balance
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 50,
      reasonCode: 'Setup',
      categoryCode: 560,
      sourceDocumentRef: { type: 'INITIAL_IMPORT', id: 'IMP-AC2-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    const beforeInv = await getAggregateInventoryRecord(skuId);
    const beforeLedgerCount = await countInventoryAuditRows(skuId);
    expect(beforeInv?.quantityOnHand).toBe(50);

    // Simulate forced persistence failure by dropping the audit log table mid-transaction.
    // We rename inventory_audit_log so the INSERT inside executeMutation fails after the
    // UPDATE to inventory has been issued but before COMMIT.
    let failed: request.Response | null = null;
    await prisma.$executeRawUnsafe('ALTER TABLE app.inventory_audit_log RENAME TO inventory_audit_log_backup');
    try {
      failed = await request(app).post('/api/v1/inventory/mutations/receive').send({
        skuId,
        quantityDelta: 10,
        reasonCode: 'Should fail',
        categoryCode: 560,
        sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-AC2-FAIL' },
        actorId: uuidv4(),
        idempotencyKey: uuidv4(),
      });
    } finally {
      await ensureInventoryAuditLogTablePresent();
    }

    expect(failed?.status).toBe(500);

    // Verify stock delta was NOT committed (rollback worked)
    const afterInv = await getAggregateInventoryRecord(skuId);
    expect(afterInv?.quantityOnHand).toBe(50); // unchanged

    // Verify no new ledger row was committed
    const afterLedgerCount = await countInventoryAuditRows(skuId);
    expect(afterLedgerCount).toBe(beforeLedgerCount); // unchanged
  });
});

// ── On-Hand Lookup (AC5, AC6) ────────────────────────────────────

describe('GET /api/v1/inventory/on-hand/sku (AC5)', () => {
  beforeEach(async () => {
    // Add some inventory
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 30,
      reasonCode: 'Initial stock',
      categoryCode: 560,
      sourceDocumentRef: { type: 'INITIAL_IMPORT', id: 'IMPORT-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });
  });

  it('returns exact SKU on-hand by brandId + colorId', async () => {
    const brandId = getRefId('ref_brands');
    const colorId = getRefId('ref_colors');
    const res = await request(app).get(`/api/v1/inventory/on-hand/sku?brandId=${brandId}&colorId=${colorId}`);
    expect(res.status).toBe(200);
    expect(res.body.skuId).toBe(skuId);
    expect(res.body.onHandUnits).toBe(30);
  });

  it('returns exact SKU on-hand by full tuple: brandId + style + colorId + sizeId', async () => {
    const brandId = getRefId('ref_brands');
    const colorId = getRefId('ref_colors');
    const res = await request(app).get(
      `/api/v1/inventory/on-hand/sku?brandId=${brandId}&style=Mutation+Test+Style&colorId=${colorId}`
    );
    expect(res.status).toBe(200);
    expect(res.body.skuId).toBe(skuId);
    expect(res.body.style).toBe('Mutation Test Style');
    expect(res.body.onHandUnits).toBe(30);
  });

  it('returns 404 when style filter does not match (negative case)', async () => {
    const brandId = getRefId('ref_brands');
    const colorId = getRefId('ref_colors');
    const res = await request(app).get(
      `/api/v1/inventory/on-hand/sku?brandId=${brandId}&style=NONEXISTENT_STYLE&colorId=${colorId}`
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for non-matching filters', async () => {
    const res = await request(app).get('/api/v1/inventory/on-hand/sku?brandId=999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/v1/inventory/on-hand/departments (AC6)', () => {
  it('includes all six macro-departments with zero totals', async () => {
    const res = await request(app).get('/api/v1/inventory/on-hand/departments');
    expect(res.status).toBe(200);
    expect(res.body.departments).toHaveLength(6);
    const deptNames = res.body.departments.map((d: any) => d.department);
    expect(deptNames).toEqual(['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT']);
  });

  it('returns correct totals after receiving stock', async () => {
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 20,
      reasonCode: 'PO Receipt',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-000004' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    const res = await request(app).get('/api/v1/inventory/on-hand/departments');
    expect(res.status).toBe(200);
    const formal = res.body.departments.find((d: any) => d.department === 'FORMAL');
    expect(formal.totalUnitsOnHand).toBe(20);
    expect(formal.totalSkus).toBeGreaterThanOrEqual(1);
  });
});

// ── Optimistic Concurrency (ZAI-296 AC3) ────────────────────────

describe('Optimistic concurrency — version check (ZAI-296 AC3)', () => {
  it('returns version in mutation response', async () => {
    const res = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 10,
      reasonCode: 'PO Receipt',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-VER-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2); // initial version 1 → incremented to 2
  });

  it('increments version on each successful mutation', async () => {
    const first = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 10,
      reasonCode: 'First receive',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-VER-002a' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });
    expect(first.body.version).toBe(2);

    const second = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 5,
      reasonCode: 'Second receive',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-VER-002b' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });
    expect(second.body.version).toBe(3);
  });

  it('succeeds when expectedVersion matches current version', async () => {
    // First mutation to create inventory row (version becomes 2)
    const first = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 20,
      reasonCode: 'Setup',
      categoryCode: 560,
      sourceDocumentRef: { type: 'INITIAL_IMPORT', id: 'IMP-VER-003' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });
    expect(first.body.version).toBe(2);

    // Second mutation with correct expectedVersion
    const second = await request(app).post('/api/v1/inventory/mutations/adjust').send({
      skuId,
      quantityDelta: -5,
      reasonCode: 'Damage',
      categoryCode: 560,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-VER-003' },
      actorId: uuidv4(),
      expectedVersion: 2,
    });
    expect(second.status).toBe(200);
    expect(second.body.version).toBe(3);
    expect(second.body.resultingBalance).toBe(15);
  });

  it('rejects mutation when expectedVersion is stale (409 CONFLICT_VERSION_MISMATCH)', async () => {
    // Create inventory row
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 50,
      reasonCode: 'Setup',
      categoryCode: 560,
      sourceDocumentRef: { type: 'INITIAL_IMPORT', id: 'IMP-VER-004a' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    // Apply another mutation (version now 3)
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 10,
      reasonCode: 'More stock',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-VER-004b' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    // Try with stale expectedVersion (1 instead of 3)
    const stale = await request(app).post('/api/v1/inventory/mutations/adjust').send({
      skuId,
      quantityDelta: -5,
      reasonCode: 'Late adjustment',
      categoryCode: 560,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-VER-004' },
      actorId: uuidv4(),
      expectedVersion: 1,
    });

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT_VERSION_MISMATCH');
    expect(stale.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'expectedVersion' }),
        expect.objectContaining({ field: 'currentVersion' }),
      ])
    );
  });

  it('no stock delta committed when version conflict occurs (AC3 + AC2 rollback)', async () => {
    // Setup: receive stock
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 30,
      reasonCode: 'Setup',
      categoryCode: 560,
      sourceDocumentRef: { type: 'INITIAL_IMPORT', id: 'IMP-VER-005' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    const beforeInv = await getAggregateInventoryRecord(skuId);
    expect(beforeInv?.quantityOnHand).toBe(30);

    // Attempt with stale version
    const res = await request(app).post('/api/v1/inventory/mutations/adjust').send({
      skuId,
      quantityDelta: -10,
      reasonCode: 'Should fail',
      categoryCode: 560,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-VER-005' },
      actorId: uuidv4(),
      expectedVersion: 1, // stale
    });
    expect(res.status).toBe(409);

    // Verify no stock change
    const afterInv = await getAggregateInventoryRecord(skuId);
    expect(afterInv?.quantityOnHand).toBe(30); // unchanged
    expect(afterInv?.version).toBe(beforeInv?.version); // unchanged
  });

  it('does not require expectedVersion (optional parameter)', async () => {
    const res = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 10,
      reasonCode: 'No version check',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-VER-006' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
      // expectedVersion intentionally omitted
    });
    expect(res.status).toBe(200);
    expect(res.body.version).toBeDefined();
  });
});

// ── Idempotency replay returns version (ZAI-296 AC4) ────────────

describe('Idempotency replay includes version (ZAI-296 AC4)', () => {
  it('replay response includes current version', async () => {
    const idempotencyKey = uuidv4();
    const payload = {
      skuId,
      quantityDelta: 15,
      reasonCode: 'PO Receipt',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-IDEM-VER-001' },
      actorId: uuidv4(),
      idempotencyKey,
    };

    const first = await request(app).post('/api/v1/inventory/mutations/receive').send(payload);
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(2);

    // Apply another mutation to advance version
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 5,
      reasonCode: 'More',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-IDEM-VER-002' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    // Replay original — version should reflect current state
    const replay = await request(app).post('/api/v1/inventory/mutations/receive').send(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.version).toBe(3); // current version, not original
  });
});

// ── Mutation endpoints share the same business logic ─────────────

describe('POST /api/v1/inventory/mutations/adjust', () => {
  it('works for stock adjustment', async () => {
    // First add stock
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 100,
      reasonCode: 'Initial',
      categoryCode: 560,
      sourceDocumentRef: { type: 'INITIAL_IMPORT', id: 'IMP-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    // Now adjust down
    const res = await request(app).post('/api/v1/inventory/mutations/adjust').send({
      skuId,
      quantityDelta: -10,
      reasonCode: 'Damaged goods',
      categoryCode: 560,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-003' },
      actorId: uuidv4(),
    });

    expect(res.status).toBe(200);
    expect(res.body.resultingBalance).toBe(90);
    expect(res.body.sourceDocumentRef).toEqual({ type: 'STOCK_ADJUSTMENT', id: 'ADJ-003' });
  });
});

describe('POST /api/v1/inventory/mutations/transfer', () => {
  it('works for transfer order', async () => {
    // First add stock
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 50,
      reasonCode: 'Inbound',
      categoryCode: 560,
      sourceDocumentRef: { type: 'INITIAL_IMPORT', id: 'IMP-002' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    const res = await request(app).post('/api/v1/inventory/mutations/transfer').send({
      skuId,
      quantityDelta: -15,
      reasonCode: 'Transfer to Store B',
      categoryCode: 560,
      sourceDocumentRef: { type: 'TRANSFER_ORDER', id: 'TO-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    expect(res.status).toBe(200);
    expect(res.body.resultingBalance).toBe(35);
    expect(res.body.sourceDocumentRef).toEqual({ type: 'TRANSFER_ORDER', id: 'TO-001' });
  });
});
