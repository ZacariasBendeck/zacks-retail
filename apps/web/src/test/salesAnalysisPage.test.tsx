import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SalesAnalysisPage from '../pages/salesReporting/SalesAnalysisPage'
import RenderSalesAnalysis from '../components/reports/renderers/renderSalesAnalysis'
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

vi.mock('../components/sku-link', () => ({
  SkuLink: ({ children, skuCode }: { children: React.ReactNode; skuCode: string }) => (
    <a href={`/products/sku/${skuCode}`}>{children}</a>
  ),
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
        attributeAssignments: {
          color: { valueCodes: ['black'], valueLabels: ['Black'], label: 'Black' },
          heel_height: { valueCodes: ['mid', 'high'], valueLabels: ['Mid', 'High'], label: 'Mid, High' },
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
        attributeAssignments: {
          color: { valueCodes: ['blue'], valueLabels: ['Blue'], label: 'Blue' },
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
    attributeDimensions: [
      { code: 'color', label: 'Color', isMultiValue: false, sortOrder: 10 },
      { code: 'heel_height', label: 'Altura del Tacon', isMultiValue: true, sortOrder: 20 },
    ],
  }
}

function reportWithAdditionalCategory(): SalesAnalysisReport {
  const base = report()
  const accessoryRow: SalesAnalysisReport['rows'][number] = {
    dimensionKey: '1000-BLK',
    dimensionLabel: 'Accessory SKU',
    storeNumber: null,
    qty: 1,
    netSales: 50,
    cogs: 20,
    grossProfit: 30,
    gpPct: 60,
    unitsOnHand: 10,
    inventoryUnitCost: 10,
    onHandAtCost: 100,
    turns: 0.2,
    roiPct: 30,
    priorYearNetSales: null,
    pyPctChange: null,
    attributes: {
      description: 'Accessory SKU',
      vendorCode: 'ACC',
      manufacturer: 'Accessories',
      categoryNumber: 100,
      categoryDesc: 'Accesorios Mujer',
      departmentNumber: 5,
      departmentDesc: 'Zapato Mujer',
      season: 'A',
      groupCode: 'IBL',
      styleColor: 'PLAN/BK',
      currentPrice: 50,
      currentCost: 10,
      unitsOnHand: 10,
      pictureUrl: '/api/rics-images/1000-BLK.jpg',
      extended: {},
    },
    attributeAssignments: {
      color: { valueCodes: ['black'], valueLabels: ['Black'], label: 'Black' },
    },
  }
  return {
    ...base,
    rows: [...base.rows, accessoryRow],
    totals: {
      ...base.totals,
      qty: base.totals.qty + accessoryRow.qty,
      netSales: base.totals.netSales + accessoryRow.netSales,
      cogs: base.totals.cogs + accessoryRow.cogs,
      grossProfit: base.totals.grossProfit + accessoryRow.grossProfit,
      unitsOnHand: base.totals.unitsOnHand + accessoryRow.unitsOnHand,
      onHandAtCost: base.totals.onHandAtCost + accessoryRow.onHandAtCost,
    },
  }
}

function renderPage(initialEntry = '/reports/sales/analysis'): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <ConfigProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <SalesAnalysisPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ConfigProvider>,
  )
}

function expectTextBefore(first: string, second: string): void {
  expect(screen.getByText(first).compareDocumentPosition(screen.getByText(second)) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy()
}

describe('SalesAnalysisPage', () => {
  beforeEach(() => {
    lastArgs = null
    window.sessionStorage.clear()
    Element.prototype.scrollIntoView = vi.fn()
    mockUseSalesDimensions.mockReturnValue({ data: dims(), isLoading: false } as unknown as ReturnType<typeof useSalesDimensions>)
    const reportData = report()
    mockUseSalesAnalysis.mockImplementation((run) => {
      lastArgs = run?.args ?? null
      return { data: run ? reportData : undefined, isFetching: false, error: null } as unknown as ReturnType<
        typeof useSalesAnalysis
      >
    })
    mockUseReportTemplate.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useReportTemplate>)
    mockUseTouchReportTemplate.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useTouchReportTemplate>)
  })

  afterEach(() => {
    vi.useRealTimers()
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
    expect(csvHref).not.toContain('groupOrder')

    const xlsxHref = screen.getByRole('link', { name: /Export XLSX/i }).getAttribute('href') ?? ''
    expect(xlsxHref).toContain('format=xlsx')
    expect(xlsxHref).toContain('storeOption=COMBINE')
    expect(xlsxHref).not.toContain('groupOrder')
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

  it('switches leftmost groups to alphabetical order without changing API args', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Run Report/i }))

    await waitFor(() => {
      expectTextBefore('8 - Low Stock Dept', '5 - Zapato Mujer')
    })
    const argsJsonAfterRun = JSON.stringify(lastArgs)

    await user.click(screen.getByRole('button', { name: /Modify filters/i }))
    await user.click(await screen.findByText('A-Z'))

    await waitFor(() => {
      expectTextBefore('5 - Zapato Mujer', '8 - Low Stock Dept')
    })
    expect(JSON.stringify(lastArgs)).toBe(argsJsonAfterRun)
  })

  it('keeps second-level groups alphabetical when A-Z order is selected', async () => {
    const user = userEvent.setup()
    const reportData = reportWithAdditionalCategory()
    mockUseSalesAnalysis.mockImplementation((run) => {
      lastArgs = run?.args ?? null
      return { data: run ? reportData : undefined, isFetching: false, error: null } as unknown as ReturnType<
        typeof useSalesAnalysis
      >
    })
    renderPage()

    await user.click(screen.getByRole('button', { name: /Run Report/i }))
    await user.click(screen.getByRole('button', { name: /Modify filters/i }))
    await user.click(await screen.findByText('A-Z'))

    const deptRow = screen.getByText('5 - Zapato Mujer').closest('tr')
    expect(deptRow).toBeTruthy()
    await user.click(deptRow!.querySelector<HTMLButtonElement>('button.ant-table-row-expand-icon')!)

    await waitFor(() => {
      expectTextBefore('100 - Accesorios Mujer', '216 - Zap Deport Mujer')
    })
  })

  it('shows tree percentages against each row parent subtotal', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByLabelText(/Show % of total/i))
    await user.click(screen.getByRole('button', { name: /Run Report/i }))

    await waitFor(() => {
      expect(screen.getByText('5 - Zapato Mujer')).toBeInTheDocument()
    })

    const deptRow = screen.getByText('5 - Zapato Mujer').closest('tr')
    expect(deptRow).toBeTruthy()
    await user.click(deptRow!.querySelector<HTMLButtonElement>('button.ant-table-row-expand-icon')!)

    const categoryLabel = await screen.findByText('216 - Zap Deport Mujer')
    const categoryRow = categoryLabel.closest('tr')
    expect(categoryRow).toBeTruthy()
    expect(within(categoryRow!).getAllByText('100.0%').length).toBeGreaterThanOrEqual(4)
  })

  it('toggles the report results into full screen mode', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()

    await user.click(screen.getByRole('button', { name: /Run Report/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Full screen/i })).toBeEnabled()
    })
    await user.click(screen.getByRole('button', { name: /Full screen/i }))

    expect(container.querySelector('.sales-analysis-report--fullscreen')).toBeTruthy()

    await user.click(screen.getAllByRole('button', { name: /Exit full screen/i })[0]!)

    await waitFor(() => {
      expect(container.querySelector('.sales-analysis-report--fullscreen')).toBeNull()
    })
  })

  it('renders a 3-level attribute hierarchy and switches attribute dimension without refetch args', async () => {
    const user = userEvent.setup()
    mockUseReportTemplate.mockReturnValue({
      data: {
        template: {
          reportType: 'sales-analysis',
          paramsJson: {
            dateSpec: { type: 'trailing_days', days: 7 },
            hierarchyDepth: 3,
            level1: 'department',
            level2: 'category',
            level3: 'attribute',
            attributeDimensionCode: 'color',
            storeOption: 'COMBINE',
          },
        },
      },
    } as unknown as ReturnType<typeof useReportTemplate>)

    const { container } = renderPage('/reports/sales/analysis?templateId=attr')

    await waitFor(() => {
      expect(lastArgs).toMatchObject({
        dimension: 'CATEGORY',
        reportType: 'SKU_DETAIL',
        includeAttributes: true,
      })
    })
    const argsJsonAfterRun = JSON.stringify(lastArgs)
    expect(argsJsonAfterRun).not.toContain('attributeDimension')

    const expandButtons = () => Array.from(
      container.querySelectorAll<HTMLButtonElement>('button.ant-table-row-expand-icon'),
    )
    await waitFor(() => expect(expandButtons().length).toBeGreaterThan(0))
    for (let i = 0; i < 4 && !screen.queryByText('Blue'); i += 1) {
      const next = expandButtons().find((button) => button.className.includes('collapsed'))
      if (!next) break
      await user.click(next)
    }

    await waitFor(() => {
      expect(screen.getByText('Blue')).toBeInTheDocument()
    })

    const selector = screen.getAllByLabelText('Attribute dimension')[0]!.closest('.ant-select')!
    fireEvent.mouseDown(selector.querySelector('.ant-select-selector')!)
    await user.click(await screen.findByText('Altura del Tacon'))

    await waitFor(() => {
      expect(screen.getByText('(No Altura del Tacon)')).toBeInTheDocument()
    })
    expect(JSON.stringify(lastArgs)).toBe(argsJsonAfterRun)
  })

  it('runs trailing month templates as closed calendar months', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-05-07T12:00:00Z'))
    mockUseReportTemplate.mockReturnValue({
      data: {
        template: {
          reportType: 'sales-analysis',
          paramsJson: {
            dateSpec: { type: 'trailing_months', months: 12 },
            level1: 'department',
            level2: 'category',
            storeOption: 'COMBINE',
          },
        },
      },
    } as unknown as ReturnType<typeof useReportTemplate>)

    renderPage('/reports/sales/analysis?templateId=last12')

    await waitFor(() => {
      expect(lastArgs).toMatchObject({
        startDate: '2025-05-01',
        endDate: '2026-04-30',
      })
    })
  })

  it('hydrates saved alphabetical group order from a template', async () => {
    mockUseReportTemplate.mockReturnValue({
      data: {
        template: {
          reportType: 'sales-analysis',
          paramsJson: {
            dateSpec: { type: 'trailing_days', days: 7 },
            level1: 'department',
            level2: 'category',
            storeOption: 'COMBINE',
            groupOrder: 'LEFT_GROUP_ASC',
          },
        },
      },
    } as unknown as ReturnType<typeof useReportTemplate>)

    renderPage('/reports/sales/analysis?templateId=alpha')

    await waitFor(() => {
      expect(lastArgs).toMatchObject({
        groupOrder: 'LEFT_GROUP_ASC',
      })
    })
    await waitFor(() => {
      expectTextBefore('5 - Zapato Mujer', '8 - Low Stock Dept')
    })
  })
})

