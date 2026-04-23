/**
 * Section C — Receiving (Manual + PO)
 *
 * Only covers what the mutation API supports today. Case-pack (X__), UPC scan,
 * and per-size entry are UI flows against the same mutation endpoint and are
 * validated at the UI layer, not here.
 */
import { Section, assert, assertEqual, http, mutationPayload, seedSku, uuid } from './harness';

export async function run(): Promise<Section> {
  const section = new Section('C', 'Receiving');
  const sku = await seedSku();

  await section.check('C-1', 'Manual Receipt (STOCK_ADJUSTMENT positive delta) increases on-hand', async () => {
    const before = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    const delta = 4;
    const res = await http(
      'POST',
      '/api/v1/inventory/mutations/adjust',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: sku.categoryCode,
        quantityDelta: delta,
        sourceType: 'STOCK_ADJUSTMENT',
        sourceId: `MR-C1-${uuid().slice(0, 6)}`,
        reasonCode: 'Manual Receipt test',
      }),
    );
    assert(res.ok, `mutation failed: ${res.status} ${JSON.stringify(res.body)}`);

    const after = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    assertEqual(after.body.quantityOnHand, before.body.quantityOnHand + delta, 'on-hand after receipt');
  });

  await section.check('C-2', 'PO Receipt (PURCHASE_ORDER_RECEIPT) increases on-hand and records source ref', async () => {
    const before = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    const key = uuid();
    const poId = `PO-C2-${key.slice(0, 6)}`;
    const delta = 6;
    const res = await http<{ sourceDocumentRef: { type: string; id: string }; adjustment: number }>(
      'POST',
      '/api/v1/inventory/mutations/receive',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: sku.categoryCode,
        quantityDelta: delta,
        sourceType: 'PURCHASE_ORDER_RECEIPT',
        sourceId: poId,
        idempotencyKey: key,
        reasonCode: 'PO Receipt test',
      }),
    );
    assert(res.ok, `mutation failed: ${res.status} ${JSON.stringify(res.body)}`);
    assertEqual(res.body.sourceDocumentRef.type, 'PURCHASE_ORDER_RECEIPT', 'sourceDocumentRef.type');
    assertEqual(res.body.sourceDocumentRef.id, poId, 'sourceDocumentRef.id');
    assertEqual(res.body.adjustment, delta, 'adjustment echo');

    const after = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    assertEqual(after.body.quantityOnHand, before.body.quantityOnHand + delta, 'on-hand after PO receipt');
  });

  await section.check('C-3', 'Partial receiving — two positive deltas both land', async () => {
    const before = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    for (const chunk of [2, 3]) {
      const key = uuid();
      const res = await http(
        'POST',
        '/api/v1/inventory/mutations/receive',
        mutationPayload({
          skuId: sku.skuId,
          categoryCode: sku.categoryCode,
          quantityDelta: chunk,
          sourceType: 'PURCHASE_ORDER_RECEIPT',
          sourceId: `PO-C3-${key.slice(0, 6)}`,
          idempotencyKey: key,
          reasonCode: `Partial receipt chunk=${chunk}`,
        }),
      );
      assert(res.ok, `chunk ${chunk} failed: ${res.status}`);
    }
    const after = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    assertEqual(after.body.quantityOnHand, before.body.quantityOnHand + 5, 'two chunks accumulated');
  });

  await section.check('C-4', 'Receive endpoint rejects missing idempotencyKey', async () => {
    const payload = mutationPayload({
      skuId: sku.skuId,
      categoryCode: sku.categoryCode,
      quantityDelta: 1,
      sourceType: 'PURCHASE_ORDER_RECEIPT',
      sourceId: 'PO-C4',
      reasonCode: 'Missing idem',
    });
    delete (payload as { idempotencyKey?: unknown }).idempotencyKey;
    const res = await http('POST', '/api/v1/inventory/mutations/receive', payload);
    assertEqual(res.status, 400, `expected 400, got ${res.status}`);
  });

  await section.check('C-5', 'Receive endpoint rejects categoryCode outside [556, 599]', async () => {
    const res = await http<{ error: { code: string } }>(
      'POST',
      '/api/v1/inventory/mutations/receive',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: 555,
        quantityDelta: 1,
        sourceType: 'PURCHASE_ORDER_RECEIPT',
        sourceId: 'PO-C5',
        idempotencyKey: uuid(),
        reasonCode: 'Bad category',
      }),
    );
    assertEqual(res.status, 400, 'status');
    assertEqual(res.body.error.code, 'VALIDATION_CATEGORY_RANGE', 'error code');
  });

  section.skip('C-6', 'Cost updates applied on receipt (weighted average)', 'Not wired through /mutations/receive yet — `products.updateAverageCost` stub pending.');
  section.skip('C-7', 'Last received date updates on receipt', 'StockLevel.lastReceivedAt not yet materialized.');
  section.skip('C-8', 'Case-pack X__ multiplier / UPC scan', 'UI-only flow; backend receives final qty.');

  section.printSummary();
  return section;
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
