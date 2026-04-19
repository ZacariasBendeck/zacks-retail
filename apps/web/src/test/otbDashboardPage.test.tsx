import { render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OtbDashboardPage from '../pages/otb/OtbDashboardPage'
import { useOtbLines, useOtbSummary } from '../hooks/useOtb'

vi.mock('../hooks/useOtb', () => ({
  useOtbSummary: vi.fn(),
  useOtbLines: vi.fn(),
}))

vi.mock('../components/ServerDataTable', () => ({
  default: () => <div data-testid="otb-lines-table" />,
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
    vi.mocked(useOtbSummary).mockReturnValue({
      data: {
        summary: [
          {
            department: 'FORMAL',
            budgetAmount: 1000,
            actualAmount: 800,
            committedAmount: 120,
            openToBuyAmount: 80,
            variancePct: -20,
          },
          {
            department: 'CASUAL',
            budgetAmount: 2500,
            actualAmount: 1500,
            committedAmount: 300,
            openToBuyAmount: 700,
            variancePct: -40,
          },
        ],
        trend: [],
      },
      isLoading: false,
    } as never)

    vi.mocked(useOtbLines).mockReturnValue({
      data: {
        data: [],
        pagination: {
          page: 1,
          pageSize: 100,
          totalItems: 0,
          totalPages: 0,
        },
      },
      isLoading: false,
      isFetching: false,
    } as never)
  })

  it('shows aggregated OTB KPI totals from summary data', async () => {
    render(
      <ConfigProvider>
        <MemoryRouter>
          <OtbDashboardPage />
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(await screen.findByTestId('otb-lines-table')).toBeInTheDocument()
    expect(readStatisticValue('Budget')).toContain('3500.00')
    expect(readStatisticValue('Actual')).toContain('2300.00')
    expect(readStatisticValue('Committed')).toContain('420.00')
    expect(readStatisticValue('Open To Buy')).toContain('780.00')
  })
})
