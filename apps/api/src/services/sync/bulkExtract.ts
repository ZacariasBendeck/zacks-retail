import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const SCRIPT_PATH = path.resolve(__dirname, 'bulk-extract.ps1');

/**
 * Staging directory for CSV intermediates during a reload.
 *
 * Override with RICS_SYNC_STAGING_DIR. Default is `<os.tmpdir>/rics-staging`.
 * Each run gets its own subdir (caller-supplied) so concurrent runs don't collide.
 */
export function stagingRoot(): string {
  return process.env.RICS_SYNC_STAGING_DIR ?? path.join(os.tmpdir(), 'rics-staging');
}

export interface BulkExtractResult {
  /** Absolute path to the CSV file produced. Caller owns deletion. */
  csvPath: string;
  /** Row count as reported by the C# extractor. */
  rowCount: number;
  /** Total elapsed in the child process. */
  durationMs: number;
}

/**
 * Spawn the PowerShell + C# bulk extractor and wait for it to finish.
 *
 * The extractor reads one RICS table via ACE.OLEDB.12.0 and writes it to a
 * CSV file in Postgres COPY CSV format (RFC 4180 + explicit `\N` for NULL).
 * The caller is responsible for:
 *   1. Pre-creating `targetDir` (this function assumes it exists).
 *   2. COPYing the file into Postgres (see copyFromMdb.ts).
 *   3. Deleting the file after the COPY succeeds.
 *
 * Async spawn is required by the project hard rule against `spawnSync`
 * (see apps/api/src/services/accessOleDb.ts header comment).
 */
export function bulkExtractToCsv(args: {
  mdbPath: string;
  mdbPassword: string;
  sourceTable: string;
  outputCsv: string;
}): Promise<BulkExtractResult> {
  const { mdbPath, mdbPassword, sourceTable, outputCsv } = args;
  const start = Date.now();

  return new Promise<BulkExtractResult>((resolve, reject) => {
    const child = spawn(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', SCRIPT_PATH,
        '-DbPath', mdbPath,
        '-Password', mdbPassword,
        '-TableName', sourceTable,
        '-OutputCsv', outputCsv,
      ],
      { windowsHide: true }
    );

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c: string) => { stdout += c; });
    child.stderr.on('data', (c: string) => { stderr += c; });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        const msg = (stderr || stdout || `extractor exited with code ${code}`).trim();
        reject(new Error(`bulk-extract ${sourceTable}: ${msg}`));
        return;
      }
      const match = stdout.match(/\bROWS\s+(\d+)\b/);
      if (!match) {
        reject(new Error(`bulk-extract ${sourceTable}: missing ROWS marker in output: ${stdout}`));
        return;
      }
      resolve({
        csvPath: outputCsv,
        rowCount: Number(match[1]),
        durationMs: Date.now() - start,
      });
    });
  });
}

/**
 * Make sure the staging directory exists. Called once at the start of a run
 * so every per-table extract can assume the target dir is ready.
 */
export function ensureStagingDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Best-effort cleanup. Deletes a single CSV; ignores "not found" errors.
 */
export function safeDeleteCsv(csvPath: string): void {
  try { fs.unlinkSync(csvPath); } catch { /* ignore */ }
}
