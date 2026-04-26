import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PosBootstrap } from '../types/salesPos'
import EnterSalesPage from '../pages/sales/enter/EnterSalesPage'

vi.mock('../components/sku-lookup', () => ({
  SkuLookup: ({ open, initialQuery }: { open: boolean; initialQuery?: string }) =>
    open ? <div data-testid="sku-lookup">SKU Lookup Seed: {initialQuery ?? ''}</div> : null,
}))

vi.mock('../services/salesPosApi', () => ({
  salesPosApi: {
    getBootstrap: vi.fn(),
    lookupProduct: vi.fn(),
    openShift: vi.fn(),
    getClosePreview: vi.fn(),
    closeShift: vi.fn(),
    getTicket: vi.fn(),
    patchHeader: vi.fn(),
    addLine: vi.fn(),
    updateLine: vi.fn(),
    rotateLinePrice: vi.fn(),
    removeLine: vi.fn(),
    voidTicket: vi.fn(),
    completeTicket: vi.fn(),
    getReclaimableTickets: vi.fn(),
    reclaimTicket: vi.fn(),
    getCompletedTickets: vi.fn(),
    reprintTicket: vi.fn(),
    createPayout: vi.fn(),
    verifySalesPin: vi.fn(),
    searchCustomers: vi.fn(),
  },
}))

import { salesPosApi } from '../services/salesPosApi'

const bootstrapFixture: PosBootstrap = {
  currentUser: {
    id: 'user-1',
    displayName: 'Alex',
    salespersonCode: 'ALX',
    permissions: ['sales_pos.operate'],
  },
  selectedStoreId: 20,
  selectedRegisterCode: 'MAIN',
  otherChargeLabel: 'Other Charges',
  stores: [{ id: 20, code: '020', name: 'Magic Shoes', active: true }],
  registers: [{ id: 'register-1', code: 'MAIN', label: 'Main Register', active: true }],
  employees: [{ id: 'user-1', displayName: 'Alex', salespersonCode: 'ALX' }],
  tenderTypes: [
    {
      id: 'tender-1',
      code: '1',
      label: 'Cash',
      kind: 'CASH',
      requiresAccount: false,
      openDrawer: true,
    },
  ],
  payoutCategories: [],
  promotions: [],
  returnCodes: [],
  shift: {
    id: 'shift-1',
    storeId: 20,
    registerId: 'register-1',
    registerCode: 'MAIN',
    businessDate: '2026-04-25T00:00:00.000Z',
    status: 'OPEN',
    openedByUserId: 'user-1',
    openedByName: 'Alex',
    openingCashFloat: 0,
    expectedCashTotal: null,
    actualCashTotal: null,
    overShortAmount: null,
    openedAt: '2026-04-25T13:22:00.000Z',
    closedAt: null,
    lastTicketNumber: 1,
  },
  activeTicket: {
    id: 'ticket-1',
    shiftId: 'shift-1',
    storeId: 20,
    registerId: 'register-1',
    ticketNumber: 1,
    status: 'DRAFT',
    transactionType: 'REGULAR',
    cashierUserId: 'user-1',
    cashierName: 'Alex',
    customerId: null,
    customerAccountNumber: null,
    customerName: null,
    headerDiscountPct: null,
    promotionCode: null,
    shipToState: null,
    subtotal: 0,
    taxTotal: 0,
    secondaryTaxTotal: 0,
    otherCharges: 0,
    grandTotal: 0,
    totalTendered: 0,
    changeGiven: 0,
    comment: null,
    completedAt: null,
    voidedAt: null,
    receiptPrintCount: 0,
    lines: [],
    tenders: [],
  },
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider>
        <AntApp>
          <EnterSalesPage />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('EnterSalesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(salesPosApi.getBootstrap).mockResolvedValue(bootstrapFixture)
    vi.mocked(salesPosApi.searchCustomers).mockResolvedValue([])
    vi.mocked(salesPosApi.patchHeader).mockResolvedValue({ ticket: bootstrapFixture.activeTicket })
    vi.mocked(salesPosApi.lookupProduct).mockResolvedValue({
      code: 'SKU-100',
      skuId: 'sku-100',
      description: 'Seeded SKU',
      upc: '999000111',
      sizeTypeCode: null,
      sizeTypeDescription: null,
      columns: [],
      rows: [],
      defaultColumnLabel: '',
      defaultRowLabel: '',
      coupon: false,
      defaultQuantity: 1,
      priceSlots: [{ code: 'RETAIL', label: 'Retail', amount: 100 }],
      defaultPriceMode: 'RETAIL',
      defaultUnitPrice: 100,
      taxable: true,
      perks: 0,
    })
  })

  it('renders the ticket header first when an open draft ticket exists', async () => {
    renderPage()

    await waitFor(() => expect(screen.queryByText('Batch Open')).toBeInTheDocument())
    expect(await screen.findByRole('button', { name: 'UPC Price Scan' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Scan barcode or type SKU')).not.toBeInTheDocument()
  })

  it('opens the shared SKU lookup seeded with the resolved SKU when a UPC is entered', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.queryByText('Batch Open')).toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: 'UPC Price Scan' }))
    expect(await screen.findByRole('button', { name: 'Change Header' })).toBeInTheDocument()

    const codeInput = await screen.findByPlaceholderText('Scan barcode or type SKU')
    await user.clear(codeInput)
    await user.type(codeInput, '999000111{enter}')

    await waitFor(() => expect(salesPosApi.lookupProduct).toHaveBeenCalledWith('999000111'))
    expect(await screen.findByTestId('sku-lookup')).toHaveTextContent('SKU-100')
  })
})
