import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FamilyCategory } from '../services/productFamiliesApi'
import type { ProductFamily } from '../types/sku'

vi.mock('../hooks/useProductFamilies', () => ({
  useCreateProductFamily: vi.fn(),
  useFamilyCategories: vi.fn(),
  useProductFamilies: vi.fn(),
}))

vi.mock('../pages/products/families/FamilyCategoriesTab', () => ({
  default: () => <div>Assignment wizard</div>,
}))

vi.mock('../pages/products/families/FamilyAttributesTab', () => ({
  default: () => <div>Family dimensions</div>,
}))

vi.mock('../pages/products/families/FamilyMetadataTab', () => ({
  default: () => <div>Family metadata</div>,
}))

import FamilyCategoryListTab from '../pages/products/families/FamilyCategoryListTab'
import FamiliesPage from '../pages/products/families/FamiliesPage'
import * as familyHooks from '../hooks/useProductFamilies'

const family: ProductFamily = {
  code: 'shoes',
  labelEs: 'Zapatos',
  descriptionEs: null,
  sortOrder: 10,
}

const categories: FamilyCategory[] = [
  {
    categoryNumber: 300,
    categoryDesc: 'Dress Boot',
    departmentNumber: 30,
    departmentDesc: 'Boots',
    familyCode: 'shoes',
  },
  {
    categoryNumber: 100,
    categoryDesc: 'Flat Sandal',
    departmentNumber: 10,
    departmentDesc: 'Sandals',
    familyCode: 'shoes',
  },
  {
    categoryNumber: 101,
    categoryDesc: 'Evening Pump',
    departmentNumber: 10,
    departmentDesc: 'Sandals',
    familyCode: 'shoes',
  },
  {
    categoryNumber: 900,
    categoryDesc: 'Unmapped Item',
    departmentNumber: null,
    departmentDesc: null,
    familyCode: 'shoes',
  },
]

function renderWithProviders(ui: ReactNode) {
  return render(
    <ConfigProvider>
      <AntApp>{ui}</AntApp>
    </ConfigProvider>,
  )
}

describe('Family category list tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(familyHooks.useCreateProductFamily).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(familyHooks.useProductFamilies).mockReturnValue({
      data: [family],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(familyHooks.useFamilyCategories).mockReturnValue({
      data: categories,
      isLoading: false,
      error: null,
    } as never)
  })

  it('renders assigned categories sorted by department then category', () => {
    renderWithProviders(<FamilyCategoryListTab family={family} />)

    const rows = screen.getAllByRole('row').map((row) => row.textContent ?? '')
    expect(rows).toEqual([
      'CategoriaDepartamento',
      '100Flat Sandal10Sandals',
      '101Evening Pump10Sandals',
      '300Dress Boot30Boots',
      '900Unmapped ItemSin departamento',
    ])
  })

  it('filters by category and department text', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FamilyCategoryListTab family={family} />)

    const search = screen.getByPlaceholderText('Buscar por categoria o departamento')
    await user.type(search, 'boots')

    expect(screen.getByText('Dress Boot')).toBeInTheDocument()
    expect(screen.queryByText('Flat Sandal')).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'sandal')

    expect(screen.getByText('Flat Sandal')).toBeInTheDocument()
    expect(screen.getByText('Evening Pump')).toBeInTheDocument()
    expect(screen.queryByText('Dress Boot')).not.toBeInTheDocument()
  })

  it('shows an empty state when the family has no categories', () => {
    vi.mocked(familyHooks.useFamilyCategories).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<FamilyCategoryListTab family={family} />)

    expect(screen.getByText('Esta familia no tiene categorias asignadas')).toBeInTheDocument()
  })

  it('adds Lista de Categorias after Metadatos on the families page', async () => {
    renderWithProviders(<FamiliesPage />)

    const tablist = await screen.findByRole('tablist')
    const tabs = within(tablist).getAllByRole('tab').map((tab) => tab.textContent)

    expect(tabs).toEqual(['Categorias', 'Dimensions', 'Metadatos', 'Lista de Categorias'])
  })
})
