import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Client } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { buildListColumnsScript, getOrRecoverPassword, ricsDbPath, runPowerShellJson } from '../accessOleDb';
import { bulkExtractToCsv, ensureStagingDir } from './bulkExtract';
import { CANONICAL_MDBS, toSnakeCase } from './canonicalRicsTables';
import { oleDbToPostgresType, quoteIdent } from './typeMapping';
import { BackfillResult, skuLifecycleBackfill } from './skuLifecycleBackfill';

interface MdbColumn {
  name: string;
  ordinal: number;
  dataType: number;
  nullable: boolean;
}

export interface ArtifactColumn {
  sourceColumn: string;
  targetColumn: string;
  ordinal: number;
  oleDbType: number;
  postgresType: string;
  nullable: boolean;
}

export interface ArtifactTable {
  sourceMdbFile: string;
  sourceTable: string;
  targetTable: string;
  csvFile: string;
  rowCount: number;
  byteSize: number;
  sha256: string;
  columns: ArtifactColumn[];
}

export interface ArtifactManifest {
  version: 1;
  extractedAt: string;
  extractorVersion: string;
  scope: string;
  sourceRoot: string;
  tables: ArtifactTable[];
}

export interface ArtifactSource {
  sourceMdbFile: string;
  sourceTable: string;
  targetTable: string;
}

export interface ExtractArtifactResult {
  manifestPath: string;
  manifest: ArtifactManifest;
}

export interface LoadArtifactTableResult {
  sourceMdbFile: string;
  sourceTable: string;
  targetTable: string;
  rowCount: number;
  durationMs: number;
}

export interface LoadArtifactResult {
  runId: string;
  status: 'ok' | 'failed';
  totalRows: number;
  tableCount: number;
  durationMs: number;
  errorText?: string;
  tables: LoadArtifactTableResult[];
  skuBackfill?: BackfillResult;
  skuBackfillError?: string;
}

export const RICS_ARTIFACT_SCOPE_TABLES: Record<string, string[]> = {
  'all-canonical': CANONICAL_MDBS.flatMap((mdb) => mdb.tables.map((table) => toSnakeCase(table))),
  'products-inventory-bootstrap': [
    'categories',
    'departments',
    'group_codes',
    'inventory_master',
    'inventory_quantities',
    'inv_changes',
    'keywords',
    'marketing_code',
    'return_codes',
    'sectors',
    'size_types',
  ],
};

function canonicalSources(): ArtifactSource[] {
  return CANONICAL_MDBS.flatMap((mdb) =>
    mdb.tables.map((table) => ({
      sourceMdbFile: mdb.file,
      sourceTable: table,
      targetTable: toSnakeCase(table),
    })),
  );
}

export function resolveArtifactSources(args: {
  scope?: string | null;
  includeTables?: string[];
}): ArtifactSource[] {
  const sourceByTarget = new Map<string, ArtifactSource>();
  for (const source of canonicalSources()) {
    sourceByTarget.set(source.targetTable, source);
  }

  const requestedTargets = new Set<string>();
  const scope = (args.scope ?? '').trim();
  if (scope.length > 0) {
    const scoped = RICS_ARTIFACT_SCOPE_TABLES[scope];
    if (!scoped) {
      throw new Error(
        `Unknown artifact scope '${scope}'. Known scopes: ${Object.keys(RICS_ARTIFACT_SCOPE_TABLES).join(', ')}`,
      );
    }
    for (const target of scoped) requestedTargets.add(target);
  }
  for (const raw of args.includeTables ?? []) {
    const target = raw.trim().toLowerCase();
    if (!target) continue;
    requestedTargets.add(target);
  }

  const finalTargets =
    requestedTargets.size > 0
      ? [...requestedTargets]
      : [...RICS_ARTIFACT_SCOPE_TABLES['all-canonical']];

  const resolved = finalTargets.map((target) => {
    const source = sourceByTarget.get(target);
    if (!source) {
      throw new Error(`Unknown canonical target table '${target}'`);
    }
    return source;
  });

  resolved.sort((a, b) => a.targetTable.localeCompare(b.targetTable));
  return resolved;
}

