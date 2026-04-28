import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { CANONICAL_MDBS } from '../sync/canonicalRicsTables';
import {
  escapePowerShellLiteral,
  getOrRecoverPassword,
  runPowerShellJson,
} from '../accessOleDb';

export type MigrationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type MigrationLogStream = 'stdout' | 'stderr' | 'system';

export interface MigrationLogLine {
  at: string;
  stream: MigrationLogStream;
  text: string;
}

export interface MigrationJobSnapshot {
  id: string;
  actionId: string;
  actionLabel: string;
  status: MigrationJobStatus;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  durationMs: number | null;
  logs: MigrationLogLine[];
  result: unknown;
  error: string | null;
}

export interface MigrationActionConfig {
  mdbDir?: string;
  bundleDir?: string;
  customerCsvPath?: string;
  mailListNamesCsvPath?: string;
  ticketHeaderCsvPath?: string;
  ticketDetailCsvPath?: string;
  inventoryHistoryAsOf?: string;
  skipInventoryHistory?: boolean;
  skipCustomers?: boolean;
  skipCustomerTransactions?: boolean;
  skipSegmentationDefaults?: boolean;
  strictFull?: boolean;
}

export interface MigrationActionDefinition {
  id: string;
  label: string;
  group: 'sequence' | 'individual' | 'check';
  description: string;
  requiresMdbDir?: boolean;
  requiresBundle: boolean;
  requiresAttributeSnapshot?: boolean;
  requiresLegacyManifest?: boolean;
  requiresCustomerFiles?: boolean;
  requiresTicketFiles?: boolean;
}

type ActionRunner =
  | { type: 'command'; build: (config: MigrationActionConfig) => CommandSpec }
  | { type: 'internal'; run: (config: MigrationActionConfig, job: MigrationJob) => Promise<unknown> };

interface ActionRegistration extends MigrationActionDefinition {
  runner: ActionRunner;
}

interface CommandSpec {
  command: string;
  args: string[];
  cwd: string;
}

interface MigrationJob extends MigrationJobSnapshot {
  append(stream: MigrationLogStream, text: string): void;
}

const API_DIR = path.resolve(__dirname, '../../..');
const MAX_LOG_LINES = 2_000;
const MAX_JOBS = 80;

const jobs = new Map<string, MigrationJob>();

function nodeScript(relativeScriptPath: string, args: string[] = []): CommandSpec {
  return {
    command: process.execPath,
    args: ['--env-file-if-exists=.env', '-r', 'tsx/cjs', path.join(API_DIR, relativeScriptPath), ...args],
    cwd: API_DIR,
  };
}

function pnpmExec(args: string[]): CommandSpec {
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd', ...args],
      cwd: API_DIR,
    };
  }
  return {
    command: 'pnpm',
    args,
    cwd: API_DIR,
  };
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function normalizeConfig(raw: unknown): MigrationActionConfig {
  const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    bundleDir: cleanString(body.bundleDir) ?? undefined,
    mdbDir: cleanString(body.mdbDir) ?? undefined,
    customerCsvPath: cleanString(body.customerCsvPath) ?? undefined,
    mailListNamesCsvPath: cleanString(body.mailListNamesCsvPath) ?? undefined,
    ticketHeaderCsvPath: cleanString(body.ticketHeaderCsvPath) ?? undefined,
    ticketDetailCsvPath: cleanString(body.ticketDetailCsvPath) ?? undefined,
    inventoryHistoryAsOf: cleanString(body.inventoryHistoryAsOf) ?? undefined,
    skipInventoryHistory: bool(body.skipInventoryHistory),
    skipCustomers: bool(body.skipCustomers),
    skipCustomerTransactions: bool(body.skipCustomerTransactions),
    skipSegmentationDefaults: bool(body.skipSegmentationDefaults),
    strictFull: bool(body.strictFull),
  };
}

function requireBundleDir(config: MigrationActionConfig): string {
  const bundleDir = cleanString(config.bundleDir);
  if (!bundleDir) throw new Error('bundleDir is required.');
  return path.resolve(bundleDir);
}

function requireMdbDir(config: MigrationActionConfig): string {
  const mdbDir = cleanString(config.mdbDir) ?? cleanString(process.env.RICS_DB_DIR);
  if (!mdbDir) throw new Error('mdbDir is required.');
  return path.resolve(mdbDir);
}

