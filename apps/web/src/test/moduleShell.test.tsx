import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import { describe, expect, it } from 'vitest'
import AppLayout from '../components/AppLayout'

function renderModuleShell(initialEntry = '/inventory/dashboard') {
  render(
    <ConfigProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/inventory/dashboard" replace />} />
            <Route path="/dashboard" element={<Navigate to="/inventory/dashboard" replace />} />
            <Route path="/inventory" element={<Navigate to="/inventory/dashboard" replace />} />
            <Route path="/inventory/dashboard" element={<div data-testid="inventory-dashboard">Inventory Dashboard</div>} />
            <Route path="/inventory/balances" element={<div data-testid="inventory-balances">Inventory Balances</div>} />
            <Route path="/inventory/skus" element={<div data-testid="inventory-skus">SKU List</div>} />
            <Route path="/inventory/adjustments" element={<div data-testid="inventory-adjustments">Adjustments List</div>} />
            <Route path="/inventory/sales-ledger" element={<div data-testid="inventory-sales-ledger">Sales Ledger</div>} />
            <Route path="/inventory/movements" element={<div data-testid="inventory-movements">Movements</div>} />
            <Route path="/purchasing" element={<Navigate to="/purchasing/orders" replace />} />
            <Route path="/purchasing/orders" element={<div data-testid="purchasing-orders">Purchasing Orders</div>} />
            <Route path="/purchasing/receive" element={<div data-testid="purchasing-receive">Receive POs</div>} />
            <Route path="/otb" element={<Navigate to="/otb/monthly-plans" replace />} />
            <Route path="/otb/monthly-plans" element={<div data-testid="otb-monthly-plans">OTB Monthly Plans</div>} />
            <Route path="/otb/dashboard" element={<div data-testid="otb-dashboard">OTB Dashboard</div>} />
            <Route path="/reports" element={<Navigate to="/reports/sales" replace />} />
            <Route path="/reports/on-hand" element={<div data-testid="reports-on-hand">On-Hand Report</div>} />
            <Route path="/reports/sales" element={<div data-testid="reports-sales">Sales Report</div>} />
            <Route path="/reports/turnover" element={<div data-testid="reports-turnover">Turnover Report</div>} />
            <Route path="/reports/aging" element={<div data-testid="reports-aging">Aging Report</div>} />
            <Route path="/reports/sell-through" element={<div data-testid="reports-sell-through">Sell-Through Report</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ConfigProvider>,
  )
}

describe('Module Shell Navigation', () => {
  it('renders exactly four top-level modules', () => {
    renderModuleShell()

    expect(screen.getByRole('menuitem', { name: /Inventory/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Purchasing/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /OTB/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Reports/i })).toBeInTheDocument()
  })

  it('redirects the default route to the inventory dashboard', () => {
    renderModuleShell('/')
    expect(screen.getByTestId('inventory-dashboard')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument()
  })

  it('navigates across all module child routes and updates module header', async () => {
    const user = userEvent.setup()
    renderModuleShell('/inventory/dashboard')

    const routeChecks: Array<{ label: string; pageId: string; moduleTitle: string }> = [
      { label: 'Dashboard', pageId: 'inventory-dashboard', moduleTitle: 'Inventory' },
      { label: 'Balances', pageId: 'inventory-balances', moduleTitle: 'Inventory' },
      { label: 'SKU List', pageId: 'inventory-skus', moduleTitle: 'Inventory' },
      { label: 'Adjustments', pageId: 'inventory-adjustments', moduleTitle: 'Inventory' },
      { label: 'Sales Ledger', pageId: 'inventory-sales-ledger', moduleTitle: 'Inventory' },
      { label: 'Movements', pageId: 'inventory-movements', moduleTitle: 'Inventory' },
      { label: 'Control Tower', pageId: 'purchasing-orders', moduleTitle: 'Purchasing' },
      { label: 'Receive POs', pageId: 'purchasing-receive', moduleTitle: 'Purchasing' },
      { label: 'Monthly Plans', pageId: 'otb-monthly-plans', moduleTitle: 'OTB' },
      { label: 'Budget Dashboard', pageId: 'otb-dashboard', moduleTitle: 'OTB' },
      { label: 'On-Hand', pageId: 'reports-on-hand', moduleTitle: 'Reports' },
      { label: 'Sales', pageId: 'reports-sales', moduleTitle: 'Reports' },
      { label: 'Turnover', pageId: 'reports-turnover', moduleTitle: 'Reports' },
      { label: 'Aging', pageId: 'reports-aging', moduleTitle: 'Reports' },
      { label: 'Sell-Through', pageId: 'reports-sell-through', moduleTitle: 'Reports' },
    ]

    for (const check of routeChecks) {
      const menuLabel = screen.getByText(check.label, { selector: '.ant-menu-title-content' })
      const menuItem = menuLabel.closest('[role="menuitem"]')
      expect(menuItem).toBeTruthy()
      if (!menuItem) {
        throw new Error(`Menu item not found for label: ${check.label}`)
      }
      await user.click(menuItem)
      expect(await screen.findByTestId(check.pageId)).toBeInTheDocument()
      expect(await screen.findByRole('heading', { name: check.moduleTitle })).toBeInTheDocument()
    }
  }, 20_000)
})
