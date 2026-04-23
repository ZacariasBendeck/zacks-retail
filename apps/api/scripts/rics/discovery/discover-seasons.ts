import fs from 'node:fs';
import path from 'node:path';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildSelectScript,
} from '../../../src/services/accessOleDb';

// Try riparms.mdb to see what's in UserOptions for seasons
const p = ricsDbPath('riparms.mdb');
if (fs.existsSync(p)) {
  try {
    const pwd = getOrRecoverPassword(p);
    const rows = runPowerShellJson<any>(buildSelectScript(p, pwd, `SELECT [Section], [Item], [Value] FROM [UserOptions] WHERE [Section] LIKE '%SEASON%' OR [Item] LIKE '%SEASON%' OR [Value] LIKE '%SEASON%'`));
    const arr = Array.isArray(rows) ? rows : rows ? [rows] : [];
    console.log('riparms seasons:', JSON.stringify(arr, null, 2).slice(0, 2000));

    const all = runPowerShellJson<any>(buildSelectScript(p, pwd, `SELECT DISTINCT [Section] FROM [UserOptions]`));
    console.log('sections:', JSON.stringify(all).slice(0, 500));
  } catch (e: any) { console.log('err: ' + e.message); }
}

// Try distinct Season values
const invmas = ricsDbPath('RIINVMAS.MDB');
try {
  const pwd = getOrRecoverPassword(invmas);
  const rows = runPowerShellJson<any>(buildSelectScript(invmas, pwd, `SELECT DISTINCT [Season] FROM [InventoryMaster]`));
  const arr = Array.isArray(rows) ? rows : rows ? [rows] : [];
  console.log('distinct seasons in InvMas:', JSON.stringify(arr).slice(0, 1000));
} catch (e: any) { console.log('invmas err: ' + e.message); }
