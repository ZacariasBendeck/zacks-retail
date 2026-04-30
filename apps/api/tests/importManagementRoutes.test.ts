import request from 'supertest';

const IMPORT_COST_OVERRIDE_PERMISSION = 'import_management.cost_override';
const IMPORT_FINAL_LIQUIDATION_PERMISSION = 'import_management.final_liquidation';
const IMPORT_APPROVE_MISMATCH_PERMISSION = 'import_management.approve_mismatch';

jest.mock('../src/middleware/authMiddleware', () => ({
  SESSION_COOKIE: 'sid',
  attachUser: () => (req: any, _res: any, next: any) => {
    const userId = req.get('x-test-user');
    if (userId) {
      req.user = { id: userId, email: `${userId}@example.com`, displayName: 'Import Route Tester' };
      req.permissions = new Set(
        String(req.get('x-test-permissions') ?? '')
          .split(',')
          .map((permission) => permission.trim())
          .filter(Boolean),
      );
    }
    next();
  },
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
      return;
    }
    next();
  },
  requirePermission: (permission: string) => (req: any, res: any, next: any) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
      return;
    }
    if (!req.permissions?.has(permission)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: `Missing permission: ${permission}` } });
      return;
    }
    next();
  },
}));

const shipment = {
  id: '5f3b3f04-8f7e-4f35-98f0-812ed2447d46',
  shipmentNumber: 'IMP-001',
  displayName: 'Carga Suelta Panama',
  status: 'DRAFT',
  buyer: 'IB',
  expectedArrivalAt: null,
  sourceWorkbookName: null,
  invoiceHnlTotal: 0,
  chargeHnlTotal: 0,
  landedHnlTotal: 0,
  invoiceCount: 0,
  lineCount: 0,
  chargeCount: 0,
  createdAt: '2026-04-29T00:00:00.000Z',
  updatedAt: '2026-04-29T00:00:00.000Z',
};

const shipmentDetail = {
  ...shipment,
  originPort: null,
  destinationPort: null,
  carrier: null,
  freightForwarder: null,
  customsPolicyNumber: null,
  blNumber: null,
  expectedDepartureAt: null,
  actualArrivalAt: null,
  baseCurrency: 'HNL',
  notes: null,
  approvedEstimateAt: null,
  approvedEstimateBy: null,
  finalLiquidationAt: null,
  closedAt: null,
  createdBy: 'system',
  containers: [],
  shipmentLines: [],
  supplierInvoices: [],
  charges: [],
  allocations: [],
  goodsInTransit: [],
  verificationChecks: [],
  suggestedPrices: [],
};

const shipmentLineCandidate = {
  purchaseOrderId: '3f1d2a5e-4188-4c2f-8ed0-7daf1c8a1234',
  purchaseOrderNumber: 'PO-1001',
  purchaseOrderStatus: 'CONFIRMED',
  purchaseOrderLineId: '7a37a436-9ea6-4477-8763-3269c5b32649',
  vendorCode: 'KSF',
  vendorName: 'KS Forwarding',
  buyer: 'IB',
  sourceCurrency: 'CNY',
  fxRate: 3.5,
  fxDate: '2026-04-29',
  incotermCode: 'FOB',
  incotermPlace: 'Guangzhou',
  costBasis: 'VENDOR_CURRENCY_ESTIMATED_LANDED',
  skuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
  skuCode: 'ZN02-NDPT',
  description: 'Ready line',
  quantityOrdered: 12,
  quantityReceived: 0,
  quantityOpen: 12,
  quantityAlreadyPlanned: 2,
  plannedShipments: 'PANAMA-86 (2)',
  quantityAvailable: 10,
  sourceUnitCost: 45,
  commercialUnitCostHnl: 157.5,
  estimatedLandedUnitCostHnl: 225,
};

const shipmentLine = {
  id: '6b3f8f6f-7c0f-4ecb-9349-837e39bc48ab',
  shipmentId: shipment.id,
  purchaseOrderId: shipmentLineCandidate.purchaseOrderId,
  purchaseOrderNumber: shipmentLineCandidate.purchaseOrderNumber,
  purchaseOrderStatus: shipmentLineCandidate.purchaseOrderStatus,
  purchaseOrderLineId: shipmentLineCandidate.purchaseOrderLineId,
  vendorCode: shipmentLineCandidate.vendorCode,
  vendorName: shipmentLineCandidate.vendorName,
  buyer: shipmentLineCandidate.buyer,
  containerId: null,
  containerLabel: null,
  invoiceLineId: null,
  invoiceNumber: null,
  invoiceMatchReviewStatus: 'UNMATCHED',
  invoiceMatchWarnings: [],
  invoiceMatchApprovedAt: null,
  invoiceMatchApprovedBy: null,
  invoiceMatchApprovalReason: null,
  skuId: shipmentLineCandidate.skuId,
  skuCode: shipmentLineCandidate.skuCode,
  description: shipmentLineCandidate.description,
  expectedQuantity: 10,
  sourceUnitCost: shipmentLineCandidate.sourceUnitCost,
  sourceCurrency: shipmentLineCandidate.sourceCurrency,
  fxRate: shipmentLineCandidate.fxRate,
  fxDate: shipmentLineCandidate.fxDate,
  incotermCode: shipmentLineCandidate.incotermCode,
  incotermPlace: shipmentLineCandidate.incotermPlace,
  commercialUnitCostHnl: shipmentLineCandidate.commercialUnitCostHnl,
  estimatedLandedUnitCostHnl: shipmentLineCandidate.estimatedLandedUnitCostHnl,
  allocatedLandedCostHnl: 0,
  landedUnitCostHnl: shipmentLineCandidate.estimatedLandedUnitCostHnl,
  status: 'EXPECTED',
  notes: null,
};

const receivingAudit = {
  purchaseOrderReceiptCount: 1,
  purchaseOrderReceiptLineCount: 1,
  purchaseOrderReceiptQuantity: 2,
  purchaseOrderReceiptHnl: 2450,
  inventoryReceiptCount: 1,
  inventoryReceiptQuantity: 2,
  inventoryReceiptHnl: 2450,
  inventoryTrueUpCount: 1,
  inventoryTrueUpQuantity: 2,
  inventoryTrueUpHnl: 50,
  purchaseOrderReceipts: [{
    purchaseOrderId: '3f1d2a5e-4188-4c2f-8ed0-7daf1c8a1234',
    purchaseOrderNumber: 'PO-1001',
    receiptId: 'f3411d7e-8d9b-4a63-a834-c40f2d8c7ef2',
    receiptBasis: 'ESTIMATED',
    storeId: 1,
    referenceNumber: 'IMP-001 estimated import receipt',
    postedBy: 'tester',
    postedAt: '2026-05-12T00:00:00.000Z',
    postedLineCount: 1,
    postedQuantity: 2,
    postedHnlAmount: 2450,
  }],
  inventoryReceipts: [{
    receiptId: '828ff17c-87c1-437e-922d-98bf3ed46c9f',
    invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
    stockMovementId: 'f9ea0625-9dff-4f42-a817-65d62df74020',
    skuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
    storeId: 1,
    receiptBasis: 'ESTIMATED',
    quantity: 2,
    unitCostHnl: 1225,
    hnlAmount: 2450,
    itemCode: 'ITEM-1',
    description: 'Ready line',
    postedBy: 'tester',
    auditReason: 'Warehouse needs stock before final liquidation.',
    postedAt: '2026-05-12T00:00:00.000Z',
  }],
  inventoryTrueUps: [{
    trueUpId: '2a112f4f-24ed-4bd4-9c5e-e0c3938e4fc9',
    invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
    importInventoryReceiptId: null,
    purchaseOrderId: '3f1d2a5e-4188-4c2f-8ed0-7daf1c8a1234',
    purchaseOrderLineId: '7a37a436-9ea6-4477-8763-3269c5b32649',
    purchaseOrderNumber: 'PO-1001',
    stockMovementId: '726a16f9-4e70-4c46-8a04-6c96fd2f9f19',
    skuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
    storeId: 1,
    quantity: 2,
    estimatedUnitCostHnl: 1225,
    finalUnitCostHnl: 1250,
    deltaUnitCostHnl: 25,
    deltaHnlAmount: 50,
    itemCode: 'ITEM-1',
    description: 'Ready line',
    postedBy: 'tester',
    auditReason: 'Final liquidation approved.',
    postedAt: '2026-05-20T00:00:00.000Z',
  }],
};

