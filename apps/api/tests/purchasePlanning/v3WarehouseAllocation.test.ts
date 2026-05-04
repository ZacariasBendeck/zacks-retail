import {
  allocateWarehouseCreditForSeason,
  type WarehousePoolItem,
} from '../../src/services/purchasePlanning/purchasePlanningV3Service';

function pool(items: Array<Partial<WarehousePoolItem> & { skuCode: string; remainingQty: number; eligibleStoreGroupCodes: string[] }>): WarehousePoolItem[] {
  return items.map((item) => ({
    skuCode: item.skuCode,
    skuDescription: item.skuDescription ?? null,
    remainingQty: item.remainingQty,
    startingQty: item.startingQty ?? item.remainingQty,
    eligibleStoreGroupCodes: item.eligibleStoreGroupCodes,
  }));
}

describe('purchase planning v3 warehouse allocation', () => {
  it('credits single-chain warehouse stock only to that chain', () => {
    const items = pool([{ skuCode: 'SKU1', remainingQty: 20, eligibleStoreGroupCodes: ['unlimited'] }]);
    const result = allocateWarehouseCreditForSeason(items, new Map([
      ['unlimited', 15],
      ['magic-shoes', 30],
    ]));

    expect(result.creditByChain.get('unlimited')).toBe(15);
    expect(result.creditByChain.get('magic-shoes') ?? 0).toBe(0);
    expect(items[0]?.remainingQty).toBe(5);
  });

  it('splits multi-chain warehouse stock by demand fair-share', () => {
    const items = pool([{ skuCode: 'SKU2', remainingQty: 40, eligibleStoreGroupCodes: ['unlimited', 'magic-shoes'] }]);
    const result = allocateWarehouseCreditForSeason(items, new Map([
      ['unlimited', 30],
      ['magic-shoes', 10],
    ]));

    expect(result.creditByChain.get('unlimited')).toBe(30);
    expect(result.creditByChain.get('magic-shoes')).toBe(10);
    expect(items[0]?.remainingQty).toBe(0);
  });

  it('treats untagged warehouse stock as eligible for all selected chains', () => {
    const items = pool([{ skuCode: 'SKU3', remainingQty: 12, eligibleStoreGroupCodes: [] }]);
    const result = allocateWarehouseCreditForSeason(items, new Map([
      ['unlimited', 9],
      ['magic-shoes', 3],
    ]));

    expect(result.creditByChain.get('unlimited')).toBe(9);
    expect(result.creditByChain.get('magic-shoes')).toBe(3);
    expect(result.unallocatedDetails).toHaveLength(0);
    expect(items[0]?.remainingQty).toBe(0);
  });

  it('does not credit a chain with zero need', () => {
    const items = pool([{ skuCode: 'SKU4', remainingQty: 20, eligibleStoreGroupCodes: ['unlimited', 'magic-shoes'] }]);
    const result = allocateWarehouseCreditForSeason(items, new Map([
      ['unlimited', 0],
      ['magic-shoes', 8],
    ]));

    expect(result.creditByChain.get('unlimited') ?? 0).toBe(0);
    expect(result.creditByChain.get('magic-shoes')).toBe(8);
    expect(items[0]?.remainingQty).toBe(12);
  });
});
