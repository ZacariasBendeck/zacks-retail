import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttributeDimension } from '../types/productsAttributes'
import type { ProductFamily } from '../types/sku'

vi.mock('../hooks/useProductsAttributes', () => ({
  useAttributeDimensions: vi.fn(),
  useAttributeDimensionsForSkus: vi.fn(),
  useSkuAttributes: vi.fn(),
  useSkuAttributesForSkus: vi.fn(),
  useSetSkuAttributes: vi.fn(),
  useAttributeCoverage: vi.fn(),
  useAttributeMacroRules: vi.fn(),
  useAttributeMacroRuleSet: vi.fn(),
  useReplaceAttributeMacroRules: vi.fn(),
  useCreateDimension: vi.fn(),
  useUpdateDimension: vi.fn(),
  useDeleteDimension: vi.fn(),
  useReorderDimensions: vi.fn(),
  useDimensionFamilyRules: vi.fn(),
  useReplaceDimensionFamilyRules: vi.fn(),
  useCreateValue: vi.fn(),
  useUpdateValue: vi.fn(),
  useDeleteValue: vi.fn(),
  useDeactivateValue: vi.fn(),
  useMergeValues: vi.fn(),
  useReorderValues: vi.fn(),
}))

vi.mock('../hooks/useProductFamilies', () => ({
  useProductFamilies: vi.fn(),
}))

import CatalogPage from '../pages/products/attributes/CatalogPage'
import * as attributeHooks from '../hooks/useProductsAttributes'
import * as familyHooks from '../hooks/useProductFamilies'

const dimension: AttributeDimension = {
  id: 1,
  code: 'openings',
  labelEs: 'Openings',
  descriptionEs: 'Openings on the back',
  sortOrder: 10,
  isMultiValue: false,
  familyRules: [],
  values: [],
}

const family: ProductFamily = {
  code: 'zapatos',
  labelEs: 'Zapatos',
  descriptionEs: null,
  sortOrder: 10,
}

const idleMutation = () => ({ mutateAsync: vi.fn(), isPending: false })

function renderPage() {
  return render(
    <ConfigProvider>
      <AntApp>
        <MemoryRouter initialEntries={['/products/attributes']}>
          <CatalogPage />
        </MemoryRouter>
      </AntApp>
    </ConfigProvider>,
  )
}

describe('Attributes catalog page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(attributeHooks.useAttributeDimensions).mockReturnValue({
      data: [dimension],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(familyHooks.useProductFamilies).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(attributeHooks.useCreateDimension).mockReturnValue(idleMutation() as never)
    vi.mocked(attributeHooks.useUpdateDimension).mockReturnValue(idleMutation() as never)
    vi.mocked(attributeHooks.useDeleteDimension).mockReturnValue(idleMutation() as never)
    vi.mocked(attributeHooks.useDeleteValue).mockReturnValue(idleMutation() as never)
    vi.mocked(attributeHooks.useUpdateValue).mockReturnValue(idleMutation() as never)
    vi.mocked(attributeHooks.useCreateValue).mockReturnValue(idleMutation() as never)
    vi.mocked(attributeHooks.useMergeValues).mockReturnValue(idleMutation() as never)
    vi.mocked(attributeHooks.useAttributeCoverage).mockReturnValue({
      data: [],
      isLoading: false,
    } as never)
    vi.mocked(attributeHooks.useAttributeMacroRules).mockReturnValue({
      data: [],
      isLoading: false,
    } as never)
    vi.mocked(attributeHooks.useAttributeMacroRuleSet).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as never)
    vi.mocked(attributeHooks.useReplaceAttributeMacroRules).mockReturnValue(idleMutation() as never)
    vi.mocked(attributeHooks.useReplaceDimensionFamilyRules).mockReturnValue(idleMutation() as never)
  })

  it('opens the selected dimension editor from the detail card', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Editar dimensión seleccionada Openings',
      }),
    )

    expect(await screen.findByText(/Editar dimensi.n .* openings/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Openings')).toBeInTheDocument()
  })

  it('shows product family rows on the rules tab even while a dimension is universal', async () => {
    const user = userEvent.setup()
    vi.mocked(familyHooks.useProductFamilies).mockReturnValue({
      data: [family],
      isLoading: false,
      error: null,
    } as never)

    renderPage()

    await user.click(await screen.findByRole('tab', { name: 'Reglas' }))

    expect(await screen.findByRole('row', { name: /Zapatos zapatos/ })).toBeInTheDocument()
  })
})
