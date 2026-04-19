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
  skuB: string;
  sizeA: string;
  sizeB: string;
  poA: string;
  poB: string;
  poLineA: string;
  poLineB: string;
  receiptA: string;
  transferA: string;
  adjustmentA: string;
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
    if (!trimmed) {
      return;
    }
    statements.push({
      checkId: currentCheckId,
      description: currentDescription,
      sql: trimmed,
    });
    currentSql = '';
  };

  for (const line of lines) {
    if (!inSection) {
      if (startMarker.test(line)) {
        inSection = true;
      }
      continue;
    }

    if (endMarker.test(line)) {
      break;
    }

    const checkMatch = line.match(checkMarker);
    if (checkMatch) {
      flushCurrentSql();
      currentCheckId = checkMatch[1];
      currentDescription = checkMatch[2].trim();
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) {
      continue;
    }

    currentSql += `${line}\n`;
    if (trimmed.endsWith(';')) {
      flushCurrentSql();
    }
  }

  flushCurrentSql();
  return statements;
}

function runChecks(sectionName: string, checks: CheckStatement[]): CheckResult[] {
  const db = getDb();
  const results: CheckResult[] = [];

  for (const check of checks) {
    const rows = db.prepare(check.sql).all() as QueryRow[];
    results.push({
      ...check,
      rows,
    });
    console.log(`[${sectionName}] ${check.checkId}: ${check.description} -> ${rows.length} row(s)`);
  }

  return results;
}

function requireCheck(results: CheckResult[], checkId: string, index = 0): CheckResult {
  const matching = results.filter((result) => result.checkId === checkId);
  if (!matching.length) {
    throw new Error(`Missing check result for ${checkId}`);
  }
  if (index >= matching.length) {
    throw new Error(`Missing check result instance ${index} for ${checkId}`);
  }
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
    DELETE FROM inventory_adjustment_lines
    WHERE id IN ('v016-adj-line-ok', 'v016-adj-line-zero', 'v016-adj-line-zero-after-down');
    DELETE FROM inventory_adjustments
    WHERE id = 'v016-adj-a';

    DELETE FROM transfer_order_lines
    WHERE id IN ('v016-transfer-line-ok', 'v016-transfer-line-bad-size');
    DELETE FROM transfer_orders
    WHERE id = 'v016-transfer-a';

    DELETE FROM po_receipt_lines
    WHERE id IN ('v016-receipt-line-ok', 'v016-receipt-line-bad-po', 'v016-receipt-line-bad-size');
    DELETE FROM po_receipts
    WHERE id = 'v016-receipt-a';

    DELETE FROM purchase_order_lines
    WHERE id IN ('v016-pol-a', 'v016-pol-b');
    DELETE FROM purchase_orders
    WHERE id IN ('v016-po-a', 'v016-po-b');

    DELETE FROM sku_sizes
    WHERE id IN ('v016-size-a', 'v016-size-b');
    DELETE FROM inventory
    WHERE sku_id IN ('v016-sku-a', 'v016-sku-b');
    DELETE FROM skus
    WHERE id IN ('v016-sku-a', 'v016-sku-b');

    DELETE FROM ref_colors
    WHERE code = 'V016CO';
    DELETE FROM ref_brands
    WHERE code = 'V016BR';
    DELETE FROM vendors
    WHERE id = 'v016-vendor';
  `);

  db.exec(`
    INSERT INTO vendors (id, name, payment_terms, active)
    VALUES ('v016-vendor', 'Vendor 016', 'NET_30', 1);
    INSERT INTO ref_brands (code, name, active)
    VALUES ('V016BR', 'Brand 016', 1);
    INSERT INTO ref_colors (code, name, active)
    VALUES ('V016CO', 'Color 016', 1);
  `);

  const brandRow = db.prepare(`SELECT id FROM ref_brands WHERE code = 'V016BR'`).get() as { id: number };
  const colorRow = db.prepare(`SELECT id FROM ref_colors WHERE code = 'V016CO'`).get() as { id: number };
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
    ) VALUES
      ('v016-sku-a', 'SKU-V016-A', 'V016 Style A', 80, ${categoryRow.id}, 'FORMAL', 'v016-vendor', ${brandRow.id}, ${colorRow.id}, 1),
      ('v016-sku-b', 'SKU-V016-B', 'V016 Style B', 90, ${categoryRow.id}, 'FORMAL', 'v016-vendor', ${brandRow.id}, ${colorRow.id}, 1);

    INSERT INTO sku_sizes (id, sku_id, size_label, sort_order, active) VALUES
      ('v016-size-a', 'v016-sku-a', '7', 1, 1),
      ('v016-size-b', 'v016-sku-b', '8', 1, 1);

    INSERT INTO purchase_orders (id, po_number, vendor_id, status, created_by) VALUES
      ('v016-po-a', 'PO-V016-A', 'v016-vendor', 'CONFIRMED', 'verifyMigration016'),
      ('v016-po-b', 'PO-V016-B', 'v016-vendor', 'CONFIRMED', 'verifyMigration016');

    INSERT INTO purchase_order_lines (
      id, po_id, sku_id, quantity_ordered, quantity_received, unit_cost
    ) VALUES
      ('v016-pol-a', 'v016-po-a', 'v016-sku-a', 10, 0, 15),
      ('v016-pol-b', 'v016-po-b', 'v016-sku-b', 10, 0, 16);

    INSERT INTO po_receipts (id, po_id, location_id, received_by, reference_number) VALUES
      ('v016-receipt-a', 'v016-po-a', 'loc-01', 'verifyMigration016', 'RCV-V016');

    INSERT INTO transfer_orders (
      id, from_location_id, to_location_id, status, requested_by
    ) VALUES (
      'v016-transfer-a', 'loc-01', 'loc-02', 'DRAFT', 'verifyMigration016'
    );

    INSERT INTO inventory_adjustments (
      id, type, from_location_id, to_location_id, reason, created_by
    ) VALUES (
      'v016-adj-a', 'MANUAL_ADJUST', 'loc-01', NULL, 'fixture', 'verifyMigration016'
    );
  `);

  return {
    skuA: 'v016-sku-a',
    skuB: 'v016-sku-b',
    sizeA: 'v016-size-a',
    sizeB: 'v016-size-b',
    poA: 'v016-po-a',
    poB: 'v016-po-b',
    poLineA: 'v016-pol-a',
    poLineB: 'v016-pol-b',
    receiptA: 'v016-receipt-a',
    transferA: 'v016-transfer-a',
    adjustmentA: 'v016-adj-a',
  };
}

