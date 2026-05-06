import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SalesAnalysisPictureReportPage from '../pages/salesReporting/SalesAnalysisPictureReportPage'
import { useSalesAnalysis, useSalesDimensions } from '../hooks/useReports'
import { useReportTemplate, useTouchReportTemplate } from '../hooks/useReportTemplates'
import type { SalesAnalysisArgs } from '../hooks/useReports'
import type { SalesAnalysisReport, SalesDimensionsResponse } from '../services/reportApi'

vi.mock('../hooks/useReports', () => ({
  useSalesAnalysis: vi.fn(),
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

vi.mock('../hooks/useReportRuns', () => ({
  useCreateReportRun: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}))

const mockUseSalesAnalysis = vi.mocked(useSalesAnalysis)
const mockUseSalesDimensions = vi.mocked(useSalesDimensions)
const mockUseReportTemplate = vi.mocked(useReportTemplate)
const mockUseTouchReportTemplate = vi.mocked(useTouchReportTemplate)

let lastArgs: SalesAnalysisArgs | null = null

function dims(): SalesDimensionsResponse {
  return {
    stores: [{ number: 2, name: 'Store 2' }],
    chains: [],
    sectors: [],
    departments: [],
    categories: [{ number: 216, desc: 'Zap Deport Mujer' }],
    seasons: [{ code: 'A', description: 'A' }],
    groups: [{ code: 'IBL', desc: 'IBL' }],
    buyers: [],
  }
}

function report(): SalesAnalysisReport {
  return {
    dimension: 'CATEGORY',
    reportType: 'SKU_DETAIL',
    storeOption: 'COMBINE',
    periodDays: 7,
    rows: [
      {
        dimensionKey: '6608-BKPU',
        dimensionLabel: null,
        storeNumber: null,
        qty: 2,
        netSales: 907,
        cogs: 345,
        grossProfit: 562,
        gpPct: 62,
        unitsOnHand: 37,
        inventoryUnitCost: 172.11,
        onHandAtCost: 6368,
        turns: 0.3,
        roiPct: 52,
        priorYearNetSales: null,
        pyPctChange: null,
        attributes: {
          description: 'ZapDpAm5PUAGO A',
          vendorCode: 'AGO',
          manufacturer: 'AGO Tianfu',
          categoryNumber: 216,
          categoryDesc: 'Zap Deport Mujer',
          departmentNumber: 5,
          departmentDesc: 'Zapato Mujer',
          season: 'A',
          groupCode: 'IBL',
          styleColor: 'PLAN/BK',
          currentPrice: 907,
          currentCost: 172.11,
          unitsOnHand: 37,
          pictureUrl: '/api/rics-images/6608-BKPU.jpg',
          keywords: 'IBL ZB C2523 2D50',
          sizeType: 216,
          labelCode: 'H',
          colorCode: 'N/BK',
          discountCode: '10',
          dateFirstReceived: '2026-01-01',
          dateLastReceived: '2026-03-01',
          ageDays: 90,
          extended: { material: 'PU', style: 'PLAN', color: 'N/BK', temp: 'A' },
        },
      },
    ],
    totals: {
      qty: 2,
      netSales: 907,
      cogs: 345,
      grossProfit: 562,
      unitsOnHand: 37,
      inventoryUnitCost: 172.11,
      onHandAtCost: 6368,
      gpPct: 62,
      turns: 0.3,
      roiPct: 52,
      priorYearNetSales: null,
    },
  }
}

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <ConfigProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <SalesAnalysisPictureReportPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ConfigProvider>,
  )
}

describe('SalesAnalysisPictureReportPage', () => {
  beforeEach(() => {
    lastArgs = null
    window.localStorage.clear()
    mockUseSalesDimensions.mockReturnValue({ data: dims(), isLoading: false } as unknown as ReturnType<typeof useSalesDimensions>)
    mockUseSalesAnalysis.mockImplementation((args: SalesAnalysisArgs | null) => {
      lastArgs = args
      return { data: args ? report() : undefined, isFetching: false, error: null } as unknown as ReturnType<
        typeof useSalesAnalysis
      >
    })
    mockUseReportTemplate.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useReportTemplate>)
    mockUseTouchReportTemplate.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useTouchReportTemplate>)
  })

  it('runs SKU detail sales analysis with attributes and renders a flat picture grid', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Run Report/i }))

    await waitFor(() => {
      expect(lastArgs).toMatchObject({
        dimension: 'CATEGORY',
        reportType: 'SKU_DETAIL',
        includeAttributes: true,
      })
    })
    expect(screen.getByText('6608-BKPU')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '6608-BKPU' })).toHaveAttribute('src', '/api/rics-images/6608-BKPU.jpg')
    expect(screen.queryByText(/Subtotal/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Totals$/i)).not.toBeInTheDocument()
    expect(screen.getAllByLabelText(/^Filter /i).length).toBeGreaterThan(5)
  })

  it('filters loaded rows from the column selector without re-querying', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Run Report/i }))
    const argsAfterRun = lastArgs

    const vendorFilters = await screen.findAllByLabelText('Filter Vendor')
    const vendorFilter = vendorFilters[0]
    expect(vendorFilter).toBeDefined()
    await user.click(vendorFilter!)
    await user.click(await screen.findByRole('button', { name: /Deselect all/i }))
    await user.click(await screen.findByRole('button', { name: /Apply/i }))

    expect(screen.queryByText('6608-BKPU')).not.toBeInTheDocument()
    expect(lastArgs).toBe(argsAfterRun)
  })
})
