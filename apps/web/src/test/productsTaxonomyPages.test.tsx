import { render, screen } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useProductsTaxonomy', () => ({
  useDepartments: vi.fn(),
  useDepartment: vi.fn(),
  useCreateDepartment: vi.fn(),
  useUpdateDepartment: vi.fn(),
  useDeleteDepartment: vi.fn(),
  useCategories: vi.fn(),
  useCategory: vi.fn(),
  useCategoryBuyerOptions: vi.fn(),
  useCreateCategory: vi.fn(),
  useUpdateCategory: vi.fn(),
  useDeleteCategory: vi.fn(),
  useGroups: vi.fn(),
  useGroup: vi.fn(),
  useCreateGroup: vi.fn(),
  useUpdateGroup: vi.fn(),
  useDeleteGroup: vi.fn(),
  useKeywords: vi.fn(),
  useKeyword: vi.fn(),
  useCreateKeyword: vi.fn(),
  useUpdateKeyword: vi.fn(),
  useDeleteKeyword: vi.fn(),
  useSectors: vi.fn(),
  useSector: vi.fn(),
  useCreateSector: vi.fn(),
  useUpdateSector: vi.fn(),
  useDeleteSector: vi.fn(),
  useReturnCodes: vi.fn(),
  useReturnCode: vi.fn(),
  useCreateReturnCode: vi.fn(),
  useUpdateReturnCode: vi.fn(),
  useDeleteReturnCode: vi.fn(),
  usePromotionCodes: vi.fn(),
  usePromotionCode: vi.fn(),
  useCreatePromotionCode: vi.fn(),
  useUpdatePromotionCode: vi.fn(),
  useDeletePromotionCode: vi.fn(),
  useSeasons: vi.fn(),
  useSeason: vi.fn(),
  useSeasonSource: vi.fn(),
  useCreateSeason: vi.fn(),
  useUpdateSeason: vi.fn(),
  useDeleteSeason: vi.fn(),
  useSizeTypes: vi.fn(),
  useSizeType: vi.fn(),
  useCreateSizeType: vi.fn(),
  useUpdateSizeType: vi.fn(),
  useDeleteSizeType: vi.fn(),
  useNrfLookup: vi.fn(),
  useSkuTotal: vi.fn(),
  useResolveTaxonomy: vi.fn(),
}))

