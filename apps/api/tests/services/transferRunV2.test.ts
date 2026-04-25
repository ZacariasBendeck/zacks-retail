import { buildBalancingPreviewLinesV2 } from '../../src/services/transferRunV2/decisionPasses'
import type { BalancingFactsV2, WorkingCellStateV2, WorkingSkuStateV2 } from '../../src/services/transferRunV2/types'

function makeCell(overrides: Partial<WorkingCellStateV2>): WorkingCellStateV2 {
  return {
    skuId: 'sku-1',
    skuCode: 'SKU-1',
    storeId: 1,
    storeLabel: '1 - One',
    city: 'TEGUCIGALPA',
    region: 1,
    rowLabel: 'A',
    columnLabel: '7',
    onHand: 0,
    lastMovementAt: null,
    lastReceivedAt: null,
    inboundQty: 0,
    reservedQty: 0,
    modelQty: 1,
    maxQty: 3,
    reorderQty: 1,
    storeSoldUnits: 5,
    chainSoldUnits: 10,
    categoryCurveUnits: 10,
    forecastDailyQty: 0.5,
    confidence: 'HIGH',
    coreSize: true,
    eligibleReceiver: true,
    presentationFloorQty: 1,
    serviceFloorQty: 1,
    targetQty: 1,
    needQty: 1,
    donorProtectQty: 1,
    spareQty: 0,
    effectiveAvailableQty: 0,
    routeBucket: null,
    metric: {
      metricValue: 2,
      displayValue: 2,
      netSoldUnits: 5,
      beginningOnHand: 1,
      endingOnHand: 0,
    },
    ...overrides,
  }
}

function makeFacts(cells: WorkingCellStateV2[], cooldownDays = 14): BalancingFactsV2 {
  const byStore = new Map<number, Map<string, WorkingCellStateV2>>()
  const storeMetadata = new Map<number, { storeId: number; storeLabel: string; city: string | null; region: number | null; transferCapable: boolean }>()
  for (const cell of cells) {
    const storeCells = byStore.get(cell.storeId) ?? new Map<string, WorkingCellStateV2>()
    storeCells.set(`${cell.rowLabel}::${cell.columnLabel}`, cell)
    byStore.set(cell.storeId, storeCells)
    if (!storeMetadata.has(cell.storeId)) {
      storeMetadata.set(cell.storeId, {
        storeId: cell.storeId,
        storeLabel: cell.storeLabel,
        city: cell.city,
        region: cell.region,
        transferCapable: true,
      })
    }
  }

  const workingSku: WorkingSkuStateV2 = {
    sku: {
      id: 'sku-1',
      code: 'SKU-1',
      provisionalCode: 'SKU-1',
      descriptionRics: 'Test shoe',
      vendorId: 'V1',
      categoryNumber: 100,
      season: 'FA',
      styleColor: 'BLACK',
      groupCode: 'G1',
      keywords: null,
      currentCost: 50,
      retailPrice: 90,
      listPrice: 90,
      currentPriceSlot: 'RETAIL',
      perks: null,
      sizeType: 1,
    },
    stores: byStore,
  }

  return {
    input: {
      goalPreset: 'WEEKLY_BALANCE',
      balancingMethod: 'WITHOUT_CONSIDERING_MODELS',
      performanceMetric: 'ROI',
      salesPeriod: 'YEAR',
      tieBreakKind: 'ABSOLUTE',
      tieBreakValue: 0,
      transferDoublesToLowerPriority: false,
      inTransitPos: false,
      allowLowConfidenceMoves: false,
      cooldownDays,
      sortOrder: 'SKU',
      stripStoresBelowSizeCount: null,
      protectDaysOverride: null,
      criteria: {
        storeIds: [1, 2],
        vendorCodes: [],
        categoryMin: null,
        categoryMax: null,
        seasons: [],
        styleColors: [],
        skuCodes: [],
        groupCodes: [],
        keywords: [],
        limit: undefined,
        includeOriginalRetailOnly: false,
        includeMarkdownOnly: false,
        includePerksOnly: false,
      },
    },
    stores: [...storeMetadata.values()],
    skus: [workingSku.sku],
    workingBySku: new Map([['sku-1', workingSku]]),
    metricAggregates: new Map(),
    storeCellSales: new Map(),
    chainCellSales: new Map(),
    categoryCurveSales: new Map(),
    inTransitInbound: new Map(),
  }
}

describe('transferRunV2 decision passes', () => {
  it('rescues a zero core size before broader balancing', () => {
    const receiver = makeCell({
      storeId: 1,
      onHand: 0,
      effectiveAvailableQty: 0,
      needQty: 2,
      storeLabel: '1 - One',
      metric: { metricValue: 3, displayValue: 3, netSoldUnits: 6, beginningOnHand: 1, endingOnHand: 0 },
    })
    const donor = makeCell({
      storeId: 2,
      storeLabel: '2 - Two',
      onHand: 3,
      effectiveAvailableQty: 3,
      needQty: 0,
      spareQty: 2,
      donorProtectQty: 1,
      metric: { metricValue: 1, displayValue: 1, netSoldUnits: 2, beginningOnHand: 4, endingOnHand: 3 },
    })

    const result = buildBalancingPreviewLinesV2(makeFacts([receiver, donor]))

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]?.decisionContext.decisionPass).toBe('SERVICE_RESCUE')
    expect(result.lines[0]?.suggestedQuantity).toBe(1)
    expect(result.summary.passBreakdown).toEqual([
      expect.objectContaining({
        decisionPass: 'SERVICE_RESCUE',
        transferCount: 1,
        totalUnits: 1,
      }),
    ])
  })

  it('blocks recent-touch cells during cooldown', () => {
    const receiver = makeCell({
      storeId: 1,
      onHand: 0,
      effectiveAvailableQty: 0,
      needQty: 2,
      storeLabel: '1 - One',
    })
    const donor = makeCell({
      storeId: 2,
      storeLabel: '2 - Two',
      onHand: 3,
      effectiveAvailableQty: 3,
      needQty: 0,
      spareQty: 2,
      donorProtectQty: 1,
      lastMovementAt: new Date(),
    })

    const result = buildBalancingPreviewLinesV2(makeFacts([receiver, donor], 14))

    expect(result.lines).toHaveLength(0)
  })

  it('blocks cross-city balancing moves', () => {
    const receiver = makeCell({
      storeId: 1,
      storeLabel: '1 - One',
      city: 'TEGUCIGALPA',
      onHand: 0,
      effectiveAvailableQty: 0,
      needQty: 2,
      metric: { metricValue: 3, displayValue: 3, netSoldUnits: 6, beginningOnHand: 1, endingOnHand: 0 },
    })
    const donor = makeCell({
      storeId: 2,
      storeLabel: '2 - Two',
      city: 'SAN PEDRO SULA',
      onHand: 3,
      effectiveAvailableQty: 3,
      needQty: 0,
      spareQty: 2,
      donorProtectQty: 1,
      metric: { metricValue: 1, displayValue: 1, netSoldUnits: 2, beginningOnHand: 4, endingOnHand: 3 },
    })

    const result = buildBalancingPreviewLinesV2(makeFacts([receiver, donor]))

    expect(result.lines).toHaveLength(0)
    expect(result.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'BALANCING_CITY_LANE_RESTRICTION' }),
      ]),
    )
  })
})
