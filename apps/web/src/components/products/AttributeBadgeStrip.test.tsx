import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/AuthContext'
import { HeaderCard } from '../../pages/products/inquiry/HeaderCard'

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  useAttributeDimensions: vi.fn(),
  useAttributeMacroRules: vi.fn(),
  useSetSkuAttributeDimension: vi.fn(),
  useSkuAttributes: vi.fn(),
}))

vi.mock('../../hooks/useProductsAttributes', () => ({
  useAttributeDimensions: mocks.useAttributeDimensions,
  useAttributeMacroRules: mocks.useAttributeMacroRules,
  useSetSkuAttributeDimension: mocks.useSetSkuAttributeDimension,
  useSkuAttributes: mocks.useSkuAttributes,
}))

const baseInquiry = {
  sku: '25604-RDPT',
  description: 'Test Product',
  category: { id: 28, name: 'Pant Traje USF' },
  vendor: { code: 'KTAI', name: 'KTAI' },
  vendorSku: '25604_SLIM',
  styleColor: 'SLIM/AZUL',
  status: 'ACTIVE',
  sizeType: { id: 314, name: 'Pant Camis 27-48', columns: [], rows: [] },
  lastReceivedAt: null,
  pricing: {} as never,
  rollup: {} as never,
  grids: {} as never,
  pictureUrl: null,
  info: {} as never,
  replacementContext: { replacedBy: null, supersedes: [] },
}

const skuAttributes = {
  skuCode: '25604-RDPT',
  byDimension: {
    buyer: {
      isMultiValue: false,
      values: [
        {
          code: 'zb',
          labelEs: 'Zacarias Bendeck',
          assignedBy: 'seed:keyword:test',
          assignedAt: '2026-04-23T20:21:39.498Z',
        },
      ],
    },
    company: {
      isMultiValue: false,
      values: [
        {
          code: 'benlow',
          labelEs: 'Inversiones Benlow',
          assignedBy: null,
          assignedAt: '2026-04-23T20:21:39.498Z',
        },
      ],
    },
    store_chain: { isMultiValue: false, values: [] },
    discount_type: { isMultiValue: false, values: [] },
    label_type: { isMultiValue: false, values: [] },
    color: { isMultiValue: false, values: [] },
    color_family: {
      isMultiValue: false,
      values: [
        {
          code: 'blue_family',
          labelEs: 'Azules',
          assignedBy: 'seed:derived:color_family',
          assignedAt: '2026-04-23T20:21:39.498Z',
        },
      ],
    },
    pattern: { isMultiValue: false, values: [] },
  },
}

const dimensions = [
  {
    id: 1,
    code: 'buyer',
    labelEs: 'Comprador',
    descriptionEs: null,
    sortOrder: 1,
    isMultiValue: false,
    familyRules: [],
    values: [
      { id: 11, code: 'zb', labelEs: 'Zacarias Bendeck', descriptionEs: null, sortOrder: 1, isActive: true },
      { id: 12, code: 'ab', labelEs: 'Ana Buyer', descriptionEs: null, sortOrder: 2, isActive: true },
    ],
  },
  {
    id: 2,
    code: 'company',
    labelEs: 'Empresa',
    descriptionEs: null,
    sortOrder: 2,
    isMultiValue: false,
    familyRules: [],
    values: [
      { id: 21, code: 'benlow', labelEs: 'Inversiones Benlow', descriptionEs: null, sortOrder: 1, isActive: true },
    ],
  },
  {
    id: 3,
    code: 'store_chain',
    labelEs: 'Cadena',
    descriptionEs: null,
    sortOrder: 3,
    isMultiValue: false,
    familyRules: [],
    values: [
      { id: 31, code: 'zacks', labelEs: 'Zacks', descriptionEs: null, sortOrder: 1, isActive: true },
    ],
  },
  {
    id: 4,
    code: 'discount_type',
    labelEs: 'Descuento',
    descriptionEs: null,
    sortOrder: 4,
    isMultiValue: false,
    familyRules: [],
    values: [
      { id: 41, code: 'regular', labelEs: 'Regular', descriptionEs: null, sortOrder: 1, isActive: true },
    ],
  },
  {
    id: 5,
    code: 'label_type',
    labelEs: 'label_type',
    descriptionEs: null,
    sortOrder: 5,
    isMultiValue: false,
    familyRules: [],
    values: [
      { id: 51, code: 'main', labelEs: 'Main Label', descriptionEs: null, sortOrder: 1, isActive: true },
    ],
  },
  {
    id: 6,
    code: 'color',
    labelEs: 'Color',
    descriptionEs: null,
    sortOrder: 6,
    isMultiValue: false,
    familyRules: [],
    values: [
      { id: 61, code: 'blue', labelEs: 'Azul', descriptionEs: null, sortOrder: 1, isActive: true },
    ],
  },
  {
    id: 7,
    code: 'color_family',
    labelEs: 'Familia de Color',
    descriptionEs: null,
    sortOrder: 7,
    isMultiValue: false,
    familyRules: [],
    values: [
      { id: 71, code: 'blue_family', labelEs: 'Azules', descriptionEs: null, sortOrder: 1, isActive: true },
    ],
  },
  {
    id: 8,
    code: 'pattern',
    labelEs: 'Patron',
    descriptionEs: null,
    sortOrder: 8,
    isMultiValue: false,
    familyRules: [{ familyCode: 'pants', enabled: true, isRequired: false, sortOrder: 1 }],
    values: [
      { id: 81, code: 'solid', labelEs: 'Solido', descriptionEs: null, sortOrder: 1, isActive: true },
    ],
  },
]

