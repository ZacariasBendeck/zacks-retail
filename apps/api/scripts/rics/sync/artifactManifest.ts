import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Client } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { quoteIdent } from '../../../src/services/sync/typeMapping';

export interface ArtifactColumn {
  targetColumn: string;
  ordinal: number;
  postgresType: string;
  nullable: boolean;
}

export interface ArtifactTable {
  targetTable: string;
  csvFile: string;
  rowCount: number;
  columns: ArtifactColumn[];
}

export interface ArtifactManifest {
  tables: ArtifactTable[];
}

export function loadManifest(manifestPath: string): {
  manifest: ArtifactManifest;
  manifestDir: string;
  absoluteManifestPath: string;
} {
  const absoluteManifestPath = path.resolve(manifestPath);
  const raw = fs.readFileSync(absoluteManifestPath, 'utf8');
  const manifest = JSON.parse(raw) as ArtifactManifest;
  if (!manifest || !Array.isArray(manifest.tables)) {
    throw new Error(`Invalid manifest: ${absoluteManifestPath}`);
  }
  return {
    manifest,
    manifestDir: path.dirname(absoluteManifestPath),
    absoluteManifestPath,
  };
}

export function requireTable(manifest: ArtifactManifest, targetTable: string): ArtifactTable {
  const table = manifest.tables.find((entry) => entry.targetTable === targetTable);
  if (!table) {
    throw new Error(`Manifest is missing required table '${targetTable}'`);
  }
  return table;
}

export function tempTableName(baseName: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(baseName)) {
    throw new Error(`Invalid temp table name: ${baseName}`);
  }
  return `tmp_${baseName}`;
}

async function createTempTable(
  client: Client,
  tableName: string,
  table: ArtifactTable,
  opts?: { addIdentity?: boolean },
): Promise<void> {
  const orderedColumns = table.columns
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((column) => {
      const nullClause = column.nullable ? '' : ' NOT NULL';
      return `${quoteIdent(column.targetColumn)} ${column.postgresType}${nullClause}`;
    })
    .join(',\n  ');
  const identityPrefix = opts?.addIdentity
    ? `"import_seq" BIGINT GENERATED ALWAYS AS IDENTITY,\n  `
    : '';

  await client.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`);
  await client.query(`CREATE TEMP TABLE ${quoteIdent(tableName)} (\n  ${identityPrefix}${orderedColumns}\n)`);
}

async function loadCsvIntoTempTable(
  client: Client,
  tableName: string,
  table: ArtifactTable,
  absoluteCsvPath: string,
): Promise<number> {
  const orderedColumns = table.columns
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((column) => quoteIdent(column.targetColumn))
    .join(', ');
  const copyStatement = `COPY ${quoteIdent(tableName)} (${orderedColumns}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`;
  const copyStream = client.query(copyFrom(copyStatement));
  const fileStream = fs.createReadStream(absoluteCsvPath, { highWaterMark: 1 << 20 });
  await pipeline(fileStream, copyStream);

  const count = await client.query<{ row_count: string }>(
    `SELECT COUNT(*)::text AS row_count FROM ${quoteIdent(tableName)}`,
  );
  return Number(count.rows[0]?.row_count ?? 0);
}

export async function stageTable(
  client: Client,
  manifestDir: string,
  table: ArtifactTable,
  opts?: { addIdentity?: boolean },
): Promise<string> {
  const tableName = tempTableName(table.targetTable);
  const absoluteCsvPath = path.resolve(manifestDir, table.csvFile);
  if (!fs.existsSync(absoluteCsvPath)) {
    throw new Error(`CSV file missing for ${table.targetTable}: ${absoluteCsvPath}`);
  }

  await createTempTable(client, tableName, table, opts);
  const rowCount = await loadCsvIntoTempTable(client, tableName, table, absoluteCsvPath);
  if (rowCount !== table.rowCount) {
    throw new Error(
      `Row-count mismatch for ${table.targetTable}: manifest=${table.rowCount} loaded=${rowCount}`,
    );
  }
  return tableName;
}

export function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}
