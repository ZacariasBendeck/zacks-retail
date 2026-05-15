import {
  allocateByWeights,
  buildInclusionReason,
  buildReleaseDates,
  buildWavePlan,
  deriveRawColorKey,
  hasPrKeyword,
  type AssortmentPoolItem,
  type AssortmentTargetStore,
} from '../src/services/assortmentPlanningService';

describe('assortment planning helpers', () => {
  describe('hasPrKeyword', () => {
    it('matches PR as a standalone keyword token', () => {
      expect(hasPrKeyword('IBL ZB C2550 GXT PR')).toBe(true);
      expect(hasPrKeyword('pr')).toBe(true);
      expect(hasPrKeyword('ZB-PR GXT')).toBe(true);
      expect(hasPrKeyword('ZB,PR,GXT')).toBe(true);
    });

    it('does not match PR inside longer tokens', () => {
      expect(hasPrKeyword('APPROACH')).toBe(false);
      expect(hasPrKeyword('PRIME')).toBe(false);
      expect(hasPrKeyword('SPR')).toBe(false);
      expect(hasPrKeyword('PR2')).toBe(false);
    });
  });

  it('reports the pool inclusion reason', () => {
    expect(buildInclusionReason(true, false)).toBe('Never distributed');
    expect(buildInclusionReason(false, true)).toBe('PR');
    expect(buildInclusionReason(true, true)).toBe('Both');
  });

  it('derives color from style_color, then SKU suffix, then color_code', () => {
    expect(deriveRawColorKey({ skuCode: 'DMTDU1RD', styleColor: 'DMTDU1/BK', colorCode: 'ROJO' })).toBe('BK');
    expect(deriveRawColorKey({ skuCode: 'DMTDU1BL', styleColor: null, colorCode: 'ROJO' })).toBe('BL');
    expect(deriveRawColorKey({ skuCode: '12345', styleColor: null, colorCode: 'RD' })).toBe('RD');
  });

  it('builds monthly releases with biweekly high-season waves', () => {
    expect(buildReleaseDates('2026-05-06', 3, [6])).toEqual([
      '2026-05-06',
      '2026-06-01',
      '2026-06-15',
      '2026-07-01',
    ]);
  });

  it('allocates exact totals by weighted demand', () => {
    const allocation = allocateByWeights(7, [
      { item: 'A', weight: 3 },
      { item: 'B', weight: 1 },
    ]);
    expect(allocation.get('A')).toBe(5);
    expect(allocation.get('B')).toBe(2);
    expect([...allocation.values()].reduce((sum, qty) => sum + qty, 0)).toBe(7);
  });

  it('can floor one unit to each demand store when stock allows', () => {
    const allocation = allocateByWeights(2, [
      { item: 'A', weight: 100 },
      { item: 'B', weight: 1 },
    ], { minOneWhenPossible: true });
    expect(allocation.get('A')).toBe(1);
    expect(allocation.get('B')).toBe(1);
  });

  it('creates wave lines and store allocations without losing units', () => {
    const pool: AssortmentPoolItem[] = [
      poolItem('sku-1', 'TIE1BK', 'Negro', 12),
      poolItem('sku-2', 'TIE2BL', 'Azul', 8),
      poolItem('sku-3', 'TIE3RD', 'Rojo', 4),
      poolItem('sku-4', 'TIE4BK', 'Negro', 6),
    ];
    const stores: AssortmentTargetStore[] = [
      targetStore(1, '1 - A', 90, 90, 3),
      targetStore(2, '2 - B', 10, 10, 1),
    ];
    const { waves, colorMix } = buildWavePlan({
      pool,
      releaseSchedule: [
        { releaseDate: '2026-05-06', weight: 1 },
        { releaseDate: '2026-06-01', weight: 1 },
      ],
      colorSales: new Map([
        ['Negro', { units: 90, family: 'black' }],
        ['Azul', { units: 30, family: 'blue' }],
        ['Rojo', { units: 10, family: 'red' }],
      ]),
      targetStores: stores,
    });

    expect(waves).toHaveLength(2);
    expect(waves.flatMap((wave) => wave.lines)).toHaveLength(4);
    expect(new Set(waves.flatMap((wave) => wave.lines.map((line) => line.canonicalColor)))).toEqual(
      new Set(['Negro', 'Azul', 'Rojo']),
    );
    for (const line of waves.flatMap((wave) => wave.lines)) {
      expect(line.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)).toBe(line.releaseUnits);
      expect(line.releaseUnits).toBeLessThanOrEqual(line.warehouseUnits);
      expect(line.reserveUnits).toBe(line.warehouseUnits - line.releaseUnits);
    }
    expect(colorMix.find((row) => row.canonicalColor === 'Negro')?.plannedStyleCount).toBe(2);
  });

  it('uses wave weights, color targets, and store model overrides', () => {
    const pool: AssortmentPoolItem[] = [
      poolItem('sku-1', 'TIE1BK', 'Negro', 12),
      poolItem('sku-2', 'TIE2BL', 'Azul', 12),
      poolItem('sku-3', 'TIE3RD', 'Rojo', 12),
      poolItem('sku-4', 'TIE4GY', 'Gris', 12),
    ];
    const stores: AssortmentTargetStore[] = [
      targetStore(1, '1 - A', 90, 90, 4),
      targetStore(2, '2 - B', 10, 10, 2),
    ];
    const { waves, colorMix } = buildWavePlan({
      pool,
      releaseSchedule: [
        { releaseDate: '2026-05-06', weight: 3 },
        { releaseDate: '2026-06-01', weight: 1 },
      ],
      colorSales: new Map([
        ['Negro', { units: 90, family: 'black' }],
        ['Azul', { units: 10, family: 'blue' }],
      ]),
      targetStores: stores,
      planningFactors: {
        historyMonths: 12,
        modelCoverWeeks: 4,
        modelDisplayFloor: 1,
        maxModelQuantity: 6,
        stockOnlyStoreWeightPct: 5,
        unseenColorFallbackPct: 2,
        waveWeights: [],
        storeModelOverrides: [{ storeId: 2, modelQuantity: 1 }],
        colorOverrides: [{ canonicalColor: 'Azul', targetStyleCount: 2 }],
        skuWaveOverrides: [{ skuId: 'sku-1', releaseDate: '2026-06-01' }],
      },
    });

    expect(waves.find((wave) => wave.sequence === 1)?.styleCount).toBe(2);
    expect(waves.find((wave) => wave.sequence === 2)?.styleCount).toBe(2);
    expect(waves.find((wave) => wave.sequence === 2)?.lines.some((line) => line.skuId === 'sku-1')).toBe(true);
    expect(pool.find((item) => item.skuId === 'sku-1')?.assignedWaveSequence).toBe(2);
    expect(colorMix.find((row) => row.canonicalColor === 'Azul')?.plannedStyleCount).toBe(1);
    expect(waves.flatMap((wave) => wave.lines).flatMap((line) => line.allocations).some((allocation) => (
      allocation.storeId === 2 && allocation.modelQuantity === 2
    ))).toBe(true);
  });
});

function poolItem(skuId: string, skuCode: string, canonicalColor: string, warehouseUnits: number): AssortmentPoolItem {
  return {
    skuId,
    skuCode,
    skuDescription: skuCode,
    categoryNumber: 71,
    categoryLabel: '71 - Test',
    styleColor: null,
    colorCode: null,
    rawColorKey: skuCode.slice(-2),
    canonicalColor,
    colorFamily: canonicalColor.toLowerCase(),
    inclusionReason: 'Never distributed',
    warehouseUnits,
    storeUnits: 0,
    keywords: null,
  };
}

function targetStore(
  storeId: number,
  storeLabel: string,
  salesUnits: number,
  weight: number,
  suggestedModelQuantity: number,
): AssortmentTargetStore {
  return {
    storeId,
    storeLabel,
    salesUnits,
    currentSkuCount: 10,
    currentUnits: 20,
    weight,
    suggestedSkuBudget: 10,
    averageMonthlySales: salesUnits / 12,
    salesPerSkuMonth: salesUnits / 12 / 10,
    suggestedModelQuantity,
  };
}
