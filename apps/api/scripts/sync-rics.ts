/**
 * CLI entry for the RICS -> Postgres reload.
 *
 *   pnpm --filter @benlow-rics/api sync:rics
 *
 * Reads DATABASE_URL + RICS_DB_DIR from the env. Prints one line per table
 * as it loads, then a summary. Exits with code 0 on success, 1 on failure.
 */
import { ricsRefresh, ProgressEvent } from '../src/services/sync/ricsRefresh';

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function onProgress(evt: ProgressEvent): void {
  switch (evt.type) {
    case 'run-start':
      console.log(`[sync:rics] starting run ${evt.runId} — ${evt.mdbCount} MDB files`);
      break;
    case 'mdb-start':
      console.log(`[sync:rics]   opening ${evt.file}`);
      break;
    case 'table-ok':
      console.log(
        `[sync:rics]     ${evt.result.targetTable}: ${fmtNum(evt.result.rowCount)} rows in ${fmtDuration(evt.result.durationMs)}`
      );
      break;
    case 'table-err':
      console.error(`[sync:rics]     ${evt.file}.${evt.table} FAILED — ${evt.error.message}`);
      break;
    case 'swap':
      console.log(`[sync:rics] atomic swap: ${evt.staging} -> ${evt.final}`);
      break;
    case 'run-end':
      if (evt.status === 'ok') {
        console.log(
          `[sync:rics] OK — ${fmtNum(evt.totalRows)} rows total in ${fmtDuration(evt.totalMs)} (run ${evt.runId})`
        );
      } else {
        console.error(
          `[sync:rics] FAILED after ${fmtDuration(evt.totalMs)} — ${evt.errorText ?? 'unknown error'}`
        );
      }
      break;
  }
}

async function main(): Promise<void> {
  const result = await ricsRefresh({ onProgress });
  process.exit(result.status === 'ok' ? 0 : 1);
}

main().catch((err) => {
  console.error(`[sync:rics] unhandled error: ${err?.message ?? err}`);
  if (err?.stack) console.error(err.stack);
  process.exit(2);
});