jest.mock('../src/services/importManagementService', () => ({
  listImportShipments: jest.fn(async () => ({
    data: [shipment],
    pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
  })),
  listImportOtbCommitments: jest.fn(async () => ({
    commitments: [{
      shipmentId: shipment.id,
      shipmentNumber: shipment.shipmentNumber,
      displayName: shipment.displayName,
      buyer: 'IB',
      status: 'APPROVED_ESTIMATE',
      expectedArrivalAt: '2026-05-12',
      actualArrivalAt: null,
      commitmentMonth: '2026-05',
      commitmentBasis: 'ESTIMATED',
      departmentNumber: 56,
      departmentName: 'ZAPATO MARCA DAMA',
      categoryNumber: 556,
      invoiceHnlTotal: 2000,
      allocatedChargeHnlTotal: 450,
      landedHnlTotal: 2450,
      lineCount: 2,
      chargeCount: 1,
    }],
    summary: [{
      month: '2026-05',
      buyer: 'IB',
      commitmentBasis: 'ESTIMATED',
      departmentNumber: 56,
      departmentName: 'ZAPATO MARCA DAMA',
      categoryNumber: 556,
      shipmentCount: 1,
      lineCount: 2,
      landedHnlTotal: 2450,
    }],
    totalEstimatedHnl: 2450,
    totalFinalHnl: 0,
    totalHnl: 2450,
  })),
  createImportShipment: jest.fn(async () => ({
    ...shipmentDetail,
  })),
  getImportShipmentById: jest.fn(async () => null),
  getImportShipmentReport: jest.fn(async () => ({
    reportKey: 'shipment-liquidation',
    shipmentId: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    displayName: shipment.displayName,
    sheetName: 'Liquidation',
    filenameBase: 'import-imp-001-shipment-liquidation',
    columns: [
      { key: 'shipmentNumber', header: 'Shipment', width: 18 },
      { key: 'documentNumber', header: 'Document', width: 18 },
      { key: 'hnlAmount', header: 'HNL Amount', width: 16, numFmt: 'money' },
    ],
    rows: [{
      shipmentNumber: shipment.shipmentNumber,
      documentNumber: 'INV-EDIT',
      hnlAmount: 2450,
    }],
  })),
  listImportShipmentAuditEvents: jest.fn(async () => [{
    id: 'audit-1',
    eventType: 'import_management',
    action: 'RECEIVE_FINAL_AND_TRUE_UP',
    resourceType: 'import.shipment',
    resourceId: shipment.id,
    resourceLabel: null,
    actorUserId: null,
    actorUser: null,
    actorSessionId: null,
    outcome: 'SUCCESS',
    reason: 'Final liquidation approved.',
    ipAddress: null,
    userAgent: null,
    beforeJson: null,
    afterJson: { postedInventoryTrueUpCount: 1, postedInventoryTrueUpHnl: 50 },
    metadataJson: { shipmentId: shipment.id, actor: 'Import Route Tester' },
    createdAt: '2026-05-20T00:00:00.000Z',
  }]),
  listImportShipmentLineCandidates: jest.fn(async () => [shipmentLineCandidate]),
  listImportInvoiceMatchSuggestions: jest.fn(async () => [{
    shipmentLineId: shipmentLine.id,
    purchaseOrderLineId: shipmentLine.purchaseOrderLineId,
    purchaseOrderNumber: shipmentLine.purchaseOrderNumber,
    expectedSkuCode: shipmentLine.skuCode,
    expectedDescription: shipmentLine.description,
    expectedQuantity: shipmentLine.expectedQuantity,
    expectedSourceCurrency: shipmentLine.sourceCurrency,
    expectedHnlAmount: 2250,
    invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
    invoiceNumber: 'INV-EDIT',
    invoiceSkuCode: 'ZN02-NDPT',
    invoiceItemCode: 'ITEM-1',
    invoiceDescription: 'Ready line',
    invoiceQuantity: 9,
    invoiceSourceCurrency: 'CNY',
    invoiceHnlAmount: 2025,
    score: 84,
    reasons: ['same PO line', 'same SKU'],
    warnings: ['Invoice quantity 9 differs from expected 10.'],
  }]),
  applyImportInvoiceMatchSuggestions: jest.fn(async () => ({
    shipment: {
      ...shipmentDetail,
      shipmentLines: [{
        ...shipmentLine,
        invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
        invoiceNumber: 'INV-EDIT',
        invoiceMatchReviewStatus: 'MATCHED',
        status: 'MATCHED',
      }],
    },
    appliedCount: 1,
    skippedCount: 0,
    applied: [{
      shipmentLineId: shipmentLine.id,
      purchaseOrderLineId: shipmentLine.purchaseOrderLineId,
      purchaseOrderNumber: shipmentLine.purchaseOrderNumber,
      expectedSkuCode: shipmentLine.skuCode,
      expectedDescription: shipmentLine.description,
      expectedQuantity: shipmentLine.expectedQuantity,
      expectedSourceCurrency: shipmentLine.sourceCurrency,
      expectedHnlAmount: 2250,
      invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
      invoiceNumber: 'INV-EDIT',
      invoiceSkuCode: 'ZN02-NDPT',
      invoiceItemCode: 'ITEM-1',
      invoiceDescription: 'Ready line',
      invoiceQuantity: 10,
      invoiceSourceCurrency: 'CNY',
      invoiceHnlAmount: 2250,
      score: 100,
      reasons: ['same PO line', 'same SKU'],
      warnings: [],
    }],
    skipped: [],
  })),
  addImportShipmentLine: jest.fn(async () => ({
    ...shipmentDetail,
    shipmentLines: [shipmentLine],
  })),
  updateImportShipmentLine: jest.fn(async () => ({
    ...shipmentDetail,
    shipmentLines: [{ ...shipmentLine, expectedQuantity: 8, notes: 'Factory partial shipment' }],
  })),
  removeImportShipmentLine: jest.fn(async () => shipmentDetail),
  matchImportShipmentLineInvoice: jest.fn(async () => ({
    ...shipmentDetail,
    shipmentLines: [{
      ...shipmentLine,
      invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
      invoiceNumber: 'INV-EDIT',
      invoiceMatchReviewStatus: 'MATCHED',
      invoiceMatchWarnings: [],
      status: 'MATCHED',
    }],
  })),
  approveImportShipmentLineInvoiceMatch: jest.fn(async () => ({
    ...shipmentDetail,
    shipmentLines: [{
      ...shipmentLine,
      invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
      invoiceNumber: 'INV-EDIT',
      invoiceMatchReviewStatus: 'APPROVED_MISMATCH',
      invoiceMatchWarnings: ['Invoice quantity 9 differs from expected 10.'],
      invoiceMatchApprovedAt: '2026-04-30T00:00:00.000Z',
      invoiceMatchApprovedBy: 'Import Route Tester',
      invoiceMatchApprovalReason: 'Supplier short-shipped and buyer approved.',
      status: 'MATCHED',
    }],
  })),
  getImportLiquidationReadiness: jest.fn(async () => ({
    shipmentId: shipment.id,
    canFinalize: true,
    invoiceLineCount: 2,
    chargeCount: 1,
    finalChargeCount: 1,
    estimatedChargeCount: 0,
    unallocatedLineCount: 0,
    failedVerificationCount: 0,
    warningVerificationCount: 0,
    checks: [{
      checkCode: 'FINAL_CHARGES_COMPLETE',
      status: 'PASS',
      blocking: true,
      message: '1 landed-cost charges are marked final.',
    }],
  })),
  listImportPayables: jest.fn(async () => ({
    shipmentId: shipment.id,
    totalHnlAmount: 2450,
    readyHnlAmount: 2450,
    stagedCount: 0,
    sentCount: 0,
    paidCount: 0,
    voidedCount: 0,
    blockedCount: 0,
    payables: [{
      handoffId: null,
      shipmentId: shipment.id,
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
      counterparty: 'Edited Supplier',
      documentNumber: 'INV-EDIT',
      payableKind: 'MERCHANDISE',
      sourceAmount: 100,
      sourceCurrency: 'USD',
      fxRate: 24.5,
      fxDate: '2026-04-29',
      hnlAmount: 2450,
      final: true,
      readyForAp: true,
      handoffStatus: 'NOT_STAGED',
      apReference: null,
      sentToApBy: null,
      sentToApAt: null,
      paymentReference: null,
      paidBy: null,
      paidAt: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      notes: null,
    }],
  })),
  getImportReceivingHandoff: jest.fn(async () => ({
    shipmentId: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    displayName: shipment.displayName,
    status: 'RECEIVING_ESTIMATED',
    receivingCostBasis: 'ESTIMATED',
    canReceive: true,
    requiresAuditReason: true,
    lineCount: 1,
    readyLineCount: 1,
    blockedLineCount: 0,
    trueUpLineCount: 0,
    totalQuantity: 2,
    totalLandedHnl: 2450,
    readyLandedHnl: 2450,
    lines: [{
      shipmentId: shipment.id,
      invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
      shipmentLineId: shipmentLine.id,
      purchaseOrderId: '3f1d2a5e-4188-4c2f-8ed0-7daf1c8a1234',
      purchaseOrderLineId: '7a37a436-9ea6-4477-8763-3269c5b32649',
      purchaseOrderNumber: 'PO-1001',
      purchaseOrderStatus: 'CONFIRMED',
      skuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
      itemCode: 'ITEM-1',
      styleCode: null,
      description: 'Ready line',
      quantity: 2,
      unitOfMeasure: 'UNIT',
      baseUnitCostHnl: 1000,
      allocatedLandedCostHnl: 450,
      landedUnitCostHnl: 1225,
      receivingUnitCostHnl: 1225,
      receivingLineCostHnl: 2450,
      receivingCostBasis: 'ESTIMATED',
      goodsInTransitRecordId: 'e8cf545d-48f9-4cc0-a293-7657af6f1db2',
      containerId: 'ec0b34d2-c50e-4cd6-8d17-45d6db541d91',
      containerLabel: 'CONT-1',
      transitStatus: 'IN_TRANSIT',
      quantityInTransit: 2,
      expectedReceiptAt: '2026-05-12',
      receivedAt: null,
      canReceive: true,
      requiresAuditReason: true,
      needsFinalTrueUp: false,
      blockingReason: null,
    }],
    audit: receivingAudit,
  })),
  getImportPurchaseOrderLinking: jest.fn(async () => ({
    shipmentId: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    displayName: shipment.displayName,
    status: 'DRAFT',
    lineCount: 1,
    linkedLineCount: 0,
    unlinkedLineCount: 1,
    creatableLineCount: 1,
    lines: [{
      shipmentId: shipment.id,
      invoiceId: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
      invoiceNumber: 'INV-EDIT',
      supplierCode: 'KSF',
      supplierName: 'Edited Supplier',
      invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
      purchaseOrderLineId: null,
      purchaseOrderId: null,
      purchaseOrderNumber: null,
      purchaseOrderStatus: null,
      purchaseOrderVendorCode: null,
      skuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
      poLineSkuId: null,
      skuCode: 'ZN02-NDPT',
      itemCode: 'ITEM-1',
      styleCode: null,
      description: 'Ready line',
      quantity: 2,
      unitOfMeasure: 'UNIT',
      baseUnitCostHnl: 1000,
      landedUnitCostHnl: 1225,
      poUnitCostHnl: null,
      canCreatePurchaseOrderLine: true,
      blockingReason: null,
    }],
  })),
  createImportPurchaseOrderDraft: jest.fn(async () => ({
    shipmentId: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    displayName: shipment.displayName,
    status: 'DRAFT',
    lineCount: 1,
    linkedLineCount: 1,
    unlinkedLineCount: 0,
    creatableLineCount: 0,
    purchaseOrderId: '3f1d2a5e-4188-4c2f-8ed0-7daf1c8a1234',
    purchaseOrderNumber: 'IMP-001-KSF',
    createdLineCount: 1,
    unitCostSource: 'BASE',
    lines: [{
      shipmentId: shipment.id,
      invoiceId: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
      invoiceNumber: 'INV-EDIT',
      supplierCode: 'KSF',
      supplierName: 'Edited Supplier',
      invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
      purchaseOrderLineId: '7a37a436-9ea6-4477-8763-3269c5b32649',
      purchaseOrderId: '3f1d2a5e-4188-4c2f-8ed0-7daf1c8a1234',
      purchaseOrderNumber: 'IMP-001-KSF',
      purchaseOrderStatus: 'DRAFT',
      purchaseOrderVendorCode: 'KSF',
      skuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
      poLineSkuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
      skuCode: 'ZN02-NDPT',
      itemCode: 'ITEM-1',
      styleCode: null,
      description: 'Ready line',
      quantity: 2,
      unitOfMeasure: 'UNIT',
      baseUnitCostHnl: 1000,
      landedUnitCostHnl: 1225,
      poUnitCostHnl: 1000,
      canCreatePurchaseOrderLine: false,
      blockingReason: 'Already linked to a purchase-order line.',
    }],
  })),
  linkImportInvoiceLineToPurchaseOrderLine: jest.fn(async () => ({
    shipmentId: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    displayName: shipment.displayName,
    status: 'DRAFT',
    lineCount: 1,
    linkedLineCount: 1,
    unlinkedLineCount: 0,
    creatableLineCount: 0,
    lines: [{
      shipmentId: shipment.id,
      invoiceId: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
      invoiceNumber: 'INV-EDIT',
      supplierCode: 'KSF',
      supplierName: 'Edited Supplier',
      invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
      purchaseOrderLineId: '7a37a436-9ea6-4477-8763-3269c5b32649',
      purchaseOrderId: '3f1d2a5e-4188-4c2f-8ed0-7daf1c8a1234',
      purchaseOrderNumber: 'PO-1001',
      purchaseOrderStatus: 'DRAFT',
      purchaseOrderVendorCode: 'KSF',
      skuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
      poLineSkuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
      skuCode: 'ZN02-NDPT',
      itemCode: 'ITEM-1',
      styleCode: null,
      description: 'Ready line',
      quantity: 2,
      unitOfMeasure: 'UNIT',
      baseUnitCostHnl: 1000,
      landedUnitCostHnl: 1225,
      poUnitCostHnl: 1000,
      canCreatePurchaseOrderLine: false,
      blockingReason: 'Already linked to a purchase-order line.',
    }],
  })),
  linkImportInvoiceLineToSku: jest.fn(async () => ({
    shipmentId: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    displayName: shipment.displayName,
    status: 'DRAFT',
    lineCount: 1,
    linkedLineCount: 0,
    unlinkedLineCount: 1,
    creatableLineCount: 1,
    lines: [{
      shipmentId: shipment.id,
      invoiceId: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
      invoiceNumber: 'INV-EDIT',
      supplierCode: 'KSF',
      supplierName: 'Edited Supplier',
      invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
      purchaseOrderLineId: null,
      purchaseOrderId: null,
      purchaseOrderNumber: null,
      purchaseOrderStatus: null,
      purchaseOrderVendorCode: null,
      skuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
      poLineSkuId: null,
      skuCode: 'ZN02-NDPT',
      itemCode: 'ITEM-1',
      styleCode: null,
      description: 'Ready line',
      quantity: 2,
      unitOfMeasure: 'UNIT',
      baseUnitCostHnl: 1000,
      landedUnitCostHnl: 1225,
      poUnitCostHnl: null,
      canCreatePurchaseOrderLine: true,
      blockingReason: null,
    }],
  })),
  receiveImportShipmentEstimated: jest.fn(async () => ({
    shipmentId: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    displayName: shipment.displayName,
    status: 'RECEIVING_ESTIMATED',
    receivingCostBasis: 'ESTIMATED',
    canReceive: true,
    requiresAuditReason: true,
    lineCount: 1,
    readyLineCount: 1,
    blockedLineCount: 0,
    trueUpLineCount: 0,
    totalQuantity: 2,
    totalLandedHnl: 2450,
    readyLandedHnl: 2450,
    action: 'RECEIVE_ESTIMATED',
    updatedRecordCount: 1,
    postedPurchaseOrderReceiptCount: 1,
    postedPurchaseOrderLineCount: 1,
    postedPurchaseOrderQuantity: 2,
    postedPurchaseOrderHnl: 2450,
    postedInventoryReceiptCount: 1,
    postedInventoryReceiptQuantity: 2,
    postedInventoryReceiptHnl: 2450,
    postedInventoryTrueUpCount: 0,
    postedInventoryTrueUpQuantity: 0,
    postedInventoryTrueUpHnl: 0,
    skippedFinalTrueUpLineCount: 0,
    purchaseOrderReceipts: [{
      purchaseOrderId: '3f1d2a5e-4188-4c2f-8ed0-7daf1c8a1234',
      purchaseOrderNumber: 'PO-1001',
      receiptId: 'f3411d7e-8d9b-4a63-a834-c40f2d8c7ef2',
      postedLineCount: 1,
      postedQuantity: 2,
      postedHnlAmount: 2450,
    }],
    audit: receivingAudit,
    inventoryReceipts: [{
      receiptId: '828ff17c-87c1-437e-922d-98bf3ed46c9f',
      invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
      stockMovementId: 'f9ea0625-9dff-4f42-a817-65d62df74020',
      skuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
      storeId: 1,
      receiptBasis: 'ESTIMATED',
      quantity: 2,
      unitCostHnl: 1225,
      hnlAmount: 2450,
    }],
    inventoryTrueUps: [],
    lines: [],
  })),
  receiveImportShipmentFinal: jest.fn(async () => ({
    shipmentId: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    displayName: shipment.displayName,
    status: 'RECEIVED_FINAL',
    receivingCostBasis: 'FINAL',
    canReceive: false,
    requiresAuditReason: false,
    lineCount: 1,
    readyLineCount: 0,
    blockedLineCount: 1,
    trueUpLineCount: 0,
    totalQuantity: 2,
    totalLandedHnl: 0,
    readyLandedHnl: 0,
    action: 'RECEIVE_FINAL',
    updatedRecordCount: 1,
    postedPurchaseOrderReceiptCount: 0,
    postedPurchaseOrderLineCount: 0,
    postedPurchaseOrderQuantity: 0,
    postedPurchaseOrderHnl: 0,
    postedInventoryReceiptCount: 0,
    postedInventoryReceiptQuantity: 0,
    postedInventoryReceiptHnl: 0,
    postedInventoryTrueUpCount: 1,
    postedInventoryTrueUpQuantity: 2,
    postedInventoryTrueUpHnl: 50,
    skippedFinalTrueUpLineCount: 1,
    purchaseOrderReceipts: [],
    inventoryTrueUps: [{
      trueUpId: '2a112f4f-24ed-4bd4-9c5e-e0c3938e4fc9',
      invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
      importInventoryReceiptId: null,
      purchaseOrderId: '3f1d2a5e-4188-4c2f-8ed0-7daf1c8a1234',
      purchaseOrderLineId: '7a37a436-9ea6-4477-8763-3269c5b32649',
      purchaseOrderNumber: 'PO-1001',
      stockMovementId: '726a16f9-4e70-4c46-8a04-6c96fd2f9f19',
      skuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
      storeId: 1,
      quantity: 2,
      estimatedUnitCostHnl: 1225,
      finalUnitCostHnl: 1250,
      deltaUnitCostHnl: 25,
      deltaHnlAmount: 50,
    }],
    inventoryReceipts: [],
    lines: [],
    audit: receivingAudit,
  })),
  stageImportPayables: jest.fn(async () => ({
    shipmentId: shipment.id,
    totalHnlAmount: 2450,
    readyHnlAmount: 2450,
    stagedCount: 1,
    sentCount: 0,
    paidCount: 0,
    voidedCount: 0,
    blockedCount: 0,
    stagedReadyCount: 1,
    blockedEstimatedChargeCount: 0,
    payables: [{
      handoffId: '46b4f32c-24d5-41d6-83fb-700998c4f61b',
      shipmentId: shipment.id,
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
      counterparty: 'Edited Supplier',
      documentNumber: 'INV-EDIT',
      payableKind: 'MERCHANDISE',
      sourceAmount: 100,
      sourceCurrency: 'USD',
      fxRate: 24.5,
      fxDate: '2026-04-29',
      hnlAmount: 2450,
      final: true,
      readyForAp: true,
      handoffStatus: 'READY',
      apReference: null,
      sentToApBy: null,
      sentToApAt: null,
      paymentReference: null,
      paidBy: null,
      paidAt: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      notes: null,
    }],
  })),
  markImportPayablesSent: jest.fn(async () => ({
    shipmentId: shipment.id,
    totalHnlAmount: 2450,
    readyHnlAmount: 2450,
    stagedCount: 1,
    sentCount: 1,
    paidCount: 0,
    voidedCount: 0,
    blockedCount: 0,
    payables: [{
      handoffId: '46b4f32c-24d5-41d6-83fb-700998c4f61b',
      shipmentId: shipment.id,
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
      counterparty: 'Edited Supplier',
      documentNumber: 'INV-EDIT',
      payableKind: 'MERCHANDISE',
      sourceAmount: 100,
      sourceCurrency: 'USD',
      fxRate: 24.5,
      fxDate: '2026-04-29',
      hnlAmount: 2450,
      final: true,
      readyForAp: true,
      handoffStatus: 'SENT_TO_AP',
      apReference: 'AP-BATCH-1',
      sentToApBy: 'system',
      sentToApAt: '2026-04-29T00:00:00.000Z',
      paymentReference: null,
      paidBy: null,
      paidAt: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      notes: null,
    }],
  })),
  markImportPayablePaid: jest.fn(async () => ({
    shipmentId: shipment.id,
    totalHnlAmount: 2450,
    readyHnlAmount: 2450,
    stagedCount: 1,
    sentCount: 0,
    paidCount: 1,
    voidedCount: 0,
    blockedCount: 0,
    payables: [{
      handoffId: '46b4f32c-24d5-41d6-83fb-700998c4f61b',
      shipmentId: shipment.id,
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
      counterparty: 'Edited Supplier',
      documentNumber: 'INV-EDIT',
      payableKind: 'MERCHANDISE',
      sourceAmount: 100,
      sourceCurrency: 'USD',
      fxRate: 24.5,
      fxDate: '2026-04-29',
      hnlAmount: 2450,
      final: true,
      readyForAp: true,
      handoffStatus: 'PAID',
      apReference: 'AP-BATCH-1',
      sentToApBy: 'system',
      sentToApAt: '2026-04-29T00:00:00.000Z',
      paymentReference: 'WIRE-123',
      paidBy: 'Import Route Tester',
      paidAt: '2026-05-30T00:00:00.000Z',
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      notes: null,
    }],
  })),
  voidImportPayable: jest.fn(async () => ({
    shipmentId: shipment.id,
    totalHnlAmount: 2450,
    readyHnlAmount: 2450,
    stagedCount: 1,
    sentCount: 0,
    paidCount: 0,
    voidedCount: 1,
    blockedCount: 0,
    payables: [{
      handoffId: '46b4f32c-24d5-41d6-83fb-700998c4f61b',
      shipmentId: shipment.id,
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
      counterparty: 'Edited Supplier',
      documentNumber: 'INV-EDIT',
      payableKind: 'MERCHANDISE',
      sourceAmount: 100,
      sourceCurrency: 'USD',
      fxRate: 24.5,
      fxDate: '2026-04-29',
      hnlAmount: 2450,
      final: true,
      readyForAp: true,
      handoffStatus: 'VOIDED',
      apReference: 'AP-BATCH-1',
      sentToApBy: 'system',
      sentToApAt: '2026-04-29T00:00:00.000Z',
      paymentReference: null,
      paidBy: null,
      paidAt: null,
      voidedBy: 'Import Route Tester',
      voidedAt: '2026-05-30T00:00:00.000Z',
      voidReason: 'Duplicate freight invoice.',
      notes: null,
    }],
  })),
  recordImportVerificationCheck: jest.fn(async (_shipmentId: string, input: { checkCode: string; status: string }) => ({
    ...shipmentDetail,
    verificationChecks: [{
      id: '8a64ca4c-8623-4e28-8369-d4c7bfc04c5d',
      shipmentId: shipment.id,
      checkCode: input.checkCode,
      status: input.status,
      expectedHnlAmount: 2450,
      actualHnlAmount: 2450,
      varianceHnlAmount: 0,
      message: 'Invoice and charge totals match liquidation.',
    }],
  })),
  updateImportShipmentStatus: jest.fn(),
  addImportSupplierInvoice: jest.fn(),
  updateImportSupplierInvoice: jest.fn(async () => ({
    ...shipmentDetail,
    supplierInvoices: [{
      id: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
      shipmentId: shipment.id,
      invoiceNumber: 'INV-EDIT',
      supplierCode: null,
      supplierName: 'Edited Supplier',
      invoiceDate: '2026-04-29',
      invoiceGroup: 'TAXABLE',
      invoiceKind: 'MERCHANDISE',
      sourceAmount: 100,
      sourceCurrency: 'USD',
      fxRate: 24.5,
      fxDate: '2026-04-29',
      hnlAmount: 2450,
      notes: null,
      lines: [],
    }],
  })),
  addImportInvoiceLine: jest.fn(),
  updateImportInvoiceLine: jest.fn(async () => ({
    ...shipmentDetail,
    supplierInvoices: [{
      id: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
      shipmentId: shipment.id,
      invoiceNumber: 'INV-EDIT',
      supplierCode: null,
      supplierName: 'Edited Supplier',
      invoiceDate: '2026-04-29',
      invoiceGroup: 'TAXABLE',
      invoiceKind: 'MERCHANDISE',
      sourceAmount: 100,
      sourceCurrency: 'USD',
      fxRate: 24.5,
      fxDate: '2026-04-29',
      hnlAmount: 2450,
      notes: null,
      lines: [{
        id: '8b8c4087-d5d6-4744-8843-20d7388c6175',
        invoiceId: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
        skuId: null,
        purchaseOrderLineId: null,
        lineNumber: 1,
        itemCode: 'ITEM-1',
        styleCode: null,
        description: 'Edited line',
        materialMeters: null,
        cartonCount: null,
        weightKg: null,
        volumeCbm: null,
        quantity: 2,
        unitOfMeasure: 'UNIT',
        sourceUnitCost: 50,
        sourceAmount: 100,
        sourceCurrency: 'USD',
        fxRate: 24.5,
        fxDate: '2026-04-29',
        hnlAmount: 2450,
        baseUnitCostHnl: 1225,
        allocatedLandedCostHnl: 0,
        landedUnitCostHnl: 1225,
        taxable: true,
      }],
    }],
  })),
  addImportCharge: jest.fn(),
  updateImportCharge: jest.fn(async () => ({
    ...shipmentDetail,
    charges: [{
      id: 'e6c72458-a9bb-4a77-b50d-c3d4ac1b70a9',
      shipmentId: shipment.id,
      chargeType: 'FREIGHT',
      counterparty: 'Forwarder',
      documentNumber: 'FR-1',
      sourceAmount: 100,
      sourceCurrency: 'USD',
      fxRate: 24.5,
      fxDate: '2026-04-29',
      hnlAmount: 2450,
      allocationBasis: 'PRODUCT_COST_SHARE',
      costTreatment: 'INCLUDED_IN_COMMERCIAL_PRICE',
      taxable: false,
      estimated: false,
      final: true,
      notes: null,
    }],
  })),
  addImportContainer: jest.fn(async () => ({
    ...shipmentDetail,
    containers: [{
      id: '6e2b6e0a-37b8-48fa-99df-44d4218c99da',
      shipmentId: shipment.id,
      containerNumber: 'LOOSE-86',
      containerType: 'LOOSE_CARGO',
      sealNumber: null,
      cargoGroup: 'Carga 86',
      status: 'PLANNED',
      expectedArrivalAt: null,
      actualArrivalAt: null,
      notes: null,
    }],
  })),
  updateImportContainer: jest.fn(async () => shipmentDetail),
  addGoodsInTransitRecord: jest.fn(async () => ({
    ...shipmentDetail,
    goodsInTransit: [{
      id: 'a25d4a4b-1c18-42e4-b2b0-a6d0269fdd12',
      shipmentId: shipment.id,
      containerId: null,
      invoiceLineId: null,
      status: 'IN_TRANSIT',
      ownershipTransferAt: null,
      expectedReceiptAt: null,
      receivedAt: null,
      quantityInTransit: null,
      auditReason: null,
    }],
  })),
  createGoodsInTransitForShipment: jest.fn(async () => ({
    shipment: shipmentDetail,
    createdCount: 2,
  })),
  updateGoodsInTransitRecord: jest.fn(async () => shipmentDetail),
  updateImportSuggestedPriceStatus: jest.fn(async (_suggestedPriceId: string, input: { approvalStatus: string }) => ({
    ...shipmentDetail,
    suggestedPrices: [{
      id: 'df650972-c0bc-4e18-bc2a-b70c6af1e1c1',
      shipmentId: shipment.id,
      invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175',
      skuId: '86dfbd2f-1832-4872-b736-eb4d78e80f22',
      landedUnitCostHnl: 125,
      markupFactor: 2.5,
      suggestedRetailHnl: 312.5,
      approvalStatus: input.approvalStatus,
      approvedBy: input.approvalStatus === 'REJECTED' ? null : 'system',
      approvedAt: input.approvalStatus === 'REJECTED' ? null : '2026-04-29T00:00:00.000Z',
    }],
  })),
  allocateImportLandedCost: jest.fn(async () => ({
    shipmentId: shipment.id,
    invoiceHnlTotal: 2450,
    chargeHnlTotal: 100,
    landedHnlTotal: 2550,
    allocationCount: 1,
    suggestedPriceCount: 1,
  })),
  isImportManagementServiceError: (err: unknown) =>
    typeof err === 'object' && err != null && 'status' in err && 'code' in err,
}));

