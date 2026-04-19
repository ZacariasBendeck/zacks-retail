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
  brandId: number;
  colorId: number;
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
    DELETE FROM inventory_balances
    WHERE id IN ('v017-bal-a', 'v017-bal-b', 'v017-bal-invalid-category', 'v017-bal-invalid-macro', 'v017-bal-invalid-size');

    DELETE FROM inventory
    WHERE id IN ('v017-inv-a', 'v017-inv-b');

    DELETE FROM sku_sizes
    WHERE id IN ('v017-size-a', 'v017-size-b');

    DELETE FROM skus
    WHERE id IN ('v017-sku-a', 'v017-sku-b');

    DELETE FROM ref_colors
    WHERE code = 'V017CO';

    DELETE FROM ref_brands
    WHERE code = 'V017BR';

    DELETE FROM vendors
    WHERE id = 'v017-vendor';
  `);

  db.exec(`
    INSERT INTO vendors (id, name, payment_terms, active)
    VALUES ('v017-vendor', 'Vendor 017', 'NET_30', 1);

    INSERT INTO ref_brands (code, name, active)
    VALUES ('V017BR', 'Brand 017', 1);

    INSERT INTO ref_colors (code, name, active)
    VALUES ('V017CO', 'Color 017', 1);
  `);

  const brandRow = db.prepare(`SELECT id FROM ref_brands WHERE code = 'V017BR'`).get() as { id: number };
  const colorRow = db.prepare(`SELECT id FROM ref_colors WHERE code = 'V017CO'`).get() as { id: number };
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
      ('v017-sku-a', 'SKU-V017-A', 'V017 Style A', 75, ${categoryRow.id}, 'FORMAL', 'v017-vendor', ${brandRow.id}, ${colorRow.id}, 1),
      ('v017-sku-b', 'SKU-V017-B', 'V017 Style B', 82, ${categoryRow.id}, 'FORMAL', 'v017-vendor', ${brandRow.id}, ${colorRow.id}, 1);

    INSERT INTO sku_sizes (id, sku_id, size_label, sort_order, active) VALUES
      ('v017-size-a', 'v017-sku-a', '7', 1, 1),
      ('v017-size-b', 'v017-sku-b', '8', 1, 1);

    INSERT INTO inventory (id, sku_id, sku_size_id, quantity_on_hand, quantity_reserved) VALUES
      ('v017-inv-a', 'v017-sku-a', 'v017-size-a', 20, 2),
      ('v017-inv-b', 'v017-sku-b', 'v017-size-b', 11, 1);
  `);

  db.exec(`
    INSERT INTO inventory_balances (
      id, sku_id, sku_size_id, category, macro_department, brand, style, color, size,
      quantity_on_hand, quantity_reserved, version
    ) VALUES
      ('v017-bal-a', 'v017-sku-a', 'v017-size-a', 556, 'FORMAL', ${brandRow.id}, 'V017 Style A', ${colorRow.id}, '7', 20, 2, 1),
      ('v017-bal-b', 'v017-sku-b', 'v017-size-b', 556, 'FORMAL', ${brandRow.id}, 'V017 Style B', ${colorRow.id}, '8', 11, 1, 1);
  `);

  return {
    skuA: 'v017-sku-a',
    skuB: 'v017-sku-b',
    sizeA: 'v017-size-a',
    sizeB: 'v017-size-b',
    brandId: brandRow.id,
    colorId: colorRow.id,
  };
}

function assertPostUpChecks(results: CheckResult[]): void {
  const a1 = requireCheck(results, 'A1');
  if (a1.rows.length !== 1) {
    throw new Error('A1 failed: expected inventory_balances table to exist');
  }

  const a2 = requireCheck(results, 'A2');
  const expectedIndexes = [
    'ux_skus_sku_code_v017',
    'ux_inventory_balances_sku_size_key_v017',
    'idx_inventory_balances_sku_id_v017',
    'idx_inventory_balances_sku_size_id_v017',
    'idx_inventory_balances_category_macro_brand_style_color_size_v017',
    'idx_inventory_balances_category_macro_updated_id_v017',
  ];
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

  const a3 = requireCheck(results, 'A3');
  const expectedTriggers = [
    'trg_inventory_balances_size_alignment_insert_v017',
    'trg_inventory_balances_size_alignment_update_v017',
    'trg_inventory_balances_version_guard_v017',
    'trg_inventory_balances_touch_updated_at_v017',
  ];
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
  const requiredColumns = new Set(['category', 'macro_department', 'brand', 'style', 'color', 'size', 'version']);
  const foundColumns = new Set(
    a4.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const columnName of requiredColumns) {
    if (!foundColumns.has(columnName)) {
      throw new Error(`A4 failed: expected column ${columnName} in inventory_balances`);
    }
  }

  const a5 = requireCheck(results, 'A5');
  const a5Result = a5.rows[0]?.check_result;
  if (a5Result !== 'PASS') {
    throw new Error(`A5 failed: expected guardrail check PASS, got ${String(a5Result)}`);
  }

  const a6 = requireCheck(results, 'A6');
  if (a6.rows.length !== 1) {
    throw new Error('A6 failed: expected schema_table_comments row for inventory_balances');
  }

  const a7 = requireCheck(results, 'A7');
  const a7Indexes = new Set(
    a7.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const indexName of [
    'idx_inventory_balances_category_macro_brand_style_color_size_v017',
    'idx_inventory_balances_category_macro_updated_id_v017',
  ]) {
    if (!a7Indexes.has(indexName)) {
      throw new Error(`A7 failed: expected ${indexName} in inventory_balances index catalog`);
    }
  }
}

