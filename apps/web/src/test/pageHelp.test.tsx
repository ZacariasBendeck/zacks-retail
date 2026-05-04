import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AppLayout from '../components/AppLayout'
import { InlinePageHelp, useRegisterPageHelp } from '../components/page-help'
import { inventoryAuditHelp, purchaseOrderEntryHelp } from '../content/help/pageHelp'
import ManualPage from '../pages/manual/ManualPage'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user',
      email: 'test@example.com',
      displayName: 'Test User',
      role: { id: 'role-1', name: 'Admin' },
    },
    permissions: new Set<string>([
      'inventory.view',
      'inventory.adjust',
      'products.view',
      'products.write',
      'purchasing.view',
      'purchasing.edit',
      'reports.view',
      'segmentation.read',
      'store_ops.view',
    ]),
    loading: false,
    login: vi.fn(),
    logout: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  }),
}))

function HelpRegisteredPage() {
  useRegisterPageHelp(inventoryAuditHelp)
  return <div data-testid="registered-page">Registered page</div>
}

function renderAppLayout(initialEntry: string) {
  render(
    <ConfigProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/inventory/audit" element={<HelpRegisteredPage />} />
            <Route path="/me" element={<div data-testid="plain-page">Plain page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ConfigProvider>,
  )
}

describe('page help', () => {
  it('shows the header help button only when a page registers help and opens the drawer', async () => {
    const user = userEvent.setup()
    renderAppLayout('/inventory/audit')

    expect(await screen.findByTestId('registered-page')).toBeInTheDocument()
    const helpButton = await screen.findByRole('button', { name: /ayuda/i })

    await user.click(helpButton)

    expect(await screen.findByText('Proceso')).toBeInTheDocument()
    expect(screen.getByText(/Escoge el SKU/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir manual de Inventario/i })).toHaveAttribute(
      'href',
      '/manual/inventory',
    )
  })

  it('does not show header help on pages without a registered entry', async () => {
    renderAppLayout('/me')

    expect(await screen.findByTestId('plain-page')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ayuda/i })).not.toBeInTheDocument()
  })

  it('collapses and expands inline help content', async () => {
    const user = userEvent.setup()
    render(
      <ConfigProvider>
        <MemoryRouter>
          <InlinePageHelp entry={purchaseOrderEntryHelp} />
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(screen.queryByText(/Escoge vendor/i)).not.toBeInTheDocument()

    await user.click(screen.getByText('Ayuda de esta página'))

    expect(await screen.findByText(/Escoge vendor/i)).toBeInTheDocument()
  })

  it('opens compact inline help from a title-card button without a collapse row', async () => {
    const user = userEvent.setup()
    render(
      <ConfigProvider>
        <MemoryRouter>
          <InlinePageHelp entry={purchaseOrderEntryHelp} mode="popover" />
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(screen.queryByText(/Escoge vendor/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Ayuda de esta página/i }))

    expect(await screen.findByText(/Escoge vendor/i)).toBeInTheDocument()
  })

  it('renders manual markdown with GFM tables and heading anchors', () => {
    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/manual/inventory#inventory-audit']}>
          <Routes>
            <Route path="/manual/:chapterSlug" element={<ManualPage />} />
          </Routes>
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(screen.getByRole('heading', { name: /Inventory Audit/i })).toBeInTheDocument()
    expect(document.getElementById('inventory-audit')).toBeTruthy()
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0)
  })
})
