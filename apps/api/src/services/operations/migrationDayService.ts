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

export type MigrationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'stale';
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
  inventoryHistoryAsOf?: string;
  skipInventoryHistory?: boolean;
  skipCustomers?: boolean;
  skipTickets?: boolean;
  skipSalesHistory?: boolean;
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
const JOB_STORE_DIR = path.join(API_DIR, '.tmp', 'migration-day-jobs');

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
    inventoryHistoryAsOf: cleanString(body.inventoryHistoryAsOf) ?? undefined,
    skipInventoryHistory: bool(body.skipInventoryHistory),
    skipCustomers: bool(body.skipCustomers),
    skipTickets: bool(body.skipTickets) || bool(body.skipSalesHistory) || bool(body.skipCustomerTransactions),
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

function appDataSnapshotPath(config: MigrationActionConfig): string {
  return path.join(requireBundleDir(config), 'app', 'app-data-export.json');
}

function bundleLegacyPath(config: MigrationActionConfig, fileName: string): string {
  return path.join(requireBundleDir(config), 'legacy', fileName);
}

function loadBundleArgs(config: MigrationActionConfig): string[] {
  const args = ['--bundle', requireBundleDir(config)];
  if (config.strictFull) args.push('--strict-full');
  if (config.skipInventoryHistory) args.push('--skip-inventory-history');
  if (config.skipCustomers) args.push('--skip-customers');
  if (config.skipTickets || config.skipSalesHistory) args.push('--skip-tickets');
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
    label: 'Deep MDB table coverage audit',
    group: 'check',
    description: 'Optional deep diagnostic. Opens MDB files and enumerates tables/columns to show which sources are included in extraction and which remain pending.',
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
    label: 'Extract CSV files',
    group: 'sequence',
    description: 'Extracts canonical CSV files from the RICS MDB folder and writes the legacy bundle manifest.',
    requiresMdbDir: true,
    requiresBundle: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/cutover/render-conversion-export.ts', [
        '--out',
        requireBundleDir(config),
        '--mdb-dir',
        requireMdbDir(config),
      ]),
    },
  },
  {
    id: 'export-app-data',
    label: 'Export app-created Postgres data',
    group: 'sequence',
    description: 'Exports app-owned Postgres data into app/attribute-catalog-export.json and app/app-data-export.json.',
    requiresBundle: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/cutover/render-conversion-export-app-data.ts', [
        '--bundle',
        requireBundleDir(config),
      ]),
    },
  },
  {
    id: 'check-bundle',
    label: 'Check bundle files',
    group: 'check',
    description: 'Validates the bundle manifest, legacy manifest, attribute snapshot, app-created data snapshot, and optional files.',
    requiresBundle: true,
    runner: { type: 'internal', run: runBundleCheck },
  },
  {
    id: 'load-bundle',
    label: 'Import mapped CSVs into Postgres',
    group: 'sequence',
    description: 'Loads the extracted CSV bundle into the mapped app tables in Postgres.',
    requiresBundle: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/cutover/render-conversion-load.ts', loadBundleArgs(config)),
    },
  },
  {
    id: 'post-load-checks',
    label: 'Verify data is up to date',
    group: 'check',
    description: 'Checks key imported table counts, bundle metadata, and table freshness after the load.',
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
    id: 'import-app-data',
    label: 'Import app-created data',
    group: 'individual',
    description: 'Loads app/app-data-export.json into app-created Postgres tables.',
    requiresBundle: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/cutover/import-app-created-data.ts', ['--in', appDataSnapshotPath(config)]),
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
    id: 'seed-legacy-ref-dimensions',
    label: 'Seed SKU form attribute values',
    group: 'individual',
    description: 'Mirrors SKU-entry reference dropdowns into app.attribute_dimension/app.attribute_value.',
    requiresBundle: false,
    runner: { type: 'command', build: () => nodeScript('scripts/seeds/seed-legacy-ref-dimensions.ts') },
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
    id: 'import-native-purchase-orders',
    label: 'Import native purchase orders',
    group: 'individual',
    description: 'Rebuilds native purchase order headers, lines, size cells, and status history from purchase_master.csv and purchase_detail.csv.',
    requiresBundle: true,
    requiresLegacyManifest: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/rics/sync/import-native-purchase-orders-from-artifact.ts', ['--manifest', legacyManifestPath(config)]),
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
        return nodeScript('scripts/rics/sync/import-inventory-history-from-csv-bundle.ts', args);
      },
    },
  },
  {
    id: 'import-customers',
    label: 'Import customers',
    group: 'individual',
    description: 'Loads customer master data from the RIMAIL MDB artifact tables into customer tables.',
    requiresBundle: true,
    requiresLegacyManifest: true,
    runner: {
      type: 'command',
      build: (config) => nodeScript('scripts/customers/import-customers-bulk.ts', [
        '--manifest',
        legacyManifestPath(config),
        '--source',
        'render_cutover_bundle',
        '--replace',
      ]),
    },
  },
  {
    id: 'import-tickets',
    label: 'Import tickets',
    group: 'individual',
    description: 'Loads canonical RITRNSSV ticket header/detail/tender CSVs into app ticket tables, then refreshes derived reporting facts.',
    requiresBundle: true,
    requiresTicketFiles: true,
    runner: {
      type: 'command',
      build: (config) => {
        const headerPath = bundleLegacyPath(config, 'ticket_header.csv');
        const detailPath = bundleLegacyPath(config, 'ticket_detail.csv');
        const tenderPath = bundleLegacyPath(config, 'ticket_tender.csv');
        const args = [
          '--header',
          headerPath,
          '--detail',
          detailPath,
          '--no-csv-header',
          '--source',
          'render_cutover_bundle',
        ];
        if (fs.existsSync(tenderPath)) {
          args.push('--tender', tenderPath, '--tender-no-csv-header');
        }
        return nodeScript('scripts/sales/import-rics-tickets.ts', args);
      },
    },
  },
];