jest.mock('../src/services/importWorkbookService', () => {
  const preview = {
    kind: 'SUIT_PROFORMA',
    fileName: 'suits.xlsx',
    shipment: {
      shipmentNumber: 'KSPI2025052305',
      displayName: 'Suit proforma KSPI2025052305',
      sourceWorkbookName: 'suits.xlsx',
    },
    supplierInvoices: [],
    charges: [],
    verificationChecks: [],
    totals: {
      invoiceSourceTotal: 0,
      invoiceHnlTotal: 0,
      chargeHnlTotal: 0,
      invoiceCount: 0,
      lineCount: 0,
      chargeCount: 0,
    },
    warnings: [],
  };
  return {
    parseImportWorkbook: jest.fn(async () => preview),
    importWorkbook: jest.fn(async () => ({
      preview,
      shipment: {
        ...shipment,
        id: '9919ddc9-0870-4fae-b8f1-2669873899df',
        shipmentNumber: 'KSPI2025052305',
        displayName: 'Suit proforma KSPI2025052305',
        originPort: null,
        destinationPort: null,
        carrier: null,
        freightForwarder: null,
        customsPolicyNumber: null,
        blNumber: null,
        expectedDepartureAt: null,
        actualArrivalAt: null,
        baseCurrency: 'HNL',
        notes: null,
        approvedEstimateAt: null,
        approvedEstimateBy: null,
        finalLiquidationAt: null,
        closedAt: null,
        createdBy: 'system',
        containers: [],
        supplierInvoices: [],
        charges: [],
        allocations: [],
        goodsInTransit: [],
        verificationChecks: [],
        suggestedPrices: [],
      },
      allocation: null,
    })),
    isImportWorkbookServiceError: (err: unknown) =>
      typeof err === 'object' && err != null && 'status' in err && 'code' in err,
  };
});

