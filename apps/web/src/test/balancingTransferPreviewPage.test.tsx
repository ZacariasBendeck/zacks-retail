import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BalancingTransferPreviewPage from '../pages/inventory/BalancingTransferPreviewPage'
import * as transferRunHooks from '../hooks/useTransferRuns'
import * as reportTemplateHooks from '../hooks/useReportTemplates'
import type { BalancingTransferPreviewRecord } from '../types/transferRuns'

vi.mock('../hooks/useTransferRuns', () => ({
  useTransferStores: vi.fn(),
  useCreateBalancingTransferRun: vi.fn(),
  useCommitBalancingTransferRun: vi.fn(),
}))

vi.mock('../hooks/useReportTemplates', () => ({
  useCreateReportTemplate: vi.fn(),
  useUpdateReportTemplate: vi.fn(),
  useReportTemplatesList: vi.fn(),
  useReportTemplate: vi.fn(),
  useTouchReportTemplate: vi.fn(),
}))

function buildPreview(overrides: Partial<BalancingTransferPreviewRecord> = {}): BalancingTransferPreviewRecord {
  return {
    id: 'run-1',
    status: 'PREVIEWED',
    algorithmMode: 'APP_LEGACY',
    balancingMethod: 'WITHOUT_CONSIDERING_MODELS',
    performanceMetric: 'ROI',
    salesPeriod: 'YEAR',
    sortOrder: 'SKU',
    tieBreakKind: 'PERCENT',
    tieBreakValue: 25,
    transferDoublesToLowerPriority: false,
    stripStoresBelowSizeCount: null,
    inTransitPos: false,
    criteria: {},
    summary: {
      transferCount: 0,
      skuCount: 0,
      storePairCount: 0,
      totalUnits: 0,
      exceptionCount: 0,
      negativeMtdSalesSkipCount: 0,
    },
    lines: [],
    exceptions: [],
    negativeMtdSalesSkips: [],
    requestedBy: 'tester',
    createdAt: '2026-04-29T00:00:00.000Z',
    previewedAt: '2026-04-29T00:00:00.000Z',
    committedAt: null,
    generatedTransferIds: [],
    ...overrides,
  }
}

function renderPage(initialEntry = '/inventory/transfers/balancing') {
  return render(
    <ConfigProvider>
      <AntApp>
        <MemoryRouter initialEntries={[initialEntry]}>
          <BalancingTransferPreviewPage />
        </MemoryRouter>
      </AntApp>
    </ConfigProvider>,
  )
}

async function selectBalancingStore(label: string) {
  const selector = document.querySelector<HTMLDivElement>(
    '[data-testid="balancing-stores-select"] .ant-select-selector',
  )
  if (!selector) throw new Error('balancing stores selector not found')
  fireEvent.mouseDown(selector)
  const option = await screen.findByText(label, { selector: '.ant-select-item-option-content' })
  fireEvent.click(option)
}

