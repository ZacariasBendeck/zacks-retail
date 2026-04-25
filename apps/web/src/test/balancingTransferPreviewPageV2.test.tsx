import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BalancingTransferPreviewPageV2 from '../pages/inventory/BalancingTransferPreviewPageV2'
import * as transferRunHooks from '../hooks/useTransferRuns'
import * as transferRunHooksV2 from '../hooks/useTransferRunsV2'
import type { BalancingTransferPreviewRecordV2 } from '../types/transferRunsV2'

vi.mock('../hooks/useTransferRuns', () => ({
  useTransferStores: vi.fn(),
}))

vi.mock('../hooks/useTransferRunsV2', () => ({
  useCreateBalancingTransferRunV2: vi.fn(),
  useCommitBalancingTransferRunV2: vi.fn(),
}))

function renderPage() {
  return render(
    <ConfigProvider>
      <AntApp>
        <MemoryRouter>
          <BalancingTransferPreviewPageV2 />
        </MemoryRouter>
      </AntApp>
    </ConfigProvider>,
  )
}

describe('BalancingTransferPreviewPageV2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(transferRunHooks.useTransferStores).mockReturnValue({
      data: [
        { storeId: 2, storeLabel: '2 - UNLIMITED C. 2000' },
        { storeId: 3, storeLabel: '3 - MULTIPLAZA' },
      ],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(transferRunHooksV2.useCommitBalancingTransferRunV2).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
  })

  it('renders a preview action inside the run setup card and uses it to create a preview', async () => {
    const user = userEvent.setup()
    const preview: BalancingTransferPreviewRecordV2 = {
      id: 'run-v2-1',
      status: 'PREVIEWED',
      goalPreset: 'WEEKLY_BALANCE',
      balancingMethod: 'WITHOUT_CONSIDERING_MODELS',
      performanceMetric: 'ROI',
      salesPeriod: 'YEAR',
      sortOrder: 'SKU',
      tieBreakKind: 'PERCENT',
      tieBreakValue: 25,
      transferDoublesToLowerPriority: false,
      stripStoresBelowSizeCount: null,
      inTransitPos: false,
      allowLowConfidenceMoves: false,
      cooldownDays: 14,
      protectDaysOverride: null,
      criteria: {},
      summary: {
        transferCount: 0,
        skuCount: 0,
        storePairCount: 0,
        totalUnits: 0,
        exceptionCount: 0,
        passBreakdown: [],
      },
      lines: [],
      exceptions: [],
      requestedBy: 'tester',
      createdAt: '2026-04-25T00:00:00.000Z',
      previewedAt: '2026-04-25T00:00:00.000Z',
      committedAt: null,
      generatedTransferIds: [],
      comparison: null,
    }
    const mutateAsync = vi.fn().mockResolvedValue(preview)
    vi.mocked(transferRunHooksV2.useCreateBalancingTransferRunV2).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never)

    renderPage()

    expect(screen.getByRole('button', { name: /Preview Transfers/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Commit Transfers/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Preview Transfers/i }))

    expect(mutateAsync).toHaveBeenCalledWith({
      goalPreset: 'WEEKLY_BALANCE',
      balancingMethod: 'WITHOUT_CONSIDERING_MODELS',
      performanceMetric: 'ROI',
      salesPeriod: 'YEAR',
      sortOrder: 'SKU',
      tieBreakKind: 'PERCENT',
      tieBreakValue: 25,
      transferDoublesToLowerPriority: false,
      stripStoresBelowSizeCount: null,
      inTransitPos: false,
      allowLowConfidenceMoves: false,
      cooldownDays: 14,
      protectDaysOverride: null,
      criteria: {
        storeIds: undefined,
        vendorCodes: [],
        seasons: [],
        styleColors: [],
        groupCodes: [],
        keywords: [],
        skuCodes: [],
        categoryMin: null,
        categoryMax: null,
        limit: 500,
        includeOriginalRetailOnly: false,
        includeMarkdownOnly: false,
        includePerksOnly: false,
      },
    })
  })
})
