/**
 * Section A — On-Hand Accuracy
 *
 * Automates the self-consistency checks; the full "matches RICS after
 * migration" is cross-module and belongs with /verify-rics-mirror.
 */
import { Section, assert, assertEqual, http, mutationPayload, seedSku, uuid } from './harness';

export async function run(): Promise<Section> {
  const section = new Section('A', 'On-Hand Accuracy');
  const sku = await seedSku();

  await section.check('A-1', 'quantityOnHand >= 0 on every inventory row', async () => {
    const res = await http<{ data: Array<{ quantityOnHand: number; skuCode: string }> }>(
      'GET',
      '/api/v1/inventory?limit=200',
    );
    assert(res.ok, `list inventory: ${res.status}`);
    const bad = res.body.data.filter((r) => r.quantityOnHand < 0);
    if (bad.length > 0) {
      throw new Error(`${bad.length} rows with negative on-hand (e.g. ${bad[0].skuCode}=${bad[0].quantityOnHand})`);
    }
  });

  await section.check('A-2', 'quantityAvailable = quantityOnHand - quantityReserved', async () => {
    const res = await http<{ data: Array<{ quantityOnHand: number; quantityReserved: number; quantityAvailable: number; skuCode: string }> }>(
      'GET',
      '/api/v1/inventory?limit=100',
    );
    const drift = res.body.data.find((r) => r.quantityAvailable !== r.quantityOnHand - r.quantityReserved);
    if (drift) {
      throw new Error(
        `drift on ${drift.skuCode}: onHand=${drift.quantityOnHand}, reserved=${drift.quantityReserved}, available=${drift.quantityAvailable}`,
      );
    }
  });

  await section.check('A-3', 'Inventory row exists for every active SKU with movements', async () => {
    // Light proxy: GET /api/v1/skus/:id/inventory on the seeded SKU returns 200.
    const inv = await http<{ skuId: string }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    assertEqual(inv.status, 200, `expected 200 for seeded SKU, got ${inv.status}`);
  });

  await section.check('A-4', 'On-hand round-trip: +N then -N restores starting balance', async () => {
    const delta = 3;
    const keyIn = uuid();
    const receive = await http<{ resultingBalance: number }>(
      'POST',
      '/api/v1/inventory/mutations/receive',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: sku.categoryCode,
        quantityDelta: delta,
        sourceType: 'PURCHASE_ORDER_RECEIPT',
        sourceId: `PO-A4-${keyIn.slice(0, 6)}`,
        idempotencyKey: keyIn,
        reasonCode: 'Round-trip receive',
      }),
    );
    assert(receive.ok, `receive failed: ${receive.status} ${JSON.stringify(receive.body)}`);

    const afterReceive = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    const expectedPeak = sku.startingOnHand + delta;
    assertEqual(afterReceive.body.quantityOnHand, expectedPeak, 'peak on-hand');

    const adjust = await http<{ resultingBalance: number }>(
      'POST',
      '/api/v1/inventory/mutations/adjust',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: sku.categoryCode,
        quantityDelta: -delta,
        sourceType: 'STOCK_ADJUSTMENT',
        sourceId: `ADJ-A4-${keyIn.slice(0, 6)}`,
        reasonCode: 'Round-trip adjust',
      }),
    );
    assert(adjust.ok, `adjust failed: ${adjust.status} ${JSON.stringify(adjust.body)}`);

    const afterAdjust = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
    assertEqual(afterAdjust.body.quantityOnHand, sku.startingOnHand, 'restored on-hand');
  });

  section.skip('A-5', 'Size-level (column × row) on-hand accuracy', 'Per-cell StockLevel not yet wired.');
  section.skip('A-6', 'Quantity-only SKUs (no size grid) behave correctly', 'Needs size-grid path — skipped until StockLevel lands.');
  section.skip('A-7', 'On-hand matches RICS after migration', 'Owned by /verify-rics-mirror; cross-module check.');

  section.printSummary();
  return section;
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
