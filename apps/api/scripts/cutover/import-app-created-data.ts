import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

interface Args {
  inPath: string;
}

interface SnapshotTable {
  schema: string;
  table: string;
  rows: Record<string, unknown>[];
}

interface SnapshotFile {
  version: 1;
  exportedAt: string;
  counts: Record<string, number>;
  tables: SnapshotTable[];
}

interface TableImport {
  schema: string;
  table: string;
  conflictColumns?: string[];
  transform?: (row: Record<string, unknown>, ctx: ImportContext) => Promise<Record<string, unknown> | null>;
}

interface ImportContext {
  client: Client;
  skuIdByCode: Map<string, string | null>;
  poLineIdByKey: Map<string, string | null>;
  roleNameBySnapshotId: Map<string, string>;
  roleIdBySnapshotId: Map<string, string | null>;
  userEmailBySnapshotId: Map<string, string>;
  userIdBySnapshotId: Map<string, string | null>;
  poNumberBySnapshotId: Map<string, string>;
  poIdBySnapshotId: Map<string, string | null>;
  importRowExistsByKey: Map<string, boolean>;
}

const API_DIR = path.resolve(__dirname, '../..');
const DEFAULT_IN = path.resolve(API_DIR, '.tmp', 'render-conversion-bundle', 'app', 'app-data-export.json');

const IMPORT_ORDER: TableImport[] = [
  { schema: 'public', table: 'ProductContent', conflictColumns: ['ricsSkuCode'] },
  { schema: 'public', table: 'SeasonOverlay' },
  { schema: 'public', table: 'Role', conflictColumns: ['name'] },
  { schema: 'public', table: 'User', conflictColumns: ['email'], transform: remapUserRole },
  { schema: 'public', table: 'identity_user_role_assignment', transform: remapIdentityUsersAndRole },
  { schema: 'public', table: 'identity_user_store_scope', transform: remapIdentityUsers },
  { schema: 'public', table: 'identity_mfa_factor', transform: remapIdentityUsers },
  { schema: 'public', table: 'identity_external_identity', transform: remapIdentityUsers },

  { schema: 'app', table: 'store_group' },
  { schema: 'app', table: 'store_group_member' },
  { schema: 'app', table: 'vendor_overlay' },
  { schema: 'app', table: 'sku_attribute_override' },
  { schema: 'app', table: 'sku_keyword_override' },
  { schema: 'app', table: 'size_type_override' },

  { schema: 'app', table: 'purchase_plan' },
  { schema: 'app', table: 'purchase_plan_row' },
  { schema: 'app', table: 'purchase_plan_adjustment' },
  { schema: 'app', table: 'purchase_plan_audit' },
  { schema: 'app', table: 'purchase_plan_v3' },
  { schema: 'app', table: 'purchase_plan_v3_row' },
  { schema: 'app', table: 'purchase_plan_v3_adjustment' },
  { schema: 'app', table: 'purchase_plan_v3_audit' },

  { schema: 'app', table: 'matching_set_type' },
  { schema: 'app', table: 'matching_set_role' },
  { schema: 'app', table: 'matching_set' },
  { schema: 'app', table: 'matching_set_member', transform: remapSkuId },
  { schema: 'app', table: 'matching_set_member_size_curve', transform: remapSkuId },
  { schema: 'app', table: 'matching_set_buy_plan', transform: clearGeneratedPoIfUnmapped },
  { schema: 'app', table: 'matching_set_buy_plan_line', transform: remapSkuAndOptionalPoLine },

  { schema: 'app', table: 'purchase_order', conflictColumns: ['po_number'] },
  { schema: 'app', table: 'purchase_order_line', conflictColumns: ['po_id', 'line_sequence'], transform: remapPoLine },
  { schema: 'app', table: 'purchase_order_line_size_cell', conflictColumns: ['po_line_id', 'column_label', 'row_label'], transform: remapPoLineCell },
  { schema: 'app', table: 'po_status_history', transform: remapPoStatusHistory },

  { schema: 'app', table: 'import_shipment' },
  { schema: 'app', table: 'import_container' },
  { schema: 'app', table: 'import_supplier_invoice' },
  { schema: 'app', table: 'import_invoice_line', transform: remapSkuAndOptionalPoLine },
  { schema: 'app', table: 'import_shipment_line', transform: remapRequiredPoLine },
  { schema: 'app', table: 'import_charge' },
  { schema: 'app', table: 'import_landed_cost_allocation', transform: skipMissingImportReferences },
  { schema: 'app', table: 'goods_in_transit_record', transform: skipMissingImportReferences },
  { schema: 'app', table: 'import_verification_check', transform: skipMissingImportReferences },
  { schema: 'app', table: 'import_suggested_price', transform: skipMissingImportReferences },
  { schema: 'app', table: 'import_cost_build', transform: skipMissingImportReferences },
  { schema: 'app', table: 'import_cost_component_allocation', transform: skipMissingImportReferences },
  { schema: 'app', table: 'import_payable_handoff', transform: skipMissingImportReferences },

  { schema: 'app', table: 'customer_segments' },
  { schema: 'app', table: 'customer_segment_versions' },
  { schema: 'app', table: 'segment_version_metric_dependencies' },
];

