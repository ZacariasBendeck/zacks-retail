import { applyOrderConstraints, type ReorderPlanSizeLine } from '../src/services/reorderPlannerService';

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

