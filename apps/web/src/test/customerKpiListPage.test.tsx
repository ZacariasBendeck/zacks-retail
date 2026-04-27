import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomerKpiListPage from '../pages/customers/CustomerKpiListPage'
import { useCustomerKpiFilterOptions, useCustomerKpiList } from '../hooks/useCustomerKpi'

vi.mock('../hooks/useCustomerKpi', () => ({
  useCustomerKpiList: vi.fn(),
  useCustomerKpiFilterOptions: vi.fn(),
}))

describe('CustomerKpiListPage', () => {
  beforeEach(() => {
    vi.mocked(useCustomerKpiFilterOptions).mockReturnValue({
      data: {
        chains: [],
        cities: [],
        stores: [],
      },
      isLoading: false,
      isError: false,
    } as never)

    vi.mocked(useCustomerKpiList).mockImplementation((params) =>
      ({
        data: {
          data: [
            {
              customerId: 'customer-2',
              accountNumber: 'ACC-2',
              displayName: 'Maria Lopez',
              email: 'maria@example.test',
              phone: null,
              primaryStoreId: '11',
              primaryStoreName: 'City Mall',
              primaryStoreCity: 'Tegucigalpa',
              primaryStoreChain: 'Unlimited',
              lifetimeValue: 900,
              totalOrders: 5,
              avgOrderValue: 180,
              marginValue: 300,
              orders30d: 1,
              orders90d: 2,
              orders365d: 5,
              avgDaysBetweenOrders: 22,
              lastPurchaseDate: '2026-04-20T00:00:00.000Z',
              recencyDays: 6,
              isActive: true,
              isDormant: false,
              discountRatio: 0.15,
              storeLoyaltyRatio: 0.7,
              onlineRatio: 0,
              churnRisk: 'LOW',
              rScore: 5,
              fScore: 4,
              mScore: 4,
              segment: 'vip',
            },
            {
              customerId: 'customer-1',
              accountNumber: 'ACC-1',
              displayName: 'Ana Perez',
              email: 'ana@example.test',
              phone: null,
              primaryStoreId: '12',
              primaryStoreName: 'Downtown',
              primaryStoreCity: 'San Pedro Sula',
              primaryStoreChain: 'Magic Shoes',
              lifetimeValue: 600,
              totalOrders: 2,
              avgOrderValue: 300,
              marginValue: 220,
              orders30d: 0,
              orders90d: 1,
              orders365d: 2,
              avgDaysBetweenOrders: 45,
              lastPurchaseDate: '2026-03-31T00:00:00.000Z',
              recencyDays: 26,
              isActive: true,
              isDormant: false,
              discountRatio: 0.05,
              storeLoyaltyRatio: 0.55,
              onlineRatio: 1,
              churnRisk: 'MEDIUM',
              rScore: 4,
              fScore: 2,
              mScore: 3,
              segment: 'new',
            },
          ],
          summary: {
            customerCount: 2,
            totalLifetimeValue: 1500,
            totalOrders: 7,
            avgLifetimeValue: 750,
            avgOrderValue: 214.29,
            avgRecencyDays: 18.2,
          },
          pagination: {
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 50,
            totalItems: 2,
            totalPages: 1,
          },
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      }) as never,
    )
  })

  it('shows filtered totals above the customer intelligence table', async () => {
    renderPage()

    expect(await screen.findByText('Matching Customers')).toBeInTheDocument()
    expect(screen.getByText('Total LTV')).toBeInTheDocument()
    expect(screen.getByText('Total Orders')).toBeInTheDocument()
    expect(screen.getByText('Avg Recency')).toBeInTheDocument()
    expect(screen.getByText('1,500.00')).toBeInTheDocument()
    expect(screen.getByText('214.29')).toBeInTheDocument()
    expect(screen.getByText('18 days')).toBeInTheDocument()
  })

  it('updates the list sort when a sortable column header is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(vi.mocked(useCustomerKpiList)).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'lifetimeValue', order: 'desc' }),
    )

    await user.click(await screen.findByRole('columnheader', { name: /Orders/i }))

    await waitFor(() => {
      expect(vi.mocked(useCustomerKpiList)).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'totalOrders', order: 'asc' }),
      )
    })
  })
})

function renderPage() {
  return render(
    <ConfigProvider>
      <MemoryRouter initialEntries={['/customers/intelligence']}>
        <Routes>
          <Route path="/customers/intelligence" element={<CustomerKpiListPage />} />
        </Routes>
      </MemoryRouter>
    </ConfigProvider>,
  )
}