function legacyManifestPath(config: MigrationActionConfig): string {
  return path.join(requireBundleDir(config), 'legacy', 'manifest.json');
}

function attributeSnapshotPath(config: MigrationActionConfig): string {
  return path.join(requireBundleDir(config), 'app', 'attribute-catalog-export.json');
}

function bundleCustomerPath(config: MigrationActionConfig, fileName: string): string {
  return path.join(requireBundleDir(config), 'crm', fileName);
}

function optionalPathArgs(pairs: Array<[string, string | undefined]>): string[] {
  const out: string[] = [];
  for (const [flag, value] of pairs) {
    const cleaned = cleanString(value);
    if (cleaned) out.push(flag, path.resolve(cleaned));
  }
  return out;
}

function loadBundleArgs(config: MigrationActionConfig): string[] {
  const args = ['--bundle', requireBundleDir(config)];
  if (config.strictFull) args.push('--strict-full');
  if (config.skipInventoryHistory) args.push('--skip-inventory-history');
  if (config.skipCustomers) args.push('--skip-customers');
  if (config.skipCustomerTransactions) args.push('--skip-customer-transactions');
  if (config.skipSegmentationDefaults) args.push('--skip-segmentation-defaults');
  if (config.inventoryHistoryAsOf) args.push('--inventory-history-as-of', config.inventoryHistoryAsOf);
  return args;
}