function assertPostUpChecks(results: CheckResult[]): void {
  const expectedIndexes = [
    'idx_purchase_order_lines_po_created_v016',
    'idx_po_receipts_po_received_at_v016',
    'idx_po_receipt_lines_receipt_created_v016',
    'idx_transfer_orders_status_created_v016',
    'idx_transfer_order_lines_transfer_created_v016',
    'idx_inventory_adjustments_type_created_v016',
    'idx_inventory_adjustment_lines_adjustment_created_v016',
  ];

  const expectedTriggers = [
    'trg_purchase_order_lines_qty_received_insert_guard_v016',
    'trg_purchase_order_lines_qty_received_update_guard_v016',
    'trg_po_receipt_lines_po_line_alignment_insert_v016',
    'trg_po_receipt_lines_po_line_alignment_update_v016',
    'trg_po_receipt_lines_size_alignment_insert_v016',
    'trg_po_receipt_lines_size_alignment_update_v016',
    'trg_transfer_order_lines_size_alignment_insert_v016',
    'trg_transfer_order_lines_size_alignment_update_v016',
    'trg_inventory_adjustment_lines_nonzero_insert_v016',
    'trg_inventory_adjustment_lines_nonzero_update_v016',
  ];

  const a1 = requireCheck(results, 'A1');
  const foundIndexes = new Set(
    a1.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const indexName of expectedIndexes) {
    if (!foundIndexes.has(indexName)) {
      throw new Error(`A1 failed: expected index ${indexName} to exist`);
    }
  }

  const a2 = requireCheck(results, 'A2');
  const foundTriggers = new Set(
    a2.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const triggerName of expectedTriggers) {
    if (!foundTriggers.has(triggerName)) {
      throw new Error(`A2 failed: expected trigger ${triggerName} to exist`);
    }
  }

  const a3Results = results.filter((result) => result.checkId === 'A3');
  if (a3Results.length < 7) {
    throw new Error(`A3 failed: expected 7 PRAGMA index_list result sets, got ${a3Results.length}`);
  }
  const a3IndexNames = new Set(
    a3Results.flatMap((result) => result.rows)
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const indexName of expectedIndexes) {
    if (!a3IndexNames.has(indexName)) {
      throw new Error(`A3 failed: expected ${indexName} to appear in target table index catalogs`);
    }
  }
}

