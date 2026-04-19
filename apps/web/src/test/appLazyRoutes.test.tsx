import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'

vi.mock('../pages/inventory/DashboardPage', async () => {
  await new Promise((resolve) => setTimeout(resolve, 25))
  return { default: () => <div data-testid="page-inventory-dashboard">Inventory Dashboard</div> }
})
vi.mock('../pages/purchasing/PurchaseOrdersPage', () => ({
  default: () => <div data-testid="page-purchasing-orders">Purchase Orders</div>,
}))
vi.mock('../pages/otb/OtbDashboardPage', () => ({
  default: () => <div data-testid="page-otb-dashboard">OTB Dashboard</div>,
}))
vi.mock('../pages/otb/OtbMonthlyPlansPage', () => ({
  default: () => <div data-testid="page-otb-monthly-plans">OTB Monthly Plans</div>,
}))
vi.mock('../pages/inventory/SalesReportPage', () => ({
  default: () => <div data-testid="page-reports-sales">Sales Report</div>,
}))

describe('App lazy routes', () => {
  it('renders fallback while loading a lazy route and navigates across module routes', async () => {
    const user = userEvent.setup()

    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/inventory/dashboard']}>
          <App />
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(screen.getByTestId('route-loading-fallback')).toBeInTheDocument()
    expect(await screen.findByTestId('page-inventory-dashboard')).toBeInTheDocument()

    const purchaseOrdersLabel = screen.getByText('Control Tower', { selector: '.ant-menu-title-content' })
    await user.click(purchaseOrdersLabel.closest('[role="menuitem"]')!)
    expect(await screen.findByTestId('page-purchasing-orders')).toBeInTheDocument()

    const otbMonthlyPlansLabel = screen.getByText('Monthly Plans', { selector: '.ant-menu-title-content' })
    await user.click(otbMonthlyPlansLabel.closest('[role="menuitem"]')!)
    expect(await screen.findByTestId('page-otb-monthly-plans')).toBeInTheDocument()

    const salesReportLabel = screen.getByText('Sales', { selector: '.ant-menu-title-content' })
    await user.click(salesReportLabel.closest('[role="menuitem"]')!)
    expect(await screen.findByTestId('page-reports-sales')).toBeInTheDocument()
  })
})
