/**
 * Probe each candidate MDB and report whether ACE.OLEDB.12.0 can open it.
 * Files that open are already Jet 4+. Files that fail with the "previous version"
 * error are still Jet 3 and need conversion.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  getOrRecoverPassword,
  runPowerShellJson,
  escapePowerShellLiteral,
} from '../src/services/accessOleDb';

const DIR = 'E:/data/rics-mdbs';

// Jet-3 suspects + their 2026-04-19 backups. For each, we want to know
// which variant (if any) is readable by ACE.OLEDB.12.0.
const CANDIDATES = [
  'FR.MDB',
  'FR.backup-2026-04-19-141915.MDB',
  'RIARACCT.MDB',
  'RIARACCT.backup-2026-04-19-141930.MDB',
  'RICSW4D.MDB',
  'RICSW4D.backup-2026-04-19-141948.MDB',
  'RIJHIST.MDB',
  'RIJHIST.backup-2026-04-19-141957.MDB',
  'RIQUEUE.MDB',
  'RIQUEUE.backup-2026-04-19-142008.MDB',
  'RISEMF.MDB',
  'RISEMF.backup-2026-04-19-141902.MDB',
];

async function probeOpen(dbPath: string): Promise<{ ok: boolean; error?: string }> {
  let pw: string;
  try {
    pw = getOrRecoverPassword(dbPath);
  } catch (e) {
    return { ok: false, error: `pw: ${(e as Error).message}` };
  }
  const script = `
$ErrorActionPreference = 'Stop'
$dbPath = '${escapePowerShellLiteral(dbPath)}'
$password = '${escapePowerShellLiteral(pw)}'
$cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath;Jet OLEDB:Database Password=$password;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($cs)
$conn.Open()
$conn.Close()
ConvertTo-Json 'ok' -Compress
`;
  try {
    await runPowerShellJson(script);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message.split('\n')[0].slice(0, 100) };
  }
}

async function main() {
  for (const f of CANDIDATES) {
    const full = path.resolve(DIR, f);
    if (!fs.existsSync(full)) {
      console.log(`MISSING  ${f}`);
      continue;
    }
    const size = fs.statSync(full).size;
    const mtime = fs.statSync(full).mtime.toISOString().slice(0, 16);
    const { ok, error } = await probeOpen(full);
    const status = ok ? 'JET4-OK' : 'JET3-FAIL';
    console.log(`${status.padEnd(10)} ${String(size).padStart(9)} ${mtime}  ${f}${error ? '  — ' + error : ''}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
