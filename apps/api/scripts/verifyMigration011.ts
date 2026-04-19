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
    results.push({ ...check, rows });
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

function assertPostUpChecks(results: CheckResult[]): void {
  const a1 = requireCheck(results, 'A1');
  const expectedObjects = [
    'womens_shoe_categories',
    'v_sku_category_guardrail_violations',
    'trg_womens_shoe_categories_sync_insert_v011',
    'trg_womens_shoe_categories_sync_update_in_range_v011',
    'trg_womens_shoe_categories_sync_update_out_range_v011',
    'trg_womens_shoe_categories_sync_delete_v011',
    'trg_skus_womens_category_guardrail_insert_v011',
    'trg_skus_womens_category_guardrail_update_v011',
  ];
  const foundObjects = new Set(
    a1.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const objectName of expectedObjects) {
    if (!foundObjects.has(objectName)) {
      throw new Error(`A1 failed: expected object ${objectName}`);
    }
  }

  const a2 = requireCheck(results, 'A2');
  const a2Row = a2.rows[0] as { check_result?: unknown; out_of_range_rows?: unknown } | undefined;
  if (!a2Row || a2Row.check_result !== 'PASS') {
    throw new Error(`A2 failed: expected PASS, got ${String(a2Row?.check_result)}`);
  }
  if (Number(a2Row.out_of_range_rows ?? 1) !== 0) {
    throw new Error(`A2 failed: expected 0 out_of_range_rows, got ${String(a2Row.out_of_range_rows)}`);
  }

  const a3 = requireCheck(results, 'A3');
  const a3Row = a3.rows[0] as { check_result?: unknown; violating_skus?: unknown } | undefined;
  if (!a3Row || a3Row.check_result !== 'PASS') {
    throw new Error(`A3 failed: expected PASS, got ${String(a3Row?.check_result)}`);
  }
  if (Number(a3Row.violating_skus ?? 1) !== 0) {
    throw new Error(`A3 failed: expected 0 violating_skus, got ${String(a3Row.violating_skus)}`);
  }

  const a5 = requireCheck(results, 'A5');
  if (a5.rows.length !== 0) {
    throw new Error('A5 failed: migration must not add global ref_categories range triggers');
  }

  const a6Womens = requireCheck(results, 'A6', 0);
  const womensIndexes = new Set(
    a6Womens.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  if (!womensIndexes.has('idx_womens_shoe_categories_dept_rics_v011')) {
    throw new Error('A6 failed: missing idx_womens_shoe_categories_dept_rics_v011');
  }

  const a6Skus = requireCheck(results, 'A6', 1);
  const skuIndexes = new Set(
    a6Skus.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  if (!skuIndexes.has('idx_skus_category_active_created_v011')) {
    throw new Error('A6 failed: missing idx_skus_category_active_created_v011');
  }

  const a6Inventory = requireCheck(results, 'A6', 2);
  if (
    !a6Inventory.rows.some(
      (row) => typeof row.name === 'string' && row.name === 'idx_inventory_sku_size_v011'
    )
  ) {
    throw new Error('A6 failed: missing idx_inventory_sku_size_v011');
  }

  const a6PoLines = requireCheck(results, 'A6', 3);
  if (
    !a6PoLines.rows.some(
      (row) => typeof row.name === 'string' && row.name === 'idx_purchase_order_lines_sku_po_v011'
    )
  ) {
    throw new Error('A6 failed: missing idx_purchase_order_lines_sku_po_v011');
  }

  const a6Sales = requireCheck(results, 'A6', 4);
  if (
    !a6Sales.rows.some(
      (row) => typeof row.name === 'string' && row.name === 'idx_sales_transactions_sku_sold_at_v011'
    )
  ) {
    throw new Error('A6 failed: missing idx_sales_transactions_sku_sold_at_v011');
  }
}

function assertBehavioralChecks(): void {
  const db = getDb();

  db.exec(`
    DELETE FROM skus WHERE id IN ('v011-sku-valid', 'v011-sku-invalid');
    DELETE FROM ref_categories WHERE rics_code = 700;
    DELETE FROM ref_colors WHERE code = 'V011CO';
    DELETE FROM ref_brands WHERE code = 'V011BR';
    DELETE FROM vendors WHERE id = 'v011-vendor';
  `);

  db.exec(`
    INSERT INTO vendors (id, name, payment_terms, active)
    VALUES ('v011-vendor', 'Vendor 011', 'NET_30', 1);
    INSERT INTO ref_brands (code, name, active)
    VALUES ('V011BR', 'Brand 011', 1);
    INSERT INTO ref_colors (code, name, active)
    VALUES ('V011CO', 'Color 011', 1);
  `);

  const brandId = (db.prepare(`SELECT id FROM ref_brands WHERE code = 'V011BR'`).get() as { id: number }).id;
  const colorId = (db.prepare(`SELECT id FROM ref_colors WHERE code = 'V011CO'`).get() as { id: number }).id;
  const womensCategoryId = (db.prepare(`SELECT id FROM ref_categories WHERE rics_code = 556 LIMIT 1`).get() as { id: number }).id;

  db.exec(`
    INSERT INTO ref_categories (rics_code, name, dept_macro, active)
    VALUES (700, 'Out Of Womens Range', 'CASUAL', 1);
  `);

  const outOfRangeCategoryId = (
    db.prepare(`SELECT id FROM ref_categories WHERE rics_code = 700 LIMIT 1`).get() as { id: number }
  ).id;

  const womensMappingCount = (
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM womens_shoe_categories
      WHERE category_id = ?
    `).get(outOfRangeCategoryId) as { total: number }
  ).total;
  if (womensMappingCount !== 0) {
    throw new Error('Behavioral check failed: out-of-range category should not be in womens_shoe_categories');
  }

  expectSqlFailure(`
    INSERT INTO skus (
      id, sku_code, style, price, category_id, department, vendor_id, brand_id, color_id, active
    ) VALUES (
      'v011-sku-invalid',
      'SKU-V011-INVALID',
      'Guardrail Invalid Category',
      30,
      ${outOfRangeCategoryId},
      'CASUAL',
      'v011-vendor',
      ${brandId},
      ${colorId},
      1
    );
  `, 'skus.category_id must map to womens_shoe_categories');

  db.exec(`
    INSERT INTO skus (
      id, sku_code, style, price, category_id, department, vendor_id, brand_id, color_id, active
    ) VALUES (
      'v011-sku-valid',
      'SKU-V011-VALID',
      'Guardrail Valid Category',
      35,
      ${womensCategoryId},
      'FORMAL',
      'v011-vendor',
      ${brandId},
      ${colorId},
      1
    );
  `);
}

function assertPostDownChecks(results: CheckResult[]): void {
  const b1 = requireCheck(results, 'B1');
  if (b1.rows.length !== 0) {
    throw new Error('B1 failed: expected womens guardrail table/view/triggers to be removed');
  }

  const b2 = requireCheck(results, 'B2');
  if (b2.rows.length !== 0) {
    throw new Error('B2 failed: expected migration 011 index artifacts to be removed');
  }
}

function main(): void {
  process.env.NODE_ENV = 'test';

  const repoRoot = path.resolve(__dirname, '../../..');
  const migrationDir = path.join(repoRoot, 'legacy', 'sqlite-migrations');
  const upPath = path.join(migrationDir, '011_womens_category_guardrails_and_perf.up.sql');
  const downPath = path.join(migrationDir, '011_womens_category_guardrails_and_perf.down.sql');
  const verifyPath = path.join(migrationDir, '011_womens_category_guardrails_and_perf.verify.sql');

  const upSql = readSql(upPath);
  const downSql = readSql(downPath);
  const verifySql = readSql(verifyPath);
  const postUpChecks = parseVerifySectionStatements(verifySql, 'A');
  const postDownChecks = parseVerifySectionStatements(verifySql, 'B');

  if (!postUpChecks.length || !postDownChecks.length) {
    throw new Error('Could not parse A/B verification sections from 011_womens_category_guardrails_and_perf.verify.sql');
  }

  resetDb();
  const db = getDb();

  db.exec(downSql);

  db.exec(upSql);
  const upResults = runChecks('Post-UP', postUpChecks);
  assertPostUpChecks(upResults);
  assertBehavioralChecks();

  db.exec(downSql);
  const downResults = runChecks('Post-DOWN', postDownChecks);
  assertPostDownChecks(downResults);

  console.log('PASS: migration 011 UP/DOWN verification checks succeeded.');
  resetDb();
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`FAIL: migration 011 verification failed.\n${message}`);
  resetDb();
  process.exit(1);
}
