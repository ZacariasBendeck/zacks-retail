/**
 * Lint the Prisma migrations folder for authoring bugs.
 *
 *   pnpm --filter @benlow-rics/api migrate:lint
 *
 * Detects:
 *   1. Duplicate timestamps — two folders with the same 14-char prefix.
 *      Prisma breaks ties by suffix sort, so "works today" but is fragile.
 *   2. Missing header comment — first non-empty line should be a descriptive
 *      SQL comment (> 10 chars after `--`).
 *   3. Unsafe DROP — `DROP TABLE` / `DROP COLUMN` / `DROP CONSTRAINT` /
 *      `DROP INDEX` / `DROP SCHEMA` without `IF EXISTS`.
 *   4. Schema references not declared in schema.prisma — e.g., a migration
 *      touches "rics_mirror_experimental" but that schema isn't in
 *      `datasource db { schemas = [...] }`.
 *
 * Exit 0 on clean, 1 on any error. Warnings don't fail.
 */
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../prisma/migrations');
const SCHEMA_PATH = path.resolve(__dirname, '../../prisma/schema.prisma');

interface Finding {
  severity: 'error' | 'warning';
  migration: string | null;
  message: string;
  line?: number;
}

function listMigrationFolders(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{14}_/.test(name))
    .filter((name) => {
      const sql = path.join(MIGRATIONS_DIR, name, 'migration.sql');
      return fs.existsSync(sql);
    })
    .sort();
}

function readDeclaredSchemas(): Set<string> {
  const content = fs.readFileSync(SCHEMA_PATH, 'utf8');
  // Match: schemas = ["public", "app", ...]
  const match = content.match(/schemas\s*=\s*\[([^\]]+)\]/);
  if (!match) return new Set();
  const list = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((s) => s.length > 0);
  return new Set(list);
}

// ────────────── Check 1: duplicate timestamps ──────────────

function checkDuplicateTimestamps(folders: string[]): Finding[] {
  const byTimestamp = new Map<string, string[]>();
  for (const f of folders) {
    const ts = f.slice(0, 14);
    const list = byTimestamp.get(ts) ?? [];
    list.push(f);
    byTimestamp.set(ts, list);
  }
  const out: Finding[] = [];
  for (const [ts, list] of byTimestamp) {
    if (list.length > 1) {
      out.push({
        severity: 'error',
        migration: null,
        message: `Duplicate timestamp ${ts}: ${list.join(', ')}`,
      });
    }
  }
  return out;
}

// ────────────── Check 2: header comment ──────────────

function checkHeader(folder: string): Finding[] {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf8');
  const firstNonBlank = sql.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const stripped = firstNonBlank.trim().replace(/^--\s?/, '').trim();
  if (!firstNonBlank.trim().startsWith('--')) {
    return [
      {
        severity: 'warning',
        migration: folder,
        message: 'First line is not a SQL comment — add a header describing the migration.',
        line: 1,
      },
    ];
  }
  if (stripped.length < 10) {
    return [
      {
        severity: 'warning',
        migration: folder,
        message: `Header comment is too short (< 10 chars): "${stripped}"`,
        line: 1,
      },
    ];
  }
  return [];
}

// ────────────── Check 3: unsafe DROPs ──────────────

// Match DROP <kind> (optional IF EXISTS) but only flag when IF EXISTS is absent.
const DROP_PATTERN = /\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|SCHEMA|VIEW|TYPE)\b(?!\s+IF\s+EXISTS)/gi;

function checkUnsafeDrops(folder: string): Finding[] {
  const sqlPath = path.join(MIGRATIONS_DIR, folder, 'migration.sql');
  const lines = fs.readFileSync(sqlPath, 'utf8').split(/\r?\n/);
  const out: Finding[] = [];
  lines.forEach((line, i) => {
    // Strip inline comments — Prisma migrations use `--` style.
    const stripped = line.replace(/--.*$/, '');
    const m = stripped.match(DROP_PATTERN);
    if (m) {
      out.push({
        severity: 'warning',
        migration: folder,
        message: `Unsafe DROP without IF EXISTS: ${m.map((s) => s.trim()).join(', ')}`,
        line: i + 1,
      });
    }
  });
  return out;
}

// ────────────── Check 4: schema declared in schema.prisma ──────────────

// Postgres-built-in schemas are always present and don't need to be declared.
const POSTGRES_BUILTIN_SCHEMAS = new Set([
  'information_schema',
  'pg_catalog',
  'pg_toast',
]);

// Two ways a schema reference shows up in a Prisma-generated migration:
//   1. Qualified identifier in double quotes:   "schema"."table"
//   2. Qualified identifier unquoted after CREATE SCHEMA: CREATE SCHEMA "name"
//
// The lookbehind `(?<!\.)` rules out the second-level qualification in
// `"schema"."table"."column"` — there, the `"table".` is preceded by `.`
// and is NOT a schema reference.
const QUOTED_SCHEMA_QUAL_PATTERN = /(?<!\.)"([a-z_][a-z0-9_]*)"\s*\./gi;
const CREATE_SCHEMA_PATTERN = /\bCREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?"([a-z_][a-z0-9_]*)"/gi;

function stripSqlComments(sql: string): string {
  // Line comments starting with -- (not inside a string literal, but we don't
  // attempt to parse strings — good enough for migration SQL).
  let out = sql.replace(/--.*$/gm, '');
  // Block comments.
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  return out;
}

function checkSchemaRefs(folder: string, declared: Set<string>): Finding[] {
  const sqlPath = path.join(MIGRATIONS_DIR, folder, 'migration.sql');
  const sql = stripSqlComments(fs.readFileSync(sqlPath, 'utf8'));
  const found = new Set<string>();

  for (const match of sql.matchAll(QUOTED_SCHEMA_QUAL_PATTERN)) {
    const schema = match[1];
    if (!schema) continue;
    if (declared.has(schema)) continue;
    if (POSTGRES_BUILTIN_SCHEMAS.has(schema)) continue;
    found.add(schema);
  }

  for (const match of sql.matchAll(CREATE_SCHEMA_PATTERN)) {
    const schema = match[1];
    if (!schema) continue;
    if (declared.has(schema)) continue;
    if (POSTGRES_BUILTIN_SCHEMAS.has(schema)) continue;
    found.add(schema);
  }

  return [...found].map((schema) => ({
    severity: 'error' as const,
    migration: folder,
    message: `References schema "${schema}" which is not declared in schema.prisma datasource.schemas`,
  }));
}

// ────────────── Driver ──────────────

function main(): void {
  const folders = listMigrationFolders();
  console.log(`Scanning ${folders.length} migration(s)...`);

  const declaredSchemas = readDeclaredSchemas();
  console.log(`Declared schemas: ${[...declaredSchemas].join(', ') || '(none)'}`);

  const findings: Finding[] = [];
  findings.push(...checkDuplicateTimestamps(folders));
  for (const f of folders) {
    findings.push(...checkHeader(f));
    findings.push(...checkUnsafeDrops(f));
    findings.push(...checkSchemaRefs(f, declaredSchemas));
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');

  if (findings.length === 0) {
    console.log('\n✓ Clean.');
    process.exit(0);
  }

  console.log('');
  for (const f of findings) {
    const sev = f.severity === 'error' ? '✗ ERROR' : '! WARN ';
    const loc = f.migration ? `${f.migration}${f.line ? `:${f.line}` : ''}` : '(global)';
    console.log(`${sev}  ${loc}`);
    console.log(`         ${f.message}`);
  }

  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
