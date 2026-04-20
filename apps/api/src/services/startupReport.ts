/**
 * Consolidated API startup report.
 *
 * On every restart, `index.ts` creates one `StartupReport`, registers each
 * warmup phase through `track()`, and calls `print()` once every phase has
 * settled. Output is a single aligned table so operators can see at a glance
 * what ran, what failed, and how long each piece took.
 *
 * Individual adapters still log their own per-phase lines during execution —
 * this report is the *summary* at the bottom of the log, not a replacement
 * for those lines.
 *
 * See docs/operations/startup-report.md for the full spec.
 */

export interface StartupPhaseResult {
  name: string;
  ms: number;
  ok: boolean;
  error?: string;
  detail?: string;
}

export class StartupReport {
  private readonly started: number;
  private readonly phases: StartupPhaseResult[] = [];

  constructor() {
    this.started = Date.now();
  }

  /**
   * Run `fn`, time it, and append a row to the report. Failures are captured
   * — the returned promise never rejects, so the caller can safely include
   * multiple phases in a single `Promise.all`.
   */
  async track<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    const t0 = Date.now();
    try {
      const result = await fn();
      this.phases.push({ name, ms: Date.now() - t0, ok: true });
      return result;
    } catch (err) {
      this.phases.push({
        name,
        ms: Date.now() - t0,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  /**
   * Add a phase that wasn't actually run (e.g. guarded by an env flag).
   * Shows up in the table with a 0 ms time and a "skipped — reason" note
   * so the operator can see which phases were intentionally dormant.
   */
  skip(name: string, reason: string): void {
    this.phases.push({
      name,
      ms: 0,
      ok: true,
      detail: `skipped — ${reason}`,
    });
  }

  /**
   * Append already-measured sub-results from a nested warmup (e.g. the 11
   * tasks inside `warmupProductsAdmin`). The name prefix namespaces them
   * so they line up with their parent in the table.
   */
  addSubPhases(prefix: string, subs: StartupPhaseResult[]): void {
    for (const s of subs) {
      this.phases.push({ ...s, name: `${prefix}.${s.name}` });
    }
  }

  print(): void {
    const totalMs = Date.now() - this.started;
    const okCount = this.phases.filter((p) => p.ok).length;
    const failCount = this.phases.length - okCount;
    const nameWidth = Math.max(28, ...this.phases.map((p) => p.name.length));
    const msWidth = Math.max(
      6,
      ...this.phases.map((p) => String(p.ms).length),
    );

    const bar = '─'.repeat(nameWidth + msWidth + 8);
    const header = `  API startup report — ${okCount}/${this.phases.length} ok in ${totalMs}ms${
      failCount > 0 ? `  (${failCount} failed)` : ''
    }`;

    const lines: string[] = [];
    lines.push('');
    lines.push(bar);
    lines.push(header);
    lines.push(bar);
    for (const p of this.phases) {
      const tag = p.ok ? '[ok] ' : '[err]';
      const name = p.name.padEnd(nameWidth);
      const ms = String(p.ms).padStart(msWidth);
      const suffix = p.detail
        ? `  (${p.detail})`
        : p.error
          ? `  — ${p.error}`
          : '';
      lines.push(`  ${tag} ${name}  ${ms} ms${suffix}`);
    }
    lines.push(bar);
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  }
}
