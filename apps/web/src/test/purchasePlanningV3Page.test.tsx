import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PurchasePlanningV3Page from '../pages/purchasePlanning/PurchasePlanningV3Page'
import { useDepartments } from '../hooks/useProductsTaxonomy'
import { useStoreChains } from '../hooks/useStores'
import {
  createPurchasePlanV3,
  fetchPurchasePlanV3,
  fetchPurchasePlanV3Plans,
  generatePurchasePlanV3Report,
  type PurchasePlanV3Report,
} from '../services/purchasePlanningApi'

vi.mock('../hooks/useStores', () => ({
  useStoreChains: vi.fn(),
}))

vi.mock('../hooks/useProductsTaxonomy', () => ({
  useDepartments: vi.fn(),
}))

vi.mock('../services/purchasePlanningApi', async () => {
  const actual = await vi.importActual<typeof import('../services/purchasePlanningApi')>('../services/purchasePlanningApi')
  return {
    ...actual,
    fetchPurchasePlanV3Plans: vi.fn(),
    generatePurchasePlanV3Report: vi.fn(),
    createPurchasePlanV3: vi.fn(),
    fetchPurchasePlanV3: vi.fn(),
    archivePurchasePlanV3: vi.fn(),
  }
})

const report: PurchasePlanV3Report = {
  storeGroups: [
    { code: 'unlimited', label: 'Unlimited', storeNumbers: [1, 2] },
    { code: 'magic-shoes', label: 'Magic Shoes & Fashion', storeNumbers: [10, 16] },
  ],
  departmentNumber: 10,
  departmentLabel: '10 - Footwear',
  year: 2026,
  forecastMethod: 'holtWinters',
  eohMethod: 'forward',
  coverMonths: 3,
  discountNormalization: true,
  historyFromYearMonth: '2023-02',
  historyToYearMonth: '2026-01',
  warehouseStoreNumbers: [99],
  warnings: ['Warehouse planning credit considered store(s): 99.'],
  generatedAt: '2026-04-30T10:00:00.000Z',
  totals: {
    projectedSales: { units: 220 },
    baselineBuy: { units: 180 },
    warehousePlanningCredit: { units: 45 },
    recommendedBuy: { units: 135 },
    warehouseUnallocated: { units: 0 },
  },
  seasons: [
    {
      season: 'spring',
      seasonYear: 2026,
      seasonLabel: 'Spring 2026',
      months: ['2026-02', '2026-03', '2026-04'],
      rows: [
        {
          storeGroupCode: 'unlimited',
          storeGroupLabel: 'Unlimited',
          season: 'spring',
          seasonYear: 2026,
          seasonLabel: 'Spring 2026',
          seasonMonths: ['2026-02', '2026-03', '2026-04'],
          projectedBoh: { units: 80 },
          projectedSales: { units: 100 },
          eohTarget: { units: 70 },
          baselineBuy: { units: 90 },
          chainOnHand: { units: 50 },
          currentOnOrder: { units: 5 },
          futureOnOrder: { units: 0 },
          nativeOpenPo: { units: 5 },
          stockPosition: { units: 60 },
          warehouseEligible: { units: 40 },
          warehousePlanningCredit: { units: 30 },
          warehouseUnallocated: { units: 0 },
          totalAvailableForPlan: { units: 110 },
          recommendedBuy: { units: 60 },
          projectedEoh: { units: 70 },
          warehouseDetails: [
            {
              skuCode: 'SKU1',
              skuDescription: 'Black pump',
              startingWarehouseOnHand: 40,
              eligibleStoreGroupCodes: ['unlimited', 'magic-shoes'],
              allocatedUnits: 30,
              remainingUnits: 10,
              reason: 'eligible_credit',
            },
          ],
        },
      ],
    },
  ],
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
        <PurchasePlanningV3Page />
      </QueryClientProvider>
    </ConfigProvider>,
  )
}

