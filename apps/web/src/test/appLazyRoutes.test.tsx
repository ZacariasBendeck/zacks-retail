import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'

vi.mock('../auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user',
      email: 'test@example.com',
      displayName: 'Test User',
      role: { id: 'role-1', name: 'Admin' },
    },
    permissions: new Set<string>([
      'import_management.view',
      'inventory.view',
      'otb.view',
      'purchasing.view',
      'reports.view',
      'sales_pos.operate',
    ]),
    loading: false,
    login: vi.fn(),
    logout: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  }),
}))

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
vi.mock('../pages/importManagement/ImportShipmentsPage', () => ({
  default: () => <div data-testid="page-import-management">Import Management</div>,
}))
vi.mock('../pages/inventory/SalesReportPage', () => ({
  default: () => <div data-testid="page-reports-sales">Sales Report</div>,
}))
vi.mock('../pages/salesReporting/SalesReportsHubPage', () => ({
  default: () => <div data-testid="page-reports-sales-hub">Sales Reports Hub</div>,
}))
vi.mock('../pages/sales/enter/EnterSalesPage', () => ({
  default: () => <div data-testid="page-sales-enter">Enter Sales</div>,
}))

describe('App lazy routes', () => {
  it('renders fallback while loading a lazy route and navigates across module routes', async () => {
    const user = userEvent.setup()
    const openSubmenu = async (label: RegExp) => {
      const menuItem = screen.getByRole('menuitem', { name: label })
      if (menuItem.getAttribute('aria-expanded') !== 'true') {
        await user.click(menuItem)
      }
    }

    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/inventory/dashboard']}>
          <App />
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(screen.getByTestId('route-loading-fallback')).toBeInTheDocument()
    expect(await screen.findByTestId('page-inventory-dashboard')).toBeInTheDocument()

    await openSubmenu(/Purchasing/i)
    await user.click(await screen.findByRole('link', { name: 'Purchase Orders' }))
    expect(await screen.findByTestId('page-purchasing-orders')).toBeInTheDocument()

    await openSubmenu(/OTB/i)
    await user.click(await screen.findByRole('link', { name: 'Monthly Plans' }))
    expect(await screen.findByTestId('page-otb-monthly-plans')).toBeInTheDocument()

    await user.click(await screen.findByRole('link', { name: 'Import Management' }))
    expect(await screen.findByTestId('page-import-management')).toBeInTheDocument()

    await openSubmenu(/Reports/i)
    await user.click(await screen.findByRole('link', { name: 'Sales' }))
    expect(await screen.findByTestId('page-reports-sales-hub')).toBeInTheDocument()

    await openSubmenu(/Sales POS/i)
    await user.click(await screen.findByRole('link', { name: 'Enter Sales' }))
    expect(await screen.findByTestId('page-sales-enter')).toBeInTheDocument()
  })
})
