import {
  applyOrderConstraints,
  buildCategoryFirstCasePackChoices,
  buildReorderAppendLineItems,
  buildCasePackSuggestion,
  calculateNativeOnOrderSupplement,
  calculateRecommendedReorderQty,
  resolveForecastMonths,
  type ReorderCasePackCandidate,
  type ReorderPlanSizeLine,
} from '../src/services/reorderPlannerService';

function line(sizeLabel: string, recommendedQty: number, curvePct: number): ReorderPlanSizeLine {
  return {
    rowLabel: '',
    columnLabel: sizeLabel,
    sizeLabel,
    onHand: 0,
    currentOnOrder: 0,
    futureOnOrder: 0,
    onOrder: 0,
    modelQty: 0,
    modelShort: 0,
    skuSalesQty: 0,
    categorySalesQty: 0,
    previousOrderQty: 0,
    curvePct,
    curveSource: 'SKU_SALES',
    forecastDemandQty: 0,
    baselineMonthlyDemand: 0,
    activeDemandMonths: 0,
    projectedSales: 0,
    recommendedQty,
  };
}

describe('reorder planner order constraints', () => {
  it('raises a non-zero recommendation to MOQ using the size curve', () => {
    const adjusted = applyOrderConstraints([
      line('7', 2, 0.25),
      line('8', 2, 0.75),
    ], 10, null);

    expect(adjusted.map((item) => item.recommendedQty)).toEqual([4, 6]);
  });

  it('rounds the total up to the SKU order multiple', () => {
    const adjusted = applyOrderConstraints([
      line('7', 3, 0.5),
      line('8', 4, 0.5),
    ], 0, 6);

    expect(adjusted.reduce((sum, item) => sum + item.recommendedQty, 0)).toBe(12);
  });

  it('does not force MOQ when there is no recommendation', () => {
    const adjusted = applyOrderConstraints([
      line('7', 0, 0.5),
      line('8', 0, 0.5),
    ], 12, 6);

    expect(adjusted.map((item) => item.recommendedQty)).toEqual([0, 0]);
  });
});

describe('reorder planner recommendation formula', () => {
  it('uses model plus forecast demand minus availability', () => {
    expect(calculateRecommendedReorderQty({
      modelQty: 72,
      forecastDemandQty: 180,
      onHand: 31,
      onOrder: 0,
    })).toBe(221);
  });

  it('keeps model coverage when there is no demand', () => {
    expect(calculateRecommendedReorderQty({
      modelQty: 9,
      forecastDemandQty: 0,
      onHand: 0,
      onOrder: 0,
    })).toBe(9);
  });

  it('clamps covered lines to zero', () => {
    expect(calculateRecommendedReorderQty({
      modelQty: 9,
      forecastDemandQty: 3,
      onHand: 20,
      onOrder: 0,
    })).toBe(0);
  });

  it('subtracts native open purchase orders when inquiry on-order is missing', () => {
    const supplement = calculateNativeOnOrderSupplement({
      currentOnOrder: 0,
      futureOnOrder: 0,
      nativeOpenQty: 270,
    });
    expect(supplement).toBe(270);
    expect(calculateRecommendedReorderQty({
      modelQty: 72,
      forecastDemandQty: 180,
      onHand: 31,
      onOrder: supplement,
    })).toBe(0);
  });

  it('does not double count native open purchase orders already present in inquiry on-order', () => {
    expect(calculateNativeOnOrderSupplement({
      currentOnOrder: 100,
      futureOnOrder: 170,
      nativeOpenQty: 270,
    })).toBe(0);
  });
});

describe('reorder planner forecast window', () => {
  it('starts forecast months after lead time and keeps the full buy horizon', () => {
    const resolved = resolveForecastMonths(new Date('2026-04-29T18:00:00.000Z'), 90, 90);

    expect(resolved.forecastStartMonth).toBe('2026-07');
    expect(resolved.forecastMonths).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
  });
});

