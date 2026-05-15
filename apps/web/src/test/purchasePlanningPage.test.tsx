import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PurchasePlanningPage from '../pages/purchasePlanning/PurchasePlanningPage'
import { useDepartments } from '../hooks/useProductsTaxonomy'
import {
  addSavedPurchasePlanAdjustment,
  archiveSavedPurchasePlan,
  fetchSavedPurchasePlan,
  fetchSavedPurchasePlans,
  generateSeasonalPurchaseReport,
  recalculateSavedPurchasePlan,
  updateSavedPurchasePlanRows,
  type SavedPurchasePlanDetail,
  type SavedPurchasePlanListItem,
  type SeasonalPurchaseReportResponse,
} from '../services/purchasePlanningApi'

vi.mock('../hooks/useProductsTaxonomy', () => ({
  useDepartments: vi.fn(),
}))

vi.mock('../services/purchasePlanningApi', async () => {
  const actual = await vi.importActual<typeof import('../services/purchasePlanningApi')>('../services/purchasePlanningApi')
  return {
    ...actual,
    fetchSavedPurchasePlans: vi.fn(),
    fetchSavedPurchasePlan: vi.fn(),
    addSavedPurchasePlanAdjustment: vi.fn(),
    updateSavedPurchasePlanRows: vi.fn(),
    recalculateSavedPurchasePlan: vi.fn(),
    archiveSavedPurchasePlan: vi.fn(),
    generateSeasonalPurchaseReport: vi.fn(),
  }
})

const planDetail: SavedPurchasePlanDetail = {
  plan: {
    id: 'plan-1',
    label: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027',
    status: 'draft',
    planningScope: 'enterprise',
    planningDimension: 'department',
    planningScopeLabel: 'Enterprise-wide',
    storeGroupCode: 'enterprise',
    storeGroupLabel: 'Enterprise-wide',
    season: 'summer',
    seasonYear: 2026,
    seasonMonths: [
      '2026-05', '2026-06', '2026-07',
      '2026-08', '2026-09', '2026-10',
      '2026-11', '2026-12', '2027-01',
      '2027-02', '2027-03', '2027-04',
      '2027-05', '2027-06', '2027-07',
    ],
    selectedDepartments: [10],
    selectedCategories: [],
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
          lastYearSalesUnits: 50,
          lastYearBeginningOnHand: 100,
          lastYearNextMonthBeginningOnHand: 200,
          yearBeforeLastSalesUnits: 40,
          yearBeforeLastBeginningOnHand: 90,
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
          lastYearSalesUnits: 100,
          lastYearBeginningOnHand: 100,
          lastYearNextMonthBeginningOnHand: 250,
          yearBeforeLastSalesUnits: 120,
          yearBeforeLastBeginningOnHand: 130,
        },
        ...[
          '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
          '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07',
        ].map((yearMonth, index) => ({
          id: `row-${index + 3}`,
          planId: 'plan-1',
          departmentKey: '10',
          departmentNumber: 10,
          departmentLabel: '10 - Footwear',
          yearMonth,
          baselineBoh: 65,
          baselineProjSales: 50,
          baselineEohTarget: 55,
          baselineBuy: 40,
          baselineEohActual: 55,
          currentBoh: 65,
          currentProjSales: 50,
          currentEohTarget: 55,
          currentBuy: 40,
          currentEohActual: 55,
          onHand: 0,
          currentOnOrder: 0,
          futureOnOrder: 0,
          nativeOpenPo: 0,
          stockPosition: 0,
          normalizationFactor: null,
          rawProjSales: null,
          lastYearSalesUnits: null,
          lastYearBeginningOnHand: null,
          lastYearNextMonthBeginningOnHand: null,
          yearBeforeLastSalesUnits: null,
          yearBeforeLastBeginningOnHand: null,
        })),
      ],
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
  departmentCount: 1,
  baselineTotalBuy: 180,
  currentTotalBuy: 200,
}

const footwearDepartment = planDetail.departments[0]!

const twoMonthPlanDetail: SavedPurchasePlanDetail = {
  ...planDetail,
  plan: {
    ...planDetail.plan,
    seasonMonths: ['2026-05', '2026-06'],
  },
  departments: [
    {
      ...footwearDepartment,
      baselineTotalBuy: 75,
      currentTotalBuy: 125,
      deltaBuy: 50,
      totalProjSales: 130,
      months: [
        footwearDepartment.months[0]!,
        {
          ...footwearDepartment.months[1]!,
          currentBuy: 80,
          currentEohActual: 65,
        },
      ],
    },
  ],
  totals: {
    baselineTotalBuy: 75,
    currentTotalBuy: 125,
    deltaBuy: 50,
    totalProjSales: 130,
  },
}

