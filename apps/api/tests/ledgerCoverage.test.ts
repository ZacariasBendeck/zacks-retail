/**
 * Ledger coverage tests (ZAI-352)
 *
 * Verifies that both inventory write paths (adjustStock and executeMutation)
 * create canonical source records that trigger inventory_movement_ledger entries
 * via migration-019 triggers.
 */
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import app from '../src/app';
import { getDb, resetDb } from '../src/db/database';

const VENDOR_ID = '00000000-0000-4000-a000-000000000099';

/** Apply migration-019 SQL to add ledger table + triggers to test DB */
function applyMigration019(): void {
  const db = getDb();
  const sqlPath = path.resolve(__dirname, '../../../legacy/sqlite-migrations/019_inventory_movement_ledger_normalization.up.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  db.exec(sql);
}

function seedVendor(): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO vendors (id, name, contact_email) VALUES (?, 'Ledger Test Vendor', 'ledger@test.com')"
  ).run(VENDOR_ID);
}

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

let skuId: string;

beforeEach(async () => {
  resetDb();
  applyMigration019();
  seedVendor();
  const catId = getCategoryId(560);
  const brandId = getRefId('ref_brands');
  const colorId = getRefId('ref_colors');
  const sku = await request(app).post('/api/v1/skus').send({
    style: 'Ledger Test Style',
    price: 100,
    department: 'FORMAL',
    categoryId: catId,
    vendorId: VENDOR_ID,
    brandId,
    colorId,
  });
  skuId = sku.body.id;
});

afterAll(() => {
  resetDb();
});

function getLedgerRows(skuId: string) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM inventory_movement_ledger WHERE sku_id = ? ORDER BY rowid ASC'
  ).all(skuId) as {
    id: string; sku_id: string; location_id: string; movement_type: string;
    quantity_delta: number; source_adjustment_line_id: string | null;
  }[];
}

function getAdjustmentLines(skuId: string) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM inventory_adjustment_lines WHERE sku_id = ? ORDER BY created_at ASC'
  ).all(skuId) as { id: string; adjustment_id: string; sku_id: string; quantity: number }[];
}

// ── adjustStock() ledger coverage ──────────────────────────────

describe('adjustStock() creates ledger entries via canonical path (ZAI-352)', () => {
  it('positive adjustment creates adjustment source record + ledger row', async () => {
    const res = await request(app)
      .post(`/api/v1/skus/${skuId}/inventory/adjustments`)
      .send({ adjustment: 50, reason: 'Initial stock' });

    expect(res.status).toBe(200);
    expect(res.body.inventory.quantityOnHand).toBe(50);

    const ledgerRows = getLedgerRows(skuId);
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0].movement_type).toBe('adjustment');
    expect(ledgerRows[0].quantity_delta).toBe(50);
    expect(ledgerRows[0].source_adjustment_line_id).not.toBeNull();

    const adjLines = getAdjustmentLines(skuId);
    expect(adjLines.length).toBe(1);
    expect(adjLines[0].quantity).toBe(50);
  });

  it('negative adjustment creates ledger row with negative delta', async () => {
    // First add stock
    await request(app)
      .post(`/api/v1/skus/${skuId}/inventory/adjustments`)
      .send({ adjustment: 100, reason: 'Restock' });

    // Then remove
    const res = await request(app)
      .post(`/api/v1/skus/${skuId}/inventory/adjustments`)
      .send({ adjustment: -30, reason: 'Damaged' });

    expect(res.status).toBe(200);

    const ledgerRows = getLedgerRows(skuId);
    expect(ledgerRows.length).toBe(2);
    expect(ledgerRows[1].quantity_delta).toBe(-30);
    expect(ledgerRows[1].movement_type).toBe('adjustment');
  });

  it('ledger source_adjustment_line_id links back to actual adjustment line', async () => {
    await request(app)
      .post(`/api/v1/skus/${skuId}/inventory/adjustments`)
      .send({ adjustment: 25, reason: 'Count correction' });

    const ledgerRows = getLedgerRows(skuId);
    const adjLines = getAdjustmentLines(skuId);

    expect(ledgerRows[0].source_adjustment_line_id).toBe(adjLines[0].id);
  });
});

// ── executeMutation() ledger coverage ──────────────────────────

