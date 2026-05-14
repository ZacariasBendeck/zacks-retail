import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BuyerPurchasePlanningPage from '../pages/purchasePlanning/BuyerPurchasePlanningPage'
import { useCategories, useCategoryBuyerOptions, useDepartments } from '../hooks/useProductsTaxonomy'
import { useStoreChains, useStores } from '../hooks/useStores'
import { fetchPurchaseOrders } from '../services/purchaseOrderApi'
import {
  bulkUpdateStoreCategoryCarrying,
  confirmBuyerSalesProjectionWorkbook,
  copyBuyerSeedModel,
  createBuyerWorkbook,
  ensureBuyerSalesProjectionWorkbook,
  fetchBuyerChecklistCategories,
  fetchBuyerWorkbook,
  fetchBuyerWorkbooks,
  fetchStoreCategoryCarrying,
  flagBuyerCarryoverUnavailable,
  markBuyerCategoriesNoBudget,
  markBuyerCategoryNoBudget,
  reopenBuyerCategoryBudget,
  updateBuyerCategoryCard,
  type BuyerWorkbookDetail,
} from '../services/buyerPurchasePlanningApi'
import {
  recalculateSavedPurchasePlan,
  updateSavedPurchasePlanRows,
  type SavedPurchasePlanDetail,
} from '../services/purchasePlanningApi'

vi.mock('../hooks/useStores', () => ({
  useStores: vi.fn(),
  useStoreChains: vi.fn(),
}))

