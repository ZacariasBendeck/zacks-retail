import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildListTablesScript,
  buildListColumnsScript,
  buildSelectScript,
} from '../src/services/accessOleDb';

const CANDIDATES = ['riparms.mdb', 'RICSW4D.MDB', 'RIPASS.MDB', 'RIADDRS.MDB'];
for (const file of CANDIDATES) {
  const full = ricsDbPath(file);
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
        console.log(`  ${t} (${rowList.length} sample rows):`);
        for (const r of rowList) {
          const line = JSON.stringify(r).slice(0, 300);
          console.log(`     ${line}${line.length >= 300 ? '...' : ''}`);
        }
      } catch (e) {
        console.log(`  ${t}: (err ${(e as Error).message.slice(0, 60)})`);
      }
    }
  } catch (e) {
    console.log(`(error: ${(e as Error).message.slice(0, 120)})`);
  }
}
