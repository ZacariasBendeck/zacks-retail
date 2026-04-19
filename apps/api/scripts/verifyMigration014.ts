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

function assertPostUpChecks(results: CheckResult[]): void {
  const a1 = requireCheck(results, 'A1');
  if (a1.rows.length !== 1) {
    throw new Error('A1 failed: expected sales index idx_sales_transactions_sold_at_sku to exist');
  }

  const a2 = requireCheck(results, 'A2');
  if (a2.rows.length !== 1) {
    throw new Error('A2 failed: expected table otb_sku_plan_lines to exist');
  }

  const a3ForeignKeys = requireCheck(results, 'A3', 0);
  const fkTables = new Set(
    a3ForeignKeys.rows
      .map((row) => row.table)
      .filter((tableName): tableName is string => typeof tableName === 'string')
  );
  if (!fkTables.has('otb_budgets') || !fkTables.has('skus')) {
    throw new Error('A3 failed: expected foreign keys to otb_budgets and skus on otb_sku_plan_lines');
  }

  const a3Indexes = requireCheck(results, 'A3', 1);
  const indexNames = new Set(
    a3Indexes.rows
      .map((row) => row.name)
      .filter((indexName): indexName is string => typeof indexName === 'string')
  );
  if (!indexNames.has('idx_otb_sku_plan_lines_sku')) {
    throw new Error('A3 failed: expected idx_otb_sku_plan_lines_sku to exist');
  }

  const a4 = requireCheck(results, 'A4');
  if (a4.rows.length !== 1) {
    throw new Error('A4 failed: expected view v_otb_sku_lines to exist');
  }

  const a5 = requireCheck(results, 'A5');
  if (a5.rows.length !== 1) {
    throw new Error('A5 failed: expected view v_otb_sku_lines to be queryable');
  }
}

function assertPostDownChecks(results: CheckResult[]): void {
  const b1 = requireCheck(results, 'B1');
  if (b1.rows.length !== 0) {
    throw new Error('B1 failed: expected otb_sku_plan_lines and v_otb_sku_lines to be removed after DOWN');
  }

  const b2 = requireCheck(results, 'B2');
  if (b2.rows.length !== 0) {
    throw new Error('B2 failed: expected idx_sales_transactions_sold_at_sku to be removed after DOWN');
  }
}

function main(): void {
  const repoRoot = path.resolve(__dirname, '../../..');
  const migrationDir = path.join(repoRoot, 'legacy', 'sqlite-migrations');
  const upPath = path.join(migrationDir, '014_sales_ledger_otb_lines.up.sql');
  const downPath = path.join(migrationDir, '014_sales_ledger_otb_lines.down.sql');
  const verifyPath = path.join(migrationDir, '014_sales_ledger_otb_lines.verify.sql');

  const upSql = readSql(upPath);
  const downSql = readSql(downPath);
  const verifySql = readSql(verifyPath);
  const postUpChecks = parseVerifySectionStatements(verifySql, 'A');
  const postDownChecks = parseVerifySectionStatements(verifySql, 'B');

  if (!postUpChecks.length || !postDownChecks.length) {
    throw new Error('Could not parse A/B verification sections from 014_sales_ledger_otb_lines.verify.sql');
  }

  resetDb();
  const db = getDb();
  db.exec(downSql);

  db.exec(upSql);
  const upResults = runChecks('Post-UP', postUpChecks);
  assertPostUpChecks(upResults);

  db.exec(downSql);
  const downResults = runChecks('Post-DOWN', postDownChecks);
  assertPostDownChecks(downResults);

  console.log('PASS: migration 014 UP/DOWN verification checks succeeded.');
  resetDb();
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`FAIL: migration 014 verification failed.\n${message}`);
  resetDb();
  process.exit(1);
}