function authValue(permissions: string[]): AuthState {
  return {
    user: null,
    permissions: new Set(permissions),
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    updatePreferences: vi.fn(),
  }
}

function renderWithAuth(ui: ReactElement, permissions = ['products.write']) {
  return render(
    <AuthContext.Provider value={authValue(permissions)}>
      {ui}
    </AuthContext.Provider>,
  )
}

function renderHeader(permissions = ['products.write']) {
  return renderWithAuth(
    <HeaderCard inquiry={baseInquiry} />,
    permissions,
  )
}

describe('Inventory Inquiry attribute header display', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset()
    mocks.mutateAsync.mockResolvedValue(skuAttributes)
    mocks.useSkuAttributes.mockReturnValue({
      isLoading: false,
      isError: false,
      data: skuAttributes,
    })
    mocks.useAttributeDimensions.mockReturnValue({
      data: dimensions,
      isLoading: false,
    })
    mocks.useAttributeMacroRules.mockReturnValue({
      data: [{ targetDimensionCode: 'color_family' }],
    })
    mocks.useSetSkuAttributeDimension.mockReturnValue({
      mutateAsync: mocks.mutateAsync,
      isPending: false,
    })
  })

  it('renders operational attributes in the right column and catalog-driven sections', () => {
    renderHeader()

    expect(screen.queryByText('Merchandising Attributes:')).not.toBeInTheDocument()
    expect(screen.getByText('Universal Attributes')).toBeInTheDocument()
    expect(screen.getByText('Family Attributes')).toBeInTheDocument()

    expect(screen.getByText('Comprador')).toBeInTheDocument()
    expect(screen.getByText('Empresa')).toBeInTheDocument()
    expect(screen.getByText('Cadena')).toBeInTheDocument()
    expect(screen.getByText('Descuento')).toBeInTheDocument()
    expect(screen.getByText('label_type')).toBeInTheDocument()
    expect(screen.getByText('Zacarias Bendeck')).toBeInTheDocument()
    expect(screen.getByText('Inversiones Benlow')).toBeInTheDocument()
  })

  it('saves a blank universal attribute from the header table', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByRole('button', { name: 'Edit Color' }))
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('Azul'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        code: '25604-RDPT',
        dimensionCode: 'color',
        input: { value_codes: ['blue'] },
      })
    })
  })

  it('can clear an assigned operational attribute from the header table', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByRole('button', { name: 'Zacarias Bendeck' }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      code: '25604-RDPT',
      dimensionCode: 'buyer',
      input: { value_codes: [] },
    })
  })

  it('keeps derived attributes read-only even for product writers', () => {
    renderHeader()

    expect(screen.getByText('Azules')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Azules' })).not.toBeInTheDocument()
  })

  it('keeps attribute values read-only without products.write', () => {
    renderHeader(['products.view'])

    expect(screen.getByText('Color')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Color' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zacarias Bendeck' })).not.toBeInTheDocument()
  })
})
