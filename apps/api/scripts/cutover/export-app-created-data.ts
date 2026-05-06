import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

interface Args {
  outPath: string;
}

interface SnapshotTable {
  schema: string;
  table: string;
  rows: Record<string, unknown>[];
}

interface SnapshotFile {
  version: 1;
  exportedAt: string;
  exportedFromDatabase: string;
  counts: Record<string, number>;
  tables: SnapshotTable[];
}

interface TableExport {
  schema: string;
  table: string;
  orderBy?: string;
  sql?: string;
}

const API_DIR = path.resolve(__dirname, '../..');
const DEFAULT_OUT = path.resolve(API_DIR, '.tmp', 'render-conversion-bundle', 'app', 'app-data-export.json');

const TABLES: TableExport[] = [
  { schema: 'public', table: 'ProductContent', orderBy: '"ricsSkuCode"' },
  { schema: 'public', table: 'SeasonOverlay', orderBy: 'code' },
  { schema: 'public', table: 'Role', orderBy: 'name' },
  { schema: 'public', table: 'User', orderBy: 'email' },
  { schema: 'public', table: 'identity_user_role_assignment', orderBy: 'created_at, id' },
  { schema: 'public', table: 'identity_user_store_scope', orderBy: 'created_at, id' },
  { schema: 'public', table: 'identity_mfa_factor', orderBy: 'created_at, id' },
  { schema: 'public', table: 'identity_external_identity', orderBy: 'created_at, id' },

  { schema: 'app', table: 'store_group', orderBy: 'sort_order, code' },
  { schema: 'app', table: 'store_group_member', orderBy: 'store_number' },
  { schema: 'app', table: 'vendor_overlay', orderBy: 'code' },
  { schema: 'app', table: 'sku_attribute_override', orderBy: 'rics_sku_code' },
  { schema: 'app', table: 'sku_keyword_override', orderBy: 'rics_sku_code, keyword' },
  { schema: 'app', table: 'size_type_override', orderBy: 'code' },

  { schema: 'app', table: 'purchase_plan', orderBy: 'created_at, id' },
  { schema: 'app', table: 'purchase_plan_row', orderBy: 'plan_id, department_key, year_month' },
  { schema: 'app', table: 'purchase_plan_adjustment', orderBy: 'applied_at, id' },
  { schema: 'app', table: 'purchase_plan_audit', orderBy: 'at, id' },
  { schema: 'app', table: 'purchase_plan_v3', orderBy: 'created_at, id' },
  { schema: 'app', table: 'purchase_plan_v3_row', orderBy: 'plan_id, store_group_code, season' },
  { schema: 'app', table: 'purchase_plan_v3_adjustment', orderBy: 'applied_at, id' },
  { schema: 'app', table: 'purchase_plan_v3_audit', orderBy: 'at, id' },

  { schema: 'app', table: 'matching_set_type', orderBy: 'sort_order, code' },
  { schema: 'app', table: 'matching_set_role', orderBy: 'set_type_code, sort_order, code' },
  { schema: 'app', table: 'matching_set', orderBy: 'created_at, code' },
  {
    schema: 'app',
    table: 'matching_set_member',
    sql: `
      SELECT m.*, sku.code AS "__sku_code"
      FROM app.matching_set_member m
      JOIN app.sku sku ON sku.id = m.sku_id
      ORDER BY m.set_id, sku.code
    `,
  },
  {
    schema: 'app',
    table: 'matching_set_member_size_curve',
    sql: `
      SELECT c.*, sku.code AS "__sku_code"
      FROM app.matching_set_member_size_curve c
      JOIN app.sku sku ON sku.id = c.sku_id
      ORDER BY c.set_id, sku.code, c.chain_id NULLS FIRST, c.store_id NULLS FIRST, c.size_label
    `,
  },
  { schema: 'app', table: 'matching_set_buy_plan', orderBy: 'created_at, id' },
  {
    schema: 'app',
    table: 'matching_set_buy_plan_line',
    sql: `
      SELECT l.*, sku.code AS "__sku_code"
      FROM app.matching_set_buy_plan_line l
      JOIN app.sku sku ON sku.id = l.sku_id
      ORDER BY l.plan_id, sku.code, l.role_code, l.size_label
    `,
  },

  {
    schema: 'app',
    table: 'purchase_order',
    sql: `
      SELECT *
      FROM app.purchase_order
      WHERE origin <> 'RICS_IMPORT'
      ORDER BY created_at, po_number
    `,
  },
  {
    schema: 'app',
    table: 'purchase_order_line',
    sql: `
      SELECT l.*, sku.code AS "__sku_code", po.po_number AS "__po_number"
      FROM app.purchase_order_line l
      JOIN app.purchase_order po ON po.id = l.po_id
      JOIN app.sku sku ON sku.id = l.sku_id
      WHERE po.origin <> 'RICS_IMPORT'
      ORDER BY po.po_number, l.line_sequence
    `,
  },
  {
    schema: 'app',
    table: 'purchase_order_line_size_cell',
    sql: `
      SELECT c.*,
             po.po_number AS "__po_number",
             l.line_sequence AS "__po_line_sequence"
      FROM app.purchase_order_line_size_cell c
      JOIN app.purchase_order_line l ON l.id = c.po_line_id
      JOIN app.purchase_order po ON po.id = l.po_id
      WHERE po.origin <> 'RICS_IMPORT'
      ORDER BY c.po_line_id, c.column_label, c.row_label
    `,
  },
  {
    schema: 'app',
    table: 'po_status_history',
    sql: `
      SELECT h.*, po.po_number AS "__po_number"
      FROM app.po_status_history h
      JOIN app.purchase_order po ON po.id = h.po_id
      WHERE po.origin <> 'RICS_IMPORT'
      ORDER BY h.po_id, h.created_at
    `,
  },

  { schema: 'app', table: 'import_shipment', orderBy: 'created_at, shipment_number' },
  { schema: 'app', table: 'import_container', orderBy: 'created_at, id' },
  { schema: 'app', table: 'import_supplier_invoice', orderBy: 'created_at, id' },
  {
    schema: 'app',
    table: 'import_invoice_line',
    sql: `
      SELECT l.*,
             sku.code AS "__sku_code",
             po.po_number AS "__po_number",
             pol.line_sequence AS "__po_line_sequence"
      FROM app.import_invoice_line l
      LEFT JOIN app.sku sku ON sku.id = l.sku_id
      LEFT JOIN app.purchase_order_line pol ON pol.id = l.purchase_order_line_id
      LEFT JOIN app.purchase_order po ON po.id = pol.po_id
      ORDER BY l.invoice_id, l.line_number
    `,
  },
  {
    schema: 'app',
    table: 'import_shipment_line',
    sql: `
      SELECT l.*,
             po.po_number AS "__po_number",
             pol.line_sequence AS "__po_line_sequence"
      FROM app.import_shipment_line l
      LEFT JOIN app.purchase_order_line pol ON pol.id = l.purchase_order_line_id
      LEFT JOIN app.purchase_order po ON po.id = pol.po_id
      ORDER BY l.shipment_id, l.created_at, l.id
    `,
  },
  { schema: 'app', table: 'import_charge', orderBy: 'created_at, id' },
  { schema: 'app', table: 'import_landed_cost_allocation', orderBy: 'created_at, id' },
  { schema: 'app', table: 'goods_in_transit_record', orderBy: 'created_at, id' },
  { schema: 'app', table: 'import_verification_check', orderBy: 'created_at, id' },
  { schema: 'app', table: 'import_suggested_price', orderBy: 'created_at, id' },
  { schema: 'app', table: 'import_cost_build', orderBy: 'created_at, id' },
  { schema: 'app', table: 'import_cost_component_allocation', orderBy: 'created_at, id' },
  { schema: 'app', table: 'import_payable_handoff', orderBy: 'created_at, id' },

  { schema: 'app', table: 'customer_segments', orderBy: 'priority, id' },
  { schema: 'app', table: 'customer_segment_versions', orderBy: 'created_at, id' },
  { schema: 'app', table: 'segment_version_metric_dependencies', orderBy: 'segment_version_id, metric_key' },
];

