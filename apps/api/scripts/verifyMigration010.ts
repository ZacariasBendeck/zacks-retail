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
  const expectedTables = [
    'schema_table_comments',
    'rics_import_batches',
    'rics_import_files',
    'rics_import_rows',
    'rics_import_quarantine',
    'rics_import_apply_log',
  ];
  const foundTables = new Set(
    a1.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const tableName of expectedTables) {
    if (!foundTables.has(tableName)) {
      throw new Error(`A1 failed: expected table ${tableName}`);
    }
  }

  const a2 = requireCheck(results, 'A2');
  if (a2.rows.length !== 1) {
    throw new Error('A2 failed: expected unique index ux_skus_brand_style_color');
  }

  const a3 = requireCheck(results, 'A3');
  const expectedTriggers = [
    'trg_skus_require_natural_identity_insert',
    'trg_skus_require_natural_identity_update',
    'trg_sku_sizes_require_nonblank_size_insert',
    'trg_sku_sizes_require_nonblank_size_update',
  ];
  const foundTriggers = new Set(
    a3.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const triggerName of expectedTriggers) {
    if (!foundTriggers.has(triggerName)) {
      throw new Error(`A3 failed: expected trigger ${triggerName}`);
    }
  }

  const a4ForeignKeys = requireCheck(results, 'A4', 0);
  const fkTables = new Set(
    a4ForeignKeys.rows
      .map((row) => row.table)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const tableName of ['rics_import_files', 'skus', 'sku_sizes']) {
    if (!fkTables.has(tableName)) {
      throw new Error(`A4 failed: expected FK reference to ${tableName}`);
    }
  }

  const a4Indexes = requireCheck(results, 'A4', 1);
  const indexNames = new Set(
    a4Indexes.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const indexName of [
    'idx_rics_import_rows_file_validation',
    'idx_rics_import_rows_dedupe_hash',
    'idx_rics_import_rows_target_sku',
    'idx_rics_import_rows_category_code',
  ]) {
    if (!indexNames.has(indexName)) {
      throw new Error(`A4 failed: expected index ${indexName}`);
    }
  }

  const a5 = requireCheck(results, 'A5');
  const commentTables = new Set(
    a5.rows
      .map((row) => row.table_name)
      .filter((name): name is string => typeof name === 'string')
  );
  for (const tableName of [
    'vendors',
    'ref_categories',
    'skus',
    'sku_sizes',
    'inventory',
    'purchase_orders',
    'sales_transactions',
    'otb_budgets',
    'rics_import_batches',
    'rics_import_files',
    'rics_import_rows',
    'rics_import_quarantine',
    'rics_import_apply_log',
  ]) {
    if (!commentTables.has(tableName)) {
      throw new Error(`A5 failed: missing schema_table_comments row for ${tableName}`);
    }
  }
}

function assertBehavioralChecks(): void {
  const db = getDb();

  db.exec(`
    DELETE FROM sku_sizes WHERE id = 'v010-size-valid';
    DELETE FROM skus WHERE id IN ('v010-sku-valid', 'v010-sku-invalid-natural');
    DELETE FROM ref_colors WHERE code = 'V010CO';
    DELETE FROM ref_brands WHERE code = 'V010BR';
    DELETE FROM vendors WHERE id = 'v010-vendor';
    DELETE FROM rics_import_batches WHERE id = 'v010-batch-invalid';
  `);

  db.exec(`
    INSERT INTO vendors (id, name, payment_terms, active)
    VALUES ('v010-vendor', 'Vendor 010', 'NET_30', 1);
    INSERT INTO ref_brands (code, name, active)
    VALUES ('V010BR', 'Brand 010', 1);
    INSERT INTO ref_colors (code, name, active)
    VALUES ('V010CO', 'Color 010', 1);
  `);

  const brandId = (db.prepare(`SELECT id FROM ref_brands WHERE code = 'V010BR'`).get() as { id: number }).id;
  const colorId = (db.prepare(`SELECT id FROM ref_colors WHERE code = 'V010CO'`).get() as { id: number }).id;
  const categoryId = (db.prepare(`SELECT id FROM ref_categories WHERE rics_code = 556 LIMIT 1`).get() as { id: number }).id;

  expectSqlFailure(`
    INSERT INTO skus (
      id, sku_code, style, price, category_id, department, vendor_id, brand_id, color_id, active
    ) VALUES (
      'v010-sku-invalid-natural',
      'SKU-V010-INVALID',
      'Invalid Natural Identity',
      10,
      ${categoryId},
      'FORMAL',
      'v010-vendor',
      NULL,
      ${colorId},
      1
    );
  `, 'skus natural identity requires brand_id, style, and color_id');

  db.exec(`
    INSERT INTO skus (
      id, sku_code, style, price, category_id, department, vendor_id, brand_id, color_id, active
    ) VALUES (
      'v010-sku-valid',
      'SKU-V010-VALID',
      'Valid Natural Identity',
      20,
      ${categoryId},
      'FORMAL',
      'v010-vendor',
      ${brandId},
      ${colorId},
      1
    );
  `);

  expectSqlFailure(`
    INSERT INTO sku_sizes (id, sku_id, size_label, sort_order, active)
    VALUES ('v010-size-valid', 'v010-sku-valid', '   ', 1, 1);
  `, 'sku_sizes.size_label must be non-blank');

  expectSqlFailure(`
    INSERT INTO rics_import_batches (id, department, requested_by, status)
    VALUES ('v010-batch-invalid', 'SPORT', 'schema', 'PENDING');
  `, 'CHECK constraint failed');
}

function assertPostDownChecks(results: CheckResult[]): void {
  const b1 = requireCheck(results, 'B1');
  if (b1.rows.length !== 0) {
    throw new Error('B1 failed: expected rics_import_* and schema_table_comments tables to be removed');
  }

  const b2 = requireCheck(results, 'B2');
  if (b2.rows.length !== 0) {
    throw new Error('B2 failed: expected migration 010 index/trigger artifacts to be removed');
  }
}

function main(): void {
  process.env.NODE_ENV = 'test';

  const repoRoot = path.resolve(__dirname, '../../..');
  const migrationDir = path.join(repoRoot, 'legacy', 'sqlite-migrations');
  const upPath = path.join(migrationDir, '010_rics_import_integrity.up.sql');
  const downPath = path.join(migrationDir, '010_rics_import_integrity.down.sql');
  const verifyPath = path.join(migrationDir, '010_rics_import_integrity.verify.sql');

  const upSql = readSql(upPath);
  const downSql = readSql(downPath);
  const verifySql = readSql(verifyPath);
  const postUpChecks = parseVerifySectionStatements(verifySql, 'A');
  const postDownChecks = parseVerifySectionStatements(verifySql, 'B');

  if (!postUpChecks.length || !postDownChecks.length) {
    throw new Error('Could not parse A/B verification sections from 010_rics_import_integrity.verify.sql');
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

  console.log('PASS: migration 010 UP/DOWN verification checks succeeded.');
  resetDb();
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`FAIL: migration 010 verification failed.\n${message}`);
  resetDb();
  process.exit(1);
}