async function sha256File(filePath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function listTableColumns(args: {
  mdbPath: string;
  password: string;
  sourceTable: string;
}): Promise<ArtifactColumn[]> {
  const script = buildListColumnsScript(args.mdbPath, args.password, args.sourceTable);
  const raw = await runPowerShellJson<MdbColumn[] | MdbColumn>(script);
  const columns = (Array.isArray(raw) ? raw : [raw]).slice();
  columns.sort((a, b) => a.ordinal - b.ordinal);
  if (columns.length === 0) {
    throw new Error(`No columns found for ${args.sourceTable} in ${args.mdbPath}`);
  }

  return columns.map((column) => ({
    sourceColumn: column.name,
    targetColumn: toSnakeCase(column.name),
    ordinal: column.ordinal,
    oleDbType: column.dataType,
    postgresType: oleDbToPostgresType(column.dataType),
    nullable: column.nullable,
  }));
}

function sourceRootPath(): string {
  const sample = ricsDbPath('placeholder.mdb');
  return path.dirname(sample);
}

function fmtBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export async function extractRicsArtifact(args: {
  outDir: string;
  scope?: string | null;
  includeTables?: string[];
}): Promise<ExtractArtifactResult> {
  const sources = resolveArtifactSources({ scope: args.scope, includeTables: args.includeTables });
  if (sources.length === 0) {
    throw new Error('No tables selected for artifact extraction');
  }

  const outDir = path.resolve(args.outDir);
  ensureStagingDir(outDir);

  const tables: ArtifactTable[] = [];
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    const tableStarted = Date.now();
    const mdbPath = ricsDbPath(source.sourceMdbFile);
    console.log(
      `[extract:rics-artifact] ${i + 1}/${sources.length} ${source.sourceMdbFile} / ${source.sourceTable} -> ${source.targetTable}.csv`,
    );
    const password = getOrRecoverPassword(mdbPath);
    const columns = await listTableColumns({
      mdbPath,
      password,
      sourceTable: source.sourceTable,
    });
    const csvName = `${source.targetTable}.csv`;
    const csvPath = path.join(outDir, csvName);
    const extract = await bulkExtractToCsv({
      mdbPath,
      mdbPassword: password,
      sourceTable: source.sourceTable,
      outputCsv: csvPath,
    });
    const stat = fs.statSync(csvPath);
    const sha256 = await sha256File(csvPath);
    console.log(
      `[extract:rics-artifact] ${i + 1}/${sources.length} done ${source.targetTable}.csv rows=${extract.rowCount.toLocaleString('en-US')} size=${fmtBytes(stat.size)} duration=${fmtDuration(Date.now() - tableStarted)}`,
    );
    tables.push({
      sourceMdbFile: source.sourceMdbFile,
      sourceTable: source.sourceTable,
      targetTable: source.targetTable,
      csvFile: csvName,
      rowCount: extract.rowCount,
      byteSize: stat.size,
      sha256,
      columns,
    });
  }

  const manifest: ArtifactManifest = {
    version: 1,
    extractedAt: new Date().toISOString(),
    extractorVersion: 'artifact-v1',
    scope: (args.scope ?? '').trim() || 'custom',
    sourceRoot: sourceRootPath(),
    tables,
  };
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { manifestPath, manifest };
}

