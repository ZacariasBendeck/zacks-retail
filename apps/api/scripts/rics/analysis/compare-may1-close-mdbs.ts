import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  CANONICAL_MDBS,
  toSnakeCase,
} from '../../../src/services/sync/canonicalRicsTables';
import {
  escapePowerShellLiteral,
  getOrRecoverPassword,
} from '../../../src/services/accessOleDb';

const DEFAULT_BEFORE_ROOT = 'E:/data/rics-mdbs/May_1_before_close/RICSDATA';
const DEFAULT_AFTER_ROOT = 'E:/data/rics-mdbs/May_1_after_close/RICSDATA (1)';
const DEFAULT_OUT_DIR = path.resolve(process.cwd(), '../../outputs/rics-mdb-diff/may-1-close');
const DEFAULT_DEEP_MAX_BYTES = 50 * 1024 * 1024;

interface Args {
  beforeRoot: string;
  afterRoot: string;
  outDir: string;
  includeContentForIdenticalMdbs: boolean;
  deepMaxBytes: number;
}

interface MdbInventoryRow {
  file_name: string;
  canonical: string;
  before_present: string;
  after_present: string;
  before_path: string;
  after_path: string;
  before_size: string;
  after_size: string;
  before_last_write_time: string;
  after_last_write_time: string;
  before_sha256: string;
  after_sha256: string;
  file_status: string;
}

interface CanonicalSource {
  sourceMdbFile: string;
  sourceTable: string;
  targetTable: string;
}

interface ColumnInfo {
  name: string;
  ordinal: number;
  dataType: number;
  nullable: boolean;
}

interface TableSummaryResult {
  tableName: string;
  rowCount: number;
  schemaHash: string;
  contentHash: string;
  columns: ColumnInfo[];
  keyKind: string;
  keyColumns: string[];
}