function assertBehavioralIntegrityChecks(fixture: FixtureData): void {
  const db = getDb();

  db.prepare(`
    INSERT INTO po_receipt_lines (
      id, receipt_id, po_line_id, sku_id, sku_size_id, quantity_received, unit_cost
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'v016-receipt-line-ok',
    fixture.receiptA,
    fixture.poLineA,
    fixture.skuA,
    fixture.sizeA,
    2,
    15
  );

  expectSqlFailure(`
    INSERT INTO po_receipt_lines (
      id, receipt_id, po_line_id, sku_id, sku_size_id, quantity_received, unit_cost
    ) VALUES (
      'v016-receipt-line-bad-po',
      '${fixture.receiptA}',
      '${fixture.poLineB}',
      '${fixture.skuB}',
      '${fixture.sizeB}',
      1,
      16
    );
  `, 'po_line_id must belong to receipt po_id and sku_id');

  expectSqlFailure(`
    INSERT INTO po_receipt_lines (
      id, receipt_id, po_line_id, sku_id, sku_size_id, quantity_received, unit_cost
    ) VALUES (
      'v016-receipt-line-bad-size',
      '${fixture.receiptA}',
      '${fixture.poLineA}',
      '${fixture.skuA}',
      '${fixture.sizeB}',
      1,
      15
    );
  `, 'sku_size_id must belong to sku_id');

  expectSqlFailure(`
    UPDATE purchase_order_lines
    SET quantity_received = quantity_ordered + 1
    WHERE id = '${fixture.poLineA}';
  `, 'quantity_received cannot exceed quantity_ordered');

  db.prepare(`
    INSERT INTO transfer_order_lines (
      id, transfer_order_id, sku_id, sku_size_id, quantity
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    'v016-transfer-line-ok',
    fixture.transferA,
    fixture.skuA,
    fixture.sizeA,
    1
  );

  expectSqlFailure(`
    INSERT INTO transfer_order_lines (
      id, transfer_order_id, sku_id, sku_size_id, quantity
    ) VALUES (
      'v016-transfer-line-bad-size',
      '${fixture.transferA}',
      '${fixture.skuA}',
      '${fixture.sizeB}',
      1
    );
  `, 'transfer_order_lines sku_size_id must belong to sku_id');

  expectSqlFailure(`
    INSERT INTO inventory_adjustment_lines (
      id, adjustment_id, sku_id, quantity
    ) VALUES (
      'v016-adj-line-zero',
      '${fixture.adjustmentA}',
      '${fixture.skuA}',
      0
    );
  `, 'inventory_adjustment_lines quantity cannot be zero');
}

function assertPostDownChecks(results: CheckResult[]): void {
  const b1 = requireCheck(results, 'B1');
  if (b1.rows.length !== 0) {
    throw new Error('B1 failed: expected all v016 indexes to be removed after DOWN');
  }

  const b2 = requireCheck(results, 'B2');
  if (b2.rows.length !== 0) {
    throw new Error('B2 failed: expected all v016 triggers to be removed after DOWN');
  }
}

function assertRollbackCleanup(fixture: FixtureData): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO inventory_adjustment_lines (
      id, adjustment_id, sku_id, quantity
    ) VALUES (?, ?, ?, ?)
  `).run(
    'v016-adj-line-zero-after-down',
    fixture.adjustmentA,
    fixture.skuA,
    0
  );

  const row = db.prepare(`
    SELECT id
    FROM inventory_adjustment_lines
    WHERE id = 'v016-adj-line-zero-after-down'
  `).get() as { id: string } | undefined;

  if (!row) {
    throw new Error('Rollback cleanup failed: expected zero-quantity adjustment line insert to succeed after DOWN');
  }
}

function main(): void {
  const repoRoot = path.resolve(__dirname, '../../..');
  const migrationDir = path.join(repoRoot, 'legacy', 'sqlite-migrations');
  const upPath = path.join(migrationDir, '016_transaction_ledger_integrity_hardening.up.sql');
  const downPath = path.join(migrationDir, '016_transaction_ledger_integrity_hardening.down.sql');
  const verifyPath = path.join(migrationDir, '016_transaction_ledger_integrity_hardening.verify.sql');

  const upSql = readSql(upPath);
  const downSql = readSql(downPath);
  const verifySql = readSql(verifyPath);
  const postUpChecks = parseVerifySectionStatements(verifySql, 'A');
  const postDownChecks = parseVerifySectionStatements(verifySql, 'B');

  if (!postUpChecks.length || !postDownChecks.length) {
    throw new Error('Could not parse A/B verification sections from 016_transaction_ledger_integrity_hardening.verify.sql');
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
  assertRollbackCleanup(fixture);

  console.log('PASS: migration 016 UP/DOWN verification checks succeeded.');
  resetDb();
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`FAIL: migration 016 verification failed.\n${message}`);
  resetDb();
  process.exit(1);
}
