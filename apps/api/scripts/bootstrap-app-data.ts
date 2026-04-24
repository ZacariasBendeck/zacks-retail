/**
 * Bootstrap the `app.*` data in one pass, after prisma:migrate + sync:rics.
 *
 *   pnpm --filter @benlow-rics/api bootstrap:app-data
 *
 * Runs four existing scripts in dependency order:
 *   1. seed:product-families     — families + category→family mapping
 *   2. import:attributes         — attribute catalog from saved JSON snapshot
 *   3. seed:sku-attributes       — keyword-derived per-SKU assignments
 *   4. sync:rics-skus            — backfill app.sku from rics_mirror.inventory_master
 *   5. sync:rics-stock-levels    — rebuild app.stock_level from mirror + app ledger
 *
 * Each step logs duration. Any failure halts the chain with a non-zero exit.
 *
 * Flags:
 *   --snapshot <path>            Path to the attribute-catalog JSON. Default:
 *                                latest `attribute-catalog-export-*.json` in
 *                                docs/Important-Final-Docs/ (falls back to the
 *                                repo root or apps/api/).
 *   --skip-product-families      Skip step 1
 *   --skip-attributes-import     Skip step 2
 *   --skip-sku-attributes        Skip step 3
 *   --skip-sku-sync              Skip step 4
 *   --skip-stock-levels          Skip step 5
 *   --dry-run                    Print the plan + resolved snapshot path, exit 0
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const API_DIR = path.resolve(__dirname, '..');

interface Args {
  snapshot: string | null;
  skipFamilies: boolean;
  skipAttrImport: boolean;
  skipSkuAttrs: boolean;
  skipSkuSync: boolean;
  skipStockLevels: boolean;
  dryRun: boolean;
}

function parseArgs(): Args {
  const out: Args = {
    snapshot: null,
    skipFamilies: false,
    skipAttrImport: false,
    skipSkuAttrs: false,
    skipSkuSync: false,
    skipStockLevels: false,
    dryRun: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--snapshot':
        out.snapshot = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--skip-product-families':
        out.skipFamilies = true;
        break;
      case '--skip-attributes-import':
        out.skipAttrImport = true;
        break;
      case '--skip-sku-attributes':
        out.skipSkuAttrs = true;
        break;
      case '--skip-sku-sync':
        out.skipSkuSync = true;
        break;
      case '--skip-stock-levels':
        out.skipStockLevels = true;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log('See file header for flags.');
        process.exit(0);
    }
  }
  return out;
}

function latestSnapshot(): string | null {
  const candidates = [
    path.join(REPO_ROOT, 'docs', 'Important-Final-Docs'),
    REPO_ROOT,
    API_DIR,
  ];
  const pattern = /^attribute-catalog-export-.*\.json$/;
  let best: { filePath: string; mtime: number } | null = null;
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!pattern.test(entry)) continue;
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (!best || stat.mtimeMs > best.mtime) {
        best = { filePath: full, mtime: stat.mtimeMs };
      }
    }
  }
  return best?.filePath ?? null;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

interface Step {
  label: string;
  script: string; // path relative to apps/api/
  extraArgs?: string[];
}

async function runStep(step: Step, stepNum: number, total: number): Promise<void> {
  const scriptPath = path.resolve(API_DIR, step.script);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }
  console.log(`\n[${stepNum}/${total}] ${step.label}`);
  console.log(`        ${path.relative(REPO_ROOT, scriptPath).replace(/\\/g, '/')}${step.extraArgs?.length ? ' ' + step.extraArgs.join(' ') : ''}`);
  const t0 = Date.now();

  const child = spawn(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      '--experimental-sqlite',
      '-r',
      'tsx/cjs',
      scriptPath,
      ...(step.extraArgs ?? []),
    ],
    { stdio: 'inherit', cwd: API_DIR },
  );

  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (c) => resolve(c ?? 1));
  });

  const dur = fmtDuration(Date.now() - t0);
  if (code !== 0) {
    console.error(`\n✗ Step ${stepNum}/${total} failed (exit ${code}) after ${dur}`);
    throw new Error(`${step.label} failed`);
  }
  console.log(`        ✓ done (${dur})`);
}

async function main(): Promise<void> {
  const args = parseArgs();

  // Resolve the snapshot path once, up front.
  const snapshot = args.snapshot ?? latestSnapshot();
  if (!args.skipAttrImport && snapshot == null) {
    console.error(
      'Error: no attribute-catalog JSON found. Pass --snapshot <path>, or run ' +
        '`pnpm export:attributes` first to produce one.',
    );
    process.exit(2);
  }

  const steps: Step[] = [];
  if (!args.skipFamilies) {
    steps.push({ label: 'seed:product-families', script: 'scripts/seeds/seed-product-families.ts' });
  }
  if (!args.skipAttrImport) {
    steps.push({
      label: `import:attributes --in ${path.relative(REPO_ROOT, snapshot!).replace(/\\/g, '/')}`,
      script: 'scripts/catalog/import-attribute-catalog.ts',
      extraArgs: ['--in', snapshot!],
    });
  }
  if (!args.skipSkuAttrs) {
    steps.push({ label: 'seed:sku-attributes', script: 'scripts/seeds/seed-sku-attributes.ts' });
  }
  if (!args.skipSkuSync) {
    steps.push({ label: 'sync:rics-skus', script: 'scripts/rics/sync/sync-rics-skus.ts' });
  }
  if (!args.skipStockLevels) {
    steps.push({ label: 'sync:rics-stock-levels', script: 'scripts/rics/sync/sync-rics-stock-levels.ts' });
  }

  console.log('=== bootstrap:app-data ===');
  console.log(`Snapshot: ${snapshot ?? '(none — attribute import skipped)'}`);
  console.log(`Plan: ${steps.length} step(s)`);
  for (let i = 0; i < steps.length; i++) {
    console.log(`   ${i + 1}. ${steps[i].label}`);
  }

  if (args.dryRun) {
    console.log('\n(--dry-run; exiting without running)');
    return;
  }

  const overall = Date.now();
  for (let i = 0; i < steps.length; i++) {
    await runStep(steps[i], i + 1, steps.length);
  }
  console.log(`\n=== bootstrap:app-data complete (${fmtDuration(Date.now() - overall)}) ===`);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
