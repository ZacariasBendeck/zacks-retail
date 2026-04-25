import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { replenishmentTargetBackfill } from '../../../src/services/sync/replenishmentTargetBackfill';
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
      'Usage: import-app-replenishment-targets-from-artifact --manifest <path>',
      '',
      'Stages inventory_quantities.csv and size_types.csv into temp tables and rebuilds:',
      '  - app.replenishment_target',
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
  const inventoryQuantitiesTable = requireTable(manifest, 'inventory_quantities');
  const sizeTypesTable = requireTable(manifest, 'size_types');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const stagedInventoryQuantities = await stageTable(client, manifestDir, inventoryQuantitiesTable);
    const stagedSizeTypes = await stageTable(client, manifestDir, sizeTypesTable);
    const runId = randomUUID();

    console.log(
      `[import:app-replenishment-targets-from-artifact] staged ${inventoryQuantitiesTable.targetTable} ` +
        `rows=${fmtNum(inventoryQuantitiesTable.rowCount)} as ${stagedInventoryQuantities}`,
    );
    console.log(
      `[import:app-replenishment-targets-from-artifact] staged ${sizeTypesTable.targetTable} ` +
        `rows=${fmtNum(sizeTypesTable.rowCount)} as ${stagedSizeTypes}`,
    );

    const result = await replenishmentTargetBackfill({
      pgClient: client,
      runId,
      sourceQuantityTable: stagedInventoryQuantities,
      sourceSizeTypeTable: stagedSizeTypes,
    });

    console.log(
      `[import:app-replenishment-targets-from-artifact] OK - sourceRows=${fmtNum(result.mirrorRowsRead)} ` +
        `preparedRows=${fmtNum(result.targetRowsPrepared)} ` +
        `replacedRows=${fmtNum(result.replacedRows)} ` +
        `importedRows=${fmtNum(result.importedRows)} ` +
        `in ${fmtDuration(result.durationMs)}`,
    );

    if (result.skippedMissingSkuRows > 0) {
      console.warn(
        `[import:app-replenishment-targets-from-artifact] skipped ${fmtNum(result.skippedMissingSkuRows)} row(s) ` +
          `for staged SKU(s) missing in app.sku. First 10: ${result.missingSkuCodes.slice(0, 10).join(', ')}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[import:app-replenishment-targets-from-artifact] FAILED - ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
