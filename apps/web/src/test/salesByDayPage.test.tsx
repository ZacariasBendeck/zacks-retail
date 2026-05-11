import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SalesByDayPage, { parseSalesByDayStoreRangeText } from '../pages/salesReporting/SalesByDayPage'
import { useSalesByDay, useSalesDimensions } from '../hooks/useReports'
import { useStoreChains } from '../hooks/useStores'
import { useReportTemplate, useTouchReportTemplate } from '../hooks/useReportTemplates'
import type { SalesByDayReport, SalesDimensionsResponse } from '../services/reportApi'

vi.mock('../hooks/useReports', () => ({
  useSalesByDay: vi.fn(),
  useSalesDimensions: vi.fn(),
}))

vi.mock('../hooks/useStores', () => ({
  useStoreChains: vi.fn(),
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
    stores: [
      { number: 1, name: 'Main Street' },
      { number: 2, name: 'Second Street' },
      { number: 5, name: 'Fifth Street' },
      { number: 6, name: 'Sixth Street' },
      { number: 7, name: 'Seventh Street' },
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
    window.sessionStorage.clear()
    vi.mocked(useSalesDimensions).mockReturnValue({
      data: buildDims(),
      isLoading: false,
    } as never)
    vi.mocked(useStoreChains).mockReturnValue({
      data: [
        {
          id: 'unlimited',
          label: 'Unlimited',
          active: true,
          sortOrder: 10,
          storeNumbers: [1],
          storeCount: 1,
        },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useReportTemplate).mockReturnValue({ data: undefined } as never)
    vi.mocked(useTouchReportTemplate).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(useSalesByDay).mockImplementation((run) => (
      run
        ? {
            data: run.args.storeNumbers.length === 0 ? buildAllStoresReport() : buildReport(),
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
        expect.objectContaining({ args: expect.objectContaining({ storeNumbers: [] }) }),
      )
    })

    expect((await screen.findAllByText(/All Stores/i)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/^Store$/i)).not.toBeInTheDocument()
  })

  it('expands a store range input against the active store list before running', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/Store range/i), '1-3,5-7')
    await user.click(screen.getByRole('button', { name: /Run Report/i }))

    await waitFor(() => {
      expect(vi.mocked(useSalesByDay)).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: expect.objectContaining({ storeNumbers: [1, 2, 5, 6, 7] }) }),
      )
    })
  })

  it('renders the RICS Sales by Day columns by default after running the report', async () => {
    const user = userEvent.setup()
    renderPage()

    await selectFirstStore(user)
    await user.click(screen.getByRole('button', { name: /Run Report|Re-run/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('columnheader', { name: /Compared Net/i }).length).toBeGreaterThan(0)
    })

    expect(screen.getByRole('columnheader', { name: /^Date$/i })).toHaveClass('sales-by-day-col-current')
    expect(screen.getByRole('columnheader', { name: /Compared To/i })).toHaveClass(
      'sales-by-day-col-compare',
      'sales-by-day-col-boundary',
    )

    expect(screen.queryByRole('columnheader', { name: /^Profit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /Compared Profit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /^Profit Change$/i })).not.toBeInTheDocument()
    expect(screen.queryByText('142,700.12')).not.toBeInTheDocument()
    expect(screen.queryByText(/13,251\.15/)).not.toBeInTheDocument()
    expect(screen.getByText(/\$ Change/i)).toBeInTheDocument()
    expect(screen.getByText(/^Totals$/i)).toBeInTheDocument()
    expect(screen.getAllByText('266,881.97').length).toBeGreaterThan(1)
  })

  it('toggles all profit columns with one button', async () => {
    const user = userEvent.setup()
    renderPage()

    await selectFirstStore(user)
    await user.click(screen.getByRole('button', { name: /Run Report|Re-run/i }))

    await waitFor(() => {
      expect(screen.queryByRole('columnheader', { name: /^Profit$/i })).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Show profit columns/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('columnheader', { name: /Compared Profit/i }).length).toBeGreaterThan(0)
      expect(screen.getAllByRole('columnheader', { name: /^Profit Change$/i }).length).toBeGreaterThan(0)
      expect(screen.getAllByText('155,951.27').length).toBeGreaterThan(0)
      expect(screen.getAllByText('142,700.12').length).toBeGreaterThan(0)
      expect(screen.getAllByText(/13,251\.15/).length).toBeGreaterThan(0)
    })

    await user.click(screen.getByRole('button', { name: /Hide profit columns/i }))

    await waitFor(() => {
      expect(screen.queryByRole('columnheader', { name: /^Profit$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: /Compared Profit/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: /^Profit Change$/i })).not.toBeInTheDocument()
    })
  })

  it('updates the live table when a hidden profit column is enabled in the layout editor', async () => {
    const user = userEvent.setup()
    renderPage()

    await selectFirstStore(user)
    await user.click(screen.getByRole('button', { name: /Run Report|Re-run/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('columnheader', { name: /Compared Net/i }).length).toBeGreaterThan(0)
    })
    expect(screen.queryAllByRole('columnheader', { name: /Compared Profit/i })).toHaveLength(0)

    const initialTable = document.querySelector<HTMLTableElement>(
      '.sales-by-day-layout-table .ant-table-content table',
    )
    expect(initialTable?.style.width).toBe('771px')

    await user.click(screen.getByRole('button', { name: /Table layout/i }))
    await screen.findByText(/Sales by Day table layout/i)

    await user.click(screen.getByRole('switch', { name: /Compared Profit visible/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('columnheader', { name: /Compared Profit/i }).length).toBeGreaterThan(0)
    })

    const updatedTable = document.querySelector<HTMLTableElement>(
      '.sales-by-day-layout-table .ant-table-content table',
    )
    expect(updatedTable?.style.width).toBe('881px')
  })
})

describe('parseSalesByDayStoreRangeText', () => {
  it('deduplicates ranges and skips inactive numbers inside ranges', () => {
    expect(parseSalesByDayStoreRangeText('1-3,2,5-7', [1, 2, 5, 6, 7])).toEqual({
      storeNumbers: [1, 2, 5, 6, 7],
      error: null,
    })
  })

  it('rejects descending ranges', () => {
    expect(parseSalesByDayStoreRangeText('7-5', [5, 6, 7]).error).toMatch(/low to high/i)
  })
})
