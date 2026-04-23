/**
 * Convert legacy (Jet 3.x / Access 97) MDB files in the RICS Databases folder
 * to Jet 4.0 / Access 2000-2003 format so Microsoft.ACE.OLEDB.12.0 can open them.
 *
 * Run with:  pnpm --filter @benlow-rics/api rics:convert
 *
 * Flags:
 *   --dry-run     Probe each file and report which ones need conversion. No writes.
 *   --force       Convert every file whether or not it already opens cleanly.
 *   --only=FILE   Only process the named file (e.g. --only=RISEMF.MDB). Comma-separated list.
 *   --folder=PATH Override the scan folder. Defaults to the RICS_DB_DIR env var or
 *                 `<repo>/Rics Databases`.
 *
 * What it does per file:
 *   1. Probe — try to open with ACE.OLEDB.12.0 via the existing accessOleDb helpers.
 *   2. If the probe fails with "previous version" / "versión anterior" — convert.
 *   3. Conversion uses DAO.DBEngine.120 (installed alongside ACE.OLEDB.12.0) to
 *      `CompactDatabase(source, staging, dstLocale, dbVersion40=64, srcLocale)`.
 *      Password is recovered from the file header (same code as the read path)
 *      and preserved on the destination.
 *   4. Verify the staging file opens with ACE.
 *   5. Rename original → `<name>.backup-YYYY-MM-DD-HHMMSS.mdb` and staging → original.
 *
 * Why this exists: every time you restore a fresh copy of the RICS databases,
 * Jet-3.x files will re-appear and ACE will refuse to open them. Re-run this
 * script after every refresh to bring them back to the Jet-4 format the
 * adapter can read.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ricsDbPath,
  getOrRecoverPassword,
  runPowerShellJson,
  buildListTablesScript,
  escapePowerShellLiteral,
} from '../../../src/services/accessOleDb';

// ─────────────────── Args ───────────────────

interface Args {
  dryRun: boolean;
  force: boolean;
  only: string[] | null;
  folder: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    dryRun: false,
    force: false,
    only: null,
    folder: ricsDbPath(''),
  };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--force') out.force = true;
    else if (arg.startsWith('--only=')) {
      out.only = arg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg.startsWith('--folder=')) {
      out.folder = path.resolve(arg.slice('--folder='.length));
    }
  }
  return out;
}

// ─────────────────── Probe ───────────────────

interface ProbeResult {
  openable: boolean;
  errorMessage: string | null;
  isOldFormatError: boolean;
}

const OLD_FORMAT_HINTS = [
  'previous version',
  'versión anterior',
  'version anterior',
  'anterior de la aplicación',
  'earlier version',
  'unrecognized database format',
];

function looksLikeOldFormat(message: string): boolean {
  const lower = message.toLowerCase();
  return OLD_FORMAT_HINTS.some((h) => lower.includes(h.toLowerCase()));
}

function probeFile(filePath: string): ProbeResult {
  let password = '';
  try {
    password = getOrRecoverPassword(filePath);
  } catch (e) {
    return {
      openable: false,
      errorMessage: `password-recovery: ${e instanceof Error ? e.message : String(e)}`,
      isOldFormatError: false,
    };
  }
  try {
    runPowerShellJson<string[] | string>(buildListTablesScript(filePath, password));
    return { openable: true, errorMessage: null, isOldFormatError: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      openable: false,
      errorMessage: msg,
      isOldFormatError: looksLikeOldFormat(msg),
    };
  }
}

// ─────────────────── Convert ───────────────────

function timestampSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function buildConversionScript(
  sourcePath: string,
  stagingPath: string,
  password: string,
): string {
  // dbVersion40 = 64 (Jet 4.0 / Access 2000-2003)
  const TARGET_VERSION = 64;
  const srcLocale = password ? `;pwd=${password}` : '';
  // Destination gets the SAME password so RICS continues to read it unchanged.
  const dstLocale = password
    ? `;LANGID=0x0409;CP=1252;COUNTRY=0;pwd=${password}`
    : ';LANGID=0x0409;CP=1252;COUNTRY=0';
  // DAO.DBEngine.120 (the engine shipped with ACE.OLEDB.12.0) refuses to open
  // Jet 3.x source databases with the same "previous version" error the
  // ACE OLE DB provider does — the underlying engine is the same. We need
  // DAO 3.6 (the one shipped with Access 2000/2002/2003), which handles both
  // Jet 3.x reads and Jet 4.0 writes. That engine is 32-bit only. The script
  // tries DAO.DBEngine.36 first, then falls back to the unversioned
  // DAO.DBEngine (picks up whatever is installed), then .120 as last resort.
  return `
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$source = '${escapePowerShellLiteral(sourcePath)}'
$target = '${escapePowerShellLiteral(stagingPath)}'
$srcLocale = '${escapePowerShellLiteral(srcLocale)}'
$dstLocale = '${escapePowerShellLiteral(dstLocale)}'

$engine = $null
$engineTried = @()
$lastLoadError = $null
foreach ($progId in @('DAO.DBEngine.36', 'DAO.DBEngine', 'DAO.DBEngine.120')) {
  $engineTried += $progId
  try {
    $engine = New-Object -ComObject $progId
    $engineUsed = $progId
    break
  } catch {
    $lastLoadError = $_.Exception.Message
  }
}
if (-not $engine) {
  @{ ok = $false; stage = 'com-object'; error = "no DAO engine available (tried: $($engineTried -join ', '); last error: $lastLoadError)" } | ConvertTo-Json -Compress
  exit 0
}

try {
  # DAO.CompactDatabase(SrcName, DstName, [DstLocale], [Options=Version], [SrcLocale])
  $engine.CompactDatabase($source, $target, $dstLocale, ${TARGET_VERSION}, $srcLocale)
  @{ ok = $true; engine = $engineUsed } | ConvertTo-Json -Compress
} catch {
  @{ ok = $false; stage = 'compact'; engine = $engineUsed; error = $_.Exception.Message } | ConvertTo-Json -Compress
} finally {
  try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($engine) | Out-Null } catch {}
}
`;
}

/**
 * Find a 32-bit PowerShell. On 64-bit Windows, 32-bit PS lives under SysWOW64
 * (counter-intuitive naming). On 32-bit Windows, only System32 exists. If
 * neither is present we fall back to plain `powershell` from PATH — which
 * likely won't work for Jet 3.x, but the caller will at least get a sensible
 * error.
 */
