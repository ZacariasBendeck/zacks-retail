import { render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OtbDashboardPage from '../pages/otb/OtbDashboardPage'
import { useOtbDashboardPlans, useOtbDashboardRows, useOtbDashboardSummary } from '../hooks/useOtbDashboard'
import { useDepartments } from '../hooks/useProductsTaxonomy'

vi.mock('../hooks/useOtbDashboard', () => ({
  useOtbDashboardPlans: vi.fn(),
  useOtbDashboardSummary: vi.fn(),
  useOtbDashboardRows: vi.fn(),
}))

vi.mock('../hooks/useProductsTaxonomy', () => ({
  useDepartments: vi.fn(),
}))

vi.mock('../components/ServerDataTable', () => ({
  default: () => <div data-testid="otb-dashboard-table" />,
}))

vi.mock('../components/charts/WeeklyBudgetVsActualChart', () => ({
  default: () => <div data-testid="otb-trend-chart" />,
}))

function readStatisticValue(title: string): string {
  const statistic = screen.getByText(title).closest('.ant-statistic')
  expect(statistic).toBeTruthy()
  const value = statistic?.querySelector('.ant-statistic-content-value')?.textContent ?? ''
  return value.replace(/[, ]/g, '')
}

describe('OtbDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(useOtbDashboardPlans).mockReturnValue({
      data: {
        plans: [
          {
            id: 'plan-current',
            label: 'Current Month Plan',
            status: 'draft',
            planningScope: 'enterprise',
            planningScopeLabel: 'Enterprise-wide',
            storeGroupCode: 'enterprise',
            storeGroupLabel: 'Enterprise-wide',
            season: 'summer',
            seasonYear: new Date().getFullYear(),
            seasonMonths: [`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`],
            selectedDepartments: [13],
            rowCount: 1,
            plannedBuyUnits: 350,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-02T00:00:00.000Z',
          },
        ],
      },
      isLoading: false,
    } as never)

    vi.mocked(useDepartments).mockReturnValue({
      data: [
        {
          number: 13,
          description: 'ZAPATO MARCA HOMBRE',
          begCateg: 130,
          endCateg: 139,
          dateLastChanged: null,
          skuCount: 10,
        },
      ],
      isLoading: false,
    } as never)

    vi.mocked(useOtbDashboardSummary).mockReturnValue({
      data: {
        planId: 'plan-current',
        totals: {
          plannedBuyUnits: 3500,
          projectedSalesUnits: 2300,
          committedUnits: 420,
          stockPositionUnits: 1200,
          openToBuyUnits: 3080,
          rowCount: 2,
        },
        trend: [],
        generatedAt: '2026-05-05T00:00:00.000Z',
      },
      isLoading: false,
    } as never)

    vi.mocked(useOtbDashboardRows).mockReturnValue({
      data: {
        data: [],
        pagination: {
          page: 1,
          pageSize: 100,
          totalItems: 0,
          totalPages: 1,
        },
      },
      isLoading: false,
      isFetching: false,
    } as never)
  })

  it('shows saved purchase-plan unit KPI totals', async () => {
    render(
      <ConfigProvider>
        <MemoryRouter>
          <OtbDashboardPage />
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(await screen.findByTestId('otb-dashboard-table')).toBeInTheDocument()
    expect(readStatisticValue('Planned Buy Units')).toContain('3500')
    expect(readStatisticValue('Projected Sales Units')).toContain('2300')
    expect(readStatisticValue('Committed PO Units')).toContain('420')
    expect(readStatisticValue('Open To Buy Units')).toContain('3080')
  })

  it('defaults to the newest draft plan covering the current month', async () => {
    render(
      <ConfigProvider>
        <MemoryRouter>
          <OtbDashboardPage />
        </MemoryRouter>
      </ConfigProvider>,
    )

    await waitFor(() => {
      expect(useOtbDashboardSummary).toHaveBeenLastCalledWith(
        expect.objectContaining({ planId: 'plan-current' }),
      )
    })
  })

  it('shows an empty state when there are no saved purchase plans', async () => {
    vi.mocked(useOtbDashboardPlans).mockReturnValueOnce({
      data: { plans: [] },
      isLoading: false,
    } as never)

    render(
      <ConfigProvider>
        <MemoryRouter>
          <OtbDashboardPage />
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(await screen.findByText('No saved purchase plans are available for the dashboard.')).toBeInTheDocument()
  })

  it('shows the API error banner', async () => {
    vi.mocked(useOtbDashboardSummary).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Summary failed'),
    } as never)

    render(
      <ConfigProvider>
        <MemoryRouter>
          <OtbDashboardPage />
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(await screen.findByText('OTB data request failed')).toBeInTheDocument()
    expect(screen.getByText('Summary failed')).toBeInTheDocument()
  })
})
