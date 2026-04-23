/**
 * One-shot RICSWIN MDB scanner.
 *
 * Opens every MDB in a given directory, lists its user tables, and for each
 * table emits column names + row count + 2 sample rows. Designed as an
 * exploratory tool — the goal is to surface canonical data sources the
 * sync allowlist is missing, and to find where RICS stores Season Code Setup.
 *
 * Usage:  npx tsx apps/api/scripts/scan-mdbs.ts [dir]
 *   dir defaults to C:/RICSWIN
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  getOrRecoverPassword,
  runPowerShellJson,
  escapePowerShellLiteral,
} from '../../../src/services/accessOleDb';

const DIR = process.argv[2] ?? 'C:/RICSWIN';

// Skip obvious non-canonical files: dated backups, per-user scratch, temps
const SKIP_PATTERNS = [
  /\.backup-/i,
  /-dm\./i,
  /- copia\./i,
  /\d{5,6}\.mdb$/i, // RITRANS011926, RITRANS12225
  /^RITRANS\d*\.mdb$/i, // RITRANS1.MDB (leave RITRANS.MDB for mainline)
  /TEMP\.mdb$/i,
  /^USER[A-Z]+\.mdb$/i,
  /^JOEL/i,
  /^LLAMADAS/i,
  /^INVFISICO/i,
  /^RICOUNT[0-9X ]*\.mdb$/i,
  /rev\.mdb$/i,
  /^1RITRANS/i,
];

function shouldScan(name: string): boolean {
  return !SKIP_PATTERNS.some((r) => r.test(name));
}

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
      # Columns
      $colSchema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Columns, @($null, $null, $t, $null))
      $cols = @()
      foreach ($c in $colSchema.Rows) {
        $cols += @{ name = [string]$c['COLUMN_NAME']; ord = [int]$c['ORDINAL_POSITION'] }
      }
      $colNames = @($cols | Sort-Object { $_.ord } | ForEach-Object { $_.name })
      $entry.columns = $colNames

      # Row count
      $cmdCount = $conn.CreateCommand()
      $cmdCount.CommandText = 'SELECT COUNT(*) FROM [' + $t + ']'
      $entry.rowCount = [int]$cmdCount.ExecuteScalar()

      # Sample 2 rows
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
  const entries = fs.readdirSync(DIR);
  const mdbs = entries
    .filter((e) => /\.mdb$/i.test(e))
    .filter(shouldScan)
    .sort();

  console.log(`# RICSWIN MDB scan`);
  console.log(`\nDirectory: \`${DIR}\``);
  console.log(`\nScanning ${mdbs.length} MDB file(s) (skipped ${entries.filter((e) => /\.mdb$/i.test(e)).length - mdbs.length} backups/temps).`);
  console.log();

  const failures: { file: string; error: string }[] = [];
  const allFindings: { file: string; tables: ScanRow[] }[] = [];

  for (const f of mdbs) {
    const full = path.resolve(DIR, f);
    process.stderr.write(`  scan ${f} ... `);
    const { tables, error } = await scanOneMdb(full);
    if (error) {
      failures.push({ file: f, error });
      process.stderr.write(`FAIL: ${error.slice(0, 80)}\n`);
      continue;
    }
    allFindings.push({ file: f, tables });
    const totalRows = tables.reduce((s, t) => s + (t.rowCount ?? 0), 0);
    process.stderr.write(`${tables.length} tables, ${totalRows} rows\n`);
  }

  // Detailed per-file report
  for (const { file, tables } of allFindings) {
    console.log(`\n## ${file}`);
    console.log();
    if (!tables.length) {
      console.log('_(no user tables)_');
      continue;
    }
    for (const t of tables) {
      const err = t.error ? ` — _error: ${t.error}_` : '';
      console.log(`### \`${t.table}\` — ${t.rowCount ?? '?'} rows${err}`);
      if (t.columns.length) {
        console.log(`Columns: ${t.columns.map((c) => `\`${c}\``).join(', ')}`);
      }
      if (t.sample.length) {
        console.log(`Sample:`);
        console.log('```json');
        for (const r of t.sample) console.log(JSON.stringify(r));
        console.log('```');
      }
      console.log();
    }
  }

  if (failures.length) {
    console.log(`\n## Failures\n`);
    for (const f of failures) console.log(`- \`${f.file}\` — ${f.error}`);
  }

  // Season-sniff pass
  console.log(`\n## Season-code sniff\n`);
  const seasonHits: string[] = [];
  for (const { file, tables } of allFindings) {
    for (const t of tables) {
      const tname = t.table.toLowerCase();
      const colMatch = t.columns.some((c) => /season|temporada|estacion/i.test(c));
      const nameMatch = /season|temporada|semf/i.test(tname);
      if (colMatch || nameMatch) {
        seasonHits.push(`- \`${file}\` → \`${t.table}\` (${t.rowCount} rows) — cols: ${t.columns.join(', ')}`);
      }
    }
  }
  if (seasonHits.length === 0) {
    console.log('_No tables or columns matched season/temporada/semf._');
  } else {
    for (const h of seasonHits) console.log(h);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
