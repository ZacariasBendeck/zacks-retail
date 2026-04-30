import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PurchasePlanningPage from '../pages/purchasePlanning/PurchasePlanningPage'
import { useDepartments } from '../hooks/useProductsTaxonomy'
import { useStoreChains } from '../hooks/useStores'
import {
  addSavedPurchasePlanAdjustment,
  archiveSavedPurchasePlan,
  createSavedPurchasePlan,
  fetchSavedPurchasePlan,
  fetchSavedPurchasePlans,
  generateSeasonalPurchaseReport,
  recalculateSavedPurchasePlan,
  type SavedPurchasePlanDetail,
  type SavedPurchasePlanListItem,
  type SeasonalPurchaseReportResponse,
} from '../services/purchasePlanningApi'

vi.mock('../hooks/useStores', () => ({
  useStoreChains: vi.fn(),
}))

vi.mock('../hooks/useProductsTaxonomy', () => ({
  useDepartments: vi.fn(),
}))

vi.mock('../services/purchasePlanningApi', async () => {
  const actual = await vi.importActual<typeof import('../services/purchasePlanningApi')>('../services/purchasePlanningApi')
  return {
    ...actual,
    fetchSavedPurchasePlans: vi.fn(),
    fetchSavedPurchasePlan: vi.fn(),
    createSavedPurchasePlan: vi.fn(),
    addSavedPurchasePlanAdjustment: vi.fn(),
    recalculateSavedPurchasePlan: vi.fn(),
    archiveSavedPurchasePlan: vi.fn(),
    generateSeasonalPurchaseReport: vi.fn(),
  }
})

const planDetail: SavedPurchasePlanDetail = {
  plan: {
    id: 'plan-1',
    label: 'Summer 2026 All Stores',
    status: 'draft',
    storeGroupCode: 'all-stores',
    storeGroupLabel: 'All Stores',
    season: 'summer',
    seasonYear: 2026,
    seasonMonths: ['2026-05', '2026-06', '2026-07'],
    selectedDepartments: [10, 20],
    forecastMethod: 'holtWinters',
    eohMethod: 'forward',
    coverMonths: 3,
    discountNormalization: true,
    historyFromYearMonth: '2023-05',
    historyToYearMonth: '2026-04',
    createdBy: 'buyer',
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    archivedAt: null,
  },
  departments: [
    {
      departmentKey: '10',
      departmentNumber: 10,
      departmentLabel: '10 - Footwear',
      baselineTotalBuy: 100,
      currentTotalBuy: 120,
      deltaBuy: 20,
      totalProjSales: 210,
      currentOnHand: 40,
      currentOnOrder: 15,
      futureOnOrder: 5,
      nativeOpenPo: 10,
      hasHistory: true,
      months: [
        {
          id: 'row-1',
          planId: 'plan-1',
          departmentKey: '10',
          departmentNumber: 10,
          departmentLabel: '10 - Footwear',
          yearMonth: '2026-05',
          baselineBoh: 70,
          baselineProjSales: 60,
          baselineEohTarget: 50,
          baselineBuy: 40,
          baselineEohActual: 50,
          currentBoh: 70,
          currentProjSales: 60,
          currentEohTarget: 55,
          currentBuy: 45,
          currentEohActual: 55,
          onHand: 40,
          currentOnOrder: 15,
          futureOnOrder: 5,
          nativeOpenPo: 10,
          stockPosition: 70,
          normalizationFactor: 0.8,
          rawProjSales: 75,
        },
        {
          id: 'row-2',
          planId: 'plan-1',
          departmentKey: '10',
          departmentNumber: 10,
          departmentLabel: '10 - Footwear',
          yearMonth: '2026-06',
          baselineBoh: 55,
          baselineProjSales: 70,
          baselineEohTarget: 60,
          baselineBuy: 35,
          baselineEohActual: 60,
          currentBoh: 55,
          currentProjSales: 70,
          currentEohTarget: 65,
          currentBuy: 40,
          currentEohActual: 65,
          onHand: 0,
          currentOnOrder: 0,
          futureOnOrder: 0,
          nativeOpenPo: 0,
          stockPosition: 0,
          normalizationFactor: null,
          rawProjSales: null,
        },
      ],
    },
    {
      departmentKey: '20',
      departmentNumber: 20,
      departmentLabel: '20 - Apparel',
      baselineTotalBuy: 80,
      currentTotalBuy: 80,
      deltaBuy: 0,
      totalProjSales: 150,
      currentOnHand: 22,
      currentOnOrder: 0,
      futureOnOrder: 0,
      nativeOpenPo: 0,
      hasHistory: false,
      months: [],
    },
  ],
  adjustments: [],
  totals: {
    baselineTotalBuy: 180,
    currentTotalBuy: 200,
    deltaBuy: 20,
    totalProjSales: 360,
  },
}

