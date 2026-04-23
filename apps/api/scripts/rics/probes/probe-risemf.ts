import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildListTablesScript,
  buildListColumnsScript,
  buildSelectScript,
} from '../../../src/services/accessOleDb';

async function main() {
  const path = ricsDbPath('RISEMF.MDB');
  console.log('Path:', path);

  const pw = getOrRecoverPassword(path);
  console.log('Password recovered:', pw.length, 'chars');

  const tables = await runPowerShellJson<string[] | string>(buildListTablesScript(path, pw));
  const tableList = Array.isArray(tables) ? tables : [tables];
  console.log('Tables:', tableList);

  for (const t of tableList) {
    const cols = await runPowerShellJson<any[] | any>(buildListColumnsScript(path, pw, t));
    const colList = Array.isArray(cols) ? cols : [cols];
    console.log(`\nTable "${t}" columns:`);
    for (const c of colList) console.log(`  ${c.name} (type ${c.dataType}, ord ${c.ordinal})`);

    const rows = await runPowerShellJson<any[] | any>(
      buildSelectScript(path, pw, `SELECT TOP 25 * FROM [${t}]`),
    );
    const rowList = Array.isArray(rows) ? rows : [rows];
    console.log(`\nTable "${t}" rows (first 25 of ${rowList.length}):`);
    for (const r of rowList) console.log('  ', JSON.stringify(r));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
