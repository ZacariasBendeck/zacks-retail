/**
 * Backfill for the 8 app.taxonomy_* tables from either:
 *   - their rics_mirror counterparts (default), or
 *   - a staged CSV artifact manifest (`--manifest`)
 *
 *   pnpm --filter @benlow-rics/api seed:taxonomy-from-mirror
 *   pnpm --filter @benlow-rics/api seed:taxonomy-from-mirror -- --manifest <path>
 *
 * Idempotent: each table uses ON CONFLICT DO NOTHING so a re-run is a no-op.
 * Rows the operator later edits through the app UI are never overwritten by
 * this script; deletes in the source do not cascade here.
 */
import { Client } from 'pg';
import { loadManifest, requireTable, stageTable } from '../rics/sync/artifactManifest';

type TaxonomySourceTable =
  | 'departments'
  | 'categories'
  | 'group_codes'
  | 'keywords'
  | 'sectors'
  | 'return_codes'
  | 'marketing_code'
  | 'size_types';

interface Step {
  label: string;
  targetTable: TaxonomySourceTable;
  defaultSourceTable: string;
  run: (client: Client, sourceTable: string) => Promise<number>;
}

interface Args {
  manifestPath: string | null;
  only: Set<TaxonomySourceTable> | null;
}

function parseArgs(): Args {
  const args: Args = { manifestPath: null, only: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--':
        break;
      case '--manifest':
        args.manifestPath = String(argv[++i] ?? '').trim() || null;
        break;
      case '--only': {
        const raw = String(argv[++i] ?? '').trim();
        const requested = raw.split(',').map((part) => part.trim()).filter(Boolean);
        const valid = new Set<TaxonomySourceTable>([
          'departments',
          'categories',
          'group_codes',
          'keywords',
          'sectors',
          'return_codes',
          'marketing_code',
          'size_types',
        ]);
        const invalid = requested.filter((part) => !valid.has(part as TaxonomySourceTable));
        if (requested.length === 0 || invalid.length > 0) {
          throw new Error(`Invalid --only value: ${raw || '(empty)'}`);
        }
        args.only = new Set(requested as TaxonomySourceTable[]);
        break;
      }
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: seed:taxonomy-from-mirror [--manifest <path>]',
      '',
      'Without --manifest, copies taxonomy baselines from rics_mirror.* into app.taxonomy_*.',
      'With --manifest, stages the canonical taxonomy CSVs into temp tables and loads from there instead.',
      'Use --only departments,categories,... to load a subset.',
    ].join('\n'),
  );
  process.exit(code);
}

function quoteQualifiedRef(ref: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(ref)) {
    throw new Error(`Invalid table reference: ${ref}`);
  }
  return ref
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
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

async function insertedCount(client: Client, sql: string): Promise<number> {
  const res = await client.query(sql);
  return res.rowCount ?? 0;
}

