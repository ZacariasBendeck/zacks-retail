import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SalesByDayPage from '../pages/salesReporting/SalesByDayPage'
import { useSalesByDay, useSalesDimensions } from '../hooks/useReports'
import { useReportTemplate, useTouchReportTemplate } from '../hooks/useReportTemplates'
import type { SalesByDayReport, SalesDimensionsResponse } from '../services/reportApi'

vi.mock('../hooks/useReports', () => ({
  useSalesByDay: vi.fn(),
  useSalesDimensions: vi.fn(),
}))

vi.mock('../hooks/useReportTemplates', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useReportTemplates')>('../hooks/useReportTemplates')
  return {
    ...actual,
    useCreateReportTemplate: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useReportTemplate: vi.fn(),
    useTouchReportTemplate: vi.fn(),
  }
})

function buildDims(): SalesDimensionsResponse {
  return {
    stores: [{ number: 1, name: 'Main Street' }],
    categories: [],
    groups: [],
    sectors: [],
    departments: [],
    seasons: [],
    buyers: [],
  }
}

function buildReport(): SalesByDayReport {
  return {
    storeNumbers: [1],
    combineStores: true,
    startDate: '2026-04-01',
    endDate: '2026-04-07',
    comparisonOffsetDays: 364,
    comparisonStartDate: '2025-04-02',
    comparisonEndDate: '2025-04-08',
    storeBreakdowns: [
      {
        storeNumber: 1,
        storeName: 'Main Street',
        storeLabel: '1 - Main Street',
        rows: [
          {
            date: '2026-04-01',
            dayName: 'Wednesday',
            netSales: 266_881.97,
            profit: 155_951.27,
            comparedToDate: '2025-04-02',
            comparedNetSales: 231_389.66,
            comparedProfit: 142_700.12,
            dollarChange: 35_492.31,
            profitChange: 13_251.15,
            pctChange: 15.3,
          },
        ],
        totals: {
          netSales: 266_881.97,
          profit: 155_951.27,
          comparedNetSales: 231_389.66,
          comparedProfit: 142_700.12,
          dollarChange: 35_492.31,
          profitChange: 13_251.15,
          pctChange: 15.3,
        },
      },
    ],
    combined: {
      storeLabel: 'Combined (1 store)',
      rows: [
        {
          date: '2026-04-01',
          dayName: 'Wednesday',
          netSales: 266_881.97,
          profit: 155_951.27,
          comparedToDate: '2025-04-02',
          comparedNetSales: 231_389.66,
          comparedProfit: 142_700.12,
          dollarChange: 35_492.31,
          profitChange: 13_251.15,
          pctChange: 15.3,
        },
      ],
      totals: {
        netSales: 266_881.97,
        profit: 155_951.27,
        comparedNetSales: 231_389.66,
        comparedProfit: 142_700.12,
        dollarChange: 35_492.31,
        profitChange: 13_251.15,
        pctChange: 15.3,
      },
    },
  }
}

function buildAllStoresReport(): SalesByDayReport {
  const report = buildReport()
  return {
    ...report,
    storeNumbers: [],
    combined: report.combined
      ? {
          ...report.combined,
          storeLabel: 'All Stores',
        }
      : null,
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
          <SalesByDayPage />
        </MemoryRouter>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

async function selectFirstStore(user: ReturnType<typeof userEvent.setup>) {
  const selector = document.querySelectorAll<HTMLDivElement>('.ant-select-selector')[0]
  if (!selector) throw new Error('store selector not found')
  await user.click(selector)
  await user.click(await screen.findByText(/Main Street/i))
}

describe('SalesByDayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    vi.mocked(useSalesDimensions).mockReturnValue({
      data: buildDims(),
      isLoading: false,
    } as never)
    vi.mocked(useReportTemplate).mockReturnValue({ data: undefined } as never)
    vi.mocked(useTouchReportTemplate).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(useSalesByDay).mockImplementation((query) => (
      query
        ? {
            data: query.storeNumbers.length === 0 ? buildAllStoresReport() : buildReport(),
            isFetching: false,
            error: null,
          }
        : { data: undefined, isFetching: false, error: null }
    ) as never)
  })

  it('runs as all stores when the store filter is left blank', async () => {
    const user = userEvent.setup()
    renderPage()

    const runButton = screen.getByRole('button', { name: /Run Report/i })
    expect(runButton).toBeEnabled()

    await user.click(runButton)

    await waitFor(() => {
      expect(vi.mocked(useSalesByDay)).toHaveBeenLastCalledWith(
        expect.objectContaining({ storeNumbers: [] }),
      )
    })

    expect((await screen.findAllByText(/All Stores/i)).length).toBeGreaterThan(0)
  })

  it('renders prior-period profit columns after running the report', async () => {
    const user = userEvent.setup()
    renderPage()

    await selectFirstStore(user)
    await user.click(screen.getByRole('button', { name: /Run Report|Re-run/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('columnheader', { name: /Compared Profit/i }).length).toBeGreaterThan(0)
    })

    expect(screen.getByRole('columnheader', { name: /^Date$/i })).toHaveClass('sales-by-day-col-current')
    expect(screen.getByRole('columnheader', { name: /Compared To/i })).toHaveClass(
      'sales-by-day-col-compare',
      'sales-by-day-col-boundary',
    )

    expect(screen.getAllByRole('columnheader', { name: /^Profit Change$/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Compared Profit/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('142,700.12').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/13,251\.15/).length).toBeGreaterThan(0)
  })

  it('updates the live table when a column is hidden in the layout editor', async () => {
    const user = userEvent.setup()
    renderPage()

    await selectFirstStore(user)
    await user.click(screen.getByRole('button', { name: /Run Report|Re-run/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('columnheader', { name: /Compared Profit/i }).length).toBeGreaterThan(0)
    })

    const initialTable = document.querySelector<HTMLTableElement>(
      '.sales-by-day-layout-table .ant-table-content table',
    )
    expect(initialTable?.style.width).toBe('1101px')

    await user.click(screen.getByRole('button', { name: /Table layout/i }))
    await screen.findByText(/Sales by Day table layout/i)

    await user.click(screen.getByRole('switch', { name: /Compared Profit visible/i }))

    await waitFor(() => {
      expect(screen.queryAllByRole('columnheader', { name: /Compared Profit/i })).toHaveLength(0)
    })

    const updatedTable = document.querySelector<HTMLTableElement>(
      '.sales-by-day-layout-table .ant-table-content table',
    )
    expect(updatedTable?.style.width).toBe('991px')
  })
})
