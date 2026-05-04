import {
  allocateByProductCostShare,
  assertImportCostBuildPreviewsReady,
  assertImportLandedCostEditable,
  assertImportPayableSourceEditable,
  assertImportSuggestedPriceEditable,
  assertImportSuggestedPriceStatusTransition,
  buildImportCostBuildPreviews,
  calculateImportInventoryTrueUp,
  isImportManagementServiceError,
  rollupComponentCostsByGroup,
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

  it('rolls fabric and conversion component costs into receiptable outputs by group', () => {
    const result = rollupComponentCostsByGroup([
      {
        id: 'finished-a',
        hnlAmount: 200,
        quantity: 4,
        receiptPolicy: 'RECEIVE_TO_STOCK',
        allocationGroupKey: 'SUITS-1',
      },
      {
        id: 'finished-b',
        hnlAmount: 100,
        quantity: 2,
        receiptPolicy: 'RECEIVE_TO_STOCK',
        allocationGroupKey: 'SUITS-1',
      },
      {
        id: 'fabric',
        hnlAmount: 90,
        quantity: 12,
        receiptPolicy: 'ROLL_TO_OUTPUT',
        allocationGroupKey: 'SUITS-1',
      },
      {
        id: 'cmt',
        hnlAmount: 60,
        quantity: 6,
        receiptPolicy: 'ROLL_TO_OUTPUT',
        allocationGroupKey: 'SUITS-1',
      },
    ]);

    expect(result.warnings).toEqual([]);
    expect(result.allocations).toEqual([
      { componentLineId: 'fabric', outputLineId: 'finished-a', allocationGroupKey: 'SUITS-1', allocatedHnlAmount: 60 },
      { componentLineId: 'fabric', outputLineId: 'finished-b', allocationGroupKey: 'SUITS-1', allocatedHnlAmount: 30 },
      { componentLineId: 'cmt', outputLineId: 'finished-a', allocationGroupKey: 'SUITS-1', allocatedHnlAmount: 40 },
      { componentLineId: 'cmt', outputLineId: 'finished-b', allocationGroupKey: 'SUITS-1', allocatedHnlAmount: 20 },
    ]);
    expect(result.lineTotals).toEqual([
      {
        outputLineId: 'finished-a',
        allocationGroupKey: 'SUITS-1',
        componentAllocatedCostHnl: 100,
        commercialLineCostHnl: 300,
        commercialUnitCostHnl: 75,
      },
      {
        outputLineId: 'finished-b',
        allocationGroupKey: 'SUITS-1',
        componentAllocatedCostHnl: 50,
        commercialLineCostHnl: 150,
        commercialUnitCostHnl: 75,
      },
    ]);
  });

  it('previews proforma component cost builds before allocation is persisted', () => {
    const previews = buildImportCostBuildPreviews([
      {
        id: 'invoice-finished',
        shipmentId: 'shipment-1',
        invoiceNumber: 'FG-100',
        supplierCode: 'FACTORY',
        supplierName: 'Factory Vendor',
        invoiceDate: null,
        invoiceGroup: 'TAXABLE',
        invoiceKind: 'MERCHANDISE',
        sourceAmount: 200,
        sourceCurrency: 'USD',
        fxRate: 25,
        fxDate: '2026-05-01',
        hnlAmount: 200,
        notes: null,
        lines: [
          {
            id: 'finished-a',
            invoiceId: 'invoice-finished',
            skuId: 'sku-1',
            skuCode: 'SKU-1',
            purchaseOrderLineId: null,
            lineNumber: 1,
            itemCode: 'ITEM-1',
            styleCode: 'STYLE-1',
            description: 'Finished jacket',
            materialMeters: null,
            cartonCount: null,
            weightKg: null,
            volumeCbm: null,
            quantity: 4,
            unitOfMeasure: 'EA',
            sourceUnitCost: 50,
            sourceAmount: 200,
            sourceCurrency: 'USD',
            fxRate: 25,
            fxDate: '2026-05-01',
            hnlAmount: 200,
            baseUnitCostHnl: 50,
            commercialUnitCostHnl: null,
            componentAllocatedCostHnl: 0,
            allocatedLandedCostHnl: 0,
            landedUnitCostHnl: null,
            costRole: 'FINISHED_GOOD',
            receiptPolicy: 'RECEIVE_TO_STOCK',
            allocationGroupKey: 'STYLE-1',
            taxable: true,
          },
        ],
      },
      {
        id: 'invoice-components',
        shipmentId: 'shipment-1',
        invoiceNumber: 'FAB-200',
        supplierCode: 'MILL',
        supplierName: 'Fabric Mill',
        invoiceDate: null,
        invoiceGroup: 'TAXABLE',
        invoiceKind: 'FABRIC',
        sourceAmount: 100,
        sourceCurrency: 'USD',
        fxRate: 25,
        fxDate: '2026-05-01',
        hnlAmount: 100,
        notes: null,
        lines: [
          {
            id: 'fabric-a',
            invoiceId: 'invoice-components',
            skuId: null,
            skuCode: null,
            purchaseOrderLineId: null,
            lineNumber: 1,
            itemCode: 'FAB-1',
            styleCode: 'STYLE-1',
            description: 'Shell fabric',
            materialMeters: 12,
            cartonCount: null,
            weightKg: null,
            volumeCbm: null,
            quantity: 12,
            unitOfMeasure: 'M',
            sourceUnitCost: 5,
            sourceAmount: 60,
            sourceCurrency: 'USD',
            fxRate: 25,
            fxDate: '2026-05-01',
            hnlAmount: 60,
            baseUnitCostHnl: 5,
            commercialUnitCostHnl: null,
            componentAllocatedCostHnl: 0,
            allocatedLandedCostHnl: 0,
            landedUnitCostHnl: null,
            costRole: 'MATERIAL',
            receiptPolicy: 'ROLL_TO_OUTPUT',
            allocationGroupKey: 'STYLE-1',
            taxable: true,
          },
          {
            id: 'cmt-a',
            invoiceId: 'invoice-components',
            skuId: null,
            skuCode: null,
            purchaseOrderLineId: null,
            lineNumber: 2,
            itemCode: 'CMT-1',
            styleCode: 'STYLE-1',
            description: 'Cut make trim',
            materialMeters: null,
            cartonCount: null,
            weightKg: null,
            volumeCbm: null,
            quantity: 4,
            unitOfMeasure: 'EA',
            sourceUnitCost: 10,
            sourceAmount: 40,
            sourceCurrency: 'USD',
            fxRate: 25,
            fxDate: '2026-05-01',
            hnlAmount: 40,
            baseUnitCostHnl: 10,
            commercialUnitCostHnl: null,
            componentAllocatedCostHnl: 0,
            allocatedLandedCostHnl: 0,
            landedUnitCostHnl: null,
            costRole: 'CONVERSION',
            receiptPolicy: 'ROLL_TO_OUTPUT',
            allocationGroupKey: 'STYLE-1',
            taxable: true,
          },
        ],
      },
    ]);

    expect(previews).toHaveLength(1);
    expect(previews[0]).toMatchObject({
      previewKey: 'STYLE-1',
      allocationGroupKey: 'STYLE-1',
      status: 'PASS',
      outputLineCount: 1,
      componentLineCount: 2,
      outputHnlAmount: 200,
      componentHnlAmount: 100,
      commercialHnlAmount: 300,
      warningCount: 0,
    });
    expect(previews[0].outputs[0]).toMatchObject({
      invoiceLineId: 'finished-a',
      invoiceNumber: 'FG-100',
      componentAllocatedCostHnl: 100,
      commercialLineCostHnl: 300,
      commercialUnitCostHnl: 75,
    });
    expect(previews[0].components.map((component) => component.supplierName)).toEqual(['Fabric Mill', 'Fabric Mill']);
  });

  it('blocks landed-cost allocation when component build groups are not ready', () => {
    const previews = buildImportCostBuildPreviews([
      {
        id: 'invoice-components',
        shipmentId: 'shipment-1',
        invoiceNumber: 'FAB-200',
        supplierCode: 'MILL',
        supplierName: 'Fabric Mill',
        invoiceDate: null,
        invoiceGroup: 'TAXABLE',
        invoiceKind: 'FABRIC',
        sourceAmount: 60,
        sourceCurrency: 'USD',
        fxRate: 25,
        fxDate: '2026-05-01',
        hnlAmount: 60,
        notes: null,
        lines: [
          {
            id: 'fabric-a',
            invoiceId: 'invoice-components',
            skuId: null,
            skuCode: null,
            purchaseOrderLineId: null,
            lineNumber: 1,
            itemCode: 'FAB-1',
            styleCode: 'STYLE-1',
            description: 'Shell fabric',
            materialMeters: 12,
            cartonCount: null,
            weightKg: null,
            volumeCbm: null,
            quantity: 12,
            unitOfMeasure: 'M',
            sourceUnitCost: 5,
            sourceAmount: 60,
            sourceCurrency: 'USD',
            fxRate: 25,
            fxDate: '2026-05-01',
            hnlAmount: 60,
            baseUnitCostHnl: 5,
            commercialUnitCostHnl: null,
            componentAllocatedCostHnl: 0,
            allocatedLandedCostHnl: 0,
            landedUnitCostHnl: null,
            costRole: 'MATERIAL',
            receiptPolicy: 'ROLL_TO_OUTPUT',
            allocationGroupKey: null,
            taxable: true,
          },
        ],
      },
    ]);

    expect(previews[0]).toMatchObject({
      previewKey: '__UNASSIGNED_COMPONENTS__',
      status: 'FAIL',
      warningCount: 2,
    });
    let blocked = false;
    try {
      assertImportCostBuildPreviewsReady(previews);
    } catch (err) {
      blocked = true;
      expect(isImportManagementServiceError(err)).toBe(true);
      if (isImportManagementServiceError(err)) {
        expect(err.status).toBe(409);
        expect(err.code).toBe('COST_BUILD_NOT_READY');
      }
    }
    expect(blocked).toBe(true);
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
