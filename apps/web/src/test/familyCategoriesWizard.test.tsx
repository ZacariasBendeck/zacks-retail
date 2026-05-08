import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostgresCategory } from '../hooks/useProductCategories'
import type { Department, Sector } from '../types/productsTaxonomy'
import type { ProductFamily } from '../types/sku'

vi.mock('../hooks/useProductCategories', () => ({
  useAllPostgresCategories: vi.fn(),
}))

vi.mock('../hooks/useProductsTaxonomy', () => ({
  useDepartments: vi.fn(),
  useSectors: vi.fn(),
}))

vi.mock('../hooks/useProductFamilies', () => ({
  useFamilyCategories: vi.fn(),
  useProductFamilies: vi.fn(),
  useReplaceFamilyCategories: vi.fn(),
}))

import FamilyCategoriesTab from '../pages/products/families/FamilyCategoriesTab'
import * as categoryHooks from '../hooks/useProductCategories'
import * as taxonomyHooks from '../hooks/useProductsTaxonomy'
import * as familyHooks from '../hooks/useProductFamilies'

const targetFamily: ProductFamily = {
  code: 'shoes',
  labelEs: 'Shoes',
  descriptionEs: null,
  sortOrder: 10,
}

const otherFamily: ProductFamily = {
  code: 'tops',
  labelEs: 'Tops',
  descriptionEs: null,
  sortOrder: 20,
}

const sectors: Sector[] = [
  {
    number: 1,
    description: 'Footwear Sector',
    begDept: 10,
    endDept: 10,
    dateLastChanged: null,
    skuCount: 0,
  },
  {
    number: 2,
    description: 'Accessory Sector',
    begDept: 20,
    endDept: 20,
    dateLastChanged: null,
    skuCount: 0,
  },
]

const departments: Department[] = [
  {
    number: 10,
    description: 'Footwear',
    begCateg: 100,
    endCateg: 199,
    dateLastChanged: null,
    skuCount: 0,
  },
  {
    number: 20,
    description: 'Accessories',
    begCateg: 200,
    endCateg: 299,
    dateLastChanged: null,
    skuCount: 0,
  },
]

const categories: PostgresCategory[] = [
  {
    categoryNumber: 100,
    categoryDesc: 'Dress shoe',
    departmentNumber: 10,
    departmentDesc: 'Footwear',
    familyCode: 'shoes',
  },
  {
    categoryNumber: 101,
    categoryDesc: 'Casual shoe',
    departmentNumber: 10,
    departmentDesc: 'Footwear',
    familyCode: '',
  },
  {
    categoryNumber: 102,
    categoryDesc: 'Boot',
    departmentNumber: 10,
    departmentDesc: 'Footwear',
    familyCode: 'tops',
  },
  {
    categoryNumber: 200,
    categoryDesc: 'Laces',
    departmentNumber: 20,
    departmentDesc: 'Accessories',
    familyCode: 'shoes',
  },
]

const assignedCategories = categories.filter((category) => category.familyCode === 'shoes')

function renderWizard() {
  return render(
    <ConfigProvider>
      <AntApp>
        <FamilyCategoriesTab family={targetFamily} />
      </AntApp>
    </ConfigProvider>,
  )
}

describe('Family category assignment wizard', () => {
  let replaceMutation: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    replaceMutation = vi.fn().mockResolvedValue({
      assigned: 1,
      reassigned: 1,
      removed: 0,
    })

    vi.mocked(categoryHooks.useAllPostgresCategories).mockReturnValue({
      data: categories,
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(taxonomyHooks.useSectors).mockReturnValue({
      data: sectors,
      isLoading: false,
    } as never)
    vi.mocked(taxonomyHooks.useDepartments).mockReturnValue({
      data: departments,
      isLoading: false,
    } as never)
    vi.mocked(familyHooks.useFamilyCategories).mockReturnValue({
      data: assignedCategories,
      isLoading: false,
    } as never)
    vi.mocked(familyHooks.useProductFamilies).mockReturnValue({
      data: [targetFamily, otherFamily],
      isLoading: false,
    } as never)
    vi.mocked(familyHooks.useReplaceFamilyCategories).mockReturnValue({
      mutateAsync: replaceMutation,
      isPending: false,
    } as never)
  })

  it('assigns visible scoped categories and preserves assigned categories outside the scope', async () => {
    const user = userEvent.setup()
    renderWizard()

    expect(await screen.findByText('1 - Footwear Sector')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue to categories' }))

    expect(await screen.findByText('10 - Footwear')).toBeInTheDocument()
    expect(screen.getByText('Dress shoe')).toBeInTheDocument()
    expect(screen.getByText('Casual shoe')).toBeInTheDocument()
    expect(screen.getByText('Boot')).toBeInTheDocument()
    expect(screen.getByText('Move from Tops')).toBeInTheDocument()
    expect(screen.queryByText('Laces')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Assign all visible' }))
    await user.click(screen.getByRole('button', { name: 'Review changes' }))

    expect(await screen.findByText('1 added')).toBeInTheDocument()
    expect(screen.getByText('1 moved')).toBeInTheDocument()
    expect(screen.getByText('Casual shoe')).toBeInTheDocument()
    expect(screen.getByText('Boot')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save assignment' }))

    await waitFor(() => {
      expect(replaceMutation).toHaveBeenCalledWith({
        code: 'shoes',
        categories: [100, 101, 102, 200],
        force: false,
      })
    })
  })

  it('keeps the review visible and allows force save after a 409 warning', async () => {
    const conflict = Object.assign(new Error('Category reassignment needs confirmation'), {
      status: 409,
    })
    replaceMutation
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ assigned: 1, reassigned: 1, removed: 0 })

    const user = userEvent.setup()
    renderWizard()

    await user.click(await screen.findByRole('button', { name: 'Continue to categories' }))
    await user.click(screen.getByRole('button', { name: 'Assign all visible' }))
    await user.click(screen.getByRole('button', { name: 'Review changes' }))
    await user.click(screen.getByRole('button', { name: 'Save assignment' }))

    expect(await screen.findByText('Force confirmation required')).toBeInTheDocument()
    expect(screen.getByText('Category reassignment needs confirmation')).toBeInTheDocument()
    expect(screen.getByText('1 added')).toBeInTheDocument()
    expect(screen.getByText('1 moved')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Force save' }))

    await waitFor(() => {
      expect(replaceMutation).toHaveBeenLastCalledWith({
        code: 'shoes',
        categories: [100, 101, 102, 200],
        force: true,
      })
    })
  })
})