vi.mock('../hooks/useProductsTaxonomy', () => ({
  useCategories: vi.fn(),
  useCategoryBuyerOptions: vi.fn(),
  useDepartments: vi.fn(),
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'buyer@example.com', displayName: 'Buyer', role: { id: 'role-1', name: 'Buyer' } },
    permissions: new Set(['purchasing.view']),
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('../services/purchaseOrderApi', () => ({
  fetchPurchaseOrders: vi.fn(),
}))

vi.mock('../services/buyerPurchasePlanningApi', async () => {
  const actual = await vi.importActual<typeof import('../services/buyerPurchasePlanningApi')>('../services/buyerPurchasePlanningApi')
  return {
    ...actual,
    addBuyerCarryoverLine: vi.fn(),
    addBuyerPlannedStyle: vi.fn(),
    bulkUpdateStoreCategoryCarrying: vi.fn(),
    confirmBuyerSalesProjectionWorkbook: vi.fn(),
    copyBuyerSeedModel: vi.fn(),
    createBuyerCarryoverModelLine: vi.fn(),
    createBuyerWorkbook: vi.fn(),
    ensureBuyerSalesProjectionWorkbook: vi.fn(),
    fetchBuyerChecklistCategories: vi.fn(),
    fetchBuyerWorkbook: vi.fn(),
    fetchBuyerWorkbooks: vi.fn(),
    fetchStoreCategoryCarrying: vi.fn(),
    flagBuyerCarryoverCandidateUnavailable: vi.fn(),
    flagBuyerCarryoverUnavailable: vi.fn(),
    linkBuyerPurchaseOrder: vi.fn(),
    markBuyerCategoriesNoBudget: vi.fn(),
    markBuyerCategoryNoBudget: vi.fn(),
    reopenBuyerCategoryBudget: vi.fn(),
    updateBuyerAttributePlan: vi.fn(),
    updateBuyerCategoryCard: vi.fn(),
    updateBuyerCarryoverCandidate: vi.fn(),
    updateBuyerCarryoverLine: vi.fn(),
    updateBuyerNewStyleTargets: vi.fn(),
  }
})

vi.mock('../services/purchasePlanningApi', async () => {
  const actual = await vi.importActual<typeof import('../services/purchasePlanningApi')>('../services/purchasePlanningApi')
  return {
    ...actual,
    recalculateSavedPurchasePlan: vi.fn(),
    updateSavedPurchasePlanRows: vi.fn(),
  }
})

const detail: BuyerWorkbookDetail = {
  workbook: {
    id: 'workbook-1',
    label: 'Fall/Winter 2026 Smoking',
    status: 'DRAFT',
    buyingSeason: 'FALL_WINTER',
    seasonYear: 2026,
    seasonMonths: ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'],
    seedStoreId: 20,
    targetStoreIds: [20, 21],
    buyer: 'buyer',
    createdBy: 'buyer',
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
    archivedAt: null,
  },
  cards: [
    {
      id: 'card-1',
      workbookId: 'workbook-1',
      departmentNumber: 1,
      departmentLabel: '1 - Menswear',
      categoryNumber: 11,
      categoryLabel: '11 - Traje Smoking Hombre',
      status: 'NOT_STARTED',
      seedStoreId: 20,
      targetStoreIds: [20, 21],
      suggestedNewSkuCount: 4,
      suggestedCarryoverSkuCount: 11,
      targetNewSkuCount: 4,
      targetCarryoverSkuCount: 11,
      replacementStyleTargetCount: 0,
      additionalNewStyleTargetCount: 4,
      totalNewStyleTargetCount: 4,
      history: {
        summary: {
          suggestedNewSkuCount: 4,
          suggestedCarryoverSkuCount: 11,
          sampleMonths: 6,
          totalQuantitySold: 440,
          totalNetSales: 948496,
          averageBeginningOnHand: 96,
        },
        months: [
          {
            yearMonth: '2025-08',
            quantitySold: 30,
            netSales: 61496,
            profit: 45814,
            beginningOnHand: 60,
            inventoryValue: 10000,
            roiPct: 74.5,
            turns: 3.22,
            newSkuDistinctCount: 0,
            carryoverSkuDistinctCount: 12,
            newSkuUnitsSold: 0,
            carryoverSkuUnitsSold: 30,
            sellThroughPct: null,
          },
        ],
      },
      salesProjection: {
        months: [
          { yearMonth: '2025-08', projectedUnits: 30, projectedSales: 61496 },
        ],
        totalProjectedUnits: 30,
        totalProjectedSales: 61496,
        updatedBy: 'buyer',
        updatedAt: '2026-05-07T00:00:00.000Z',
      },
      salesProjectionPlanId: null,
      attributeMix: [
        {
          dimensionCode: 'color_family',
          dimensionLabel: 'Color Family',
          totalUnitsSold: 30,
          totalNetSales: 61496,
          totalProfit: 45814,
          values: [
            {
              valueCode: 'black',
              valueLabel: 'Black',
              unitsSold: 30,
              netSales: 61496,
              profit: 45814,
              salesPct: 100,
              roiPct: 74.5,
              sellThroughPct: null,
              skuCount: 12,
            },
          ],
        },
      ],
      notes: null,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    },
  ],
  storePlans: [],
  carryoverCandidates: [
    {
      id: 'candidate-1',
      workbookId: 'workbook-1',
      cardId: 'card-1',
      storeId: 20,
      categoryNumber: 11,
      skuId: null,
      skuCode: 'TUX001',
      skuDescription: 'Black tuxedo',
      color: 'Black',
      metrics: {
        unitsSold: 30,
        netSales: 61496,
        profit: 45814,
        grossProfitPct: 74.5,
        inventoryValue: 10000,
        roiPct: 458.1,
        turns: 3.22,
        currentOnHand: 12,
        currentOnOrder: 0,
        futureOnOrder: 0,
        sellThroughPct: null,
      },
      decision: 'UNREVIEWED',
      availability: 'UNKNOWN',
      unavailableReason: null,
      carryoverLineId: 'carry-1',
      replacementStyleId: null,
      notes: null,
      reviewedBy: null,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    },
  ],
  carryovers: [
    {
      id: 'carry-1',
      workbookId: 'workbook-1',
      cardId: 'card-1',
      storeId: 20,
      skuId: null,
      skuCode: 'TUX001',
      skuDescription: 'Black tuxedo',
      color: 'Black',
      sizeCells: [],
      totalQuantity: 12,
      source: 'SEED',
      unavailable: false,
      unavailableReason: null,
      replacementStyleId: null,
      carryoverCandidateId: 'candidate-1',
      notes: null,
    },
  ],
  plannedStyles: [
    {
      id: 'style-1',
      workbookId: 'workbook-1',
      cardId: 'card-1',
      replacementForCarryoverLineId: null,
      replacementForCarryoverCandidateId: null,
      vendorCode: 'VEN',
      vendorName: 'Vendor',
      workingStyle: 'New tuxedo',
      description: 'Slim fit',
      color: 'Black',
      colorFamily: 'Black',
      attributes: {},
      quotedUnitCost: 20,
      targetNewSkuCount: 1,
      targetUnits: 24,
      status: 'PLANNED',
      linkedSkuId: null,
      linkedSkuCode: null,
      notes: null,
    },
  ],
  attributePlans: [],
  poLinks: [],
}

const projectionMonths = [
  '2026-05', '2026-06', '2026-07',
  '2026-08', '2026-09', '2026-10',
  '2026-11', '2026-12', '2027-01',
  '2027-02', '2027-03', '2027-04',
  '2027-05', '2027-06', '2027-07',
]

const salesProjectionPlan: SavedPurchasePlanDetail = {
  plan: {
    id: 'plan-1',
    label: 'Enterprise-wide 11 - Traje Smoking Hombre Summer 2026 to Summer 2027',
    status: 'draft',
    planningScope: 'enterprise',
    planningDimension: 'category',
    planningScopeLabel: 'Enterprise-wide',
    storeGroupCode: 'enterprise',
    storeGroupLabel: 'Enterprise-wide',
    season: 'summer',
    seasonYear: 2026,
    seasonMonths: projectionMonths,
    selectedDepartments: [1],
    selectedCategories: [11],
    forecastMethod: 'holtWinters',
    eohMethod: 'forward',
    coverMonths: 3,
    discountNormalization: true,
    historyFromYearMonth: '2023-05',
    historyToYearMonth: '2026-04',
    createdBy: 'buyer',
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
    archivedAt: null,
  },
  departments: [
    {
      departmentKey: '11',
      departmentNumber: null,
      departmentLabel: '11 - Traje Smoking Hombre',
      baselineTotalBuy: 100,
      currentTotalBuy: 100,
      deltaBuy: 0,
      totalProjSales: 90,
      currentOnHand: 60,
      currentOnOrder: 0,
      futureOnOrder: 0,
      nativeOpenPo: 0,
      hasHistory: true,
      months: projectionMonths.map((yearMonth, index) => ({
        id: `projection-row-${index + 1}`,
        planId: 'plan-1',
        departmentKey: '11',
        departmentNumber: null,
        departmentLabel: '11 - Traje Smoking Hombre',
        yearMonth,
        baselineBoh: 60,
        baselineProjSales: 6,
        baselineEohTarget: 55,
        baselineBuy: 1,
        baselineEohActual: 55,
        currentBoh: 60,
        currentProjSales: 6,
        currentEohTarget: 55,
        currentBuy: 1,
        currentEohActual: 55,
        onHand: 60,
        currentOnOrder: 0,
        futureOnOrder: 0,
        nativeOpenPo: 0,
        stockPosition: 60,
        normalizationFactor: 1,
        rawProjSales: 6,
      })),
    },
  ],
  adjustments: [],
  totals: {
    baselineTotalBuy: 100,
    currentTotalBuy: 100,
    deltaBuy: 0,
    totalProjSales: 90,
  },
}

function renderPage(initialEntries = ['/purchase-planning/buyer-checklist']) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <ConfigProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/purchase-planning/buyer-checklist" element={<BuyerPurchasePlanningPage />} />
            <Route path="/purchase-planning/buyer-checklist/workbooks/:workbookId/cards/:cardId" element={<BuyerPurchasePlanningPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ConfigProvider>,
  )
}

async function openCategory() {
  renderPage(['/purchase-planning/buyer-checklist/workbooks/workbook-1/cards/card-1'])
  await screen.findByRole('tab', { name: 'Sales Projection' })
  await screen.findByLabelText('Worksheet grid')
}

async function chooseSelectOption(label: string, option: string) {
  await userEvent.click(screen.getByLabelText(label))
  await userEvent.click(await within(document.body).findByTitle(option))
}

afterEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('BuyerPurchasePlanningPage', () => {
  beforeEach(() => {
    vi.mocked(useStores).mockReturnValue({
      data: [
        { id: 20, code: '020', name: 'Store 20', active: true, chainId: 'chain-a', chainLabel: 'Chain A' },
        { id: 21, code: '021', name: 'Store 21', active: true, chainId: 'chain-a', chainLabel: 'Chain A' },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useStoreChains).mockReturnValue({
      data: [{ id: 'chain-a', label: 'Chain A', active: true, sortOrder: 1, storeNumbers: [20, 21], storeCount: 2 }],
      isLoading: false,
    } as never)
    vi.mocked(useCategories).mockReturnValue({
      data: [{ number: 11, description: 'Traje Smoking Hombre', dateLastChanged: null, skuCount: 15, productFamilyCode: null, productFamilyLabelEs: null }],
      isLoading: false,
    } as never)
    vi.mocked(useDepartments).mockReturnValue({
      data: [{ number: 1, description: 'Menswear', begCateg: 1, endCateg: 99, dateLastChanged: null, skuCount: 100 }],
      isLoading: false,
    } as never)
    vi.mocked(useCategoryBuyerOptions).mockReturnValue({
      data: [{ valueId: 1, code: 'buyer', labelEs: 'Buyer', isActive: true, sortOrder: 1 }],
      isLoading: false,
    } as never)
    window.localStorage.setItem('buyer-checklist:last-buyer:user-1', 'buyer')
    vi.mocked(fetchBuyerWorkbooks).mockResolvedValue([
      {
        ...detail.workbook,
        cardCount: 1,
        completeCount: 0,
      },
    ])
    vi.mocked(fetchBuyerChecklistCategories).mockResolvedValue([
      {
        buyerCode: 'buyer',
        buyerLabel: 'Buyer',
        categoryNumber: 11,
        categoryLabel: '11 - Traje Smoking Hombre',
        departmentNumber: 1,
        departmentLabel: '1 - Menswear',
        last12MonthsSales: 948496,
        last12MonthsUnits: 440,
        currentInventoryUnits: 123,
        currentInventoryValue: 10000,
        departmentOtbUnits: 250,
        currentSeason: {
          buyingSeason: 'FALL_WINTER',
          seasonYear: 2026,
          workbookId: 'workbook-1',
          cardId: 'card-1',
          status: 'NOT_STARTED',
          updatedAt: '2026-05-07T00:00:00.000Z',
          noBudgetId: null,
          noBudgetNote: null,
          noBudgetMarkedBy: null,
          noBudgetMarkedAt: null,
        },
        nextSeason: {
          buyingSeason: 'SPRING_SUMMER',
          seasonYear: 2027,
          workbookId: null,
          cardId: null,
          status: null,
          updatedAt: null,
          noBudgetId: null,
          noBudgetNote: null,
          noBudgetMarkedBy: null,
          noBudgetMarkedAt: null,
        },
        followingSeason: {
          buyingSeason: 'FALL_WINTER',
          seasonYear: 2027,
          workbookId: null,
          cardId: null,
          status: null,
          updatedAt: null,
          noBudgetId: null,
          noBudgetNote: null,
          noBudgetMarkedBy: null,
          noBudgetMarkedAt: null,
        },
        action: 'CONTINUE',
      },
    ])
    vi.mocked(fetchBuyerWorkbook).mockResolvedValue(detail)
    vi.mocked(ensureBuyerSalesProjectionWorkbook).mockResolvedValue({ plan: salesProjectionPlan, buyerWorkbook: detail })
    vi.mocked(fetchStoreCategoryCarrying).mockResolvedValue([])
    vi.mocked(fetchPurchaseOrders).mockResolvedValue({
      data: [
        {
          id: 'po-1',
          poNumber: 'PO-100',
          vendorId: 'VEN',
          vendorName: 'Vendor',
          status: 'DRAFT',
          createdAt: '2026-05-07T00:00:00.000Z',
          updatedAt: '2026-05-07T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    } as never)
    vi.mocked(createBuyerWorkbook).mockResolvedValue(detail)
    vi.mocked(confirmBuyerSalesProjectionWorkbook).mockResolvedValue({
      ...detail,
      cards: [
        {
          ...detail.cards[0]!,
          status: 'HISTORY_REVIEWED',
          salesProjectionPlanId: 'plan-1',
          salesProjection: {
            ...detail.cards[0]!.salesProjection,
            updatedBy: 'buyer',
            updatedAt: '2026-05-07T01:00:00.000Z',
          },
        },
      ],
    })
    vi.mocked(updateSavedPurchasePlanRows).mockResolvedValue(salesProjectionPlan)
    vi.mocked(recalculateSavedPurchasePlan).mockResolvedValue(salesProjectionPlan)
    vi.mocked(updateBuyerCategoryCard).mockResolvedValue(detail)
    vi.mocked(copyBuyerSeedModel).mockResolvedValue(detail)
    vi.mocked(flagBuyerCarryoverUnavailable).mockResolvedValue(detail)
    vi.mocked(markBuyerCategoryNoBudget).mockResolvedValue({
      categoryNumber: 11,
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
      status: 'NO_BUDGET',
      noBudgetId: 'no-budget-1',
    })
    vi.mocked(markBuyerCategoriesNoBudget).mockResolvedValue([{
      categoryNumber: 11,
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
      status: 'NO_BUDGET',
      noBudgetId: 'no-budget-1',
    }])
    vi.mocked(reopenBuyerCategoryBudget).mockResolvedValue({
      categoryNumber: 11,
      buyingSeason: 'FALL_WINTER',
      seasonYear: 2026,
      status: 'REOPENED',
      noBudgetId: null,
    })
    vi.mocked(bulkUpdateStoreCategoryCarrying).mockResolvedValue([])
  })

  it('loads history from the store/category starting point', async () => {
    vi.mocked(fetchBuyerChecklistCategories).mockResolvedValueOnce([
      {
        buyerCode: 'buyer',
        buyerLabel: 'Buyer',
        categoryNumber: 11,
        categoryLabel: '11 - Traje Smoking Hombre',
        departmentNumber: 1,
        departmentLabel: '1 - Menswear',
        last12MonthsSales: 948496,
        last12MonthsUnits: 440,
        currentInventoryUnits: 123,
        currentInventoryValue: 10000,
        departmentOtbUnits: 250,
        currentSeason: {
          buyingSeason: 'FALL_WINTER',
          seasonYear: 2026,
          workbookId: null,
          cardId: null,
          status: null,
          updatedAt: null,
          noBudgetId: null,
          noBudgetNote: null,
          noBudgetMarkedBy: null,
          noBudgetMarkedAt: null,
        },
        nextSeason: {
          buyingSeason: 'SPRING_SUMMER',
          seasonYear: 2027,
          workbookId: null,
          cardId: null,
          status: null,
          updatedAt: null,
          noBudgetId: null,
          noBudgetNote: null,
          noBudgetMarkedBy: null,
          noBudgetMarkedAt: null,
        },
        followingSeason: {
          buyingSeason: 'FALL_WINTER',
          seasonYear: 2027,
          workbookId: null,
          cardId: null,
          status: null,
          updatedAt: null,
          noBudgetId: null,
          noBudgetNote: null,
          noBudgetMarkedBy: null,
          noBudgetMarkedAt: null,
        },
        action: 'START_REVIEW',
      },
    ])
    renderPage()

    expect(fetchBuyerChecklistCategories).not.toHaveBeenCalled()
    expect(fetchBuyerWorkbooks).not.toHaveBeenCalled()
    expect(fetchBuyerWorkbook).not.toHaveBeenCalled()
    expect(fetchPurchaseOrders).not.toHaveBeenCalled()
    expect(screen.getByText('Buyer (buyer)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Load Checklist/i }))
    await userEvent.click(await screen.findByRole('button', { name: /Start Review/i }))

    await waitFor(() => expect(createBuyerWorkbook).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createBuyerWorkbook).mock.calls[0]?.[0]).toMatchObject({
      buyingSeason: 'FALL_WINTER',
      seedStoreId: 20,
      categoryNumbers: [11],
      buyer: 'buyer',
    })
    expect(await screen.findByRole('tab', { name: 'Sales Projection' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Worksheet grid')).toBeInTheDocument()
    expect(ensureBuyerSalesProjectionWorkbook).toHaveBeenCalledWith('workbook-1', 'card-1', 'buyer')
  }, 15_000)

  it('marks a landing category no-budget and can show and reopen it', async () => {
    const regularRow = {
      buyerCode: 'buyer',
      buyerLabel: 'Buyer',
      categoryNumber: 11,
      categoryLabel: '11 - Traje Smoking Hombre',
      departmentNumber: 1,
      departmentLabel: '1 - Menswear',
      last12MonthsSales: 948496,
      last12MonthsUnits: 440,
      currentInventoryUnits: 123,
      currentInventoryValue: 10000,
      departmentOtbUnits: 250,
      currentSeason: {
        buyingSeason: 'FALL_WINTER' as const,
        seasonYear: 2026,
        workbookId: 'workbook-1',
        cardId: 'card-1',
        status: 'NOT_STARTED' as const,
        updatedAt: '2026-05-07T00:00:00.000Z',
        noBudgetId: null,
        noBudgetNote: null,
        noBudgetMarkedBy: null,
        noBudgetMarkedAt: null,
      },
      nextSeason: {
        buyingSeason: 'SPRING_SUMMER' as const,
        seasonYear: 2027,
        workbookId: null,
        cardId: null,
        status: null,
        updatedAt: null,
        noBudgetId: null,
        noBudgetNote: null,
        noBudgetMarkedBy: null,
        noBudgetMarkedAt: null,
      },
      followingSeason: {
        buyingSeason: 'FALL_WINTER' as const,
        seasonYear: 2027,
        workbookId: null,
        cardId: null,
        status: null,
        updatedAt: null,
        noBudgetId: null,
        noBudgetNote: null,
        noBudgetMarkedBy: null,
        noBudgetMarkedAt: null,
      },
      action: 'CONTINUE' as const,
    }
    const noBudgetRow = {
      ...regularRow,
      currentSeason: {
        ...regularRow.currentSeason,
        status: 'NO_BUDGET' as const,
        noBudgetId: 'no-budget-1',
        noBudgetMarkedBy: 'buyer',
        noBudgetMarkedAt: '2026-05-07T00:00:00.000Z',
      },
      action: 'NO_BUDGET' as const,
    }
    let hiddenByDefault = false
    vi.mocked(fetchBuyerChecklistCategories).mockImplementation(async (params = {}) => {
      if (params.includeNoBudget) return [noBudgetRow]
      return hiddenByDefault ? [] : [regularRow]
    })
    vi.mocked(markBuyerCategoryNoBudget).mockImplementation(async () => {
      hiddenByDefault = true
      return {
        categoryNumber: 11,
        buyingSeason: 'FALL_WINTER',
        seasonYear: 2026,
        status: 'NO_BUDGET',
        noBudgetId: 'no-budget-1',
      }
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Load Checklist/i }))
    await screen.findByText('11 - Traje Smoking Hombre')
    await userEvent.click(screen.getByRole('button', { name: /^No Budget$/i }))
    const confirmButtons = await screen.findAllByRole('button', { name: /^No Budget$/i })
    await userEvent.click(confirmButtons[confirmButtons.length - 1]!)

    await waitFor(() => expect(markBuyerCategoryNoBudget).toHaveBeenCalledWith(expect.objectContaining({
      categoryNumber: 11,
      buyingSeason: 'FALL_WINTER',
      actor: 'buyer',
    })))
    await waitFor(() => expect(screen.queryByText('11 - Traje Smoking Hombre')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('switch', { name: /Show No Budget/i }))
    await screen.findByRole('button', { name: /Reopen/i })
    await userEvent.click(screen.getByRole('button', { name: /Reopen/i }))

    await waitFor(() => expect(reopenBuyerCategoryBudget).toHaveBeenCalledWith(expect.objectContaining({
      categoryNumber: 11,
      buyingSeason: 'FALL_WINTER',
      actor: 'buyer',
    })))
  }, 15_000)

  it('marks selected landing categories no-budget in one action', async () => {
    const { container } = renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Load Checklist/i }))
    await screen.findByText('11 - Traje Smoking Hombre')
    const rowCheckbox = container.querySelector('.ant-table-tbody .ant-checkbox-input')
    expect(rowCheckbox).toBeTruthy()
    fireEvent.click(rowCheckbox as HTMLElement)
    await userEvent.click(screen.getByRole('button', { name: /No Budget Selected/i }))
    const confirmButtons = await screen.findAllByRole('button', { name: /^No Budget$/i })
    await userEvent.click(confirmButtons[confirmButtons.length - 1]!)

    await waitFor(() => expect(markBuyerCategoriesNoBudget).toHaveBeenCalledWith(expect.objectContaining({
      categoryNumbers: [11],
      buyingSeason: 'FALL_WINTER',
      actor: 'buyer',
    })))
    await waitFor(() => expect(screen.queryByText('11 - Traje Smoking Hombre')).not.toBeInTheDocument())
  }, 15_000)

  it('renders the full-page category review and marks a category complete', async () => {
    await openCategory()
    expect(screen.getByRole('tab', { name: 'Sales Projection' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Confirm sales projection' })).toBeInTheDocument()
    expect(screen.getByLabelText('May 2026 projected sales')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('May 2026 projected sales'))
    await userEvent.type(screen.getByLabelText('May 2026 projected sales'), '8')
    await userEvent.click(screen.getByRole('button', { name: 'Save worksheet' }))

    await waitFor(() => expect(updateSavedPurchasePlanRows).toHaveBeenCalledWith('plan-1', expect.objectContaining({
      rows: [expect.objectContaining({ rowId: 'projection-row-1', currentProjSales: 8 })],
      appliedBy: 'buyer',
    })))
    await waitFor(() => expect(confirmBuyerSalesProjectionWorkbook).toHaveBeenCalledWith('workbook-1', 'card-1', 'buyer'))

    await userEvent.click(screen.getByRole('tab', { name: 'Attribute Plan' }))
    expect(screen.getByRole('button', { name: /Save Attribute Plan/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Carryover Review' }))
    expect(screen.getByText('Carryover Winner Review')).toBeInTheDocument()
    expect(screen.getByText('Carryover Model')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Mark Category Complete/i }))

    await waitFor(() => expect(updateBuyerCategoryCard).toHaveBeenCalledWith(
      'workbook-1',
      'card-1',
      expect.objectContaining({ status: 'COMPLETE', actor: 'buyer' }),
    ))
  }, 15_000)

  it('copies the seed model to target stores', async () => {
    await openCategory()
    await userEvent.click(screen.getByRole('tab', { name: 'Carryover Review' }))
    await screen.findByText('Carryover Model')

    await userEvent.click(screen.getByRole('button', { name: /Copy Exact Model/i }))

    await waitFor(() => expect(copyBuyerSeedModel).toHaveBeenCalledWith(
      'workbook-1',
      'card-1',
      expect.objectContaining({ targetStoreIds: [21], actor: 'buyer' }),
    ))
  }, 15_000)

  it('applies stock/model carrying suggestions to the matrix', async () => {
    vi.mocked(fetchStoreCategoryCarrying).mockResolvedValue([
      {
        storeId: 20,
        storeLabel: '20 - Store 20',
        categoryNumber: 11,
        categoryLabel: '11 - Traje Smoking Hombre',
        carries: false,
        suggestedCarries: true,
        stockSkuCount: 2,
        stockUnits: 12,
        modelSkuCount: 0,
        modelUnits: 0,
        source: 'SEED',
        chainCode: null,
        note: null,
        updatedBy: 'system',
        updatedAt: '2026-05-07T00:00:00.000Z',
      },
      {
        storeId: 21,
        storeLabel: '21 - Store 21',
        categoryNumber: 11,
        categoryLabel: '11 - Traje Smoking Hombre',
        carries: false,
        suggestedCarries: false,
        stockSkuCount: 0,
        stockUnits: 0,
        modelSkuCount: 0,
        modelUnits: 0,
        source: 'SEED',
        chainCode: null,
        note: null,
        updatedBy: 'system',
        updatedAt: '2026-05-07T00:00:00.000Z',
      },
    ])
    vi.mocked(bulkUpdateStoreCategoryCarrying).mockResolvedValue([
      {
        storeId: 20,
        storeLabel: '20 - Store 20',
        categoryNumber: 11,
        categoryLabel: '11 - Traje Smoking Hombre',
        carries: true,
        suggestedCarries: true,
        stockSkuCount: 2,
        stockUnits: 12,
        modelSkuCount: 0,
        modelUnits: 0,
        source: 'MANUAL',
        chainCode: null,
        note: '12 stock units',
        updatedBy: 'buyer',
        updatedAt: '2026-05-07T00:00:00.000Z',
      },
    ])
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Load Checklist/i }))
    await userEvent.click(await screen.findByRole('button', { name: /Manual Review Setup/i }))
    await chooseSelectOption('Category', '11 - Traje Smoking Hombre')
    await screen.findByText('12 stock')
    await userEvent.click(screen.getByRole('button', { name: /Apply Suggested Stores/i }))

    await waitFor(() => expect(bulkUpdateStoreCategoryCarrying).toHaveBeenCalled())
    expect(vi.mocked(bulkUpdateStoreCategoryCarrying).mock.calls[0]?.[0]).toMatchObject({
      categoryNumber: 11,
      storeIds: [20, 21],
      carries: false,
      exceptions: [
        expect.objectContaining({ storeId: 20, carries: true, note: '12 stock units' }),
      ],
      updatedBy: 'buyer',
    })
  }, 15_000)

  it('flags a carryover unavailable and sends the replacement reason', async () => {
    await openCategory()
    await userEvent.click(screen.getByRole('tab', { name: 'Carryover Review' }))
    await screen.findByText('Carryover Model')

    const unavailableButtons = screen.getAllByRole('button', { name: /Unavailable/i })
    const unavailableButton = unavailableButtons[unavailableButtons.length - 1]
    expect(unavailableButton).toBeDefined()
    await userEvent.click(unavailableButton!)
    fireEvent.change(screen.getByPlaceholderText(/Fabric unavailable/i), { target: { value: 'Fabric discontinued' } })
    await userEvent.click(screen.getByRole('button', { name: /Create Replacement/i }))

    await waitFor(() => expect(flagBuyerCarryoverUnavailable).toHaveBeenCalledWith(
      'workbook-1',
      'carry-1',
      expect.objectContaining({ reason: 'Fabric discontinued', actor: 'buyer' }),
    ))
  }, 15_000)
})
