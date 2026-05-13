import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReorderPlannerModal } from './ReorderPlannerModal'
import {
  createInquiryReorderDraftPo,
  fetchInquiryReorderPlan,
  type ReorderPlan,
} from '../../../services/ricsInventoryApi'

vi.mock('../../../services/ricsInventoryApi', () => ({
  createInquiryReorderDraftPo: vi.fn(),
  fetchInquiryReorderPlan: vi.fn(),
  saveInquiryReorderDefaults: vi.fn(),
}))

function sizeLine(columnLabel: string, recommendedQty: number) {
  return {
    rowLabel: '',
    columnLabel,
    sizeLabel: columnLabel,
    onHand: 0,
    currentOnOrder: 0,
    futureOnOrder: 0,
    onOrder: 0,
    modelQty: 1,
    modelShort: 1,
    skuSalesQty: recommendedQty,
    categorySalesQty: recommendedQty,
    previousOrderQty: 0,
    curvePct: 0.5,
    curveSource: 'SKU_SALES' as const,
    forecastDemandQty: recommendedQty,
    baselineMonthlyDemand: recommendedQty / 3,
    activeDemandMonths: 12,
    projectedSales: recommendedQty,
    recommendedQty,
  }
}

function zeroSizeLine(columnLabel: string) {
  return {
    ...sizeLine(columnLabel, 0),
    modelQty: 0,
    modelShort: 0,
    skuSalesQty: 0,
    categorySalesQty: 0,
    forecastDemandQty: 0,
    baselineMonthlyDemand: 0,
    curvePct: 0,
  }
}

const plan: ReorderPlan = {
  sku: {
    id: 'sku-1',
    code: 'HG250503-BKNB',
    description: 'Test shoe',
    vendorCode: 'VEND',
    category: 560,
    sizeTypeCode: 1,
    orderMultiple: null,
    unitCost: 10,
    retailPrice: 20,
  },
  planning: {
    analysisDate: '2026-04-29T00:00:00.000Z',
    leadTimeDays: 90,
    orderCycleDays: 90,
    coverageDays: 180,
    moqQty: 0,
    salesLookbackDays: 365,
    forecastMonths: ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'],
    forecastStartMonth: '2026-07',
    seasonalityHistoryEndMonth: '2026-03',
  },
  seasonality: {
    basis: 'DEPARTMENT_ALL_STORES',
    departmentNumber: 56,
    departmentLabel: '56 - Shoes',
    averageMonthlyQty: 100,
    sampleMonths: 12,
    indexes: [],
  },
  vendorDraftPo: {
    poId: 'po-existing',
    poNumber: 'DRAFT42',
    updatedAt: '2026-04-29T00:00:00.000Z',
    lineCount: 1,
    totalQuantity: 30,
  },
  demandSources: [],
  defaults: {
    scope: 'SKU',
    scopeKey: 'sku-1',
    leadTimeDays: 90,
    orderCycleDays: 90,
    moqQty: 0,
    updatedAt: null,
    updatedBy: null,
  },
  chains: [{
    chainId: 'total',
    chainLabel: 'Total order',
    source: 'TOTAL',
    storeNumbers: [1],
    storeCount: 1,
    totals: {
      onHand: 0,
      currentOnOrder: 0,
      futureOnOrder: 0,
      modelQty: 2,
      modelShort: 2,
      skuSalesQty: 10,
      categorySalesQty: 10,
      previousOrderQty: 0,
      forecastDemandQty: 10,
      projectedSales: 10,
      recommendedQty: 10,
    },
    previousOrder: {
      poNumber: 'PO123',
      orderDate: '2026-01-01T00:00:00.000Z',
      source: 'NATIVE',
      casePackId: 'OLD',
      casePackMultiplier: 2,
    },
    casePackSuggestion: {
      code: 'PACK1',
      description: 'Six pair prepack',
      multiplier: 3,
      unitsPerPack: 4,
      totalUnits: 12,
      autoApply: true,
      overbuyQty: 2,
      overbuyLimitQty: 4,
      supplierUsed: true,
      supplierUsageCount: 12,
      supplierLastUsedAt: '2026-01-01T00:00:00.000Z',
      sameSkuPreviousPack: false,
      shortageQty: 0,
      excessQty: 2,
      differenceQty: 2,
      sizeCells: [
        { rowLabel: '', columnLabel: '7', sizeLabel: '7', quantity: 6 },
        { rowLabel: '', columnLabel: '8', sizeLabel: '8', quantity: 6 },
      ],
    },
    casePackChoices: [
      {
        code: 'PACK1',
        description: 'Six pair prepack',
        multiplier: 3,
        unitsPerPack: 4,
        totalUnits: 12,
        autoApply: true,
        overbuyQty: 2,
        overbuyLimitQty: 4,
        supplierUsed: true,
        supplierUsageCount: 12,
        supplierLastUsedAt: '2026-01-01T00:00:00.000Z',
        sameSkuPreviousPack: false,
        shortageQty: 0,
        excessQty: 2,
        differenceQty: 2,
        categoryUsed: true,
        categorySkuCount: 8,
        categoryUsageCount: 15,
        categoryLastUsedAt: '2026-03-01T00:00:00.000Z',
        badges: ['CATEGORY_USED', 'BEST_FIT'],
        sizeCells: [
          { rowLabel: '', columnLabel: '7', sizeLabel: '7', quantity: 6 },
          { rowLabel: '', columnLabel: '8', sizeLabel: '8', quantity: 6 },
        ],
      },
      {
        code: 'OLD',
        description: 'Previous SKU pack',
        multiplier: 2,
        unitsPerPack: 5,
        totalUnits: 10,
        autoApply: true,
        overbuyQty: 0,
        overbuyLimitQty: 5,
        supplierUsed: true,
        supplierUsageCount: 2,
        supplierLastUsedAt: '2026-01-01T00:00:00.000Z',
        sameSkuPreviousPack: true,
        shortageQty: 0,
        excessQty: 0,
        differenceQty: 0,
        categoryUsed: true,
        categorySkuCount: 1,
        categoryUsageCount: 1,
        categoryLastUsedAt: '2026-01-01T00:00:00.000Z',
        badges: ['PREVIOUS_SKU', 'CATEGORY_USED'],
        sizeCells: [
          { rowLabel: '', columnLabel: '7', sizeLabel: '7', quantity: 4 },
          { rowLabel: '', columnLabel: '8', sizeLabel: '8', quantity: 6 },
        ],
      },
    ],
    sizeLines: [
      sizeLine('7', 4),
      sizeLine('8', 6),
      zeroSizeLine('9'),
    ],
  }],
  warnings: [],
}

