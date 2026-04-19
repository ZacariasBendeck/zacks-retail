import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ALLOWED_DEPARTMENTS } from '../constants/domain'
import { DomainFilterContractError } from '../services/domainFilterContract'
import {
  OtbApiError,
  createOtbMonthlyPlan,
  fetchOtbLines,
  fetchOtbMonthlyPlans,
  fetchOtbSummary,
} from '../services/otbApi'

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

describe('otbApi live contract mapping', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('maps API summary rows to latest-month department totals and monthly trend', async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildOkResponse([
        {
          department: 'FORMAL',
          year: 2026,
          month: 1,
          plannedBudget: 100,
          committedAmount: 10,
          receivedAmount: 40,
          remainingOtb: 50,
          utilizationPercent: 40,
          budgetExceeded: false,
        },
        {
          department: 'CASUAL',
          year: 2026,
          month: 1,
          plannedBudget: 200,
          committedAmount: 20,
          receivedAmount: 60,
          remainingOtb: 120,
          utilizationPercent: 30,
          budgetExceeded: false,
        },
        {
          department: 'FORMAL',
          year: 2026,
          month: 2,
          plannedBudget: 180,
          committedAmount: 30,
          receivedAmount: 90,
          remainingOtb: 60,
          utilizationPercent: 50,
          budgetExceeded: false,
        },
      ]),
    )

    const result = await fetchOtbSummary()

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/otb-budgets/summary')
    expect(url.searchParams.get('year')).toBeTruthy()

    expect(result.summary).toHaveLength(ALLOWED_DEPARTMENTS.length)
    expect(result.summary.find((row) => row.department === 'FORMAL')).toEqual({
      department: 'FORMAL',
      budgetAmount: 180,
      actualAmount: 90,
      committedAmount: 30,
      openToBuyAmount: 60,
      variancePct: -50,
    })
    expect(result.summary.find((row) => row.department === 'CASUAL')).toEqual({
      department: 'CASUAL',
      budgetAmount: 0,
      actualAmount: 0,
      committedAmount: 0,
      openToBuyAmount: 0,
      variancePct: 0,
    })

    expect(result.trend).toEqual([
      { weekLabel: 'M01', budgetAmount: 300, actualAmount: 100 },
      { weekLabel: 'M02', budgetAmount: 180, actualAmount: 90 },
    ])
  })

  it('includes optional month and department filters in OTB summary query', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse([]))

    await fetchOtbSummary({
      year: 2026,
      month: 4,
      department: 'COMFORT',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/otb-budgets/summary')
    expect(url.searchParams.get('year')).toBe('2026')
    expect(url.searchParams.get('month')).toBe('4')
    expect(url.searchParams.get('department')).toBe('COMFORT')
  })

  it('maps OTB line query params for server-side table controls', async () => {
    const payload = {
      data: [],
      pagination: { page: 2, pageSize: 75, totalItems: 0, totalPages: 0 },
    }
    vi.mocked(fetch).mockResolvedValue(buildOkResponse(payload))

    const result = await fetchOtbLines({
      page: 2,
      pageSize: 75,
      sort: 'actualUnits',
      order: 'desc',
      department: 'FORMAL',
      category: 560,
      skuCode: 'AB',
      style: 'Pump',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/otb/lines')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('pageSize')).toBe('75')
    expect(url.searchParams.get('sort')).toBe('actualUnits')
    expect(url.searchParams.get('order')).toBe('desc')
    expect(url.searchParams.get('department')).toBe('FORMAL')
    expect(url.searchParams.get('category')).toBe('560')
    expect(url.searchParams.get('skuCode')).toBe('AB')
    expect(url.searchParams.get('style')).toBe('Pump')
    expect(result).toEqual(payload)
  })

  it('maps monthly-plan list query params for server-side table controls', async () => {
    const payload = {
      data: [],
      pagination: { page: 3, pageSize: 25, totalItems: 0, totalPages: 0 },
    }
    vi.mocked(fetch).mockResolvedValue(buildOkResponse(payload))

    const result = await fetchOtbMonthlyPlans({
      page: 3,
      pageSize: 25,
      sort: 'budgetAmount',
      order: 'asc',
      year: 2026,
      month: 4,
      department: 'FORMAL',
      style: 'Pump',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/otb/monthly-plans')
    expect(url.searchParams.get('page')).toBe('3')
    expect(url.searchParams.get('pageSize')).toBe('25')
    expect(url.searchParams.get('sort')).toBe('budgetAmount')
    expect(url.searchParams.get('order')).toBe('asc')
    expect(url.searchParams.get('year')).toBe('2026')
    expect(url.searchParams.get('month')).toBe('4')
    expect(url.searchParams.get('department')).toBe('FORMAL')
    expect(url.searchParams.get('style')).toBe('Pump')
    expect(result).toEqual(payload)
  })

  it('surfaces API error code for monthly-plan create validation failures', async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildErrorResponse(409, {
        error: {
          code: 'DUPLICATE_PLAN_LINE',
          message: 'A plan line already exists for this budget and SKU size.',
        },
      }),
    )

    await expect(
      createOtbMonthlyPlan({
        otbBudgetId: 'budget-id',
        skuId: 'sku-id',
        skuSizeId: 'size-id',
        budgetAmount: 1000,
      }),
    ).rejects.toMatchObject({
      name: 'OtbApiError',
      status: 409,
      code: 'DUPLICATE_PLAN_LINE',
    } as Partial<OtbApiError>)
  })

  it('rejects OTB line requests with out-of-range category filters', async () => {
    await expect(
      fetchOtbLines({
        page: 1,
        pageSize: 50,
        department: 'FORMAL',
        category: 700,
      }),
    ).rejects.toBeInstanceOf(DomainFilterContractError)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('surfaces API error code for OTB line validation failures', async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildErrorResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'category: Number must be less than or equal to 599',
        },
      }),
    )

    await expect(
      fetchOtbLines({
        page: 1,
        pageSize: 50,
        department: 'FORMAL',
        category: 559,
      }),
    ).rejects.toMatchObject({
      name: 'OtbApiError',
      status: 400,
      code: 'VALIDATION_ERROR',
    } as Partial<OtbApiError>)
  })
})
