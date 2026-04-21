import { Client, PoolClient } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import path from 'node:path';
import { buildListColumnsScript, runPowerShellJson } from '../accessOleDb';
import { oleDbToPostgresType, quoteIdent } from './typeMapping';
import { toSnakeCase } from './canonicalRicsTables';
import { bulkExtractToCsv, safeDeleteCsv } from './bulkExtract';

interface MdbColumn {
  name: string;
  ordinal: number;
  dataType: number;
  nullable: boolean;
}

export interface CopyResult {
  sourceTable: string;
  targetTable: string; // schema-qualified
  rowCount: number;
  durationMs: number;
}

/**
 * Pull one RICS table from an MDB into a freshly-created Postgres table.
 *
 * Pipeline:
 *   1. Introspect columns from the MDB (name, OleDb type, nullable).
 *   2. `CREATE TABLE <targetSchema>.<snake_case(tableName)>` with mapped types.
 *   3. Invoke the C# bulk extractor (bulkExtractToCsv) which streams rows
 *      from ACE and writes a Postgres COPY-compatible CSV to stagingDir.
 *   4. Stream the CSV file into Postgres via `COPY ... FROM STDIN WITH (FORMAT csv, NULL '\N')`.
 *   5. Delete the CSV.
 *
 * Why this shape:
 *   - The original "read everything via PowerShell + JSON blob" path buffered
 *     the entire rowset in PowerShell memory, serialized to JSON, parsed in
 *     Node, then formatted for COPY — O(table size) RAM and time in four
 *     places. For tables with millions of rows (InvHis, TicketDetail) this
 *     went from bad to unrecoverable.
 *   - C# reading ACE row-by-row and writing CSV to disk has bounded RAM
 *     regardless of table size. Disk serves as the buffer. Postgres COPY FROM
 *     a file stream is close to the native write ceiling.
 *   - Node stays the orchestrator and owns the transaction, so the atomic
 *     swap at the end still works without coordinating cross-process state.
 */
export async function copyMdbTableToPostgres(args: {
  mdbPath: string;
  mdbPassword: string;
  sourceTable: string;
  targetSchema: string;
  pgClient: Client | PoolClient;
  stagingDir: string;
}): Promise<CopyResult> {
  const { mdbPath, mdbPassword, sourceTable, targetSchema, pgClient, stagingDir } = args;
  const startedAt = Date.now();

  // 1. Introspect columns.
  const colScript = buildListColumnsScript(mdbPath, mdbPassword, sourceTable);
  const columns = await runPowerShellJson<MdbColumn[] | MdbColumn>(colScript);
  const colArray = Array.isArray(columns) ? columns : [columns];
  if (colArray.length === 0) {
    throw new Error(`No columns found for ${sourceTable} in ${mdbPath}`);
  }
  colArray.sort((a, b) => a.ordinal - b.ordinal);

  const targetTableName = toSnakeCase(sourceTable);
  const fullTarget = `${quoteIdent(targetSchema)}.${quoteIdent(targetTableName)}`;

  // 2. CREATE TABLE in staging schema. Column order matches ordinal order;
  //    the extractor writes fields in reader order, which is the same.
  const colDefs = colArray
    .map((c) => {
      const colName = quoteIdent(toSnakeCase(c.name));
      const pgType = oleDbToPostgresType(c.dataType);
      const nullClause = c.nullable ? '' : ' NOT NULL';
      return `${colName} ${pgType}${nullClause}`;
    })
    .join(',\n  ');
  await pgClient.query(`CREATE TABLE ${fullTarget} (\n  ${colDefs}\n)`);

  // 3. Extract to CSV via C# streamer.
  const csvPath = path.join(stagingDir, `${targetTableName}.csv`);
  const extract = await bulkExtractToCsv({
    mdbPath,
    mdbPassword,
    sourceTable,
    outputCsv: csvPath,
  });

  try {
    // 4. COPY the CSV into Postgres.
    const pgColumnList = colArray
      .map((c) => quoteIdent(toSnakeCase(c.name)))
      .join(', ');
    const copyStmt = `COPY ${fullTarget} (${pgColumnList}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`;
    const copyStream = pgClient.query(copyFrom(copyStmt));
    const fileStream = fs.createReadStream(csvPath, { highWaterMark: 1 << 20 });
    await pipeline(fileStream, copyStream);
  } finally {
    // 5. Always drop the CSV — success or failure. It's a throwaway intermediate.
    safeDeleteCsv(csvPath);
  }

  return {
    sourceTable,
    targetTable: `${targetSchema}.${targetTableName}`,
    rowCount: extract.rowCount,
    durationMs: Date.now() - startedAt,
  };
}