interface TableSummaryRow {
  source_mdb_file: string;
  source_table: string;
  target_table: string;
  mdb_file_status: string;
  before_row_count: string;
  after_row_count: string;
  row_delta: string;
  before_schema_hash: string;
  after_schema_hash: string;
  before_content_hash: string;
  after_content_hash: string;
  diff_status: string;
  key_kind: string;
  key_columns: string;
  detail_file: string;
  error: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    beforeRoot: DEFAULT_BEFORE_ROOT,
    afterRoot: DEFAULT_AFTER_ROOT,
    outDir: DEFAULT_OUT_DIR,
    includeContentForIdenticalMdbs: false,
    deepMaxBytes: DEFAULT_DEEP_MAX_BYTES,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--before') args.beforeRoot = path.resolve(String(argv[++i] ?? ''));
    else if (arg === '--after') args.afterRoot = path.resolve(String(argv[++i] ?? ''));
    else if (arg === '--out') args.outDir = path.resolve(String(argv[++i] ?? ''));
    else if (arg === '--full-content') args.includeContentForIdenticalMdbs = true;
    else if (arg === '--deep-max-mb') args.deepMaxBytes = Number(String(argv[++i] ?? '0')) * 1024 * 1024;
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: compare-may1-close-mdbs [options]',
        '',
        'Options:',
        '  --before <dir>       Before-close RICSDATA directory',
        '  --after <dir>        After-close RICSDATA directory',
        '  --out <dir>          Output directory',
        '  --full-content       Full row content hashes even when MDB file hashes match',
        '  --deep-max-mb <n>    Max changed MDB size for full content/key diff (default: 50)',
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function sha256File(filePath: string): string {
  const hash = createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1 << 20);
  try {
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function listMdbs(root: string): Map<string, fs.Stats & { fullPath: string; name: string }> {
  const out = new Map<string, fs.Stats & { fullPath: string; name: string }>();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.mdb$/i.test(entry.name)) continue;
    const fullPath = path.join(root, entry.name);
    const stat = fs.statSync(fullPath) as fs.Stats & { fullPath: string; name: string };
    stat.fullPath = fullPath;
    stat.name = entry.name;
    out.set(entry.name.toUpperCase(), stat);
  }
  return out;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (!/[",\r\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function writeCsv(filePath: string, rows: Record<string, unknown>[], preferredColumns?: string[]): void {
  const columns = preferredColumns ?? Object.keys(rows[0] ?? {});
  const lines = [
    columns.map(csvEscape).join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function canonicalSources(): CanonicalSource[] {
  return CANONICAL_MDBS.flatMap((mdb) =>
    mdb.tables.map((table) => ({
      sourceMdbFile: mdb.file,
      sourceTable: table,
      targetTable: toSnakeCase(table),
    })),
  );
}

function canonicalFileSet(): Set<string> {
  return new Set(CANONICAL_MDBS.map((entry) => entry.file.toUpperCase()));
}

function buildInventory(args: Args): MdbInventoryRow[] {
  const canonical = canonicalFileSet();
  const before = listMdbs(args.beforeRoot);
  const after = listMdbs(args.afterRoot);
  const names = [...new Set([...before.keys(), ...after.keys()])].sort();
  const rows: MdbInventoryRow[] = [];

  for (const name of names) {
    const b = before.get(name);
    const a = after.get(name);
    const beforeSha = b ? sha256File(b.fullPath) : '';
    const afterSha = a ? sha256File(a.fullPath) : '';
    let fileStatus = 'same';
    if (!b) fileStatus = 'only_after';
    else if (!a) fileStatus = 'only_before';
    else if (beforeSha !== afterSha && b.size !== a.size) fileStatus = 'size_and_hash_differ';
    else if (beforeSha !== afterSha) fileStatus = 'hash_differ';
    else if (b.size !== a.size) fileStatus = 'size_differ';

    rows.push({
      file_name: b?.name ?? a?.name ?? name,
      canonical: canonical.has(name) ? 'yes' : 'no',
      before_present: b ? 'yes' : 'no',
      after_present: a ? 'yes' : 'no',
      before_path: b?.fullPath ?? '',
      after_path: a?.fullPath ?? '',
      before_size: b ? String(b.size) : '',
      after_size: a ? String(a.size) : '',
      before_last_write_time: b ? b.mtime.toISOString() : '',
      after_last_write_time: a ? a.mtime.toISOString() : '',
      before_sha256: beforeSha,
      after_sha256: afterSha,
      file_status: fileStatus,
    });
  }
  return rows;
}

function inventoryByName(rows: MdbInventoryRow[]): Map<string, MdbInventoryRow> {
  const out = new Map<string, MdbInventoryRow>();
  for (const row of rows) out.set(row.file_name.toUpperCase(), row);
  return out;
}

function writeHelperScript(outDir: string): string {
  const helperPath = path.join(outDir, 'mdb-compare-helper.ps1');
  fs.writeFileSync(helperPath, String.raw`
param(
  [Parameter(Mandatory=$true)] [string] $Mode,
  [Parameter(Mandatory=$true)] [string] $DbPath,
  [Parameter(Mandatory=$true)] [string] $Password,
  [Parameter(Mandatory=$true)] [string] $TableName,
  [string] $AfterDbPath = '',
  [string] $AfterPassword = '',
  [string] $KeyColumns = '',
  [string] $OutputCsv = '',
  [string] $ComputeContent = 'false'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -ReferencedAssemblies 'System.Data','System.Xml' -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.OleDb;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

public static class RicsMdbCompare {
  sealed class ColumnInfo {
    public string Name = "";
    public int Ordinal;
    public int DataType;
    public bool Nullable;
  }

  sealed class KeyChoice {
    public string Kind = "none";
    public List<string> Columns = new List<string>();
  }

  sealed class RowSig {
    public string KeyJson = "[]";
    public string RowHash = "";
    public string[] ColHashes = new string[0];
  }

  public static string Summarize(string dbPath, string password, string tableName, bool computeContent) {
    using (var conn = Open(dbPath, password)) {
      var columns = GetColumns(conn, tableName);
      var key = ChooseKey(conn, tableName);
      long rowCount = 0;
      string contentHash = computeContent ? ComputeContentHash(conn, tableName, columns, out rowCount) : CountRows(conn, tableName).ToString(CultureInfo.InvariantCulture);
      if (!computeContent) rowCount = long.Parse(contentHash, CultureInfo.InvariantCulture);
      string schemaHash = SchemaHash(columns);

      var sb = new StringBuilder();
      sb.Append("{");
      JsonProp(sb, "tableName", tableName); sb.Append(",");
      sb.Append("\"rowCount\":").Append(rowCount.ToString(CultureInfo.InvariantCulture)).Append(",");
      JsonProp(sb, "schemaHash", schemaHash); sb.Append(",");
      JsonProp(sb, "contentHash", computeContent ? contentHash : "not_scanned"); sb.Append(",");
      sb.Append("\"columns\":[");
      for (int i = 0; i < columns.Count; i++) {
        if (i > 0) sb.Append(",");
        sb.Append("{");
        JsonProp(sb, "name", columns[i].Name); sb.Append(",");
        sb.Append("\"ordinal\":").Append(columns[i].Ordinal).Append(",");
        sb.Append("\"dataType\":").Append(columns[i].DataType).Append(",");
        sb.Append("\"nullable\":").Append(columns[i].Nullable ? "true" : "false");
        sb.Append("}");
      }
      sb.Append("],");
      JsonProp(sb, "keyKind", key.Kind); sb.Append(",");
      sb.Append("\"keyColumns\":[");
      for (int i = 0; i < key.Columns.Count; i++) {
        if (i > 0) sb.Append(",");
        JsonString(sb, key.Columns[i]);
      }
      sb.Append("]}");
      return sb.ToString();
    }
  }

  public static string Detail(string beforeDbPath, string beforePassword, string afterDbPath, string afterPassword, string tableName, string keyColumnsCsv, string outputCsv) {
    var keyColumns = keyColumnsCsv.Split(new[]{','}, StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()).Where(s => s.Length > 0).ToList();
    Directory.CreateDirectory(Path.GetDirectoryName(outputCsv));
    if (keyColumns.Count == 0) return DetailUnkeyed(beforeDbPath, beforePassword, afterDbPath, afterPassword, tableName, outputCsv);
    return DetailKeyed(beforeDbPath, beforePassword, afterDbPath, afterPassword, tableName, keyColumns, outputCsv);
  }

  static string DetailKeyed(string beforeDbPath, string beforePassword, string afterDbPath, string afterPassword, string tableName, List<string> keyColumns, string outputCsv) {
    long added = 0, deleted = 0, changed = 0;
    using (var beforeConn = Open(beforeDbPath, beforePassword))
    using (var afterConn = Open(afterDbPath, afterPassword))
    using (var writer = new StreamWriter(outputCsv, false, new UTF8Encoding(false))) {
      var beforeCols = GetColumns(beforeConn, tableName);
      var afterCols = GetColumns(afterConn, tableName);
      var commonCols = beforeCols.Select(c => c.Name).Where(n => afterCols.Any(a => SameName(a.Name, n))).ToList();
      writer.WriteLine("diff_type,key_columns,key_values_json,before_row_hash,after_row_hash,changed_columns");

      var before = new Dictionary<string, RowSig>(StringComparer.Ordinal);
      foreach (var sig in ReadRowSigs(beforeConn, tableName, beforeCols, keyColumns)) {
        if (before.ContainsKey(sig.KeyJson)) throw new Exception("Duplicate key in before table " + tableName + ": " + sig.KeyJson);
        before.Add(sig.KeyJson, sig);
      }

      foreach (var afterSig in ReadRowSigs(afterConn, tableName, afterCols, keyColumns)) {
        RowSig beforeSig;
        if (!before.TryGetValue(afterSig.KeyJson, out beforeSig)) {
          added++;
          WriteCsv(writer, new[]{"added", string.Join("|", keyColumns), afterSig.KeyJson, "", afterSig.RowHash, ""});
          continue;
        }
        before.Remove(afterSig.KeyJson);
        if (beforeSig.RowHash != afterSig.RowHash) {
          changed++;
          var changedColumns = new List<string>();
          int max = Math.Min(beforeSig.ColHashes.Length, afterSig.ColHashes.Length);
          for (int i = 0; i < max && i < commonCols.Count; i++) {
            if (beforeSig.ColHashes[i] != afterSig.ColHashes[i]) changedColumns.Add(commonCols[i]);
          }
          WriteCsv(writer, new[]{"changed", string.Join("|", keyColumns), afterSig.KeyJson, beforeSig.RowHash, afterSig.RowHash, string.Join("|", changedColumns)});
        }
      }

      foreach (var pair in before) {
        deleted++;
        WriteCsv(writer, new[]{"deleted", string.Join("|", keyColumns), pair.Value.KeyJson, pair.Value.RowHash, "", ""});
      }
    }
    return "{\"added\":" + added + ",\"deleted\":" + deleted + ",\"changed\":" + changed + "}";
  }

  static string DetailUnkeyed(string beforeDbPath, string beforePassword, string afterDbPath, string afterPassword, string tableName, string outputCsv) {
    long added = 0, deleted = 0;
    using (var beforeConn = Open(beforeDbPath, beforePassword))
    using (var afterConn = Open(afterDbPath, afterPassword))
    using (var writer = new StreamWriter(outputCsv, false, new UTF8Encoding(false))) {
      writer.WriteLine("diff_type,row_hash,before_count,after_count");
      var beforeCols = GetColumns(beforeConn, tableName);
      var afterCols = GetColumns(afterConn, tableName);
      var before = ReadRowHashCounts(beforeConn, tableName, beforeCols);
      var after = ReadRowHashCounts(afterConn, tableName, afterCols);
      foreach (var pair in after) {
        long b = before.ContainsKey(pair.Key) ? before[pair.Key] : 0;
        if (pair.Value > b) {
          added += pair.Value - b;
          WriteCsv(writer, new[]{"added", pair.Key, b.ToString(CultureInfo.InvariantCulture), pair.Value.ToString(CultureInfo.InvariantCulture)});
        }
        before.Remove(pair.Key);
      }
      foreach (var pair in before) {
        deleted += pair.Value;
        WriteCsv(writer, new[]{"deleted", pair.Key, pair.Value.ToString(CultureInfo.InvariantCulture), "0"});
      }
    }
    return "{\"added\":" + added + ",\"deleted\":" + deleted + ",\"changed\":0}";
  }

  static OleDbConnection Open(string dbPath, string password) {
    var cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + dbPath
      + ";Jet OLEDB:Database Password=" + password
      + ";Persist Security Info=False;";
    var conn = new OleDbConnection(cs);
    conn.Open();
    return conn;
  }

  static long CountRows(OleDbConnection conn, string tableName) {
    using (var cmd = conn.CreateCommand()) {
      cmd.CommandText = "SELECT COUNT(*) FROM [" + tableName.Replace("]", "]]") + "]";
      return Convert.ToInt64(cmd.ExecuteScalar(), CultureInfo.InvariantCulture);
    }
  }

  static List<ColumnInfo> GetColumns(OleDbConnection conn, string tableName) {
    var columns = new List<ColumnInfo>();
    var schema = conn.GetOleDbSchemaTable(OleDbSchemaGuid.Columns, new object[]{null, null, tableName, null});
    foreach (DataRow row in schema.Rows) {
      columns.Add(new ColumnInfo {
        Name = Convert.ToString(row["COLUMN_NAME"], CultureInfo.InvariantCulture),
        Ordinal = Convert.ToInt32(row["ORDINAL_POSITION"], CultureInfo.InvariantCulture),
        DataType = Convert.ToInt32(row["DATA_TYPE"], CultureInfo.InvariantCulture),
        Nullable = row.Table.Columns.Contains("IS_NULLABLE") && Convert.ToBoolean(row["IS_NULLABLE"], CultureInfo.InvariantCulture)
      });
    }
    columns.Sort((a, b) => a.Ordinal.CompareTo(b.Ordinal));
    return columns;
  }

  static KeyChoice ChooseKey(OleDbConnection conn, string tableName) {
    var schema = conn.GetOleDbSchemaTable(OleDbSchemaGuid.Indexes, null);
    var groups = new Dictionary<string, List<DataRow>>(StringComparer.OrdinalIgnoreCase);
    foreach (DataRow row in schema.Rows) {
      if (!SameName(Convert.ToString(row["TABLE_NAME"], CultureInfo.InvariantCulture), tableName)) continue;
      var indexName = Convert.ToString(row["INDEX_NAME"], CultureInfo.InvariantCulture);
      if (string.IsNullOrWhiteSpace(indexName)) continue;
      if (!groups.ContainsKey(indexName)) groups[indexName] = new List<DataRow>();
      groups[indexName].Add(row);
    }

    foreach (var preferredPrimary in new[]{true, false}) {
      foreach (var pair in groups.OrderBy(p => p.Key, StringComparer.OrdinalIgnoreCase)) {
        var rows = pair.Value.OrderBy(r => Convert.ToInt32(r["ORDINAL_POSITION"], CultureInfo.InvariantCulture)).ToList();
        bool primary = rows.All(r => ToBool(r["PRIMARY_KEY"]));
        bool unique = rows.All(r => ToBool(r["UNIQUE"]));
        if (preferredPrimary && (!primary || !unique)) continue;
        if (!preferredPrimary && (primary || !unique)) continue;
        var cols = rows.Select(r => Convert.ToString(r["COLUMN_NAME"], CultureInfo.InvariantCulture)).Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
        if (cols.Count == 0) continue;
        return new KeyChoice { Kind = primary ? "primary" : "unique", Columns = cols };
      }
    }
    return new KeyChoice();
  }

  static string ComputeContentHash(OleDbConnection conn, string tableName, List<ColumnInfo> columns, out long rowCount) {
    rowCount = 0;
    ulong[] sums = new ulong[4];
    ulong[] xors = new ulong[4];
    using (var cmd = conn.CreateCommand()) {
      cmd.CommandText = "SELECT * FROM [" + tableName.Replace("]", "]]") + "]";
      cmd.CommandTimeout = 0;
      using (var reader = cmd.ExecuteReader()) {
        while (reader.Read()) {
          string[] ignored;
          var rowHash = HashRow(reader, columns, out ignored);
          var bytes = HexToBytes(rowHash);
          for (int i = 0; i < 4; i++) {
            ulong part = BitConverter.ToUInt64(bytes, i * 8);
            sums[i] += part;
            xors[i] ^= part;
          }
          rowCount++;
        }
      }
    }
    var material = "rows=" + rowCount.ToString(CultureInfo.InvariantCulture)
      + "|sum=" + string.Join(",", sums.Select(v => v.ToString("x16", CultureInfo.InvariantCulture)))
      + "|xor=" + string.Join(",", xors.Select(v => v.ToString("x16", CultureInfo.InvariantCulture)));
    return Sha256Hex(Encoding.UTF8.GetBytes(material));
  }

  static IEnumerable<RowSig> ReadRowSigs(OleDbConnection conn, string tableName, List<ColumnInfo> columns, List<string> keyColumns) {
    using (var cmd = conn.CreateCommand()) {
      cmd.CommandText = "SELECT * FROM [" + tableName.Replace("]", "]]") + "]";
      cmd.CommandTimeout = 0;
      using (var reader = cmd.ExecuteReader()) {
        while (reader.Read()) {
          string[] colHashes;
          var rowHash = HashRow(reader, columns, out colHashes);
          var keyValues = new List<string>();
          foreach (var keyColumn in keyColumns) {
            int ordinal = FindOrdinal(reader, keyColumn);
            keyValues.Add(CanonicalValue(reader.GetValue(ordinal)));
          }
          var keyJson = JsonArray(keyValues);
          yield return new RowSig { KeyJson = keyJson, RowHash = rowHash, ColHashes = colHashes };
        }
      }
    }
  }

  static Dictionary<string, long> ReadRowHashCounts(OleDbConnection conn, string tableName, List<ColumnInfo> columns) {
    var outMap = new Dictionary<string, long>(StringComparer.Ordinal);
    using (var cmd = conn.CreateCommand()) {
      cmd.CommandText = "SELECT * FROM [" + tableName.Replace("]", "]]") + "]";
      cmd.CommandTimeout = 0;
      using (var reader = cmd.ExecuteReader()) {
        while (reader.Read()) {
          string[] colHashes;
          var rowHash = HashRow(reader, columns, out colHashes);
          outMap[rowHash] = outMap.ContainsKey(rowHash) ? outMap[rowHash] + 1 : 1;
        }
      }
    }
    return outMap;
  }

  static string HashRow(OleDbDataReader reader, List<ColumnInfo> columns, out string[] colHashes) {
    colHashes = new string[columns.Count];
    using (var sha = SHA256.Create()) {
      for (int i = 0; i < columns.Count; i++) {
        var value = reader.GetValue(i);
        var material = columns[i].Name + "\u0000" + CanonicalValue(value);
        var bytes = Encoding.UTF8.GetBytes(material);
        var len = BitConverter.GetBytes(bytes.Length);
        sha.TransformBlock(len, 0, len.Length, null, 0);
        sha.TransformBlock(bytes, 0, bytes.Length, null, 0);
        colHashes[i] = Sha256Hex(bytes);
      }
      sha.TransformFinalBlock(new byte[0], 0, 0);
      return BytesToHex(sha.Hash);
    }
  }

  static string CanonicalValue(object value) {
    if (value == null || value is DBNull) return "N:";
    if (value is DateTime) return "D:" + ((DateTime)value).ToString("yyyy-MM-ddTHH:mm:ss.fffffff", CultureInfo.InvariantCulture);
    if (value is bool) return "B:" + (((bool)value) ? "1" : "0");
    if (value is byte[]) return "X:" + BytesToHex((byte[])value);
    if (value is float) return "R:" + ((float)value).ToString("R", CultureInfo.InvariantCulture);
    if (value is double) return "R:" + ((double)value).ToString("R", CultureInfo.InvariantCulture);
    if (value is decimal) return "M:" + ((decimal)value).ToString(CultureInfo.InvariantCulture);
    if (value is IFormattable) return "V:" + ((IFormattable)value).ToString(null, CultureInfo.InvariantCulture);
    return "S:" + value.ToString();
  }

  static string SchemaHash(List<ColumnInfo> columns) {
    var material = string.Join("\n", columns.Select(c => c.Ordinal.ToString(CultureInfo.InvariantCulture) + "|" + c.Name + "|" + c.DataType.ToString(CultureInfo.InvariantCulture) + "|" + (c.Nullable ? "1" : "0")));
    return Sha256Hex(Encoding.UTF8.GetBytes(material));
  }

  static int FindOrdinal(OleDbDataReader reader, string columnName) {
    for (int i = 0; i < reader.FieldCount; i++) if (SameName(reader.GetName(i), columnName)) return i;
    throw new Exception("Key column not found: " + columnName);
  }

  static bool SameName(string a, string b) {
    return string.Equals(a ?? "", b ?? "", StringComparison.OrdinalIgnoreCase);
  }

  static bool ToBool(object value) {
    if (value == null || value is DBNull) return false;
    return Convert.ToBoolean(value, CultureInfo.InvariantCulture);
  }

  static string Sha256Hex(byte[] bytes) {
    using (var sha = SHA256.Create()) return BytesToHex(sha.ComputeHash(bytes));
  }

  static byte[] HexToBytes(string hex) {
    var bytes = new byte[hex.Length / 2];
    for (int i = 0; i < bytes.Length; i++) bytes[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
    return bytes;
  }

  static string BytesToHex(byte[] bytes) {
    var sb = new StringBuilder(bytes.Length * 2);
    foreach (var b in bytes) sb.Append(b.ToString("x2", CultureInfo.InvariantCulture));
    return sb.ToString();
  }

  static string JsonArray(List<string> values) {
    var sb = new StringBuilder();
    sb.Append("[");
    for (int i = 0; i < values.Count; i++) {
      if (i > 0) sb.Append(",");
      JsonString(sb, values[i]);
    }
    sb.Append("]");
    return sb.ToString();
  }

  static void JsonProp(StringBuilder sb, string name, string value) {
    JsonString(sb, name);
    sb.Append(":");
    JsonString(sb, value);
  }

  static void JsonString(StringBuilder sb, string value) {
    sb.Append("\"");
    foreach (var ch in value ?? "") {
      if (ch == '\\') sb.Append("\\\\");
      else if (ch == '"') sb.Append("\\\"");
      else if (ch == '\n') sb.Append("\\n");
      else if (ch == '\r') sb.Append("\\r");
      else if (ch == '\t') sb.Append("\\t");
      else if (char.IsControl(ch)) sb.Append("\\u").Append(((int)ch).ToString("x4", CultureInfo.InvariantCulture));
      else sb.Append(ch);
    }
    sb.Append("\"");
  }

  static void WriteCsv(StreamWriter writer, string[] fields) {
    for (int i = 0; i < fields.Length; i++) {
      if (i > 0) writer.Write(",");
      var s = fields[i] ?? "";
      bool quote = s.IndexOfAny(new[]{',','"','\n','\r'}) >= 0;
      if (quote) writer.Write("\"");
      foreach (var ch in s) {
        if (ch == '"') writer.Write("\"\"");
        else writer.Write(ch);
      }
      if (quote) writer.Write("\"");
    }
    writer.WriteLine();
  }
}
"@

if ($Mode -eq 'summary') {
  [RicsMdbCompare]::Summarize($DbPath, $Password, $TableName, [System.Convert]::ToBoolean($ComputeContent))
} elseif ($Mode -eq 'detail') {
  [RicsMdbCompare]::Detail($DbPath, $Password, $AfterDbPath, $AfterPassword, $TableName, $KeyColumns, $OutputCsv)
} else {
  throw "Unknown mode: $Mode"
}
`, 'utf8');
  return helperPath;
}

function runPowerShell(args: string[], timeoutMs = 30 * 60 * 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], {
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`PowerShell timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error((stderr || stdout || `PowerShell exited with ${code}`).trim()));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function summarizeTable(args: {
  helperPath: string;
  dbPath: string;
  password: string;
  tableName: string;
  computeContent: boolean;
}): Promise<TableSummaryResult> {
  const stdout = await runPowerShell([
    '-File', args.helperPath,
    '-Mode', 'summary',
    '-DbPath', args.dbPath,
    '-Password', args.password,
    '-TableName', args.tableName,
    '-ComputeContent', String(args.computeContent),
  ]);
  return JSON.parse(stdout) as TableSummaryResult;
}

async function writeDetail(args: {
  helperPath: string;
  beforeDbPath: string;
  beforePassword: string;
  afterDbPath: string;
  afterPassword: string;
  tableName: string;
  keyColumns: string[];
  outputCsv: string;
}): Promise<void> {
  await runPowerShell([
    '-File', args.helperPath,
    '-Mode', 'detail',
    '-DbPath', args.beforeDbPath,
    '-Password', args.beforePassword,
    '-TableName', args.tableName,
    '-AfterDbPath', args.afterDbPath,
    '-AfterPassword', args.afterPassword,
    '-KeyColumns', args.keyColumns.join(','),
    '-OutputCsv', args.outputCsv,
  ], 60 * 60 * 1000);
}

function sourcePath(root: string, file: string): string {
  return path.join(root, file);
}

function makeCanonicalRows(): Record<string, string>[] {
  return canonicalSources().map((source) => ({
    source_mdb_file: source.sourceMdbFile,
    source_table: source.sourceTable,
    target_table: source.targetTable,
  }));
}

function markdownSummary(args: {
  inventory: MdbInventoryRow[];
  tableRows: TableSummaryRow[];
  outDir: string;
  beforeRoot: string;
  afterRoot: string;
  startedAt: Date;
  finishedAt: Date;
}): string {
  const changedFiles = args.inventory.filter((row) => row.file_status !== 'same');
  const canonicalChangedFiles = changedFiles.filter((row) => row.canonical === 'yes');
  const changedTables = args.tableRows.filter((row) => row.diff_status !== 'same' && row.diff_status !== 'same_by_mdb_sha256');
  const erroredTables = args.tableRows.filter((row) => row.error);
  const detailTables = args.tableRows.filter((row) => row.detail_file);
  const skippedDeep = args.tableRows.filter((row) => row.diff_status === 'file_hash_differ_content_not_scanned');

  const lines = [
    '# RICS May 1 Close MDB Difference Report',
    '',
    `Generated: ${args.finishedAt.toISOString()}`,
    '',
    `Before folder: \`${args.beforeRoot}\``,
    `After folder: \`${args.afterRoot}\``,
    `Output folder: \`${args.outDir}\``,
    '',
    '## Summary',
    '',
    `- MDB files inventoried: ${args.inventory.length}`,
    `- Canonical MDB files: ${CANONICAL_MDBS.length}`,
    `- Canonical tables: ${canonicalSources().length}`,
    `- MDB files with raw file differences: ${changedFiles.length}`,
    `- Canonical MDB files with raw file differences: ${canonicalChangedFiles.length}`,
    `- Canonical tables with table-level differences: ${changedTables.length}`,
    `- Detail CSV files written: ${detailTables.length}`,
    `- Large changed tables needing separate deep scan: ${skippedDeep.length}`,
    `- Runtime: ${Math.round((args.finishedAt.getTime() - args.startedAt.getTime()) / 1000)} seconds`,
    '',
    '## Files',
    '',
    '- `canonical_mdbs.csv` - canonical extract/upload MDB and table list',
    '- `all_mdb_inventory.csv` - all before/after MDB presence, size, timestamp, and SHA256 values',
    '- `table_summary.csv` - canonical table counts, schema hashes, content hashes, and statuses',
    '- `details/*.csv` - key-aware or row-hash diff details for changed tables',
    '',
    '## Changed Canonical MDBs',
    '',
  ];

  if (canonicalChangedFiles.length === 0) {
    lines.push('_None._');
  } else {
    lines.push('| MDB | Status | Before bytes | After bytes |');
    lines.push('| --- | --- | ---: | ---: |');
    for (const row of canonicalChangedFiles) {
      lines.push(`| ${row.file_name} | ${row.file_status} | ${row.before_size} | ${row.after_size} |`);
    }
  }

  lines.push('', '## Changed Canonical Tables', '');
  if (changedTables.length === 0) {
    lines.push('_No canonical table content differences found._');
  } else {
    lines.push('| Target table | Source | Status | Before rows | After rows | Detail |');
    lines.push('| --- | --- | --- | ---: | ---: | --- |');
    for (const row of changedTables) {
      lines.push(`| ${row.target_table} | ${row.source_mdb_file}/${row.source_table} | ${row.diff_status} | ${row.before_row_count} | ${row.after_row_count} | ${row.detail_file || ''} |`);
    }
  }

  if (erroredTables.length > 0) {
    lines.push('', '## Errors', '');
    for (const row of erroredTables) {
      lines.push(`- ${row.source_mdb_file}/${row.source_table}: ${row.error}`);
    }
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- MDBs were opened read-only through ACE/OLEDB; the script writes only report artifacts.',
    '- Tables inside byte-identical MDB files are marked `same_by_mdb_sha256` unless `--full-content` is used.',
    '- For changed MDB files at or below the deep-scan size limit, content hashes are order-independent aggregate row hashes.',
    '- Large same-size MDB hash changes are reported without full row hashing by default to avoid multi-hour scans.',
  );

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  fs.rmSync(args.outDir, { recursive: true, force: true });
  ensureDir(args.outDir);
  ensureDir(path.join(args.outDir, 'details'));
  const helperPath = writeHelperScript(args.outDir);

  console.log('========================================');
  console.log('  RICS May 1 MDB close comparison');
  console.log('========================================');
  console.log(`before : ${args.beforeRoot}`);
  console.log(`after  : ${args.afterRoot}`);
  console.log(`out    : ${args.outDir}`);
  console.log(`deep <=: ${Math.round(args.deepMaxBytes / 1024 / 1024)} MB`);
  console.log('----------------------------------------');

  const inventory = buildInventory(args);
  writeCsv(path.join(args.outDir, 'all_mdb_inventory.csv'), inventory);
  writeCsv(path.join(args.outDir, 'canonical_mdbs.csv'), makeCanonicalRows());

  const invByName = inventoryByName(inventory);
  const tableRows: TableSummaryRow[] = [];

  for (const source of canonicalSources()) {
    const inv = invByName.get(source.sourceMdbFile.toUpperCase());
    const baseRow: TableSummaryRow = {
      source_mdb_file: source.sourceMdbFile,
      source_table: source.sourceTable,
      target_table: source.targetTable,
      mdb_file_status: inv?.file_status ?? 'missing',
      before_row_count: '',
      after_row_count: '',
      row_delta: '',
      before_schema_hash: '',
      after_schema_hash: '',
      before_content_hash: '',
      after_content_hash: '',
      diff_status: '',
      key_kind: '',
      key_columns: '',
      detail_file: '',
      error: '',
    };

    if (!inv || inv.before_present !== 'yes' || inv.after_present !== 'yes') {
      tableRows.push({ ...baseRow, diff_status: 'missing_mdb', error: 'Canonical MDB missing from one snapshot' });
      continue;
    }

    const beforeDbPath = sourcePath(args.beforeRoot, source.sourceMdbFile);
    const afterDbPath = sourcePath(args.afterRoot, source.sourceMdbFile);
    const sameFile = inv.file_status === 'same';
    const maxSnapshotBytes = Math.max(Number(inv.before_size || 0), Number(inv.after_size || 0));
    const deepScanAllowed =
      args.includeContentForIdenticalMdbs ||
      (!sameFile && maxSnapshotBytes <= args.deepMaxBytes);
    const computeContent = args.includeContentForIdenticalMdbs || deepScanAllowed;

    try {
      process.stderr.write(`summary ${source.sourceMdbFile}/${source.sourceTable} ... `);
      const beforePassword = getOrRecoverPassword(beforeDbPath);
      const afterPassword = sameFile ? beforePassword : getOrRecoverPassword(afterDbPath);
      const beforeSummary = await summarizeTable({
        helperPath,
        dbPath: beforeDbPath,
        password: beforePassword,
        tableName: source.sourceTable,
        computeContent,
      });
      const afterSummary = sameFile
        ? beforeSummary
        : await summarizeTable({
          helperPath,
          dbPath: afterDbPath,
          password: afterPassword,
          tableName: source.sourceTable,
          computeContent,
        });

      const beforeContentHash = computeContent
        ? beforeSummary.contentHash
        : `same_by_mdb_sha256:${inv.before_sha256}`;
      const afterContentHash = computeContent
        ? afterSummary.contentHash
        : `same_by_mdb_sha256:${inv.after_sha256}`;
      const rowDelta = afterSummary.rowCount - beforeSummary.rowCount;
      let diffStatus = 'same';
      if (sameFile && !args.includeContentForIdenticalMdbs) diffStatus = 'same_by_mdb_sha256';
      else if (beforeSummary.schemaHash !== afterSummary.schemaHash) diffStatus = 'schema_changed';
      else if (beforeSummary.rowCount !== afterSummary.rowCount || beforeContentHash !== afterContentHash) {
        diffStatus = computeContent ? 'content_changed' : 'file_hash_differ_content_not_scanned';
      }

      let detailFile = '';
      if (diffStatus === 'content_changed' || diffStatus === 'schema_changed') {
        const detailName = `${source.targetTable}_keys.csv`;
        const detailPath = path.join(args.outDir, 'details', detailName);
        await writeDetail({
          helperPath,
          beforeDbPath,
          beforePassword,
          afterDbPath,
          afterPassword,
          tableName: source.sourceTable,
          keyColumns: beforeSummary.keyColumns,
          outputCsv: detailPath,
        });
        detailFile = `details/${detailName}`;
      }

      tableRows.push({
        ...baseRow,
        before_row_count: String(beforeSummary.rowCount),
        after_row_count: String(afterSummary.rowCount),
        row_delta: String(rowDelta),
        before_schema_hash: beforeSummary.schemaHash,
        after_schema_hash: afterSummary.schemaHash,
        before_content_hash: beforeContentHash,
        after_content_hash: afterContentHash,
        diff_status: diffStatus,
        key_kind: beforeSummary.keyKind,
        key_columns: beforeSummary.keyColumns.join('|'),
        detail_file: detailFile,
      });
      process.stderr.write(`${diffStatus}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tableRows.push({ ...baseRow, diff_status: 'error', error: message });
      process.stderr.write(`ERROR: ${message.slice(0, 160)}\n`);
    }
  }

  writeCsv(path.join(args.outDir, 'table_summary.csv'), tableRows);
  const finishedAt = new Date();
  fs.writeFileSync(path.join(args.outDir, 'README.md'), markdownSummary({
    inventory,
    tableRows,
    outDir: args.outDir,
    beforeRoot: args.beforeRoot,
    afterRoot: args.afterRoot,
    startedAt,
    finishedAt,
  }), 'utf8');

  console.log('----------------------------------------');
  console.log(`inventory : ${path.join(args.outDir, 'all_mdb_inventory.csv')}`);
  console.log(`canonical : ${path.join(args.outDir, 'canonical_mdbs.csv')}`);
  console.log(`summary   : ${path.join(args.outDir, 'table_summary.csv')}`);
  console.log(`readme    : ${path.join(args.outDir, 'README.md')}`);
  console.log('========================================');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
