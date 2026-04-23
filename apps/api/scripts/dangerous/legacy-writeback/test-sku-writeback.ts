/**
 * Interactive smoke test for writing SKUs back into the legacy RICS Access MDB.
 *
 * Purpose: exercise the full SkuRepository write path end-to-end against a real
 * MDB, printing each step and the final row shape so you can verify what landed.
 *
 * Default mode runs against the `.tmp/test-mdbs/` clone (created by the Jest
 * integration tests). Pass `--live` to target the production `Rics Databases/`
 * folder instead — ONLY do that if you want to verify the round-trip against
 * the real files.
 *
 * Usage:
 *   pnpm --filter @benlow-rics/api test:sku-writeback
 *   pnpm --filter @benlow-rics/api test:sku-writeback -- --code ZDEMO1
 *   pnpm --filter @benlow-rics/api test:sku-writeback -- --keep
 *   pnpm --filter @benlow-rics/api test:sku-writeback -- --live --code ZDEMO1 --keep
 *
 * Flags:
 *   --code <string>    SKU code to use (default ZTESTSKU1). Will be uppercased.
 *   --vendor <string>  Vendor code to attach. Default: first vendor found in fixtures.
 *   --category <int>   Category number to attach. Default: first category found in fixtures.
 *   --retail <number>  Retail price. Default: 99.99.
 *   --desc <string>    Description. Default: "ZTEST WRITEBACK".
 *   --keep             Skip the final DELETE so you can inspect the row in Access.
 *   --live             Target Rics Databases/ (production) instead of .tmp/test-mdbs/.
 *   --no-update        Skip the update step (just create + read + delete).
 *   --no-overlay       Skip the InvCatalog overlay fields.
 */

import path from 'node:path';
import fs from 'node:fs';

// --- Parse args BEFORE importing the repo, because RICS_DB_DIR influences path
//     resolution at module load time inside accessOleDb.ts.
interface Args {
  code: string;
  vendor?: string;
  category?: number;
  retail: number;
  desc: string;
  keep: boolean;
  live: boolean;
  skipUpdate: boolean;
  skipOverlay: boolean;
}

function parseArgs(): Args {
  const out: Args = {
    code: 'ZTESTSKU1',
    retail: 99.99,
    desc: 'ZTEST WRITEBACK',
    keep: false,
    live: false,
    skipUpdate: false,
    skipOverlay: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--code': out.code = String(argv[++i] ?? out.code).toUpperCase(); break;
      case '--vendor': out.vendor = String(argv[++i] ?? '').trim(); break;
      case '--category': {
        const n = Number(argv[++i]);
        if (Number.isFinite(n)) out.category = n;
        break;
      }
      case '--retail': {
        const n = Number(argv[++i]);
        if (Number.isFinite(n)) out.retail = n;
        break;
      }
      case '--desc': out.desc = String(argv[++i] ?? out.desc); break;
      case '--keep': out.keep = true; break;
      case '--live': out.live = true; break;
      case '--no-update': out.skipUpdate = true; break;
      case '--no-overlay': out.skipOverlay = true; break;
      case '--help':
      case '-h':
        console.log('See file header for flags.');
        process.exit(0);
    }
  }
  if (out.code.length === 0 || out.code.length > 15) {
    console.error(`Invalid --code: must be 1..15 chars, got "${out.code}"`);
    process.exit(2);
  }
  return out;
}

const args = parseArgs();

// Wire RICS_DB_DIR BEFORE importing any rics/* module. Mirror the Jest setup.
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const LIVE_DIR = path.resolve(REPO_ROOT, 'Rics Databases');
const TEST_DIR = path.resolve(REPO_ROOT, '.tmp', 'test-mdbs');
const chosenDir = args.live ? LIVE_DIR : TEST_DIR;
if (!fs.existsSync(chosenDir)) {
  console.error(`RICS DB directory not found: ${chosenDir}`);
  if (!args.live) {
    console.error('Hint: the .tmp/test-mdbs/ clone is seeded by the Jest integration tests.');
    console.error('      Run them once first, or pass --live to target Rics Databases/.');
  }
  process.exit(2);
}
process.env.RICS_DB_DIR = chosenDir;

// Imports AFTER env is set.
import { SkuRepository, type SkuInput } from '../../../../src/repositories/rics/SkuRepository';

// Small console helpers — keep log output scannable.
const step = (label: string, body: string) => console.log(`\n──── ${label} ────\n${body}`);
const pretty = (v: unknown) => JSON.stringify(v, null, 2);

async function pickDefaultFkTargets(): Promise<{ vendor: string; category: number }> {
  const page = await SkuRepository.findAll({ limit: 50 });
  if (!page.ok) {
    throw new Error('Could not load fixture SKUs to choose default FK values: ' + pretty(page.error));
  }
  const withBoth = page.value.find((s) => s.vendor && s.category != null);
  if (!withBoth) {
    throw new Error('No fixture row has both vendor + category set; pass --vendor and --category explicitly.');
  }
  return { vendor: withBoth.vendor!, category: withBoth.category! };
}