describe('executeMutation() creates ledger entries via canonical path (ZAI-352)', () => {
  it('PURCHASE_ORDER_RECEIPT mutation creates adjustment source + ledger row', async () => {
    const res = await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 40,
      reasonCode: 'PO Receipt',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-LEDGER-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    expect(res.status).toBe(200);
    expect(res.body.resultingBalance).toBe(40);

    const ledgerRows = getLedgerRows(skuId);
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0].movement_type).toBe('adjustment');
    expect(ledgerRows[0].quantity_delta).toBe(40);
    expect(ledgerRows[0].source_adjustment_line_id).not.toBeNull();
  });

  it('STOCK_ADJUSTMENT mutation with negative delta creates ledger row', async () => {
    // Setup stock first
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 100,
      reasonCode: 'Initial',
      categoryCode: 560,
      sourceDocumentRef: { type: 'INITIAL_IMPORT', id: 'IMP-LEDGER-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    const res = await request(app).post('/api/v1/inventory/mutations/adjust').send({
      skuId,
      quantityDelta: -15,
      reasonCode: 'Damage write-off',
      categoryCode: 560,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-LEDGER-001' },
      actorId: uuidv4(),
    });

    expect(res.status).toBe(200);
    expect(res.body.resultingBalance).toBe(85);

    const ledgerRows = getLedgerRows(skuId);
    expect(ledgerRows.length).toBe(2);
    expect(ledgerRows[1].quantity_delta).toBe(-15);
  });

  it('TRANSFER_ORDER mutation creates ledger row', async () => {
    // Setup stock first
    await request(app).post('/api/v1/inventory/mutations/receive').send({
      skuId,
      quantityDelta: 50,
      reasonCode: 'Inbound',
      categoryCode: 560,
      sourceDocumentRef: { type: 'INITIAL_IMPORT', id: 'IMP-LEDGER-002' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    const res = await request(app).post('/api/v1/inventory/mutations/transfer').send({
      skuId,
      quantityDelta: -10,
      reasonCode: 'Transfer to Store B',
      categoryCode: 560,
      sourceDocumentRef: { type: 'TRANSFER_ORDER', id: 'TO-LEDGER-001' },
      actorId: uuidv4(),
      idempotencyKey: uuidv4(),
    });

    expect(res.status).toBe(200);

    const ledgerRows = getLedgerRows(skuId);
    expect(ledgerRows.length).toBe(2);
    expect(ledgerRows[1].quantity_delta).toBe(-10);
  });

  it('idempotent replay does NOT create duplicate ledger rows', async () => {
    const idempotencyKey = uuidv4();
    const payload = {
      skuId,
      quantityDelta: 20,
      reasonCode: 'PO Receipt',
      categoryCode: 560,
      sourceDocumentRef: { type: 'PURCHASE_ORDER_RECEIPT', id: 'PO-LEDGER-IDEM' },
      actorId: uuidv4(),
      idempotencyKey,
    };

    await request(app).post('/api/v1/inventory/mutations/receive').send(payload);
    const afterFirst = getLedgerRows(skuId).length;

    // Replay — should be caught by idempotency check before any writes
    await request(app).post('/api/v1/inventory/mutations/receive').send(payload);
    const afterReplay = getLedgerRows(skuId).length;

    expect(afterReplay).toBe(afterFirst);
  });
});

// ── Reconciliation view coverage ───────────────────────────────

describe('v_inventory_movement_reconciliation covers patched paths (ZAI-352)', () => {
  it('reconciliation view shows expected deltas after mixed adjustStock + executeMutation', async () => {
    const db = getDb();

    // adjustStock +50
    await request(app)
      .post(`/api/v1/skus/${skuId}/inventory/adjustments`)
      .send({ adjustment: 50, reason: 'Receipt' });

    // executeMutation -10
    await request(app).post('/api/v1/inventory/mutations/adjust').send({
      skuId,
      quantityDelta: -10,
      reasonCode: 'Damage',
      categoryCode: 560,
      sourceDocumentRef: { type: 'STOCK_ADJUSTMENT', id: 'ADJ-RECON-001' },
      actorId: uuidv4(),
    });

    const recon = db.prepare(
      'SELECT expected_quantity_delta, movement_row_count FROM v_inventory_movement_reconciliation WHERE sku_id = ?'
    ).get(skuId) as { expected_quantity_delta: number; movement_row_count: number } | undefined;

    expect(recon).toBeDefined();
    expect(recon!.expected_quantity_delta).toBe(40); // 50 + (-10)
    expect(recon!.movement_row_count).toBe(2);
  });
});