const actionMap = new Map(actions.map((action) => [action.id, action]));
loadPersistedJobs();

export function listMigrationActions(): MigrationActionDefinition[] {
  return actions.map(({ runner: _runner, ...action }) => action);
}

export function getMigrationJob(jobId: string): MigrationJobSnapshot | null {
  const job = jobs.get(jobId);
  return job ? snapshotJob(job) : null;
}

export function listMigrationJobs(): MigrationJobSnapshot[] {
  return [...jobs.values()]
    .map((job) => snapshotJob(job))
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

export async function recoverMigrationState(rawConfig: unknown): Promise<MigrationJobSnapshot[]> {
  const config = normalizeConfig(rawConfig);
  const recovered: MigrationJobSnapshot[] = [];

  try {
    const mdbDir = requireMdbDir(config);
    const folderReport = inspectMdbFolder(mdbDir);
    if (folderReport.missingCount === 0) {
      recovered.push(recoveredJob('check-mdb-folder', 'Recovered from current MDB folder.', folderReport));
    }
  } catch {
    // Recovery is best-effort; a missing source folder should not hide bundle/db progress.
  }

  const bundleReport = inspectBundle(config);
  if (bundleReport?.legacyOk) {
    recovered.push(recoveredJob('export-bundle', 'Recovered from existing legacy CSV bundle files.', bundleReport.legacy));
  }
  if (bundleReport?.appDataOk) {
    recovered.push(recoveredJob('export-app-data', 'Recovered from existing app-created data snapshot files.', bundleReport.app));
  }
  if (bundleReport?.bundleOk) {
    recovered.push(recoveredJob('check-bundle', 'Recovered from complete bundle files.', bundleReport));
  }

  if (process.env.DATABASE_URL) {
    try {
      recovered.push(recoveredJob('check-preflight', 'Recovered from successful Postgres connection.', { databaseUrl: 'present' }));
      const hasLoadedData = await targetDatabaseLooksLoaded(bundleReport);
      if (hasLoadedData) {
        recovered.push(recoveredJob('load-bundle', 'Recovered from non-empty required import tables in Postgres.', { requiredTablesHaveRows: true }));
      }
    } catch {
      // Leave database-backed steps unrecovered if the target cannot be reached.
    }
  }

  return recovered;
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
      persistJob(this);
    },
  };
  jobs.set(job.id, job);
  persistJob(job);

  void runJob(job, action, config);
  return snapshotJob(job);
}