function parseManifest(manifestPath: string): { manifest: ArtifactManifest; manifestDir: string } {
  const absolutePath = path.resolve(manifestPath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const manifest = JSON.parse(raw) as ArtifactManifest;
  if (!manifest || !Array.isArray(manifest.tables)) {
    throw new Error(`Invalid artifact manifest: ${absolutePath}`);
  }
  return { manifest, manifestDir: path.dirname(absolutePath) };
}

async function validateManifestTables(
  manifestDir: string,
  tables: ArtifactTable[],
): Promise<Array<ArtifactTable & { absoluteCsvPath: string }>> {
  const seenTargets = new Set<string>();
  const validated: Array<ArtifactTable & { absoluteCsvPath: string }> = [];

  for (const table of tables) {
    if (seenTargets.has(table.targetTable)) {
      throw new Error(`Duplicate target table in manifest: ${table.targetTable}`);
    }
    seenTargets.add(table.targetTable);

    if (!Array.isArray(table.columns) || table.columns.length === 0) {
      throw new Error(`Manifest entry ${table.targetTable} has no columns`);
    }

    const absoluteCsvPath = path.resolve(manifestDir, table.csvFile);
    if (!fs.existsSync(absoluteCsvPath)) {
      throw new Error(`CSV file missing for ${table.targetTable}: ${absoluteCsvPath}`);
    }

    const stat = fs.statSync(absoluteCsvPath);
    if (stat.size !== table.byteSize) {
      throw new Error(
        `Byte-size mismatch for ${table.targetTable}: manifest=${table.byteSize} actual=${stat.size}`,
      );
    }

    const sha256 = await sha256File(absoluteCsvPath);
    if (sha256 !== table.sha256) {
      throw new Error(`Checksum mismatch for ${table.targetTable}`);
    }

    validated.push({ ...table, absoluteCsvPath });
  }

  return validated;
}

async function createMirrorTableFromManifest(
  client: Client,
  schemaName: string,
  table: ArtifactTable,
): Promise<void> {
  const columnDefs = table.columns
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((column) => {
      const nullClause = column.nullable ? '' : ' NOT NULL';
      return `${quoteIdent(column.targetColumn)} ${column.postgresType}${nullClause}`;
    })
    .join(',\n  ');

  await client.query(
    `CREATE TABLE ${quoteIdent(schemaName)}.${quoteIdent(table.targetTable)} (\n  ${columnDefs}\n)`,
  );
}

async function copyCsvIntoMirror(
  client: Client,
  schemaName: string,
  table: ArtifactTable & { absoluteCsvPath: string },
): Promise<number> {
  const targetTable = `${quoteIdent(schemaName)}.${quoteIdent(table.targetTable)}`;
  const orderedColumns = table.columns
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((column) => quoteIdent(column.targetColumn))
    .join(', ');

  const copyStatement = `COPY ${targetTable} (${orderedColumns}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`;
  const copyStream = client.query(copyFrom(copyStatement));
  const fileStream = fs.createReadStream(table.absoluteCsvPath, { highWaterMark: 1 << 20 });
  await pipeline(fileStream, copyStream);

  const countResult = await client.query<{ row_count: string }>(
    `SELECT COUNT(*)::text AS row_count FROM ${targetTable}`,
  );
  return Number(countResult.rows[0]?.row_count ?? 0);
}

function findScopeName(manifest: ArtifactManifest): string {
  return manifest.scope?.trim() || 'custom';
}

export async function loadRicsArtifact(args: {
  manifestPath: string;
  databaseUrl?: string;
  finalSchema?: string;
  stagingSchema?: string;
}): Promise<LoadArtifactResult> {
  const databaseUrl = args.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL env var is required');
  }

  const { manifest, manifestDir } = parseManifest(args.manifestPath);
  const tables = await validateManifestTables(manifestDir, manifest.tables);
  if (tables.length === 0) {
    throw new Error('Artifact manifest contains no tables');
  }

  const finalSchema = args.finalSchema ?? 'rics_mirror';
  const stagingSchema = args.stagingSchema ?? 'rics_mirror_staging';
  const runId = randomUUID();
  const runStartMs = Date.now();
  const results: LoadArtifactTableResult[] = [];

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(
      `INSERT INTO platform.etl_run (id, "startedAt", status, "totalRows", "tableCount")
       VALUES ($1, now(), 'running', 0, 0)`,
      [runId],
    );

    await client.query('BEGIN');
    await client.query(`DROP SCHEMA IF EXISTS "${stagingSchema}" CASCADE`);
    await client.query(`CREATE SCHEMA "${stagingSchema}"`);

    for (const table of tables) {
      const started = Date.now();
      await createMirrorTableFromManifest(client, stagingSchema, table);
      const loadedRowCount = await copyCsvIntoMirror(client, stagingSchema, table);
      if (loadedRowCount !== table.rowCount) {
        throw new Error(
          `Row-count mismatch for ${table.targetTable}: manifest=${table.rowCount} loaded=${loadedRowCount}`,
        );
      }
      results.push({
        sourceMdbFile: table.sourceMdbFile,
        sourceTable: table.sourceTable,
        targetTable: `${stagingSchema}.${table.targetTable}`,
        rowCount: loadedRowCount,
        durationMs: Date.now() - started,
      });
    }

    for (const result of results) {
      await client.query(
        `INSERT INTO platform.etl_run_table (id, "runId", "mdbFile", "sourceTable", "targetTable", "rowCount", "durationMs", status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ok')`,
        [
          randomUUID(),
          runId,
          result.sourceMdbFile,
          result.sourceTable,
          result.targetTable,
          result.rowCount,
          result.durationMs,
        ],
      );
    }

    await client.query(`DROP SCHEMA IF EXISTS "${finalSchema}" CASCADE`);
    await client.query(`ALTER SCHEMA "${stagingSchema}" RENAME TO "${finalSchema}"`);
    await client.query('COMMIT');

    let skuBackfill: BackfillResult | undefined;
    let skuBackfillError: string | undefined;
    try {
      skuBackfill = await skuLifecycleBackfill({ pgClient: client, runId });
    } catch (error) {
      skuBackfillError = (error as Error).message;
    }

    const totalRows = results.reduce((sum, result) => sum + result.rowCount, 0);
    const durationMs = Date.now() - runStartMs;
    await client.query(
      `UPDATE platform.etl_run
          SET "finishedAt" = now(),
              status = 'ok',
              "totalRows" = $1,
              "tableCount" = $2
        WHERE id = $3`,
      [totalRows, results.length, runId],
    );

    return {
      runId,
      status: 'ok',
      totalRows,
      tableCount: results.length,
      durationMs,
      tables: results,
      skuBackfill,
      skuBackfillError,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure; the original error is what matters.
    }
    const errorText = (error as Error).message;
    const durationMs = Date.now() - runStartMs;
    try {
      await client.query(
        `UPDATE platform.etl_run
            SET "finishedAt" = now(),
                status = 'failed',
                "errorText" = $1,
                "totalRows" = $2,
                "tableCount" = $3
          WHERE id = $4`,
        [errorText, results.reduce((sum, result) => sum + result.rowCount, 0), results.length, runId],
      );
    } catch {
      // Best effort only.
    }
    return {
      runId,
      status: 'failed',
      totalRows: results.reduce((sum, result) => sum + result.rowCount, 0),
      tableCount: results.length,
      durationMs,
      errorText,
      tables: results,
    };
  } finally {
    await client.end();
  }
}

export function formatArtifactScopeSummary(scope: string | null | undefined): string {
  const normalized = (scope ?? '').trim();
  if (!normalized) return 'custom';
  if (RICS_ARTIFACT_SCOPE_TABLES[normalized]) {
    return `${normalized} (${RICS_ARTIFACT_SCOPE_TABLES[normalized].length} tables)`;
  }
  return normalized;
}

export function formatArtifactManifestSummary(manifest: ArtifactManifest): string {
  return `${findScopeName(manifest)}: ${manifest.tables.length} table(s), extracted ${manifest.extractedAt}`;
}
