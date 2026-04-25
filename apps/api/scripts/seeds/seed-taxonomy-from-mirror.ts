/**
 * Backfill for the 8 app.taxonomy_* tables from their rics_mirror counterparts.
 *
 *   pnpm --filter @benlow-rics/api seed:taxonomy-from-mirror
 *
 * Context: the taxonomy cutover (migration 20260425080000) added
 * app.taxonomy_{department,category,group,keyword,sector,return_code,promotion_code,size_type}
 * as the authoritative read+write tables for the Taxonomy module. This script
 * copies every existing row from rics_mirror into its app.taxonomy_* sibling so
 * the Category/Department/etc. list pages are not empty right after the
 * migration runs.
 *
 * Idempotent: each table uses ON CONFLICT DO NOTHING so a re-run is a no-op.
 * Rows the operator later edits through the app UI are never overwritten by
 * this script; deletes in rics_mirror do not cascade here. To re-sync a
 * specific row with RICS, delete it from app.taxonomy_* first and re-run.
 *
 * Safe on Render: every table check is `information_schema.tables`. If
 * `rics_mirror.<table>` does not exist (Render container or a fresh Postgres
 * that never ran `sync:rics`) the step is skipped and the script reports 0
 * rows copied for that step.
 */
import { Client } from 'pg';

interface Step {
  label: string;
  sourceTable: string;
  /** Runs only if `sourceTable` exists. Returns the number of rows inserted. */
  run: (client: Client) => Promise<number>;
}

async function tableExists(client: Client, schema: string, name: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS exists`,
    [schema, name],
  );
  return res.rows[0]?.exists === true;
}

async function insertedCount(client: Client, cmd: string): Promise<number> {
  const res = await client.query(cmd);
  return res.rowCount ?? 0;
}

const STEPS: Step[] = [
  {
    label: 'departments',
    sourceTable: 'rics_mirror.departments',
    async run(client) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_department (number, "desc", beg_categ, end_categ, date_last_changed)
         SELECT number,
                COALESCE("desc", ''),
                COALESCE(beg_categ, 0),
                COALESCE(end_categ, 0),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM rics_mirror.departments
          WHERE number IS NOT NULL
         ON CONFLICT (number) DO NOTHING`,
      );
    },
  },
  {
    label: 'categories',
    sourceTable: 'rics_mirror.categories',
    async run(client) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_category (number, "desc", date_last_changed)
         SELECT number,
                COALESCE("desc", ''),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM rics_mirror.categories
          WHERE number IS NOT NULL
         ON CONFLICT (number) DO NOTHING`,
      );
    },
  },
  {
    label: 'groups',
    sourceTable: 'rics_mirror.group_codes',
    async run(client) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_group (code, "desc", date_last_changed)
         SELECT TRIM(code),
                COALESCE("desc", ''),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM rics_mirror.group_codes
          WHERE code IS NOT NULL AND TRIM(code) <> ''
         ON CONFLICT (code) DO NOTHING`,
      );
    },
  },
  {
    label: 'keywords',
    sourceTable: 'rics_mirror.keywords',
    async run(client) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_keyword (keyword, "desc", date_last_changed)
         SELECT TRIM(keyword),
                COALESCE("desc", ''),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM rics_mirror.keywords
          WHERE keyword IS NOT NULL AND TRIM(keyword) <> ''
         ON CONFLICT (keyword) DO NOTHING`,
      );
    },
  },
  {
    label: 'sectors',
    sourceTable: 'rics_mirror.sectors',
    async run(client) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_sector (number, "desc", beg_dept, end_dept, date_last_changed)
         SELECT number,
                COALESCE("desc", ''),
                COALESCE(beg_dept, 0),
                COALESCE(end_dept, 0),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM rics_mirror.sectors
          WHERE number IS NOT NULL
         ON CONFLICT (number) DO NOTHING`,
      );
    },
  },
  {
    label: 'return codes',
    sourceTable: 'rics_mirror.return_codes',
    async run(client) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_return_code (code, "desc", trackable, date_last_changed)
         SELECT code,
                COALESCE("desc", ''),
                COALESCE(trackable::boolean, false),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM rics_mirror.return_codes
          WHERE code IS NOT NULL
         ON CONFLICT (code) DO NOTHING`,
      );
    },
  },
  {
    label: 'promotion codes',
    sourceTable: 'rics_mirror.marketing_code',
    async run(client) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_promotion_code (code, description, "date", pieces, cost, date_last_changed)
         SELECT TRIM(code),
                COALESCE(description, ''),
                date::timestamp,
                pieces,
                cost::decimal,
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM rics_mirror.marketing_code
          WHERE code IS NOT NULL AND TRIM(code) <> ''
         ON CONFLICT (code) DO NOTHING`,
      );
    },
  },
  {
    label: 'size types',
    sourceTable: 'rics_mirror.size_types',
    async run(client) {
      // Wide-row → text[]: reassemble the 54 Columns_NN / 27 Rows_NN slots.
      // Access schema uses snake_case columns like columns_01..columns_54 in
      // the mirror. ARRAY_REMOVE collapses NULLs / blanks so the length
      // matches the non-blank count.
      const colList = Array.from({ length: 54 }, (_, i) => `NULLIF(TRIM(COALESCE(columns_${String(i + 1).padStart(2, '0')}::text, '')), '')`).join(', ');
      const rowList = Array.from({ length: 27 }, (_, i) => `NULLIF(TRIM(COALESCE(rows_${String(i + 1).padStart(2, '0')}::text, '')), '')`).join(', ');
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_size_type
            (code, "desc", column_desc, row_desc, table_type,
             columns, rows, max_columns, max_rows, date_last_changed)
         SELECT code,
                COALESCE("desc", ''),
                COALESCE(column_desc, ''),
                COALESCE(row_desc, ''),
                table_type,
                ARRAY_REMOVE(ARRAY[${colList}], NULL) AS columns,
                ARRAY_REMOVE(ARRAY[${rowList}], NULL) AS rows,
                COALESCE(max_columns, 0)::smallint,
                COALESCE(max_rows, 0)::smallint,
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM rics_mirror.size_types
          WHERE code IS NOT NULL
         ON CONFLICT (code) DO NOTHING`,
      );
    },
  },
];

async function main(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log('taxonomy backfill (rics_mirror → app.taxonomy_*)');
    for (const step of STEPS) {
      const [schema, table] = step.sourceTable.split('.');
      const exists = await tableExists(client, schema, table);
      if (!exists) {
        console.log(`  ${step.label.padEnd(18)}  skipped (${step.sourceTable} not present)`);
        continue;
      }
      try {
        const inserted = await step.run(client);
        console.log(`  ${step.label.padEnd(18)}  ${inserted} rows inserted`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ${step.label.padEnd(18)}  FAILED: ${message}`);
        throw err;
      }
    }
    console.log('done.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