function parseArgs(): Args {
  const args: Args = { inPath: DEFAULT_IN };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--in':
        args.inPath = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--help':
      case '-h':
        console.log('Usage: import-app-created-data --in <path>');
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

function tableKey(schema: string, table: string): string {
  return `${schema}.${table}`;
}

function stripMeta(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('__')));
}

async function columnsFor(client: Client, schema: string, table: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schema, table],
  );
  return result.rows.map((row) => row.column_name);
}

async function columnTypesFor(client: Client, schema: string, table: string): Promise<Map<string, string>> {
  const result = await client.query<{ column_name: string; data_type: string; udt_name: string }>(
    `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schema, table],
  );
  return new Map(result.rows.map((row) => [row.column_name, row.data_type === 'ARRAY' ? row.udt_name : row.data_type]));
}

async function primaryKeyFor(client: Client, schema: string, table: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
      WHERE n.nspname = $1 AND c.relname = $2 AND i.indisprimary
      ORDER BY array_position(i.indkey, a.attnum)
    `,
    [schema, table],
  );
  return result.rows.map((row) => row.column_name);
}

async function resolveSkuId(ctx: ImportContext, skuCode: unknown): Promise<string | null> {
  if (typeof skuCode !== 'string' || skuCode.trim() === '') return null;
  const code = skuCode.trim();
  if (ctx.skuIdByCode.has(code)) return ctx.skuIdByCode.get(code) ?? null;
  const result = await ctx.client.query<{ id: string }>(
    'SELECT id FROM app.sku WHERE code = $1 ORDER BY id LIMIT 1',
    [code],
  );
  const id = result.rows[0]?.id ?? null;
  ctx.skuIdByCode.set(code, id);
  return id;
}

async function resolvePoLineId(ctx: ImportContext, row: Record<string, unknown>): Promise<string | null> {
  const poNumber = typeof row.__po_number === 'string' ? row.__po_number.trim() : '';
  const lineSequence = Number(row.__po_line_sequence ?? row.line_sequence);
  if (!poNumber || !Number.isInteger(lineSequence)) return null;
  const key = `${poNumber}:${lineSequence}`;
  if (ctx.poLineIdByKey.has(key)) return ctx.poLineIdByKey.get(key) ?? null;
  const result = await ctx.client.query<{ id: string }>(
    `
      SELECT pol.id
      FROM app.purchase_order_line pol
      JOIN app.purchase_order po ON po.id = pol.po_id
      WHERE po.po_number = $1 AND pol.line_sequence = $2
      ORDER BY pol.id
      LIMIT 1
    `,
    [poNumber, lineSequence],
  );
  const id = result.rows[0]?.id ?? null;
  ctx.poLineIdByKey.set(key, id);
  return id;
}