describe('BalancingTransferPreviewPage', () => {
  let createRun: ReturnType<typeof vi.fn>
  let touchTemplate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    createRun = vi.fn().mockResolvedValue(buildPreview())
    touchTemplate = vi.fn()
    vi.mocked(transferRunHooks.useTransferStores).mockReturnValue({
      data: [
        { storeId: 2, storeLabel: '2 - Store 2' },
        { storeId: 5, storeLabel: '5 - Store 5' },
      ],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(transferRunHooks.useCreateBalancingTransferRun).mockReturnValue({
      mutateAsync: createRun,
      isPending: false,
    } as never)
    vi.mocked(transferRunHooks.useCommitBalancingTransferRun).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(reportTemplateHooks.useCreateReportTemplate).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(reportTemplateHooks.useUpdateReportTemplate).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(reportTemplateHooks.useReportTemplatesList).mockReturnValue({
      data: { templates: [] },
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(reportTemplateHooks.useReportTemplate).mockReturnValue({ data: undefined } as never)
    vi.mocked(reportTemplateHooks.useTouchReportTemplate).mockReturnValue({ mutate: touchTemplate } as never)
  })

  it('keeps the legacy engine as the default preview payload', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Preview Transfers/i }))

    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      algorithmMode: 'APP_LEGACY',
      balancingMethod: 'WITHOUT_CONSIDERING_MODELS',
      performanceMetric: 'ROI',
      salesPeriod: 'YEAR',
      tieBreakKind: 'PERCENT',
      tieBreakValue: 25,
    }))
  })

  it('loads the ZAP local preset with exact RICS criteria', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Apply ZAP CABALLEROS/i }))

    expect((screen.getByLabelText('RICS stores') as HTMLInputElement).value).toBe('2,5-24,28-30,35-43,99')
    expect((screen.getByLabelText('RICS categories') as HTMLInputElement).value).toBe('500-555')
    expect((screen.getByLabelText('RICS seasons') as HTMLInputElement).value).toBe('Q-Z,1-9,A')
    expect((screen.getByLabelText('RICS keyword exclusions') as HTMLInputElement).value).toBe('<>DST')

    await user.click(screen.getByRole('button', { name: /Preview Transfers/i }))

    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      algorithmMode: 'RICS_MIMIC',
      balancingMethod: 'OVER_UNDER_MODELS',
      performanceMetric: 'TURNS',
      salesPeriod: 'MONTH',
      sortOrder: 'VENDOR',
      criteria: expect.objectContaining({
        ricsStoreSelection: '2,5-24,28-30,35-43,99',
        ricsCategorySelection: '500-555',
        ricsSeasonSelection: 'Q-Z,1-9,A',
        ricsKeywordExclusions: '<>DST',
      }),
    }))
  })

  it('allows RICS mimic to run with custom selected stores and category range', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByText('RICS mimic'))
    await selectBalancingStore('2 - Store 2')
    await selectBalancingStore('5 - Store 5')
    await user.type(screen.getByLabelText('Category min'), '500')
    await user.type(screen.getByLabelText('Category max'), '555')
    await user.click(screen.getByRole('button', { name: /Preview Transfers/i }))

    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      algorithmMode: 'RICS_MIMIC',
      balancingMethod: 'OVER_UNDER_MODELS',
      performanceMetric: 'TURNS',
      salesPeriod: 'MONTH',
      criteria: expect.objectContaining({
        storeIds: [2, 5],
        categoryMin: 500,
        categoryMax: 555,
        ricsStoreSelection: null,
        ricsCategorySelection: null,
      }),
    }))
  })

  it('hydrates a balancing-transfer template, touches it, and computes a preview', async () => {
    vi.mocked(reportTemplateHooks.useReportTemplate).mockReturnValue({
      data: {
        template: {
          id: 'tpl-1',
          ownerId: 'user-1',
          ownerDisplayName: 'Tester',
          reportType: 'balancing-transfer',
          title: 'ROPACABALLEROS',
          visibility: 'shared',
          createdAt: '2026-04-29T00:00:00.000Z',
          updatedAt: '2026-04-29T00:00:00.000Z',
          lastUsedAt: null,
          paramsJson: {
            algorithmMode: 'RICS_MIMIC',
            balancingMethod: 'OVER_UNDER_MODELS',
            performanceMetric: 'TURNS',
            salesPeriod: 'MONTH',
            sortOrder: 'CATEGORY',
            tieBreakKind: 'ABSOLUTE',
            tieBreakValue: 0,
            criteria: {
              ricsStoreSelection: '2,5-25,28-30,35-43,99',
              ricsCategorySelection: '301-499',
              ricsSeasonSelection: 'A-Z,1-9,0',
              ricsKeywordExclusions: '<>DST,<>VER26*',
            },
          },
        },
      },
    } as never)

    renderPage('/inventory/transfers/balancing?templateId=tpl-1')

    await waitFor(() => {
      expect(touchTemplate).toHaveBeenCalledWith('tpl-1')
      expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
        algorithmMode: 'RICS_MIMIC',
        sortOrder: 'CATEGORY',
        criteria: expect.objectContaining({
          ricsStoreSelection: '2,5-25,28-30,35-43,99',
          ricsCategorySelection: '301-499',
          ricsSeasonSelection: 'A-Z,1-9,0',
          ricsKeywordExclusions: '<>DST,<>VER26*',
        }),
      }))
    })
  })
})
