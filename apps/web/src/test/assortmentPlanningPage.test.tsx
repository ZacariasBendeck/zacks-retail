import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AssortmentPlanningPage from '../pages/purchasePlanning/AssortmentPlanningPage'
import { useStores } from '../hooks/useStores'
import { useCategories, useDepartments } from '../hooks/useProductsTaxonomy'
import {
  fetchAssortmentPlan,
  fetchAssortmentPlans,
  previewAssortmentPlan,
  type AssortmentPlanReport,
} from '../services/assortmentPlanningApi'

vi.mock('../hooks/useStores', () => ({
  useStores: vi.fn(),
}))

vi.mock('../hooks/useProductsTaxonomy', () => ({
  useCategories: vi.fn(),
  useDepartments: vi.fn(),
}))

vi.mock('../services/assortmentPlanningApi', async () => {
  const actual = await vi.importActual<typeof import('../services/assortmentPlanningApi')>('../services/assortmentPlanningApi')
  return {
    ...actual,
    fetchAssortmentPlans: vi.fn(),
    fetchAssortmentPlan: vi.fn(),
    previewAssortmentPlan: vi.fn(),
    createAssortmentPlan: vi.fn(),
    createAssortmentTransferDrafts: vi.fn(),
    commitAssortmentWave: vi.fn(),
  }
})

const report: AssortmentPlanReport = {
  planningScope: { type: 'DEPARTMENT', number: 10 },
  scopeLabel: '10 - Footwear',
  categoryNumber: 10,
  categoryLabel: '10 - Footwear',
  categoryNumbers: [71, 72],
  warehouseStoreId: 99,
  warehouseStoreLabel: '99 - BODEGA GENERAL',
  targetStores: [{
    storeId: 1,
    storeLabel: '1 - Store A',
    salesUnits: 120,
    currentSkuCount: 12,
    currentUnits: 30,
    weight: 120,
    suggestedSkuBudget: 12,
    averageMonthlySales: 10,
    salesPerSkuMonth: 0.83,
    suggestedModelQuantity: 3,
  }],
  startDate: '2026-05-15',
  horizonMonths: 12,
  highSeasonMonths: [6, 11, 12],
  planningFactors: {
    historyMonths: 18,
    modelCoverWeeks: 6,
    modelDisplayFloor: 1,
    maxModelQuantity: 6,
    stockOnlyStoreWeightPct: 5,
    unseenColorFallbackPct: 2,
    waveWeights: [
      { releaseDate: '2026-05-15', weight: 1 },
      { releaseDate: '2026-06-01', weight: 1 },
    ],
    storeModelOverrides: [{ storeId: 1, modelQuantity: 3 }],
    colorOverrides: [],
    skuWaveOverrides: [],
  },
  historyFromYearMonth: '2024-12',
  historyToYearMonth: '2026-05',
  pool: [{
    skuId: 'sku-1',
    skuCode: 'ABC123BK',
    skuDescription: 'Black shoe',
    categoryNumber: 71,
    categoryLabel: '71 - Shoes',
    styleColor: null,
    colorCode: null,
    rawColorKey: 'BK',
    canonicalColor: 'Negro',
    colorFamily: 'black',
    inclusionReason: 'PR',
    warehouseUnits: 12,
    storeUnits: 0,
    keywords: 'PR',
    assignedWaveSequence: 1,
  }],
  colorMix: [{
    canonicalColor: 'Negro',
    colorFamily: 'black',
    salesUnits: 100,
    salesPct: 100,
    plannedStyleCount: 1,
    plannedStylePct: 100,
  }],
  waves: [{
    sequence: 1,
    releaseDate: '2026-05-15',
    status: 'DRAFT',
    generatedTransferIds: [],
    committedAt: null,
    styleCount: 1,
    totalUnits: 3,
    lines: [],
  }, {
    sequence: 2,
    releaseDate: '2026-06-01',
    status: 'DRAFT',
    generatedTransferIds: [],
    committedAt: null,
    styleCount: 0,
    totalUnits: 0,
    lines: [],
  }],
  totals: {
    poolSkuCount: 1,
    poolUnits: 12,
    plannedReleaseUnits: 3,
    reserveUnits: 9,
    waveCount: 2,
    targetStoreCount: 1,
    transferDraftCount: 0,
    committedWaveCount: 0,
  },
  warnings: [],
  generatedAt: '2026-05-15T00:00:00.000Z',
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <ConfigProvider>
      <QueryClientProvider client={qc}>
        <AssortmentPlanningPage />
      </QueryClientProvider>
    </ConfigProvider>,
  )
}

async function chooseSelectOption(label: string, option: string) {
  const control = screen.queryByRole('combobox', { name: label }) ?? screen.getAllByLabelText(label)[0]!
  await userEvent.click(control)
  await userEvent.click(await within(document.body).findByTitle(option))
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('AssortmentPlanningPage', () => {
  it('previews a department scoped plan with editable planning factors', async () => {
    vi.mocked(useStores).mockReturnValue({
      data: [
        { id: 1, name: 'Store A', active: true },
        { id: 99, name: 'BODEGA GENERAL', active: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useCategories).mockReturnValue({
      data: [{ number: 71, description: 'Shoes' }],
      isLoading: false,
    } as never)
    vi.mocked(useDepartments).mockReturnValue({
      data: [{ number: 10, description: 'Footwear', begCateg: 70, endCateg: 79, dateLastChanged: null, skuCount: 1 }],
      isLoading: false,
    } as never)
    vi.mocked(fetchAssortmentPlans).mockResolvedValue([])
    vi.mocked(fetchAssortmentPlan).mockResolvedValue(report)
    vi.mocked(previewAssortmentPlan).mockResolvedValue(report)

    renderPage()

    await chooseSelectOption('Scope', 'Department')
    await chooseSelectOption('Department', '10 - Footwear')
    await userEvent.clear(screen.getByLabelText('History months'))
    await userEvent.type(screen.getByLabelText('History months'), '18')
    await userEvent.clear(screen.getByLabelText('Cover weeks'))
    await userEvent.type(screen.getByLabelText('Cover weeks'), '6')
    await userEvent.click(screen.getByRole('button', { name: /Preview/ }))

    await waitFor(() => expect(previewAssortmentPlan).toHaveBeenCalledTimes(1))
    expect(vi.mocked(previewAssortmentPlan).mock.calls[0]?.[0]).toMatchObject({
      planningScope: { type: 'DEPARTMENT', number: 10 },
      warehouseStoreId: 99,
      planningFactors: {
        historyMonths: 18,
        modelCoverWeeks: 6,
        skuWaveOverrides: [],
      },
    })
    await userEvent.click(await screen.findByRole('tab', { name: 'Pool Review' }))
    expect(await screen.findByText('ABC123BK')).toBeInTheDocument()
    await chooseSelectOption('ABC123BK wave assignment', '#2 - 2026-06-01')
    await userEvent.click(screen.getByRole('button', { name: /Preview/ }))

    await waitFor(() => expect(previewAssortmentPlan).toHaveBeenCalledTimes(2))
    expect(vi.mocked(previewAssortmentPlan).mock.calls[1]?.[0]).toMatchObject({
      planningFactors: {
        skuWaveOverrides: [{ skuId: 'sku-1', releaseDate: '2026-06-01' }],
      },
    })
  })
})
