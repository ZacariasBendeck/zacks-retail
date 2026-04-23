import fs from 'node:fs';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildListTablesScript,
  buildSelectScript,
} from '../../../src/services/accessOleDb';

const CANDIDATES = ['RISIZE.MDB', 'RISTORE.MDB', 'RITAX.MDB', 'RIARTICK.MDB', 'RICASEPK.MDB', 'RICATEG.MDB'];
for (const file of CANDIDATES) {
  const full = ricsDbPath(file);
  if (!fs.existsSync(full)) continue;
  console.log(`\n=== ${file} ===`);
  try {
    const pw = getOrRecoverPassword(full);
    const tables = runPowerShellJson<string[] | string>(buildListTablesScript(full, pw));
    const list = Array.isArray(tables) ? tables : [tables];
    console.log(`Tables: ${list.join(', ')}`);
  } catch (e) {
    console.log(`(error: ${(e as Error).message.slice(0, 120)})`);
  }
}
