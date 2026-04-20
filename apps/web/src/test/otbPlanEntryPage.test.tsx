import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OtbPlanEntryPage from '../pages/otb/OtbPlanEntryPage'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch
})

function mockResponse(body: unknown, init: Partial<Response> = {}) {
  return { ok: true, status: 200, json: async () => body, ...init } as Response
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OtbPlanEntryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OtbPlanEntryPage', () => {
  it('loads and renders a list of plan rows', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/plan-rows?')) {
        return mockResponse({
          items: [
            {
              id: 'row-1', storeId: 'MAIN', categoryId: 'cat-556', fiscalYear: 2026,
              pctChangeLyToCy: 7.5, pctChangeCyToNy: null,
              plannedTurnover1h: 2.5, plannedTurnover2h: 2.2, plannedGpPct: 48,
              lySales: Array(12).fill(10000), plannedSales: Array(12).fill(null), markdownPct: Array(12).fill(null),
              createdBy: 'buyer1', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
            },
          ],
          total: 1, page: 1, pageSize: 50,
        })
      }
      if (url.includes('/otb-entry-method')) {
        return mockResponse({ value: 'CHANGE_OVER_LAST_YEAR' })
      }
      if (url.includes('/pos/stores')) {
        return mockResponse({ stores: [{ id: 1, code: 'MAIN', name: 'Main Store', active: true }] })
      }
      return mockResponse({})
    })

    renderPage()
    expect(await screen.findByText('cat-556')).toBeInTheDocument()
  })

  it('recalculates planned sales when [ReCalculate] is clicked', async () => {
    const rowBase = {
      id: 'row-1', storeId: 'MAIN', categoryId: 'cat-556', fiscalYear: 2026,
      pctChangeLyToCy: 10, pctChangeCyToNy: null,
      plannedTurnover1h: null, plannedTurnover2h: null, plannedGpPct: null,
      lySales: Array(12).fill(10000), plannedSales: Array(12).fill(null), markdownPct: Array(12).fill(null),
      createdBy: 'buyer1', createdAt: '', updatedAt: '',
    }
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/plan-rows?')) {
        return mockResponse({ items: [rowBase], total: 1, page: 1, pageSize: 50 })
      }
      if (url.endsWith('/plan-rows/row-1')) {
        return mockResponse(rowBase)
      }
      if (url.endsWith('/plan-rows/row-1/recalculate') && init?.method === 'POST') {
        return mockResponse({ ...rowBase, plannedSales: Array(12).fill(11000) })
      }
      if (url.includes('/otb-entry-method')) {
        return mockResponse({ value: 'CHANGE_OVER_LAST_YEAR' })
      }
      if (url.includes('/pos/stores')) {
        return mockResponse({ stores: [{ id: 1, code: 'MAIN', name: 'Main Store', active: true }] })
      }
      return mockResponse({})
    })

    renderPage()
    const row = await screen.findByText('cat-556')
    await userEvent.click(row)

    const recalcBtn = await screen.findByRole('button', { name: /ReCalculate/i })
    await userEvent.click(recalcBtn)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/plan-rows/row-1/recalculate'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('shows a disabled [Copy Sales] button with tooltip for deferred action', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/plan-rows?')) {
        return mockResponse({ items: [], total: 0, page: 1, pageSize: 50 })
      }
      if (url.includes('/otb-entry-method')) {
        return mockResponse({ value: 'CHANGE_OVER_LAST_YEAR' })
      }
      if (url.includes('/pos/stores')) {
        return mockResponse({ stores: [{ id: 1, code: 'MAIN', name: 'Main Store', active: true }] })
      }
      return mockResponse({})
    })

    renderPage()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: /New row/i }))
    const copySalesBtn = screen.getByRole('button', { name: /Copy Sales/i })
    expect(copySalesBtn).toBeDisabled()
  })
})
