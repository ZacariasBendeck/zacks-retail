/**
 * Scaffold a new Prisma migration folder with a guaranteed-unique timestamp
 * and a template SQL file.
 *
 *   pnpm --filter @benlow-rics/api migrate:new add-vendor-store-account-overlay
 *
 * Timestamp uses seconds precision (YYYYMMDDHHMMSS). The three duplicate-
 * timestamp pairs in the current migration set all happened because they were
 * authored by hand on the same minute — seconds precision alone prevents the
 * whole class of bug.
 *
 * Writes nothing else (does NOT update schema.prisma, does NOT run `prisma
 * migrate dev`). Prints a next-steps reminder so the author does both.
 */
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../prisma/migrations');

function normalizeDescription(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_') // any non-alphanum → _
    .replace(/^_+|_+$/g, '')     // trim leading/trailing _
    .replace(/_+/g, '_');        // collapse consecutive _
}

function tsStamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

function main(): void {
  const raw = process.argv.slice(2).join(' ').trim();
  if (!raw || raw === '--help' || raw === '-h') {
    console.error('Usage: pnpm migrate:new <description>');
    console.error('Example: pnpm migrate:new add vendor store account overlay');
    process.exit(2);
  }
  const description = normalizeDescription(raw);
  if (description.length === 0) {
    console.error('Error: description must contain at least one alphanumeric character.');
    process.exit(2);
  }

  const stamp = tsStamp();
  const folderName = `${stamp}_${description}`;
  const folderPath = path.join(MIGRATIONS_DIR, folderName);
  const sqlPath = path.join(folderPath, 'migration.sql');

  if (fs.existsSync(folderPath)) {
    console.error(`Error: folder already exists: ${folderPath}`);
    console.error('(Seconds-precision collision is astronomically unlikely — is this a re-run?)');
    process.exit(1);
  }

  // Defensive: also guard against SAME-TIMESTAMP-DIFFERENT-DESCRIPTION, which
  // is what produced the three existing duplicates. Check every existing folder.
  const existing = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{14}_/.test(name))
    .map((name) => name.slice(0, 14));
  if (existing.includes(stamp)) {
    // Extremely unlikely (same-second collision) — bump by 1s and retry.
    console.error(
      `Error: timestamp ${stamp} already used by an existing migration. ` +
        'Wait one second and re-run.',
    );
    process.exit(1);
  }

  fs.mkdirSync(folderPath);
  const header = `-- ${raw}
-- Created: ${new Date().toISOString()}
-- Schema:  TODO — which of rics_mirror / app / platform / public?
--
-- Rationale:
--   TODO — why this migration exists (one paragraph).
--
-- Rollback:
--   TODO — is this reversible? What would undo it? Note which prod data is lost.

-- Write your CREATE / ALTER / DROP statements below.
-- Prefer IF NOT EXISTS / IF EXISTS guards so re-applying or rolling back is safe.

`;
  fs.writeFileSync(sqlPath, header, 'utf8');

  const rel = path.relative(process.cwd(), sqlPath).replace(/\\/g, '/');
  console.log(`✓ Created ${rel}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Fill in the SQL in ${rel}`);
  console.log('  2. Add or update the matching model in prisma/schema.prisma');
  console.log('  3. Apply with one of:');
  console.log('       pnpm prisma migrate deploy     # non-interactive, recommended');
  console.log('       pnpm prisma migrate dev        # interactive, local dev');
  console.log('  4. Run `pnpm migrate:lint` to check for regressions');
}

main();
