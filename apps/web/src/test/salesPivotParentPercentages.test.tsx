import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import SalesPivotPage from '../pages/salesReporting/SalesPivotPage'
import SalesPivotCustomPage from '../pages/salesReporting/SalesPivotCustomPage'
import { formatParentPercent } from '../pages/salesReporting/salesPivotParentPercentages'
import { useSalesDimensions, useSalesPivot } from '../hooks/useReports'
import type { SalesPivotArgs } from '../hooks/useReports'
import type {
  SalesDimensionsResponse,
  SalesPivotLeafRow,
  SalesPivotReport,
} from '../services/reportApi'
import { DASH } from '../utils/reportFormatters'

const mockState = vi.hoisted(() => ({
  snapshotParams: null as Record<string, unknown> | null,
}))

vi.mock('../hooks/useReports', () => ({
  useSalesDimensions: vi.fn(),
  useSalesPivot: vi.fn(),
}))

vi.mock('../components/sku-link', () => ({
  SkuLink: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('../components/reports/SaveSnapshotButton', () => ({
  default: (props: { disabled?: boolean; getParamsJson: () => Record<string, unknown> }) => {
    mockState.snapshotParams = props.getParamsJson()
    return <button disabled={props.disabled}>Save snapshot</button>
  },
}))

const mockUseSalesDimensions = vi.mocked(useSalesDimensions)
const mockUseSalesPivot = vi.mocked(useSalesPivot)

let lastArgs: SalesPivotArgs | null = null

function dimensions(): SalesDimensionsResponse {
  return {
    stores: [{ number: 1, name: 'Main Street' }],
    chains: [],
    sectors: [{ number: 1, name: 'Apparel' }, { number: 2, name: 'Footwear' }],
    departments: [{ number: 10, name: 'Dept 10' }, { number: 20, name: 'Dept 20' }],
    categories: [
      { number: 100, desc: 'Sneakers' },
      { number: 200, desc: 'Boots' },
      { number: 300, desc: 'Sandals' },
    ],
    seasons: [],
    groups: [],
    buyers: [{ code: 'B1', label: 'Buyer One' }, { code: 'B2', label: 'Buyer Two' }],
  }
}

function leaf(overrides: Partial<SalesPivotLeafRow>): SalesPivotLeafRow {
  return {
    storeNumber: null,
    storeName: null,
    buyerCode: null,
    buyerLabel: null,
    vendorCode: null,
    vendorLabel: null,
    sector: null,
    sectorDesc: null,
    dept: null,
    deptDesc: null,
    categ: null,
    categDesc: null,
    season: null,
    seasonDesc: null,
    groupCode: null,
    groupDesc: null,
    sku: 'SKU',
    skuDescription: null,
    pictureFileName: null,
    onHandQty: 0,
    onHandCostVal: 0,
    qtyTY: 0,
    netSalesTY: 0,
    profitTY: 0,
    qtyLY: 0,
    netSalesLY: 0,
    profitLY: 0,
    ...overrides,
  }
}

function fixedReport(): SalesPivotReport {
  const rows = [
    leaf({
      sector: 1,
      sectorDesc: 'Apparel',
      dept: 10,
      deptDesc: 'Dept 10',
      categ: 100,
      categDesc: 'Sneakers',
      sku: 'SKU-A',
      skuDescription: 'Alpha',
      onHandQty: 10,
      onHandCostVal: 100,
      qtyTY: 6,
      netSalesTY: 60,
      profitTY: 30,
      qtyLY: 3,
      netSalesLY: 30,
      profitLY: 15,
    }),
    leaf({
      sector: 1,
      sectorDesc: 'Apparel',
      dept: 10,
      deptDesc: 'Dept 10',
      categ: 200,
      categDesc: 'Boots',
      sku: 'SKU-B',
      skuDescription: 'Beta',
      onHandQty: 30,
      onHandCostVal: 300,
      qtyTY: 4,
      netSalesTY: 40,
      profitTY: 20,
      qtyLY: 2,
      netSalesLY: 20,
      profitLY: 10,
    }),
    leaf({
      sector: 2,
      sectorDesc: 'Footwear',
      dept: 20,
      deptDesc: 'Dept 20',
      categ: 300,
      categDesc: 'Sandals',
      sku: 'SKU-C',
      skuDescription: 'Gamma',
      onHandQty: 10,
      onHandCostVal: 100,
      qtyTY: 10,
      netSalesTY: 100,
      profitTY: 50,
      qtyLY: 5,
      netSalesLY: 50,
      profitLY: 25,
    }),
  ]

  return {
    variant: 'department',
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    currentYear: 2026,
    priorYear: 2025,
    storeNumbers: [],
    rows,
    totals: {
      onHandQty: 50,
      onHandCostVal: 500,
      qtyTY: 20,
      netSalesTY: 200,
      profitTY: 100,
      qtyLY: 10,
      netSalesLY: 100,
      profitLY: 50,
    },
  }
}

function customReport(): SalesPivotReport {
  const rows = [
    leaf({
      buyerCode: 'B1',
      buyerLabel: 'Buyer One',
      vendorCode: 'V1',
      vendorLabel: 'Vendor One',
      categ: 100,
      categDesc: 'Sneakers',
      sku: 'SKU-A',
      skuDescription: 'Alpha',
      onHandQty: 10,
      onHandCostVal: 100,
      qtyTY: 10,
      netSalesTY: 100,
      profitTY: 50,
      qtyLY: 5,
      netSalesLY: 50,
      profitLY: 25,
    }),
    leaf({
      buyerCode: 'B2',
      buyerLabel: 'Buyer Two',
      vendorCode: 'V2',
      vendorLabel: 'Vendor Two',
      categ: 200,
      categDesc: 'Boots',
      sku: 'SKU-B',
      skuDescription: 'Beta',
      onHandQty: 10,
      onHandCostVal: 100,
      qtyTY: 10,
      netSalesTY: 100,
      profitTY: 50,
      qtyLY: 5,
      netSalesLY: 50,
      profitLY: 25,
    }),
  ]

  return {
    variant: 'custom',
    levels: ['buyer', 'vendor', 'category'],
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    currentYear: 2026,
    priorYear: 2025,
    storeNumbers: [],
    rows,
    totals: {
      onHandQty: 20,
      onHandCostVal: 200,
      qtyTY: 20,
      netSalesTY: 200,
      profitTY: 100,
      qtyLY: 10,
      netSalesLY: 100,
      profitLY: 50,
    },
  }
}

function renderPage(element: ReactElement): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <ConfigProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          {element}
        </MemoryRouter>
      </QueryClientProvider>
    </ConfigProvider>,
  )
}

async function expandUntilText(
  container: HTMLElement,
  user: UserEvent,
  text: RegExp,
): Promise<void> {
  for (let i = 0; i < 8 && !screen.queryByText(text); i += 1) {
    const next = container.querySelector<HTMLButtonElement>('button.ant-table-row-expand-icon-collapsed')
    if (!next) break
    await user.click(next)
  }
  await screen.findByText(text)
}

function rowFor(text: RegExp): HTMLTableRowElement {
  const row = screen.getByText(text).closest('tr')
  if (!row) throw new Error(`Missing row for ${String(text)}`)
  return row
}

describe('Sales Pivot parent percentages', () => {
  beforeEach(() => {
    lastArgs = null
    mockState.snapshotParams = null
    window.sessionStorage.clear()
    Element.prototype.scrollIntoView = vi.fn()
    const fixed = fixedReport()
    const custom = customReport()
    mockUseSalesDimensions.mockReturnValue({
      data: dimensions(),
      isLoading: false,
    } as unknown as ReturnType<typeof useSalesDimensions>)
    mockUseSalesPivot.mockImplementation((run) => {
      const args = run?.args ?? null
      lastArgs = args
      return {
        data: args ? (args.variant === 'custom' ? custom : fixed) : undefined,
        isFetching: false,
        error: null,
      } as unknown as ReturnType<typeof useSalesPivot>
    })
  })

  it('hides percentage columns by default and adds parent percentages on the fixed pivot', async () => {
    const user = userEvent.setup()
    const { container } = renderPage(<SalesPivotPage />)

    await user.click(screen.getByRole('button', { name: /Run Report/i }))

    await waitFor(() => expect(screen.getByText(/1.*Apparel/)).toBeInTheDocument())
    expect(screen.queryByText('% Parent')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Modify filters/i }))
    await user.click(await screen.findByRole('checkbox', { name: /Show % of parent/i }))

    await waitFor(() => expect(screen.getAllByText('% Parent').length).toBeGreaterThanOrEqual(9))
    expect(mockState.snapshotParams).toMatchObject({ showPercentOfParent: true })
    expect(screen.getByText('Percentages')).toBeInTheDocument()
    expect(screen.getByText('% of parent')).toBeInTheDocument()

    await expandUntilText(container, user, /100.*Sneakers/)
    const categoryRow = rowFor(/100.*Sneakers/)
    expect(within(categoryRow).getAllByText('60.0%').length).toBeGreaterThan(0)
  })

  it('uses the same parent percentage behavior on the custom pivot', async () => {
    const user = userEvent.setup()
    renderPage(<SalesPivotCustomPage />)

    await user.click(screen.getByRole('checkbox', { name: /Show % of parent/i }))
    await user.click(screen.getByRole('button', { name: /Run Report/i }))

    await waitFor(() => expect(screen.getByText(/B1.*Buyer One/)).toBeInTheDocument())
    expect(screen.getAllByText('% Parent').length).toBeGreaterThanOrEqual(9)
    expect(lastArgs).toMatchObject({
      variant: 'custom',
      levels: ['buyer', 'vendor', 'category'],
    })

    const buyerRow = rowFor(/B1.*Buyer One/)
    expect(within(buyerRow).getAllByText('50.0%').length).toBeGreaterThan(0)
  })

  it('formats zero-denominator parent percentages as a dash', () => {
    expect(formatParentPercent(10, 0)).toBe(DASH)
  })
})
