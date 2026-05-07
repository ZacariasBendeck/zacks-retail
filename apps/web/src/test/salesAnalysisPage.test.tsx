import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SalesAnalysisPage from '../pages/salesReporting/SalesAnalysisPage'
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
    stores: [{ number: 1, name: 'Main Street' }],
    chains: [],
    sectors: [],
    departments: [{ number: 5, name: 'Zapato Mujer' }],
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
        dimensionLabel: 'ZapDpAm5PUAGO A',
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
          extended: {},
        },
      },
      {
        dimensionKey: '2200-BLUE',
        dimensionLabel: 'Low stock SKU',
        storeNumber: null,
        qty: 1,
        netSales: 1200,
        cogs: 500,
        grossProfit: 700,
        gpPct: 58.3,
        unitsOnHand: 4,
        inventoryUnitCost: 50,
        onHandAtCost: 200,
        turns: 1.1,
        roiPct: 72,
        priorYearNetSales: null,
        pyPctChange: null,
        attributes: {
          description: 'Low stock SKU',
          vendorCode: 'LOW',
          manufacturer: 'Low Stock Vendor',
          categoryNumber: 301,
          categoryDesc: 'Low Stock Category',
          departmentNumber: 8,
          departmentDesc: 'Low Stock Dept',
          season: 'A',
          groupCode: 'IBL',
          styleColor: 'PLAN/BL',
          currentPrice: 1200,
          currentCost: 50,
          unitsOnHand: 4,
          pictureUrl: '/api/rics-images/2200-BLUE.jpg',
          extended: {},
        },
      },
    ],
    totals: {
      qty: 3,
      netSales: 2107,
      cogs: 845,
      grossProfit: 1262,
      unitsOnHand: 41,
      inventoryUnitCost: 160.2,
      onHandAtCost: 6568,
      gpPct: 59.9,
      turns: 0.3,
      roiPct: 52,
      priorYearNetSales: null,
      pyPctChange: null,
    },
  }
}

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <ConfigProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <SalesAnalysisPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ConfigProvider>,
  )
}

describe('SalesAnalysisPage', () => {
  beforeEach(() => {
    lastArgs = null
    Element.prototype.scrollIntoView = vi.fn()
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

  it('enables CSV and XLSX export links after a report run', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByTestId('export-xlsx')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Run Report/i }))

    await waitFor(() => {
      expect(lastArgs).toMatchObject({
        dimension: 'CATEGORY',
        reportType: 'SKU_DETAIL',
        includeAttributes: true,
      })
    })

    const csvHref = screen.getByRole('link', { name: /Export CSV/i }).getAttribute('href') ?? ''
    expect(csvHref).toContain('/api/v1/reports/sales/sales-analysis')
    expect(csvHref).toContain('format=csv')
    expect(csvHref).toContain('includeAttributes=true')

    const xlsxHref = screen.getByRole('link', { name: /Export XLSX/i }).getAttribute('href') ?? ''
    expect(xlsxHref).toContain('format=xlsx')
    expect(xlsxHref).toContain('storeOption=COMBINE')
  })

  it('sorts the Sales Analysis table from metric column headers', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Run Report/i }))

    await waitFor(() => {
      expect(screen.getByText('8 - Low Stock Dept')).toBeInTheDocument()
    })

    const highSalesDept = screen.getByText('8 - Low Stock Dept')
    const highOnHandDept = screen.getByText('5 - Zapato Mujer')
    expect(highSalesDept.compareDocumentPosition(highOnHandDept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const [onHandQtyHeader] = screen.getAllByText('On Hand Qty')
    expect(onHandQtyHeader).toBeDefined()
    await user.click(onHandQtyHeader!)

    await waitFor(() => {
      expect(
        screen.getByText('5 - Zapato Mujer').compareDocumentPosition(screen.getByText('8 - Low Stock Dept')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
  })
})
