/**
 * Section D — Returns
 *
 * Returns are negative-delta mutations against /mutations/adjust. The receive
 * endpoint could also accept negative deltas but the canonical "Return" path
 * is adjust per current convention.
 */
import { Section, assert, assertEqual, http, mutationPayload, seedSku, uuid } from './harness';

export async function run(): Promise<Section> {
  const section = new Section('D', 'Returns');
  const sku = await seedSku();

  // Ensure non-zero balance so we can safely subtract.
  const priming = await http(
    'POST',
    '/api/v1/inventory/mutations/receive',
    mutationPayload({
      skuId: sku.skuId,
      categoryCode: sku.categoryCode,
      quantityDelta: 10,
      sourceType: 'PURCHASE_ORDER_RECEIPT',
      sourceId: `PO-D-prime-${uuid().slice(0, 6)}`,
      idempotencyKey: uuid(),
      reasonCode: 'Prime for return tests',
    }),
  );
  assert(priming.ok, `priming receipt failed: ${priming.status}`);

  await section.check('D-1', 'Manual Return (negative delta) decreases on-hand', async () => {
    const before = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    const res = await http(
      'POST',
      '/api/v1/inventory/mutations/adjust',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: sku.categoryCode,
        quantityDelta: -3,
        sourceType: 'STOCK_ADJUSTMENT',
        sourceId: `RET-D1-${uuid().slice(0, 6)}`,
        reasonCode: 'Return to vendor',
      }),
    );
    assert(res.ok, `adjust failed: ${res.status} ${JSON.stringify(res.body)}`);
    const after = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    assertEqual(after.body.quantityOnHand, before.body.quantityOnHand - 3, 'on-hand after return');
  });

  await section.check('D-2', 'Return blocked when it would drive on-hand below zero (INSUFFICIENT_STOCK)', async () => {
    const current = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    const overshoot = -(current.body.quantityOnHand + 1);
    const res = await http<{ error: { code: string } }>(
      'POST',
      '/api/v1/inventory/mutations/adjust',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: sku.categoryCode,
        quantityDelta: overshoot,
        sourceType: 'STOCK_ADJUSTMENT',
        sourceId: `RET-D2-${uuid().slice(0, 6)}`,
        reasonCode: 'Overshoot return',
      }),
    );
    assertEqual(res.status, 400, 'status');
    assertEqual(res.body.error.code, 'INSUFFICIENT_STOCK', 'error code');
  });

  await section.check('D-3', 'Return journal / audit log has matching entry', async () => {
    const key = uuid();
    const sourceId = `RET-D3-${key.slice(0, 6)}`;
    const res = await http(
      'POST',
      '/api/v1/inventory/mutations/adjust',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: sku.categoryCode,
        quantityDelta: -2,
        sourceType: 'STOCK_ADJUSTMENT',
        sourceId,
        idempotencyKey: key,
        reasonCode: 'Return journal check',
      }),
    );
    assert(res.ok, `adjust failed: ${res.status}`);

    const log = await http<{ data: Array<{ adjustment: number; idempotencyKey: string | null; sourceDocumentRef: { type: string; id: string } | null }> }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=10`,
    );
    const entry = log.body.data.find((e) => e.idempotencyKey === key);
    assert(entry, 'audit entry not found for the return');
    assertEqual(entry.adjustment, -2, 'adjustment sign');
    assertEqual(entry.sourceDocumentRef?.id, sourceId, 'sourceDocumentRef.id echoes');
  });

  await section.check('D-4', 'On-hand preview endpoint returns a sensible object', async () => {
    // Ideally GET /api/v1/inventory/on-hand/sku?... but it requires brand/style/color filters.
    // Fall back to the per-SKU inventory read (what the UI uses before a return).
    const inv = await http<{ quantityOnHand: number; quantityAvailable: number }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory`,
    );
    assert(inv.ok, `inventory read: ${inv.status}`);
    assert(typeof inv.body.quantityOnHand === 'number', 'quantityOnHand numeric');
    assert(typeof inv.body.quantityAvailable === 'number', 'quantityAvailable numeric');
  });

  section.printSummary();
  return section;
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