const actions: ActionRegistration[] = [
  {
    id: 'check-mdb-folder',
    label: 'Check RICS MDB folder',
    group: 'check',
    description: 'Confirms the RICS MDB source folder exists and contains every canonical MDB required by the extractor.',
    requiresMdbDir: true,
    requiresBundle: false,
    runner: { type: 'internal', run: runMdbFolderCheck },
  },
  {
    id: 'check-mdb-table-coverage',
    label: 'Check MDB table coverage',
    group: 'check',
    description: 'Enumerates MDB tables and columns, then reports which tables are included in extraction and which remain pending.',
    requiresMdbDir: true,
    requiresBundle: false,
    runner: { type: 'internal', run: runMdbTableCoverageCheck },
  },
  {
    id: 'check-preflight',
    label: 'Check current environment',
    group: 'check',
    description: 'Checks DATABASE_URL, database connectivity, and current target table counts.',
    requiresBundle: false,
    runner: { type: 'internal', run: runPreflightCheck },
  },
  {
    id: 'export-bundle',
    label: 'Export conversion bundle',
    group: 'sequence',
    description: 'Creates the legacy CSV artifact pack, attribute snapshot, CRM sidecars, and bundle manifest.',
    requiresMdbDir: true,
    requiresBundle: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/cutover/render-conversion-export.ts', [
        '--out',
        requireBundleDir(config),
        '--mdb-dir',
        requireMdbDir(config),
        ...optionalPathArgs([
          ['--customer', config.customerCsvPath],
          ['--mail', config.mailListNamesCsvPath],
          ['--ticket-header', config.ticketHeaderCsvPath],
          ['--ticket-detail', config.ticketDetailCsvPath],
        ]),
      ]),
    },
  },
  {
    id: 'check-bundle',
    label: 'Check bundle files',
    group: 'check',
    description: 'Validates the bundle manifest, legacy manifest, attribute snapshot, and optional CRM files.',
    requiresBundle: true,
    runner: { type: 'internal', run: runBundleCheck },
  },
  {
    id: 'load-bundle',
    label: 'Load full bundle',
    group: 'sequence',
    description: 'Runs the full Render load wrapper in the approved order.',
    requiresBundle: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/cutover/render-conversion-load.ts', loadBundleArgs(config)),
    },
  },
  {
    id: 'post-load-checks',
    label: 'Run post-load checks',
    group: 'check',
    description: 'Checks the key imported table counts after a bundle load.',
    requiresBundle: false,
    runner: { type: 'internal', run: runPostLoadChecks },
  },
  {
    id: 'prisma-migrate-deploy',
    label: 'Prisma migrate deploy',
    group: 'individual',
    description: 'Applies pending Prisma migrations to the target database.',
    requiresBundle: false,
    runner: { type: 'command', build: () => pnpmExec(['exec', 'prisma', 'migrate', 'deploy']) },
  },
  {
    id: 'import-attributes',
    label: 'Import attributes',
    group: 'individual',
    description: 'Loads app/attribute-catalog-export.json into the attribute framework.',
    requiresBundle: true,
    requiresAttributeSnapshot: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/catalog/import-attribute-catalog.ts', ['--in', attributeSnapshotPath(config)]),
    },
  },
  {
    id: 'seed-taxonomy',
    label: 'Seed taxonomy from bundle',
    group: 'individual',
    description: 'Loads legacy taxonomy CSVs into app.taxonomy_*.',
    requiresBundle: true,
    requiresLegacyManifest: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/seeds/seed-taxonomy-from-mirror.ts', ['--manifest', legacyManifestPath(config)]),
    },
  },
  {
    id: 'seed-product-families',
    label: 'Seed product families',
    group: 'individual',
    description: 'Loads repo product-family and category-family seed CSVs.',
    requiresBundle: false,
    runner: { type: 'command', build: () => nodeScript('scripts/seeds/seed-product-families.ts') },
  },
  {
    id: 'import-skus',
    label: 'Import SKUs from bundle',
    group: 'individual',
    description: 'Loads inventory_master.csv into app.sku and app.sku_activity.',
    requiresBundle: true,
    requiresLegacyManifest: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/rics/sync/import-app-skus-from-artifact.ts', ['--manifest', legacyManifestPath(config)]),
    },
  },
  {
    id: 'seed-sku-attributes',
    label: 'Seed SKU attributes',
    group: 'individual',
    description: 'Derives keyword attributes from inventory_master.csv and repo rules.',
    requiresBundle: true,
    requiresLegacyManifest: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/seeds/seed-sku-attributes.ts', ['--manifest', legacyManifestPath(config)]),
    },
  },
  {
    id: 'import-reference-baselines',
    label: 'Import reference baselines',
    group: 'individual',
    description: 'Loads vendor/store/UPC/case-pack/future-price/purchasing/ASN/transfer baselines.',
    requiresBundle: true,
    requiresLegacyManifest: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/rics/sync/import-app-reference-baselines-from-artifact.ts', ['--manifest', legacyManifestPath(config)]),
    },
  },
  {
    id: 'import-replenishment-targets',
    label: 'Import replenishment targets',
    group: 'individual',
    description: 'Loads inventory_quantities.csv and size_types.csv into app.replenishment_target.',
    requiresBundle: true,
    requiresLegacyManifest: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/rics/sync/import-app-replenishment-targets-from-artifact.ts', ['--manifest', legacyManifestPath(config)]),
    },
  },
  {
    id: 'seed-segmentation-defaults',
    label: 'Seed segmentation defaults',
    group: 'individual',
    description: 'Loads default customer segmentation definitions.',
    requiresBundle: false,
    runner: { type: 'command', build: () => nodeScript('scripts/seeds/seed-segmentation-defaults.ts') },
  },
  {
    id: 'import-stock',
    label: 'Import stock and movements',
    group: 'individual',
    description: 'Loads inv_changes and inventory_quantities into stock movement and stock level tables.',
    requiresBundle: true,
    requiresLegacyManifest: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/rics/sync/import-app-stock-from-artifact.ts', ['--manifest', legacyManifestPath(config)]),
    },
  },
  {
    id: 'import-inventory-history',
    label: 'Import inventory history',
    group: 'individual',
    description: 'Loads inv_his.csv into inventory history aggregate tables.',
    requiresBundle: true,
    requiresLegacyManifest: true,
    runner: {
      type: 'command',
      build: (config) => {
        const args = ['--manifest', legacyManifestPath(config)];
        if (config.inventoryHistoryAsOf) args.push('--as-of', config.inventoryHistoryAsOf);
        return nodeScript('scripts/rics/sync/import-app-inventory-history-from-artifact.ts', args);
      },
    },
  },
  {
    id: 'import-customers',
    label: 'Import customers',
    group: 'individual',
    description: 'Loads Customer.csv and MailListNames.csv into customer tables.',
    requiresBundle: true,
    requiresCustomerFiles: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/customers/import-customers.ts', [
        '--customer',
        bundleCustomerPath(config, 'Customer.csv'),
        '--mail',
        bundleCustomerPath(config, 'MailListNames.csv'),
        '--source',
        'render_cutover_bundle',
      ]),
    },
  },
  {
    id: 'import-customer-transactions',
    label: 'Import ticket history',
    group: 'individual',
    description: 'Loads ticket_header.csv and ticket_detail.csv into sales history and KPI tables.',
    requiresBundle: true,
    requiresTicketFiles: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/customers/import-customer-transactions-from-rics.ts', [
        '--header',
        bundleCustomerPath(config, 'ticket_header.csv'),
        '--detail',
        bundleCustomerPath(config, 'ticket_detail.csv'),
        '--source',
        'render_cutover_bundle',
      ]),
    },
  },
];

