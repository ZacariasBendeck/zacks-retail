/**
 * Scan a hand-picked set of MDB files. Mirrors scan-mdbs.ts table/col/sample
 * output but takes explicit file paths (so we can include '.backup-*.MDB'
 * files that scan-mdbs.ts's skip-list normally excludes).
 */
import path from 'node:path';
import {
  getOrRecoverPassword,
  runPowerShellJson,
  escapePowerShellLiteral,
} from '../src/services/accessOleDb';

const FILES = [
  'E:/data/rics-mdbs/FR.MDB',
  'E:/data/rics-mdbs/RIARACCT.MDB',
  'E:/data/rics-mdbs/RICSW4D.MDB',
  'E:/data/rics-mdbs/RIJHIST.MDB',
  'E:/data/rics-mdbs/RIQUEUE.MDB',
  'E:/data/rics-mdbs/RISEMF.backup-2026-04-19-141902.MDB',
];

interface ScanRow {
  table: string;
  rowCount: number | null;
  columns: string[];
  sample: Record<string, unknown>[];
  error?: string;
}

async function scanOneMdb(dbPath: string): Promise<{ tables: ScanRow[]; error?: string }> {
  let pw: string;
  try {
    pw = getOrRecoverPassword(dbPath);
  } catch (e) {
    return { tables: [], error: `Password recovery failed: ${(e as Error).message}` };
  }

  const script = `
$ErrorActionPreference = 'Stop'
$dbPath = '${escapePowerShellLiteral(dbPath)}'
$password = '${escapePowerShellLiteral(pw)}'
$cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath;Jet OLEDB:Database Password=$password;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($cs)
$conn.Open()
try {
  $schema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Tables, $null)
  $userTables = @()
  foreach ($row in $schema.Rows) {
    $name = [string]$row['TABLE_NAME']
    $type = [string]$row['TABLE_TYPE']
    if ($name -like 'MSys*') { continue }
    if ($name -like '~*') { continue }
    if ($type -eq 'VIEW' -or $type -eq 'SYSTEM TABLE' -or $type -eq 'ACCESS TABLE') { continue }
    $userTables += $name
  }
  $result = New-Object System.Collections.ArrayList
  foreach ($t in $userTables) {
    $entry = [ordered]@{ table = $t; rowCount = $null; columns = @(); sample = @(); error = $null }
    try {
      $colSchema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Columns, @($null, $null, $t, $null))
      $cols = @()
      foreach ($c in $colSchema.Rows) { $cols += @{ name = [string]$c['COLUMN_NAME']; ord = [int]$c['ORDINAL_POSITION'] } }
      $entry.columns = @($cols | Sort-Object { $_.ord } | ForEach-Object { $_.name })
      $cmdCount = $conn.CreateCommand()
      $cmdCount.CommandText = 'SELECT COUNT(*) FROM [' + $t + ']'
      $entry.rowCount = [int]$cmdCount.ExecuteScalar()
      $cmdSample = $conn.CreateCommand()
      $cmdSample.CommandText = 'SELECT TOP 2 * FROM [' + $t + ']'
      $reader = $cmdSample.ExecuteReader()
      $sampleRows = @()
      while ($reader.Read()) {
        $row = [ordered]@{}
        for ($i = 0; $i -lt $reader.FieldCount; $i++) {
          $v = $reader.GetValue($i)
          if ($v -is [System.DBNull]) { $v = $null }
          elseif ($v -is [byte[]]) { $v = '<binary ' + $v.Length + ' bytes>' }
          elseif ($v -is [DateTime]) { $v = $v.ToString('o') }
          $row[$reader.GetName($i)] = $v
        }
        $sampleRows += $row
      }
      $reader.Close()
      $entry.sample = $sampleRows
    } catch {
      $entry.error = $_.Exception.Message
    }
    [void]$result.Add($entry)
  }
  ConvertTo-Json -InputObject @($result) -Depth 6 -Compress
} finally {
  $conn.Close()
}
`;

  try {
    const rows = await runPowerShellJson<ScanRow[] | ScanRow>(script);
    const list = Array.isArray(rows) ? rows : [rows];
    return { tables: list };
  } catch (e) {
    return { tables: [], error: (e as Error).message };
  }
}

async function main() {
  console.log(`# Targeted MDB scan — Jet-3 recovered files\n`);
  const seasonHits: string[] = [];
  for (const full of FILES) {
    const f = path.basename(full);
    process.stderr.write(`  scan ${f} ... `);
    const { tables, error } = await scanOneMdb(full);
    if (error) {
      console.log(`\n## ${f}\n\n_error: ${error.split('\n')[0]}_\n`);
      process.stderr.write(`FAIL\n`);
      continue;
    }
    const totalRows = tables.reduce((s, t) => s + (t.rowCount ?? 0), 0);
    process.stderr.write(`${tables.length} tables, ${totalRows} rows\n`);
    console.log(`\n## ${f}\n`);
    if (!tables.length) { console.log('_(no user tables)_\n'); continue; }
    for (const t of tables) {
      const err = t.error ? ` — _error: ${t.error}_` : '';
      console.log(`### \`${t.table}\` — ${t.rowCount ?? '?'} rows${err}`);
      if (t.columns.length) console.log(`Columns: ${t.columns.map((c) => `\`${c}\``).join(', ')}`);
      if (t.sample.length) {
        console.log('Sample:');
        console.log('```json');
        for (const r of t.sample) console.log(JSON.stringify(r));
        console.log('```');
      }
      console.log();
      const tname = t.table.toLowerCase();
      const colMatch = t.columns.some((c) => /season|temporada|estacion/i.test(c));
      const nameMatch = /season|temporada|semf/i.test(tname);
      if (colMatch || nameMatch) {
        seasonHits.push(`- \`${f}\` → \`${t.table}\` (${t.rowCount} rows) — cols: ${t.columns.join(', ')}`);
      }
    }
  }
  console.log(`\n## Season sniff\n`);
  if (seasonHits.length === 0) console.log('_No tables or columns matched season/temporada/semf._');
  else for (const h of seasonHits) console.log(h);
}

main().catch((e) => { console.error(e); process.exit(1); });