async function chooseSelectOption(label: string, option: string) {
  await userEvent.click(screen.getByLabelText(label))
  await userEvent.click(await within(document.body).findByTitle(option))
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('PurchasePlanningV3Page', () => {
  it('generates a warehouse-shared V3 report', async () => {
    vi.mocked(useStoreChains).mockReturnValue({
      data: [
        { id: 'unlimited', label: 'Unlimited', storeCount: 2, active: true },
        { id: 'magic-shoes', label: 'Magic Shoes & Fashion', storeCount: 2, active: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useDepartments).mockReturnValue({
      data: [{ number: 10, description: 'Footwear' }],
      isLoading: false,
    } as never)
    vi.mocked(fetchPurchasePlanV3Plans).mockResolvedValue([])
    vi.mocked(fetchPurchasePlanV3).mockResolvedValue(report)
    vi.mocked(generatePurchasePlanV3Report).mockResolvedValue(report)

    renderPage()

    await chooseSelectOption('Chains', 'Unlimited (2)')
    await chooseSelectOption('Chains', 'Magic Shoes & Fashion (2)')
    await chooseSelectOption('Department', '10 - Footwear')
    await userEvent.click(screen.getByRole('button', { name: 'Generate V3' }))

    await waitFor(() => expect(generatePurchasePlanV3Report).toHaveBeenCalledTimes(1))
    expect(vi.mocked(generatePurchasePlanV3Report).mock.calls[0]?.[0]).toMatchObject({
      storeGroupCodes: ['unlimited', 'magic-shoes'],
      departmentNumber: 10,
      year: 2026,
      forecast: { method: 'holtWinters' },
      eohMethod: 'forward',
      coverMonths: 3,
      discountNormalization: true,
      createdBy: 'buyer',
    })
    expect((await screen.findAllByText('Warehouse credit')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Recommended buy').length).toBeGreaterThan(0)
    expect(screen.getByText('Demand fair-share')).toBeInTheDocument()
    expect(screen.getByText('Unlimited')).toBeInTheDocument()
  })

  it('saves V3 plans through the isolated V3 endpoint', async () => {
    vi.mocked(useStoreChains).mockReturnValue({
      data: [{ id: 'unlimited', label: 'Unlimited', storeCount: 2, active: true }],
      isLoading: false,
    } as never)
    vi.mocked(useDepartments).mockReturnValue({
      data: [{ number: 10, description: 'Footwear' }],
      isLoading: false,
    } as never)
    vi.mocked(fetchPurchasePlanV3Plans).mockResolvedValue([])
    vi.mocked(fetchPurchasePlanV3).mockResolvedValue(report)
    vi.mocked(createPurchasePlanV3).mockResolvedValue({
      ...report,
      plan: {
        id: 'v3-1',
        label: 'V3 Footwear',
        status: 'draft',
        storeGroupCodes: ['unlimited'],
        departmentNumber: 10,
        departmentLabel: '10 - Footwear',
        year: 2026,
        forecastMethod: 'holtWinters',
        eohMethod: 'forward',
        coverMonths: 3,
        discountNormalization: true,
        historyFromYearMonth: '2023-02',
        historyToYearMonth: '2026-01',
        warehouseStoreNumbers: [99],
        createdBy: 'buyer',
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
        archivedAt: null,
      },
    })

    renderPage()

    await chooseSelectOption('Department', '10 - Footwear')
    await userEvent.click(screen.getByRole('button', { name: 'Save V3 plan' }))

    await waitFor(() => expect(createPurchasePlanV3).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createPurchasePlanV3).mock.calls[0]?.[0]).toMatchObject({
      storeGroupCodes: ['unlimited'],
      departmentNumber: 10,
      year: 2026,
    })
  })

  it('excludes accented warehouse chain labels from the default V3 scope', async () => {
    vi.mocked(useStoreChains).mockReturnValue({
      data: [
        { id: 'unlimited', label: 'Unlimited', storeCount: 2, active: true },
        { id: 'almacen-central', label: 'Almac\u00e9n Central', storeCount: 1, active: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useDepartments).mockReturnValue({
      data: [{ number: 10, description: 'Footwear' }],
      isLoading: false,
    } as never)
    vi.mocked(fetchPurchasePlanV3Plans).mockResolvedValue([])
    vi.mocked(fetchPurchasePlanV3).mockResolvedValue(report)
    vi.mocked(generatePurchasePlanV3Report).mockResolvedValue(report)

    renderPage()

    await chooseSelectOption('Department', '10 - Footwear')
    await userEvent.click(screen.getByRole('button', { name: 'Generate V3' }))

    await waitFor(() => expect(generatePurchasePlanV3Report).toHaveBeenCalledTimes(1))
    expect(vi.mocked(generatePurchasePlanV3Report).mock.calls[0]?.[0].storeGroupCodes).toEqual(['unlimited'])
  })
})