(async () => {
  console.log(`RICS_DB_DIR = ${chosenDir}`);
  console.log(`Mode: ${args.live ? 'LIVE (Rics Databases/)' : 'test clone (.tmp/test-mdbs/)'}`);
  console.log(`Code: ${args.code}`);

  // Resolve FK defaults from fixtures if not supplied.
  let vendor = args.vendor;
  let category = args.category;
  if (!vendor || category == null) {
    const defaults = await pickDefaultFkTargets();
    vendor ??= defaults.vendor;
    category ??= defaults.category;
    console.log(`Using FK defaults from fixture: vendor=${vendor} category=${category}`);
  }

  // Defensive cleanup — prior aborted run may have left the row behind.
  step('0. Cleanup prior run', `DELETE if exists: ${args.code}`);
  await SkuRepository.delete(args.code);

  // 1. CREATE
  const createInput: SkuInput = {
    code: args.code,
    vendor: vendor!,
    category: category!,
    description: args.desc,
    retailPrice: args.retail,
    styleColor: 'BLK/WHT',
    season: 'SS',
    listPrice: args.retail * 1.5,
    mdPrice1: args.retail * 0.75,
    mdPrice2: args.retail * 0.5,
    currentPriceSlot: 'RETAIL',
    currentCost: args.retail * 0.4,
    manufacturer: 'ZTEST MFG',
    keywords: ['ZTEST', 'WRITEBACK'],
    comment: 'smoke test via scripts/test-sku-writeback.ts',
    coupon: false,
    orderMultiple: 1,
    orderUom: 'EACH',
    ...(args.skipOverlay ? {} : {
      longColor: 'Glossy Black / Pure White',
      boldDesc: 'ZTEST Bold Description',
      paraDesc: 'ZTEST paragraph description for the catalog overlay.',
      bulletText: ['First bullet', 'Second bullet'],
      webFileName: 'ztest_web.html',
    }),
  };

  step('1. CREATE', `INSERT via SkuRepository.create\nInput:\n${pretty(createInput)}`);
  const created = await SkuRepository.create(createInput);
  if (!created.ok) {
    console.error(`CREATE FAILED: kind=${created.error.kind} message=${created.error.message}`);
    process.exit(1);
  }
  console.log('CREATE ok. Row as returned by findByCode:');
  console.log(pretty(created.value));

  // 2. READ
  step('2. READ', `SELECT via SkuRepository.findByCode('${args.code}')`);
  const read = await SkuRepository.findByCode(args.code);
  if (!read.ok) {
    console.error(`READ FAILED: ${read.error.kind} ${read.error.message}`);
    process.exit(1);
  }
  console.log('READ ok. Description:', read.value.description);
  console.log('      Current price slot:', read.value.currentPriceSlot);
  console.log('      InvCatalog overlay present?', read.value.boldDesc != null);

  // 3. UPDATE
  if (!args.skipUpdate) {
    step('3. UPDATE', 'patch description + retailPrice + keywords');
    const updated = await SkuRepository.update(args.code, {
      description: args.desc + ' (UPDATED)',
      retailPrice: args.retail + 10,
      keywords: ['UPDATED'],
    });
    if (!updated.ok) {
      console.error(`UPDATE FAILED: ${updated.error.kind} ${updated.error.message}`);
      process.exit(1);
    }
    console.log('UPDATE ok. New description:', updated.value.description);
    console.log('           New retail price:', updated.value.retailPrice);
    console.log('           New keywords:', updated.value.keywords);
  } else {
    step('3. UPDATE', 'SKIPPED (--no-update)');
  }

  // 4. DELETE (unless --keep)
  if (args.keep) {
    step('4. DELETE', `SKIPPED (--keep). Row ${args.code} left in place for Access inspection.`);
    console.log('\nDone. You can open RIINVMAS.MDB in Access and look at the row:');
    console.log(`    SELECT * FROM [InventoryMaster] WHERE [SKU] = '${args.code}';`);
    console.log(`    SELECT * FROM [InvCatalog] WHERE [SKU] = '${args.code}';`);
  } else {
    step('4. DELETE', `DELETE via SkuRepository.delete('${args.code}')`);
    const del = await SkuRepository.delete(args.code);
    if (!del.ok) {
      console.error(`DELETE FAILED: ${del.error.kind} ${del.error.message}`);
      process.exit(1);
    }
    console.log('DELETE ok.');
    const verify = await SkuRepository.findByCode(args.code);
    console.log('Post-delete findByCode →', verify.ok ? 'UNEXPECTEDLY STILL PRESENT' : `${verify.error.kind} (correct)`);
  }

  console.log('\n✓ Write-back smoke test complete.');
  process.exit(0);
})().catch((err) => {
  console.error('Smoke test threw:', err);
  process.exit(1);
});
