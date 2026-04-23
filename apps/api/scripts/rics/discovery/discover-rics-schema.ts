/**
 * Enumerate tables and columns across the RICS MDB files that the storefront
 * cares about, plus one sample row per table, and write a Markdown report to
 * docs/rics-db-schema.md.
 *
 * Run with:  pnpm --filter @benlow-rics/api rics:discover
 *
 * This is a one-shot discovery pass. The output becomes the reference the
 * storefront-dev agent consults before writing new queries against RICS.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildListTablesScript,
  buildListColumnsScript,
  buildSelectScript,
} from '../src/services/accessOleDb';

interface RicsDb {
  envKey: string;
  defaultFile: string;
  purpose: string;
}

const DATABASES: RicsDb[] = [
  { envKey: 'RICS_INVMAS_DB_FILE', defaultFile: 'RIINVMAS.MDB', purpose: 'Product / SKU master' },
  { envKey: 'RICS_CATEG_DB_FILE', defaultFile: 'RICATEG.MDB', purpose: 'Category master' },
  { envKey: 'RICS_DEPT_DB_FILE', defaultFile: 'RIDEPT.MDB', purpose: 'Department master' },
  { envKey: 'RICS_VENDOR_DB_FILE', defaultFile: 'RIVENDOR.MDB', purpose: 'Vendor master' },
  { envKey: 'RICS_SIZE_DB_FILE', defaultFile: 'RISIZE.MDB', purpose: 'Size runs' },
  { envKey: 'RICS_UPC_DB_FILE', defaultFile: 'RIUPC.MDB', purpose: 'UPC / barcode mappings' },
  { envKey: 'RICS_INVQUA_DB_FILE', defaultFile: 'RIINVQUA.MDB', purpose: 'Inventory quantities' },
  { envKey: 'RICS_SALES_DB_FILE', defaultFile: 'RITRNSSV.MDB', purpose: 'Sales ticket header + detail (sales-reporting)' },
  { envKey: 'RICS_STORE_DB_FILE', defaultFile: 'RISTORE.MDB', purpose: 'Store master (sales-reporting)' },
  { envKey: 'RICS_SLSPSN_DB_FILE', defaultFile: 'RISLSPSN.MDB', purpose: 'Salesperson master (sales-reporting)' },
  { envKey: 'RICS_TAX_DB_FILE', defaultFile: 'RITAX.MDB', purpose: 'Sales tax rates (sales-reporting)' },
  { envKey: 'RICS_MAIL_DB_FILE', defaultFile: 'RIMAIL.MDB', purpose: 'Customer / mail list (sales-reporting + crm)' },
  { envKey: 'RICS_ARACCT_DB_FILE', defaultFile: 'RIARACCT.MDB', purpose: 'A/R accounts / house charges (sales-reporting)' },
  { envKey: 'RICS_GIFTCT_DB_FILE', defaultFile: 'RIGIFTCT.MDB', purpose: 'Gift certificates (sales-reporting)' },
  { envKey: 'RICS_PODET_DB_FILE', defaultFile: 'RIPODET.MDB', purpose: 'Purchase order detail — on-order for Stock Status' },
  { envKey: 'RICS_GROUP_DB_FILE', defaultFile: 'RIGROUP.MDB', purpose: 'Group master (sales-reporting criteria)' },
];

interface ColumnInfo {
  name: string;
  ordinal: number;
  dataType: number;
  nullable: boolean;
}

// OLE DB DBTYPE enum (subset, for human-readable types in the report).
const OLEDB_TYPE: Record<number, string> = {
  2: 'SMALLINT',
  3: 'INTEGER',
  4: 'REAL',
  5: 'DOUBLE',
  6: 'CURRENCY',
  7: 'DATE',
  11: 'BOOLEAN',
  14: 'DECIMAL',
  16: 'TINYINT',
  17: 'UNSIGNEDTINYINT',
  72: 'GUID',
  128: 'BINARY',
  129: 'CHAR',
  130: 'WCHAR',
  131: 'NUMERIC',
  133: 'DBDATE',
  134: 'DBTIME',
  135: 'DBTIMESTAMP',
  200: 'VARCHAR',
  201: 'LONGVARCHAR',
  202: 'VARWCHAR',
  203: 'LONGVARWCHAR',
  204: 'VARBINARY',
  205: 'LONGVARBINARY',
};

function typeName(dataType: number): string {
  return OLEDB_TYPE[dataType] ?? `type#${dataType}`;
}

function normalizeRowValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.replace(/\|/g, '\\|').slice(0, 120);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 120);
  return String(value);
}

async function run(): Promise<void> {
  const outPath = path.resolve(__dirname, '../../../docs/rics-db-schema.md');
  const generatedAt = new Date().toISOString();
  const lines: string[] = [
    '# RICS MDB Schema (auto-generated)',
    '',
    `_Generated at ${generatedAt} by \`pnpm --filter @benlow-rics/api rics:discover\`._`,
    '',
    'This file enumerates user tables and columns in the RICS Access databases that the storefront adapter reads from. **Do not edit the per-MDB sections by hand** — re-run the script instead. Mapping decisions (RICS column → storefront field) go under the _Mappings_ heading at the bottom and are hand-maintained.',
    '',
  ];

  for (const db of DATABASES) {
    const fileName = process.env[db.envKey] || db.defaultFile;
    const dbPath = ricsDbPath(fileName);

    lines.push(`## ${fileName}`);
    lines.push(`_${db.purpose}_`);
    lines.push('');

    if (!fs.existsSync(dbPath)) {
      lines.push(`> ⚠️ Not found at \`${dbPath}\`. Set \`${db.envKey}\` or place the file there.`);
      lines.push('');
      continue;
    }

    let password: string;
    try {
      password = getOrRecoverPassword(dbPath);
    } catch (err: any) {
      lines.push(`> ❌ Password recovery failed: ${err.message}`);
      lines.push('');
      continue;
    }

    let tables: string[];
    try {
      tables = runPowerShellJson<string[]>(buildListTablesScript(dbPath, password));
    } catch (err: any) {
      lines.push(`> ❌ Table enumeration failed: ${err.message}`);
      lines.push('');
      continue;
    }

    if (!Array.isArray(tables) || tables.length === 0) {
      lines.push('> (no user tables found)');
      lines.push('');
      continue;
    }

    tables.sort();
    lines.push(`**Tables (${tables.length}):** ${tables.map((t) => `\`${t}\``).join(', ')}`);
    lines.push('');

    for (const table of tables) {
      lines.push(`### \`${table}\``);
      lines.push('');
      let cols: ColumnInfo[] = [];
      try {
        const raw = runPowerShellJson<ColumnInfo | ColumnInfo[]>(
          buildListColumnsScript(dbPath, password, table),
        );
        cols = Array.isArray(raw) ? raw : [raw];
      } catch (err: any) {
        lines.push(`> column enumeration failed: ${err.message}`);
        lines.push('');
        continue;
      }

      lines.push('| # | column | type | nullable |');
      lines.push('|---|--------|------|----------|');
      for (const c of cols) {
        lines.push(`| ${c.ordinal} | \`${c.name}\` | ${typeName(c.dataType)} | ${c.nullable ? 'yes' : 'no'} |`);
      }
      lines.push('');

      try {
        const rows = runPowerShellJson<Record<string, unknown> | Record<string, unknown>[]>(
          buildSelectScript(dbPath, password, `SELECT TOP 1 * FROM [${table}]`),
        );
        const first = Array.isArray(rows) ? rows[0] : rows;
        if (first && typeof first === 'object') {
          lines.push('<details><summary>sample row</summary>');
          lines.push('');
          lines.push('| column | value |');
          lines.push('|--------|-------|');
          for (const [k, v] of Object.entries(first)) {
            lines.push(`| \`${k}\` | ${normalizeRowValue(v)} |`);
          }
          lines.push('');
          lines.push('</details>');
          lines.push('');
        }
      } catch {
        // Sample row is best-effort only; skip silently on failure.
      }
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Mappings (hand-maintained)');
  lines.push('');
  lines.push('Record here which RICS column feeds which storefront field, along with any transformation.');
  lines.push('');
  lines.push('### `ProductCard` (listing)');
  lines.push('- _TBD — fill in after first run of this discovery script._');
  lines.push('');
  lines.push('### `ProductDetail`');
  lines.push('- _TBD_');
  lines.push('');
  lines.push('### `Facets`');
  lines.push('- _TBD_');
  lines.push('');

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Wrote ${outPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
