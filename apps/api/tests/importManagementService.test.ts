import {
  allocateByProductCostShare,
  assertImportLandedCostEditable,
  assertImportPayableSourceEditable,
  assertImportSuggestedPriceEditable,
  assertImportSuggestedPriceStatusTransition,
  calculateImportInventoryTrueUp,
  isImportManagementServiceError,
} from '../src/services/importManagementService';

describe('Import Management landed-cost allocation', () => {
  it('allocates charges by product-cost share and reconciles rounding', () => {
    const result = allocateByProductCostShare(
      [
        { id: 'line-a', hnlAmount: 100, quantity: 2 },
        { id: 'line-b', hnlAmount: 300, quantity: 3 },
      ],
      [{ id: 'freight', hnlAmount: 80 }],
    );

    expect(result.allocations).toEqual([
      { chargeId: 'freight', invoiceLineId: 'line-a', allocatedHnlAmount: 20 },
      { chargeId: 'freight', invoiceLineId: 'line-b', allocatedHnlAmount: 60 },
    ]);
    expect(result.lineTotals).toEqual([
      {
        invoiceLineId: 'line-a',
        allocatedHnlAmount: 20,
        landedLineCostHnl: 120,
        landedUnitCostHnl: 60,
      },
      {
        invoiceLineId: 'line-b',
        allocatedHnlAmount: 60,
        landedLineCostHnl: 360,
        landedUnitCostHnl: 120,
      },
    ]);
  });

  it('keeps the final line as the rounding balancing line', () => {
    const result = allocateByProductCostShare(
      [
        { id: 'line-a', hnlAmount: 1, quantity: 1 },
        { id: 'line-b', hnlAmount: 1, quantity: 1 },
        { id: 'line-c', hnlAmount: 1, quantity: 1 },
      ],
      [{ id: 'tax', hnlAmount: 0.01 }],
    );

    expect(result.allocations.reduce((sum, row) => sum + row.allocatedHnlAmount, 0)).toBeCloseTo(0.01, 2);
    expect(result.allocations.at(-1)).toMatchObject({
      chargeId: 'tax',
      invoiceLineId: 'line-c',
      allocatedHnlAmount: 0.01,
    });
  });

  it('rejects allocation without invoice value', () => {
    expect(() => allocateByProductCostShare([{ id: 'line-a', hnlAmount: 0, quantity: 1 }], [])).toThrow();
    try {
      allocateByProductCostShare([{ id: 'line-a', hnlAmount: 0, quantity: 1 }], []);
    } catch (err) {
      expect(isImportManagementServiceError(err)).toBe(true);
      if (isImportManagementServiceError(err)) {
        expect(err.code).toBe('NO_ALLOCATABLE_VALUE');
      }
    }
  });

  it('calculates final inventory true-up deltas from estimated and final unit cost', () => {
    expect(calculateImportInventoryTrueUp({
      quantity: 2,
      estimatedUnitCostHnl: 1225,
      finalUnitCostHnl: 1250,
    })).toEqual({
      deltaUnitCostHnl: 25,
      deltaHnlAmount: 50,
      hasAdjustment: true,
    });

    expect(calculateImportInventoryTrueUp({
      quantity: 3,
      estimatedUnitCostHnl: 100,
      finalUnitCostHnl: 99.999,
    })).toEqual({
      deltaUnitCostHnl: -0.001,
      deltaHnlAmount: 0,
      hasAdjustment: false,
    });
  });

  it('requires suggested prices to be approved and SKU-linked before posting', () => {
    expect(() => assertImportSuggestedPriceStatusTransition('APPROVED', 'POSTED', 'sku-1')).not.toThrow();

    try {
      assertImportSuggestedPriceStatusTransition('SUGGESTED', 'POSTED', 'sku-1');
    } catch (err) {
      expect(isImportManagementServiceError(err)).toBe(true);
      if (isImportManagementServiceError(err)) {
        expect(err.code).toBe('SUGGESTED_PRICE_NOT_APPROVED');
      }
    }

    try {
      assertImportSuggestedPriceStatusTransition('APPROVED', 'POSTED', null);
    } catch (err) {
      expect(isImportManagementServiceError(err)).toBe(true);
      if (isImportManagementServiceError(err)) {
        expect(err.code).toBe('SUGGESTED_PRICE_SKU_REQUIRED');
      }
    }
  });

  it('locks posted suggested prices from further status changes', () => {
    try {
      assertImportSuggestedPriceStatusTransition('POSTED', 'REJECTED', 'sku-1');
    } catch (err) {
      expect(isImportManagementServiceError(err)).toBe(true);
      if (isImportManagementServiceError(err)) {
        expect(err.code).toBe('SUGGESTED_PRICE_ALREADY_POSTED');
      }
    }
  });

  it('locks posted suggested price records from SKU or amount edits', () => {
    expect(() => assertImportSuggestedPriceEditable(null)).not.toThrow();
    expect(() => assertImportSuggestedPriceEditable('APPROVED')).not.toThrow();

    try {
      assertImportSuggestedPriceEditable('POSTED');
    } catch (err) {
      expect(isImportManagementServiceError(err)).toBe(true);
      if (isImportManagementServiceError(err)) {
        expect(err.code).toBe('SUGGESTED_PRICE_ALREADY_POSTED');
      }
    }
  });

  it('locks AP-sent source documents from edits', () => {
    expect(() => assertImportPayableSourceEditable('SUPPLIER_INVOICE', null)).not.toThrow();
    expect(() => assertImportPayableSourceEditable('LANDED_COST_CHARGE', 'READY')).not.toThrow();

    try {
      assertImportPayableSourceEditable('SUPPLIER_INVOICE', 'SENT_TO_AP');
    } catch (err) {
      expect(isImportManagementServiceError(err)).toBe(true);
      if (isImportManagementServiceError(err)) {
        expect(err.code).toBe('PAYABLE_ALREADY_SENT');
      }
    }

    try {
      assertImportPayableSourceEditable('LANDED_COST_CHARGE', 'PAID');
    } catch (err) {
      expect(isImportManagementServiceError(err)).toBe(true);
      if (isImportManagementServiceError(err)) {
        expect(err.code).toBe('PAYABLE_ALREADY_PAID');
      }
    }
  });

  it('locks landed-cost recalculation after pricing has been posted', () => {
    expect(() => assertImportLandedCostEditable(0)).not.toThrow();

    try {
      assertImportLandedCostEditable(1);
    } catch (err) {
      expect(isImportManagementServiceError(err)).toBe(true);
      if (isImportManagementServiceError(err)) {
        expect(err.code).toBe('SUGGESTED_PRICES_POSTED');
      }
    }
  });
});
