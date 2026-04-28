import { render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomerKpiDetailPage from '../pages/customers/CustomerKpiDetailPage'
import { useCustomer } from '../hooks/useCustomers'
import { useCustomerMetrics, useRecomputeCustomerMetrics } from '../hooks/useCustomerKpi'
import { CustomerTicketHistoryButton } from '../components/customers/CustomerTicketHistoryButton'

vi.mock('../hooks/useCustomers', () => ({
  useCustomer: vi.fn(),
}))

vi.mock('../hooks/useCustomerKpi', () => ({
  useCustomerMetrics: vi.fn(),
  useRecomputeCustomerMetrics: vi.fn(),
}))

vi.mock('../components/customers/CustomerTicketHistoryButton', () => ({
  CustomerTicketHistoryButton: vi.fn(() => <button type="button">Tickets</button>),
}))

describe('CustomerKpiDetailPage', () => {
  beforeEach(() => {
    vi.mocked(useCustomer).mockReturnValue({
      data: {
        id: 'customer-1',
        displayName: 'Test Customer',
      },
      isLoading: false,
      isError: false,
    } as never)

    vi.mocked(useCustomerMetrics).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Metrics endpoint failed'),
      refetch: vi.fn(),
    } as never)

    vi.mocked(useRecomputeCustomerMetrics).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
  })

  it('shows a metrics error instead of silently rendering zero KPI cards', async () => {
    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/customers/customer-1']}>
          <Routes>
            <Route path="/customers/:customerId" element={<CustomerKpiDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(await screen.findByText('Unable to load customer KPI metrics')).toBeInTheDocument()
    expect(screen.getByText('Metrics endpoint failed')).toBeInTheDocument()
    expect(screen.queryByText('Lifetime Value')).not.toBeInTheDocument()
  })

  it('renders the ticket history button on the customer detail page', async () => {
    vi.mocked(useCustomer).mockReturnValue({
      data: {
        id: 'customer-1',
        displayName: 'Test Customer',
        accountNumber: 'ACC-1',
        email: null,
        phoneE164: null,
      },
      isLoading: false,
      isError: false,
    } as never)

    vi.mocked(useCustomerMetrics).mockReturnValue({
      data: {
        totalOrders: 1,
        churnRisk: 'LOW',
        isDormant: false,
        recencyDays: 7,
        lifetimeValue: 100,
        avgOrderValue: 100,
        marginValue: 40,
        discountRatio: 0,
        storeLoyaltyRatio: 1,
        onlineRatio: 0,
        orders30d: 1,
        orders90d: 1,
        orders365d: 1,
        avgDaysBetweenOrders: 30,
        lastPurchaseDate: '2026-04-20T00:00:00.000Z',
        rScore: 5,
        fScore: 4,
        mScore: 4,
        dataSource: 'transaction_fact',
      },
      isLoading: false,
      isError: false,
    } as never)

    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/customers/customer-1']}>
          <Routes>
            <Route path="/customers/:customerId" element={<CustomerKpiDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Tickets' })).toBeInTheDocument()
    expect(vi.mocked(CustomerTicketHistoryButton)).toHaveBeenCalled()
  })
})