async function resolveRoleId(ctx: ImportContext, snapshotRoleId: unknown): Promise<string | null> {
  if (typeof snapshotRoleId !== 'string' || snapshotRoleId.trim() === '') return null;
  if (ctx.roleIdBySnapshotId.has(snapshotRoleId)) return ctx.roleIdBySnapshotId.get(snapshotRoleId) ?? null;
  const roleName = ctx.roleNameBySnapshotId.get(snapshotRoleId);
  if (!roleName) return null;
  const result = await ctx.client.query<{ id: string }>(
    'SELECT id FROM public."Role" WHERE name = $1 ORDER BY id LIMIT 1',
    [roleName],
  );
  const id = result.rows[0]?.id ?? null;
  ctx.roleIdBySnapshotId.set(snapshotRoleId, id);
  return id;
}

async function resolveUserId(ctx: ImportContext, snapshotUserId: unknown): Promise<string | null> {
  if (typeof snapshotUserId !== 'string' || snapshotUserId.trim() === '') return null;
  if (ctx.userIdBySnapshotId.has(snapshotUserId)) return ctx.userIdBySnapshotId.get(snapshotUserId) ?? null;
  const email = ctx.userEmailBySnapshotId.get(snapshotUserId);
  if (!email) return null;
  const result = await ctx.client.query<{ id: string }>(
    'SELECT id FROM public."User" WHERE email = $1 ORDER BY id LIMIT 1',
    [email],
  );
  const id = result.rows[0]?.id ?? null;
  ctx.userIdBySnapshotId.set(snapshotUserId, id);
  return id;
}

async function resolvePoId(ctx: ImportContext, snapshotPoId: unknown): Promise<string | null> {
  if (typeof snapshotPoId !== 'string' || snapshotPoId.trim() === '') return null;
  if (ctx.poIdBySnapshotId.has(snapshotPoId)) return ctx.poIdBySnapshotId.get(snapshotPoId) ?? null;
  const poNumber = ctx.poNumberBySnapshotId.get(snapshotPoId);
  if (!poNumber) return null;
  const result = await ctx.client.query<{ id: string }>(
    'SELECT id FROM app.purchase_order WHERE po_number = $1 ORDER BY id LIMIT 1',
    [poNumber],
  );
  const id = result.rows[0]?.id ?? null;
  ctx.poIdBySnapshotId.set(snapshotPoId, id);
  return id;
}

async function remapUserRole(row: Record<string, unknown>, ctx: ImportContext): Promise<Record<string, unknown> | null> {
  const out = stripMeta(row);
  if ('roleId' in out) {
    const roleId = await resolveRoleId(ctx, out.roleId);
    if (!roleId) return null;
    out.roleId = roleId;
  }
  return out;
}

async function remapIdentityUsers(row: Record<string, unknown>, ctx: ImportContext): Promise<Record<string, unknown> | null> {
  const out = stripMeta(row);
  for (const column of ['user_id', 'assigned_by_user_id', 'revoked_by_user_id', 'granted_by_user_id']) {
    if (!(column in out) || out[column] == null) continue;
    const userId = await resolveUserId(ctx, out[column]);
    if (!userId) return null;
    out[column] = userId;
  }
  return out;
}

async function remapIdentityUsersAndRole(
  row: Record<string, unknown>,
  ctx: ImportContext,
): Promise<Record<string, unknown> | null> {
  const out = await remapIdentityUsers(row, ctx);
  if (!out) return null;
  if ('role_id' in out) {
    const roleId = await resolveRoleId(ctx, out.role_id);
    if (!roleId) return null;
    out.role_id = roleId;
  }
  return out;
}

async function remapSkuId(row: Record<string, unknown>, ctx: ImportContext): Promise<Record<string, unknown> | null> {
  const out = stripMeta(row);
  if ('sku_id' in out) {
    const skuId = await resolveSkuId(ctx, row.__sku_code);
    if (!skuId) return null;
    out.sku_id = skuId;
  }
  return out;
}

async function remapPoLine(row: Record<string, unknown>, ctx: ImportContext): Promise<Record<string, unknown> | null> {
  const out = await remapSkuId(row, ctx);
  if (!out) return null;
  if ('po_id' in out) {
    const poId = await resolvePoId(ctx, out.po_id);
    if (!poId) return null;
    out.po_id = poId;
  }
  return out;
}

