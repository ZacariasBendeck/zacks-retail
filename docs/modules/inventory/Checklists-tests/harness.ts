import { randomUUID } from 'node:crypto';

export const API_BASE = process.env.API_BASE ?? 'http://localhost:4000';

type JsonValue = unknown;

export type HttpResponse<T = JsonValue> = {
  status: number;
  ok: boolean;
  body: T;
};

export async function http<T = JsonValue>(
  method: string,
  path: string,
  body?: unknown,
): Promise<HttpResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }
  return { status: res.status, ok: res.ok, body: parsed as T };
}

export type CheckOutcome = 'PASS' | 'FAIL' | 'SKIP';

export type CheckResult = {
  id: string;
  label: string;
  outcome: CheckOutcome;
  detail?: string;
};

export class Section {
  readonly id: string;
  readonly title: string;
  readonly results: CheckResult[] = [];

  constructor(id: string, title: string) {
    this.id = id;
    this.title = title;
  }

  async check(id: string, label: string, fn: () => Promise<void> | void): Promise<void> {
    try {
      await fn();
      this.record({ id, label, outcome: 'PASS' });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.record({ id, label, outcome: 'FAIL', detail });
    }
  }

  skip(id: string, label: string, reason: string): void {
    this.record({ id, label, outcome: 'SKIP', detail: reason });
  }

  private record(r: CheckResult): void {
    this.results.push(r);
    const tag = r.outcome === 'PASS' ? 'PASS' : r.outcome === 'FAIL' ? 'FAIL' : 'SKIP';
    const suffix = r.detail ? `  — ${r.detail}` : '';
    // Plain text; callers may wrap with color if they want.
    // eslint-disable-next-line no-console
    console.log(`[${r.id}] ${r.label} … ${tag}${suffix}`);
  }

  summary(): { pass: number; fail: number; skip: number } {
    const out = { pass: 0, fail: 0, skip: 0 };
    for (const r of this.results) {
      if (r.outcome === 'PASS') out.pass += 1;
      else if (r.outcome === 'FAIL') out.fail += 1;
      else out.skip += 1;
    }
    return out;
  }

  printSummary(): void {
    const { pass, fail, skip } = this.summary();
    // eslint-disable-next-line no-console
    console.log(`\n  ${this.id} (${this.title}): ${pass} pass, ${fail} fail, ${skip} skip\n`);
  }
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function assertEqual<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${msg ?? 'values not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

export type SeededSku = {
  skuId: string;
  skuCode: string;
  categoryCode: number;
  startingOnHand: number;
};

/**
 * Finds an existing SKU suitable for mutation tests.
 *
 * Criteria:
 *   - active = true
 *   - has brand_id, color_id, style (required by VALIDATION_CANONICAL_ATTRIBUTE)
 *   - has an inventory row (so we can read starting on-hand)
 *
 * The mutation endpoint also requires a categoryCode in [556, 599] in the
 * REQUEST PAYLOAD — this is independent of the SKU's own category_id. We just
 * pick one that's in range (560 by default, widely used in existing tests).
 */
export async function seedSku(): Promise<SeededSku> {
  const list = await http<{ data: Array<{ skuId: string; skuCode: string; quantityOnHand: number; brandId: number | null }> }>(
    'GET',
    '/api/v1/inventory?limit=50&active=true',
  );
  assert(list.ok, `GET /api/v1/inventory failed: ${list.status}`);

  const candidate = list.body.data.find((r) => r.brandId != null);
  assert(candidate, 'No SKU with populated brand found; seed ref data or pick a different dev DB');

  return {
    skuId: candidate.skuId,
    skuCode: candidate.skuCode,
    categoryCode: 560,
    startingOnHand: candidate.quantityOnHand,
  };
}

export function uuid(): string {
  return randomUUID();
}

/** Common payload factory for /mutations/* endpoints. */
export function mutationPayload(opts: {
  skuId: string;
  categoryCode: number;
  quantityDelta: number;
  sourceType:
    | 'PURCHASE_ORDER_RECEIPT'
    | 'TRANSFER_ORDER'
    | 'STOCK_ADJUSTMENT'
    | 'INITIAL_IMPORT'
    | 'SYSTEM_RECONCILIATION';
  sourceId?: string;
  reasonCode?: string;
  idempotencyKey?: string;
  expectedVersion?: number;
}): Record<string, unknown> {
  return {
    skuId: opts.skuId,
    quantityDelta: opts.quantityDelta,
    reasonCode: opts.reasonCode ?? 'checklist-test',
    categoryCode: opts.categoryCode,
    sourceDocumentRef: {
      type: opts.sourceType,
      id: opts.sourceId ?? `DOC-${uuid().slice(0, 8)}`,
    },
    actorId: uuid(),
    idempotencyKey: opts.idempotencyKey,
    expectedVersion: opts.expectedVersion,
  };
}
