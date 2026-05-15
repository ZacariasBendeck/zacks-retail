import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import AppLayout from '../components/AppLayout'

vi.mock('@benlow-rics/i18n/react', async () => {
  const actual = await vi.importActual<typeof import('@benlow-rics/i18n/react')>('@benlow-rics/i18n/react')
  return {
    ...actual,
    LanguageSelector: () => <select aria-label="Language" />,
  }
})

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user',
      email: 'test@example.com',
      displayName: 'Test User',
      role: { id: 'role-1', name: 'Admin' },
    },
    permissions: new Set<string>([
      'activity_review.view',
      'employees.manage',
      'employees.view',
      'identity_access.manage',
      'identity_access.view',
      'import_management.view',
      'inventory.adjust',
      'inventory.view',
      'otb.edit',
      'otb.view',
      'products.write',
      'products.view',
      'purchasing.edit',
      'purchasing.view',
      'reports.admin',
      'reports.view',
      'sales_pos.operate',
      'segmentation.read',
      'store_ops.view',
    ]),
    loading: false,
    login: vi.fn(),
    logout: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    updatePreferences: vi.fn(async () => {}),
  }),
}))

function getTopLevelMenuLabels() {
  const rootMenu = document.querySelector('.ant-menu-root')
  if (!rootMenu) throw new Error('Root sidebar menu not found')

  return Array.from(rootMenu.children)
    .flatMap((child) => {
      if (!(child instanceof HTMLElement)) return []
      const titleHost =
        child.getAttribute('role') === 'menuitem'
          ? child
          : Array.from(child.children).find(
              (child): child is HTMLElement =>
                child instanceof HTMLElement && child.classList.contains('ant-menu-submenu-title'),
            )
      if (!titleHost) return []

      const titleContent =
        Array.from(titleHost.children).find(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child.classList.contains('ant-menu-title-content'),
        ) ?? titleHost.querySelector('.ant-menu-title-content')

      return [titleContent?.textContent?.replace(/\s+/g, ' ').trim() ?? '']
    })
}

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
            <Route path="/inventory/adjustments" element={<div data-testid="inventory-adjustments">Stock Maintenance</div>} />
            <Route path="/inventory/find-by-size" element={<div data-testid="inventory-find-by-size">Find by Size</div>} />
            <Route path="/inventory/replenishment" element={<div data-testid="inventory-replenishment">Model Quantities</div>} />
            <Route path="/inventory/transfers/balancing" element={<div data-testid="inventory-balancing-legacy">Balancing Legacy</div>} />
            <Route path="/inventory/transfers/balancing-v2" element={<div data-testid="inventory-balancing-v2">Balancing v2</div>} />
            <Route path="/inventory/sales-ledger" element={<div data-testid="inventory-sales-ledger">Sales Ledger</div>} />
            <Route path="/inventory/movements" element={<div data-testid="inventory-movements">Movements</div>} />
            <Route path="/purchase-planning" element={<div data-testid="purchase-planning">Purchase Planning</div>} />
            <Route path="/purchase-planning/v3" element={<div data-testid="purchase-planning-v3">Purchase Planning V3</div>} />
            <Route path="/purchase-planning/buyer-checklist" element={<div data-testid="purchase-planning-buyer-checklist">Buyer Checklist</div>} />
            <Route path="/import-management" element={<div data-testid="import-management">Import Management</div>} />
            <Route path="/customers/dashboard" element={<div data-testid="customers-dashboard">Customers Dashboard</div>} />
            <Route path="/customers" element={<div data-testid="customers">Customers</div>} />
            <Route path="/products/vendors" element={<div data-testid="products-vendors">Vendors</div>} />
            <Route path="/products/taxonomy/categories" element={<div data-testid="products-categories">Categories</div>} />
            <Route path="/products/taxonomy/departments" element={<div data-testid="products-departments">Departments</div>} />
            <Route path="/products/taxonomy/sectors" element={<div data-testid="products-sectors">Sectors</div>} />
            <Route path="/products/taxonomy/groups" element={<div data-testid="products-groups">Groups</div>} />
            <Route path="/products/taxonomy/keywords" element={<div data-testid="products-keywords">Keywords</div>} />
            <Route path="/products/taxonomy/seasons" element={<div data-testid="products-seasons">Seasons</div>} />
            <Route path="/products/taxonomy/size-types" element={<div data-testid="products-size-types">Size Types</div>} />
            <Route path="/products/taxonomy/return-codes" element={<div data-testid="products-return-codes">Return Codes</div>} />
            <Route path="/products/taxonomy/promotion-codes" element={<div data-testid="products-promotion-codes">Promotion Codes</div>} />
            <Route path="/file-setup/case-packs" element={<div data-testid="products-case-packs">Case Packs</div>} />
            <Route path="/admin/users" element={<div data-testid="users-access-users">Users</div>} />
            <Route path="/admin/roles" element={<div data-testid="users-access-roles">Roles & Permissions</div>} />
            <Route path="/admin/security" element={<div data-testid="users-access-security">Security Center</div>} />
            <Route path="/admin/effective-access" element={<div data-testid="users-access-effective-access">Effective Access</div>} />
            <Route path="/admin/audit" element={<div data-testid="platform-security-audit">Security Audit</div>} />
            <Route path="/utilities" element={<Navigate to="/utilities/stores" replace />} />
            <Route path="/utilities/stores" element={<div data-testid="utilities-stores">Stores</div>} />
            <Route path="/utilities/store-chains" element={<div data-testid="utilities-store-chains">Store Chains</div>} />
            <Route path="/operations/activity-review" element={<div data-testid="operations-activity-review">Activity Review</div>} />
            <Route path="/inventory/audit" element={<div data-testid="platform-inventory-audit">Inventory Audit</div>} />
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
  it('renders the current top-level modules', () => {
    renderModuleShell()

    expect(screen.getByRole('menuitem', { name: /Inventory/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Products/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /File Setup/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Users & Access/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Platform/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Purchase Planning/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Sales POS/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Customer Intelligence/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Utilities/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Purchasing/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Import Management/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /OTB/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Reports/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Operations/i })).toBeInTheDocument()
  })

  it('orders the main sidebar modules for retail workflows', () => {
    renderModuleShell()

    expect(getTopLevelMenuLabels().slice(0, 11)).toEqual([
      'Products',
      'Purchasing',
      'Inventory',
      'Reports',
      'File Setup',
      'Import Management',
      'Purchase Planning',
      'Customer Intelligence',
      'Operations',
      'Utilities',
      'Platform',
    ])
  })

  it('redirects the default route to the inventory dashboard', () => {
    renderModuleShell('/')
    expect(screen.getByTestId('inventory-dashboard')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument()
  })

  it('keeps File Setup open for remaining setup records', async () => {
    const user = userEvent.setup()
    renderModuleShell('/inventory/dashboard')

    const fileSetupMenu = screen.getByRole('menuitem', { name: /File Setup/i })
    await user.click(fileSetupMenu)

    const storesLink = await screen.findByRole('link', { name: 'Stores' })
    const storesItem = storesLink.closest('[role="menuitem"]')
    expect(storesItem).toBeTruthy()
    if (!storesItem) throw new Error('Stores menu item not found')

    await user.click(storesItem)

    expect(await screen.findByTestId('utilities-stores')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /File Setup/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Store Chains' })).toBeVisible()
  })

  it('navigates from Import Management when another module title is clicked', async () => {
    const user = userEvent.setup()
    renderModuleShell('/import-management')

    await user.click(screen.getByRole('menuitem', { name: /Purchasing/i }))

    expect(await screen.findByTestId('purchasing-orders')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Purchasing' })).toBeInTheDocument()
  })

  it('navigates across all module child routes and updates module header', async () => {
    const user = userEvent.setup()
    renderModuleShell('/inventory/dashboard')

    const routeChecks: Array<{
      label: string
      pageId: string
      moduleTitle: string
      openModuleLabel?: string
      openGroupLabel?: string
    }> = [
      { label: 'Balances', pageId: 'inventory-balances', moduleTitle: 'Inventory' },
      { label: 'SKU List', pageId: 'inventory-skus', moduleTitle: 'Products', openModuleLabel: 'Products' },
      { label: 'Stock Maintenance', pageId: 'inventory-adjustments', moduleTitle: 'Inventory', openModuleLabel: 'Inventory' },
      { label: 'Find by Size', pageId: 'inventory-find-by-size', moduleTitle: 'Inventory' },
      { label: 'Model Quantities', pageId: 'inventory-replenishment', moduleTitle: 'Inventory' },
      { label: 'Transfer - Balancing (Legacy)', pageId: 'inventory-balancing-legacy', moduleTitle: 'Inventory' },
      { label: 'Transfer - Balancing v2', pageId: 'inventory-balancing-v2', moduleTitle: 'Inventory' },
      { label: 'Sales Ledger', pageId: 'inventory-sales-ledger', moduleTitle: 'Inventory' },
      { label: 'Movements', pageId: 'inventory-movements', moduleTitle: 'Inventory' },
      { label: 'V2 - Actual', pageId: 'purchase-planning', moduleTitle: 'Purchase Planning', openModuleLabel: 'Purchase Planning' },
      { label: 'V3 - Warehouse Shared', pageId: 'purchase-planning-v3', moduleTitle: 'Purchase Planning', openModuleLabel: 'Purchase Planning' },
      { label: 'Buyer Checklist', pageId: 'purchase-planning-buyer-checklist', moduleTitle: 'Purchase Planning', openModuleLabel: 'Purchase Planning' },
      { label: 'Import Management', pageId: 'import-management', moduleTitle: 'Import Management' },
      { label: 'Customer Records', pageId: 'customers', moduleTitle: 'Customer Intelligence', openModuleLabel: 'Customer Intelligence' },
      { label: 'Vendors', pageId: 'products-vendors', moduleTitle: 'Products', openModuleLabel: 'Products', openGroupLabel: 'Catalogue Setup' },
      { label: 'Categories', pageId: 'products-categories', moduleTitle: 'Products', openModuleLabel: 'Products', openGroupLabel: 'Catalogue Setup' },
      { label: 'Departments', pageId: 'products-departments', moduleTitle: 'Products', openModuleLabel: 'Products', openGroupLabel: 'Catalogue Setup' },
      { label: 'Sectors', pageId: 'products-sectors', moduleTitle: 'Products', openModuleLabel: 'Products', openGroupLabel: 'Catalogue Setup' },
      { label: 'Groups', pageId: 'products-groups', moduleTitle: 'Products', openModuleLabel: 'Products', openGroupLabel: 'Catalogue Setup' },
      { label: 'Keywords', pageId: 'products-keywords', moduleTitle: 'Products', openModuleLabel: 'Products', openGroupLabel: 'Catalogue Setup' },
      { label: 'Seasons', pageId: 'products-seasons', moduleTitle: 'Products', openModuleLabel: 'Products', openGroupLabel: 'Catalogue Setup' },
      { label: 'Size Types', pageId: 'products-size-types', moduleTitle: 'Products', openModuleLabel: 'Products', openGroupLabel: 'Catalogue Setup' },
      { label: 'Case Packs', pageId: 'products-case-packs', moduleTitle: 'Products', openModuleLabel: 'Products', openGroupLabel: 'Catalogue Setup' },
      { label: 'Return Codes', pageId: 'products-return-codes', moduleTitle: 'Products', openModuleLabel: 'Products', openGroupLabel: 'Catalogue Setup' },
      { label: 'Promotion Codes', pageId: 'products-promotion-codes', moduleTitle: 'Products', openModuleLabel: 'Products', openGroupLabel: 'Catalogue Setup' },
      { label: 'Stores', pageId: 'utilities-stores', moduleTitle: 'File Setup', openModuleLabel: 'File Setup' },
      { label: 'Store Chains', pageId: 'utilities-store-chains', moduleTitle: 'File Setup', openModuleLabel: 'File Setup' },
      { label: 'Users', pageId: 'users-access-users', moduleTitle: 'Users & Access', openModuleLabel: 'Users & Access' },
      { label: 'Roles & Permissions', pageId: 'users-access-roles', moduleTitle: 'Users & Access', openModuleLabel: 'Users & Access' },
      { label: 'Security Center', pageId: 'users-access-security', moduleTitle: 'Users & Access', openModuleLabel: 'Users & Access' },
      { label: 'Effective Access', pageId: 'users-access-effective-access', moduleTitle: 'Users & Access', openModuleLabel: 'Users & Access' },
      { label: 'Activity Review', pageId: 'operations-activity-review', moduleTitle: 'Platform', openModuleLabel: 'Platform' },
      { label: 'Security Audit', pageId: 'platform-security-audit', moduleTitle: 'Platform', openModuleLabel: 'Platform' },
      { label: 'Inventory Audit', pageId: 'platform-inventory-audit', moduleTitle: 'Platform', openModuleLabel: 'Platform' },
      { label: 'Purchase Orders', pageId: 'purchasing-orders', moduleTitle: 'Purchasing', openModuleLabel: 'Purchasing' },
      { label: 'Receive POs', pageId: 'purchasing-receive', moduleTitle: 'Purchasing', openModuleLabel: 'Purchasing' },
      { label: 'Monthly Plans', pageId: 'otb-monthly-plans', moduleTitle: 'OTB - not in use', openModuleLabel: 'OTB' },
      { label: 'Budget Dashboard', pageId: 'otb-dashboard', moduleTitle: 'OTB - not in use', openModuleLabel: 'OTB' },
      { label: 'Sales', pageId: 'reports-sales', moduleTitle: 'Reports', openModuleLabel: 'Reports' },
    ]

    for (const check of routeChecks) {
      if (check.openModuleLabel) {
        const moduleMenu = screen.getByRole('menuitem', { name: new RegExp(check.openModuleLabel, 'i') })
        if (moduleMenu.getAttribute('aria-expanded') !== 'true') {
          await user.click(moduleMenu)
        }
      }
      if (check.openGroupLabel) {
        const groupMenu = await screen.findByRole('menuitem', { name: new RegExp(check.openGroupLabel, 'i') })
        if (groupMenu.getAttribute('aria-expanded') !== 'true') {
          await user.click(groupMenu)
        }
      }
      const menuLink = await screen.findByRole('link', { name: check.label })
      const menuItem = menuLink.closest('[role="menuitem"]')
      expect(menuItem).toBeTruthy()
      if (!menuItem) {
        throw new Error(`Menu item not found for label: ${check.label}`)
      }
      await user.click(menuItem)
      expect(await screen.findByTestId(check.pageId)).toBeInTheDocument()
      expect(await screen.findByRole('heading', { name: check.moduleTitle })).toBeInTheDocument()
    }
  }, 45_000)
})