async function remapPoLineCell(row: Record<string, unknown>, ctx: ImportContext): Promise<Record<string, unknown> | null> {
  const out = stripMeta(row);
  const poLineId = await resolvePoLineId(ctx, row);
  if (!poLineId) return null;
  out.po_line_id = poLineId;
  return out;
}

async function remapPoStatusHistory(
  row: Record<string, unknown>,
  ctx: ImportContext,
): Promise<Record<string, unknown> | null> {
  const out = stripMeta(row);
  if ('po_id' in out) {
    const poId = await resolvePoId(ctx, out.po_id);
    if (!poId) return null;
    out.po_id = poId;
  }
  return out;
}

async function remapSkuAndOptionalPoLine(
  row: Record<string, unknown>,
  ctx: ImportContext,
): Promise<Record<string, unknown> | null> {
  const out = stripMeta(row);
  if ('sku_id' in out && row.__sku_code) {
    out.sku_id = await resolveSkuId(ctx, row.__sku_code);
  }
  if ('po_line_id' in out) {
    out.po_line_id = await resolvePoLineId(ctx, row);
  }
  if ('purchase_order_line_id' in out) {
    out.purchase_order_line_id = await resolvePoLineId(ctx, row);
  }
  return out;
}

async function remapRequiredPoLine(
  row: Record<string, unknown>,
  ctx: ImportContext,
): Promise<Record<string, unknown> | null> {
  const out = stripMeta(row);
  const poLineId = await resolvePoLineId(ctx, row);
  if (!poLineId) return null;
  out.purchase_order_line_id = poLineId;
  return out;
}

const IMPORT_REFERENCE_COLUMNS: Record<string, string> = {
  shipment_id: 'import_shipment',
  container_id: 'import_container',
  invoice_line_id: 'import_invoice_line',
  shipment_line_id: 'import_shipment_line',
  charge_id: 'import_charge',
  output_invoice_line_id: 'import_invoice_line',
  output_shipment_line_id: 'import_shipment_line',
  component_invoice_line_id: 'import_invoice_line',
};