const listItem: SavedPurchasePlanListItem = {
  ...planDetail.plan,
  departmentCount: 2,
  baselineTotalBuy: 180,
  currentTotalBuy: 200,
}

const seasonalReport: SeasonalPurchaseReportResponse = {
  storeGroupCode: 'all-stores',
  storeGroupLabel: 'All Stores',
  departmentNumber: 10,
  departmentLabel: '10 - Footwear',
  year: 2026,
  warnings: [],
  generatedAt: '2026-04-30T10:00:00.000Z',
  seasons: [
    {
      season: 'spring',
      seasonYear: 2026,
      seasonLabel: 'Spring 2026',
      months: ['2026-02', '2026-03', '2026-04'],
      planId: 'plan-spring',
      planLabel: 'Auto - All Stores Spring 2026',
      autoCreated: true,
      duplicateSourceCount: 1,
      projectedBoh: { units: 70, costHnl: 7000 },
      projectedSales: { units: 50, costHnl: 5000 },
      baselineBuy: { units: 80, costHnl: 8000 },
      draftPos: { units: 10, costHnl: 1000 },
      confirmedPos: { units: 20, costHnl: 2000 },
      openToBuy: { units: 50, costHnl: 5000 },
      projectedEoh: { units: 100, costHnl: 10000 },
    },
    {
      season: 'summer',
      seasonYear: 2026,
      seasonLabel: 'Summer 2026',
      months: ['2026-05', '2026-06', '2026-07'],
      planId: 'plan-1',
      planLabel: 'Summer 2026 All Stores',
      autoCreated: false,
      duplicateSourceCount: 1,
      projectedBoh: { units: 100, costHnl: 10000 },
      projectedSales: { units: 210, costHnl: 21000 },
      baselineBuy: { units: 120, costHnl: 12000 },
      draftPos: { units: 0, costHnl: 0 },
      confirmedPos: { units: 25, costHnl: 2500 },
      openToBuy: { units: 95, costHnl: 9500 },
      projectedEoh: { units: 10, costHnl: 1000 },
    },
  ],
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <ConfigProvider>
      <QueryClientProvider client={qc}>
        <PurchasePlanningPage />
      </QueryClientProvider>
    </ConfigProvider>,
  )
}