describe('RenderSalesAnalysis', () => {
  it('uses saved alphabetical group order for frozen snapshots', async () => {
    const user = userEvent.setup()
    render(
      <ConfigProvider>
        <RenderSalesAnalysis
          result={reportWithAdditionalCategory()}
          params={{
            level1: 'department',
            level2: 'category',
            groupOrder: 'LEFT_GROUP_ASC',
          }}
        />
      </ConfigProvider>,
    )

    await waitFor(() => {
      expectTextBefore('5 - Zapato Mujer', '8 - Low Stock Dept')
    })

    const deptRow = screen.getByText('5 - Zapato Mujer').closest('tr')
    expect(deptRow).toBeTruthy()
    await user.click(deptRow!.querySelector<HTMLButtonElement>('button.ant-table-row-expand-icon')!)

    await waitFor(() => {
      expectTextBefore('100 - Accesorios Mujer', '216 - Zap Deport Mujer')
    })
  })

  it('uses parent subtotal percentages for frozen hierarchy snapshots', async () => {
    const user = userEvent.setup()
    render(
      <ConfigProvider>
        <RenderSalesAnalysis
          result={report()}
          params={{
            level1: 'department',
            level2: 'category',
            showPercentOfTotal: true,
          }}
        />
      </ConfigProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('5 - Zapato Mujer')).toBeInTheDocument()
    })

    const deptRow = screen.getByText('5 - Zapato Mujer').closest('tr')
    expect(deptRow).toBeTruthy()
    await user.click(deptRow!.querySelector<HTMLButtonElement>('button.ant-table-row-expand-icon')!)

    const categoryLabel = await screen.findByText('216 - Zap Deport Mujer')
    const categoryRow = categoryLabel.closest('tr')
    expect(categoryRow).toBeTruthy()
    expect(within(categoryRow!).getAllByText('100.0%').length).toBeGreaterThanOrEqual(4)
  })
})
