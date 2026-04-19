import fs from 'node:fs';
import path from 'node:path';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildListTablesScript,
  buildSelectScript,
} from '../src/services/accessOleDb';

const folder = ricsDbPath('');
const files = fs.readdirSync(folder)
  .filter((f) => /\.mdb$/i.test(f))
  .filter((f) => !/\.(backup-|staging)/i.test(f));

for (const f of files) {
  const full = path.join(folder, f);
  try {
    const pw = getOrRecoverPassword(full);
    const tables = runPowerShellJson<string[] | string>(buildListTablesScript(full, pw));
    const list = Array.isArray(tables) ? tables : [tables];
    // Look for any table with 'season' or 'semf' in the name
    const hits = list.filter((t) => /season|temporada|semf/i.test(t));
    if (hits.length > 0) {
      console.log(`${f}: ${hits.join(', ')}`);
    }
  } catch (e) {
    console.log(`${f}: (could not open — ${(e as Error).message.slice(0, 80)})`);
  }
}