describe('reorder planner existing draft PO append', () => {
  it('preserves existing draft lines and appends the reorder line', () => {
    const lineItems = buildReorderAppendLineItems([
      {
        id: 'line-1',
        poId: 'po-1',
        skuId: 'sku-existing',
        skuCode: 'OLD',
        sizeType: 1,
        casePackId: 'A1',
        casePackMultiplier: 2,
        sizeCells: [{ columnLabel: '7', rowLabel: '', quantity: 4 }],
        quantityOrdered: 4,
        quantityReceived: 0,
        unitCost: 10,
        lineTotal: 40,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ], {
      skuId: 'sku-new',
      quantity: 6,
      unitCost: 12,
      casePackId: 'B1',
      casePackMultiplier: 3,
      sizeCells: [{ columnLabel: '8', rowLabel: '', quantity: 6 }],
    });

    expect(lineItems).toEqual([
      {
        skuId: 'sku-existing',
        quantity: 4,
        unitCost: 10,
        casePackId: 'A1',
        casePackMultiplier: 2,
        sizeCells: [{ columnLabel: '7', rowLabel: '', quantity: 4 }],
      },
      {
        skuId: 'sku-new',
        quantity: 6,
        unitCost: 12,
        casePackId: 'B1',
        casePackMultiplier: 3,
        sizeCells: [{ columnLabel: '8', rowLabel: '', quantity: 6 }],
      },
    ]);
  });
});

describe('reorder planner case-pack suggestion', () => {
  const pack = (
    code: string,
    cells: Array<{ columnLabel: string; quantity: number }>,
    overrides: Partial<ReorderCasePackCandidate> = {},
  ): ReorderCasePackCandidate => ({
    code,
    description: `${code} pack`,
    unitsPerPack: cells.reduce((sum, cell) => sum + cell.quantity, 0),
    cells: cells.map((cell) => ({
      rowLabel: '',
      columnLabel: cell.columnLabel,
      sizeLabel: cell.columnLabel,
      quantity: cell.quantity,
    })),
    ...overrides,
  });

  it('picks the lowest-shortage then lowest-excess active pack fit', () => {
    const suggestion = buildCasePackSuggestion(
      [
        line('7', 4, 0.4),
        line('8', 6, 0.6),
      ],
      [
        pack('A', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 2 },
        ]),
        pack('B', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 3 },
        ]),
      ],
    );

    expect(suggestion?.code).toBe('B');
    expect(suggestion?.multiplier).toBe(2);
    expect(suggestion?.shortageQty).toBe(0);
    expect(suggestion?.excessQty).toBe(0);
    expect(suggestion?.sizeCells.map((cell) => [cell.columnLabel, cell.quantity])).toEqual([
      ['7', 4],
      ['8', 6],
    ]);
  });

  it('returns null when there is no active/matching pack candidate', () => {
    expect(buildCasePackSuggestion([line('7', 4, 1)], [])).toBeNull();
  });

  it('does not auto-apply a zero-shortage pack that exceeds the overbuy cap', () => {
    const suggestion = buildCasePackSuggestion(
      [
        line('35', 25, 0.16),
        line('36', 38, 0.25),
        line('37', 28, 0.19),
        line('38', 43, 0.29),
        line('39', 0, 0),
        line('40', 16, 0.11),
      ],
      [
        pack('TO', [
          { columnLabel: '35', quantity: 2 },
          { columnLabel: '36', quantity: 3 },
          { columnLabel: '37', quantity: 4 },
          { columnLabel: '38', quantity: 4 },
          { columnLabel: '39', quantity: 3 },
          { columnLabel: '40', quantity: 2 },
        ]),
      ],
    );

    expect(suggestion?.code).toBe('TO');
    expect(suggestion?.multiplier).toBe(13);
    expect(suggestion?.totalUnits).toBe(234);
    expect(suggestion?.shortageQty).toBe(0);
    expect(suggestion?.autoApply).toBe(false);
    expect(suggestion?.overbuyQty).toBe(84);
    expect(suggestion?.overbuyLimitQty).toBe(18);
  });

  it('auto-applies a pack within the 10 percent or one-pack overbuy cap', () => {
    const suggestion = buildCasePackSuggestion(
      [
        line('7', 4, 0.4),
        line('8', 6, 0.6),
      ],
      [
        pack('A', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 4 },
        ]),
      ],
    );

    expect(suggestion?.code).toBe('A');
    expect(suggestion?.multiplier).toBe(2);
    expect(suggestion?.totalUnits).toBe(12);
    expect(suggestion?.overbuyQty).toBe(2);
    expect(suggestion?.overbuyLimitQty).toBe(6);
    expect(suggestion?.autoApply).toBe(true);
  });

  it('uses supplier history as a tie-breaker after fit quality', () => {
    const suggestion = buildCasePackSuggestion(
      [
        line('7', 4, 0.4),
        line('8', 6, 0.6),
      ],
      [
        pack('A', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 3 },
        ]),
        pack('B', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 3 },
        ], {
          supplierUsed: true,
          supplierUsageCount: 10,
          supplierLastUsedAt: '2026-04-01T00:00:00.000Z',
        }),
      ],
    );

    expect(suggestion?.code).toBe('B');
    expect(suggestion?.supplierUsed).toBe(true);
    expect(suggestion?.supplierUsageCount).toBe(10);
  });

  it('prefers same-SKU previous pack usage over general supplier usage when fit is tied', () => {
    const suggestion = buildCasePackSuggestion(
      [
        line('7', 4, 0.4),
        line('8', 6, 0.6),
      ],
      [
        pack('A', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 3 },
        ], {
          supplierUsed: true,
          supplierUsageCount: 100,
          supplierLastUsedAt: '2026-04-02T00:00:00.000Z',
        }),
        pack('B', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 3 },
        ], {
          supplierUsed: true,
          supplierUsageCount: 2,
          supplierLastUsedAt: '2026-01-01T00:00:00.000Z',
          sameSkuPreviousPack: true,
        }),
      ],
    );

    expect(suggestion?.code).toBe('B');
    expect(suggestion?.sameSkuPreviousPack).toBe(true);
  });

  it('builds category-first choices with the previous SKU pack first', () => {
    const choices = buildCategoryFirstCasePackChoices(
      [
        line('7', 4, 0.4),
        line('8', 6, 0.6),
      ],
      [
        pack('CAT1', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 3 },
        ], {
          categorySkuCount: 12,
          categoryUsageCount: 20,
          categoryLastUsedAt: '2026-04-01T00:00:00.000Z',
        }),
        pack('OLD', [
          { columnLabel: '7', quantity: 1 },
          { columnLabel: '8', quantity: 2 },
        ], {
          sameSkuPreviousPack: true,
          categorySkuCount: 1,
          categoryUsageCount: 1,
          categoryLastUsedAt: '2026-01-01T00:00:00.000Z',
        }),
      ],
    );

    expect(choices.map((choice) => choice.code)).toEqual(['OLD', 'CAT1']);
    expect(choices[0]?.badges).toContain('PREVIOUS_SKU');
    expect(choices[1]?.badges).toContain('CATEGORY_USED');
  });

  it('excludes active packs with no category usage unless they are the previous SKU pack', () => {
    const choices = buildCategoryFirstCasePackChoices(
      [
        line('7', 4, 0.4),
        line('8', 6, 0.6),
      ],
      [
        pack('UNUSED', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 3 },
        ]),
        pack('CAT1', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 3 },
        ], {
          categorySkuCount: 3,
          categoryUsageCount: 4,
        }),
      ],
    );

    expect(choices.map((choice) => choice.code)).toEqual(['CAT1']);
  });

  it('ranks category packs by SKU usage, PO usage, recency, then fit', () => {
    const choices = buildCategoryFirstCasePackChoices(
      [
        line('7', 4, 0.4),
        line('8', 6, 0.6),
      ],
      [
        pack('LOW', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 3 },
        ], {
          categorySkuCount: 2,
          categoryUsageCount: 50,
          categoryLastUsedAt: '2026-05-01T00:00:00.000Z',
        }),
        pack('HIGH', [
          { columnLabel: '7', quantity: 1 },
          { columnLabel: '8', quantity: 1 },
        ], {
          categorySkuCount: 5,
          categoryUsageCount: 10,
          categoryLastUsedAt: '2026-01-01T00:00:00.000Z',
        }),
        pack('MIDNEW', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 2 },
        ], {
          categorySkuCount: 2,
          categoryUsageCount: 50,
          categoryLastUsedAt: '2026-05-02T00:00:00.000Z',
        }),
      ],
    );

    expect(choices.map((choice) => choice.code)).toEqual(['HIGH', 'MIDNEW', 'LOW']);
  });

  it('marks the best fit and calculates its multiplier for the current reorder', () => {
    const choices = buildCategoryFirstCasePackChoices(
      [
        line('7', 4, 0.4),
        line('8', 6, 0.6),
      ],
      [
        pack('LOOSE', [
          { columnLabel: '7', quantity: 3 },
          { columnLabel: '8', quantity: 3 },
        ], {
          categorySkuCount: 1,
          categoryUsageCount: 1,
        }),
        pack('FIT', [
          { columnLabel: '7', quantity: 2 },
          { columnLabel: '8', quantity: 3 },
        ], {
          categorySkuCount: 1,
          categoryUsageCount: 1,
        }),
      ],
    );

    const best = choices.find((choice) => choice.badges.includes('BEST_FIT'));
    expect(best?.code).toBe('FIT');
    expect(best?.multiplier).toBe(2);
    expect(best?.sizeCells.map((cell) => [cell.columnLabel, cell.quantity])).toEqual([
      ['7', 4],
      ['8', 6],
    ]);
  });
});

