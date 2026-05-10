import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SalesHistoryByMonthPage from '../pages/salesReporting/SalesHistoryByMonthPage'
import { useSalesDimensions, useSalesHistoryByMonth } from '../hooks/useReports'
import { InquiryPopupProvider } from '../components/inquiry-popup'
import type {
  SalesDimensionsResponse,
  SalesHistoryByMonthReport,
} from '../services/reportApi'

// The chart dispatches to an ECharts canvas — mock it to a simple div so
// jsdom doesn't choke on canvas APIs and so assertions can target a stable
// testid without inspecting chart internals.
vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: () => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  }),
}))
vi.mock('echarts/charts', () => ({ LineChart: {} }))
vi.mock('echarts/components', () => ({
  GridComponent: {},
  LegendComponent: {},
  TitleComponent: {},
  TooltipComponent: {},
}))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))

vi.mock('../hooks/useReports', () => ({
  useSalesDimensions: vi.fn(),
  useSalesHistoryByMonth: vi.fn(),
}))

const MONTHS = [
  '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10',
  '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
]

function buildDims(): SalesDimensionsResponse {
  return {
    stores: [
      { number: 1, name: 'Main Street' },
      { number: 2, name: 'Downtown' },
    ],
    chains: [],
    categories: [],
    groups: [],
    sectors: [],
    departments: [],
    seasons: [],
    buyers: [],
  }
}

function buildCombinedReport(
  overrides: Partial<SalesHistoryByMonthReport> = {},
): SalesHistoryByMonthReport {
  const monthly = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210]
  return {
    sortBy: 'vendor',
    endMonth: '2026-04',
    months: MONTHS,
    combineStores: true,
    stores: [
      { number: 1, label: '1 — Main Street' },
      { number: 2, label: '2 — Downtown' },
    ],
    detailLevel: 'subtotals',
    dataToPrint: ['netSales'],
    deferredMetrics: [],
    criteria: {},
    blocks: [
      {
        storeNumber: 'ALL',
        storeLabel: 'All Stores',
        rows: [
          {
            key: 'NIKE',
            label: 'NIKE',
            metrics: { netSales: monthly },
            totals: { netSales: 1860 },
          },
        ],
        columnTotals: { netSales: monthly },
        grandTotals: { netSales: 1860 },
      },
    ],
    chartSeries: [{ name: 'All Stores', values: monthly }],
    ...overrides,
  }
}

function buildMultiMetricReport(): SalesHistoryByMonthReport {
  const netMonthly = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210]
  const qtyMonthly = [5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]
  const grossProfitMonthly = [56.43, 56.99, 52.71, 54.91, 54.92, 53.39, 51.5, 49.25, 54.87, 49.52, 49.09, 52.91]
  const roiMonthly = [70, 70, 63, 55, 56, 51, 31, 31, 167, 44, 37, 33]
  const zeroMonthly = new Array(12).fill(0)
  return {
    ...buildCombinedReport(),
    dataToPrint: ['turns', 'netSales', 'quantitySold', 'profit', 'beginningOnHand', 'grossProfit', 'pctOfStoreNetSales', 'roiPct'],
    blocks: [
      {
        storeNumber: 'ALL',
        storeLabel: 'All Stores',
        rows: [
          {
            key: 'NIKE',
            label: 'NIKE',
            metrics: {
              quantitySold: qtyMonthly,
              netSales: netMonthly,
              beginningOnHand: zeroMonthly,
              pctOfStoreNetSales: zeroMonthly,
              profit: zeroMonthly,
              grossProfit: grossProfitMonthly,
              roiPct: roiMonthly,
              turns: zeroMonthly,
            },
            totals: {
              quantitySold: 90,
              netSales: 1860,
              beginningOnHand: 0,
              pctOfStoreNetSales: 0,
              profit: 0,
              grossProfit: 53.21,
              roiPct: 54,
              turns: 0,
            },
          },
        ],
        columnTotals: {
          quantitySold: qtyMonthly,
          netSales: netMonthly,
          beginningOnHand: zeroMonthly,
          pctOfStoreNetSales: zeroMonthly,
          profit: zeroMonthly,
          grossProfit: grossProfitMonthly,
          roiPct: roiMonthly,
          turns: zeroMonthly,
        },
        grandTotals: {
          quantitySold: 90,
          netSales: 1860,
          beginningOnHand: 0,
          pctOfStoreNetSales: 0,
          profit: 0,
          grossProfit: 53.21,
          roiPct: 54,
          turns: 0,
        },
      },
    ],
  }
}

