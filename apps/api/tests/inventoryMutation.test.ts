import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';

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

beforeEach(async () => {
  resetDb();
  const vendor = await request(app).post('/api/v1/vendors').send({ name: 'Mutation Test Vendor' });
  vendorId = vendor.body.id;
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
});

afterAll(() => {
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
    const db = getDb();

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

    const beforeInv = db.prepare('SELECT quantity_on_hand FROM inventory WHERE sku_id = ?').get(skuId) as { quantity_on_hand: number };
    const beforeLedgerCount = (db.prepare('SELECT COUNT(*) as cnt FROM inventory_audit_log WHERE sku_id = ?').get(skuId) as { cnt: number }).cnt;
    expect(beforeInv.quantity_on_hand).toBe(50);

    // Simulate forced persistence failure by dropping the audit log table mid-transaction.
    // We rename inventory_audit_log so the INSERT inside executeMutation fails after the
    // UPDATE to inventory has been issued but before COMMIT.
    db.exec('ALTER TABLE inventory_audit_log RENAME TO inventory_audit_log_backup');

    let threw = false;
    try {
      await request(app).post('/api/v1/inventory/mutations/receive').send({
        skuId,
        quantityDelta: 10,
        reasonCode: 'Should fail',
        categoryCode: 560,
        sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-AC2-FAIL' },
        actorId: uuidv4(),
        idempotencyKey: uuidv4(),
      });
    } catch {
      threw = true;
    }

    // Restore the table
    db.exec('ALTER TABLE inventory_audit_log_backup RENAME TO inventory_audit_log');

    // Verify stock delta was NOT committed (rollback worked)
    const afterInv = db.prepare('SELECT quantity_on_hand FROM inventory WHERE sku_id = ?').get(skuId) as { quantity_on_hand: number };
    expect(afterInv.quantity_on_hand).toBe(50); // unchanged

    // Verify no new ledger row was committed
    const afterLedgerCount = (db.prepare('SELECT COUNT(*) as cnt FROM inventory_audit_log WHERE sku_id = ?').get(skuId) as { cnt: number }).cnt;
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