async function runJob(job: MigrationJob, action: ActionRegistration, config: MigrationActionConfig): Promise<void> {
  const started = Date.now();
  job.status = 'running';
  persistJob(job);
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
    persistJob(job);
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

function jobFromSnapshot(snapshot: MigrationJobSnapshot): MigrationJob {
  return {
    ...snapshot,
    logs: [...snapshot.logs],
    append(stream, text) {
      for (const line of splitLogText(text)) {
        this.logs.push({ at: new Date().toISOString(), stream, text: line });
      }
      if (this.logs.length > MAX_LOG_LINES) {
        this.logs.splice(0, this.logs.length - MAX_LOG_LINES);
      }
      persistJob(this);
    },
  };
}

function jobStorePath(jobId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    throw new Error(`Invalid migration job id: ${jobId}`);
  }
  return path.join(JOB_STORE_DIR, `${jobId}.json`);
}

function persistJob(job: MigrationJob): void {
  try {
    fs.mkdirSync(JOB_STORE_DIR, { recursive: true });
    const filePath = jobStorePath(job.id);
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(snapshotJob(job), null, 2));
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    console.warn(
      `[migration-day] failed to persist job ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function loadPersistedJobs(): void {
  if (!fs.existsSync(JOB_STORE_DIR)) return;
  const files = fs.readdirSync(JOB_STORE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(JOB_STORE_DIR, entry.name));

  for (const file of files) {
    try {
      const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as MigrationJobSnapshot;
      if (!snapshot?.id || typeof snapshot.actionId !== 'string') continue;
      const job = jobFromSnapshot(snapshot);
      if (job.status === 'queued' || job.status === 'running') {
        const now = new Date().toISOString();
        job.status = 'stale';
        job.finishedAt = now;
        job.durationMs = job.durationMs ?? Math.max(0, Date.parse(now) - Date.parse(job.startedAt));
        job.error = 'API restarted while this job was running, so live process tracking was lost. Run verification or rerun this step if recovery does not mark it complete.';
        job.append('system', 'Marked stale: API restarted while this job was running, so live process tracking was lost.');
      }
      jobs.set(job.id, job);
    } catch (error) {
      console.warn(
        `[migration-day] failed to load persisted job ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  pruneJobs();
}

function pruneJobs(): void {
  if (jobs.size < MAX_JOBS) return;
  const finished = [...jobs.values()]
    .filter((job) => job.status === 'succeeded' || job.status === 'failed' || job.status === 'stale')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const job of finished.slice(0, jobs.size - MAX_JOBS + 1)) {
    jobs.delete(job.id);
    try {
      fs.unlinkSync(jobStorePath(job.id));
    } catch {
      // Pruning is best-effort; stale files do not affect active jobs.
    }
  }
}

function recoveredJob(actionId: string, message: string, result: unknown): MigrationJobSnapshot {
  const action = actionMap.get(actionId);
  const now = new Date().toISOString();
  return {
    id: `recovered:${actionId}`,
    actionId,
    actionLabel: action?.label ?? actionId,
    status: 'succeeded',
    startedAt: now,
    finishedAt: now,
    exitCode: 0,
    durationMs: 0,
    logs: [{ at: now, stream: 'system', text: message }],
    result,
    error: null,
  };
}

function inspectMdbFolder(mdbDir: string) {
  const required = canonicalMdbRequirements();
  const report: {
    mdbDir: string;
    requiredCount: number;
    foundCount: number;
    missingCount: number;
    found: Array<{ file: string; actualFile: string; path: string; sizeBytes: number; modifiedAt: string; tables: string[] }>;
    missing: Array<{ file: string; tables: string[] }>;
  } = {
    mdbDir,
    requiredCount: required.length,
    foundCount: 0,
    missingCount: 0,
    found: [],
    missing: [],
  };

  if (!fs.existsSync(mdbDir) || !fs.statSync(mdbDir).isDirectory()) return report;

  const mdbFiles = fs.readdirSync(mdbDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.mdb$/i.test(entry.name))
    .map((entry) => entry.name);
  const actualByLower = new Map(mdbFiles.map((file) => [file.toLowerCase(), file]));

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

  report.foundCount = report.found.length;
  report.missingCount = report.missing.length;
  return report;
}

