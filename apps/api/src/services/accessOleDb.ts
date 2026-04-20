// Shared PowerShell + OLEDB helpers for password-protected Jet/Access .MDB files.
//
// Lifted from ricsReportService.ts so both the schema-discovery script and the
// storefront product adapter share one copy of the password recovery + spawn pattern.
//
// Provides three categories of helpers:
//   1. Read: buildSelectScript (legacy raw SQL) + executeQuery (parameterized)
//   2. Write: executeNonQuery (parameterized INSERT/UPDATE/DELETE, returns rowcount)
//   3. Transaction: executeTransaction (multiple parameterized ops, BeginTrans/CommitTrans/RollbackTrans)
//
// Writes are ALWAYS parameterized — OLE DB positional `?` placeholders, typed via
// AccessParam{value,type}. Raw SQL is accepted only for reads and only for internal
// callers that build safe SQL themselves (e.g., schema discovery).

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { executeViaPersistentHost } from './persistentPwsh';

const INIT_KEY = Uint8Array.from([
  0xc7, 0xda, 0x39, 0x6b, 0x00, 0x00, 0x4e, 0xa2, 0xdd, 0x43, 0x16, 0xd0, 0x34, 0xbe, 0x26, 0x60,
  0x9b, 0x11, 0x56, 0xae, 0x12, 0x8c, 0xf6, 0x22, 0x7c, 0xcb, 0x4d, 0xcd, 0x8d, 0xf1, 0x5e, 0x27,
  0x52, 0x1d, 0x24, 0x3e, 0x72, 0x3c, 0xe3, 0xfd, 0xc8, 0x00, 0xaa, 0x46, 0xad, 0x38, 0x89, 0x5d,
  0x6d, 0x85, 0x78, 0x71, 0xe6, 0x80, 0x77, 0x82, 0xcc, 0x53, 0x09, 0xdb, 0x79, 0x69, 0x6f, 0x73,
  0x50, 0x9e, 0x49, 0x5a, 0x42, 0x23, 0x4c, 0x55, 0xf2, 0xeb, 0xd4, 0x15, 0x98, 0x47, 0x33, 0x1e,
  0x1f, 0xc4, 0xf0, 0x35, 0x1a, 0xa8, 0x4a, 0x7b, 0x18, 0x10, 0xee, 0x7d, 0xe4, 0x40, 0x0a, 0x6b,
  0x61, 0x9a, 0x66, 0x70, 0x93, 0xe2, 0x58, 0x01, 0x19, 0xb8, 0x83, 0xbd, 0xbf, 0x04, 0xf4, 0x2c,
  0xda, 0x59, 0x3a, 0xef, 0x97, 0xab, 0x5f, 0x03, 0x84, 0x48, 0xce, 0x37, 0xfa, 0xca, 0x8e, 0x9c,
  0xe9, 0xcf, 0x8f, 0x02, 0xf8, 0x5b, 0x20, 0xa3, 0xd5, 0xfb, 0xe0, 0xe5, 0xa4, 0x17, 0x2b, 0xd2,
  0x06, 0x68, 0x5c, 0xb1, 0x6c, 0xfc, 0x2d, 0xe1, 0x25, 0x3f, 0xf5, 0x2a, 0x88, 0x28, 0xb7, 0xb9,
  0x0b, 0x1c, 0x32, 0x7e, 0x29, 0xff, 0x92, 0xdc, 0x07, 0xc5, 0x90, 0xc6, 0xb0, 0xc3, 0x8a, 0xb5,
  0x08, 0xb2, 0xe8, 0x75, 0x31, 0xa1, 0x57, 0xc1, 0x30, 0xc9, 0x91, 0xd3, 0xba, 0x0c, 0x6a, 0x36,
  0xb3, 0x54, 0x6e, 0x63, 0xa6, 0x44, 0x1b, 0xc0, 0x2e, 0x45, 0x7f, 0x99, 0x7a, 0x4f, 0x39, 0xc2,
  0xaf, 0xa0, 0xed, 0xd9, 0x3d, 0xea, 0x14, 0x21, 0xe7, 0xac, 0xb4, 0xf3, 0x51, 0x9f, 0xd1, 0xd7,
  0x8b, 0xfe, 0x76, 0xa7, 0xbb, 0x9d, 0x0e, 0xa5, 0x81, 0x64, 0x95, 0xf9, 0x2f, 0x62, 0x94, 0x05,
  0x0f, 0x87, 0x4b, 0xd6, 0xc7, 0xa9, 0x74, 0x96, 0x41, 0x13, 0xd8, 0xf7, 0x65, 0xb6, 0xbc, 0xec,
  0x86, 0xdf, 0x3b, 0xde, 0x67, 0x0d, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const DEFAULT_RICS_DIR = process.env.RICS_DB_DIR
  ? path.resolve(process.env.RICS_DB_DIR)
  : path.resolve(REPO_ROOT, 'Rics Databases');

let cachedPassword: string | null = null;

export function ricsDbPath(fileName: string): string {
  return path.resolve(DEFAULT_RICS_DIR, fileName);
}

export function getOrRecoverPassword(dbPath: string): string {
  if (process.env.RICS_MDB_PASSWORD) {
    return process.env.RICS_MDB_PASSWORD;
  }
  if (cachedPassword) {
    return cachedPassword;
  }
  cachedPassword = recoverJetMdbPassword(dbPath);
  return cachedPassword;
}

export function escapePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * PowerShell prologue that forces stdout + pipeline encoding to UTF-8 so that
 * non-ASCII characters (e.g. the Spanish Ñ in department descriptions like
 * 'SECTOR ROPA NIÑOS') survive the transit from PowerShell's OEM code page
 * (typically Windows-1252 / CP850) into Node's UTF-8-decoded `spawnSync` stdout.
 *
 * Without this, 0xD1 'Ñ' encoded as a single byte by PowerShell gets treated as
 * an invalid UTF-8 start byte by Node and is replaced with U+FFFD (or split,
 * depending on what follows). Setting the console + pipeline encodings to UTF-8
 * makes PowerShell emit the character as the 2-byte sequence 0xC3 0x91, which
 * round-trips cleanly through JSON.
 */
const UTF8_OUTPUT_PROLOGUE = `
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
`;

/**
 * Run a PowerShell script and parse its stdout as JSON.
 *
 * Execution strategy: spawns a new `powershell.exe` per call using async
 * `spawn` (not `spawnSync`). Async matters because `spawnSync` blocks the
 * Node event loop for the full 0.7–60 s a PowerShell call can take, which
 * means warmup and long-running queries freeze every other HTTP request.
 * With `spawn`, stdout/stderr drain through event-loop callbacks and the
 * server keeps serving other routes while OLE DB churns.
 *
 * Per-call spawn (vs. a persistent host): costs ~0.7–1.2 s of process
 * cold-start per query but is bulletproof against large responses. An
 * earlier persistent-host design (see `persistentPwsh.ts`) deadlocked
 * when a 150 MB+ SKU dump raced the end-marker write. The per-call spawn
 * keeps framing trivial: stdout is the whole response, full stop, no
 * inter-request state.
 *
 * Empty stdout returns `[]` to match "table with zero rows" semantics.
 */
export function runPowerShellJson<T>(script: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const child: any = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', UTF8_OUTPUT_PROLOGUE + script],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c: string) => { stdout += c; });
    child.stderr.on('data', (c: string) => { stderr += c; });
    child.on('error', (err: Error) => reject(err));
    child.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error((stderr || stdout || `PowerShell exited with code ${code}`).trim()));
        return;
      }
      const payload = stdout.trim();
      if (!payload) {
        resolve([] as unknown as T);
        return;
      }
      try {
        resolve(JSON.parse(payload) as T);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Legacy synchronous path. Kept for edge cases where async isn't possible
 * (rare — most of the codebase runs inside async functions already). New
 * code should prefer `runPowerShellJson`, which is async and amortizes
 * process startup.
 */
export function runPowerShellJsonSync<T>(script: string): T {
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', UTF8_OUTPUT_PROLOGUE + script], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'PowerShell command failed').trim());
  }

  const payload = result.stdout.trim();
  if (!payload) {
    return [] as T;
  }
  return JSON.parse(payload) as T;
}

/// Build a PowerShell script that opens one .MDB, runs one parameterless SQL
/// statement, and emits the result rows as JSON. Use for read-only queries.
export function buildSelectScript(dbPath: string, password: string, sql: string): string {
  return `
$ErrorActionPreference = 'Stop'
$dbPath = '${escapePowerShellLiteral(dbPath)}'
$password = '${escapePowerShellLiteral(password)}'
$cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath;Jet OLEDB:Database Password=$password;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($cs)
$conn.Open()
try {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = @"
${sql}
"@
  $reader = $cmd.ExecuteReader()
  $rows = New-Object System.Collections.ArrayList
  $cols = @()
  for ($i = 0; $i -lt $reader.FieldCount; $i++) { $cols += $reader.GetName($i) }
  while ($reader.Read()) {
    $obj = New-Object PSObject
    foreach ($c in $cols) {
      $v = $reader[$c]
      if ($v -is [DBNull]) { $v = $null }
      Add-Member -InputObject $obj -MemberType NoteProperty -Name $c -Value $v
    }
    [void]$rows.Add($obj)
  }
  $reader.Close()
  @($rows) | ConvertTo-Json -Depth 6 -Compress
} finally {
  $conn.Close()
}
`;
}

/// Enumerate user tables in an .MDB file via GetOleDbSchemaTable. Returns table names only.
/// Filters out system tables (MSys*) and access views; everything else is returned.
export function buildListTablesScript(dbPath: string, password: string): string {
  return `
$ErrorActionPreference = 'Stop'
$dbPath = '${escapePowerShellLiteral(dbPath)}'
$password = '${escapePowerShellLiteral(password)}'
$cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath;Jet OLEDB:Database Password=$password;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($cs)
$conn.Open()
try {
  # No TABLE_TYPE restriction — some providers/MDBs label user tables with types
  # other than 'TABLE' (e.g. 'PASS-THROUGH' or blank). Filter client-side instead.
  $schema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Tables, $null)
  $names = @()
  foreach ($row in $schema.Rows) {
    $name = [string]$row['TABLE_NAME']
    $type = [string]$row['TABLE_TYPE']
    if ($name -like 'MSys*') { continue }
    if ($name -like '~*') { continue }
    if ($type -eq 'VIEW') { continue }
    if ($type -eq 'SYSTEM TABLE') { continue }
    if ($type -eq 'ACCESS TABLE') { continue }
    $names += $name
  }
  # '-InputObject' preserves array wrapping across 0, 1, and 2+ element arrays.
  # Piping via '| ConvertTo-Json' unwraps single-element arrays into scalars,
  # and the ',$names' trick produces a nested array for 2+ elements.
  ConvertTo-Json -InputObject $names -Compress
} finally {
  $conn.Close()
}
`;
}

/// Enumerate columns of a single table. Returns objects with name + type + nullable.
export function buildListColumnsScript(dbPath: string, password: string, tableName: string): string {
  return `
$ErrorActionPreference = 'Stop'
$dbPath = '${escapePowerShellLiteral(dbPath)}'
$password = '${escapePowerShellLiteral(password)}'
$table = '${escapePowerShellLiteral(tableName)}'
$cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath;Jet OLEDB:Database Password=$password;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($cs)
$conn.Open()
try {
  $schema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Columns, @($null, $null, $table, $null))
  $cols = New-Object System.Collections.ArrayList
  foreach ($row in $schema.Rows) {
    $obj = [PSCustomObject]@{
      name     = [string]$row['COLUMN_NAME']
      ordinal  = [int]$row['ORDINAL_POSITION']
      dataType = [int]$row['DATA_TYPE']
      nullable = [bool]$row['IS_NULLABLE']
    }
    [void]$cols.Add($obj)
  }
  @($cols) | Sort-Object -Property ordinal | ConvertTo-Json -Depth 4 -Compress
} finally {
  $conn.Close()
}
`;
}

// ─────────────────────── Parameterized query + write helpers ──────────────

/**
 * A typed parameter for OLE DB positional `?` placeholders. Order in the array
 * matches order of `?` in the SQL. The type hint drives PowerShell's coercion
 * into an OleDbParameter with the right OleDbType — critical for Access, which
 * is strict about numeric vs. text literals in WHERE clauses.
 */
export type AccessParamType =
  | 'string'
  | 'integer'
  | 'long'
  | 'decimal'
  | 'double'
  | 'boolean'
  | 'date'
  | 'null';

export interface AccessParam {
  value: string | number | boolean | Date | null;
  type: AccessParamType;
}

export interface AccessWriteOperation {
  sql: string;
  params: AccessParam[];
}

export interface AccessQueryResult<Row> {
  rows: Row[];
}

export interface AccessNonQueryResult {
  rowsAffected: number;
}

export interface AccessTransactionResult {
  rowsAffected: number[];
}

const PARAM_SCRIPT_PROLOGUE = `
function New-OleDbParam([string]$type, $value) {
  $p = New-Object System.Data.OleDb.OleDbParameter
  switch ($type) {
    'string'   { $p.OleDbType = [System.Data.OleDb.OleDbType]::VarWChar;  $p.Value = if ($null -eq $value) { [DBNull]::Value } else { [string]$value } }
    'integer'  { $p.OleDbType = [System.Data.OleDb.OleDbType]::SmallInt;  $p.Value = if ($null -eq $value) { [DBNull]::Value } else { [int16]$value } }
    'long'     { $p.OleDbType = [System.Data.OleDb.OleDbType]::Integer;   $p.Value = if ($null -eq $value) { [DBNull]::Value } else { [int32]$value } }
    'decimal'  { $p.OleDbType = [System.Data.OleDb.OleDbType]::Decimal;   $p.Value = if ($null -eq $value) { [DBNull]::Value } else { [decimal]$value } }
    'double'   { $p.OleDbType = [System.Data.OleDb.OleDbType]::Double;    $p.Value = if ($null -eq $value) { [DBNull]::Value } else { [double]$value } }
    'boolean'  { $p.OleDbType = [System.Data.OleDb.OleDbType]::Boolean;   $p.Value = if ($null -eq $value) { [DBNull]::Value } else { [bool]$value } }
    'date'     { $p.OleDbType = [System.Data.OleDb.OleDbType]::Date;      $p.Value = if ($null -eq $value) { [DBNull]::Value } else { [datetime]$value } }
    'null'     { $p.OleDbType = [System.Data.OleDb.OleDbType]::VarWChar;  $p.Value = [DBNull]::Value }
    default    { throw "Unknown AccessParamType: $type" }
  }
  return $p
}
`;

function serializeParamsForPowerShell(params: AccessParam[]): string {
  const lines: string[] = [];
  params.forEach((p, i) => {
    const varName = `$p${i}`;
    const type = p.type;
    let literal: string;
    if (p.value === null || type === 'null') {
      literal = '$null';
    } else if (type === 'boolean') {
      literal = p.value === true ? '$true' : '$false';
    } else if (type === 'date') {
      const iso = p.value instanceof Date ? p.value.toISOString() : String(p.value);
      literal = `[datetime]'${escapePowerShellLiteral(iso)}'`;
    } else if (type === 'string') {
      literal = `'${escapePowerShellLiteral(String(p.value))}'`;
    } else {
      // numeric types — inline as raw, no quoting. Reject any char that could break out.
      const raw = String(p.value);
      if (!/^-?\d+(\.\d+)?$/.test(raw)) {
        throw new Error(`Non-numeric value passed with numeric type ${type}: ${raw}`);
      }
      literal = raw;
    }
    lines.push(`${varName} = ${literal}`);
    lines.push(`$cmd.Parameters.Add((New-OleDbParam '${type}' ${varName})) | Out-Null`);
  });
  return lines.join('\n');
}

function buildQueryScript(
  dbPath: string,
  password: string,
  sql: string,
  params: AccessParam[]
): string {
  return `
$ErrorActionPreference = 'Stop'
${PARAM_SCRIPT_PROLOGUE}
$dbPath = '${escapePowerShellLiteral(dbPath)}'
$password = '${escapePowerShellLiteral(password)}'
$cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath;Jet OLEDB:Database Password=$password;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($cs)
$conn.Open()
try {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = @"
${sql}
"@
  ${serializeParamsForPowerShell(params)}
  $reader = $cmd.ExecuteReader()
  $rows = New-Object System.Collections.ArrayList
  $cols = @()
  for ($i = 0; $i -lt $reader.FieldCount; $i++) { $cols += $reader.GetName($i) }
  while ($reader.Read()) {
    $obj = New-Object PSObject
    foreach ($c in $cols) {
      $v = $reader[$c]
      if ($v -is [DBNull]) { $v = $null }
      Add-Member -InputObject $obj -MemberType NoteProperty -Name $c -Value $v
    }
    [void]$rows.Add($obj)
  }
  $reader.Close()
  @{ rows = @($rows) } | ConvertTo-Json -Depth 6 -Compress
} finally {
  $conn.Close()
}
`;
}

function buildNonQueryScript(
  dbPath: string,
  password: string,
  sql: string,
  params: AccessParam[]
): string {
  return `
$ErrorActionPreference = 'Stop'
${PARAM_SCRIPT_PROLOGUE}
$dbPath = '${escapePowerShellLiteral(dbPath)}'
$password = '${escapePowerShellLiteral(password)}'
$cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath;Jet OLEDB:Database Password=$password;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($cs)
$conn.Open()
try {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = @"
${sql}
"@
  ${serializeParamsForPowerShell(params)}
  $n = $cmd.ExecuteNonQuery()
  @{ rowsAffected = $n } | ConvertTo-Json -Compress
} finally {
  $conn.Close()
}
`;
}

function buildTransactionScript(
  dbPath: string,
  password: string,
  operations: AccessWriteOperation[]
): string {
  const opBlocks = operations
    .map((op, i) => {
      const paramBlock = serializeParamsForPowerShell(op.params);
      return `
  $cmd = $conn.CreateCommand()
  $cmd.Transaction = $tx
  $cmd.CommandText = @"
${op.sql}
"@
  ${paramBlock}
  $n${i} = $cmd.ExecuteNonQuery()
  [void]$results.Add($n${i})
`;
    })
    .join('');

  return `
$ErrorActionPreference = 'Stop'
${PARAM_SCRIPT_PROLOGUE}
$dbPath = '${escapePowerShellLiteral(dbPath)}'
$password = '${escapePowerShellLiteral(password)}'
$cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath;Jet OLEDB:Database Password=$password;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($cs)
$conn.Open()
$tx = $conn.BeginTransaction()
$results = New-Object System.Collections.ArrayList
try {
${opBlocks}
  $tx.Commit()
  @{ rowsAffected = @($results) } | ConvertTo-Json -Compress
} catch {
  try { $tx.Rollback() } catch {}
  throw
} finally {
  $conn.Close()
}
`;
}

/**
 * Parameterized SELECT. Use this for any read that takes user-supplied values
 * (SKU code, UPC, vendor ID, date range). Always prefer this over buildSelectScript
 * + runPowerShellJson for new code.
 */
export async function executeQuery<Row>(
  dbPath: string,
  password: string,
  sql: string,
  params: AccessParam[] = []
): Promise<Row[]> {
  const script = buildQueryScript(dbPath, password, sql, params);
  const result = await runPowerShellJson<AccessQueryResult<Row>>(script);
  // Null-safe against empty result — runPowerShellJson returns [] when stdout is empty.
  if (Array.isArray(result)) return [];
  return result.rows ?? [];
}

/**
 * Parameterized INSERT / UPDATE / DELETE. Returns the number of affected rows.
 * Never inline user values into the SQL — always pass them as AccessParam entries.
 */
export async function executeNonQuery(
  dbPath: string,
  password: string,
  sql: string,
  params: AccessParam[] = []
): Promise<number> {
  const script = buildNonQueryScript(dbPath, password, sql, params);
  const result = await runPowerShellJson<AccessNonQueryResult>(script);
  if (Array.isArray(result)) return 0;
  return result.rowsAffected ?? 0;
}

/**
 * Run multiple parameterized writes inside one OLE DB transaction. All operations
 * commit together, or roll back together. Use for anything that touches multiple
 * tables (Discontinue SKU, bulk price-discount commit, GMAIC import, UPC generate).
 *
 * Returns rowsAffected per operation in the same order as the input.
 */
export async function executeTransaction(
  dbPath: string,
  password: string,
  operations: AccessWriteOperation[]
): Promise<number[]> {
  if (operations.length === 0) return [];
  const script = buildTransactionScript(dbPath, password, operations);
  const result = await runPowerShellJson<AccessTransactionResult>(script);
  if (Array.isArray(result)) return [];
  return result.rowsAffected ?? [];
}

// ─────────────────────── Jet password recovery ────────────────────────────

function recoverJetMdbPassword(dbPath: string): string {
  const header = readFileHead(dbPath, 0x1000);
  const version = header[0x14];
  if (version === 0) {
    decryptStage1(header, 0x18, 0x7e);
    return extractPassword(header, 0x42, 20, 1);
  }
  decryptStage1(header, 0x18, 0x80);
  decryptStage2(header, 0x42);
  return extractPassword(header, 0x42, 20, 2);
}

function decryptStage1(buffer: Buffer, offset: number, length: number): void {
  const state = Buffer.from(INIT_KEY.slice(6));
  let bl = INIT_KEY[4] & 0xff;
  let dl = INIT_KEY[5] & 0xff;
  bl = (bl + 1) & 0xff;
  let cl = state[bl];
  for (let i = 0; i < length; i += 1) {
    dl = (dl + cl) & 0xff;
    const ch = buffer[offset + i];
    const al = state[dl];
    state[dl] = cl;
    state[bl] = al;
    const nextAl = (al + cl) & 0xff;
    bl = (bl + 1) & 0xff;
    buffer[offset + i] = ch ^ state[nextAl];
    cl = state[bl];
  }
}

function decryptStage2(buffer: Buffer, offset: number): void {
  const factor = Math.floor(buffer.readDoubleLE(0x72)) >>> 0;
  for (let i = 0; i < 10; i += 1) {
    const ptr = offset + i * 4;
    const current = buffer.readUInt32LE(ptr);
    buffer.writeUInt32LE((current ^ factor) >>> 0, ptr);
  }
}

function extractPassword(buffer: Buffer, startOffset: number, maxChars: number, step: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < maxChars; i += 1) {
    const value = buffer[startOffset + i * step];
    if (value === 0) break;
    bytes.push(value);
  }
  return Buffer.from(bytes).toString('latin1');
}

function readFileHead(filePath: string, length: number): Buffer {
  const fd = fs.openSync(filePath, 'r');
  try {
    const out = Buffer.alloc(length);
    fs.readSync(fd, out, 0, length, 0);
    return out;
  } finally {
    fs.closeSync(fd);
  }
}
