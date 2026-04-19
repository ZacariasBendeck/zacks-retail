import fs from 'node:fs';
import path from 'node:path';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildListTablesScript,
  buildListColumnsScript,
  buildSelectScript,
  escapePowerShellLiteral,
} from '../src/services/accessOleDb';

const folder = ricsDbPath('');
const files = fs.readdirSync(folder)
  .filter((f) => /\.mdb$/i.test(f))
  .filter((f) => !/\.(backup-|staging)/i.test(f));

console.log(`Scanning ${files.length} MDBs for the season descriptions...`);

for (const f of files) {
  const full = path.join(folder, f);
  try {
    const pw = getOrRecoverPassword(full);
    const tables = runPowerShellJson<string[] | string>(buildListTablesScript(full, pw));
    const list = Array.isArray(tables) ? tables : [tables];

    for (const tName of list) {
      try {
        // Get columns to know which are string-typed (for LIKE search)
        const cols = runPowerShellJson<any[] | any>(buildListColumnsScript(full, pw, tName));
        const colList = Array.isArray(cols) ? cols : [cols];
        const stringCols = colList.filter((c: any) => [129, 130, 200, 202, 203].includes(c.dataType));
        if (stringCols.length === 0) continue;

        // Build a WHERE that matches 'PRIM 26' OR 'Pasado' in ANY string col
        const whereParts = stringCols.map((c: any) => `[${c.name}] LIKE '*PRIM 26*' OR [${c.name}] LIKE '*Pasado*' OR [${c.name}] LIKE '*VER 22*'`);
        const sql = `SELECT * FROM [${tName}] WHERE ${whereParts.join(' OR ')}`;
        const rows = runPowerShellJson<any[] | any>(buildSelectScript(full, pw, sql));
        const rowList = Array.isArray(rows) ? rows : rows ? [rows] : [];
        if (rowList.length > 0) {
          console.log(`\n🎯 FOUND in ${f} / table "${tName}" (${rowList.length} rows):`);
          for (const r of rowList.slice(0, 5)) console.log('   ', JSON.stringify(r));
        }
      } catch {
        // ignore table-level errors
      }
    }
  } catch (e) {
    // ignore file-level errors
  }
}