async function importRowExists(ctx: ImportContext, table: string, id: unknown): Promise<boolean> {
  if (typeof id !== 'string' || id.trim() === '') return true;
  const key = `${table}:${id}`;
  if (ctx.importRowExistsByKey.has(key)) {
    return ctx.importRowExistsByKey.get(key) ?? false;
  }
  const result = await ctx.client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM app.${qident(table)} WHERE id = $1::uuid) AS exists`,
    [id],
  );
  const exists = Boolean(result.rows[0]?.exists);
  ctx.importRowExistsByKey.set(key, exists);
  return exists;
}

async function skipMissingImportReferences(
  row: Record<string, unknown>,
  ctx: ImportContext,
): Promise<Record<string, unknown> | null> {
  const out = stripMeta(row);
  for (const [column, referencedTable] of Object.entries(IMPORT_REFERENCE_COLUMNS)) {
    if (!(column in out) || out[column] == null) continue;
    if (!(await importRowExists(ctx, referencedTable, out[column]))) return null;
  }
  return out;
}

async function clearGeneratedPoIfUnmapped(row: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const out = stripMeta(row);
  if ('generated_po_id' in out) out.generated_po_id = null;
  return out;
}

async function upsertRows(
  client: Client,
  table: TableImport,
  rows: Record<string, unknown>[],
  ctx: ImportContext,
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const dbColumns = new Set(await columnsFor(client, table.schema, table.table));
  const columnTypes = await columnTypesFor(client, table.schema, table.table);
  if (dbColumns.size === 0) {
    console.warn(`[import:app-created-data] ${tableKey(table.schema, table.table)} does not exist; skipped`);
    return { inserted: 0, skipped: rows.length };
  }
  const primaryKeyColumns = await primaryKeyFor(client, table.schema, table.table);
  const conflictColumns = table.conflictColumns ?? primaryKeyColumns;
  if (conflictColumns.length === 0) {
    console.warn(`[import:app-created-data] ${tableKey(table.schema, table.table)} has no primary key; skipped`);
    return { inserted: 0, skipped: rows.length };
  }

  let inserted = 0;
  let skipped = 0;
  for (const rawRow of rows) {
    const transformed = table.transform ? await table.transform(rawRow, ctx) : stripMeta(rawRow);
    if (!transformed) {
      skipped += 1;
      continue;
    }
    const entries = Object.entries(transformed).filter(([key]) => dbColumns.has(key));
    if (entries.length === 0) {
      skipped += 1;
      continue;
    }
    const columns = entries.map(([key]) => key);
    const values = entries.map(([column, value]) => {
      const type = columnTypes.get(column);
      if ((type === 'json' || type === 'jsonb') && value != null && typeof value === 'object') {
        return JSON.stringify(value);
      }
      return value;
    });
    const placeholders = values.map((_, index) => `$${index + 1}`);
    const updateColumns = columns.filter((column) => !conflictColumns.includes(column) && !primaryKeyColumns.includes(column));
    const conflictSql = conflictColumns.map(qident).join(', ');
    const updateSql = updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map((column) => `${qident(column)} = EXCLUDED.${qident(column)}`).join(', ')}`
      : 'DO NOTHING';

    await client.query(
      `
        INSERT INTO ${qident(table.schema)}.${qident(table.table)}
          (${columns.map(qident).join(', ')})
        VALUES (${placeholders.join(', ')})
        ON CONFLICT (${conflictSql}) ${updateSql}
      `,
      values,
    );
    inserted += 1;
  }
  return { inserted, skipped };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');
  if (!fs.existsSync(args.inPath)) throw new Error(`app data snapshot missing: ${args.inPath}`);

  const snapshot = JSON.parse(fs.readFileSync(args.inPath, 'utf8')) as SnapshotFile;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.tables)) {
    throw new Error(`Unsupported app data snapshot: ${args.inPath}`);
  }
  const tablesByKey = new Map(snapshot.tables.map((table) => [tableKey(table.schema, table.table), table]));

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const roleRows = tablesByKey.get('public.Role')?.rows ?? [];
  const userRows = tablesByKey.get('public.User')?.rows ?? [];
  const poRows = tablesByKey.get('app.purchase_order')?.rows ?? [];
  const ctx: ImportContext = {
    client,
    skuIdByCode: new Map(),
    poLineIdByKey: new Map(),
    roleNameBySnapshotId: new Map(
      roleRows
        .filter((row) => typeof row.id === 'string' && typeof row.name === 'string')
        .map((row) => [String(row.id), String(row.name)]),
    ),
    roleIdBySnapshotId: new Map(),
    userEmailBySnapshotId: new Map(
      userRows
        .filter((row) => typeof row.id === 'string' && typeof row.email === 'string')
        .map((row) => [String(row.id), String(row.email)]),
    ),
    userIdBySnapshotId: new Map(),
    poNumberBySnapshotId: new Map(
      poRows
        .filter((row) => typeof row.id === 'string' && typeof row.po_number === 'string')
        .map((row) => [String(row.id), String(row.po_number)]),
    ),
    poIdBySnapshotId: new Map(),
    importRowExistsByKey: new Map(),
  };

  try {
    console.log('========================================');
    console.log('  import:app-created-data');
    console.log('========================================');
    console.log(`snapshot: ${args.inPath}`);
    console.log(`exported: ${snapshot.exportedAt}`);
    console.log('----------------------------------------');

    for (const table of IMPORT_ORDER) {
      const snapshotTable = tablesByKey.get(tableKey(table.schema, table.table));
      if (!snapshotTable) continue;
      const result = await upsertRows(client, table, snapshotTable.rows, ctx);
      console.log(
        `${tableKey(table.schema, table.table).padEnd(42)} ` +
          `upserted=${result.inserted} skipped=${result.skipped}`,
      );
    }

    console.log('========================================');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[import:app-created-data] ${(error as Error).message}`);
  if ((error as Error).stack) console.error((error as Error).stack);
  process.exit(1);
});