async function chooseSelectOption(label: string, option: string) {
  await userEvent.click(screen.getByLabelText(label))
  const dropdown = document.body
  await userEvent.click(await within(dropdown).findByTitle(option))
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('PurchasePlanningPage saved plans', () => {
  it('submits a chain department seasonal report request and shows the spreadsheet rows', async () => {
    vi.mocked(useStoreChains).mockReturnValue({
      data: [{ id: 'all-stores', label: 'All Stores', storeCount: 30, active: true }],
      isLoading: false,
    } as never)
    vi.mocked(useDepartments).mockReturnValue({
      data: [{ number: 10, description: 'Footwear' }],
      isLoading: false,
    } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([])
    vi.mocked(generateSeasonalPurchaseReport).mockResolvedValue(seasonalReport)

    renderPage()

    await chooseSelectOption('Report chain', 'All Stores (30)')
    await chooseSelectOption('Report department', '10 - Footwear')
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))

    await waitFor(() => expect(generateSeasonalPurchaseReport).toHaveBeenCalledTimes(1))
    expect(vi.mocked(generateSeasonalPurchaseReport).mock.calls[0]?.[0]).toMatchObject({
      storeGroupCode: 'all-stores',
      departmentNumber: 10,
      year: 2026,
      forecast: { method: 'holtWinters' },
      eohMethod: 'forward',
      coverMonths: 3,
      discountNormalization: true,
      createdBy: 'buyer',
    })
    expect(await screen.findByText('Projected BOH')).toBeInTheDocument()
    expect(screen.getByText('Open To Buy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Summer 2026 worksheet' })).toBeInTheDocument()
  })

  it('submits a chain and department saved-plan payload', async () => {
    vi.mocked(useStoreChains).mockReturnValue({
      data: [{ id: 'all-stores', label: 'All Stores', storeCount: 30, active: true }],
      isLoading: false,
    } as never)
    vi.mocked(useDepartments).mockReturnValue({
      data: [
        { number: 10, description: 'Footwear' },
        { number: 20, description: 'Apparel' },
      ],
      isLoading: false,
    } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(planDetail)
    vi.mocked(createSavedPurchasePlan).mockResolvedValue(planDetail)

    renderPage()

    await chooseSelectOption('Chain', 'All Stores (30)')
    await chooseSelectOption('Departments', '10 - Footwear')
    await chooseSelectOption('Departments', '20 - Apparel')
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    await waitFor(() => expect(createSavedPurchasePlan).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createSavedPurchasePlan).mock.calls[0]?.[0]).toMatchObject({
      storeGroupCode: 'all-stores',
      season: 'spring',
      departmentNumbers: [10, 20],
      forecast: { method: 'holtWinters' },
      eohMethod: 'forward',
      coverMonths: 3,
      discountNormalization: true,
      createdBy: 'buyer',
    })
  })

  it('shows department totals first and expands monthly detail', async () => {
    vi.mocked(useStoreChains).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(useDepartments).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(planDetail)

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Summer 2026 All Stores' }))

    expect(await screen.findByText('10 - Footwear')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recalculate' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Department' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Current buy' })).toBeInTheDocument()
    expect(screen.getByText('20 - Apparel')).toBeInTheDocument()
    expect(screen.getByText('no history')).toBeInTheDocument()

    const expandButtons = screen.getAllByRole('button', { name: /expand row/i })
    const expandButton = expandButtons[0]
    if (!expandButton) throw new Error('Expected an expandable department row')
    await userEvent.click(expandButton)

    expect(await screen.findByText('May 2026')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Norm' })).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('submits an audited department adjustment', async () => {
    vi.mocked(useStoreChains).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(useDepartments).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(planDetail)
    vi.mocked(addSavedPurchasePlanAdjustment).mockResolvedValue(planDetail)

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Summer 2026 All Stores' }))
    await screen.findByText('10 - Footwear')
    const adjustButtons = screen.getAllByRole('button', { name: 'Adjust' })
    const adjustButton = adjustButtons[0]
    if (!adjustButton) throw new Error('Expected an adjustment action')
    await userEvent.click(adjustButton)
    await userEvent.type(screen.getByLabelText('Reason'), 'Promo lift for launch window')
    await userEvent.click(screen.getByRole('button', { name: 'OK' }))

    await waitFor(() => expect(addSavedPurchasePlanAdjustment).toHaveBeenCalledTimes(1))
    expect(vi.mocked(addSavedPurchasePlanAdjustment).mock.calls[0]).toEqual([
      'plan-1',
      {
        departmentKey: '10',
        kind: 'absolute_total',
        value: 120,
        reason: 'Promo lift for launch window',
        appliedBy: 'buyer',
      },
    ])
    expect(archiveSavedPurchasePlan).not.toHaveBeenCalled()
    expect(recalculateSavedPurchasePlan).not.toHaveBeenCalled()
  })
})