const STEPS: Step[] = [
  {
    label: 'departments',
    targetTable: 'departments',
    defaultSourceTable: 'rics_mirror.departments',
    async run(client, sourceTable) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_department (number, "desc", beg_categ, end_categ, date_last_changed)
         SELECT number,
                COALESCE("desc", ''),
                COALESCE(beg_categ, 0),
                COALESCE(end_categ, 0),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM ${quoteQualifiedRef(sourceTable)}
          WHERE number IS NOT NULL
         ON CONFLICT (number) DO NOTHING`,
      );
    },
  },
  {
    label: 'categories',
    targetTable: 'categories',
    defaultSourceTable: 'rics_mirror.categories',
    async run(client, sourceTable) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_category (number, "desc", date_last_changed)
         SELECT number,
                COALESCE("desc", ''),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM ${quoteQualifiedRef(sourceTable)}
          WHERE number IS NOT NULL
         ON CONFLICT (number) DO NOTHING`,
      );
    },
  },
  {
    label: 'groups',
    targetTable: 'group_codes',
    defaultSourceTable: 'rics_mirror.group_codes',
    async run(client, sourceTable) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_group (code, "desc", date_last_changed)
         SELECT TRIM(code),
                COALESCE("desc", ''),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM ${quoteQualifiedRef(sourceTable)}
          WHERE code IS NOT NULL AND TRIM(code) <> ''
         ON CONFLICT (code) DO NOTHING`,
      );
    },
  },
  {
    label: 'keywords',
    targetTable: 'keywords',
    defaultSourceTable: 'rics_mirror.keywords',
    async run(client, sourceTable) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_keyword (keyword, "desc", date_last_changed)
         SELECT TRIM(keyword),
                COALESCE("desc", ''),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM ${quoteQualifiedRef(sourceTable)}
          WHERE keyword IS NOT NULL AND TRIM(keyword) <> ''
         ON CONFLICT (keyword) DO NOTHING`,
      );
    },
  },
  {
    label: 'sectors',
    targetTable: 'sectors',
    defaultSourceTable: 'rics_mirror.sectors',
    async run(client, sourceTable) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_sector (number, "desc", beg_dept, end_dept, date_last_changed)
         SELECT number,
                COALESCE("desc", ''),
                COALESCE(beg_dept, 0),
                COALESCE(end_dept, 0),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM ${quoteQualifiedRef(sourceTable)}
          WHERE number IS NOT NULL
         ON CONFLICT (number) DO NOTHING`,
      );
    },
  },
  {
    label: 'return codes',
    targetTable: 'return_codes',
    defaultSourceTable: 'rics_mirror.return_codes',
    async run(client, sourceTable) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_return_code (code, "desc", trackable, date_last_changed)
         SELECT code,
                COALESCE("desc", ''),
                COALESCE(trackable::boolean, false),
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM ${quoteQualifiedRef(sourceTable)}
          WHERE code IS NOT NULL
         ON CONFLICT (code) DO NOTHING`,
      );
    },
  },
  {
    label: 'promotion codes',
    targetTable: 'marketing_code',
    defaultSourceTable: 'rics_mirror.marketing_code',
    async run(client, sourceTable) {
      return insertedCount(
        client,
        `INSERT INTO app.taxonomy_promotion_code (code, description, "date", pieces, cost, date_last_changed)
         SELECT TRIM(code),
                COALESCE(description, ''),
                date::timestamp,
                pieces,
                cost::decimal,
                COALESCE(date_last_changed::timestamp, CURRENT_TIMESTAMP)
           FROM ${quoteQualifiedRef(sourceTable)}
          WHERE code IS NOT NULL AND TRIM(code) <> ''
         ON CONFLICT (code) DO NOTHING`,
      );
    },
  },
  {
    label: 'size types',
    targetTable: 'size_types',
    defaultSourceTable: 'rics_mirror.size_types',
    async run(client, sourceTable) {
      const colList = Array.from(
        { length: 54 },
        (_, i) => `NULLIF(TRIM(COALESCE(columns_${String(i + 1).padStart(2, '0')}::text, '')), '')`,
      ).join(', ');
      const rowList = Array.from(
        { length: 27 },
        (_, i) => `NULLIF(TRIM(COALESCE(rows_${String(i + 1).padStart(2, '0')}::text, '')), '')`,
      ).join(', ');
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
           FROM ${quoteQualifiedRef(sourceTable)}
          WHERE code IS NOT NULL
         ON CONFLICT (code) DO NOTHING`,
      );
    },
  },
];

function selectedSteps(args: Args): Step[] {
  if (!args.only) return STEPS;
  return STEPS.filter((step) => args.only?.has(step.targetTable));
}

async function main(): Promise<void> {
  const args = parseArgs();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const manifestContext = args.manifestPath ? loadManifest(args.manifestPath) : null;
    const stagedTables = new Map<TaxonomySourceTable, string>();
    const steps = selectedSteps(args);

    if (manifestContext) {
      for (const step of steps) {
        const table = requireTable(manifestContext.manifest, step.targetTable);
        const stagedName = await stageTable(client, manifestContext.manifestDir, table);
        stagedTables.set(step.targetTable, stagedName);
      }
    }

    console.log(
      manifestContext
        ? 'taxonomy backfill (artifact manifest -> app.taxonomy_*)'
        : 'taxonomy backfill (rics_mirror -> app.taxonomy_*)',
    );

    for (const step of steps) {
      const sourceTable = stagedTables.get(step.targetTable) ?? step.defaultSourceTable;
      if (!manifestContext) {
        const [schema, table] = sourceTable.split('.');
        const exists = await tableExists(client, schema, table);
        if (!exists) {
          console.log(`  ${step.label.padEnd(18)}  skipped (${sourceTable} not present)`);
          continue;
        }
      }

      try {
        const inserted = await step.run(client, sourceTable);
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
