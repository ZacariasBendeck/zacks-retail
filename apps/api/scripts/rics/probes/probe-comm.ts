import fs from 'node:fs';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildListTablesScript,
  buildSelectScript,
} from '../../../src/services/accessOleDb';

const CANDIDATES = [
  'ricomm.mdb',
  'RIDEPT.MDB',
  'RIGROUP.MDB',
  'RIDELETE.MDB',
  'RIINVCHG.MDB',
  'RIALARM.MDB',
  'RIINVPOS.MDB',
  'RIINVQUA.MDB',
];
for (const file of CANDIDATES) {
  const full = ricsDbPath(file);
  if (!fs.existsSync(full)) { console.log(`\n=== ${file} (missing) ===`); continue; }
  console.log(`\n=== ${file} ===`);
  try {
    const pw = getOrRecoverPassword(full);
    const tables = runPowerShellJson<string[] | string>(buildListTablesScript(full, pw));
    const list = Array.isArray(tables) ? tables : [tables];
    console.log(`Tables: ${list.join(', ')}`);
    for (const t of list) {
      try {
        const rows = runPowerShellJson<any[] | any>(buildSelectScript(full, pw, `SELECT TOP 3 * FROM [${t}]`));
        const rowList = Array.isArray(rows) ? rows : rows ? [rows] : [];
        console.log(`  ${t} (sample):`);
        for (const r of rowList) {
          const line = JSON.stringify(r).slice(0, 400);
          console.log(`     ${line}`);
        }
      } catch {
        // skip
      }
    }
  } catch (e) {
    console.log(`(error: ${(e as Error).message.slice(0, 120)})`);
  }
}
