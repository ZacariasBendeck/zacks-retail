import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { skuLifecycleBackfill } from '../../../src/services/sync/skuLifecycleBackfill';
import {
  fmtDuration,
  fmtNum,
  loadManifest,
  requireTable,
  stageTable,
} from './artifactManifest';

interface Args {
  manifestPath: string | null;
}

function parseArgs(): Args {
  const args: Args = { manifestPath: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--':
        break;
      case '--manifest':
        args.manifestPath = String(argv[++i] ?? '').trim() || null;
        break;
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (!args.manifestPath) {
    throw new Error('--manifest <path> is required');
  }
  return args;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: import-app-skus-from-artifact --manifest <path>',
      '',
      'Stages inventory_master.csv into a temp table and rebuilds:',
      '  - app.sku',
      '  - app.sku_activity (created/reactivated/discontinued rows)',
      '',
      'No persistent writes land in rics_mirror.',
    ].join('\n'),
  );
  process.exit(code);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const { manifest, manifestDir } = loadManifest(args.manifestPath!);
  const inventoryMasterTable = requireTable(manifest, 'inventory_master');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const stagedTable = await stageTable(client, manifestDir, inventoryMasterTable);
    const runId = randomUUID();

    console.log(
      `[import:app-skus-from-artifact] staged ${inventoryMasterTable.targetTable} ` +
        `rows=${fmtNum(inventoryMasterTable.rowCount)} as ${stagedTable}`,
    );

    const result = await skuLifecycleBackfill({
      pgClient: client,
      runId,
      actor: 'migration:artifact-sku-backfill',
      sourceTable: stagedTable,
    });

    console.log(
      `[import:app-skus-from-artifact] OK - inserted=${fmtNum(result.inserted)} ` +
        `updated=${fmtNum(result.updated)} ` +
        `reactivated=${fmtNum(result.reactivated)} ` +
        `discontinued=${fmtNum(result.discontinued)} ` +
        `operatorCollisions=${fmtNum(result.operatorCollisions)} ` +
        `in ${fmtDuration(result.durationMs)}`,
    );

    if (result.operatorCollisionCodes.length > 0) {
      console.warn(
        `[import:app-skus-from-artifact] operator-row collisions (first 10): ` +
          result.operatorCollisionCodes.slice(0, 10).join(', '),
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[import:app-skus-from-artifact] FAILED - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
