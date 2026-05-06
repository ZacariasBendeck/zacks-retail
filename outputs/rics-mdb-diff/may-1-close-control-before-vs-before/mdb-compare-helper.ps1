
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