function parseArgs(): Args {
  const args: Args = { outPath: DEFAULT_OUT };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--out':
        args.outPath = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--help':
      case '-h':
        console.log('Usage: export-app-created-data --out <path>');
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

function qident(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function redactPassword(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

async function tableExists(client: Client, schema: string, table: string): Promise<boolean> {
  const result = await client.query(
    `
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'r'
      LIMIT 1
    `,
    [schema, table],
  );
  return result.rowCount > 0;
}

async function exportTable(client: Client, table: TableExport): Promise<SnapshotTable | null> {
  if (!(await tableExists(client, table.schema, table.table))) return null;
  const sql = table.sql ?? `
    SELECT *
    FROM ${qident(table.schema)}.${qident(table.table)}
    ${table.orderBy ? `ORDER BY ${table.orderBy}` : ''}
  `;
  const result = await client.query<Record<string, unknown>>(sql);
  return { schema: table.schema, table: table.table, rows: result.rows };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log('========================================');
    console.log('  export:app-created-data');
    console.log('========================================');
    console.log(`database: ${redactPassword(databaseUrl)}`);
    console.log(`out     : ${args.outPath}`);
    console.log('----------------------------------------');

    const tables: SnapshotTable[] = [];
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      const snapshot = await exportTable(client, table);
      if (!snapshot) continue;
      const key = `${snapshot.schema}.${snapshot.table}`;
      tables.push(snapshot);
      counts[key] = snapshot.rows.length;
      console.log(`${key.padEnd(42)} ${snapshot.rows.length}`);
    }

    const out: SnapshotFile = {
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedFromDatabase: redactPassword(databaseUrl),
      counts,
      tables,
    };

    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log('----------------------------------------');
    console.log(`written : ${args.outPath}`);
    console.log('========================================');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[export:app-created-data] ${(error as Error).message}`);
  if ((error as Error).stack) console.error((error as Error).stack);
  process.exit(1);
});