function buildLargeSkuDetailReport(): SalesHistoryByMonthReport {
  const monthly = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10]
  const rows = Array.from({ length: 150 }, (_, index) => {
    const sku = `SKU-${String(index + 1).padStart(3, '0')}`
    return {
      key: sku,
      label: sku,
      metrics: {
        netSales: monthly,
        quantitySold: monthly,
      },
      totals: {
        netSales: 10,
        quantitySold: 10,
      },
    }
  })
  return buildCombinedReport({
    detailLevel: 'sku',
    dataToPrint: ['netSales', 'quantitySold'],
    blocks: [
      {
        storeNumber: 'ALL',
        storeLabel: 'All Stores',
        rows,
        columnTotals: {
          netSales: monthly,
          quantitySold: monthly,
        },
        grandTotals: {
          netSales: 1500,
          quantitySold: 1500,
        },
      },
    ],
  })
}

function buildGroupedVendorSkuDetailReport(): SalesHistoryByMonthReport {
  const nikeMonthly = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 150]
  const skuAMonthly = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90]
  const skuBMonthly = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 60]
  return buildCombinedReport({
    detailLevel: 'sku',
    sortBy: 'vendor',
    dataToPrint: ['netSales'],
    blocks: [
      {
        storeNumber: 'ALL',
        storeLabel: 'All Stores',
        rows: [
          {
            key: 'NIKE',
            label: 'NIKE',
            metrics: { netSales: nikeMonthly },
            totals: { netSales: 150 },
            children: [
              {
                key: 'SKU-A',
                label: 'SKU-A',
                groupKey: 'NIKE',
                groupLabel: 'NIKE',
                pictureFileName: 'SKU-A.JPG',
                metrics: { netSales: skuAMonthly },
                totals: { netSales: 90 },
              },
              {
                key: 'SKU-B',
                label: 'SKU-B',
                groupKey: 'NIKE',
                groupLabel: 'NIKE',
                metrics: { netSales: skuBMonthly },
                totals: { netSales: 60 },
              },
            ],
          },
        ],
        columnTotals: { netSales: nikeMonthly },
        grandTotals: { netSales: 150 },
      },
    ],
  })
}

function buildSeparateReport(): SalesHistoryByMonthReport {
  const half = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105]
  return {
    sortBy: 'vendor',
    endMonth: '2026-04',
    months: MONTHS,
    combineStores: false,
    stores: [
      { number: 1, label: '1 — Main Street' },
      { number: 2, label: '2 — Downtown' },
    ],
    detailLevel: 'subtotals',
    dataToPrint: ['netSales'],
    deferredMetrics: [],
    criteria: {},
    blocks: [
      {
        storeNumber: 1,
        storeLabel: '1 — Main Street',
        rows: [
          {
            key: 'NIKE',
            label: 'NIKE',
            metrics: { netSales: half },
            totals: { netSales: 930 },
          },
        ],
        columnTotals: { netSales: half },
        grandTotals: { netSales: 930 },
      },
      {
        storeNumber: 2,
        storeLabel: '2 — Downtown',
        rows: [
          {
            key: 'NIKE',
            label: 'NIKE',
            metrics: { netSales: half },
            totals: { netSales: 930 },
          },
        ],
        columnTotals: { netSales: half },
        grandTotals: { netSales: 930 },
      },
    ],
    chartSeries: [
      { name: '1 — Main Street', values: half },
      { name: '2 — Downtown', values: half },
    ],
  }
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ConfigProvider>
        <MemoryRouter>
          <InquiryPopupProvider>
            <SalesHistoryByMonthPage />
          </InquiryPopupProvider>
        </MemoryRouter>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

// AntD Select multiple in jsdom: the selector wrapper is the clickable
// target, the listbox mounts to document.body. We open the dropdown by
// clicking the selector, then click an option by visible text.
async function selectStore(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  const selector = document.querySelector<HTMLDivElement>(
    '[data-testid="stores-select"] .ant-select-selector',
  )
  if (!selector) throw new Error('stores-select selector not found')
  await user.click(selector)
  const option = await screen.findByText(label)
  await user.click(option)
}

