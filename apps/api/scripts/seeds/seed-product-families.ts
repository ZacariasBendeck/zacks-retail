/**
 * Seed loader for Product Family + Category -> Family mapping.
 *
 *   pnpm --filter @benlow-rics/api seed:product-families
 *
 * Idempotent: safe to re-run after taxonomy baselines have been loaded.
 *
 *   1. Upsert every row from seeds/product_families/families.csv into
 *      app.product_family. Sort order + labels refresh on re-run. Rows present
 *      in the DB but absent from the CSV are logged and the script exits
 *      non-zero; deletion is a deliberate manual SQL step.
 *
 *   2. Upsert every row from seeds/product_families/category_mapping.csv into
 *      app.category_product_family. `updated_by` is set to 'seed' for every
 *      row the script writes. Operator overrides are preserved: a row with
 *      `updated_by != 'seed'` is left alone even if the CSV disagrees.
 *
 * Expected categories = COUNT(*) FROM app.taxonomy_category when taxonomy
 * baselines have been loaded. If taxonomy is still empty, the orphan report is
 * informational only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const SEEDS_DIR = path.resolve(__dirname, '../../seeds/product_families');

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

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = vals[j] ?? '';
    }
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
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else if (c === '"' && cur.length === 0) {
      inQuote = true;
    } else {
      cur += c;
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
    const familiesPath = path.join(SEEDS_DIR, 'families.csv');
    const familiesCsv = fs.readFileSync(familiesPath, 'utf-8');
    const families: FamilyRow[] = parseCsv(familiesCsv).map((row) => ({
      code: row.code,
      label_es: row.label_es,
      description_es: row.description_es && row.description_es.length > 0 ? row.description_es : null,
      sort_order: Number(row.sort_order),
    }));

    process.stderr.write(`Step 1: upserting ${families.length} families...\n`);

    for (const family of families) {
      await client.query(
        `INSERT INTO app.product_family (code, label_es, description_es, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET
           label_es = EXCLUDED.label_es,
           description_es = EXCLUDED.description_es,
           sort_order = EXCLUDED.sort_order`,
        [family.code, family.label_es, family.description_es, family.sort_order],
      );
    }
    process.stderr.write(`  OK ${families.length} families upserted\n`);

    const dbFamilies = await client.query<{ code: string }>(`SELECT code FROM app.product_family`);
    const csvCodes = new Set(families.map((family) => family.code));
    const orphans = dbFamilies.rows.filter((row) => !csvCodes.has(row.code));
    if (orphans.length > 0) {
      process.stderr.write(`  WARN ${orphans.length} families in DB not in CSV (deletion is manual):\n`);
      for (const orphan of orphans) {
        process.stderr.write(`    - ${orphan.code}\n`);
      }
      process.exit(2);
    }

    const mappingPath = path.join(SEEDS_DIR, 'category_mapping.csv');
    const mappingCsv = fs.readFileSync(mappingPath, 'utf-8');
    const mappings: MappingRow[] = parseCsv(mappingCsv).map((row) => ({
      category_number: Number(row.category_number),
      suggested_family: row.suggested_family,
    }));

    process.stderr.write(`\nStep 2: upserting ${mappings.length} category mappings...\n`);

    let inserted = 0;
    let updated = 0;
    let preserved = 0;

    for (const mapping of mappings) {
      const existing = await client.query<{ family_code: string; updated_by: string }>(
        `SELECT family_code, updated_by
         FROM app.category_product_family
         WHERE category_number = $1`,
        [mapping.category_number],
      );
      if (existing.rowCount === 0) {
        await client.query(
          `INSERT INTO app.category_product_family (category_number, family_code, updated_by)
           VALUES ($1, $2, 'seed')`,
          [mapping.category_number, mapping.suggested_family],
        );
        inserted++;
      } else if (existing.rows[0].updated_by === 'seed') {
        if (existing.rows[0].family_code !== mapping.suggested_family) {
          await client.query(
            `UPDATE app.category_product_family
             SET family_code = $1, updated_at = NOW(), updated_by = 'seed'
             WHERE category_number = $2`,
            [mapping.suggested_family, mapping.category_number],
          );
          updated++;
        }
      } else {
        preserved++;
      }
    }
    process.stderr.write(
      `  OK inserted: ${inserted}, updated: ${updated}, preserved (operator-edited): ${preserved}\n`,
    );

    const orphanCats = await client.query<{ category_number: number; category_desc: string }>(
      `SELECT
         c.number AS category_number,
         c."desc" AS category_desc
       FROM app.taxonomy_category c
       LEFT JOIN app.category_product_family cpf ON cpf.category_number = c.number
       WHERE cpf.category_number IS NULL
       ORDER BY c.number`,
    );

    if (orphanCats.rowCount > 0) {
      process.stderr.write(`\nWARN ${orphanCats.rowCount} taxonomy categories with no family mapping:\n`);
      for (const row of orphanCats.rows.slice(0, 10)) {
        process.stderr.write(`    ${row.category_number} - ${row.category_desc}\n`);
      }
      if (orphanCats.rowCount > 10) {
        process.stderr.write(`    ... ${orphanCats.rowCount - 10} more\n`);
      }
      process.stderr.write(`  Run 'pnpm seed:product-families' again after updating category_mapping.csv.\n`);
    } else {
      const categoryCount = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM app.taxonomy_category`,
      );
      if (Number(categoryCount.rows[0]?.n ?? 0) === 0) {
        process.stderr.write(`\nWARN app.taxonomy_category is empty; family mapping coverage could not be verified yet.\n`);
      } else {
        process.stderr.write(`\nOK all taxonomy categories have a family mapping (no orphans).\n`);
      }
    }

    const dist = await client.query<{ family_code: string; n: string }>(
      `SELECT family_code, COUNT(*)::text AS n
       FROM app.category_product_family
       GROUP BY family_code
       ORDER BY COUNT(*) DESC`,
    );
    process.stderr.write(`\nDistribution:\n`);
    for (const row of dist.rows) {
      process.stderr.write(`  ${row.family_code.padEnd(22)} ${row.n}\n`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  process.stderr.write(`FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