const actionMap = new Map(actions.map((action) => [action.id, action]));

export function listMigrationActions(): MigrationActionDefinition[] {
  return actions.map(({ runner: _runner, ...action }) => action);
}

export function getMigrationJob(jobId: string): MigrationJobSnapshot | null {
  const job = jobs.get(jobId);
  return job ? snapshotJob(job) : null;
}

export function startMigrationJob(actionId: string, rawConfig: unknown): MigrationJobSnapshot {
  const action = actionMap.get(actionId);
  if (!action) {
    throw new Error(`Unknown migration action: ${actionId}`);
  }

  const config = normalizeConfig(rawConfig);
  pruneJobs();
  const activeJob = [...jobs.values()].find((job) => job.status === 'queued' || job.status === 'running');
  if (activeJob) {
    throw new Error(`Another migration job is already running: ${activeJob.actionLabel}`);
  }

  const now = new Date().toISOString();
  const job: MigrationJob = {
    id: randomUUID(),
    actionId,
    actionLabel: action.label,
    status: 'queued',
    startedAt: now,
    finishedAt: null,
    exitCode: null,
    durationMs: null,
    logs: [],
    result: null,
    error: null,
    append(stream, text) {
      for (const line of splitLogText(text)) {
        this.logs.push({ at: new Date().toISOString(), stream, text: line });
      }
      if (this.logs.length > MAX_LOG_LINES) {
        this.logs.splice(0, this.logs.length - MAX_LOG_LINES);
      }
    },
  };
  jobs.set(job.id, job);

  void runJob(job, action, config);
  return snapshotJob(job);
}

async function runJob(job: MigrationJob, action: ActionRegistration, config: MigrationActionConfig): Promise<void> {
  const started = Date.now();
  job.status = 'running';
  job.append('system', `Starting ${action.label}`);
  try {
    if (action.runner.type === 'command') {
      const spec = action.runner.build(config);
      job.append('system', formatCommandForLog(spec));
      job.exitCode = await runCommand(spec, job);
      if (job.exitCode === 0) {
        job.status = 'succeeded';
      } else {
        job.status = 'failed';
        job.error = `${action.label} exited with code ${job.exitCode}`;
      }
    } else {
      job.result = await action.runner.run(config, job);
      job.exitCode = 0;
      job.status = 'succeeded';
    }
  } catch (error) {
    job.status = 'failed';
    job.exitCode = 1;
    job.error = error instanceof Error ? error.message : String(error);
    job.append('stderr', job.error);
  } finally {
    job.finishedAt = new Date().toISOString();
    job.durationMs = Date.now() - started;
    job.append('system', `Finished ${action.label} with ${job.status}`);
  }
}

function runCommand(spec: CommandSpec, job: MigrationJob): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: process.env,
      shell: false,
    });

    child.stdout.on('data', (chunk) => job.append('stdout', String(chunk)));
    child.stderr.on('data', (chunk) => job.append('stderr', String(chunk)));
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function splitLogText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length > 0 ? lines : [''];
}

function formatCommandForLog(spec: CommandSpec): string {
  const redactedArgs = spec.args.map((arg) => arg.includes('://') ? redactUrl(arg) : arg);
  return `cwd=${spec.cwd} command=${spec.command} ${redactedArgs.join(' ')}`;
}

function redactUrl(value: string): string {
  return value.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

function snapshotJob(job: MigrationJob): MigrationJobSnapshot {
  return {
    id: job.id,
    actionId: job.actionId,
    actionLabel: job.actionLabel,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    exitCode: job.exitCode,
    durationMs: job.durationMs,
    logs: [...job.logs],
    result: job.result,
    error: job.error,
  };
}

function pruneJobs(): void {
  if (jobs.size < MAX_JOBS) return;
  const finished = [...jobs.values()]
    .filter((job) => job.status === 'succeeded' || job.status === 'failed')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const job of finished.slice(0, jobs.size - MAX_JOBS + 1)) {
    jobs.delete(job.id);
  }
}

