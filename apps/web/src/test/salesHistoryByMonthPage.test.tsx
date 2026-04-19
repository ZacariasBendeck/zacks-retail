import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SalesHistoryByMonthPage from '../pages/salesReporting/SalesHistoryByMonthPage'
import { useSalesDimensions, useSalesHistoryByMonth } from '../hooks/useReports'
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
  '2025-05',
  '2025-06',
  '2025-07',
  '2025-08',
  '2025-09',
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
]

function buildDims(): SalesDimensionsResponse {
  return {
    stores: [
      { number: 1, name: 'Main Street' },
      { number: 2, name: 'Downtown' },
    ],
    categories: [],
    groups: [],
  }
}

function buildCombinedReport(): SalesHistoryByMonthReport {
  return {
    sortBy: 'vendor',
    endMonth: '2026-04',
    months: MONTHS,
    combineStores: true,
    stores: [
      { number: 1, label: '1 — Main Street' },
      { number: 2, label: '2 — Downtown' },
    ],
    blocks: [
      {
        storeNumber: 'ALL',
        storeLabel: 'All Stores',
        rows: [
          {
            key: 'NIKE',
            label: 'NIKE',
            monthValues: [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210],
            total: 1860,
          },
        ],
        columnTotals: [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210],
        grandTotal: 1860,
      },
    ],
    chartSeries: [
      {
        name: 'All Stores',
        values: [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210],
      },
    ],
  }
}

function buildSeparateReport(): SalesHistoryByMonthReport {
  return {
    sortBy: 'vendor',
    endMonth: '2026-04',
    months: MONTHS,
    combineStores: false,
    stores: [
      { number: 1, label: '1 — Main Street' },
      { number: 2, label: '2 — Downtown' },
    ],
    blocks: [
      {
        storeNumber: 1,
        storeLabel: '1 — Main Street',
        rows: [
          {
            key: 'NIKE',
            label: 'NIKE',
            monthValues: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105],
            total: 930,
          },
        ],
        columnTotals: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105],
        grandTotal: 930,
      },
      {
        storeNumber: 2,
        storeLabel: '2 — Downtown',
        rows: [
          {
            key: 'NIKE',
            label: 'NIKE',
            monthValues: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105],
            total: 930,
          },
        ],
        columnTotals: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105],
        grandTotal: 930,
      },
    ],
    chartSeries: [
      { name: '1 — Main Street', values: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105] },
      { name: '2 — Downtown', values: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105] },
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
          <SalesHistoryByMonthPage />
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

describe('SalesHistoryByMonthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSalesDimensions).mockReturnValue({
      data: buildDims(),
      isLoading: false,
    } as never)
  })

  it('shows the Empty prompt and does not call the API hook when no stores are selected', () => {
    const hook = vi.mocked(useSalesHistoryByMonth)
    hook.mockReturnValue({ data: undefined, isFetching: false, error: null } as never)

    renderPage()

    // Filter bar controls are present before any selection.
    expect(
      screen.getByRole('heading', { level: 2, name: /Sales History by Month/ }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('stores-select')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeDisabled()

    // Empty state is shown.
    expect(
      screen.getByText(/Select one or more stores to load the report/i),
    ).toBeInTheDocument()

    // Every call to useSalesHistoryByMonth should have been made with `null`
    // (the page disables the query until ≥1 store is selected).
    expect(hook).toHaveBeenCalled()
    for (const call of hook.mock.calls) {
      expect(call[0]).toBeNull()
    }
  })

  it('renders chart + single pivot table after a store is selected (combineStores=true fixture)', async () => {
    const user = userEvent.setup()
    vi.mocked(useSalesHistoryByMonth).mockReturnValue({
      data: buildCombinedReport(),
      isFetching: false,
      error: null,
    } as never)

    renderPage()

    await selectStore(user, /1 — Main Street/)

    // Chart renders once.
    await waitFor(() => {
      expect(screen.getByTestId('sales-history-chart')).toBeInTheDocument()
    })

    // Vendor row and month columns render with currency formatting.
    expect(screen.getByText('NIKE')).toBeInTheDocument()
    // The row total ($1,860) appears in the row and in the summary cell.
    expect(screen.getAllByText('$1,860').length).toBeGreaterThan(0)

    // No per-store block headers in combined mode.
    expect(screen.queryByTestId('block-header')).not.toBeInTheDocument()
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

    await waitFor(() => {
      expect(screen.getAllByTestId('block-header')).toHaveLength(2)
    })
    const headers = screen.getAllByTestId('block-header')
    expect(headers[0]).toHaveTextContent('1 — Main Street')
    expect(headers[1]).toHaveTextContent('2 — Downtown')
  })

  it('Export CSV button links to the endpoint with format=csv once a store is selected', async () => {
    const user = userEvent.setup()
    vi.mocked(useSalesHistoryByMonth).mockReturnValue({
      data: buildCombinedReport(),
      isFetching: false,
      error: null,
    } as never)

    renderPage()

    const csvBefore = screen.getByRole('button', { name: /Export CSV/i })
    expect(csvBefore).toBeDisabled()

    await selectStore(user, /1 — Main Street/)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Export CSV/i })).toBeInTheDocument()
    })
    const csvAfter = screen.getByRole('link', { name: /Export CSV/i })
    const href = csvAfter.getAttribute('href') ?? ''
    expect(href).toContain('/api/v1/reports/rics-sales-history-by-month')
    expect(href).toContain('format=csv')
    expect(href).toContain('stores=1')
    expect(href).toContain('sortBy=vendor')
    expect(href).toContain('combineStores=true')
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

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText(/Failed to load report/i)).toBeInTheDocument()
    expect(within(alert).getByText(/SALES_SOURCE must be set to rics/i)).toBeInTheDocument()
  })
})
