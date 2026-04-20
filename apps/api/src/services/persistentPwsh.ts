/**
 * Persistent PowerShell host.
 *
 * The default `spawnSync('powershell', …)` path pays ~700–1200 ms of cold
 * start on every call because it launches a new powershell.exe each time.
 * For the RICS read/write adapter — which runs many small queries during a
 * single page load — that dominates latency.
 *
 * This module keeps ONE long-lived `powershell.exe` running, pipes each
 * script to its stdin, and frames responses with a per-request end marker
 * so Node knows when one response finishes and the next begins. Requests
 * are serialized (PS is single-threaded per session); the queue is ordered
 * strictly FIFO, so the first `execute` issued is the first response read.
 *
 * Reliability:
 *   - If the PS process exits (crash, hang timeout), the next `execute`
 *     respawns it transparently.
 *   - A soft per-request timeout kills the process + respawns rather than
 *     hanging forever.
 *   - Node process exit cleans up the child via `exit` / `SIGINT` / `SIGTERM`
 *     handlers.
 *
 * UTF-8: the host sets `[Console]::OutputEncoding` and `$OutputEncoding`
 * once on startup, so every subsequent script inherits UTF-8 stdout. This
 * is why we can drop the per-script UTF-8 prologue from `accessOleDb.ts`
 * — though keeping it there is harmless.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const END_MARKER = '___PWSH_END___';
const SEND_MARKER = '___PWSH_SEND___';
// Per-request hard timeout. 3 minutes covers the SKU list (25k rows / ~30-60 s
// over OLE DB) and every other Access query we expect. If a request takes
// longer than this, something's wrong and we'd rather kill the host than hang.
const DEFAULT_TIMEOUT_MS = 180_000;

interface PendingRequest {
  resolve: (payload: string) => void;
  reject: (err: Error) => void;
  startedAt: number;
  timeoutHandle: NodeJS.Timeout;
}

class PersistentPowerShellHost {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuf = '';
  private stderrBuf = '';
  private pending: PendingRequest[] = [];
  /** Serialization chain — each execute waits for the previous one. */
  private chain: Promise<unknown> = Promise.resolve();
  /** Bumped on each process spawn; pending requests from the previous
   *  generation are rejected when a new process starts. */
  private generation = 0;
  /** True once we've wired a `process.on('exit')` cleanup hook. */
  private exitHookInstalled = false;

  private installExitHook(): void {
    if (this.exitHookInstalled) return;
    this.exitHookInstalled = true;
    const kill = () => {
      try {
        this.proc?.kill();
      } catch {
        /* ignore */
      }
    };
    process.once('exit', kill);
    process.once('SIGINT', () => {
      kill();
      process.exit(130);
    });
    process.once('SIGTERM', () => {
      kill();
      process.exit(143);
    });
  }

  private start(): void {
    this.installExitHook();
    this.generation += 1;
    this.stdoutBuf = '';
    this.stderrBuf = '';

    // PowerShell launched with `-Command -` reads stdin as a SINGLE script
    // until EOF, so it can't serve as a REPL. Instead, we boot PS with an
    // explicit host loop: it reads lines until it sees `___PWSH_SEND___`,
    // executes whatever preceded it via Invoke-Expression, emits an end
    // marker, flushes, and loops. Every write from Node is:
    //     <script lines…>
    //     ___PWSH_SEND___
    // and every response is read up to `___PWSH_END_<token>___`.
    // The host loop emits the end marker AS part of the PowerShell pipeline
    // stream — not via a separate `[Console]::Out.WriteLine`. That way the
    // marker is guaranteed to appear AFTER every preceding pipeline object
    // (including huge `ConvertTo-Json` outputs) in strict write order, with
    // no flush race. Earlier designs that called `Out.Flush()` + writeline
    // for the marker worked for small payloads but could misframe on large
    // ones because the implicit pipeline was still draining when the
    // separate writeline landed on stdout.
    const hostLoop = [
      "$ErrorActionPreference = 'Continue'",
      "$OutputEncoding = [System.Text.Encoding]::UTF8",
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      '',
      'while ($true) {',
      '  $buf = New-Object System.Text.StringBuilder',
      '  while ($true) {',
      '    $line = [Console]::In.ReadLine()',
      '    if ($null -eq $line) { exit }',
      "    if ($line -eq '___PWSH_SEND___') { break }",
      '    [void]$buf.AppendLine($line)',
      '  }',
      '  try {',
      '    Invoke-Expression $buf.ToString()',
      '  } catch {',
      "    @{ __pwshHostError = $true; message = $_.Exception.Message } | ConvertTo-Json -Compress",
      '  }',
      // End marker on its own line, as a bare pipeline string. PowerShell
      // queues it behind whatever the script emitted; the default
      // `Out-Default` formatter writes each pipeline string followed by a
      // newline, so Node sees the marker on its own line on stdout.
      "  '___PWSH_END___'",
      '}',
    ].join('\r\n');

    const proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', hostLoop], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc = proc;

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      this.stdoutBuf += chunk;
      this.drain();
    });

    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => {
      this.stderrBuf += chunk;
    });

    // Typings for ChildProcessWithoutNullStreams.on are strict in this
    // @types/node version; cast to EventEmitter surface to quiet TS.
    const emitter = proc as unknown as NodeJS.EventEmitter;
    emitter.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      const err = new Error(
        `powershell host exited (code=${code}, signal=${signal}). ` +
          (this.stderrBuf ? `stderr: ${this.stderrBuf.slice(-500)}` : ''),
      );
      this.failAllPending(err);
      this.proc = null;
    });
    emitter.on('error', (err: Error) => {
      this.failAllPending(err);
    });
  }

  private failAllPending(err: Error): void {
    const toFail = this.pending;
    this.pending = [];
    for (const p of toFail) {
      clearTimeout(p.timeoutHandle);
      p.reject(err);
    }
  }

  /**
   * Scan the stdout buffer for the next end-marker and resolve the FIFO-head
   * pending request with whatever preceded it. The host loop emits one
   * `___PWSH_END___` line per executed script, so each shift pairs with
   * exactly one write.
   */
  private drain(): void {
    while (this.pending.length > 0) {
      const idx = this.stdoutBuf.indexOf(END_MARKER);
      if (idx < 0) return;
      const payload = this.stdoutBuf.slice(0, idx);
      // The marker is on its own line; skip past it plus its trailing CRLF.
      let rest = this.stdoutBuf.slice(idx + END_MARKER.length);
      if (rest.startsWith('\r\n')) rest = rest.slice(2);
      else if (rest.startsWith('\n')) rest = rest.slice(1);
      this.stdoutBuf = rest;

      const head = this.pending.shift()!;
      clearTimeout(head.timeoutHandle);
      head.resolve(payload);
    }
  }

  /**
   * Send a PowerShell script and resolve with its stdout (everything before
   * the per-request end marker). Rejects on process death or timeout.
   */
  async execute(script: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
    // Serialize: each execute waits for the previous one to finish. PS is
    // single-threaded per session anyway — interleaving stdout would break
    // marker framing.
    const prev = this.chain;
    let releaseLock!: () => void;
    this.chain = new Promise<void>((r) => {
      releaseLock = r;
    });
    try {
      await prev;
    } catch {
      /* ignore — we still want to try ours */
    }
    try {
      return await this.doExecute(script, timeoutMs);
    } finally {
      releaseLock();
    }
  }

  private doExecute(script: string, timeoutMs: number): Promise<string> {
    if (!this.proc) this.start();
    const proc = this.proc!;

    return new Promise<string>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        // Kill the host — a hung request poisons the FIFO for everyone.
        try {
          proc.kill();
        } catch {
          /* ignore */
        }
        reject(new Error(`powershell host request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.push({ resolve, reject, startedAt: Date.now(), timeoutHandle });

      // Protocol: send the user script verbatim, then a lone `___PWSH_SEND___`
      // line. The host loop reads lines until that sentinel, runs
      // Invoke-Expression on the buffer, and emits `___PWSH_END___` when done.
      proc.stdin.write(script);
      if (!script.endsWith('\n')) proc.stdin.write('\r\n');
      proc.stdin.write(SEND_MARKER);
      proc.stdin.write('\r\n');
    });
  }

  /** Kill the host process synchronously. Next execute() will respawn it. */
  shutdown(): void {
    try {
      this.proc?.kill();
    } catch {
      /* ignore */
    }
    this.proc = null;
  }
}

let hostSingleton: PersistentPowerShellHost | null = null;

function getHost(): PersistentPowerShellHost {
  if (!hostSingleton) hostSingleton = new PersistentPowerShellHost();
  return hostSingleton;
}

/**
 * Main entry point — equivalent to `spawnSync('powershell', ['-Command', script]).stdout`
 * but re-using a persistent host. Returns raw stdout (trimmed).
 *
 * Consumers (`runPowerShellJson` in accessOleDb.ts) are responsible for
 * JSON.parse and error-envelope detection.
 */
export async function executeViaPersistentHost(
  script: string,
  timeoutMs?: number,
): Promise<string> {
  const out = await getHost().execute(script, timeoutMs);
  return out.trim();
}

/** For tests + graceful shutdown: kill the PS process if one is alive. */
export function shutdownPersistentHost(): void {
  hostSingleton?.shutdown();
  hostSingleton = null;
}
