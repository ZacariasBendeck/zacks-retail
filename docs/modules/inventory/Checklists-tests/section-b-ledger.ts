/**
 * Section B — Ledger Integrity (CRITICAL)
 *
 * Maps to inventory-testing-checklist.md § B. Covers the subset that can be
 * verified from the audit log + mutation API today. Size-level checks are
 * deferred until StockLevel (skuId × column × row) lands.
 */
import { Section, assert, assertEqual, http, mutationPayload, seedSku, uuid } from './harness';

export async function run(): Promise<Section> {
  const section = new Section('B', 'Ledger Integrity');
  const sku = await seedSku();

  const IDEM = uuid();
  const delta = 7;

  await section.check('B-1', 'Every inventory change creates a movement record', async () => {
    const before = await http<{ pagination: { totalItems: number } }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=1`,
    );
    assert(before.ok, `audit-log before: ${before.status}`);
    const beforeCount = before.body.pagination.totalItems;

    const mut = await http(
      'POST',
      '/api/v1/inventory/mutations/receive',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: sku.categoryCode,
        quantityDelta: delta,
        sourceType: 'PURCHASE_ORDER_RECEIPT',
        sourceId: `PO-B1-${IDEM.slice(0, 6)}`,
        idempotencyKey: IDEM,
        reasonCode: 'Ledger test B-1',
      }),
    );
    assert(mut.ok, `mutation failed: ${mut.status} ${JSON.stringify(mut.body)}`);

    const after = await http<{ pagination: { totalItems: number } }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=1`,
    );
    assertEqual(after.body.pagination.totalItems, beforeCount + 1, 'audit-log count');
  });

  await section.check('B-2', 'Movement quantity matches committed delta (+ / - direction)', async () => {
    const log = await http<{ data: Array<{ adjustment: number; idempotencyKey: string | null }> }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=5`,
    );
    const entry = log.body.data.find((e) => e.idempotencyKey === IDEM);
    assert(entry, `audit entry with idempotency key ${IDEM} not found`);
    assertEqual(entry.adjustment, delta, 'adjustment');
  });

  await section.check('B-3', 'Movement timestamp is populated', async () => {
    const log = await http<{ data: Array<{ createdAt: string; idempotencyKey: string | null }> }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=5`,
    );
    const entry = log.body.data.find((e) => e.idempotencyKey === IDEM);
    assert(entry, 'entry missing');
    const ts = new Date(entry.createdAt).getTime();
    assert(Number.isFinite(ts) && ts > 0, `invalid createdAt: ${entry.createdAt}`);
    assert(Math.abs(Date.now() - ts) < 5 * 60_000, `createdAt too far from now: ${entry.createdAt}`);
  });

  await section.check(
    'B-4',
    'Reconstructing on-hand from audit-log adjustments matches inventory.quantityOnHand',
    async () => {
      // Pull the full audit log (cap at 200 for dev scale) and sum.
      const log = await http<{
        data: Array<{ adjustment: number }>;
        pagination: { totalItems: number };
      }>('GET', `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=200&order=asc`);
      assert(log.ok, `audit-log: ${log.status}`);

      if (log.body.pagination.totalItems > 200) {
        throw new Error(
          `Audit log has ${log.body.pagination.totalItems} rows; reconstruction needs paging. Extend this check when historical data is loaded.`,
        );
      }

      const reconstructed = log.body.data.reduce((sum, r) => sum + r.adjustment, 0);
      const inv = await http<{ quantityOnHand: number }>('GET', `/api/v1/skus/${sku.skuId}/inventory`);
      assert(inv.ok, `inventory: ${inv.status}`);
      assertEqual(inv.body.quantityOnHand, reconstructed, 'reconstructed on-hand');
    },
  );

  await section.check('B-5', 'resultingBalance on each entry is monotonic with order', async () => {
    const log = await http<{ data: Array<{ resultingBalance: number; adjustment: number }> }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=200&order=asc`,
    );
    let running = 0;
    for (const entry of log.body.data) {
      running += entry.adjustment;
      if (entry.resultingBalance !== running) {
        throw new Error(`resultingBalance drift at adjustment=${entry.adjustment}: running=${running}, stored=${entry.resultingBalance}`);
      }
    }
  });

  section.skip('B-6', 'Movement type controlled vocabulary (MANUAL_RECEIPT / PO_RECEIPT / TRANSFER_IN / ...)', 'Current audit log stores `sourceDocumentRef.type`, not a movementType. StockMovement enum lands with the `products` + ledger split.');
  section.skip('B-7', 'Size-level (column × row) ledger entries', 'Requires StockLevel/StockMovement per-cell schema. Not implemented.');

  section.printSummary();
  return section;
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
