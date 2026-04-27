import { render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomerKpiDetailPage from '../pages/customers/CustomerKpiDetailPage'
import { useCustomer } from '../hooks/useCustomers'
import { useCustomerMetrics, useRecomputeCustomerMetrics } from '../hooks/useCustomerKpi'

vi.mock('../hooks/useCustomers', () => ({
  useCustomer: vi.fn(),
}))

vi.mock('../hooks/useCustomerKpi', () => ({
  useCustomerMetrics: vi.fn(),
  useRecomputeCustomerMetrics: vi.fn(),
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
})
