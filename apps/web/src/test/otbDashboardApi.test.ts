import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OtbDashboardApiError,
  fetchOtbDashboardPlans,
  fetchOtbDashboardRows,
  fetchOtbDashboardSummary,
} from '../services/otbDashboardApi'

function buildOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

function buildErrorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response
}

function getCalledUrl(): URL {
  const called = vi.mocked(fetch).mock.calls[0]?.[0]
  return new URL(String(called), 'http://localhost')
}

describe('otbDashboardApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('fetches saved dashboard plans from the new OTB dashboard API', async () => {
    const payload = { plans: [{ id: 'plan-1', label: 'Plan 1' }] }
    vi.mocked(fetch).mockResolvedValue(buildOkResponse(payload))

    const result = await fetchOtbDashboardPlans({ status: 'all' })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/otb/dashboard/plans')
    expect(url.searchParams.get('status')).toBe('all')
    expect(result).toEqual(payload)
  })

  it('maps summary filters to plan, period, and taxonomy department params', async () => {
    const payload = {
      planId: 'plan-1',
      totals: {
        plannedBuyUnits: 100,
        projectedSalesUnits: 70,
        committedUnits: 30,
        stockPositionUnits: 200,
        openToBuyUnits: 70,
        rowCount: 1,
      },
      trend: [],
      generatedAt: '2026-05-05T00:00:00.000Z',
    }
    vi.mocked(fetch).mockResolvedValue(buildOkResponse(payload))

    const result = await fetchOtbDashboardSummary({
      planId: 'plan-1',
      year: 2026,
      month: 5,
      departmentNumber: 13,
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/otb/dashboard/summary')
    expect(url.searchParams.get('planId')).toBe('plan-1')
    expect(url.searchParams.get('year')).toBe('2026')
    expect(url.searchParams.get('month')).toBe('5')
    expect(url.searchParams.get('departmentNumber')).toBe('13')
    expect(result).toEqual(payload)
  })

  it('maps row table controls to the dashboard rows API', async () => {
    const payload = {
      data: [],
      pagination: { page: 2, pageSize: 25, totalItems: 0, totalPages: 1 },
    }
    vi.mocked(fetch).mockResolvedValue(buildOkResponse(payload))

    const result = await fetchOtbDashboardRows({
      planId: 'plan-1',
      page: 2,
      pageSize: 25,
      sort: 'committedUnits',
      order: 'desc',
      year: 2026,
      month: 5,
      departmentNumber: 13,
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/otb/dashboard/rows')
    expect(url.searchParams.get('planId')).toBe('plan-1')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('pageSize')).toBe('25')
    expect(url.searchParams.get('sort')).toBe('committedUnits')
    expect(url.searchParams.get('order')).toBe('desc')
    expect(url.searchParams.get('departmentNumber')).toBe('13')
    expect(result).toEqual(payload)
  })

  it('surfaces dashboard API error codes', async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildErrorResponse(404, {
        error: {
          code: 'PLAN_NOT_FOUND',
          message: 'Purchase plan not found.',
        },
      }),
    )

    await expect(fetchOtbDashboardSummary({ planId: 'missing' })).rejects.toMatchObject({
      name: 'OtbDashboardApiError',
      status: 404,
      code: 'PLAN_NOT_FOUND',
    } as Partial<OtbDashboardApiError>)
  })
})