import app from '../src/app';

describe('Import Management routes', () => {
  it('lists import shipments', async () => {
    const res = await request(app).get('/api/v1/import-management/shipments');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].shipmentNumber).toBe('IMP-001');
  });

  it('lists import commitments for OTB consumption', async () => {
    const res = await request(app).get('/api/v1/import-management/otb-commitments?monthFrom=2026-05&monthTo=2026-05');
    expect(res.status).toBe(200);
    expect(res.body.totalEstimatedHnl).toBe(2450);
    expect(res.body.summary[0].commitmentBasis).toBe('ESTIMATED');
    expect(res.body.summary[0].categoryNumber).toBe(556);
  });

  it('validates OTB commitment month filters', async () => {
    const res = await request(app).get('/api/v1/import-management/otb-commitments?monthFrom=2026-13');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates an import shipment', async () => {
    const res = await request(app)
      .post('/api/v1/import-management/shipments')
      .send({ shipmentNumber: 'IMP-001', displayName: 'Carga Suelta Panama' });
    expect(res.status).toBe(201);
    expect(res.body.shipmentNumber).toBe('IMP-001');
  });

  it('validates required shipment fields', async () => {
    const res = await request(app).post('/api/v1/import-management/shipments').send({ shipmentNumber: 'IMP-001' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('previews uploaded import workbooks', async () => {
    const res = await request(app)
      .post('/api/v1/import-management/workbooks/preview')
      .field('defaultFxRate', '3.5')
      .attach('workbook', Buffer.from('xlsx'), {
        filename: 'suits.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('SUIT_PROFORMA');
    expect(res.body.shipment.shipmentNumber).toBe('KSPI2025052305');
  });

  it('rejects workbook preview without a file', async () => {
    const res = await request(app).post('/api/v1/import-management/workbooks/preview').field('defaultFxRate', '3.5');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_WORKBOOK');
  });

  it('requires cost override permission to import workbook cost documents', async () => {
    const anonymous = await request(app)
      .post('/api/v1/import-management/workbooks/import')
      .attach('workbook', Buffer.from('xlsx'), {
        filename: 'panama.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');

    const forbidden = await request(app)
      .post('/api/v1/import-management/workbooks/import')
      .set('x-test-user', 'viewer')
      .attach('workbook', Buffer.from('xlsx'), {
        filename: 'panama.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.message).toContain(IMPORT_COST_OVERRIDE_PERMISSION);
  });

  it('returns a clear error when workbook import uses a duplicate shipment number', async () => {
    const workbookService = jest.requireMock('../src/services/importWorkbookService') as { importWorkbook: jest.Mock };
    workbookService.importWorkbook.mockRejectedValueOnce({
      status: 409,
      code: 'SHIPMENT_NUMBER_EXISTS',
      message: 'Import shipment PANAMA-87 already exists. Enter a different shipment number override before importing this workbook.',
    });

    const res = await request(app)
      .post('/api/v1/import-management/workbooks/import')
      .set('x-test-user', 'buyer')
      .set('x-test-permissions', IMPORT_COST_OVERRIDE_PERMISSION)
      .attach('workbook', Buffer.from('xlsx'), {
        filename: 'panama.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SHIPMENT_NUMBER_EXISTS');
    expect(res.body.error.message).toContain('shipment number override');
  });

  it('adds an import container', async () => {
    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/containers`)
      .send({ containerType: 'LOOSE_CARGO', cargoGroup: 'Carga 86', status: 'PLANNED' });
    expect(res.status).toBe(201);
    expect(res.body.containers[0].cargoGroup).toBe('Carga 86');
  });

  it('validates goods-in-transit status input', async () => {
    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/goods-in-transit`)
      .send({ status: 'NOT_A_STATUS' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires import-management permission for manual estimated transit receiving status', async () => {
    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/goods-in-transit`)
      .set('x-test-user', 'viewer')
      .send({ status: 'RECEIVING_ESTIMATED', auditReason: 'Warehouse needs stock before final liquidation.' });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('import_management.receive_estimated');
  });

  it('creates goods-in-transit records from shipment lines', async () => {
    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/goods-in-transit/from-lines`)
      .send({ status: 'IN_TRANSIT' });
    expect(res.status).toBe(201);
    expect(res.body.createdCount).toBe(2);
  });

  it('returns liquidation readiness checks', async () => {
    const res = await request(app).get(`/api/v1/import-management/shipments/${shipment.id}/liquidation-readiness`);
    expect(res.status).toBe(200);
    expect(res.body.canFinalize).toBe(true);
    expect(res.body.checks[0].checkCode).toBe('FINAL_CHARGES_COMPLETE');
  });

  it('lists import payables for AP handoff', async () => {
    const res = await request(app).get(`/api/v1/import-management/shipments/${shipment.id}/payables`);
    expect(res.status).toBe(200);
    expect(res.body.payables[0].handoffStatus).toBe('NOT_STAGED');
    expect(res.body.readyHnlAmount).toBe(2450);
  });

  it('lists shipment audit events for cost and receiving history', async () => {
    const importService = jest.requireMock('../src/services/importManagementService') as {
      listImportShipmentAuditEvents: jest.Mock;
    };

    const res = await request(app).get(`/api/v1/import-management/shipments/${shipment.id}/audit-events?limit=25`);
    expect(res.status).toBe(200);
    expect(res.body.events[0].action).toBe('RECEIVE_FINAL_AND_TRUE_UP');
    expect(res.body.events[0].afterJson.postedInventoryTrueUpHnl).toBe(50);
    expect(importService.listImportShipmentAuditEvents).toHaveBeenCalledWith(shipment.id, 25);
  });

  it('returns import shipment reports as JSON and CSV exports', async () => {
    const importService = jest.requireMock('../src/services/importManagementService') as {
      getImportShipmentReport: jest.Mock;
    };

    const json = await request(app)
      .get(`/api/v1/import-management/shipments/${shipment.id}/reports/shipment-liquidation`);
    expect(json.status).toBe(200);
    expect(json.body.reportKey).toBe('shipment-liquidation');
    expect(json.body.rows[0].documentNumber).toBe('INV-EDIT');
    expect(importService.getImportShipmentReport).toHaveBeenCalledWith(shipment.id, 'shipment-liquidation');

    const csv = await request(app)
      .get(`/api/v1/import-management/shipments/${shipment.id}/reports/shipment-liquidation?format=csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('import-imp-001-shipment-liquidation.csv');
    expect(csv.text).toContain('Shipment,Document,HNL Amount');
    expect(csv.text).toContain('IMP-001,INV-EDIT,2450');
  });

  it('returns receiving handoff readiness for purchasing and inventory', async () => {
    const res = await request(app).get(`/api/v1/import-management/shipments/${shipment.id}/receiving-handoff`);
    expect(res.status).toBe(200);
    expect(res.body.receivingCostBasis).toBe('ESTIMATED');
    expect(res.body.requiresAuditReason).toBe(true);
    expect(res.body.lines[0].receivingUnitCostHnl).toBe(1225);
    expect(res.body.audit.purchaseOrderReceiptCount).toBe(1);
    expect(res.body.audit.inventoryReceiptCount).toBe(1);
    expect(res.body.audit.inventoryTrueUpHnl).toBe(50);
  });

  it('returns purchase-order linking readiness for import lines', async () => {
    const res = await request(app).get(`/api/v1/import-management/shipments/${shipment.id}/purchase-order-linking`);
    expect(res.status).toBe(200);
    expect(res.body.creatableLineCount).toBe(1);
    expect(res.body.lines[0].skuCode).toBe('ZN02-NDPT');
  });

  it('lists open PO line candidates for PO-first shipment planning', async () => {
    const importService = jest.requireMock('../src/services/importManagementService') as {
      listImportShipmentLineCandidates: jest.Mock;
    };

    const res = await request(app)
      .get(
        `/api/v1/import-management/shipments/${shipment.id}/po-line-candidates` +
        '?q=PO-1001&vendorCode=ksf&buyer=IB&sourceCurrency=CNY&incotermCode=FOB&poStatus=CONFIRMED',
      );

    expect(res.status).toBe(200);
    expect(res.body[0].purchaseOrderLineId).toBe(shipmentLineCandidate.purchaseOrderLineId);
    expect(res.body[0].quantityAvailable).toBe(10);
    expect(res.body[0].plannedShipments).toBe('PANAMA-86 (2)');
    expect(importService.listImportShipmentLineCandidates).toHaveBeenCalledWith(shipment.id, {
      q: 'PO-1001',
      vendorCode: 'ksf',
      buyer: 'IB',
      sourceCurrency: 'CNY',
      incotermCode: 'FOB',
      poStatus: 'CONFIRMED',
    });
  });

  it('suggests supplier invoice matches for expected PO shipment lines', async () => {
    const res = await request(app)
      .get(`/api/v1/import-management/shipments/${shipment.id}/invoice-match-suggestions`);

    expect(res.status).toBe(200);
    expect(res.body[0].shipmentLineId).toBe(shipmentLine.id);
    expect(res.body[0].invoiceLineId).toBe('8b8c4087-d5d6-4744-8843-20d7388c6175');
    expect(res.body[0].warnings[0]).toContain('quantity');
  });

  it('applies high-confidence invoice match suggestions in bulk', async () => {
    const importService = jest.requireMock('../src/services/importManagementService') as {
      applyImportInvoiceMatchSuggestions: jest.Mock;
    };

    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/invoice-match-suggestions/apply`)
      .send({
        minScore: 85,
        allowWarnings: false,
        shipmentLineIds: [shipmentLine.id],
      });

    expect(res.status).toBe(200);
    expect(res.body.appliedCount).toBe(1);
    expect(res.body.shipment.shipmentLines[0].invoiceNumber).toBe('INV-EDIT');
    expect(importService.applyImportInvoiceMatchSuggestions).toHaveBeenCalledWith(shipment.id, {
      minScore: 85,
      allowWarnings: false,
      shipmentLineIds: [shipmentLine.id],
    });
  });

  it('requires cost override permission when expected PO line landed cost is supplied', async () => {
    const anonymous = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/shipment-lines`)
      .send({
        purchaseOrderLineId: shipmentLineCandidate.purchaseOrderLineId,
        expectedQuantity: 10,
        estimatedLandedUnitCostHnl: 225,
      });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');

    const forbidden = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/shipment-lines`)
      .set('x-test-user', 'viewer')
      .send({
        purchaseOrderLineId: shipmentLineCandidate.purchaseOrderLineId,
        expectedQuantity: 10,
        estimatedLandedUnitCostHnl: 225,
      });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.message).toContain(IMPORT_COST_OVERRIDE_PERMISSION);
  });

  it('adds an expected PO line to an import shipment before supplier invoices exist', async () => {
    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/shipment-lines`)
      .set('x-test-user', 'buyer')
      .set('x-test-permissions', IMPORT_COST_OVERRIDE_PERMISSION)
      .send({
        purchaseOrderLineId: shipmentLineCandidate.purchaseOrderLineId,
        expectedQuantity: 10,
        estimatedLandedUnitCostHnl: 225,
      });

    expect(res.status).toBe(201);
    expect(res.body.shipmentLines[0].purchaseOrderNumber).toBe('PO-1001');
    expect(res.body.shipmentLines[0].estimatedLandedUnitCostHnl).toBe(225);
  });

  it('updates an expected PO shipment line', async () => {
    const res = await request(app)
      .patch(`/api/v1/import-management/shipment-lines/${shipmentLine.id}`)
      .send({
        expectedQuantity: 8,
        notes: 'Factory partial shipment',
      });

    expect(res.status).toBe(200);
    expect(res.body.shipmentLines[0].expectedQuantity).toBe(8);
    expect(res.body.shipmentLines[0].notes).toBe('Factory partial shipment');
  });

  it('matches a later supplier invoice line back to the expected PO shipment line', async () => {
    const res = await request(app)
      .patch(`/api/v1/import-management/shipment-lines/${shipmentLine.id}/invoice-line`)
      .send({ invoiceLineId: '8b8c4087-d5d6-4744-8843-20d7388c6175' });

    expect(res.status).toBe(200);
    expect(res.body.shipmentLines[0].status).toBe('MATCHED');
    expect(res.body.shipmentLines[0].invoiceNumber).toBe('INV-EDIT');
    expect(res.body.shipmentLines[0].invoiceMatchReviewStatus).toBe('MATCHED');
  });

  it('requires mismatch approval permission before approving invoice match warnings', async () => {
    const anonymous = await request(app)
      .patch(`/api/v1/import-management/shipment-lines/${shipmentLine.id}/invoice-match-approval`)
      .send({
        approved: true,
        reason: 'Supplier short-shipped and buyer approved.',
      });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');

    const forbidden = await request(app)
      .patch(`/api/v1/import-management/shipment-lines/${shipmentLine.id}/invoice-match-approval`)
      .set('x-test-user', 'buyer')
      .send({
        approved: true,
        reason: 'Supplier short-shipped and buyer approved.',
      });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.message).toContain(IMPORT_APPROVE_MISMATCH_PERMISSION);
  });

  it('approves an invoice match mismatch with route actor audit context', async () => {
    const importService = jest.requireMock('../src/services/importManagementService') as {
      approveImportShipmentLineInvoiceMatch: jest.Mock;
    };

    const res = await request(app)
      .patch(`/api/v1/import-management/shipment-lines/${shipmentLine.id}/invoice-match-approval`)
      .set('x-test-user', 'import-user')
      .set('x-test-permissions', IMPORT_APPROVE_MISMATCH_PERMISSION)
      .send({
        approved: true,
        reason: 'Supplier short-shipped and buyer approved.',
      });

    expect(res.status).toBe(200);
    expect(res.body.shipmentLines[0].invoiceMatchReviewStatus).toBe('APPROVED_MISMATCH');
    expect(res.body.shipmentLines[0].invoiceMatchApprovedBy).toBe('Import Route Tester');
    expect(importService.approveImportShipmentLineInvoiceMatch).toHaveBeenCalledWith(
      shipmentLine.id,
      {
        approved: true,
        reason: 'Supplier short-shipped and buyer approved.',
      },
      'Import Route Tester',
    );
  });

  it('removes an expected PO shipment line', async () => {
    const res = await request(app)
      .delete(`/api/v1/import-management/shipment-lines/${shipmentLine.id}`);

    expect(res.status).toBe(200);
    expect(res.body.shipmentLines).toEqual([]);
  });

  it('creates a native draft PO from ready import lines', async () => {
    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/purchase-order-draft`)
      .send({
        vendorCode: 'KSF',
        supplierInvoiceId: 'd10cb4aa-59de-4ff6-94bf-4966f5e8c7b0',
        unitCostSource: 'BASE',
      });
    expect(res.status).toBe(201);
    expect(res.body.purchaseOrderNumber).toBe('IMP-001-KSF');
    expect(res.body.createdLineCount).toBe(1);
  });

  it('links an import invoice line to an existing native PO line', async () => {
    const res = await request(app)
      .patch('/api/v1/import-management/invoice-lines/8b8c4087-d5d6-4744-8843-20d7388c6175/purchase-order-line')
      .send({ purchaseOrderLineId: '7a37a436-9ea6-4477-8763-3269c5b32649' });
    expect(res.status).toBe(200);
    expect(res.body.linkedLineCount).toBe(1);
    expect(res.body.lines[0].purchaseOrderNumber).toBe('PO-1001');
  });

  it('maps an import invoice line to an app SKU', async () => {
    const res = await request(app)
      .patch('/api/v1/import-management/invoice-lines/8b8c4087-d5d6-4744-8843-20d7388c6175/sku')
      .send({ skuCode: 'ZN02-NDPT' });
    expect(res.status).toBe(200);
    expect(res.body.creatableLineCount).toBe(1);
    expect(res.body.lines[0].skuCode).toBe('ZN02-NDPT');
  });

  it('requires import-management permission for estimated receiving', async () => {
    const anonymous = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/receiving-handoff/receive-estimated`)
      .send({ receivedAt: '2026-05-12', locationId: '1', auditReason: 'Warehouse needs stock before final liquidation.' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');

    const forbidden = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/receiving-handoff/receive-estimated`)
      .set('x-test-user', 'viewer')
      .send({ receivedAt: '2026-05-12', locationId: '1', auditReason: 'Warehouse needs stock before final liquidation.' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.message).toContain('import_management.receive_estimated');
  });

  it('records estimated import receiving with an audit reason', async () => {
    const importService = jest.requireMock('../src/services/importManagementService') as {
      receiveImportShipmentEstimated: jest.Mock;
    };

    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/receiving-handoff/receive-estimated`)
      .set('x-test-user', 'buyer')
      .set('x-test-permissions', 'import_management.receive_estimated')
      .send({
        receivedAt: '2026-05-12',
        locationId: '1',
        containerId: 'ec0b34d2-c50e-4cd6-8d17-45d6db541d91',
        shipmentLineIds: [shipmentLine.id],
        goodsInTransitRecordIds: ['e8cf545d-48f9-4cc0-a293-7657af6f1db2'],
        auditReason: 'Warehouse needs stock before final liquidation.',
      });
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('RECEIVE_ESTIMATED');
    expect(res.body.updatedRecordCount).toBe(1);
    expect(res.body.postedPurchaseOrderReceiptCount).toBe(1);
    expect(res.body.purchaseOrderReceipts[0].purchaseOrderNumber).toBe('PO-1001');
    expect(res.body.postedInventoryReceiptCount).toBe(1);
    expect(res.body.inventoryReceipts[0].receiptBasis).toBe('ESTIMATED');
    expect(importService.receiveImportShipmentEstimated).toHaveBeenCalledWith(
      shipment.id,
      {
        receivedAt: '2026-05-12',
        locationId: '1',
        containerId: 'ec0b34d2-c50e-4cd6-8d17-45d6db541d91',
        shipmentLineIds: [shipmentLine.id],
        goodsInTransitRecordIds: ['e8cf545d-48f9-4cc0-a293-7657af6f1db2'],
        auditReason: 'Warehouse needs stock before final liquidation.',
      },
      'Import Route Tester',
    );
  });

  it('requires final liquidation permission for final receiving and true-up', async () => {
    const anonymous = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/receiving-handoff/receive-final`)
      .send({ receivedAt: '2026-05-20' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');

    const forbidden = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/receiving-handoff/receive-final`)
      .set('x-test-user', 'viewer')
      .send({ receivedAt: '2026-05-20' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.message).toContain(IMPORT_FINAL_LIQUIDATION_PERMISSION);
  });

  it('records final import receiving and true-up readiness', async () => {
    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/receiving-handoff/receive-final`)
      .set('x-test-user', 'finance')
      .set('x-test-permissions', IMPORT_FINAL_LIQUIDATION_PERMISSION)
      .send({ receivedAt: '2026-05-20' });
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('RECEIVE_FINAL');
    expect(res.body.status).toBe('RECEIVED_FINAL');
    expect(res.body.skippedFinalTrueUpLineCount).toBe(1);
    expect(res.body.postedInventoryTrueUpCount).toBe(1);
    expect(res.body.inventoryTrueUps[0].deltaHnlAmount).toBe(50);
  });

  it('stages import payables for AP handoff', async () => {
    const res = await request(app).post(`/api/v1/import-management/shipments/${shipment.id}/payables/stage`).send({});
    expect(res.status).toBe(201);
    expect(res.body.stagedReadyCount).toBe(1);
    expect(res.body.payables[0].handoffStatus).toBe('READY');
  });

  it('marks staged import payables sent to AP', async () => {
    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/payables/mark-sent`)
      .send({ apReference: 'AP-BATCH-1' });
    expect(res.status).toBe(200);
    expect(res.body.sentCount).toBe(1);
    expect(res.body.payables[0].apReference).toBe('AP-BATCH-1');
  });

  it('marks a sent import payable paid with actor audit context', async () => {
    const importService = jest.requireMock('../src/services/importManagementService') as {
      markImportPayablePaid: jest.Mock;
    };

    const res = await request(app)
      .post('/api/v1/import-management/payables/46b4f32c-24d5-41d6-83fb-700998c4f61b/mark-paid')
      .set('x-test-user', 'ap-user')
      .send({
        paymentReference: 'WIRE-123',
        paidAt: '2026-05-30',
      });
    expect(res.status).toBe(200);
    expect(res.body.paidCount).toBe(1);
    expect(res.body.payables[0].handoffStatus).toBe('PAID');
    expect(res.body.payables[0].paymentReference).toBe('WIRE-123');
    expect(importService.markImportPayablePaid).toHaveBeenCalledWith(
      '46b4f32c-24d5-41d6-83fb-700998c4f61b',
      {
        paymentReference: 'WIRE-123',
        paidAt: '2026-05-30',
      },
      'Import Route Tester',
    );
  });

  it('voids an import payable handoff with actor audit context', async () => {
    const importService = jest.requireMock('../src/services/importManagementService') as {
      voidImportPayable: jest.Mock;
    };

    const res = await request(app)
      .post('/api/v1/import-management/payables/46b4f32c-24d5-41d6-83fb-700998c4f61b/void')
      .set('x-test-user', 'ap-user')
      .send({ reason: 'Duplicate freight invoice.' });
    expect(res.status).toBe(200);
    expect(res.body.voidedCount).toBe(1);
    expect(res.body.payables[0].handoffStatus).toBe('VOIDED');
    expect(res.body.payables[0].voidReason).toBe('Duplicate freight invoice.');
    expect(importService.voidImportPayable).toHaveBeenCalledWith(
      '46b4f32c-24d5-41d6-83fb-700998c4f61b',
      { reason: 'Duplicate freight invoice.' },
      'Import Route Tester',
    );
  });

  it('records a shipment verification check', async () => {
    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/verification-checks`)
      .send({
        checkCode: 'CUSTOMS_POLICY_TOTAL',
        status: 'PASS',
        expectedHnlAmount: 2450,
        actualHnlAmount: 2450,
        varianceHnlAmount: 0,
        message: 'Invoice and charge totals match liquidation.',
      });
    expect(res.status).toBe(200);
    expect(res.body.verificationChecks[0].checkCode).toBe('CUSTOMS_POLICY_TOTAL');
    expect(res.body.verificationChecks[0].status).toBe('PASS');
  });

  it('validates verification check status', async () => {
    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/verification-checks`)
      .send({ checkCode: 'CUSTOMS_POLICY_TOTAL', status: 'DONE' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires cost override permission for landed-cost allocation', async () => {
    const anonymous = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/allocate-landed-cost`)
      .send({ markupFactor: 2.5 });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');

    const forbidden = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/allocate-landed-cost`)
      .set('x-test-user', 'viewer')
      .send({ markupFactor: 2.5 });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.message).toContain(IMPORT_COST_OVERRIDE_PERMISSION);
  });

  it('allocates landed cost with cost override permission', async () => {
    const res = await request(app)
      .post(`/api/v1/import-management/shipments/${shipment.id}/allocate-landed-cost`)
      .set('x-test-user', 'buyer')
      .set('x-test-permissions', IMPORT_COST_OVERRIDE_PERMISSION)
      .send({ markupFactor: 2.5 });
    expect(res.status).toBe(200);
    expect(res.body.landedHnlTotal).toBe(2550);
  });

  it('updates an import charge to final', async () => {
    const res = await request(app)
      .patch('/api/v1/import-management/charges/e6c72458-a9bb-4a77-b50d-c3d4ac1b70a9')
      .set('x-test-user', 'buyer')
      .set('x-test-permissions', IMPORT_COST_OVERRIDE_PERMISSION)
      .send({
        chargeType: 'FREIGHT',
        sourceAmount: 100,
        sourceCurrency: 'USD',
        fxRate: 24.5,
        fxDate: '2026-04-29',
        counterparty: 'Forwarder',
        documentNumber: 'FR-1',
        costTreatment: 'INCLUDED_IN_COMMERCIAL_PRICE',
        estimated: false,
        final: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.charges[0].final).toBe(true);
    expect(res.body.charges[0].costTreatment).toBe('INCLUDED_IN_COMMERCIAL_PRICE');
  });

  it('updates a supplier invoice', async () => {
    const res = await request(app)
      .patch('/api/v1/import-management/supplier-invoices/d10cb4aa-59de-4ff6-94bf-4966f5e8c7b0')
      .set('x-test-user', 'buyer')
      .set('x-test-permissions', IMPORT_COST_OVERRIDE_PERMISSION)
      .send({
        invoiceNumber: 'INV-EDIT',
        supplierName: 'Edited Supplier',
        invoiceDate: '2026-04-29',
        invoiceGroup: 'TAXABLE',
        invoiceKind: 'MERCHANDISE',
        sourceAmount: 100,
        sourceCurrency: 'USD',
        fxRate: 24.5,
        fxDate: '2026-04-29',
      });
    expect(res.status).toBe(200);
    expect(res.body.supplierInvoices[0].invoiceNumber).toBe('INV-EDIT');
  });

  it('updates an invoice line', async () => {
    const res = await request(app)
      .patch('/api/v1/import-management/invoice-lines/8b8c4087-d5d6-4744-8843-20d7388c6175')
      .set('x-test-user', 'buyer')
      .set('x-test-permissions', IMPORT_COST_OVERRIDE_PERMISSION)
      .send({
        lineNumber: 1,
        itemCode: 'ITEM-1',
        description: 'Edited line',
        quantity: 2,
        unitOfMeasure: 'UNIT',
        sourceUnitCost: 50,
        sourceAmount: 100,
        sourceCurrency: 'USD',
        fxRate: 24.5,
        fxDate: '2026-04-29',
        taxable: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.supplierInvoices[0].lines[0].description).toBe('Edited line');
  });

  it('updates suggested-price review status', async () => {
    const res = await request(app)
      .patch('/api/v1/import-management/suggested-prices/df650972-c0bc-4e18-bc2a-b70c6af1e1c1/status')
      .send({ approvalStatus: 'APPROVED' });
    expect(res.status).toBe(200);
    expect(res.body.suggestedPrices[0].approvalStatus).toBe('APPROVED');
    expect(res.body.suggestedPrices[0].approvedBy).toBe('system');
  });

  it('requires product pricing permission to post suggested prices', async () => {
    const anonymous = await request(app)
      .patch('/api/v1/import-management/suggested-prices/df650972-c0bc-4e18-bc2a-b70c6af1e1c1/status')
      .send({ approvalStatus: 'POSTED' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');

    const forbidden = await request(app)
      .patch('/api/v1/import-management/suggested-prices/df650972-c0bc-4e18-bc2a-b70c6af1e1c1/status')
      .set('x-test-user', 'buyer')
      .send({ approvalStatus: 'POSTED' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.message).toContain('products.write');
  });

  it('marks suggested-price handoff posted with product pricing permission', async () => {
    const res = await request(app)
      .patch('/api/v1/import-management/suggested-prices/df650972-c0bc-4e18-bc2a-b70c6af1e1c1/status')
      .set('x-test-user', 'pricing')
      .set('x-test-permissions', 'products.write')
      .send({ approvalStatus: 'POSTED' });
    expect(res.status).toBe(200);
    expect(res.body.suggestedPrices[0].approvalStatus).toBe('POSTED');
  });

  it('validates suggested-price review status', async () => {
    const res = await request(app)
      .patch('/api/v1/import-management/suggested-prices/df650972-c0bc-4e18-bc2a-b70c6af1e1c1/status')
      .send({ approvalStatus: 'NEEDS_REVIEW' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
