/**
 * Section J — Inventory Change Detail (Audit View)
 *
 * Automated against /api/v1/skus/:skuId/inventory/audit-log. The per-size
 * toggle and all-stores toggle are UI-only today.
 */
import { Section, assert, assertEqual, http, mutationPayload, seedSku, uuid } from './harness';

export async function run(): Promise<Section> {
  const section = new Section('J', 'Inventory Change Detail');
  const sku = await seedSku();

  // Generate a few fresh entries so we can assert on ordering deterministically.
  const sentinels: Array<{ key: string; delta: number; sourceId: string }> = [];
  for (const delta of [1, 2, -1]) {
    const key = uuid();
    const sourceId = `CD-${key.slice(0, 8)}`;
    const res = await http(
      'POST',
      delta > 0 ? '/api/v1/inventory/mutations/receive' : '/api/v1/inventory/mutations/adjust',
      mutationPayload({
        skuId: sku.skuId,
        categoryCode: sku.categoryCode,
        quantityDelta: delta,
        sourceType: delta > 0 ? 'PURCHASE_ORDER_RECEIPT' : 'STOCK_ADJUSTMENT',
        sourceId,
        idempotencyKey: delta > 0 ? key : undefined,
        reasonCode: `Change-detail seed delta=${delta}`,
      }),
    );
    assert(res.ok, `seed delta=${delta} failed: ${res.status}`);
    sentinels.push({ key, delta, sourceId });
    // Small gap to ensure createdAt differs on fast hardware.
    await new Promise((r) => setTimeout(r, 5));
  }

  await section.check('J-1', 'Audit log returns all movement types present (receive + adjust)', async () => {
    const log = await http<{ data: Array<{ sourceDocumentRef: { type: string } | null }> }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=50`,
    );
    const types = new Set(log.body.data.map((e) => e.sourceDocumentRef?.type).filter(Boolean));
    assert(types.has('PURCHASE_ORDER_RECEIPT'), 'PURCHASE_ORDER_RECEIPT missing from recent log');
    assert(types.has('STOCK_ADJUSTMENT'), 'STOCK_ADJUSTMENT missing from recent log');
  });

  await section.check('J-2', 'Entries carry skuId, adjustment, reason, resultingBalance, performedBy, createdAt', async () => {
    const log = await http<{ data: Array<Record<string, unknown>> }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=5`,
    );
    const entry = log.body.data[0];
    for (const field of ['id', 'skuId', 'adjustment', 'reason', 'resultingBalance', 'performedBy', 'createdAt']) {
      assert(field in entry, `missing field: ${field}`);
    }
  });

  await section.check('J-3', 'Source document ref id echoes on the entry (traceability)', async () => {
    const log = await http<{ data: Array<{ sourceDocumentRef: { id: string } | null }> }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=20`,
    );
    for (const sentinel of sentinels) {
      const found = log.body.data.find((e) => e.sourceDocumentRef?.id === sentinel.sourceId);
      if (!found) throw new Error(`source id ${sentinel.sourceId} not found in recent audit log`);
    }
  });

  await section.check('J-4', 'Most-recent-first ordering by default', async () => {
    const log = await http<{ data: Array<{ createdAt: string }> }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=20`,
    );
    for (let i = 1; i < log.body.data.length; i += 1) {
      const prev = new Date(log.body.data[i - 1].createdAt).getTime();
      const curr = new Date(log.body.data[i].createdAt).getTime();
      if (prev < curr) {
        throw new Error(`ordering violation at index ${i}: ${log.body.data[i - 1].createdAt} < ${log.body.data[i].createdAt}`);
      }
    }
  });

  await section.check('J-5', 'Pagination envelope is consistent (page, pageSize, totalItems, totalPages)', async () => {
    const log = await http<{ pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } }>(
      'GET',
      `/api/v1/skus/${sku.skuId}/inventory/audit-log?pageSize=2`,
    );
    const p = log.body.pagination;
    assertEqual(p.page, 1, 'page');
    assertEqual(p.pageSize, 2, 'pageSize');
    assert(p.totalItems >= sentinels.length, 'totalItems below seeded count');
    assertEqual(p.totalPages, Math.ceil(p.totalItems / p.pageSize), 'totalPages');
  });

  section.skip('J-6', 'Size-detail toggle (column × row expansion)', 'Depends on per-cell StockMovement — not implemented.');
  section.skip('J-7', 'Show-all-stores toggle', 'Requires multi-store ledger keyed by storeId — not implemented.');

  section.printSummary();
  return section;
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