function inspectBundle(config: MigrationActionConfig): {
  bundleOk: boolean;
  legacyOk: boolean;
  appDataOk: boolean;
  createdAt: string | null;
  legacyExtractedAt: string | null;
  targetRowCounts: Record<string, number>;
  legacy: unknown;
  app: unknown;
  missing: string[];
} | null {
  const bundleDir = cleanString(config.bundleDir);
  if (!bundleDir) return null;
  const absoluteBundleDir = path.resolve(bundleDir);
  const bundleManifestPath = path.join(absoluteBundleDir, 'bundle-manifest.json');
  const legacyManifestPath = path.join(absoluteBundleDir, 'legacy', 'manifest.json');
  const attributePath = path.join(absoluteBundleDir, 'app', 'attribute-catalog-export.json');
  const appDataPath = path.join(absoluteBundleDir, 'app', 'app-data-export.json');
  const requiredFiles = [bundleManifestPath, legacyManifestPath, attributePath, appDataPath];
  const missing = requiredFiles.filter((file) => !fs.existsSync(file));

  let createdAt: string | null = null;
  if (fs.existsSync(bundleManifestPath)) {
    const bundleManifest = JSON.parse(fs.readFileSync(bundleManifestPath, 'utf8')) as { createdAt?: string };
    createdAt = typeof bundleManifest.createdAt === 'string' ? bundleManifest.createdAt : null;
  }

  let legacyExtractedAt: string | null = null;
  let tableCount = 0;
  let rowCount = 0;
  let targetRowCounts: Record<string, number> = {};
  let missingCsvs: string[] = [];
  if (fs.existsSync(legacyManifestPath)) {
    const legacyManifest = JSON.parse(fs.readFileSync(legacyManifestPath, 'utf8')) as {
      extractedAt?: string;
      tables?: Array<{ targetTable?: string; csvFile?: string; rowCount?: number }>;
    };
    legacyExtractedAt = typeof legacyManifest.extractedAt === 'string' ? legacyManifest.extractedAt : null;
    const tables = Array.isArray(legacyManifest.tables) ? legacyManifest.tables : [];
    tableCount = tables.length;
    rowCount = tables.reduce((sum, table) => sum + Number(table.rowCount ?? 0), 0);
    targetRowCounts = {};
    for (const table of tables) {
      if (table.targetTable) targetRowCounts[table.targetTable] = Number(table.rowCount ?? 0);
    }
    missingCsvs = tables
      .map((table) => table.csvFile ? path.join(absoluteBundleDir, 'legacy', table.csvFile) : null)
      .filter((file): file is string => file != null && !fs.existsSync(file));
  }

  const legacyOk = fs.existsSync(legacyManifestPath) && tableCount > 0 && missingCsvs.length === 0;
  const appDataOk = fs.existsSync(attributePath) && fs.existsSync(appDataPath);
  return {
    bundleOk: missing.length === 0 && legacyOk && appDataOk,
    legacyOk,
    appDataOk,
    createdAt,
    legacyExtractedAt,
    targetRowCounts,
    legacy: { bundleDir: absoluteBundleDir, tableCount, rowCount, missingCsvs },
    app: { attributePath, appDataPath },
    missing: [...missing, ...missingCsvs],
  };
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

async function targetDatabaseLooksLoaded(bundleReport: ReturnType<typeof inspectBundle>): Promise<boolean> {
  const requiredTables = [
    'app.sku',
    'app.vendor',
    'app.store_master',
    'app.stock_level',
    'app.stock_movement',
    'app.replenishment_target',
    'app.taxonomy_category',
    'app.product_family',
    'app.category_product_family',
  ];
  return withPg(async (client) => {
    for (const tableRef of requiredTables) {
      if (!await tableExists(client, tableRef)) return false;
      const result = await client.query<{ has_rows: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM ${quoteQualifiedRef(tableRef)} LIMIT 1) AS has_rows`,
      );
      if (result.rows[0]?.has_rows !== true) return false;
    }

    const loadedAfter = bundleReport?.createdAt ?? bundleReport?.legacyExtractedAt ?? null;
    const targetRowCounts = bundleReport?.targetRowCounts ?? {};
    if (loadedAfter && targetRowCounts.mail_list_names > 0) {
      const customersFresh = await tableHasTimestampAtOrAfter(client, 'app.customer', ['updated_at', 'created_at'], loadedAfter);
      if (!customersFresh) return false;
    }
    if (loadedAfter && targetRowCounts.ticket_header > 0 && targetRowCounts.ticket_detail > 0) {
      const ticketsFresh = await tableHasTimestampAtOrAfter(
        client,
        'app.sales_history_ticket',
        ['updated_at', 'created_at'],
        loadedAfter,
      );
      if (!ticketsFresh) return false;
    }

    return true;
  });
}

async function tableHasTimestampAtOrAfter(
  client: Client,
  tableRef: string,
  candidateColumns: string[],
  isoTimestamp: string,
): Promise<boolean> {
  const [schema, table] = tableRef.split('.');
  if (!await tableExists(client, tableRef)) return false;
  const columns = await existingColumns(client, schema, table, candidateColumns);
  for (const column of columns) {
    const result = await client.query<{ ok: boolean }>(
      `SELECT COALESCE(MAX(${quoteIdent(column)}) >= $1::timestamptz, false) AS ok FROM ${quoteQualifiedRef(tableRef)}`,
      [isoTimestamp],
    );
    if (result.rows[0]?.ok === true) return true;
  }
  return false;
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
      ['app.ticket_header', 'ticketHeader'],
      ['app.ticket_detail', 'ticketDetail'],
      ['app.ticket_tender', 'ticketTender'],
      ['app.purchase_order', 'purchaseOrder'],
      ['app.purchase_order_line', 'purchaseOrderLine'],
      ['app.store_group', 'storeGroup'],
      ['app.store_group_member', 'storeGroupMember'],
      ['app.purchase_plan', 'purchasePlan'],
      ['app.matching_set', 'matchingSet'],
      ['app.import_shipment', 'importShipment'],
      ['app.vendor_overlay', 'vendorOverlay'],
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
    path.join(bundleDir, 'app', 'app-data-export.json'),
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
    appDataSnapshot: fs.existsSync(path.join(bundleDir, 'app', 'app-data-export.json')),
    customerArtifact: tables.some((table) => table.targetTable === 'mail_list_family')
      && tables.some((table) => table.targetTable === 'mail_list_names'),
    ticketHeader: fs.existsSync(path.join(bundleDir, 'legacy', 'ticket_header.csv')),
    ticketDetail: fs.existsSync(path.join(bundleDir, 'legacy', 'ticket_detail.csv')),
    ticketTender: fs.existsSync(path.join(bundleDir, 'legacy', 'ticket_tender.csv')),
  };
  job.append('stdout', `Bundle tables=${tables.length} optional=${JSON.stringify(optional)}`);
  return { bundleDir, tableCount: tables.length, optional };
}

async function runPostLoadChecks(config: MigrationActionConfig, job: MigrationJob): Promise<unknown> {
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
    ['app.ticket_header', 'ticketHeader'],
    ['app.ticket_detail', 'ticketDetail'],
    ['app.ticket_tender', 'ticketTender'],
    ['app.purchase_order', 'purchaseOrder'],
    ['app.purchase_order_line', 'purchaseOrderLine'],
    ['app.store_group', 'storeGroup'],
    ['app.store_group_member', 'storeGroupMember'],
    ['app.purchase_plan', 'purchasePlan'],
    ['app.matching_set', 'matchingSet'],
    ['app.import_shipment', 'importShipment'],
    ['app.vendor_overlay', 'vendorOverlay'],
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
  const freshness = await queryFreshness([
    ['app.sku', 'sku', ['rics_last_synced_at', 'updated_at', 'created_at']],
    ['app.vendor', 'vendor', ['updated_at', 'created_at']],
    ['app.store_master', 'storeMaster', ['updated_at', 'created_at']],
    ['app.stock_level', 'stockLevel', ['updated_at', 'created_at']],
    ['app.stock_movement', 'stockMovement', ['created_at', 'movement_at']],
    ['app.replenishment_target', 'replenishmentTarget', ['updated_at', 'created_at']],
    ['app.customer', 'customer', ['updated_at', 'created_at']],
    ['app.sales_history_ticket', 'salesHistoryTicket', ['updated_at', 'created_at', 'purchased_at']],
    ['app.ticket_header', 'ticketHeader', ['imported_at']],
    ['app.purchase_order', 'purchaseOrder', ['updated_at', 'created_at']],
  ]);
  const bundle = readBundleSummary(config);

  job.append('stdout', `Post-load counts: ${JSON.stringify(counts)}`);
  if (bundle) {
    job.append(
      'stdout',
      `Bundle summary: extractedAt=${bundle.legacyExtractedAt ?? 'n/a'} createdAt=${bundle.createdAt ?? 'n/a'} tables=${bundle.legacyTableCount ?? 'n/a'} rows=${bundle.legacyRowCount ?? 'n/a'}`,
    );
  }
  job.append('stdout', `Freshness summary: ${JSON.stringify(freshness)}`);
  if (zeroRequired.length > 0) {
    throw new Error(`Post-load checks failed. Required tables with zero rows: ${zeroRequired.join(', ')}`);
  }
  return { counts, zeroRequired, freshness, bundle };
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

interface BundleSummary {
  bundleDir: string;
  createdAt: string | null;
  legacyExtractedAt: string | null;
  legacyTableCount: number | null;
  legacyRowCount: number | null;
  manifestPath: string | null;
}

function readBundleSummary(config: MigrationActionConfig): BundleSummary | null {
  const bundleDir = cleanString(config.bundleDir);
  if (!bundleDir) return null;
  const absoluteBundleDir = path.resolve(bundleDir);
  const bundleManifestPath = path.join(absoluteBundleDir, 'bundle-manifest.json');
  const legacyManifestPath = path.join(absoluteBundleDir, 'legacy', 'manifest.json');

  let createdAt: string | null = null;
  if (fs.existsSync(bundleManifestPath)) {
    const bundleManifest = JSON.parse(fs.readFileSync(bundleManifestPath, 'utf8')) as { createdAt?: string };
    createdAt = typeof bundleManifest.createdAt === 'string' ? bundleManifest.createdAt : null;
  }

  let legacyExtractedAt: string | null = null;
  let legacyTableCount: number | null = null;
  let legacyRowCount: number | null = null;
  if (fs.existsSync(legacyManifestPath)) {
    const legacyManifest = JSON.parse(fs.readFileSync(legacyManifestPath, 'utf8')) as {
      extractedAt?: string;
      tables?: Array<{ rowCount?: number }>;
    };
    legacyExtractedAt = typeof legacyManifest.extractedAt === 'string' ? legacyManifest.extractedAt : null;
    const tables = Array.isArray(legacyManifest.tables) ? legacyManifest.tables : [];
    legacyTableCount = tables.length;
    legacyRowCount = tables.reduce((sum, table) => sum + Number(table.rowCount ?? 0), 0);
  }

  return {
    bundleDir: absoluteBundleDir,
    createdAt,
    legacyExtractedAt,
    legacyTableCount,
    legacyRowCount,
    manifestPath: fs.existsSync(legacyManifestPath) ? legacyManifestPath : null,
  };
}

async function queryFreshness(
  pairs: Array<[string, string, string[]]>,
): Promise<Record<string, { maxTimestamp: string | null; sourceColumn: string | null }>> {
  return withPg(async (client) => {
    const out: Record<string, { maxTimestamp: string | null; sourceColumn: string | null }> = {};
    for (const [tableRef, key, candidateColumns] of pairs) {
      const [schema, table] = tableRef.split('.');
      const exists = await tableExists(client, tableRef);
      if (!exists) {
        out[key] = { maxTimestamp: null, sourceColumn: null };
        continue;
      }

      const columns = await existingColumns(client, schema, table, candidateColumns);
      let best: { value: string | null; column: string | null } = { value: null, column: null };
      for (const column of columns) {
        const result = await client.query<{ max_value: string | null }>(
          `SELECT MAX(${quoteIdent(column)})::text AS max_value FROM ${quoteQualifiedRef(tableRef)}`,
        );
        const value = result.rows[0]?.max_value ?? null;
        if (value && (!best.value || Date.parse(value) > Date.parse(best.value))) {
          best = { value, column };
        }
      }
      out[key] = { maxTimestamp: best.value, sourceColumn: best.column };
    }
    return out;
  });
}

async function existingColumns(
  client: Client,
  schema: string,
  table: string,
  candidateColumns: string[],
): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = ANY($3::text[])`,
    [schema, table, candidateColumns],
  );
  const present = new Set(result.rows.map((row) => row.column_name));
  return candidateColumns.filter((column) => present.has(column));
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

function quoteIdent(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid identifier: ${value}`);
  }
  return `"${value}"`;
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
