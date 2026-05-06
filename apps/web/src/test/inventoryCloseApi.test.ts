import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryCloseApi } from '../services/inventoryCloseApi'

function buildOkResponse(body: unknown, status = 200): Response {
  return {
    ok: true,
    status,
    json: async () => body,
  } as Response
}

function buildErrorResponse(body: unknown, status = 409): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response
}

describe('inventoryCloseApi contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('loads close summary from the operations endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({
      monthRuns: [],
      closedMonths: [],
      weekRuns: [],
      closedWeeks: [],
    }))

    await inventoryCloseApi.getSummary(30)

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/operations/inventory-close/summary?limit=30',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('posts month close requests with dryRun in the body', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ runId: 'run-1' }, 201))

    await inventoryCloseApi.runMonthClose({ closeMonth: '2026-04', dryRun: false })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/operations/inventory-close/month',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closeMonth: '2026-04', dryRun: false }),
      }),
    )
  })

  it('posts week close requests with dryRun in the body', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ runId: 'run-2' }, 200))

    await inventoryCloseApi.runWeekClose({ weekEndingDate: '2026-05-03', dryRun: true })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/operations/inventory-close/week',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekEndingDate: '2026-05-03', dryRun: true }),
      }),
    )
  })

  it('surfaces structured close errors', async () => {
    vi.mocked(fetch).mockResolvedValue(buildErrorResponse({
      error: {
        code: 'MONTH_ALREADY_CLOSED',
        message: 'Inventory month 2026-04 has already been closed',
      },
    }))

    await expect(
      inventoryCloseApi.runMonthClose({ closeMonth: '2026-04', dryRun: false }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'MONTH_ALREADY_CLOSED',
      message: 'Inventory month 2026-04 has already been closed',
    })
  })
})