async function clickRunReport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Run Report|Re-run/i }))
}

describe('SalesHistoryByMonthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSalesDimensions).mockReturnValue({
      data: buildDims(),
      isLoading: false,
    } as never)
  })

  it('shows the Empty prompt and does not call the API hook until Run Report is clicked', () => {
    const hook = vi.mocked(useSalesHistoryByMonth)
    hook.mockReturnValue({ data: undefined, isFetching: false, error: null } as never)

    renderPage()

    expect(
      screen.getByRole('heading', { level: 2, name: /Sales History by Month/ }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('stores-select')).toBeInTheDocument()

    expect(
      screen.getByText(/Configure your options and click Run Report/i),
    ).toBeInTheDocument()

    expect(hook).toHaveBeenCalled()
    for (const call of hook.mock.calls) {
      expect(call[0]).toBeNull()
    }
  })

  it('exposes full screen and sticky-header controls', async () => {
    const user = userEvent.setup()
    vi.mocked(useSalesHistoryByMonth).mockReturnValue({
      data: undefined,
      isFetching: false,
      error: null,
    } as never)

    renderPage()

    expect(screen.getByRole('button', { name: /Full Screen/i })).toBeInTheDocument()
    const sticky = screen.getByRole('switch', { name: /Keep headers visible/i })
    expect(sticky).toBeChecked()
    await user.click(sticky)
    expect(sticky).not.toBeChecked()
  })

  it('blank Stores means all loaded stores when Run Report is clicked', async () => {
    const user = userEvent.setup()
    const hook = vi.mocked(useSalesHistoryByMonth)
    hook.mockReturnValue({ data: undefined, isFetching: false, error: null } as never)

    renderPage()
    await clickRunReport(user)

    await waitFor(() => {
      const calls = hook.mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall?.[0]?.args.stores).toEqual([1, 2])
    })
  })

  it('renders chart + single pivot table after Run Report is clicked (combineStores=true fixture)', async () => {
    const user = userEvent.setup()
    vi.mocked(useSalesHistoryByMonth).mockReturnValue({
      data: buildCombinedReport(),
      isFetching: false,
      error: null,
    } as never)

    renderPage()

    await selectStore(user, /1 — Main Street/)
    await clickRunReport(user)

    await waitFor(() => {
      expect(screen.getByTestId('sales-history-chart')).toBeInTheDocument()
    })

    // Vendor row renders.
    expect(screen.getByText('NIKE')).toBeInTheDocument()
    // Row + summary total — plain number (currency symbol is labeled once in
    // the page header per CLAUDE.md policy, not on every cell).
    expect(screen.getAllByText(/^1,860(\.00)?$/).length).toBeGreaterThan(0)

    // No per-store block headers in combined mode.
    expect(screen.queryByTestId('block-header')).not.toBeInTheDocument()
    // No metric tab strip when only one metric is selected.
    expect(screen.queryByTestId('metric-tab-strip')).not.toBeInTheDocument()
  })

  it('renders one table per block for combineStores=false', async () => {
    const user = userEvent.setup()
    vi.mocked(useSalesHistoryByMonth).mockReturnValue({
      data: buildSeparateReport(),
      isFetching: false,
      error: null,
    } as never)

    renderPage()

    await selectStore(user, /1 — Main Street/)
    await clickRunReport(user)

    await waitFor(() => {
      expect(screen.getAllByTestId('block-header')).toHaveLength(2)
    })
    const headers = screen.getAllByTestId('block-header')
    expect(headers[0]).toHaveTextContent('1 — Main Street')
    expect(headers[1]).toHaveTextContent('2 — Downtown')
  })

  it('stacks selected metrics together in the RICS picture order', async () => {
    const user = userEvent.setup()
    vi.mocked(useSalesHistoryByMonth).mockReturnValue({
      data: buildMultiMetricReport(),
      isFetching: false,
      error: null,
    } as never)

    renderPage()
    await selectStore(user, /1 — Main Street/)
    await clickRunReport(user)

    await waitFor(() => {
      expect(screen.getAllByTestId('metric-row-quantitySold').length).toBeGreaterThan(0)
    })
    expect(screen.queryByTestId('metric-tab-strip')).not.toBeInTheDocument()

    const orderedMetricKeys = [
      'quantitySold',
      'netSales',
      'beginningOnHand',
      'pctOfStoreNetSales',
      'profit',
      'grossProfit',
      'roiPct',
      'turns',
    ]
    const metricNodes = orderedMetricKeys.map((key) => {
      const node = screen.getAllByTestId(`metric-row-${key}`)[0]
      if (!node) throw new Error(`Missing metric row for ${key}`)
      return node
    })
    for (let i = 1; i < metricNodes.length; i += 1) {
      const previous = metricNodes[i - 1]
      const current = metricNodes[i]
      if (!previous || !current) throw new Error('Missing metric node while checking order')
      expect(
        previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }

    const grossProfitRow = metricNodes[5]?.closest('tr')
    const roiRow = metricNodes[6]?.closest('tr')
    if (!grossProfitRow || !roiRow) throw new Error('Missing GP or ROI row')
    expect(within(grossProfitRow).getAllByText('56.4').length).toBeGreaterThan(0)
    expect(within(grossProfitRow).queryAllByText('56.4%')).toHaveLength(0)
    expect(within(roiRow).getAllByText('70.0').length).toBeGreaterThan(0)
    expect(within(roiRow).queryAllByText('70.0%')).toHaveLength(0)
  })

  it('paginates SKU detail before expanding selected metrics', async () => {
    const user = userEvent.setup()
    vi.mocked(useSalesHistoryByMonth).mockReturnValue({
      data: buildLargeSkuDetailReport(),
      isFetching: false,
      error: null,
    } as never)

    renderPage()
    await clickRunReport(user)

    await waitFor(() => {
      expect(screen.getByText('SKU-001')).toBeInTheDocument()
    })
    expect(screen.getByText('1-100 of 150 SKUs')).toBeInTheDocument()
    expect(screen.queryByText('SKU-101')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('metric-row-netSales')).toHaveLength(100)
    expect(screen.getAllByTestId('metric-row-quantitySold')).toHaveLength(100)
  })

  it('shows vendor rows first for vendor-sorted SKU detail and expands to SKUs', async () => {
    const user = userEvent.setup()
    vi.mocked(useSalesHistoryByMonth).mockReturnValue({
      data: buildGroupedVendorSkuDetailReport(),
      isFetching: false,
      error: null,
    } as never)

    renderPage()
    await clickRunReport(user)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\+ NIKE/ })).toBeInTheDocument()
    })
    expect(screen.queryByText('SKU-A')).not.toBeInTheDocument()
    expect(screen.getAllByText(/^150(\.00)?$/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /\+ NIKE/ }))
    const skuLink = screen.getByRole('link', { name: 'SKU-A' })
    expect(skuLink).toHaveAttribute('href', '/products/inquiry/SKU-A')
    expect(screen.getByAltText('SKU-A')).toHaveAttribute('src', '/rics-images/SKU-A.JPG')
    expect(screen.getByText('SKU-B')).toBeInTheDocument()
    expect(screen.getAllByTestId('metric-row-netSales')).toHaveLength(2)
  })

  it('Export CSV + XLSX links are enabled once Run Report commits and encode the full params', async () => {
    const user = userEvent.setup()
    vi.mocked(useSalesHistoryByMonth).mockReturnValue({
      data: buildCombinedReport(),
      isFetching: false,
      error: null,
    } as never)

    renderPage()

    const csvBefore = screen.getAllByRole('button', { name: /Export CSV/i })[0]
    expect(csvBefore).toBeDisabled()

    await selectStore(user, /1 — Main Street/)
    await clickRunReport(user)

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /Export CSV/i }).length).toBeGreaterThan(0)
    })
    const csvAfter = screen.getAllByRole('link', { name: /Export CSV/i })[0]!
    const csvHref = csvAfter.getAttribute('href') ?? ''
    expect(csvHref).toContain('/api/v1/reports/rics-sales-history-by-month')
    expect(csvHref).toContain('format=csv')
    expect(csvHref).toContain('stores=1')
    expect(csvHref).toContain('sortBy=vendor')
    expect(csvHref).toContain('combineStores=true')
    expect(csvHref).toContain('detailLevel=subtotals')

    const xlsxAfter = screen.getAllByRole('link', { name: /Export XLSX/i })[0]!
    const xlsxHref = xlsxAfter.getAttribute('href') ?? ''
    expect(xlsxHref).toContain('format=xlsx')
  })

  it('Criteria section exposes all seven facet inputs inline (no tabs)', () => {
    vi.mocked(useSalesHistoryByMonth).mockReturnValue({
      data: undefined,
      isFetching: false,
      error: null,
    } as never)

    renderPage()

    expect(screen.queryByRole('tab', { name: /Criteria/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Export Options/i })).not.toBeInTheDocument()

    expect(screen.getByTestId('criteria-stores')).toBeInTheDocument()
    expect(screen.getByTestId('criteria-categories')).toBeInTheDocument()
    expect(screen.getByTestId('criteria-vendors')).toBeInTheDocument()
    expect(screen.getByTestId('criteria-seasons')).toBeInTheDocument()
    expect(screen.getByTestId('criteria-styleColors')).toBeInTheDocument()
    expect(screen.getByTestId('criteria-groups')).toBeInTheDocument()
    expect(screen.getByTestId('criteria-keywords')).toBeInTheDocument()
  })

  it('typing a criteria value propagates into the URL params on Run Report', async () => {
    const user = userEvent.setup()
    const hook = vi.mocked(useSalesHistoryByMonth)
    hook.mockReturnValue({ data: undefined, isFetching: false, error: null } as never)

    renderPage()
    await selectStore(user, /1 — Main Street/)

    await user.type(screen.getByTestId('criteria-vendors'), 'NIKE,ADIDAS')
    await clickRunReport(user)

    // Hook receives the committed criteria on the post-Run call.
    await waitFor(() => {
      const calls = hook.mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall?.[0]?.args.criteria?.vendors).toBe('NIKE,ADIDAS')
    })
  })

  it('renders an error Alert with the server message when the hook errors', async () => {
    const user = userEvent.setup()
    vi.mocked(useSalesHistoryByMonth).mockReturnValue({
      data: undefined,
      isFetching: false,
      error: new Error('501 Not Implemented — SALES_SOURCE must be set to rics'),
    } as never)

    renderPage()

    await selectStore(user, /1 — Main Street/)
    await clickRunReport(user)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText(/Failed to load report/i)).toBeInTheDocument()
    expect(within(alert).getByText(/SALES_SOURCE must be set to rics/i)).toBeInTheDocument()
  })

  it('exposes the BoH / ROI / Turns metric checkboxes inline', () => {
    const hook = vi.mocked(useSalesHistoryByMonth)
    hook.mockReturnValue({ data: undefined, isFetching: false, error: null } as never)

    renderPage()

    // Beginning On-Hand / ROI% / Turns shipped in v2.1 after RIINVHIS.MDB
    // was indexed — they render as regular metric checkboxes alongside
    // Quantity Sold, Net Sales, Profit, etc. They are visible without any
    // tab navigation since the tab layout was removed.
    expect(screen.getByTestId('metric-beginningOnHand')).toBeInTheDocument()
    expect(screen.getByTestId('metric-roiPct')).toBeInTheDocument()
    expect(screen.getByTestId('metric-turns')).toBeInTheDocument()
  })

  it('exposes and sends the new/carryover lifecycle metric checkboxes', async () => {
    const user = userEvent.setup()
    const hook = vi.mocked(useSalesHistoryByMonth)
    hook.mockReturnValue({ data: undefined, isFetching: false, error: null } as never)

    renderPage()

    expect(screen.getByText('Original report metrics')).toBeInTheDocument()
    expect(screen.getByText('New / carryover metrics')).toBeInTheDocument()

    const lifecycleKeys = [
      'newSkuStoreCount',
      'carryoverSkuStoreCount',
      'newSkuDistinctCount',
      'carryoverSkuDistinctCount',
      'newSkuUnitsSold',
      'carryoverSkuUnitsSold',
      'newCarryoverSkuRatio',
      'newCarryoverUnitsSoldRatio',
    ] as const

    for (const key of lifecycleKeys) {
      const checkbox = screen.getByTestId(`metric-${key}`)
      expect(checkbox).toBeInTheDocument()
      await user.click(checkbox)
    }

    await clickRunReport(user)

    await waitFor(() => {
      const calls = hook.mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall?.[0]?.args.dataToPrint).toEqual(expect.arrayContaining([...lifecycleKeys]))
    })
  })
})
