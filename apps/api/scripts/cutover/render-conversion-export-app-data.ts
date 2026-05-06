import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const API_DIR = path.resolve(__dirname, '../..');
const DEFAULT_BUNDLE_DIR = path.resolve(API_DIR, '.tmp', 'render-conversion-bundle');

interface Args {
  bundleDir: string;
  withSeedAssignments: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    bundleDir: DEFAULT_BUNDLE_DIR,
    withSeedAssignments: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--bundle':
      case '--out':
        args.bundleDir = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--with-seed-assignments':
        args.withSeedAssignments = true;
        break;
      case '--help':
      case '-h':
        console.log('Usage: cutover:render-export-app-data --bundle <dir>');
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

async function runNodeTsScript(label: string, scriptPath: string, args: string[]): Promise<number> {
  const started = Date.now();
  console.log(`[cutover:render-export-app-data] ${label}`);
  const child = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', '-r', 'tsx/cjs', scriptPath, ...args],
    {
      cwd: API_DIR,
      stdio: 'inherit',
      env: process.env,
    },
  );
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (value) => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error(`${label} failed with exit ${code}`);
  const duration = Date.now() - started;
  console.log(`[cutover:render-export-app-data] ${label} done in ${duration}ms`);
  return duration;
}

function rel(basePath: string, targetPath: string): string {
  return path.relative(basePath, targetPath).replace(/\\/g, '/');
}

function readManifest(bundleManifestPath: string): Record<string, unknown> {
  if (!fs.existsSync(bundleManifestPath)) {
    throw new Error(`bundle-manifest.json missing. Run Extract CSV files first: ${bundleManifestPath}`);
  }
  return JSON.parse(fs.readFileSync(bundleManifestPath, 'utf8')) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const started = Date.now();
  const bundleDir = path.resolve(args.bundleDir);
  const appDir = path.join(bundleDir, 'app');
  const bundleManifestPath = path.join(bundleDir, 'bundle-manifest.json');
  const attributeSnapshotPath = path.join(appDir, 'attribute-catalog-export.json');
  const appDataSnapshotPath = path.join(appDir, 'app-data-export.json');

  fs.mkdirSync(appDir, { recursive: true });

  console.log('========================================');
  console.log('  cutover:render-export-app-data');
  console.log('========================================');
  console.log(`bundle  : ${bundleDir}`);
  console.log(`attribute: ${attributeSnapshotPath}`);
  console.log(`app data : ${appDataSnapshotPath}`);
  console.log('----------------------------------------');

  const attributeArgs = ['--out', attributeSnapshotPath];
  if (args.withSeedAssignments) attributeArgs.push('--with-seed-assignments');
  const attributeMs = await runNodeTsScript(
    'export:attributes',
    path.join(API_DIR, 'scripts', 'catalog', 'export-attribute-catalog.ts'),
    attributeArgs,
  );
  const appDataMs = await runNodeTsScript(
    'export:app-created-data',
    path.join(API_DIR, 'scripts', 'cutover', 'export-app-created-data.ts'),
    ['--out', appDataSnapshotPath],
  );

  const manifest = readManifest(bundleManifestPath);
  manifest.attributeSnapshotPath = rel(bundleDir, attributeSnapshotPath);
  manifest.appDataSnapshotPath = rel(bundleDir, appDataSnapshotPath);
  manifest.appDataExportedAt = new Date().toISOString();
  manifest.knownFullResetBlockers = [];
  const durations = manifest.durationsMs && typeof manifest.durationsMs === 'object'
    ? manifest.durationsMs as Record<string, unknown>
    : {};
  durations.exportAttributeSnapshot = attributeMs;
  durations.exportAppDataSnapshot = appDataMs;
  durations.exportAppDataStep = Date.now() - started;
  manifest.durationsMs = durations;
  fs.writeFileSync(bundleManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log('----------------------------------------');
  console.log(`bundle manifest updated: ${bundleManifestPath}`);
  console.log(`total   : ${Date.now() - started}ms`);
  console.log('========================================');
}

main().catch((error) => {
  console.error(`[cutover:render-export-app-data] ${(error as Error).message}`);
  if ((error as Error).stack) console.error((error as Error).stack);
  process.exit(1);
});