const seasonalReport: SeasonalPurchaseReportResponse = {
  planningScope: 'enterprise',
  planningScopeLabel: 'Enterprise-wide',
  storeGroupCode: 'enterprise',
  storeGroupLabel: 'Enterprise-wide',
  storeGroupCodes: ['enterprise'],
  storeGroupLabels: ['Enterprise-wide'],
  warehouseStoreNumbers: [99],
  departmentNumber: 10,
  departmentLabel: '10 - Footwear',
  year: 2026,
  asOfYearMonth: '2026-05',
  startSeason: 'summer',
  startSeasonYear: 2026,
  endSeason: 'summer',
  endSeasonYear: 2027,
  projectionMonths: planDetail.plan.seasonMonths,
  workbook: {
    storeGroupCode: 'enterprise',
    storeGroupLabel: 'Enterprise-wide',
    planId: 'plan-1',
    planLabel: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027',
    autoCreated: true,
    duplicateSourceCount: 1,
  },
  warnings: [],
  generatedAt: '2026-04-30T10:00:00.000Z',
  seasons: [
    {
      season: 'summer',
      seasonYear: 2026,
      seasonLabel: 'Summer 2026',
      months: ['2026-05', '2026-06', '2026-07'],
      planId: 'plan-1',
      planLabel: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027',
      autoCreated: true,
      duplicateSourceCount: 1,
      worksheets: [],
      projectedBoh: { units: 100, costHnl: 10000 },
      projectedSales: { units: 210, costHnl: 21000 },
      baselineBuy: { units: 120, costHnl: 12000 },
      draftPos: { units: 0, costHnl: 0 },
      confirmedPos: { units: 25, costHnl: 2500 },
      openToBuy: { units: 95, costHnl: 9500 },
      projectedEoh: { units: 10, costHnl: 1000 },
    },
    {
      season: 'fall',
      seasonYear: 2026,
      seasonLabel: 'Fall 2026',
      months: ['2026-08', '2026-09', '2026-10'],
      planId: 'plan-1',
      planLabel: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027',
      autoCreated: true,
      duplicateSourceCount: 1,
      worksheets: [],
      projectedBoh: { units: 10, costHnl: 1000 },
      projectedSales: { units: 150, costHnl: 15000 },
      baselineBuy: { units: 120, costHnl: 12000 },
      draftPos: { units: 0, costHnl: 0 },
      confirmedPos: { units: 0, costHnl: 0 },
      openToBuy: { units: 120, costHnl: 12000 },
      projectedEoh: { units: 0, costHnl: 0 },
    },
    {
      season: 'winter',
      seasonYear: 2026,
      seasonLabel: 'Winter 2026',
      months: ['2026-11', '2026-12', '2027-01'],
      planId: 'plan-1',
      planLabel: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027',
      autoCreated: true,
      duplicateSourceCount: 1,
      worksheets: [],
      projectedBoh: { units: 0, costHnl: 0 },
      projectedSales: { units: 150, costHnl: 15000 },
      baselineBuy: { units: 120, costHnl: 12000 },
      draftPos: { units: 0, costHnl: 0 },
      confirmedPos: { units: 0, costHnl: 0 },
      openToBuy: { units: 120, costHnl: 12000 },
      projectedEoh: { units: 0, costHnl: 0 },
    },
    {
      season: 'spring',
      seasonYear: 2027,
      seasonLabel: 'Spring 2027',
      months: ['2027-02', '2027-03', '2027-04'],
      planId: 'plan-1',
      planLabel: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027',
      autoCreated: true,
      duplicateSourceCount: 1,
      worksheets: [],
      projectedBoh: { units: 0, costHnl: 0 },
      projectedSales: { units: 150, costHnl: 15000 },
      baselineBuy: { units: 120, costHnl: 12000 },
      draftPos: { units: 0, costHnl: 0 },
      confirmedPos: { units: 0, costHnl: 0 },
      openToBuy: { units: 120, costHnl: 12000 },
      projectedEoh: { units: 0, costHnl: 0 },
    },
    {
      season: 'summer',
      seasonYear: 2027,
      seasonLabel: 'Summer 2027',
      months: ['2027-05', '2027-06', '2027-07'],
      planId: 'plan-1',
      planLabel: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027',
      autoCreated: true,
      duplicateSourceCount: 1,
      worksheets: [],
      projectedBoh: { units: 0, costHnl: 0 },
      projectedSales: { units: 150, costHnl: 15000 },
      baselineBuy: { units: 120, costHnl: 12000 },
      draftPos: { units: 0, costHnl: 0 },
      confirmedPos: { units: 0, costHnl: 0 },
      openToBuy: { units: 120, costHnl: 12000 },
      projectedEoh: { units: 0, costHnl: 0 },
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
  const control = screen.queryByRole('combobox', { name: label }) ?? screen.getAllByLabelText(label)[0]!
  await userEvent.click(control)
  const dropdown = document.body
  await userEvent.click(await within(dropdown).findByTitle(option))
}

function worksheetMetricCells(label: string, department?: string, tableLabel = 'Sales projection worksheet'): string[] {
  const table = screen.getByLabelText(tableLabel)
  const rows = within(table).getAllByText(label).map((node) => node.closest('tr')).filter(Boolean)
  const row = department
    ? rows.find((candidate) => candidate?.textContent?.includes(department))
    : rows[0]
  if (!row) throw new Error(`Expected worksheet row ${label}`)
  return within(row).getAllByRole('cell').map((cell) => {
    const input = Array.from(cell.querySelectorAll('input')).find((candidate) => candidate.value !== '')
    return input instanceof HTMLInputElement ? input.value : cell.textContent?.trim() ?? ''
  })
}

function numericInputValue(label: string): number {
  const input = screen.getByLabelText(label) as HTMLInputElement
  return Number(input.value)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('PurchasePlanningPage saved plans', () => {
  it('submits an enterprise monthly workbook report request and shows five season rollups', async () => {
    vi.mocked(useDepartments).mockReturnValue({
      data: [{ number: 10, description: 'Footwear' }],
      isLoading: false,
    } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(planDetail)
    vi.mocked(generateSeasonalPurchaseReport).mockResolvedValue(seasonalReport)

    renderPage()

    expect(screen.queryByLabelText('Report chains')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Year')).not.toBeInTheDocument()
    await chooseSelectOption('Department', '10 - Footwear')
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => expect(generateSeasonalPurchaseReport).toHaveBeenCalledTimes(1))
    const request = vi.mocked(generateSeasonalPurchaseReport).mock.calls[0]?.[0]
    expect(request).toMatchObject({
      departmentNumber: 10,
      forecast: { method: 'holtWinters' },
      eohMethod: 'forward',
      coverMonths: 3,
      discountNormalization: true,
      createdBy: 'buyer',
    })
    expect('storeGroupCodes' in request!).toBe(false)
    expect('year' in request!).toBe(false)
    expect(await screen.findByText('Projected BOH')).toBeInTheDocument()
    expect(screen.getByText('Open To Buy')).toBeInTheDocument()
    expect(screen.getAllByText('Summer 2027').length).toBeGreaterThan(0)
    expect(screen.getByText('warehouse included')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open monthly projection worksheet' })).toBeInTheDocument()
  })

  it('shows saved draft plans in the saved plans tab', async () => {
    vi.mocked(useDepartments).mockReturnValue({
      data: [
        { number: 10, description: 'Footwear' },
        { number: 20, description: 'Apparel' },
      ],
      isLoading: false,
    } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])

    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved plans' }))

    expect(await screen.findByRole('button', { name: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027' })).toBeInTheDocument()
  })

  it('shows the target policy mockup and recalculates the basis preview', async () => {
    vi.mocked(useDepartments).mockReturnValue({
      data: [{ number: 10, description: 'Footwear' }],
      isLoading: false,
    } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([])

    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: 'Target policies' }))

    expect(screen.getByText('Department-season target policies')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Policy department').length).toBeGreaterThan(0)
    const targetSkus = screen.getByLabelText('Summer 2026 target SKU count')
    expect(targetSkus).toHaveValue('180')
    expect(screen.getAllByText('5,040').length).toBeGreaterThan(0)
    expect(screen.getAllByText('5,250').length).toBeGreaterThan(0)

    await userEvent.clear(targetSkus)
    await userEvent.type(targetSkus, '200')
    expect(await screen.findByText('5,600')).toBeInTheDocument()
    expect(screen.getByText('5,810')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Summer 2026 override carrying stores'))
    const carryingStores = screen.getByLabelText('Summer 2026 carrying stores')
    await userEvent.clear(carryingStores)
    await userEvent.type(carryingStores, '30')

    expect(await screen.findByText('6,000')).toBeInTheDocument()
    expect(screen.getByText('6,210')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save policy' }))
    await waitFor(() => expect(screen.getAllByText(/staged/).length).toBeGreaterThan(0))
    expect(generateSeasonalPurchaseReport).not.toHaveBeenCalled()
    expect(updateSavedPurchasePlanRows).not.toHaveBeenCalled()
  })

  it('shows monthly worksheet rows immediately after opening a plan', async () => {
    vi.mocked(useDepartments).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(planDetail)

    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved plans' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027' }))

    expect((await screen.findAllByRole('columnheader', { name: 'May 2026' })).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('columnheader', { name: 'Jul 2027' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('combobox', { name: 'Forecast method' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader', { name: 'Worksheet row' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('columnheader', { name: 'Department' })).not.toBeInTheDocument()
    expect(screen.queryByText('15-month workbook')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Sales Projection' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByLabelText('On hand projection worksheet')).not.toBeInTheDocument()
    expect(worksheetMetricCells("Last year's sales units").slice(0, 3)).toEqual(["Last year's sales units", '50', '100'])
    expect(worksheetMetricCells("Last year's beginning on hand").slice(0, 3)).toEqual(["Last year's beginning on hand", '100', '100'])
    expect(worksheetMetricCells('Year before last sales units').slice(0, 3)).toEqual(['Year before last sales units', '40', '120'])
    expect(worksheetMetricCells('Increase last year vs prior').slice(0, 3)).toEqual(['Increase last year vs prior', '+25%', '-16.7%'])
    expect(worksheetMetricCells('Year before last beginning on hand').slice(0, 3)).toEqual(['Year before last beginning on hand', '90', '130'])
    expect(worksheetMetricCells('Sell thru for the month').slice(0, 3)).toEqual(['Sell thru for the month', '25%', '40%constrained'])
    expect(worksheetMetricCells('Projected sales').slice(0, 3)).toEqual(['Projected sales', '60', '70'])
    expect(worksheetMetricCells('User projected sales').slice(0, 3)).toEqual(['User projected sales', '60', '70'])
    expect(worksheetMetricCells('Compared sales units').slice(0, 3)).toEqual(['Compared sales units', '+10', '-30'])
    const salesWorksheetRows = within(screen.getByLabelText('Sales projection worksheet'))
      .getAllByRole('row')
      .map((row) => row.textContent ?? '')
    expect(salesWorksheetRows.findIndex((row) => row.includes('Increase last year vs prior')))
      .toBe(salesWorksheetRows.findIndex((row) => row.includes('Year before last sales units')) + 1)
    expect(screen.getByLabelText('May 2026 user projected sales').closest('.purchase-plan-workbook-grid-input')).not.toBeNull()
    expect(screen.getByLabelText('Sales projection worksheet').closest('.purchase-plan-workbook-grid')).not.toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: 'On Hand Projection' }))
    expect(within(await screen.findByLabelText('On hand projection worksheet')).getByText('Norm')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByLabelText('May 2026 current buy')).toHaveValue('45')
    expect(screen.getByLabelText('Jun 2026 current buy')).toHaveValue('40')
    expect(screen.getByLabelText('On hand projection worksheet').closest('.purchase-plan-workbook-grid')).not.toBeNull()
  })

  it('collapses worksheet month columns into season rollups', async () => {
    vi.mocked(useDepartments).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(planDetail)

    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved plans' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027' }))

    expect((await screen.findAllByRole('columnheader', { name: 'May 2026' })).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByText('Seasons'))

    expect((await screen.findAllByRole('columnheader', { name: 'Summer 2026' })).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('columnheader', { name: 'Fall 2026' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('columnheader', { name: 'Winter 2026' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('columnheader', { name: 'Spring 2027' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('columnheader', { name: 'Summer 2027' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('columnheader', { name: 'May 2026' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Summer 2026 user projected sales')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Sales projection summary').closest('.purchase-plan-sales-summary')).not.toBeNull()
    expect(within(screen.getByLabelText('Sales projection summary')).getByText('User projected sales for next 12 months')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Sales projection summary')).getByText('150 units')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Sales projection summary')).getByText('630 units')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Sales projection summary')).getByText('+320%')).toBeInTheDocument()
    expect(screen.queryByText('Adjusted delta')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'On Hand Projection' }))
    expect(worksheetMetricCells('Current buy', undefined, 'On hand projection worksheet')).toEqual(['Current buy', '125', '120', '120', '120', '120'])

    await userEvent.click(screen.getByText('Months'))
    expect((await screen.findAllByRole('columnheader', { name: 'May 2026' })).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('tab', { name: 'Sales Projection' }))
    expect(screen.getByLabelText('May 2026 user projected sales')).toBeInTheDocument()
  })

  it('shows worksheet totals and recalculates them before saving edits', async () => {
    vi.mocked(useDepartments).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(twoMonthPlanDetail)

    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved plans' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027' }))

    await screen.findAllByRole('columnheader', { name: 'May 2026' })

    await userEvent.clear(screen.getByLabelText('May 2026 user projected sales'))
    await userEvent.type(screen.getByLabelText('May 2026 user projected sales'), '80')
    await userEvent.click(screen.getByRole('tab', { name: 'On Hand Projection' }))
    expect(screen.getByLabelText('May 2026 current buy')).toHaveValue('45')
    expect(screen.getByLabelText('Jun 2026 current buy')).toHaveValue('80')

    await userEvent.clear(screen.getByLabelText('May 2026 EOH target'))
    await userEvent.type(screen.getByLabelText('May 2026 EOH target'), '60')
    await userEvent.clear(screen.getByLabelText('May 2026 current buy'))
    await userEvent.type(screen.getByLabelText('May 2026 current buy'), '70')

    await waitFor(() => {
      expect(numericInputValue('May 2026 current buy')).toBe(70)
      expect(numericInputValue('Jun 2026 current buy')).toBe(80)
    })
    expect(updateSavedPurchasePlanRows).not.toHaveBeenCalled()
  })

  it('keeps worksheet totals aligned when the department column is visible', async () => {
    vi.mocked(useDepartments).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue({
      ...twoMonthPlanDetail,
      plan: {
        ...twoMonthPlanDetail.plan,
        selectedDepartments: [10, 20],
      },
      departments: [
        ...twoMonthPlanDetail.departments,
        {
          departmentKey: '20',
          departmentNumber: 20,
          departmentLabel: '20 - Apparel',
          baselineTotalBuy: 20,
          currentTotalBuy: 15,
          deltaBuy: -5,
          totalProjSales: 20,
          currentOnHand: 5,
          currentOnOrder: 0,
          futureOnOrder: 0,
          nativeOpenPo: 0,
          hasHistory: true,
          months: [{
            id: 'row-20-1',
            planId: 'plan-1',
            departmentKey: '20',
            departmentNumber: 20,
            departmentLabel: '20 - Apparel',
            yearMonth: '2026-05',
            baselineBoh: 5,
            baselineProjSales: 20,
            baselineEohTarget: 10,
            baselineBuy: 20,
            baselineEohActual: 0,
            currentBoh: 5,
            currentProjSales: 20,
            currentEohTarget: 10,
            currentBuy: 15,
            currentEohActual: 0,
            onHand: 5,
            currentOnOrder: 0,
            futureOnOrder: 0,
            nativeOpenPo: 0,
            stockPosition: 5,
            normalizationFactor: null,
            rawProjSales: null,
          }],
        },
      ],
    })

    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved plans' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027' }))
    await userEvent.click(await screen.findByRole('tab', { name: 'On Hand Projection' }))

    expect((await screen.findAllByRole('columnheader', { name: 'Department' })).length).toBeGreaterThan(0)
    expect(within(screen.getByLabelText('On hand projection worksheet')).getAllByText('20 - Apparel').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('10 - Footwear May 2026 current buy')).toHaveValue('45')
  })

  it('submits an audited department adjustment', async () => {
    vi.mocked(useDepartments).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(planDetail)
    vi.mocked(addSavedPurchasePlanAdjustment).mockResolvedValue(planDetail)

    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved plans' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027' }))
    await screen.findAllByRole('columnheader', { name: 'May 2026' })
    await userEvent.click(screen.getByRole('tab', { name: 'On Hand Projection' }))
    const adjustButtons = screen.getAllByRole('button', { name: /Adjust/ })
    const adjustButton = adjustButtons[0]
    if (!adjustButton) throw new Error('Expected an adjustment action')
    await userEvent.click(adjustButton)
    await userEvent.type(screen.getByLabelText('Reason'), 'Promo lift for launch window')
    await userEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))

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
  }, 15_000)

  it('regenerates the shared worksheet with the selected forecast method while preserving user values', async () => {
    vi.mocked(useDepartments).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(planDetail)
    vi.mocked(recalculateSavedPurchasePlan).mockResolvedValue({
      ...planDetail,
      plan: { ...planDetail.plan, forecastMethod: 'trailingAverage' },
    })

    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved plans' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027' }))
    expect(await screen.findByRole('combobox', { name: 'Forecast method' })).toBeInTheDocument()
    await chooseSelectOption('Forecast method', 'Trailing average')
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    await waitFor(() => expect(recalculateSavedPurchasePlan).toHaveBeenCalledWith('plan-1', {
      actor: 'buyer',
      forecast: { method: 'trailingAverage' },
      mode: 'preserve_user',
    }))
  }, 15_000)

  it('saves monthly sales projection edits from the sales worksheet only', async () => {
    vi.mocked(useDepartments).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(planDetail)
    vi.mocked(updateSavedPurchasePlanRows).mockResolvedValue(planDetail)

    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved plans' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027' }))

    const projectedSales = await screen.findByLabelText('May 2026 user projected sales')
    await userEvent.clear(projectedSales)
    await userEvent.type(projectedSales, '80')
    await userEvent.clear(screen.getByLabelText('Worksheet reason'))
    await userEvent.type(screen.getByLabelText('Worksheet reason'), 'Manual sales projection override')
    await userEvent.click(screen.getByRole('button', { name: 'Save worksheet' }))

    await waitFor(() => expect(updateSavedPurchasePlanRows).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateSavedPurchasePlanRows).mock.calls[0]).toEqual([
      'plan-1',
      {
        rows: [{
          rowId: 'row-1',
          currentProjSales: 80,
        }],
        reason: 'Manual sales projection override',
        appliedBy: 'buyer',
      },
    ])
    expect(addSavedPurchasePlanAdjustment).not.toHaveBeenCalled()
  }, 15_000)

  it('saves EOH target and buy edits from the on hand worksheet only', async () => {
    vi.mocked(useDepartments).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(planDetail)
    vi.mocked(updateSavedPurchasePlanRows).mockResolvedValue(planDetail)

    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved plans' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027' }))
    await userEvent.click(await screen.findByRole('tab', { name: 'On Hand Projection' }))

    const eohTarget = await screen.findByLabelText('May 2026 EOH target')
    const currentBuy = screen.getByLabelText('May 2026 current buy')
    await userEvent.clear(eohTarget)
    await userEvent.type(eohTarget, '60')
    await userEvent.clear(currentBuy)
    await userEvent.type(currentBuy, '70')
    await userEvent.clear(screen.getByLabelText('On hand worksheet reason'))
    await userEvent.type(screen.getByLabelText('On hand worksheet reason'), 'Manual on hand projection override')
    await userEvent.click(screen.getByRole('button', { name: 'Save on hand projection' }))

    await waitFor(() => expect(updateSavedPurchasePlanRows).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateSavedPurchasePlanRows).mock.calls[0]).toEqual([
      'plan-1',
      {
        rows: [{
          rowId: 'row-1',
          currentEohTarget: 60,
          currentBuy: 70,
        }],
        reason: 'Manual on hand projection override',
        appliedBy: 'buyer',
      },
    ])
    expect(addSavedPurchasePlanAdjustment).not.toHaveBeenCalled()
  }, 15_000)

  it('applies a projection percent and recalculates worksheet cells before saving', async () => {
    vi.mocked(useDepartments).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(fetchSavedPurchasePlans).mockResolvedValue([listItem])
    vi.mocked(fetchSavedPurchasePlan).mockResolvedValue(planDetail)
    vi.mocked(updateSavedPurchasePlanRows).mockResolvedValue(planDetail)

    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: 'Saved plans' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enterprise-wide 10 - Footwear Summer 2026 to Summer 2027' }))
    const projectionPercent = await screen.findByLabelText('Projection percent')
    await userEvent.clear(projectionPercent)
    await userEvent.type(projectionPercent, '10')
    await userEvent.click(screen.getByRole('button', { name: 'Apply projection %' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save worksheet' }))

    await waitFor(() => expect(updateSavedPurchasePlanRows).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(updateSavedPurchasePlanRows).mock.calls[0]?.[1]
    expect(vi.mocked(updateSavedPurchasePlanRows).mock.calls[0]?.[0]).toBe('plan-1')
    expect(payload?.rows).toHaveLength(15)
    expect(payload?.rows).toEqual(expect.arrayContaining([
      { rowId: 'row-1', currentProjSales: 66 },
      { rowId: 'row-2', currentProjSales: 77 },
    ]))
    expect(payload?.reason).toBe('Worksheet edit')
    expect(payload?.appliedBy).toBe('buyer')
  })
})
