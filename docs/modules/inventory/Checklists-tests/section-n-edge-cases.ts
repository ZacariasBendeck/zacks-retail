/**
 * Section N — Edge Cases (VERY IMPORTANT)
 *
 * Idempotency, optimistic concurrency, and insufficient-stock guards.
 */
import { Section, assert, assertEqual, http, mutationPayload, seedSku, uuid } from './harness';

export async function run(): Promise<Section> {
  const section = new Section('N', 'Edge Cases');
  const sku = await seedSku();

  await section.check('N-1', 'Negative on-hand blocked (INSUFFICIENT_STOCK)', async () => {
    const inv = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    const overshoot = -(inv.body.quantityOnHand + 100);
    const res = await http<{ error: { code: string } }>(
      'POST',
      '/api/v1/inventory/mutations/adjust',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: sku.categoryCode,
        quantityDelta: overshoot,
        sourceType: 'STOCK_ADJUSTMENT',
        sourceId: `N1-${uuid().slice(0, 6)}`,
        reasonCode: 'Overshoot',
      }),
    );
    assertEqual(res.status, 400, 'status');
    assertEqual(res.body.error.code, 'INSUFFICIENT_STOCK', 'error code');
  });

  await section.check('N-2', 'Duplicate-movement prevented: same idempotency key + same payload replays (no new row)', async () => {
    const key = uuid();
    const payload = mutationPayload({
      skuId: sku.skuId,
      categoryCode: sku.categoryCode,
      quantityDelta: 5,
      sourceType: 'PURCHASE_ORDER_RECEIPT',
      sourceId: `PO-N2-${key.slice(0, 6)}`,
      idempotencyKey: key,
      reasonCode: 'Idempotent replay',
    });

    const first = await http<{ id: string }>('POST', '/api/v1/inventory/mutations/receive', payload);
    assert(first.ok, `first call failed: ${first.status}`);

    const countBefore = await http<{ pagination: { totalItems: number } }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=1`,
    );

    const second = await http<{ id: string }>('POST', '/api/v1/inventory/mutations/receive', payload);
    assert(second.ok, `replay failed: ${second.status}`);
    assertEqual(second.body.id, first.body.id, 'replayed entry id should match original');

    const countAfter = await http<{ pagination: { totalItems: number } }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=1`,
    );
    assertEqual(countAfter.body.pagination.totalItems, countBefore.body.pagination.totalItems, 'no new audit row on replay');
  });

  await section.check('N-3', 'Same idempotency key + different payload returns 409 IDEMPOTENCY_KEY_PAYLOAD_MISMATCH', async () => {
    const key = uuid();
    const base = mutationPayload({
      skuId: sku.skuId,
      categoryCode: sku.categoryCode,
      quantityDelta: 5,
      sourceType: 'PURCHASE_ORDER_RECEIPT',
      sourceId: `PO-N3-${key.slice(0, 6)}`,
      idempotencyKey: key,
      reasonCode: 'First',
    });
    const first = await http('POST', '/api/v1/inventory/mutations/receive', base);
    assert(first.ok, `first failed: ${first.status}`);

    const second = await http<{ error: { code: string } }>(
      'POST',
      '/api/v1/inventory/mutations/receive',
      { ...base, quantityDelta: 6, reasonCode: 'Different' },
    );
    assertEqual(second.status, 409, 'status');
    assertEqual(second.body.error.code, 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH', 'error code');
  });

  await section.check('N-4', 'Optimistic concurrency: stale expectedVersion → 409 CONFLICT_VERSION_MISMATCH', async () => {
    const inv = await http<{ version: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    const stale = Math.max(1, inv.body.version - 1);
    const res = await http<{ error: { code: string } }>(
      'POST',
      '/api/v1/inventory/mutations/adjust',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: sku.categoryCode,
        quantityDelta: 1,
        sourceType: 'STOCK_ADJUSTMENT',
        sourceId: `N4-${uuid().slice(0, 6)}`,
        reasonCode: 'Stale version',
        expectedVersion: stale,
      }),
    );
    if (stale === inv.body.version) {
      // Only possible when current version is 1 — skip the check rather than passing spuriously.
      throw new Error('Cannot test stale version when current version is 1; retry after more mutations');
    }
    assertEqual(res.status, 409, 'status');
    assertEqual(res.body.error.code, 'CONFLICT_VERSION_MISMATCH', 'error code');
  });

  await section.check('N-5', 'Error envelope includes traceId on validation failures', async () => {
    const res = await http<{ error: { traceId?: string } }>(
      'POST',
      '/api/v1/inventory/mutations/receive',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: 999,
        quantityDelta: 1,
        sourceType: 'PURCHASE_ORDER_RECEIPT',
        sourceId: 'PO-N5',
        idempotencyKey: uuid(),
        reasonCode: 'Bad cat',
      }),
    );
    // 999 is outside [556,599] but passes the Zod schema — service returns 400 with traceId.
    assertEqual(res.status, 400, 'status');
    assert(typeof res.body.error.traceId === 'string' && res.body.error.traceId.length > 0, 'traceId populated');
  });

  section.skip('N-6', 'Backdated movements behave correctly', 'occurredAt is accepted but not persisted as movementAt yet.');
  section.skip('N-7', 'Discontinue rollup behaves correctly', 'Discontinue flow owned by `products`; not wired to inventory ledger yet.');
  section.skip('N-8', 'Transfer conflicts handled correctly', 'Transfers not implemented — see section E/F/G.');

  section.printSummary();
  return section;
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
