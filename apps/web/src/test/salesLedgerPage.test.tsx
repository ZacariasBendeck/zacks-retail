import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SalesLedgerPage from '../pages/inventory/SalesLedgerPage'
import { useSalesLedger } from '../hooks/useSalesLedger'
import { useStores } from '../hooks/useStores'
import type { SalesLedgerParams, SalesLedgerResponse } from '../types/salesLedger'

vi.mock('../hooks/useSalesLedger', () => ({
  useSalesLedger: vi.fn(),
}))

vi.mock('../hooks/useStores', () => ({
  useStores: vi.fn(),
}))

const reportRow = {
  id: 'line-1',
  saleDate: '2026-04-30T12:00:00.000Z',
  storeId: 1,
  storeName: 'Main Store',
  storeLabel: '1 - Main Store',
  skuCode: 'AB123',
  style: 'Oxford Black',
  department: 'ZAP. TACON',
  category: 101,
  channel: 'STORE' as const,
  unitsSold: 2,
  netRevenue: 1234.56,
}

function buildLedgerResponse(params: SalesLedgerParams): SalesLedgerResponse {
  return {
    data: [reportRow],
    pagination: {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 50,
      totalItems: 1,
      totalPages: 1,
    },
  }
}

function renderPage() {
  return render(
    <ConfigProvider>
      <SalesLedgerPage />
    </ConfigProvider>,
  )
}

describe('SalesLedgerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useStores).mockReturnValue({
      data: [
        {
          id: 1,
          code: '1',
          name: 'Main Store',
          active: true,
          chainId: null,
          chainLabel: null,
        },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useSalesLedger).mockImplementation((params) => ({
      data: params ? buildLedgerResponse(params) : undefined,
      isLoading: false,
      isFetching: false,
      error: null,
    }) as never)
  })

  it('does not activate the ledger query until Run Report is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(vi.mocked(useSalesLedger)).toHaveBeenLastCalledWith(null, null)
    expect(screen.getByText(/Configure filters, then click Run Report/i)).toBeInTheDocument()
    expect(screen.queryByText('AB123')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Run Report/i }))

    await waitFor(() => {
      expect(vi.mocked(useSalesLedger)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 50,
          sort: 'saleDate',
          order: 'desc',
        }),
        1,
      )
    })
    expect(await screen.findByText('AB123')).toBeInTheDocument()
  })

  it('keeps edited filters as draft criteria until the report is re-run', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Run Report/i }))
    await screen.findByText('AB123')

    await user.type(screen.getByPlaceholderText('e.g. ZAP. TACON'), 'BOOTS')

    await waitFor(() => {
      expect(vi.mocked(useSalesLedger)).toHaveBeenLastCalledWith(
        expect.not.objectContaining({
          department: 'BOOTS',
        }),
        1,
      )
    })

    await user.click(screen.getByRole('button', { name: /Re-run/i }))

    await waitFor(() => {
      expect(vi.mocked(useSalesLedger)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          department: 'BOOTS',
        }),
        2,
      )
    })
  })

  it('creates a fresh report run when Re-run is clicked with unchanged filters', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Run Report/i }))
    await screen.findByText('AB123')

    await user.click(screen.getByRole('button', { name: /Re-run/i }))

    await waitFor(() => {
      expect(vi.mocked(useSalesLedger)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 50,
          sort: 'saleDate',
          order: 'desc',
        }),
        2,
      )
    })
  })
})
