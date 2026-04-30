import { normalizeDiscountDistortedHistory } from '../../src/services/purchasePlanning/normalization';

describe('discount normalization', () => {
  it('down-weights months whose realized price is materially below reference retail', () => {
    const [point] = normalizeDiscountDistortedHistory([
      {
        dimKey: '5',
        yearMonth: '2025-02',
        qty: 100,
        netSales: 4000,
        referenceRetail: 10000,
      },
    ], true);

    expect(point.rawQty).toBe(100);
    expect(point.normalizationFactor).toBeCloseTo(0.5);
    expect(point.qty).toBeCloseTo(50);
  });

  it('leaves history unchanged when disabled', () => {
    const [point] = normalizeDiscountDistortedHistory([
      { dimKey: '5', yearMonth: '2025-02', qty: 100, netSales: 4000, referenceRetail: 10000 },
    ], false);

    expect(point.normalizationFactor).toBe(1);
    expect(point.qty).toBe(100);
  });
});