async function withPg<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required.');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function runMdbFolderCheck(config: MigrationActionConfig, job: MigrationJob): Promise<unknown> {
  const mdbDir = requireMdbDir(config);
  const required = canonicalMdbRequirements();
  const report: {
    mdbDir: string;
    requiredCount: number;
    foundCount: number;
    missingCount: number;
    notImportedCount: number;
    extraMdbCount: number;
    found: Array<{ file: string; actualFile: string; path: string; sizeBytes: number; modifiedAt: string; tables: string[] }>;
    missing: Array<{ file: string; tables: string[] }>;
    notImported: Array<{ file: string; path: string; sizeBytes: number; modifiedAt: string; reason: string }>;
    extraMdbFiles: string[];
  } = {
    mdbDir,
    requiredCount: required.length,
    foundCount: 0,
    missingCount: 0,
    notImportedCount: 0,
    extraMdbCount: 0,
    found: [],
    missing: [],
    notImported: [],
    extraMdbFiles: [],
  };

  if (!fs.existsSync(mdbDir) || !fs.statSync(mdbDir).isDirectory()) {
    job.result = report;
    throw new Error(`MDB folder does not exist or is not a directory: ${mdbDir}`);
  }

  const entries = fs.readdirSync(mdbDir, { withFileTypes: true });
  const mdbFiles = entries
    .filter((entry) => entry.isFile() && /\.mdb$/i.test(entry.name))
    .map((entry) => entry.name);
  const actualByLower = new Map(mdbFiles.map((file) => [file.toLowerCase(), file]));
  const requiredByLower = new Set(required.map((item) => item.file.toLowerCase()));

  for (const item of required) {
    const actualFile = actualByLower.get(item.file.toLowerCase());
    if (!actualFile) {
      report.missing.push({ file: item.file, tables: item.tables });
      continue;
    }
    const filePath = path.join(mdbDir, actualFile);
    const stat = fs.statSync(filePath);
    report.found.push({
      file: item.file,
      actualFile,
      path: filePath,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      tables: item.tables,
    });
  }

  report.notImported = mdbFiles
    .filter((file) => !requiredByLower.has(file.toLowerCase()))
    .map((file) => {
      const filePath = path.join(mdbDir, file);
      const stat = fs.statSync(filePath);
      return {
        file,
        path: filePath,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        reason: classifyNotImportedMdb(file),
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
  report.extraMdbFiles = report.notImported.map((file) => file.file);
  report.found.sort((a, b) => a.file.localeCompare(b.file));
  report.missing.sort((a, b) => a.file.localeCompare(b.file));
  report.foundCount = report.found.length;
  report.missingCount = report.missing.length;
  report.notImportedCount = report.notImported.length;
  report.extraMdbCount = report.extraMdbFiles.length;

  job.append(
    'stdout',
    `MDB folder report: required=${report.requiredCount} found=${report.foundCount} missing=${report.missingCount} notImported=${report.notImportedCount}`,
  );
  if (report.found.length > 0) {
    job.append('stdout', `Found MDBs: ${report.found.map((file) => file.actualFile).join(', ')}`);
  }
  if (report.notImported.length > 0) {
    job.append('stdout', `Not imported MDBs present in folder: ${report.notImported.map((file) => file.file).join(', ')}`);
  }
  if (report.missing.length > 0) {
    job.append('stderr', `Missing MDBs: ${report.missing.map((file) => file.file).join(', ')}`);
    job.result = report;
    throw new Error(`MDB folder check failed. Missing ${report.missingCount} required MDB file(s).`);
  }

  return report;
}

function classifyNotImportedMdb(fileName: string): string {
  if (/\.backup-/i.test(fileName)) return 'backup copy';
  if (/INVDETTEMP/i.test(fileName)) return 'physical inventory temp file';
  if (/^RICOUNT/i.test(fileName)) return 'physical inventory count file';
  if (/^USER[A-Z]+\.mdb$/i.test(fileName)) return 'per-user scratch file';
  if (/copia/i.test(fileName)) return 'manual copy';
  if (/^RITRANS\d+\.mdb$/i.test(fileName) || /\d{5,6}\.mdb$/i.test(fileName)) return 'dated or numbered transaction copy';
  return 'present in folder but not in canonical import allowlist';
}

interface MdbTableSchemaRow {
  table: string;
  columns: Array<{ name: string; ordinal: number }>;
}

async function runMdbTableCoverageCheck(config: MigrationActionConfig, job: MigrationJob): Promise<unknown> {
  const mdbDir = requireMdbDir(config);
  if (!fs.existsSync(mdbDir) || !fs.statSync(mdbDir).isDirectory()) {
    throw new Error(`MDB folder does not exist or is not a directory: ${mdbDir}`);
  }

  const canonical = canonicalSourceTableSet();
  const files = fs.readdirSync(mdbDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.mdb$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const tables: Array<{
    sourceMdbFile: string;
    sourceTable: string;
    totalColumns: number;
    extractedColumns: number;
    totalFields: number;
    importedFields: number;
    extractionStatus: 'included' | 'pending';
    migrationProcedureStatus: 'included_in_current_extraction' | 'pending_to_add';
    note: string;
  }> = [];
  const fileFailures: Array<{ sourceMdbFile: string; path: string; error: string }> = [];

  for (const file of files) {
    const dbPath = path.join(mdbDir, file);
    job.append('system', `Inspecting MDB table coverage: ${file}`);
    let password: string;
    try {
      password = getOrRecoverPassword(dbPath);
    } catch (error) {
      fileFailures.push({ sourceMdbFile: file, path: dbPath, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    let schemaRows: MdbTableSchemaRow[];
    try {
      const raw = await runPowerShellJson<MdbTableSchemaRow[] | MdbTableSchemaRow>(buildListTablesWithColumnsScript(dbPath, password));
      schemaRows = Array.isArray(raw) ? raw : [raw];
    } catch (error) {
      fileFailures.push({ sourceMdbFile: file, path: dbPath, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    for (const row of schemaRows) {
      if (!row?.table) continue;
      const totalColumns = Array.isArray(row.columns) ? row.columns.length : 0;
      const isIncluded = canonical.has(canonicalKey(file, row.table));
      tables.push({
        sourceMdbFile: file,
        sourceTable: row.table,
        totalColumns,
        extractedColumns: isIncluded ? totalColumns : 0,
        totalFields: totalColumns,
        importedFields: isIncluded ? totalColumns : 0,
        extractionStatus: isIncluded ? 'included' : 'pending',
        migrationProcedureStatus: isIncluded ? 'included_in_current_extraction' : 'pending_to_add',
        note: isIncluded
          ? 'Included in the canonical CSV extraction. The extraction imports every source column into the artifact CSV.'
          : 'Pending to be added to the extraction and migration procedure.',
      });
    }
  }

  tables.sort((a, b) => `${a.sourceMdbFile}.${a.sourceTable}`.localeCompare(`${b.sourceMdbFile}.${b.sourceTable}`));
  const includedTables = tables.filter((table) => table.extractionStatus === 'included');
  const pendingTables = tables.filter((table) => table.extractionStatus === 'pending');
  const totalColumns = tables.reduce((sum, table) => sum + table.totalColumns, 0);
  const extractedColumns = tables.reduce((sum, table) => sum + table.extractedColumns, 0);
  const report = {
    mdbDir,
    fileCount: files.length,
    filesScanned: files.length - fileFailures.length,
    fileFailures,
    tableCount: tables.length,
    includedTableCount: includedTables.length,
    pendingTableCount: pendingTables.length,
    totalColumns,
    extractedColumns,
    pendingColumns: totalColumns - extractedColumns,
    totalFields: totalColumns,
    importedFields: extractedColumns,
    pendingFields: totalColumns - extractedColumns,
    tables,
  };

  job.append(
    'stdout',
    `MDB table coverage: files=${report.fileCount} scanned=${report.filesScanned} failures=${fileFailures.length} tables=${report.tableCount} included=${report.includedTableCount} pending=${report.pendingTableCount} columns=${report.extractedColumns}/${report.totalColumns}`,
  );
  if (pendingTables.length > 0) {
    job.append('stdout', `Pending tables: ${pendingTables.slice(0, 80).map((table) => `${table.sourceMdbFile}/${table.sourceTable}`).join(', ')}`);
  }
  if (fileFailures.length > 0) {
    job.append('stderr', `MDB files not readable for table coverage: ${fileFailures.map((failure) => failure.sourceMdbFile).join(', ')}`);
  }

  return report;
}

function canonicalSourceTableSet(): Set<string> {
  const out = new Set<string>();
  for (const mdb of CANONICAL_MDBS) {
    for (const table of mdb.tables) out.add(canonicalKey(mdb.file, table));
  }
  return out;
}

function canonicalKey(file: string, table: string): string {
  return `${file.toLowerCase()}::${table.toLowerCase()}`;
}

function buildListTablesWithColumnsScript(dbPath: string, password: string): string {
  return `
$ErrorActionPreference = 'Stop'
$dbPath = '${escapePowerShellLiteral(dbPath)}'
$password = '${escapePowerShellLiteral(password)}'
$cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath;Jet OLEDB:Database Password=$password;Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($cs)
$conn.Open()
try {
  $schema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Tables, $null)
  $result = New-Object System.Collections.ArrayList
  foreach ($row in $schema.Rows) {
    $name = [string]$row['TABLE_NAME']
    $type = [string]$row['TABLE_TYPE']
    if ($name -like 'MSys*') { continue }
    if ($name -like '~*') { continue }
    if ($type -eq 'VIEW') { continue }
    if ($type -eq 'SYSTEM TABLE') { continue }
    if ($type -eq 'ACCESS TABLE') { continue }

    $colSchema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Columns, @($null, $null, $name, $null))
    $cols = New-Object System.Collections.ArrayList
    foreach ($c in $colSchema.Rows) {
      [void]$cols.Add([PSCustomObject]@{
        name = [string]$c['COLUMN_NAME']
        ordinal = [int]$c['ORDINAL_POSITION']
      })
    }
    [void]$result.Add([PSCustomObject]@{
      table = $name
      columns = @($cols | Sort-Object -Property ordinal)
    })
  }
  @($result) | Sort-Object -Property table | ConvertTo-Json -Depth 5 -Compress
} finally {
  $conn.Close()
}
`;
}

function canonicalMdbRequirements(): Array<{ file: string; tables: string[] }> {
  const byFile = new Map<string, Set<string>>();
  for (const mdb of CANONICAL_MDBS) {
    const current = byFile.get(mdb.file) ?? new Set<string>();
    for (const table of mdb.tables) current.add(table);
    byFile.set(mdb.file, current);
  }
  return [...byFile.entries()]
    .map(([file, tables]) => ({ file, tables: [...tables].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

async function runPreflightCheck(config: MigrationActionConfig, job: MigrationJob): Promise<unknown> {
  const checks: Array<{ name: string; status: 'pass' | 'fail' | 'warn'; detail: string }> = [];
  if (process.env.DATABASE_URL) {
    checks.push({ name: 'DATABASE_URL', status: 'pass', detail: 'present' });
  } else {
    checks.push({ name: 'DATABASE_URL', status: 'fail', detail: 'missing' });
  }

  if (config.bundleDir) {
    const parent = path.dirname(path.resolve(config.bundleDir));
    checks.push({
      name: 'Bundle parent folder',
      status: fs.existsSync(parent) ? 'pass' : 'warn',
      detail: parent,
    });
  } else {
    checks.push({ name: 'Bundle directory', status: 'warn', detail: 'not configured yet' });
  }

  let counts: Record<string, number> = {};
  if (process.env.DATABASE_URL) {
    counts = await queryCounts([
      ['app.sku', 'sku'],
      ['app.vendor', 'vendor'],
      ['app.store_master', 'storeMaster'],
      ['app.stock_level', 'stockLevel'],
      ['app.stock_movement', 'stockMovement'],
      ['app.replenishment_target', 'replenishmentTarget'],
      ['app.customer', 'customer'],
      ['app.sales_history_ticket', 'salesHistoryTicket'],
    ]);
    checks.push({ name: 'Postgres connection', status: 'pass', detail: 'connected and count queries completed' });
    job.append('stdout', `Current data counts: ${JSON.stringify(counts)}`);
  }

  if (checks.some((check) => check.status === 'fail')) {
    throw new Error(`Preflight failed: ${checks.filter((check) => check.status === 'fail').map((check) => check.name).join(', ')}`);
  }
  return { checks, counts };
}

async function runBundleCheck(config: MigrationActionConfig, job: MigrationJob): Promise<unknown> {
  const bundleDir = requireBundleDir(config);
  const requiredFiles = [
    path.join(bundleDir, 'bundle-manifest.json'),
    path.join(bundleDir, 'legacy', 'manifest.json'),
    path.join(bundleDir, 'app', 'attribute-catalog-export.json'),
  ];
  const missing = requiredFiles.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    throw new Error(`Bundle check failed. Missing: ${missing.join(', ')}`);
  }

  const legacyManifest = JSON.parse(fs.readFileSync(path.join(bundleDir, 'legacy', 'manifest.json'), 'utf8')) as {
    tables?: Array<{ targetTable?: string; csvFile?: string; rowCount?: number }>;
  };
  const tables = Array.isArray(legacyManifest.tables) ? legacyManifest.tables : [];
  if (tables.length === 0) {
    throw new Error('Bundle check failed. legacy/manifest.json has no tables.');
  }

  const missingCsvs: string[] = [];
  for (const table of tables) {
    if (!table.csvFile) continue;
    const csvPath = path.join(bundleDir, 'legacy', table.csvFile);
    if (!fs.existsSync(csvPath)) missingCsvs.push(csvPath);
  }
  if (missingCsvs.length > 0) {
    throw new Error(`Bundle check failed. Missing CSV files: ${missingCsvs.slice(0, 8).join(', ')}`);
  }

  const optional = {
    customer: fs.existsSync(path.join(bundleDir, 'crm', 'Customer.csv')),
    mail: fs.existsSync(path.join(bundleDir, 'crm', 'MailListNames.csv')),
    ticketHeader: fs.existsSync(path.join(bundleDir, 'crm', 'ticket_header.csv')),
    ticketDetail: fs.existsSync(path.join(bundleDir, 'crm', 'ticket_detail.csv')),
  };
  job.append('stdout', `Bundle tables=${tables.length} optional=${JSON.stringify(optional)}`);
  return { bundleDir, tableCount: tables.length, optional };
}

async function runPostLoadChecks(_config: MigrationActionConfig, job: MigrationJob): Promise<unknown> {
  const counts = await queryCounts([
    ['app.sku', 'sku'],
    ['app.vendor', 'vendor'],
    ['app.store_master', 'storeMaster'],
    ['app.stock_level', 'stockLevel'],
    ['app.stock_movement', 'stockMovement'],
    ['app.replenishment_target', 'replenishmentTarget'],
    ['app.taxonomy_category', 'taxonomyCategory'],
    ['app.product_family', 'productFamily'],
    ['app.category_product_family', 'categoryProductFamily'],
    ['app.inventory_history_snapshot', 'inventoryHistorySnapshot'],
    ['app.inventory_history_month', 'inventoryHistoryMonth'],
    ['app.inventory_history_trend_week', 'inventoryHistoryTrendWeek'],
    ['app.inventory_history_movement_bucket', 'inventoryHistoryMovementBucket'],
    ['app.customer', 'customer'],
    ['app.sales_history_ticket', 'salesHistoryTicket'],
    ['app.sales_history_ticket_line', 'salesHistoryTicketLine'],
  ]);

  const required = [
    'sku',
    'vendor',
    'storeMaster',
    'stockLevel',
    'stockMovement',
    'replenishmentTarget',
    'taxonomyCategory',
    'productFamily',
    'categoryProductFamily',
  ];
  const zeroRequired = required.filter((key) => (counts[key] ?? 0) <= 0);
  job.append('stdout', `Post-load counts: ${JSON.stringify(counts)}`);
  if (zeroRequired.length > 0) {
    throw new Error(`Post-load checks failed. Required tables with zero rows: ${zeroRequired.join(', ')}`);
  }
  return { counts, zeroRequired };
}

async function queryCounts(pairs: Array<[string, string]>): Promise<Record<string, number>> {
  return withPg(async (client) => {
    const out: Record<string, number> = {};
    for (const [tableRef, key] of pairs) {
      const exists = await tableExists(client, tableRef);
      if (!exists) {
        out[key] = 0;
        continue;
      }
      const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${quoteQualifiedRef(tableRef)}`);
      out[key] = Number(result.rows[0]?.count ?? 0);
    }
    return out;
  });
}

async function tableExists(client: Client, tableRef: string): Promise<boolean> {
  const [schema, table] = tableRef.split('.');
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = $1
         AND table_name = $2
     ) AS exists`,
    [schema, table],
  );
  return result.rows[0]?.exists === true;
}

function quoteQualifiedRef(ref: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(ref)) {
    throw new Error(`Invalid table reference: ${ref}`);
  }
  return ref
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
}
