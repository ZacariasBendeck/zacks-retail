import fs from 'fs';
import path from 'path';
import { getDb, resetDb } from '../src/db/database';

type QueryRow = Record<string, unknown>;

interface CheckStatement {
  checkId: string;
  description: string;
  sql: string;
}

interface CheckResult extends CheckStatement {
  rows: QueryRow[];
}

interface FixtureData {
  skuA: string;
  saleA: string;
  receiptLineA: string;
  transferLineA: string;
  adjustmentLineA: string;
}

function readSql(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function parseVerifySectionStatements(verifySql: string, section: 'A' | 'B'): CheckStatement[] {
  const lines = verifySql.split(/\r?\n/);
  const statements: CheckStatement[] = [];
  const startMarker = new RegExp(`^--\\s*${section}\\)`);
  const endMarker = new RegExp(`^--\\s*${section === 'A' ? 'B' : 'A'}\\)`);
  const checkMarker = new RegExp(`^--\\s*(${section}\\d+)\\s*:\\s*(.*)$`);

  let inSection = false;
  let currentCheckId = `${section}0`;
  let currentDescription = 'Unnamed check';
  let currentSql = '';

  const flushCurrentSql = () => {
    const trimmed = currentSql.trim();
    if (!trimmed) return;
    statements.push({
      checkId: currentCheckId,
      description: currentDescription,
      sql: trimmed,
    });
    currentSql = '';
  };

  for (const line of lines) {
    if (!inSection) {
      if (startMarker.test(line)) inSection = true;
      continue;
    }

    if (endMarker.test(line)) break;

    const checkMatch = line.match(checkMarker);
    if (checkMatch) {
      flushCurrentSql();
      currentCheckId = checkMatch[1];
      currentDescription = checkMatch[2].trim();
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;

    currentSql += `${line}\n`;
    if (trimmed.endsWith(';')) flushCurrentSql();
  }

  flushCurrentSql();
  return statements;
}

function runChecks(sectionName: string, checks: CheckStatement[]): CheckResult[] {
  const db = getDb();
  const results: CheckResult[] = [];

  for (const check of checks) {
    const rows = db.prepare(check.sql).all() as QueryRow[];
    results.push({ ...check, rows });
    console.log(`[${sectionName}] ${check.checkId}: ${check.description} -> ${rows.length} row(s)`);
  }

  return results;
}

function requireCheck(results: CheckResult[], checkId: string, index = 0): CheckResult {
  const matching = results.filter((result) => result.checkId === checkId);
  if (!matching.length) throw new Error(`Missing check result for ${checkId}`);
  if (index >= matching.length) throw new Error(`Missing check result instance ${index} for ${checkId}`);
  return matching[index];
}

function expectSqlFailure(sql: string, expectedMessageIncludes: string): void {
  const db = getDb();
  try {
    db.exec(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessageIncludes)) {
      throw new Error(`Expected failure containing "${expectedMessageIncludes}" but got: ${message}`);
    }
    return;
  }
  throw new Error(`Expected SQL to fail but it succeeded: ${sql}`);
}

function setupFixtureData(): FixtureData {
  const db = getDb();

  db.exec(`
    DELETE FROM inventory_movement_ledger
    WHERE source_sale_id IN ('v019-sale-a')
       OR source_po_receipt_line_id IN ('v019-receipt-line-a')
       OR source_transfer_line_id IN ('v019-transfer-line-a')
       OR source_adjustment_line_id IN ('v019-adjustment-line-a');

    DELETE FROM inventory_adjustment_lines
    WHERE id = 'v019-adjustment-line-a';
    DELETE FROM inventory_adjustments
    WHERE id = 'v019-adjustment-a';

    DELETE FROM transfer_order_lines
    WHERE id = 'v019-transfer-line-a';
    DELETE FROM transfer_orders
    WHERE id = 'v019-transfer-a';

    DELETE FROM po_receipt_lines
    WHERE id = 'v019-receipt-line-a';
    DELETE FROM po_receipts
    WHERE id = 'v019-receipt-a';
    DELETE FROM purchase_order_lines
    WHERE id = 'v019-pol-a';
    DELETE FROM purchase_orders
    WHERE id = 'v019-po-a';

    DELETE FROM sales_transactions
    WHERE id = 'v019-sale-a';

    DELETE FROM inventory
    WHERE id = 'v019-inventory-a';
    DELETE FROM sku_sizes
    WHERE id = 'v019-size-a';
    DELETE FROM skus
    WHERE id = 'v019-sku-a';

    DELETE FROM ref_colors
    WHERE code = 'V019CO';
    DELETE FROM ref_brands
    WHERE code = 'V019BR';
    DELETE FROM vendors
    WHERE id = 'v019-vendor';
  `);

  db.exec(`
    INSERT INTO vendors (id, name, payment_terms, active)
    VALUES ('v019-vendor', 'Vendor 019', 'NET_30', 1);

    INSERT INTO ref_brands (code, name, active)
    VALUES ('V019BR', 'Brand 019', 1);

    INSERT INTO ref_colors (code, name, active)
    VALUES ('V019CO', 'Color 019', 1);
  `);

  const brandRow = db.prepare(`SELECT id FROM ref_brands WHERE code = 'V019BR'`).get() as { id: number };
  const colorRow = db.prepare(`SELECT id FROM ref_colors WHERE code = 'V019CO'`).get() as { id: number };
  const categoryRow = db.prepare(`
    SELECT id
    FROM ref_categories
    WHERE rics_code = 556
    LIMIT 1
  `).get() as { id: number } | undefined;

  if (!categoryRow) {
    throw new Error('Fixture setup failed: expected ref_categories row with rics_code 556');
  }

  db.exec(`
    INSERT INTO skus (
      id, sku_code, style, price, category_id, department, vendor_id, brand_id, color_id, active
    ) VALUES (
      'v019-sku-a', 'SKU-V019-A', 'V019 Style A', 95, ${categoryRow.id}, 'FORMAL', 'v019-vendor', ${brandRow.id}, ${colorRow.id}, 1
    );

    INSERT INTO sku_sizes (id, sku_id, size_label, sort_order, active)
    VALUES ('v019-size-a', 'v019-sku-a', '7', 1, 1);

    INSERT INTO inventory (id, sku_id, sku_size_id, quantity_on_hand, quantity_reserved)
    VALUES ('v019-inventory-a', 'v019-sku-a', 'v019-size-a', 50, 0);
  `);

  db.exec(`
    INSERT INTO sales_transactions (
      id, sku_id, quantity, unit_price, sold_at
    ) VALUES (
      'v019-sale-a', 'v019-sku-a', 3, 95, datetime('now')
    );
  `);

  db.exec(`
    INSERT INTO purchase_orders (id, po_number, vendor_id, status, created_by)
    VALUES ('v019-po-a', 'PO-V019-A', 'v019-vendor', 'CONFIRMED', 'verifyMigration019');

    INSERT INTO purchase_order_lines (
      id, po_id, sku_id, quantity_ordered, quantity_received, unit_cost
    ) VALUES (
      'v019-pol-a', 'v019-po-a', 'v019-sku-a', 10, 0, 11
    );

    INSERT INTO po_receipts (
      id, po_id, location_id, received_by, reference_number, received_at
    ) VALUES (
      'v019-receipt-a', 'v019-po-a', 'loc-01', 'verifyMigration019', 'RCV-V019', datetime('now')
    );

    INSERT INTO po_receipt_lines (
      id, receipt_id, po_line_id, sku_id, sku_size_id, quantity_received, unit_cost
    ) VALUES (
      'v019-receipt-line-a', 'v019-receipt-a', 'v019-pol-a', 'v019-sku-a', NULL, 4, 11
    );
  `);

  db.exec(`
    INSERT INTO transfer_orders (
      id, from_location_id, to_location_id, status, requested_by, shipped_at, received_at
    ) VALUES (
      'v019-transfer-a', 'loc-01', 'loc-02', 'RECEIVED', 'verifyMigration019', datetime('now'), datetime('now')
    );

    INSERT INTO transfer_order_lines (
      id, transfer_order_id, sku_id, sku_size_id, quantity
    ) VALUES (
      'v019-transfer-line-a', 'v019-transfer-a', 'v019-sku-a', NULL, 5
    );
  `);

  db.exec(`
    INSERT INTO inventory_adjustments (
      id, type, from_location_id, to_location_id, reason, created_by
    ) VALUES (
      'v019-adjustment-a', 'MANUAL_ADJUST', 'loc-02', NULL, 'Fixture negative adjustment', 'verifyMigration019'
    );

    INSERT INTO inventory_adjustment_lines (
      id, adjustment_id, sku_id, quantity
    ) VALUES (
      'v019-adjustment-line-a', 'v019-adjustment-a', 'v019-sku-a', -2
    );
  `);

  return {
    skuA: 'v019-sku-a',
    saleA: 'v019-sale-a',
    receiptLineA: 'v019-receipt-line-a',
    transferLineA: 'v019-transfer-line-a',
    adjustmentLineA: 'v019-adjustment-line-a',
  };
}

function assertPostUpChecks(results: CheckResult[]): void {
  const a1 = requireCheck(results, 'A1');
  if (a1.rows.length !== 1) {
    throw new Error('A1 failed: expected inventory_movement_ledger table to exist');
  }

  const expectedIndexes = [
    'ux_inventory_movement_ledger_source_sale_v019',
    'ux_inventory_movement_ledger_source_po_receipt_v019',
    'ux_inventory_movement_ledger_source_adjustment_v019',
    'ux_inventory_movement_ledger_source_transfer_direction_v019',
    'idx_inventory_movement_ledger_sku_location_movement_at_v019',
    'idx_inventory_movement_ledger_movement_type_movement_at_v019',
    'idx_inventory_movement_ledger_location_movement_at_v019',
  ];

  const a2 = requireCheck(results, 'A2');
  const foundIndexes = new Set(
    a2.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const indexName of expectedIndexes) {
    if (!foundIndexes.has(indexName)) {
      throw new Error(`A2 failed: expected index ${indexName} to exist`);
    }
  }

  const expectedTriggers = [
    'trg_inventory_movement_ledger_sale_alignment_insert_v019',
    'trg_inventory_movement_ledger_sale_alignment_update_v019',
    'trg_inventory_movement_ledger_po_receipt_alignment_insert_v019',
    'trg_inventory_movement_ledger_po_receipt_alignment_update_v019',
    'trg_inventory_movement_ledger_transfer_alignment_insert_v019',
    'trg_inventory_movement_ledger_transfer_alignment_update_v019',
    'trg_inventory_movement_ledger_adjustment_alignment_insert_v019',
    'trg_inventory_movement_ledger_adjustment_alignment_update_v019',
    'trg_sales_transactions_to_inventory_movement_ledger_insert_v019',
    'trg_po_receipt_lines_to_inventory_movement_ledger_insert_v019',
    'trg_transfer_order_lines_to_inventory_movement_ledger_insert_v019',
    'trg_inventory_adjustment_lines_to_inventory_movement_ledger_insert_v019',
  ];

  const a3 = requireCheck(results, 'A3');
  const foundTriggers = new Set(
    a3.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const triggerName of expectedTriggers) {
    if (!foundTriggers.has(triggerName)) {
      throw new Error(`A3 failed: expected trigger ${triggerName} to exist`);
    }
  }

  const a4 = requireCheck(results, 'A4');
  if (a4.rows.length !== 1) {
    throw new Error('A4 failed: expected v_inventory_movement_reconciliation view to exist');
  }

  const a5 = requireCheck(results, 'A5');
  const requiredColumns = [
    'sku_id',
    'location_id',
    'movement_type',
    'quantity_delta',
    'unit_cost_snapshot',
    'source_sale_id',
    'source_po_receipt_line_id',
    'source_transfer_line_id',
    'source_adjustment_line_id',
    'movement_at',
  ];
  const foundColumns = new Set(
    a5.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const columnName of requiredColumns) {
    if (!foundColumns.has(columnName)) {
      throw new Error(`A5 failed: expected column ${columnName} in inventory_movement_ledger`);
    }
  }

  const a6 = requireCheck(results, 'A6');
  const a6Result = a6.rows[0]?.check_result;
  if (a6Result !== 'PASS') {
    throw new Error(`A6 failed: expected guardrail check PASS, got ${String(a6Result)}`);
  }

  const a7 = requireCheck(results, 'A7');
  const a7Details = a7.rows
    .map((row) => row.detail)
    .filter((detail): detail is string => typeof detail === 'string');
  if (!a7Details.some((detail) => detail.includes('idx_inventory_movement_ledger_sku_location_movement_at_v019'))) {
    throw new Error('A7 failed: expected EXPLAIN plan to use idx_inventory_movement_ledger_sku_location_movement_at_v019');
  }

  const a8 = requireCheck(results, 'A8');
  const a8Details = a8.rows
    .map((row) => row.detail)
    .filter((detail): detail is string => typeof detail === 'string');
  if (!a8Details.some((detail) => detail.includes('idx_inventory_movement_ledger_movement_type_movement_at_v019'))) {
    throw new Error('A8 failed: expected EXPLAIN plan to use idx_inventory_movement_ledger_movement_type_movement_at_v019');
  }

  const a9 = requireCheck(results, 'A9');
  const commentRows = new Set(
    a9.rows
      .map((row) => row.table_name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const expected of ['inventory_movement_ledger', 'v_inventory_movement_reconciliation']) {
    if (!commentRows.has(expected)) {
      throw new Error(`A9 failed: expected schema_table_comments entry for ${expected}`);
    }
  }
}

function assertBehavioralIntegrityChecks(fixture: FixtureData): void {
  const db = getDb();

  const saleRow = db.prepare(`
    SELECT movement_type, quantity_delta, location_id
    FROM inventory_movement_ledger
    WHERE source_sale_id = ?
  `).get(fixture.saleA) as { movement_type: string; quantity_delta: number; location_id: string } | undefined;

  if (!saleRow) {
    throw new Error('Behavioral check failed: expected ledger row from sales transaction trigger');
  }
  if (saleRow.movement_type !== 'sale' || saleRow.quantity_delta !== -3 || saleRow.location_id !== 'loc-01') {
    throw new Error(`Behavioral check failed: unexpected sale ledger row ${JSON.stringify(saleRow)}`);
  }

  const receiptRow = db.prepare(`
    SELECT movement_type, quantity_delta, location_id, unit_cost_snapshot
    FROM inventory_movement_ledger
    WHERE source_po_receipt_line_id = ?
  `).get(fixture.receiptLineA) as {
    movement_type: string;
    quantity_delta: number;
    location_id: string;
    unit_cost_snapshot: number;
  } | undefined;

  if (!receiptRow) {
    throw new Error('Behavioral check failed: expected ledger row from po_receipt_lines trigger');
  }
  if (receiptRow.movement_type !== 'po_receipt' || receiptRow.quantity_delta !== 4 || receiptRow.location_id !== 'loc-01' || receiptRow.unit_cost_snapshot !== 11) {
    throw new Error(`Behavioral check failed: unexpected po_receipt ledger row ${JSON.stringify(receiptRow)}`);
  }

  const transferRows = db.prepare(`
    SELECT movement_type, quantity_delta, location_id
    FROM inventory_movement_ledger
    WHERE source_transfer_line_id = ?
    ORDER BY movement_type ASC
  `).all(fixture.transferLineA) as { movement_type: string; quantity_delta: number; location_id: string }[];

  if (transferRows.length !== 2) {
    throw new Error(`Behavioral check failed: expected 2 transfer ledger rows, got ${transferRows.length}`);
  }

  const transferByType = new Map(transferRows.map((row) => [row.movement_type, row]));
  const transferIn = transferByType.get('transfer_in');
  const transferOut = transferByType.get('transfer_out');
  if (!transferIn || transferIn.quantity_delta !== 5 || transferIn.location_id !== 'loc-02') {
    throw new Error(`Behavioral check failed: invalid transfer_in row ${JSON.stringify(transferIn)}`);
  }
  if (!transferOut || transferOut.quantity_delta !== -5 || transferOut.location_id !== 'loc-01') {
    throw new Error(`Behavioral check failed: invalid transfer_out row ${JSON.stringify(transferOut)}`);
  }

  const adjustmentRow = db.prepare(`
    SELECT movement_type, quantity_delta, location_id
    FROM inventory_movement_ledger
    WHERE source_adjustment_line_id = ?
  `).get(fixture.adjustmentLineA) as { movement_type: string; quantity_delta: number; location_id: string } | undefined;

  if (!adjustmentRow) {
    throw new Error('Behavioral check failed: expected ledger row from inventory_adjustment_lines trigger');
  }
  if (adjustmentRow.movement_type !== 'adjustment' || adjustmentRow.quantity_delta !== -2 || adjustmentRow.location_id !== 'loc-02') {
    throw new Error(`Behavioral check failed: invalid adjustment row ${JSON.stringify(adjustmentRow)}`);
  }

  const reconciliationRows = db.prepare(`
    SELECT location_id, expected_quantity_delta
    FROM v_inventory_movement_reconciliation
    WHERE sku_id = ?
    ORDER BY location_id ASC
  `).all(fixture.skuA) as { location_id: string; expected_quantity_delta: number }[];

  const recByLocation = new Map(reconciliationRows.map((row) => [row.location_id, row.expected_quantity_delta]));
  if (recByLocation.get('loc-01') !== -4) {
    throw new Error(`Behavioral check failed: expected loc-01 delta -4, got ${String(recByLocation.get('loc-01'))}`);
  }
  if (recByLocation.get('loc-02') !== 3) {
    throw new Error(`Behavioral check failed: expected loc-02 delta 3, got ${String(recByLocation.get('loc-02'))}`);
  }

  expectSqlFailure(`
    UPDATE inventory_movement_ledger
    SET quantity_delta = 3
    WHERE source_sale_id = '${fixture.saleA}';
  `, 'sale source must match sku_id and signed quantity');

  expectSqlFailure(`
    INSERT INTO inventory_movement_ledger (
      id,
      sku_id,
      location_id,
      movement_type,
      quantity_delta,
      unit_cost_snapshot,
      source_sale_id,
      source_po_receipt_line_id,
      source_transfer_line_id,
      source_adjustment_line_id,
      movement_at
    ) VALUES (
      'v019-invalid-source-path',
      '${fixture.skuA}',
      'loc-01',
      'adjustment',
      -1,
      NULL,
      '${fixture.saleA}',
      NULL,
      NULL,
      '${fixture.adjustmentLineA}',
      datetime('now')
    );
  `, 'adjustment source must match sku, quantity, and a referenced location');

  expectSqlFailure(`
    UPDATE inventory_movement_ledger
    SET location_id = 'loc-01'
    WHERE source_adjustment_line_id = '${fixture.adjustmentLineA}';
  `, 'adjustment source must match sku, quantity, and a referenced location');
}

function assertPostDownChecks(results: CheckResult[]): void {
  const b1 = requireCheck(results, 'B1');
  if (b1.rows.length !== 0) throw new Error('B1 failed: expected inventory_movement_ledger table to be removed');

  const b2 = requireCheck(results, 'B2');
  if (b2.rows.length !== 0) throw new Error('B2 failed: expected v019 indexes to be removed');

  const b3 = requireCheck(results, 'B3');
  if (b3.rows.length !== 0) throw new Error('B3 failed: expected v019 triggers to be removed');

  const b4 = requireCheck(results, 'B4');
  if (b4.rows.length !== 0) throw new Error('B4 failed: expected v_inventory_movement_reconciliation view to be removed');

  const b5 = requireCheck(results, 'B5');
  if (b5.rows.length !== 0) throw new Error('B5 failed: expected schema_table_comments entries to be removed');
}

function main(): void {
  const repoRoot = path.resolve(__dirname, '../../..');
  const migrationDir = path.join(repoRoot, 'legacy', 'sqlite-migrations');
  const upPath = path.join(migrationDir, '019_inventory_movement_ledger_normalization.up.sql');
  const downPath = path.join(migrationDir, '019_inventory_movement_ledger_normalization.down.sql');
  const verifyPath = path.join(migrationDir, '019_inventory_movement_ledger_normalization.verify.sql');

  const upSql = readSql(upPath);
  const downSql = readSql(downPath);
  const verifySql = readSql(verifyPath);
  const postUpChecks = parseVerifySectionStatements(verifySql, 'A');
  const postDownChecks = parseVerifySectionStatements(verifySql, 'B');

  if (!postUpChecks.length || !postDownChecks.length) {
    throw new Error('Could not parse A/B verification sections from 019_inventory_movement_ledger_normalization.verify.sql');
  }

  resetDb();
  const db = getDb();
  db.exec(downSql);

  db.exec(upSql);
  const upResults = runChecks('Post-UP', postUpChecks);
  assertPostUpChecks(upResults);

  const fixture = setupFixtureData();
  assertBehavioralIntegrityChecks(fixture);

  db.exec(downSql);
  const downResults = runChecks('Post-DOWN', postDownChecks);
  assertPostDownChecks(downResults);

  console.log('PASS: migration 019 UP/DOWN verification checks succeeded.');
  resetDb();
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`FAIL: migration 019 verification failed.\n${message}`);
  resetDb();
  process.exit(1);
}
