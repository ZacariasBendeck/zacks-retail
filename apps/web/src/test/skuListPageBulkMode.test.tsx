import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider } from 'antd'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SkuListPage from '../pages/inventory/SkuListPage'

const authState = vi.hoisted(() => ({
  permissions: new Set<string>(['products.view']),
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', displayName: 'Test User' },
    permissions: authState.permissions,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('../hooks/useProductsTaxonomy', () => ({
  useCategories: () => ({ data: [] }),
  useDepartments: () => ({ data: [] }),
  useGroups: () => ({ data: [] }),
  useKeywords: () => ({ data: [] }),
  useSeasons: () => ({ data: [] }),
  useSectors: () => ({ data: [] }),
}))

vi.mock('../hooks/useProductsVendors', () => ({
  useVendors: () => ({ data: [] }),
}))

vi.mock('../hooks/useProductsAttributes', () => ({
  useAttributeDimensions: () => ({ data: [] }),
  useAttributeDimensionsForSkus: () => ({ data: undefined, isFetching: false }),
  useAttributeMacroRules: () => ({ data: [] }),
  useCreateValue: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSkuAttributesForSkus: () => ({ data: undefined, isFetching: false }),
}))

vi.mock('../hooks/useProductFamilies', () => ({
  useProductFamilies: () => ({ data: [] }),
}))

vi.mock('../hooks/useProductCategories', () => ({
  useAllPostgresCategories: () => ({ data: [] }),
}))

vi.mock('../hooks/useProductsSkus', () => ({
  useDeleteProductsSku: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('../hooks/useUtilities', () => ({
  useApplyBatchChange: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../services/productsSkuApi', () => ({
  productsSkuApi: {
    list: vi.fn(async () => []),
    onHandTotals: vi.fn(async () => ({})),
  },
}))

function renderPage(initialEntry = '/inventory/skus') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <ConfigProvider>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <SkuListPage />
          </MemoryRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>,
  )
}

describe('SkuListPage bulk mode', () => {
  beforeEach(() => {
    authState.permissions = new Set<string>(['products.view'])
  })

  it('hides bulk-change controls without SKU bulk-write permission', () => {
    renderPage('/inventory/skus?bulk=1')

    expect(screen.queryByRole('button', { name: /change attributes/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Bulk change SKU attributes')).not.toBeInTheDocument()
  })

  it('opens bulk-change controls for users with SKU bulk-write permission', async () => {
    authState.permissions = new Set<string>(['products.view', 'products.sku_bulk_write'])
    const user = userEvent.setup()

    renderPage()

    await user.click(screen.getByRole('button', { name: /change attributes/i }))

    expect(screen.getByText('Bulk change SKU attributes')).toBeInTheDocument()
    expect(screen.getByText(/0 SKUs selected/i)).toBeInTheDocument()
    expect(screen.getByText('Change:')).toBeInTheDocument()
  })
})
