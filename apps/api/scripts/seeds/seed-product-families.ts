/**
 * Seed loader for Product Family + Category → Family mapping.
 *
 *   pnpm --filter @benlow-rics/api seed:product-families
 *
 * Idempotent — safe to re-run after sync:rics. Two steps:
 *
 *   1. Upsert every row from seeds/product_families/families.csv into
 *      app.product_family. Sort order + labels refresh on re-run. Rows present
 *      in the DB but absent from the CSV are logged and the script exits
 *      non-zero; deletion is a deliberate manual SQL step.
 *
 *   2. Upsert every row from seeds/product_families/category_mapping.csv into
 *      app.category_product_family. `updated_by` is set to 'seed' for every
 *      row the script writes. Operator overrides are preserved — a row with
 *      `updated_by != 'seed'` is left alone even if the CSV disagrees.
 *
 * Expected categories = COUNT(*) FROM rics_mirror.categories. After the seed
 * runs, `SELECT * FROM app.category_family_orphans` should be empty.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const SEEDS_DIR = path.resolve(__dirname, '../seeds/product_families');

interface FamilyRow {
  code: string;
  label_es: string;
  description_es: string | null;
  sort_order: number;
}

interface MappingRow {
  category_number: number;
  suggested_family: string;
}

/** Minimal CSV parser — handles quoted fields with commas and doubled quotes. */
function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = vals[j] ?? '';
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuote = false;
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"' && cur.length === 0) inQuote = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // ── Step 1: Product Family catalog ─────────────────────────────────────
    const familiesPath = path.join(SEEDS_DIR, 'families.csv');
    const familiesCsv = fs.readFileSync(familiesPath, 'utf-8');
    const families: FamilyRow[] = parseCsv(familiesCsv).map((r) => ({
      code: r.code,
      label_es: r.label_es,
      description_es: r.description_es && r.description_es.length > 0 ? r.description_es : null,
      sort_order: Number(r.sort_order),
    }));

    process.stderr.write(`Step 1: upserting ${families.length} families…\n`);

    for (const f of families) {
      await client.query(
        `INSERT INTO app.product_family (code, label_es, description_es, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET
           label_es = EXCLUDED.label_es,
           description_es = EXCLUDED.description_es,
           sort_order = EXCLUDED.sort_order`,
        [f.code, f.label_es, f.description_es, f.sort_order],
      );
    }
    process.stderr.write(`  ✓ ${families.length} families upserted\n`);

    // Detect orphans: DB rows not in CSV (exit non-zero, don't delete)
    const dbFamilies = await client.query<{ code: string }>(
      `SELECT code FROM app.product_family`,
    );
    const csvCodes = new Set(families.map((f) => f.code));
    const orphans = dbFamilies.rows.filter((r) => !csvCodes.has(r.code));
    if (orphans.length > 0) {
      process.stderr.write(`  ⚠ ${orphans.length} families in DB not in CSV (deletion is manual):\n`);
      for (const o of orphans) process.stderr.write(`    - ${o.code}\n`);
      process.exit(2);
    }

    // ── Step 2: Category → Family mapping ──────────────────────────────────
    const mappingPath = path.join(SEEDS_DIR, 'category_mapping.csv');
    const mappingCsv = fs.readFileSync(mappingPath, 'utf-8');
    const mappings: MappingRow[] = parseCsv(mappingCsv).map((r) => ({
      category_number: Number(r.category_number),
      suggested_family: r.suggested_family,
    }));

    process.stderr.write(`\nStep 2: upserting ${mappings.length} category mappings…\n`);

    // Only overwrite rows where updated_by = 'seed' (preserve operator edits).
    let inserted = 0;
    let updated = 0;
    let preserved = 0;

    for (const m of mappings) {
      const existing = await client.query<{ family_code: string; updated_by: string }>(
        `SELECT family_code, updated_by FROM app.category_product_family WHERE category_number = $1`,
        [m.category_number],
      );
      if (existing.rowCount === 0) {
        await client.query(
          `INSERT INTO app.category_product_family (category_number, family_code, updated_by)
           VALUES ($1, $2, 'seed')`,
          [m.category_number, m.suggested_family],
        );
        inserted++;
      } else if (existing.rows[0].updated_by === 'seed') {
        if (existing.rows[0].family_code !== m.suggested_family) {
          await client.query(
            `UPDATE app.category_product_family
             SET family_code = $1, updated_at = NOW(), updated_by = 'seed'
             WHERE category_number = $2`,
            [m.suggested_family, m.category_number],
          );
          updated++;
        }
      } else {
        preserved++;
      }
    }
    process.stderr.write(`  ✓ inserted: ${inserted}, updated: ${updated}, preserved (operator-edited): ${preserved}\n`);

    // ── Step 3: Coverage report ─────────────────────────────────────────────
    const orphanCats = await client.query<{ category_number: number; category_desc: string }>(
      `SELECT * FROM app.category_family_orphans ORDER BY category_number`,
    );
    if (orphanCats.rowCount > 0) {
      process.stderr.write(`\n⚠ ${orphanCats.rowCount} categories in rics_mirror with no family mapping:\n`);
      for (const r of orphanCats.rows.slice(0, 10)) {
        process.stderr.write(`    ${r.category_number} - ${r.category_desc}\n`);
      }
      if (orphanCats.rowCount > 10) process.stderr.write(`    … ${orphanCats.rowCount - 10} more\n`);
      process.stderr.write(`  Run 'pnpm seed:product-families' again after updating category_mapping.csv.\n`);
    } else {
      process.stderr.write(`\n✓ All rics_mirror.categories have a family mapping (no orphans).\n`);
    }

    // Distribution summary
    const dist = await client.query<{ family_code: string; n: string }>(
      `SELECT family_code, COUNT(*)::text AS n
       FROM app.category_product_family
       GROUP BY family_code ORDER BY COUNT(*) DESC`,
    );
    process.stderr.write(`\nDistribution:\n`);
    for (const r of dist.rows) process.stderr.write(`  ${r.family_code.padEnd(22)} ${r.n}\n`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  process.stderr.write(`FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
