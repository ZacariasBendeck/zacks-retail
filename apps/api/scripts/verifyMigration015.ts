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

function setupFixtureData(): {
  formalBudgetId: string;
  casualBudgetId: string;
  validSkuId: string;
  validSkuSizeId: string;
  outOfRangeSkuId: string;
  outOfRangeSkuSizeId: string;
} {
  const db = getDb();

  db.exec(`
    DELETE FROM otb_monthly_department_sku_plan
    WHERE id IN ('v015-plan-valid', 'v015-plan-bad-department', 'v015-plan-bad-category');

    DELETE FROM sku_sizes
    WHERE id IN ('v015-size-valid', 'v015-size-out-of-range');

    DELETE FROM skus
    WHERE id IN ('v015-sku-valid', 'v015-sku-out-of-range');

    DELETE FROM otb_budgets
    WHERE id IN ('v015-budget-formal', 'v015-budget-casual');

    DELETE FROM ref_categories
    WHERE rics_code = 700;

    DELETE FROM ref_colors
    WHERE code = 'V015CO';

    DELETE FROM ref_brands
    WHERE code = 'V015BR';

    DELETE FROM vendors
    WHERE id = 'v015-vendor';
  `);

  db.exec(`
    INSERT OR IGNORE INTO vendors (id, name, payment_terms, active)
    VALUES ('v015-vendor', 'Vendor 015', 'NET_30', 1);
    INSERT OR IGNORE INTO ref_brands (code, name, active)
    VALUES ('V015BR', 'Brand 015', 1);
    INSERT OR IGNORE INTO ref_colors (code, name, active)
    VALUES ('V015CO', 'Color 015', 1);
  `);

  const brandRow = db.prepare(`SELECT id FROM ref_brands WHERE code = 'V015BR'`).get() as { id: number };
  const colorRow = db.prepare(`SELECT id FROM ref_colors WHERE code = 'V015CO'`).get() as { id: number };

  const categoryRow = db.prepare(`
    SELECT id
    FROM ref_categories
    WHERE rics_code = 556
    LIMIT 1
  `).get() as { id: number } | undefined;
  if (!categoryRow) {
    throw new Error('Fixture setup failed: expected category with rics_code 556 to exist');
  }

  db.exec(`
    INSERT OR REPLACE INTO otb_budgets (
      id, department, year, month, planned_budget, notes, created_by
    ) VALUES
      ('v015-budget-formal', 'FORMAL', 2026, 4, 10000, 'fixture formal', 'verifyMigration015'),
      ('v015-budget-casual', 'CASUAL', 2026, 4, 10000, 'fixture casual', 'verifyMigration015');
  `);

  const insertSku = db.prepare(`
    INSERT INTO skus (
      id, sku_code, style, price, category_id, department, vendor_id, brand_id, color_id, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  insertSku.run(
    'v015-sku-valid',
    'SKU-V015-VALID',
    'V015 Style Valid',
    99.99,
    categoryRow.id,
    'FORMAL',
    'v015-vendor',
    brandRow.id,
    colorRow.id
  );

  db.exec(`
    DROP TRIGGER IF EXISTS trg_ref_categories_rics_range_insert_v011;
    DROP TRIGGER IF EXISTS trg_ref_categories_rics_range_update_v011;
  `);

  db.exec(`
    INSERT OR IGNORE INTO ref_categories (rics_code, name, dept_macro, active)
    VALUES (700, 'Out Of Range 700', 'FORMAL', 1);
  `);

  const outOfRangeCategoryRow = db.prepare(`
    SELECT id
    FROM ref_categories
    WHERE rics_code = 700
    LIMIT 1
  `).get() as { id: number } | undefined;
  if (!outOfRangeCategoryRow) {
    throw new Error('Fixture setup failed: expected category with rics_code 700 to exist');
  }

  insertSku.run(
    'v015-sku-out-of-range',
    'SKU-V015-OUT-RANGE',
    'V015 Style Out Of Range',
    89.99,
    outOfRangeCategoryRow.id,
    'FORMAL',
    'v015-vendor',
    brandRow.id,
    colorRow.id
  );

  db.exec(`
    INSERT INTO sku_sizes (id, sku_id, size_label, sort_order, active) VALUES
      ('v015-size-valid', 'v015-sku-valid', '7', 1, 1),
      ('v015-size-out-of-range', 'v015-sku-out-of-range', '7', 1, 1);
  `);

  return {
    formalBudgetId: 'v015-budget-formal',
    casualBudgetId: 'v015-budget-casual',
    validSkuId: 'v015-sku-valid',
    validSkuSizeId: 'v015-size-valid',
    outOfRangeSkuId: 'v015-sku-out-of-range',
    outOfRangeSkuSizeId: 'v015-size-out-of-range',
  };
}

function assertPostUpChecks(results: CheckResult[]): void {
  const a1 = requireCheck(results, 'A1');
  const actualObjects = new Set(
    a1.rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string')
  );
  const expectedObjects = [
    'otb_monthly_department_sku_plan',
    'v_otb_monthly_department_sku_plan',
    'trg_otb_monthly_sku_plan_size_alignment_insert_v015',
    'trg_otb_monthly_sku_plan_size_alignment_update_v015',
    'trg_otb_monthly_sku_plan_department_alignment_insert_v015',
    'trg_otb_monthly_sku_plan_department_alignment_update_v015',
    'trg_otb_monthly_sku_plan_category_guardrail_insert_v015',
    'trg_otb_monthly_sku_plan_category_guardrail_update_v015',
  ];
  for (const objectName of expectedObjects) {
    if (!actualObjects.has(objectName)) {
      throw new Error(`A1 failed: expected ${objectName} to exist`);
    }
  }

  const a2ForeignKeys = requireCheck(results, 'A2', 0);
  const fkTables = new Set(
    a2ForeignKeys.rows
      .map((row) => row.table)
      .filter((tableName): tableName is string => typeof tableName === 'string')
  );
  for (const tableName of ['otb_budgets', 'skus', 'sku_sizes']) {
    if (!fkTables.has(tableName)) {
      throw new Error(`A2 failed: expected foreign key to ${tableName}`);
    }
  }

  const a2Indexes = requireCheck(results, 'A2', 1);
  const indexNames = new Set(
    a2Indexes.rows
      .map((row) => row.name)
      .filter((indexName): indexName is string => typeof indexName === 'string')
  );
  for (const indexName of [
    'idx_otb_monthly_sku_plan_budget_id_v015',
    'idx_otb_monthly_sku_plan_sku_id_v015',
    'idx_otb_monthly_sku_plan_sku_size_id_v015',
    'idx_otb_monthly_sku_plan_budget_updated_v015',
  ]) {
    if (!indexNames.has(indexName)) {
      throw new Error(`A2 failed: expected index ${indexName}`);
    }
  }

  const a3 = requireCheck(results, 'A3');
  const commentNames = new Set(
    a3.rows
      .map((row) => row.table_name)
      .filter((tableName): tableName is string => typeof tableName === 'string')
  );
  for (const tableName of ['otb_monthly_department_sku_plan', 'v_otb_monthly_department_sku_plan']) {
    if (!commentNames.has(tableName)) {
      throw new Error(`A3 failed: expected schema_table_comments row for ${tableName}`);
    }
  }
}

function assertBehavioralIntegrityChecks(fixture: {
  formalBudgetId: string;
  casualBudgetId: string;
  validSkuId: string;
  validSkuSizeId: string;
  outOfRangeSkuId: string;
  outOfRangeSkuSizeId: string;
}): void {
  const db = getDb();

  db.prepare(`
    INSERT INTO otb_monthly_department_sku_plan (
      id,
      otb_budget_id,
      sku_id,
      sku_size_id,
      budget_amount,
      committed_amount,
      received_amount,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'v015-plan-valid',
    fixture.formalBudgetId,
    fixture.validSkuId,
    fixture.validSkuSizeId,
    1200,
    500,
    250,
    'valid fixture row'
  );

  const derived = db.prepare(`
    SELECT
      macro_department,
      plan_month,
      remaining_to_commit_amount,
      remaining_to_receive_amount,
      budget_vs_received_variance_amount
    FROM v_otb_monthly_department_sku_plan
    WHERE id = 'v015-plan-valid'
  `).get() as {
    macro_department: string;
    plan_month: string;
    remaining_to_commit_amount: number;
    remaining_to_receive_amount: number;
    budget_vs_received_variance_amount: number;
  };

  if (!derived) {
    throw new Error('Behavioral check failed: expected read-model row for v015-plan-valid');
  }
  if (derived.macro_department !== 'FORMAL') {
    throw new Error(`Behavioral check failed: expected macro_department FORMAL, got ${derived.macro_department}`);
  }
  if (derived.plan_month !== '2026-04') {
    throw new Error(`Behavioral check failed: expected plan_month 2026-04, got ${derived.plan_month}`);
  }
  if (derived.remaining_to_commit_amount !== 700) {
    throw new Error(`Behavioral check failed: expected remaining_to_commit_amount 700, got ${derived.remaining_to_commit_amount}`);
  }
  if (derived.remaining_to_receive_amount !== 250) {
    throw new Error(`Behavioral check failed: expected remaining_to_receive_amount 250, got ${derived.remaining_to_receive_amount}`);
  }
  if (derived.budget_vs_received_variance_amount !== 950) {
    throw new Error(`Behavioral check failed: expected budget_vs_received_variance_amount 950, got ${derived.budget_vs_received_variance_amount}`);
  }

  expectSqlFailure(`
    INSERT INTO otb_monthly_department_sku_plan (
      id, otb_budget_id, sku_id, sku_size_id, budget_amount, committed_amount, received_amount
    ) VALUES (
      'v015-plan-bad-department',
      '${fixture.casualBudgetId}',
      '${fixture.validSkuId}',
      '${fixture.validSkuSizeId}',
      100,
      10,
      5
    );
  `, 'otb_budget department must match skus.department');

  expectSqlFailure(`
    INSERT INTO otb_monthly_department_sku_plan (
      id, otb_budget_id, sku_id, sku_size_id, budget_amount, committed_amount, received_amount
    ) VALUES (
      'v015-plan-bad-category',
      '${fixture.formalBudgetId}',
      '${fixture.outOfRangeSkuId}',
      '${fixture.outOfRangeSkuSizeId}',
      100,
      10,
      5
    );
  `, 'sku category must resolve to RICS 556-599');

  expectSqlFailure(`
    DELETE FROM skus
    WHERE id = '${fixture.validSkuId}';
  `, 'FOREIGN KEY constraint failed');
}

function assertPostDownChecks(results: CheckResult[]): void {
  const b1 = requireCheck(results, 'B1');
  if (b1.rows.length !== 0) {
    throw new Error('B1 failed: expected 015 table/view/trigger objects to be removed after DOWN');
  }

  const b2 = requireCheck(results, 'B2');
  if (b2.rows.length !== 0) {
    throw new Error('B2 failed: expected 015 indexes to be removed after DOWN');
  }

  const b3 = requireCheck(results, 'B3');
  if (b3.rows.length !== 0) {
    throw new Error('B3 failed: expected 015 schema comments to be removed after DOWN');
  }
}

function main(): void {
  const repoRoot = path.resolve(__dirname, '../../..');
  const migrationDir = path.join(repoRoot, 'legacy', 'sqlite-migrations');
  const upPath = path.join(migrationDir, '015_otb_monthly_department_sku_planning.up.sql');
  const downPath = path.join(migrationDir, '015_otb_monthly_department_sku_planning.down.sql');
  const verifyPath = path.join(migrationDir, '015_otb_monthly_department_sku_planning.verify.sql');

  const upSql = readSql(upPath);
  const downSql = readSql(downPath);
  const verifySql = readSql(verifyPath);
  const postUpChecks = parseVerifySectionStatements(verifySql, 'A');
  const postDownChecks = parseVerifySectionStatements(verifySql, 'B');

  if (!postUpChecks.length || !postDownChecks.length) {
    throw new Error('Could not parse A/B verification sections from 015_otb_monthly_department_sku_planning.verify.sql');
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

  console.log('PASS: migration 015 UP/DOWN verification checks succeeded.');
  resetDb();
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`FAIL: migration 015 verification failed.\n${message}`);
  resetDb();
  process.exit(1);
}