function renderModal() {
  return render(
    <ConfigProvider>
      <ReorderPlannerModal open skuCode="HG250503-BKNB" onClose={vi.fn()} />
    </ConfigProvider>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('ReorderPlannerModal case packs', () => {
  it('renders a case-pack picker and creates the PO with auto-applied pack quantities by default', async () => {
    vi.mocked(fetchInquiryReorderPlan).mockResolvedValue(plan)
    vi.mocked(createInquiryReorderDraftPo).mockResolvedValue({
      poId: 'po-1',
      poNumber: 'PO999',
      totalQuantity: 12,
      mode: 'APPENDED',
      appendedToExistingPo: true,
    })

    renderModal()

    expect((await screen.findAllByText('PACK1')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('OLD').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Category used').length).toBeGreaterThan(0)
    expect(screen.getByText('Previous SKU')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Selected PACK1' })).toBeInTheDocument()
    const vendorDraftLink = screen.getByRole('link', { name: /DRAFT42/ })
    expect(vendorDraftLink).toHaveAttribute('href', '/purchasing/orders/po-existing')
    expect(screen.getByText('Suggested')).toBeInTheDocument()
    expect(screen.getByText('Cases')).toBeInTheDocument()
    expect(screen.getByText('Order')).toBeInTheDocument()
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    expect(screen.queryByRole('columnheader', { name: '9' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add to draft PO' }))

    await waitFor(() => expect(createInquiryReorderDraftPo).toHaveBeenCalled())
    const firstPayload = vi.mocked(createInquiryReorderDraftPo).mock.calls[0]?.[1]
    expect(firstPayload).toMatchObject({
      casePackId: 'PACK1',
      casePackMultiplier: 3,
      sizeCells: [
        { rowLabel: '', columnLabel: '7', quantity: 6 },
        { rowLabel: '', columnLabel: '8', quantity: 6 },
      ],
    })
  })

  it('lets the buyer select the previous SKU case pack before creating the PO', async () => {
    vi.mocked(fetchInquiryReorderPlan).mockResolvedValue(plan)
    vi.mocked(createInquiryReorderDraftPo).mockResolvedValue({
      poId: 'po-1',
      poNumber: 'PO999',
      totalQuantity: 10,
      mode: 'APPENDED',
      appendedToExistingPo: true,
    })

    renderModal()

    await screen.findAllByText('PACK1')
    await userEvent.click(screen.getByRole('button', { name: 'Use OLD' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add to draft PO' }))

    await waitFor(() => expect(createInquiryReorderDraftPo).toHaveBeenCalled())
    const firstPayload = vi.mocked(createInquiryReorderDraftPo).mock.calls[0]?.[1]
    expect(firstPayload).toMatchObject({
      casePackId: 'OLD',
      casePackMultiplier: 2,
      sizeCells: [
        { rowLabel: '', columnLabel: '7', quantity: 4 },
        { rowLabel: '', columnLabel: '8', quantity: 6 },
      ],
    })
  })

  it('falls back to raw reorder quantities when the pack is cleared', async () => {
    vi.mocked(fetchInquiryReorderPlan).mockResolvedValue(plan)
    vi.mocked(createInquiryReorderDraftPo).mockResolvedValue({
      poId: 'po-1',
      poNumber: 'PO999',
      totalQuantity: 10,
      mode: 'APPENDED',
      appendedToExistingPo: true,
    })

    renderModal()

    await screen.findAllByText('PACK1')
    await userEvent.click(screen.getByRole('button', { name: 'Clear pack' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add to draft PO' }))

    await waitFor(() => expect(createInquiryReorderDraftPo).toHaveBeenCalled())
    const firstPayload = vi.mocked(createInquiryReorderDraftPo).mock.calls[0]?.[1]
    expect(firstPayload).toMatchObject({
      casePackId: null,
      casePackMultiplier: null,
      sizeCells: [
        { rowLabel: '', columnLabel: '7', quantity: 4 },
        { rowLabel: '', columnLabel: '8', quantity: 6 },
      ],
    })
  })

  it('defaults to raw reorder quantities when the suggested pack exceeds the auto-apply cap', async () => {
    const baseChain = plan.chains[0]!
    const overCapPlan: ReorderPlan = {
      ...plan,
      chains: [{
        ...baseChain,
        casePackSuggestion: {
          ...baseChain.casePackSuggestion!,
          autoApply: false,
          multiplier: 6,
          totalUnits: 24,
          overbuyQty: 14,
          overbuyLimitQty: 4,
          supplierUsed: true,
          supplierUsageCount: 5,
          supplierLastUsedAt: '2026-02-01T00:00:00.000Z',
          sameSkuPreviousPack: false,
          shortageQty: 0,
          excessQty: 14,
          differenceQty: 14,
          sizeCells: [
            { rowLabel: '', columnLabel: '7', sizeLabel: '7', quantity: 12 },
            { rowLabel: '', columnLabel: '8', sizeLabel: '8', quantity: 12 },
          ],
        },
      }],
    }
    vi.mocked(fetchInquiryReorderPlan).mockResolvedValue(overCapPlan)
    vi.mocked(createInquiryReorderDraftPo).mockResolvedValue({
      poId: 'po-1',
      poNumber: 'PO999',
      totalQuantity: 10,
      mode: 'APPENDED',
      appendedToExistingPo: true,
    })

    renderModal()

    expect(await screen.findByRole('button', { name: 'Use PACK1' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add to draft PO' }))

    await waitFor(() => expect(createInquiryReorderDraftPo).toHaveBeenCalled())
    const firstPayload = vi.mocked(createInquiryReorderDraftPo).mock.calls[0]?.[1]
    expect(firstPayload).toMatchObject({
      casePackId: null,
      casePackMultiplier: null,
      sizeCells: [
        { rowLabel: '', columnLabel: '7', quantity: 4 },
        { rowLabel: '', columnLabel: '8', quantity: 6 },
      ],
    })
  })
})