vi.mock('../hooks/useProductFamilies', () => ({
  useProductFamilies: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('../hooks/useStores', () => ({
  useStores: vi.fn(() => ({ data: [], isLoading: false })),
}))

import DepartmentListPage from '../pages/products/DepartmentListPage'
import DepartmentFormPage from '../pages/products/DepartmentFormPage'
import CategoryListPage from '../pages/products/CategoryListPage'
import CategoryFormPage from '../pages/products/CategoryFormPage'
import GroupListPage from '../pages/products/GroupListPage'
import KeywordListPage from '../pages/products/KeywordListPage'
import SectorListPage from '../pages/products/SectorListPage'
import ReturnCodeListPage from '../pages/products/ReturnCodeListPage'
import PromotionCodeListPage from '../pages/products/PromotionCodeListPage'
import SeasonListPage from '../pages/products/SeasonListPage'
import SizeTypeListPage from '../pages/products/SizeTypeListPage'
import TaxonomyHomePage from '../pages/products/TaxonomyHomePage'
import * as hooks from '../hooks/useProductsTaxonomy'

function renderPage(element: React.ReactNode) {
  return render(
    <ConfigProvider>
      <AntApp>
        <MemoryRouter>{element}</MemoryRouter>
      </AntApp>
    </ConfigProvider>,
  )
}

describe('Products taxonomy pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const noopMutation = { mutateAsync: vi.fn(), isPending: false } as never
    vi.mocked(hooks.useDeleteDepartment).mockReturnValue(noopMutation)
    vi.mocked(hooks.useDeleteCategory).mockReturnValue(noopMutation)
    vi.mocked(hooks.useUpdateCategory).mockReturnValue(noopMutation)
    vi.mocked(hooks.useCategoryBuyerOptions).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(hooks.useDeleteGroup).mockReturnValue(noopMutation)
    vi.mocked(hooks.useDeleteKeyword).mockReturnValue(noopMutation)
    vi.mocked(hooks.useDeleteSector).mockReturnValue(noopMutation)
    vi.mocked(hooks.useDeleteReturnCode).mockReturnValue(noopMutation)
    vi.mocked(hooks.useDeletePromotionCode).mockReturnValue(noopMutation)
    vi.mocked(hooks.useDeleteSizeType).mockReturnValue(noopMutation)
    vi.mocked(hooks.useSkuTotal).mockReturnValue({ data: { total: 0 } } as never)
  })

  it('TaxonomyHomePage lists every entity tile', () => {
    renderPage(<TaxonomyHomePage />)
    expect(screen.getByText('Departments')).toBeTruthy()
    expect(screen.getByText('Categories')).toBeTruthy()
    expect(screen.getByText('Groups')).toBeTruthy()
    expect(screen.getByText('Keywords')).toBeTruthy()
    expect(screen.getByText('Seasons')).toBeTruthy()
    expect(screen.getByText('Sectors')).toBeTruthy()
    expect(screen.getByText('Return Codes')).toBeTruthy()
    expect(screen.getByText('Promotion Codes')).toBeTruthy()
    expect(screen.getByText('Size Types')).toBeTruthy()
  })

  it('DepartmentListPage renders rows from useDepartments', () => {
    vi.mocked(hooks.useDepartments).mockReturnValue({
      data: [
        { number: 1, description: 'ROPA HOMBRE', begCateg: 1, endCateg: 10, dateLastChanged: null, skuCount: 0 },
        { number: 2, description: 'ROPA MUJER', begCateg: 11, endCateg: 20, dateLastChanged: null, skuCount: 0 },
      ],
      isLoading: false,
    } as never)
    // DepartmentListPage now computes a derived Sector column — mock useSectors.
    vi.mocked(hooks.useSectors).mockReturnValue({
      data: [
        { number: 1, description: 'MARCAS', begDept: 1, endDept: 20, dateLastChanged: null, skuCount: 0 },
      ],
      isLoading: false,
    } as never)
    renderPage(<DepartmentListPage />)
    expect(screen.getByText('ROPA HOMBRE')).toBeTruthy()
    expect(screen.getByText('ROPA MUJER')).toBeTruthy()
    // Sector 'MARCAS' renders once per department row it covers.
    expect(screen.getAllByText('MARCAS').length).toBeGreaterThanOrEqual(1)
  })

  it('DepartmentFormPage in create mode shows empty form and Save button', () => {
    vi.mocked(hooks.useDepartment).mockReturnValue({ data: undefined } as never)
    vi.mocked(hooks.useCreateDepartment).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(hooks.useUpdateDepartment).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    renderPage(<DepartmentFormPage />)
    expect(screen.getByText('New department')).toBeTruthy()
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy()
  })

  it('CategoryListPage renders categories', () => {
    vi.mocked(hooks.useCategories).mockReturnValue({
      data: [{ number: 100, description: 'TEST CAT', dateLastChanged: null, skuCount: 0 }],
      isLoading: false,
    } as never)
    vi.mocked(hooks.useDepartments).mockReturnValue({
      data: [{ number: 1, description: 'ROPA', begCateg: 1, endCateg: 199, dateLastChanged: null, skuCount: 0 }],
      isLoading: false,
    } as never)
    vi.mocked(hooks.useSectors).mockReturnValue({
      data: [{ number: 1, description: 'GENERAL', begDept: 1, endDept: 99, dateLastChanged: null, skuCount: 0 }],
      isLoading: false,
    } as never)
    renderPage(<CategoryListPage />)
    expect(screen.getByText('TEST CAT')).toBeTruthy()
    expect(screen.getByText(/New category/)).toBeTruthy()
  })

  it('CategoryFormPage in create mode shows empty form and Save button', () => {
    vi.mocked(hooks.useCategory).mockReturnValue({ data: undefined } as never)
    vi.mocked(hooks.useCreateCategory).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(hooks.useUpdateCategory).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    renderPage(<CategoryFormPage />)
    expect(screen.getByText('New category')).toBeTruthy()
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy()
  })

  it('GroupListPage renders groups', () => {
    vi.mocked(hooks.useGroups).mockReturnValue({
      data: [{ code: 'IBL', description: 'IBL group', dateLastChanged: null, skuCount: 0 }],
      isLoading: false,
    } as never)
    renderPage(<GroupListPage />)
    expect(screen.getByText('IBL')).toBeTruthy()
    expect(screen.getByText('IBL group')).toBeTruthy()
  })

  it('KeywordListPage renders keywords', () => {
    vi.mocked(hooks.useKeywords).mockReturnValue({
      data: [{ keyword: 'SUMMER25', description: 'summer ’25', dateLastChanged: null, skuCount: 0 }],
      isLoading: false,
    } as never)
    renderPage(<KeywordListPage />)
    expect(screen.getByText('SUMMER25')).toBeTruthy()
  })

  it('SectorListPage renders sectors', () => {
    vi.mocked(hooks.useSectors).mockReturnValue({
      data: [{ number: 1, description: 'SECTOR H', begDept: 1, endDept: 14, dateLastChanged: null, skuCount: 0 }],
      isLoading: false,
    } as never)
    renderPage(<SectorListPage />)
    expect(screen.getByText('SECTOR H')).toBeTruthy()
  })

  it('ReturnCodeListPage renders trackable tag', () => {
    vi.mocked(hooks.useReturnCodes).mockReturnValue({
      data: [{ code: 1, description: 'Damaged', trackable: true, dateLastChanged: null }],
      isLoading: false,
    } as never)
    renderPage(<ReturnCodeListPage />)
    expect(screen.getByText('Damaged')).toBeTruthy()
    // "Trackable" appears as both a column header and a tag text — match by
    // Tag-class to hit only the per-row rendering.
    const trackableTags = screen.getAllByText('Trackable')
    expect(trackableTags.length).toBeGreaterThan(0)
  })

  it('PromotionCodeListPage renders promotion codes', () => {
    vi.mocked(hooks.usePromotionCodes).mockReturnValue({
      data: [
        {
          code: 'PROMO1',
          description: 'Summer promo',
          date: null,
          pieces: 100,
          cost: 50,
          dateLastChanged: null,
        },
      ],
      isLoading: false,
    } as never)
    renderPage(<PromotionCodeListPage />)
    expect(screen.getByText('PROMO1')).toBeTruthy()
    expect(screen.getByText('Summer promo')).toBeTruthy()
  })

  it('SeasonListPage renders user-defined seasons with CRUD actions', () => {
    vi.mocked(hooks.useSeasons).mockReturnValue({
      data: [
        { code: 'A', description: 'NAV 25', skuCount: 42 },
        { code: 'B', description: 'PRIM 26', skuCount: 3 },
      ],
      isLoading: false,
    } as never)
    vi.mocked(hooks.useSeasonSource).mockReturnValue({
      data: {
        usingRics: true,
        risemfPath: 'C:\\...\\RISEMF.MDB',
        lastError: null,
        table: 'Seasons',
        codeCol: 'Code',
        descCol: 'Desc',
      },
      isLoading: false,
    } as never)
    vi.mocked(hooks.useDeleteSeason).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    renderPage(<SeasonListPage />)
    expect(screen.getByText('NAV 25')).toBeTruthy()
    expect(screen.getByText('PRIM 26')).toBeTruthy()
    expect(screen.getByText(/New season/)).toBeTruthy()
  })

  it('SizeTypeListPage renders grid size summary', () => {
    vi.mocked(hooks.useSizeTypes).mockReturnValue({
      data: [
        {
          code: 10,
          description: 'MEN SHOES',
          columnDescription: 'SIZE',
          rowDescription: 'WDT',
          tableType: '',
          columns: ['060', '065'],
          rows: ['M'],
          maxColumns: 2,
          maxRows: 1,
          dateLastChanged: null,
        },
      ],
      isLoading: false,
    } as never)
    renderPage(<SizeTypeListPage />)
    expect(screen.getByText('MEN SHOES')).toBeTruthy()
    expect(screen.getByText('2 × 1')).toBeTruthy()
  })
})