function find32BitPowerShell(): string {
  const windir = process.env.WINDIR ?? process.env.SystemRoot ?? 'C:\\Windows';
  const sysWow64 = path.join(windir, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const system32 = path.join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  if (fs.existsSync(sysWow64)) return sysWow64;
  if (fs.existsSync(system32)) return system32;
  return 'powershell';
}

interface ConvertResult {
  success: boolean;
  message: string;
  backupPath?: string;
}

function runConversion(sourcePath: string, stagingPath: string, password: string): { ok: boolean; error?: string; stage?: string; engine?: string } {
  const script = buildConversionScript(sourcePath, stagingPath, password);
  const ps = find32BitPowerShell();
  const result = spawnSync(ps, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status !== 0) {
    return { ok: false, error: (result.stderr || result.stdout || 'PowerShell exited non-zero').trim() };
  }
  const payload = result.stdout.trim();
  if (!payload) return { ok: false, error: 'PowerShell emitted no output' };
  try {
    return JSON.parse(payload);
  } catch {
    return { ok: false, error: `Bad JSON from PS: ${payload}` };
  }
}

function convertFile(filePath: string): ConvertResult {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const ext = path.extname(base);
  const nameNoExt = base.slice(0, base.length - ext.length);

  const stagingPath = path.join(dir, `${nameNoExt}.staging${ext}`);
  const backupPath = path.join(dir, `${nameNoExt}.backup-${timestampSuffix()}${ext}`);

  // Clean stale staging file if any.
  if (fs.existsSync(stagingPath)) {
    try {
      fs.unlinkSync(stagingPath);
    } catch (e) {
      return { success: false, message: `could not remove stale staging file: ${(e as Error).message}` };
    }
  }

  let password = '';
  try {
    password = getOrRecoverPassword(filePath);
  } catch (e) {
    return { success: false, message: `password recovery failed: ${(e as Error).message}` };
  }

  const compact = runConversion(filePath, stagingPath, password);
  if (!compact.ok) {
    // Clean up any partial staging output.
    if (fs.existsSync(stagingPath)) {
      try {
        fs.unlinkSync(stagingPath);
      } catch {
        /* ignore */
      }
    }
    return {
      success: false,
      message: `DAO CompactDatabase failed (${compact.stage ?? 'unknown'}): ${compact.error ?? 'no error text'}`,
    };
  }

  if (!fs.existsSync(stagingPath)) {
    return { success: false, message: 'compact reported ok but no staging file was produced' };
  }

  // Verify the staging file actually opens with ACE.
  const verify = probeFile(stagingPath);
  if (!verify.openable) {
    try {
      fs.unlinkSync(stagingPath);
    } catch {
      /* ignore */
    }
    return {
      success: false,
      message: `staging file failed post-conversion verification: ${verify.errorMessage}`,
    };
  }

  // Swap: backup original, move staging to original.
  try {
    fs.renameSync(filePath, backupPath);
  } catch (e) {
    return { success: false, message: `could not rename original to backup: ${(e as Error).message}` };
  }
  try {
    fs.renameSync(stagingPath, filePath);
  } catch (e) {
    // Try to restore the backup if the second rename failed.
    try {
      fs.renameSync(backupPath, filePath);
    } catch {
      /* original is lost if this restore fails too */
    }
    return { success: false, message: `could not promote staging to original: ${(e as Error).message}` };
  }

  const enginePart = compact.engine ? ` via ${compact.engine}` : '';
  return { success: true, message: `converted${enginePart}. original saved as ${path.basename(backupPath)}`, backupPath };
}

// ─────────────────── Main ───────────────────

function listMdbFiles(folder: string): string[] {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error(`Folder not found: ${folder}`);
  }
  return fs
    .readdirSync(folder)
    .filter((f) => /\.mdb$/i.test(f))
    // Skip our own backup/staging artifacts so repeated runs don't reprocess them.
    // Pattern intentionally matches any `.backup-*` or `.staging.` suffix shape,
    // not just `.backup-<digit>.` which missed date-formatted suffixes like
    // `.backup-2026-04-19-141902.MDB`.
    .filter((f) => !/\.(backup-[^.]*|staging)\./i.test(f))
    .sort((a, b) => a.localeCompare(b));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[convert-rics-mdbs] folder: ${args.folder}`);
  if (args.dryRun) console.log(`[convert-rics-mdbs] dry-run: no files will be modified`);
  if (args.force) console.log(`[convert-rics-mdbs] force: will convert even already-openable files`);
  if (args.only) console.log(`[convert-rics-mdbs] only: ${args.only.join(', ')}`);

  let files: string[];
  try {
    files = listMdbFiles(args.folder);
  } catch (e) {
    console.error(`[convert-rics-mdbs] ${(e as Error).message}`);
    process.exit(2);
  }

  if (args.only) {
    const set = new Set(args.only);
    files = files.filter((f) => set.has(f.toUpperCase()));
  }

  if (files.length === 0) {
    console.log(`[convert-rics-mdbs] no MDB files to process.`);
    return;
  }

  let converted = 0;
  let skippedOk = 0;
  let skippedOther = 0;
  let failed = 0;

  for (const file of files) {
    const full = path.join(args.folder, file);
    process.stdout.write(`  ${file.padEnd(24)}  `);

    const probe = probeFile(full);
    if (probe.openable && !args.force) {
      console.log(`OK (already Jet 4.0+)`);
      skippedOk++;
      continue;
    }

    if (probe.openable && args.force) {
      // Convert anyway.
    } else if (!probe.isOldFormatError) {
      console.log(`SKIP — non-format error: ${(probe.errorMessage ?? '').split('\n')[0].slice(0, 120)}`);
      skippedOther++;
      continue;
    }

    if (args.dryRun) {
      console.log(`NEEDS CONVERSION (dry-run)`);
      continue;
    }

    const result = convertFile(full);
    if (result.success) {
      console.log(`CONVERTED — ${result.message}`);
      converted++;
    } else {
      console.log(`FAILED — ${result.message.split('\n')[0].slice(0, 200)}`);
      failed++;
    }
  }

  console.log(
    `\n[convert-rics-mdbs] summary: ${converted} converted, ${skippedOk} already-ok, ${skippedOther} skipped (other), ${failed} failed`,
  );

  if (failed > 0) process.exit(1);
}

main();
