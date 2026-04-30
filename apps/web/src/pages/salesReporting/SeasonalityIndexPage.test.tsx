import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import SeasonalityIndexPage from './SeasonalityIndexPage'

vi.mock('../../hooks/useReports', () => ({
  useSeasonalityIndex: () => ({
    isFetching: false,
    error: null,
    data: {
      basis: 'DEPARTMENT_ALL_STORES',
      generatedAt: '2026-04-29T00:00:00.000Z',
      historyStartMonth: '2025-05',
      historyEndMonth: '2026-04',
      rows: [{
        departmentNumber: 5,
        departmentLabel: '5 - Shoes',
        totalSalesQty: 1200,
        averageMonthlyQty: 100,
        sampleMonths: 12,
        months: [
          { month: 1, label: 'Jan', rawSalesQty: 80, index: 0.8 },
          { month: 2, label: 'Feb', rawSalesQty: 100, index: 1 },
          { month: 3, label: 'Mar', rawSalesQty: 110, index: 1.1 },
          { month: 4, label: 'Apr', rawSalesQty: 70, index: 0.7 },
          { month: 5, label: 'May', rawSalesQty: 100, index: 1 },
          { month: 6, label: 'Jun', rawSalesQty: 140, index: 1.4 },
          { month: 7, label: 'Jul', rawSalesQty: 100, index: 1 },
          { month: 8, label: 'Aug', rawSalesQty: 100, index: 1 },
          { month: 9, label: 'Sep', rawSalesQty: 100, index: 1 },
          { month: 10, label: 'Oct', rawSalesQty: 100, index: 1 },
          { month: 11, label: 'Nov', rawSalesQty: 100, index: 1 },
          { month: 12, label: 'Dec', rawSalesQty: 200, index: 2 },
        ],
      }],
    },
  }),
}))

describe('SeasonalityIndexPage', () => {
  it('renders department rows and monthly index values', async () => {
    render(
      <MemoryRouter initialEntries={['/reports/sales/seasonality-index']}>
        <SeasonalityIndexPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /Seasonality Index/i })).toBeInTheDocument()
    const row = await screen.findByRole('row', { name: /5 - Shoes/i })
    expect(within(row).getByText('1,200')).toBeInTheDocument()
    expect(within(row).getByText('0.70')).toBeInTheDocument()
    expect(within(row).getByText('2.00')).toBeInTheDocument()
  })
})
