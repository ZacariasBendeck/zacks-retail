/**
 * Runs every section script in sequence and prints a combined summary.
 */
import { API_BASE, http, Section } from './harness';
import { run as runA } from './section-a-onhand';
import { run as runB } from './section-b-ledger';
import { run as runC } from './section-c-receiving';
import { run as runD } from './section-d-returns';
import { run as runJ } from './section-j-change-detail';
import { run as runN } from './section-n-edge-cases';

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Inventory checklist runner — target: ${API_BASE}\n`);

  try {
    const ping = await http('GET', '/api/v1/inventory?limit=1');
    if (!ping.ok) {
      // eslint-disable-next-line no-console
      console.error(`API at ${API_BASE} responded with status ${ping.status}. Start the dev server and retry.`);
      process.exit(1);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Could not reach API at ${API_BASE}: ${err instanceof Error ? err.message : String(err)}`);
    console.error('Start the dev server with: pnpm --filter @benlow-rics/api dev');
    process.exit(1);
  }

  const sections: Section[] = [];
  for (const run of [runA, runB, runC, runD, runJ, runN]) {
    try {
      sections.push(await run());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Section runner crashed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const total = sections.reduce(
    (acc, s) => {
      const { pass, fail, skip } = s.summary();
      return { pass: acc.pass + pass, fail: acc.fail + fail, skip: acc.skip + skip };
    },
    { pass: 0, fail: 0, skip: 0 },
  );

  // eslint-disable-next-line no-console
  console.log(`\n==== OVERALL ==== ${total.pass} pass, ${total.fail} fail, ${total.skip} skip`);
  process.exit(total.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
