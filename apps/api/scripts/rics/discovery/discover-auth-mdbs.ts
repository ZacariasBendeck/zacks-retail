/**
 * One-shot discovery pass for the RICS MDB files the employees module cares
 * about but that are NOT yet in the canonical schema doc: RIPASS.MDB, ricomm.mdb,
 * riparms.mdb. Prints tables, columns, and a sample row per table to stdout.
 *
 * Run with:  pnpm --filter @benlow-rics/api tsx scripts/rics/discovery/discover-auth-mdbs.ts
 */

import fs from 'node:fs';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildListTablesScript,
  buildListColumnsScript,
  buildSelectScript,
} from '../../../src/services/accessOleDb';

interface ColumnInfo {
  name: string;
  ordinal: number;
  dataType: number;
  nullable: boolean;
}

const OLEDB_TYPE: Record<number, string> = {
  2: 'SMALLINT', 3: 'INTEGER', 4: 'REAL', 5: 'DOUBLE', 6: 'CURRENCY',
  7: 'DATE', 11: 'BOOLEAN', 14: 'DECIMAL', 16: 'TINYINT', 17: 'UNSIGNEDTINYINT',
  72: 'GUID', 128: 'BINARY', 129: 'CHAR', 130: 'WCHAR', 131: 'NUMERIC',
  133: 'DBDATE', 134: 'DBTIME', 135: 'DBTIMESTAMP',
  200: 'VARCHAR', 201: 'LONGVARCHAR', 202: 'VARWCHAR', 203: 'LONGVARWCHAR',
  204: 'VARBINARY', 205: 'LONGVARBINARY',
};

const typeName = (t: number) => OLEDB_TYPE[t] ?? `type#${t}`;

const FILES = ['RIPASS.MDB', 'ricomm.mdb', 'riparms.mdb'];

function truncate(v: unknown, n = 120): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function main() {
  for (const file of FILES) {
    const dbPath = ricsDbPath(file);
    console.log(`\n========== ${file} ==========`);
    if (!fs.existsSync(dbPath)) {
      console.log(`  (not found at ${dbPath})`);
      continue;
    }

    let password: string;
    try {
      password = getOrRecoverPassword(dbPath);
    } catch (err: any) {
      console.log(`  password recovery failed: ${err.message}`);
      continue;
    }

    let tables: string[];
    try {
      const raw = runPowerShellJson<string | string[]>(buildListTablesScript(dbPath, password));
      tables = Array.isArray(raw) ? raw : [raw];
    } catch (err: any) {
      console.log(`  table enumeration failed: ${err.message}`);
      continue;
    }
    tables.sort();
    console.log(`  tables (${tables.length}): ${tables.join(', ')}`);

    for (const table of tables) {
      console.log(`\n  ---- ${table} ----`);
      try {
        const colsRaw = runPowerShellJson<ColumnInfo | ColumnInfo[]>(
          buildListColumnsScript(dbPath, password, table),
        );
        const cols = Array.isArray(colsRaw) ? colsRaw : [colsRaw];
        for (const c of cols) {
          console.log(`    ${String(c.ordinal).padStart(2)}. ${c.name}  (${typeName(c.dataType)}${c.nullable ? ', nullable' : ''})`);
        }
      } catch (err: any) {
        console.log(`    column enumeration failed: ${err.message}`);
        continue;
      }

      try {
        const rowsRaw = runPowerShellJson<Record<string, unknown> | Record<string, unknown>[]>(
          buildSelectScript(dbPath, password, `SELECT TOP 2 * FROM [${table}]`),
        );
        const rows = Array.isArray(rowsRaw) ? rowsRaw : [rowsRaw];
        if (rows.length === 0 || rows[0] == null) {
          console.log('    (no rows)');
        } else {
          rows.forEach((row, i) => {
            console.log(`    sample row ${i + 1}:`);
            for (const [k, v] of Object.entries(row)) {
              console.log(`      ${k} = ${truncate(v)}`);
            }
          });
        }
      } catch (err: any) {
        console.log(`    sample fetch failed: ${err.message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