function assertBehavioralIntegrityChecks(fixture: FixtureData): void {
  const db = getDb();

  expectSqlFailure(`
    UPDATE inventory_balances
    SET quantity_on_hand = quantity_on_hand + 1
    WHERE id = 'v017-bal-a';
  `, 'version must increment by exactly 1');

  db.exec(`
    UPDATE inventory_balances
    SET quantity_on_hand = quantity_on_hand + 1,
        version = version + 1
    WHERE id = 'v017-bal-a';
  `);

  const row = db.prepare(`
    SELECT quantity_on_hand, version
    FROM inventory_balances
    WHERE id = 'v017-bal-a'
  `).get() as { quantity_on_hand: number; version: number } | undefined;

  if (!row) {
    throw new Error('Behavioral check failed: expected v017-bal-a to exist');
  }
  if (row.quantity_on_hand !== 21 || row.version !== 2) {
    throw new Error(`Behavioral check failed: expected quantity/version 21/2, got ${row.quantity_on_hand}/${row.version}`);
  }

  expectSqlFailure(`
    INSERT INTO inventory_balances (
      id, sku_id, sku_size_id, category, macro_department, brand, style, color, size,
      quantity_on_hand, quantity_reserved, version
    ) VALUES (
      'v017-bal-invalid-category',
      '${fixture.skuA}',
      '${fixture.sizeA}',
      700,
      'FORMAL',
      ${fixture.brandId},
      'Invalid Category Row',
      ${fixture.colorId},
      '7',
      1,
      0,
      1
    );
  `, 'CHECK constraint failed');

  expectSqlFailure(`
    INSERT INTO inventory_balances (
      id, sku_id, sku_size_id, category, macro_department, brand, style, color, size,
      quantity_on_hand, quantity_reserved, version
    ) VALUES (
      'v017-bal-invalid-macro',
      '${fixture.skuA}',
      '${fixture.sizeA}',
      556,
      'SPORT',
      ${fixture.brandId},
      'Invalid Macro Row',
      ${fixture.colorId},
      '7',
      1,
      0,
      1
    );
  `, 'CHECK constraint failed');

  expectSqlFailure(`
    INSERT INTO inventory_balances (
      id, sku_id, sku_size_id, category, macro_department, brand, style, color, size,
      quantity_on_hand, quantity_reserved, version
    ) VALUES (
      'v017-bal-invalid-size',
      '${fixture.skuA}',
      '${fixture.sizeB}',
      556,
      'FORMAL',
      ${fixture.brandId},
      'Invalid Size Link',
      ${fixture.colorId},
      '8',
      1,
      0,
      1
    );
  `, 'sku_size_id must belong to sku_id');
}

function assertPostDownChecks(results: CheckResult[]): void {
  const b1 = requireCheck(results, 'B1');
  if (b1.rows.length !== 0) {
    throw new Error('B1 failed: expected inventory_balances table to be removed');
  }

  const b2 = requireCheck(results, 'B2');
  if (b2.rows.length !== 0) {
    throw new Error('B2 failed: expected v017 indexes to be removed');
  }

  const b3 = requireCheck(results, 'B3');
  if (b3.rows.length !== 0) {
    throw new Error('B3 failed: expected v017 triggers to be removed');
  }

  const b4 = requireCheck(results, 'B4');
  if (b4.rows.length !== 0) {
    throw new Error('B4 failed: expected schema_table_comments entry to be removed');
  }
}

function main(): void {
  const repoRoot = path.resolve(__dirname, '../../..');
  const migrationDir = path.join(repoRoot, 'legacy', 'sqlite-migrations');
  const upPath = path.join(migrationDir, '017_inventory_balance_baseline.up.sql');
  const downPath = path.join(migrationDir, '017_inventory_balance_baseline.down.sql');
  const verifyPath = path.join(migrationDir, '017_inventory_balance_baseline.verify.sql');

  const upSql = readSql(upPath);
  const downSql = readSql(downPath);
  const verifySql = readSql(verifyPath);
  const postUpChecks = parseVerifySectionStatements(verifySql, 'A');
  const postDownChecks = parseVerifySectionStatements(verifySql, 'B');

  if (!postUpChecks.length || !postDownChecks.length) {
    throw new Error('Could not parse A/B verification sections from 017_inventory_balance_baseline.verify.sql');
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

  console.log('PASS: migration 017 UP/DOWN verification checks succeeded.');
  resetDb();
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`FAIL: migration 017 verification failed.\n${message}`);
  resetDb();
  process.exit(1);
}
