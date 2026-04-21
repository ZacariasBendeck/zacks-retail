# Bulk-extract one table from a password-protected Jet/Access .MDB to a CSV
# file, using C# hosted via Add-Type so we get native-speed iteration and
# string building — no per-row PowerShell pipeline overhead.
#
# The CSV is written in PostgreSQL COPY CSV format:
#   - fields comma-separated
#   - strings double-quoted, internal quotes doubled (RFC 4180)
#   - NULL written as the literal \N (unquoted) — Postgres decodes via NULL '\N'
#   - dates in ISO 8601 (yyyy-MM-dd HH:mm:ss.fffffff)
#   - numbers in InvariantCulture (period as decimal separator)
#   - booleans as t / f
#   - byte[] as \x<hex>  — Postgres parses as bytea
#
# Node reads the CSV and pipes it into a Postgres COPY STDIN connection
# that's wrapped in the same transaction as the staging-schema swap, so
# this extractor never talks to Postgres directly.
#
# Usage:
#   powershell -NoProfile -NonInteractive -File bulk-extract.ps1 `
#     -DbPath  "E:/data/rics-mdbs/RIINVMAS.MDB" `
#     -Password "thesecret" `
#     -TableName "InventoryMaster" `
#     -OutputCsv "E:/tmp/rics-staging/inventory_master.csv"
#
# Exit codes:
#   0 — success. Row count written to stdout as "ROWS <n>".
#   1 — ACE open / SELECT / write failure. Error text on stderr.

param(
  [Parameter(Mandatory = $true)] [string] $DbPath,
  [Parameter(Mandatory = $true)] [string] $Password,
  [Parameter(Mandatory = $true)] [string] $TableName,
  [Parameter(Mandatory = $true)] [string] $OutputCsv
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -ReferencedAssemblies 'System.Data' -TypeDefinition @"
using System;
using System.Data;
using System.Data.OleDb;
using System.Globalization;
using System.IO;
using System.Text;

public static class MdbBulkExtract {
  public static int Run(string dbPath, string password, string tableName, string outputCsv) {
    var cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + dbPath
           + ";Jet OLEDB:Database Password=" + password
           + ";Persist Security Info=False;";

    // Quote the table name for ACE — brackets allow spaces and other odd chars.
    var quotedTable = "[" + tableName.Replace("]", "]]") + "]";
    var sql = "SELECT * FROM " + quotedTable;

    int rowCount = 0;

    using (var conn = new OleDbConnection(cs)) {
      conn.Open();
      using (var cmd = new OleDbCommand(sql, conn)) {
        cmd.CommandTimeout = 0;
        using (var reader = cmd.ExecuteReader(CommandBehavior.SequentialAccess)) {
          int fieldCount = reader.FieldCount;

          // UTF-8 BOM-less; Postgres doesn't want a BOM in COPY data.
          var utf8NoBom = new UTF8Encoding(false);
          using (var fs = new FileStream(outputCsv, FileMode.Create, FileAccess.Write, FileShare.Read, 1 << 20)) {
            using (var writer = new StreamWriter(fs, utf8NoBom, 1 << 20)) {
              writer.NewLine = "\n"; // Postgres expects LF, not CRLF
              var sb = new StringBuilder(1024);

              while (reader.Read()) {
                sb.Length = 0;
                for (int i = 0; i < fieldCount; i++) {
                  if (i > 0) sb.Append(',');
                  AppendCsvField(sb, reader.GetValue(i));
                }
                writer.WriteLine(sb.ToString());
                rowCount++;
              }
            }
          }
        }
      }
    }
    return rowCount;
  }

  static void AppendCsvField(StringBuilder sb, object val) {
    if (val == null || val is DBNull) { sb.Append("\\N"); return; }

    if (val is DateTime) {
      // ISO 8601, no offset — Postgres parses this as a local timestamp and
      // will interpret per the session time zone. Round-trip fidelity is fine
      // for Jet DateTime, which carries no zone info anyway.
      var dt = (DateTime)val;
      sb.Append(dt.ToString("yyyy-MM-dd HH:mm:ss.fffffff", CultureInfo.InvariantCulture));
      return;
    }
    if (val is bool) {
      sb.Append(((bool)val) ? 't' : 'f');
      return;
    }
    if (val is byte) { sb.Append(((byte)val).ToString(CultureInfo.InvariantCulture)); return; }
    if (val is short) { sb.Append(((short)val).ToString(CultureInfo.InvariantCulture)); return; }
    if (val is int) { sb.Append(((int)val).ToString(CultureInfo.InvariantCulture)); return; }
    if (val is long) { sb.Append(((long)val).ToString(CultureInfo.InvariantCulture)); return; }
    if (val is float) { sb.Append(((float)val).ToString("R", CultureInfo.InvariantCulture)); return; }
    if (val is double) { sb.Append(((double)val).ToString("R", CultureInfo.InvariantCulture)); return; }
    if (val is decimal) { sb.Append(((decimal)val).ToString(CultureInfo.InvariantCulture)); return; }

    if (val is byte[]) {
      var bytes = (byte[])val;
      sb.Append("\\x");
      for (int i = 0; i < bytes.Length; i++) sb.Append(bytes[i].ToString("x2"));
      return;
    }

    if (val is Guid) { sb.Append(((Guid)val).ToString()); return; }

    // String / anything else — CSV-quote and double internal quotes.
    var s = val.ToString();
    sb.Append('"');
    for (int i = 0; i < s.Length; i++) {
      char ch = s[i];
      if (ch == '"') sb.Append('"').Append('"');
      else if (ch == '\0') continue;   // Postgres doesn't allow NUL in text
      else sb.Append(ch);
    }
    sb.Append('"');
  }
}
"@

try {
  $n = [MdbBulkExtract]::Run($DbPath, $Password, $TableName, $OutputCsv)
  Write-Output ("ROWS " + $n)
  exit 0
}
catch {
  $msg = $_.Exception.Message
  if ($_.Exception.InnerException) { $msg = $msg + " | " + $_.Exception.InnerException.Message }
  [Console]::Error.WriteLine("ERR " + $msg)
  exit 1
}
