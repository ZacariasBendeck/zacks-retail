import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InventoryClosePage from '../pages/operations/InventoryClosePage'

const apiMock = vi.hoisted(() => ({
  getSummary: vi.fn(),
  runMonthClose: vi.fn(),
  runWeekClose: vi.fn(),
}))

vi.mock('../services/inventoryCloseApi', () => ({
  inventoryCloseApi: apiMock,
}))

vi.mock('../components/page-help', () => ({
  InlinePageHelp: () => <button type="button">Help</button>,
  useRegisterPageHelp: vi.fn(),
}))

const emptySummary = {
  monthRuns: [],
  closedMonths: [],
  weekRuns: [],
  closedWeeks: [],
}

const monthResult = {
  runId: 'run-month',
  closeMonth: '2026-04',
  targetSlot: 4,
  snapshotAsOf: '2026-05-01T06:00:00.000Z',
  companyTimeZone: 'America/Guatemala',
  dryRun: true,
  status: 'DRY_RUN',
  snapshotsScanned: 12,
  monthsUpserted: 12,
  snapshotsUpdated: 12,
  nonzeroMtdCellsBefore: 3,
  salesCellsReset: 3,
  totalQtySales: 8,
  totalNetSales: 1200,
  totalProfit: 450,
  inventoryValueTotal: 9800,
  validation: {
    unpromotedPosTickets: 0,
    salesCellMismatchCount: 0,
    salesCellMismatchQtyAbs: 0,
  },
}

describe('InventoryClosePage', () => {
  beforeEach(() => {
    apiMock.getSummary.mockReset()
    apiMock.runMonthClose.mockReset()
    apiMock.runWeekClose.mockReset()
    apiMock.getSummary.mockResolvedValue(emptySummary)
  })

  it('runs month dry run from the Operations close screen', async () => {
    const user = userEvent.setup()
    apiMock.runMonthClose.mockResolvedValue(monthResult)

    render(
      <ConfigProvider>
        <AntApp>
          <InventoryClosePage />
        </AntApp>
      </ConfigProvider>,
    )

    expect(await screen.findByText('Inventory Close')).toBeInTheDocument()

    const monthInput = screen.getByPlaceholderText('YYYY-MM')
    await user.clear(monthInput)
    await user.type(monthInput, '2026-04')

    const dryRunButton = screen.getAllByRole('button', { name: /Dry Run/i })[0]
    expect(dryRunButton).toBeDefined()
    await user.click(dryRunButton!)

    await waitFor(() => {
      expect(apiMock.runMonthClose).toHaveBeenCalledWith({ closeMonth: '2026-04', dryRun: true })
    })
    expect(await screen.findByText('run-month')).toBeInTheDocument()
  })
})
